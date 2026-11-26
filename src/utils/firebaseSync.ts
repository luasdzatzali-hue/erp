import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp,
  disableNetwork,
  enableNetwork,
  Unsubscribe,
  DocumentReference,
  DocumentData,
  DocumentSnapshot
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ActiveMachineChangeover,
  ActiveSkuProductionRun,
  AppState,
  ProductionLine,
  ProductionMachine,
  UserRole,
  WipTank,
  WorkspaceAccessConfig
} from '../types';
import {
  clearWorkspaceDriveToken,
  consumePendingDriveRedirectFlag,
  setWorkspaceDriveToken
} from './googleWorkspace';
import {
  computeEmailLookupId,
  hashPasswordSlow,
  normalizeEmail,
  sanitizeTextInput,
  validatePasswordStrength
} from './security';
import { resolveEffectiveRole } from './roleAccess';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const FIRESTORE_DATABASE_ID =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-f091a901-ee79-4d30-8b44-00c1bce5a6b9';
export const db = getFirestore(app, FIRESTORE_DATABASE_ID);
export const auth = getAuth(app);

const LEGACY_WORKSPACE_ID = 'main';
const BOOTSTRAP_EMAIL = 'luasdzatzali@gmail.com';
const PENDING_REDIRECT_ROLE_KEY = 'prodtrack_pending_google_role_v1';

function createGoogleProvider(forceAccountSelect = true): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  if (forceAccountSelect) {
    provider.setCustomParameters({ prompt: 'select_account' });
  }
  return provider;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface CloudQuotaStatus {
  isQuotaExceeded: boolean;
  pausedUntilMs: number | null;
  message: string | null;
  upgradeUrl: string;
}

const CLOUD_QUOTA_FALLBACK_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const CLOUD_QUOTA_STORAGE_KEY = 'prodtrack_cloud_quota_pause_v1';
const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;
const FIRESTORE_PRICING_URL = 'https://firebase.google.com/pricing#cloud-firestore';

const DEFAULT_QUOTA_EXCEEDED_MSG =
  'Kuota tulis harian gratis Firebase Firestore habis. Data operasional tetap tersimpan aman di perangkat lokal dan kuota akan reset otomatis besok (atau upgrade paket di Firebase Console).';

/**
 * Firestore daily free-tier quotas reset at midnight Pacific Time (America/Los_Angeles).
 * Returns a timestamp slightly after the next Pacific midnight so automatic retries
 * never fire every few minutes against an exhausted daily quota.
 */
export function getNextFirestoreDailyQuotaResetMs(nowMs = Date.now()): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const getNum = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find(p => p.type === type)?.value || '0');

    const ptHour = getNum('hour') % 24;
    const ptMin = getNum('minute');
    const ptSec = getNum('second');
    const elapsedTodayMs = ((ptHour * 60 + ptMin) * 60 + ptSec) * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    // Add 5-minute buffer after Pacific midnight
    const remainingMs = Math.max(60 * 60 * 1000, dayMs - elapsedTodayMs + 5 * 60 * 1000);
    return nowMs + remainingMs;
  } catch {
    return nowMs + CLOUD_QUOTA_FALLBACK_COOLDOWN_MS;
  }
}

function loadPersistedCloudQuotaState(): CloudQuotaStatus {
  const emptyState: CloudQuotaStatus = {
    isQuotaExceeded: false,
    pausedUntilMs: null,
    message: null,
    upgradeUrl: FIRESTORE_UPGRADE_URL
  };
  if (typeof window === 'undefined' || !window.localStorage) return emptyState;
  try {
    const raw = window.localStorage.getItem(CLOUD_QUOTA_STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as { pausedUntilMs?: number; message?: string };
    if (
      typeof parsed?.pausedUntilMs === 'number' &&
      parsed.pausedUntilMs > Date.now()
    ) {
      return {
        isQuotaExceeded: true,
        pausedUntilMs: parsed.pausedUntilMs,
        message: parsed.message || DEFAULT_QUOTA_EXCEEDED_MSG,
        upgradeUrl: FIRESTORE_UPGRADE_URL
      };
    }
    window.localStorage.removeItem(CLOUD_QUOTA_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return emptyState;
}

function persistCloudQuotaState(state: CloudQuotaStatus): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (state.isQuotaExceeded && state.pausedUntilMs) {
      window.localStorage.setItem(
        CLOUD_QUOTA_STORAGE_KEY,
        JSON.stringify({
          pausedUntilMs: state.pausedUntilMs,
          message: state.message
        })
      );
    } else {
      window.localStorage.removeItem(CLOUD_QUOTA_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

let cloudQuotaState: CloudQuotaStatus = loadPersistedCloudQuotaState();

const cloudQuotaListeners = new Set<(status: CloudQuotaStatus) => void>();

function notifyCloudQuotaListeners() {
  const snapshot = { ...cloudQuotaState };
  cloudQuotaListeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch {
      // ignore listener errors
    }
  });
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const errObj = error as { code?: unknown; message?: unknown; isQuotaExceeded?: unknown };
  if (errObj.isQuotaExceeded === true) return true;
  const code = String(errObj.code || '').toLowerCase();
  const msg = String(errObj.message || (error instanceof Error ? error.message : String(error))).toLowerCase();
  return (
    code === 'resource-exhausted' ||
    msg.includes('resource-exhausted') ||
    msg.includes('quota limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('free daily write units') ||
    msg.includes('free daily read units')
  );
}

export function isCloudWritePaused(): boolean {
  if (!cloudQuotaState.isQuotaExceeded) return false;
  if (cloudQuotaState.pausedUntilMs && Date.now() >= cloudQuotaState.pausedUntilMs) {
    cloudQuotaState = {
      isQuotaExceeded: false,
      pausedUntilMs: null,
      message: null,
      upgradeUrl: FIRESTORE_UPGRADE_URL
    };
    persistCloudQuotaState(cloudQuotaState);
    if (typeof window !== 'undefined') {
      void enableNetwork(db).catch(() => {});
    }
    notifyCloudQuotaListeners();
    return false;
  }
  return true;
}

export function getCloudQuotaStatus(): CloudQuotaStatus {
  isCloudWritePaused();
  return { ...cloudQuotaState };
}

export function tripCloudWriteQuotaPause(customMessage?: string): void {
  const alreadyPaused = isCloudWritePaused();
  const nextPausedUntil = getNextFirestoreDailyQuotaResetMs();
  cloudQuotaState = {
    isQuotaExceeded: true,
    pausedUntilMs: nextPausedUntil,
    message: customMessage || DEFAULT_QUOTA_EXCEEDED_MSG,
    upgradeUrl: FIRESTORE_UPGRADE_URL
  };
  persistCloudQuotaState(cloudQuotaState);
  // Immediately terminate Firestore's internal WriteStream backoff retry loop
  if (typeof window !== 'undefined') {
    void disableNetwork(db).catch(() => {});
  }
  if (!alreadyPaused) {
    console.info(
      `[ProdTrack Cloud] Sinkronisasi tulis cloud dijeda hingga kuota harian Firestore reset besok (${new Date(
        nextPausedUntil
      ).toLocaleString('id-ID')}). Info: ${FIRESTORE_PRICING_URL}`
    );
    notifyCloudQuotaListeners();
  }
}

export function resetCloudWriteQuotaPause(): void {
  const wasPaused = Boolean(cloudQuotaState.isQuotaExceeded || cloudQuotaState.pausedUntilMs);
  cloudQuotaState = {
    isQuotaExceeded: false,
    pausedUntilMs: null,
    message: null,
    upgradeUrl: FIRESTORE_UPGRADE_URL
  };
  persistCloudQuotaState(cloudQuotaState);
  if (typeof window !== 'undefined') {
    void enableNetwork(db).catch(() => {});
  }
  if (wasPaused) {
    notifyCloudQuotaListeners();
  }
}

export function subscribeCloudQuotaStatus(
  listener: (status: CloudQuotaStatus) => void
): () => void {
  cloudQuotaListeners.add(listener);
  listener(getCloudQuotaStatus());
  return () => {
    cloudQuotaListeners.delete(listener);
  };
}

let quotaInterceptorInstalled = false;
function installFirestoreQuotaErrorInterceptor(): void {
  if (quotaInterceptorInstalled || typeof window === 'undefined' || typeof console === 'undefined') {
    return;
  }
  quotaInterceptorInstalled = true;

  const inspectArgs = (args: unknown[]): { isQuota: boolean; isBackoffNoise: boolean } => {
    try {
      const joined = args
        .map(a => (typeof a === 'string' ? a : a instanceof Error ? a.message : ''))
        .join(' ')
        .toLowerCase();
      const isFirestoreLog = joined.includes('@firebase/firestore');
      if (!isFirestoreLog) {
        return { isQuota: false, isBackoffNoise: false };
      }
      const isQuota =
        joined.includes('resource-exhausted') ||
        joined.includes('quota limit exceeded') ||
        joined.includes('free daily write units');
      const isBackoffNoise = joined.includes('using maximum backoff delay');
      return { isQuota, isBackoffNoise };
    } catch {
      return { isQuota: false, isBackoffNoise: false };
    }
  };

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    const { isQuota, isBackoffNoise } = inspectArgs(args);
    if (isQuota) {
      tripCloudWriteQuotaPause();
      return;
    }
    if (isBackoffNoise && isCloudWritePaused()) {
      return;
    }
    origError(...args);
  };

  console.warn = (...args: unknown[]) => {
    const { isQuota, isBackoffNoise } = inspectArgs(args);
    if (isQuota) {
      tripCloudWriteQuotaPause();
      return;
    }
    if (isBackoffNoise && isCloudWritePaused()) {
      return;
    }
    origWarn(...args);
  };
}

installFirestoreQuotaErrorInterceptor();

export async function runFirestoreWriteWithGuard<T>(
  operation: () => Promise<T>,
  timeoutMs = 12000
): Promise<T> {
  if (isCloudWritePaused()) {
    const pausedErr = new Error(
      cloudQuotaState.message || 'Quota limit exceeded (resource-exhausted).'
    ) as Error & { isQuotaExceeded?: boolean; code?: string };
    pausedErr.isQuotaExceeded = true;
    pausedErr.code = 'resource-exhausted';
    throw pausedErr;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          if (isCloudWritePaused()) {
            const quotaErr = new Error(
              cloudQuotaState.message || 'Quota limit exceeded (resource-exhausted).'
            ) as Error & { isQuotaExceeded?: boolean; code?: string };
            quotaErr.isQuotaExceeded = true;
            quotaErr.code = 'resource-exhausted';
            reject(quotaErr);
          } else {
            reject(new Error('Firestore write timed out'));
          }
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isQuotaExceededError(error)) {
    tripCloudWriteQuotaPause();
    const quotaErr = new Error(
      cloudQuotaState.message || 'Quota limit exceeded (resource-exhausted).'
    ) as Error & { isQuotaExceeded?: boolean; code?: string };
    quotaErr.isQuotaExceeded = true;
    quotaErr.code = 'resource-exhausted';
    throw quotaErr;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email
        })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (isCloudWritePaused()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

function isOfflineOrTransientError(error: any): boolean {
  const code = String(error?.code || '').toLowerCase();
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    msg.includes('offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout')
  );
}

async function getDocServerWithFallback(
  ref: DocumentReference<DocumentData>
): Promise<DocumentSnapshot<DocumentData>> {
  try {
    return await getDocFromServer(ref);
  } catch (err: any) {
    if (isOfflineOrTransientError(err)) {
      if (isCloudWritePaused()) {
        return await getDoc(ref);
      }
      await new Promise(resolve => setTimeout(resolve, 350));
      try {
        return await getDocFromServer(ref);
      } catch (retryErr: any) {
        if (isOfflineOrTransientError(retryErr)) {
          return await getDoc(ref);
        }
        throw retryErr;
      }
    }
    throw err;
  }
}

// Recursively remove undefined fields (Firestore rejects undefined values)
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

export interface ActiveChangeoverSnapshot extends ActiveMachineChangeover {
  machineId: string;
  machineCode: string;
  machineName: string;
}

export function extractActiveChangeoversFromMachines(
  machines: ProductionMachine[] = []
): ActiveChangeoverSnapshot[] {
  return machines
    .filter(m => Boolean(m.activeChangeover))
    .map(m => ({
      machineId: m.id,
      machineCode: m.code,
      machineName: m.name,
      ...m.activeChangeover!
    }))
    .slice(0, 300);
}

export function mergeMachinesWithActiveChangeovers(
  machines: ProductionMachine[] = [],
  activeChangeovers?: ActiveChangeoverSnapshot[]
): ProductionMachine[] {
  if (!Array.isArray(activeChangeovers)) return machines;
  const byMachineId = new Map<string, ActiveChangeoverSnapshot>();
  activeChangeovers.forEach(co => {
    if (co && co.machineId) byMachineId.set(co.machineId, co);
  });
  return machines.map(m => {
    const active = byMachineId.get(m.id);
    if (active) {
      const { machineId: _mId, machineCode: _mCode, machineName: _mName, ...coData } = active;
      return {
        ...m,
        status: 'CHANGEOVER' as const,
        activeChangeover: coData
      };
    }
    if (m.activeChangeover) {
      return {
        ...m,
        status: m.status === 'CHANGEOVER' ? ('OPERATIONAL' as const) : m.status,
        activeChangeover: undefined
      };
    }
    return m;
  });
}

export function mergeMasterAndOpsTanks(
  masterTanks: WipTank[] = [],
  opsTanks?: WipTank[]
): WipTank[] {
  if (!Array.isArray(opsTanks) || opsTanks.length === 0) return masterTanks;
  if (masterTanks.length === 0) return opsTanks;
  const opsById = new Map<string, WipTank>();
  opsTanks.forEach(t => {
    if (t && t.id) opsById.set(t.id, t);
  });
  return masterTanks.map(mt => {
    const ot = opsById.get(mt.id);
    if (!ot) return mt;
    return {
      ...mt,
      currentLevelKg: ot.currentLevelKg,
      status: ot.status ?? mt.status,
      assignedWipId: ot.assignedWipId !== undefined ? ot.assignedWipId : mt.assignedWipId,
      temp: ot.temp !== undefined ? ot.temp : mt.temp,
      agitatorStatus: ot.agitatorStatus !== undefined ? ot.agitatorStatus : mt.agitatorStatus
    };
  });
}

// Keep ONLY active operational state in workspaces/{workspaceId}/data/operations
// High-volume logs (REQUEST, RECEIPT, USAGE, CARTON_PROD, TANK_LOG, ADJUSTMENT) live in /transactions/{txId}
export function buildBoundedOperationsPayload(state: AppState) {
  const keepRecent = <T,>(arr: T[] | undefined, max: number): T[] => {
    if (!arr || !Array.isArray(arr)) return [];
    if (arr.length <= max) return arr;
    return arr.slice(arr.length - max);
  };

  return stripUndefinedDeep({
    activeSkuRuns: (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).slice(0, 80),
    tank: state.tank,
    tanks: (state.master.tanks || []).slice(0, 200),
    lastShiftHandover: state.lastShiftHandover ?? null,
    weeklyPlannings: (state.weeklyPlannings || []).slice(0, 12),
    activeWeeklyPlanId: state.activeWeeklyPlanId ?? null,
    activeChangeovers: extractActiveChangeoversFromMachines(state.master.machines || []),
    wipBatches: keepRecent(state.transactions.wipBatches, 200),
    changeovers: keepRecent(state.transactions.changeovers, 150),
    productionStops: keepRecent(state.transactions.productionStops, 200)
  });
}

export function buildBoundedMasterPayload(state: AppState) {
  return stripUndefinedDeep({
    materials: (state.master.materials || []).slice(0, 1000),
    wips: (state.master.wips || []).slice(0, 500),
    skus: (state.master.skus || []).slice(0, 500),
    skuWips: (state.master.skuWips || []).slice(0, 2000),
    wipMats: (state.master.wipMats || []).slice(0, 2000),
    recipes: (state.master.recipes || []).slice(0, 1000),
    machines: (state.master.machines || []).slice(0, 300),
    tanks: (state.master.tanks || []).slice(0, 200),
    productionLines: (state.master.productionLines || []).slice(0, 100)
  });
}

export function buildAccessEmailLists(state: AppState, primaryAdminEmail?: string) {
  const adminSet = new Set<string>(
    (state.adminGoogleEmails || []).map(e => e.toLowerCase().trim()).filter(Boolean)
  );
  if (primaryAdminEmail) {
    adminSet.add(primaryAdminEmail.toLowerCase().trim());
  }

  const operatorSet = new Set<string>(
    (state.registeredOperators || [])
      .filter(op => op.status === 'ACTIVE' && op.email)
      .map(op => (op.email || '').toLowerCase().trim())
      .filter(Boolean)
  );

  const managementSet = new Set<string>(
    (state.registeredManagement || [])
      .filter(m => m.hasViewAccess && m.email)
      .map(m => m.email.toLowerCase().trim())
      .filter(Boolean)
  );

  return {
    adminEmails: Array.from(adminSet).slice(0, 30),
    operatorEmails: Array.from(operatorSet).slice(0, 100),
    managementEmails: Array.from(managementSet).slice(0, 50)
  };
}

export interface AuthErrorDetail {
  message: string;
  code?: string;
  domain?: string;
  showRedirectOption?: boolean;
}

export function formatGoogleAuthError(error: any): AuthErrorDetail {
  const code = String(error?.code || '');
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (code === 'auth/unauthorized-domain') {
    return {
      code,
      domain: hostname,
      message: `Domain "${hostname || 'vercel.app'}" belum terdaftar di Firebase Authorized Domains. Tambahkan domain ini di Firebase Console → Authentication → Settings → Authorized domains agar login Google di Vercel diizinkan.`
    };
  }
  if (code === 'auth/popup-blocked') {
    return {
      code,
      showRedirectOption: true,
      message: 'Popup login Google diblokir oleh browser. Izinkan popup di browser atau gunakan tombol "Login Google via Redirect" di bawah.'
    };
  }
  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/user-cancelled'
  ) {
    return {
      code,
      showRedirectOption: true,
      message: 'Jendela popup Google ditutup sebelum proses login selesai. Jika browser menutup popup otomatis, gunakan tombol "Login Google via Redirect" di bawah.'
    };
  }
  if (
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/web-storage-unsupported'
  ) {
    return {
      code,
      showRedirectOption: true,
      message: 'Browser membatasi penyimpanan popup lintas domain. Gunakan tombol "Login Google via Redirect" di bawah.'
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      code,
      message: 'Koneksi internet bermasalah saat menghubungi Google Sign-In. Periksa koneksi Anda lalu coba lagi.'
    };
  }
  return {
    code: code || undefined,
    showRedirectOption: true,
    message: error?.message || 'Gagal autentikasi akun Google.'
  };
}

export type GoogleSignInPopupResult =
  | { status: 'success'; user: User }
  | { status: 'cancelled'; error: AuthErrorDetail }
  | { status: 'popup_blocked'; error: AuthErrorDetail };

export async function signInWithGooglePopup(forceAccountSelect = true): Promise<GoogleSignInPopupResult> {
  try {
    const provider = createGoogleProvider(forceAccountSelect);
    const result = await signInWithPopup(auth, provider);
    return { status: 'success', user: result.user };
  } catch (error: any) {
    const code = String(error?.code || '');
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/user-cancelled'
    ) {
      return { status: 'cancelled', error: formatGoogleAuthError(error) };
    }
    if (code === 'auth/popup-blocked') {
      return { status: 'popup_blocked', error: formatGoogleAuthError(error) };
    }
    const detail = formatGoogleAuthError(error);
    const err = new Error(detail.message) as Error & { authDetail?: AuthErrorDetail };
    err.authDetail = detail;
    throw err;
  }
}

export async function signInWithGoogleAuth(forceAccountSelect = true): Promise<User | null> {
  const outcome = await signInWithGooglePopup(forceAccountSelect);
  if (outcome.status === 'success') {
    return outcome.user;
  }
  const err = new Error(outcome.error.message) as Error & { authDetail?: AuthErrorDetail };
  err.authDetail = outcome.error;
  throw err;
}

export async function startGoogleRedirectSignIn(intendedRole?: UserRole | 'SETUP'): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      if (intendedRole) {
        window.sessionStorage.setItem(PENDING_REDIRECT_ROLE_KEY, intendedRole);
      } else {
        window.sessionStorage.removeItem(PENDING_REDIRECT_ROLE_KEY);
      }
    }
    const provider = createGoogleProvider(true);
    await signInWithRedirect(auth, provider);
  } catch (error: any) {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(PENDING_REDIRECT_ROLE_KEY);
    }
    const detail = formatGoogleAuthError(error);
    const err = new Error(detail.message) as Error & { authDetail?: AuthErrorDetail };
    err.authDetail = detail;
    throw err;
  }
}

export async function consumeGoogleRedirectResult(): Promise<{
  user: User | null;
  intendedRole?: UserRole | 'SETUP';
  isDriveConnectRedirect?: boolean;
  errorDetail?: AuthErrorDetail;
}> {
  let pendingRole: UserRole | 'SETUP' | undefined;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const raw = window.sessionStorage.getItem(PENDING_REDIRECT_ROLE_KEY);
    if (raw === 'ADMINISTRATOR' || raw === 'OPERATOR' || raw === 'MANAGEMENT' || raw === 'SETUP') {
      pendingRole = raw;
    }
  }
  const isDriveRedirect = consumePendingDriveRedirectFlag();

  try {
    await auth.authStateReady();
    const res = await getRedirectResult(auth);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(PENDING_REDIRECT_ROLE_KEY);
    }
    if (res?.user) {
      const credential = GoogleAuthProvider.credentialFromResult(res);
      if (isDriveRedirect && credential?.accessToken) {
        setWorkspaceDriveToken(credential.accessToken, res.user.email || null);
      }
      return {
        user: res.user,
        intendedRole: pendingRole,
        isDriveConnectRedirect: isDriveRedirect
      };
    }
    return { user: null, intendedRole: pendingRole, isDriveConnectRedirect: isDriveRedirect };
  } catch (error: any) {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(PENDING_REDIRECT_ROLE_KEY);
    }
    return {
      user: null,
      intendedRole: pendingRole,
      isDriveConnectRedirect: isDriveRedirect,
      errorDetail: formatGoogleAuthError(error)
    };
  }
}

export async function signOutGoogleAuth(): Promise<void> {
  clearWorkspaceDriveToken();
  consumePendingDriveRedirectFlag();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(PENDING_REDIRECT_ROLE_KEY);
    } catch {
      // ignore storage errors
    }
  }
  await signOut(auth);
}

export function subscribeAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export interface BootstrapStatus {
  isInitialized: boolean;
  factoryName?: string;
  ownerUid?: string;
}

export async function checkFirstTimeSetup(): Promise<BootstrapStatus> {
  const path = 'system/bootstrap';
  try {
    const snap = await getDocServerWithFallback(doc(db, 'system', 'bootstrap'));
    if (!snap.exists()) {
      return { isInitialized: false };
    }
    const data = snap.data();
    return {
      isInitialized: Boolean(data?.isInitialized),
      factoryName: data?.factoryName,
      ownerUid: data?.ownerUid
    };
  } catch (error: any) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

const syncedDirectoryDigestByKey = new Map<string, string>();

async function syncWorkspaceDirectoryEntries(
  workspaceId: string,
  ownerUid: string,
  updatedByUid: string,
  state: AppState
): Promise<void> {
  if (isCloudWritePaused()) return;
  const factoryName = sanitizeTextInput(state.factoryName || 'Pabrik ProdTrack', 120) || 'Pabrik ProdTrack';
  const roleByEmail = new Map<string, UserRole>();

  (state.registeredManagement || [])
    .filter(m => m.hasViewAccess && m.email)
    .forEach(m => {
      const clean = normalizeEmail(m.email);
      if (clean) roleByEmail.set(clean, 'MANAGEMENT');
    });

  (state.registeredOperators || [])
    .filter(op => op.status === 'ACTIVE' && op.email)
    .forEach(op => {
      const clean = normalizeEmail(op.email || '');
      if (clean) roleByEmail.set(clean, 'OPERATOR');
    });

  (state.adminGoogleEmails || []).forEach(e => {
    const clean = normalizeEmail(e);
    if (clean) roleByEmail.set(clean, 'ADMINISTRATOR');
  });

  if (auth.currentUser?.email && ownerUid === auth.currentUser.uid) {
    roleByEmail.set(normalizeEmail(auth.currentUser.email), 'ADMINISTRATOR');
  }

  await Promise.all(
    Array.from(roleByEmail.entries()).map(async ([emailLower, role]) => {
      if (isCloudWritePaused()) return;
      try {
        const inviteId = await computeEmailLookupId(emailLower);
        const cacheKey = `${workspaceId}::${inviteId}`;
        const digest = `${role}::${factoryName}::${ownerUid}`;
        if (syncedDirectoryDigestByKey.get(cacheKey) === digest) {
          return;
        }
        await setDoc(doc(db, 'workspaceDirectory', inviteId), {
          inviteId,
          emailLower,
          workspaceId,
          role,
          factoryName,
          ownerUid,
          updatedAt: serverTimestamp(),
          updatedByUid
        });
        syncedDirectoryDigestByKey.set(cacheKey, digest);
      } catch (err) {
        if (isQuotaExceededError(err)) {
          tripCloudWriteQuotaPause();
        }
        // Non-fatal if another tenant already claimed this email or offline
      }
    })
  );
}

async function resolveWorkspaceIdForUser(user: User): Promise<{
  workspaceId: string;
  isAdminDoc: boolean;
}> {
  const uid = user.uid;
  const email = normalizeEmail(user.email || '');
  let isAdminDoc = email === BOOTSTRAP_EMAIL;

  // 1. Check /admins/{uid} first (most direct for registered Administrators)
  try {
    const adminSnap = await getDocServerWithFallback(doc(db, 'admins', uid));
    if (adminSnap.exists()) {
      isAdminDoc = true;
      const adminData = adminSnap.data();
      if (typeof adminData?.workspaceId === 'string' && adminData.workspaceId.trim()) {
        return { workspaceId: adminData.workspaceId.trim(), isAdminDoc: true };
      }
    }
  } catch {
    // Proceed to next lookup method
  }

  // 2. Check user-owned isolated workspace /workspaces/{uid}/config/meta
  try {
    const ownMetaSnap = await getDocServerWithFallback(doc(db, 'workspaces', uid, 'config', 'meta'));
    if (ownMetaSnap.exists()) {
      return { workspaceId: uid, isAdminDoc: true };
    }
  } catch {
    // Proceed to directory lookup
  }

  // 3. Check SHA-256 email directory lookup (supports invited Operators, Management, & Secondary Admins)
  if (email) {
    try {
      const inviteId = await computeEmailLookupId(email);
      const dirSnap = await getDocServerWithFallback(doc(db, 'workspaceDirectory', inviteId));
      if (dirSnap.exists()) {
        const wsId = dirSnap.data()?.workspaceId;
        if (typeof wsId === 'string' && wsId.trim()) {
          return {
            workspaceId: wsId.trim(),
            isAdminDoc: isAdminDoc || dirSnap.data()?.role === 'ADMINISTRATOR'
          };
        }
      }
    } catch {
      // Missing or unauthorized directory doc -> fall through to legacy workspace
    }
  }

  // 4. Legacy 'main' workspace fallback
  return { workspaceId: LEGACY_WORKSPACE_ID, isAdminDoc };
}

export async function registerAdministratorWorkspace(params: {
  user: User;
  displayName: string;
  factoryName: string;
  adminPin: string;
  initialState: AppState;
}): Promise<AppState> {
  const { user, displayName, factoryName, adminPin, initialState } = params;
  const uid = user.uid;
  const email = normalizeEmail(user.email || '');

  if (!uid || !email) {
    throw new Error('Akun Google tidak memiliki email terverifikasi.');
  }

  const pwdCheck = validatePasswordStrength(adminPin);
  if (!pwdCheck.isValid) {
    throw new Error(pwdCheck.message || 'Password/PIN keamanan tidak memenuhi standar minimal 8 karakter.');
  }

  const cleanFactory = sanitizeTextInput(factoryName, 120) || 'Pabrik ProdTrack';
  const cleanName = sanitizeTextInput(displayName, 120) || email.split('@')[0];
  const hashedPin = await hashPasswordSlow(adminPin);

  let isSystemBootstrapped = false;
  try {
    const bootSnap = await getDocServerWithFallback(doc(db, 'system', 'bootstrap'));
    isSystemBootstrapped = bootSnap.exists() && Boolean(bootSnap.data()?.isInitialized);
  } catch {
    isSystemBootstrapped = false;
  }

  // First user sets up legacy 'main' & system/bootstrap; subsequent admins get their own isolated workspaceId = uid
  const workspaceId = isSystemBootstrapped ? uid.slice(0, 64) : LEGACY_WORKSPACE_ID;

  const nextAdminEmails = Array.from(
    new Set([email, ...(initialState.adminGoogleEmails || []).map(e => normalizeEmail(e))].filter(Boolean))
  );
  const accessLists = buildAccessEmailLists(
    { ...initialState, adminGoogleEmails: nextAdminEmails },
    email
  );
  const workspaceAccessConfig: WorkspaceAccessConfig = {
    workspaceId,
    ownerUid: uid,
    ...accessLists
  };

  const nextState: AppState = {
    ...initialState,
    factoryName: cleanFactory,
    cloudWorkspaceId: workspaceId,
    cloudOwnerUid: uid,
    adminPin: hashedPin,
    adminGoogleEmails: nextAdminEmails,
    workspaceAccessConfig,
    currentAdminUser: {
      email,
      displayName: cleanName,
      photoURL: user.photoURL || undefined,
      registeredAt: new Date().toISOString(),
      role: 'SUPER_ADMIN'
    },
    isAuthenticated: true,
    currentUserRole: 'ADMINISTRATOR',
    currentTab: 'admin-portal',
    currentSession: {
      role: 'ADMINISTRATOR',
      id: uid,
      name: cleanName,
      email,
      subtitle: `Super Administrator • ${cleanFactory}`
    }
  };

  const batch = writeBatch(db);
  const now = serverTimestamp();

  if (!isSystemBootstrapped) {
    batch.set(doc(db, 'system', 'bootstrap'), {
      isInitialized: true,
      ownerUid: uid,
      factoryName: cleanFactory,
      initializedAt: now,
      updatedAt: now
    });
  }

  batch.set(doc(db, 'admins', uid), {
    uid,
    email,
    displayName: cleanName,
    factoryName: cleanFactory,
    workspaceId,
    role: 'SUPER_ADMIN',
    createdAt: now,
    updatedAt: now
  });

  batch.set(doc(db, 'workspaces', workspaceId, 'config', 'access'), {
    workspaceId,
    ownerUid: uid,
    ...accessLists,
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', workspaceId, 'config', 'secrets'), {
    workspaceId,
    ownerUid: uid,
    adminPin: hashedPin,
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', workspaceId, 'config', 'meta'), {
    workspaceId,
    ownerUid: uid,
    factoryName: cleanFactory,
    adminGoogleEmails: nextState.adminGoogleEmails || [email],
    registeredOperators: stripUndefinedDeep((nextState.registeredOperators || []).slice(0, 200)),
    registeredManagement: stripUndefinedDeep((nextState.registeredManagement || []).slice(0, 100)),
    theme: nextState.theme || 'midnight',
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', workspaceId, 'data', 'master'), {
    workspaceId,
    ownerUid: uid,
    ...buildBoundedMasterPayload(nextState),
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', workspaceId, 'data', 'operations'), {
    workspaceId,
    ownerUid: uid,
    ...buildBoundedOperationsPayload(nextState),
    transactionsMigratedAt: now,
    updatedAt: now,
    updatedByUid: uid
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${workspaceId}/config/access`);
  }

  // Register directory lookup entries outside critical batch so email collisions don't block workspace creation
  void syncWorkspaceDirectoryEntries(workspaceId, uid, uid, nextState);

  return nextState;
}

export const registerFirstAdministrator = registerAdministratorWorkspace;

export interface WorkspaceRemotePatch extends Omit<Partial<AppState>, 'transactions' | 'master'> {
  master?: Partial<AppState['master']>;
  transactions?: Partial<AppState['transactions']>;
  opsTanks?: WipTank[];
  activeChangeovers?: ActiveChangeoverSnapshot[];
  hasLegacyOperationsTransactions?: boolean;
  transactionsMigrated?: boolean;
}

export interface LoadedCloudWorkspace {
  cloudRole: UserRole;
  workspaceId: string;
  factoryName: string;
  ownerUid: string;
  matchedProfileName?: string;
  matchedProfileId?: string;
  matchedProfileSubtitle?: string;
  hasLegacyOperationsTransactions: boolean;
  transactionsMigrated: boolean;
  statePatch: WorkspaceRemotePatch;
}

export type LoadCloudWorkspaceOutcome =
  | { status: 'ok'; workspace: LoadedCloudWorkspace }
  | { status: 'not_authorized'; email: string; factoryName?: string }
  | { status: 'workspace_missing' };

export async function loadCloudWorkspaceDetailed(user: User): Promise<LoadCloudWorkspaceOutcome> {
  const email = normalizeEmail(user.email || '');
  const uid = user.uid;
  if (!uid || !email) {
    return { status: 'not_authorized', email: email || '(tidak ada email)' };
  }

  // 1. Resolve exact isolated workspaceId for this user
  const resolved = await resolveWorkspaceIdForUser(user);
  const workspaceId = resolved.workspaceId;
  let isAdminUser = resolved.isAdminDoc;

  // 2. Read Workspace Meta
  const metaPath = `workspaces/${workspaceId}/config/meta`;
  let metaSnap;
  try {
    metaSnap = await getDocServerWithFallback(doc(db, 'workspaces', workspaceId, 'config', 'meta'));
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('Missing or insufficient permissions') || error?.code === 'permission-denied') {
      return { status: 'not_authorized', email };
    }
    handleFirestoreError(error, OperationType.GET, metaPath);
  }

  if (!metaSnap || !metaSnap.exists()) {
    return { status: 'workspace_missing' };
  }

  const meta = metaSnap.data();
  const adminEmailsList: string[] = (meta.adminGoogleEmails || []).map((e: string) => normalizeEmail(e));
  if (adminEmailsList.includes(email) || meta.ownerUid === uid) {
    isAdminUser = true;
  }

  const masterPath = `workspaces/${workspaceId}/data/master`;

  let masterSnap;
  let opsSnap;
  try {
    [masterSnap, opsSnap] = await Promise.all([
      getDocServerWithFallback(doc(db, 'workspaces', workspaceId, 'data', 'master')),
      getDocServerWithFallback(doc(db, 'workspaces', workspaceId, 'data', 'operations'))
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, masterPath);
  }

  let secretPin: string | undefined;
  let loadedAccessConfig: WorkspaceAccessConfig | undefined;
  if (isAdminUser) {
    try {
      const [secSnap, accessSnap] = await Promise.all([
        getDocServerWithFallback(doc(db, 'workspaces', workspaceId, 'config', 'secrets')),
        getDocServerWithFallback(doc(db, 'workspaces', workspaceId, 'config', 'access'))
      ]);
      if (secSnap.exists()) {
        secretPin = secSnap.data()?.adminPin;
      }
      if (accessSnap.exists()) {
        const ad = accessSnap.data();
        loadedAccessConfig = {
          workspaceId,
          ownerUid: ad?.ownerUid || meta.ownerUid,
          adminEmails: Array.isArray(ad?.adminEmails)
            ? ad.adminEmails.map((e: string) => normalizeEmail(e)).filter(Boolean)
            : adminEmailsList,
          operatorEmails: Array.isArray(ad?.operatorEmails) ? ad.operatorEmails : undefined,
          managementEmails: Array.isArray(ad?.managementEmails) ? ad.managementEmails : undefined
        };
      }
    } catch {
      // ignore if secrets or access doc missing
    }

    // Ensure secondary admin gets their /admins/{uid} profile created with workspaceId
    if (!isCloudWritePaused()) {
      try {
        const checkAdmin = await getDoc(doc(db, 'admins', uid));
        if (!checkAdmin.exists()) {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            email,
            displayName: sanitizeTextInput(user.displayName || email.split('@')[0], 120),
            factoryName: sanitizeTextInput(meta.factoryName || 'Pabrik ProdTrack', 120),
            workspaceId,
            role: email === BOOTSTRAP_EMAIL || meta.ownerUid === uid ? 'SUPER_ADMIN' : 'ADMIN',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        if (isQuotaExceededError(err)) {
          tripCloudWriteQuotaPause();
        }
        // Non-fatal
      }
    }
  }

  const masterData = masterSnap?.exists() ? masterSnap.data() : {};
  const opsData = opsSnap?.exists() ? opsSnap.data() : {};

  // Determine effective cloud role for this Google user within this isolated workspace
  let cloudRole: UserRole = 'MANAGEMENT';
  let matchedProfileName = user.displayName || email.split('@')[0];
  let matchedProfileId = uid;
  let matchedProfileSubtitle = '';

  const operators = (meta.registeredOperators || []) as AppState['registeredOperators'];
  const managements = (meta.registeredManagement || []) as AppState['registeredManagement'];

  if (isAdminUser) {
    cloudRole = 'ADMINISTRATOR';
    matchedProfileSubtitle = `Administrator Terverifikasi • ${meta.factoryName || 'ProdTrack'}`;
  } else {
    const matchedOp = operators.find(
      op => op.status === 'ACTIVE' && normalizeEmail(op.email || '') === email
    );
    if (matchedOp) {
      cloudRole = 'OPERATOR';
      matchedProfileId = matchedOp.id;
      matchedProfileName = matchedOp.name;
      matchedProfileSubtitle = `${matchedOp.nik} • ${matchedOp.assignedLine} • Shift ${matchedOp.assignedShift}`;
    } else {
      const matchedMgt = managements.find(
        m => m.hasViewAccess && normalizeEmail(m.email || '') === email
      );
      if (matchedMgt) {
        cloudRole = 'MANAGEMENT';
        matchedProfileId = matchedMgt.id;
        matchedProfileName = matchedMgt.name;
        matchedProfileSubtitle = `${matchedMgt.title} (${matchedMgt.department})`;
      } else {
        return {
          status: 'not_authorized',
          email,
          factoryName: meta.factoryName || undefined
        };
      }
    }
  }

  const activeRuns = Array.isArray(opsData.activeSkuRuns) ? opsData.activeSkuRuns : [];

  const mergedAdminEmails = Array.from(
    new Set(
      [
        ...(Array.isArray(meta.adminGoogleEmails) ? meta.adminGoogleEmails : []),
        ...(isAdminUser ? [email] : [])
      ]
        .map((e: string) => normalizeEmail(e))
        .filter(Boolean)
    )
  );

  const hasLegacyOperationsTransactions = Boolean(
    (Array.isArray(opsData.requests) && opsData.requests.length > 0) ||
      (Array.isArray(opsData.receipts) && opsData.receipts.length > 0) ||
      (Array.isArray(opsData.usages) && opsData.usages.length > 0) ||
      (Array.isArray(opsData.cartonProductions) && opsData.cartonProductions.length > 0) ||
      (Array.isArray(opsData.tankLogs) && opsData.tankLogs.length > 0) ||
      (Array.isArray(opsData.stockAdjustments) && opsData.stockAdjustments.length > 0) ||
      'requests' in opsData ||
      'receipts' in opsData ||
      'usages' in opsData ||
      'cartonProductions' in opsData ||
      'tankLogs' in opsData ||
      'stockAdjustments' in opsData
  );
  const transactionsMigrated = Boolean(opsData.transactionsMigratedAt) && !hasLegacyOperationsTransactions;

  const opsTanks = Array.isArray(opsData.tanks) ? (opsData.tanks as WipTank[]) : undefined;
  const activeChangeovers = Array.isArray(opsData.activeChangeovers)
    ? (opsData.activeChangeovers as ActiveChangeoverSnapshot[])
    : undefined;
  const mergedTanks = mergeMasterAndOpsTanks(masterData.tanks || [], opsTanks);
  const mergedMachines = mergeMachinesWithActiveChangeovers(masterData.machines || [], activeChangeovers);

  const statePatch: WorkspaceRemotePatch = {
    factoryName: meta.factoryName || 'Pabrik ProdTrack',
    cloudWorkspaceId: workspaceId,
    cloudOwnerUid: meta.ownerUid,
    theme: meta.theme || 'midnight',
    adminGoogleEmails: mergedAdminEmails,
    workspaceAccessConfig: loadedAccessConfig || {
      workspaceId,
      ownerUid: meta.ownerUid,
      adminEmails: mergedAdminEmails,
      operatorEmails: operators
        .filter(op => op.status === 'ACTIVE' && op.email)
        .map(op => normalizeEmail(op.email || ''))
        .filter(Boolean),
      managementEmails: managements
        .filter(m => m.hasViewAccess && m.email)
        .map(m => normalizeEmail(m.email))
        .filter(Boolean)
    },
    registeredOperators: operators,
    registeredManagement: managements,
    ...(isAdminUser
      ? {
          currentAdminUser: {
            email,
            displayName: matchedProfileName,
            photoURL: user.photoURL || undefined,
            registeredAt: new Date().toISOString(),
            role: email === BOOTSTRAP_EMAIL || meta.ownerUid === uid ? 'SUPER_ADMIN' : 'ADMIN'
          }
        }
      : {}),
    ...(secretPin ? { adminPin: secretPin } : {}),
    master: {
      materials: masterData.materials || [],
      wips: masterData.wips || [],
      skus: masterData.skus || [],
      skuWips: masterData.skuWips || [],
      wipMats: masterData.wipMats || [],
      recipes: masterData.recipes || [],
      machines: mergedMachines,
      tanks: mergedTanks,
      productionLines: masterData.productionLines || []
    },
    transactions: {
      ...(hasLegacyOperationsTransactions
        ? {
            requests: opsData.requests || [],
            receipts: opsData.receipts || [],
            usages: opsData.usages || [],
            cartonProductions: opsData.cartonProductions || [],
            tankLogs: opsData.tankLogs || [],
            stockAdjustments: opsData.stockAdjustments || []
          }
        : {}),
      wipBatches: opsData.wipBatches || [],
      changeovers: opsData.changeovers || [],
      productionStops: opsData.productionStops || []
    },
    activeSkuRuns: activeRuns,
    activeSkuRun: activeRuns[0] || null,
    lastShiftHandover: opsData.lastShiftHandover ?? null,
    weeklyPlannings: Array.isArray(opsData.weeklyPlannings) ? opsData.weeklyPlannings : [],
    activeWeeklyPlanId: opsData.activeWeeklyPlanId ?? null,
    ...(opsData.tank ? { tank: opsData.tank } : {}),
    opsTanks,
    activeChangeovers,
    hasLegacyOperationsTransactions,
    transactionsMigrated
  };

  return {
    status: 'ok',
    workspace: {
      cloudRole,
      workspaceId,
      factoryName: meta.factoryName || 'Pabrik ProdTrack',
      ownerUid: meta.ownerUid,
      matchedProfileName,
      matchedProfileId,
      matchedProfileSubtitle,
      hasLegacyOperationsTransactions,
      transactionsMigrated,
      statePatch
    }
  };
}

export async function loadCloudWorkspaceForUser(user: User): Promise<LoadedCloudWorkspace | null> {
  const outcome = await loadCloudWorkspaceDetailed(user);
  return outcome.status === 'ok' ? outcome.workspace : null;
}

export type WorkspaceCloudSection = 'meta' | 'master' | 'operations' | 'secrets';

export interface WorkspaceCloudSyncMeta {
  batchedEvents: number;
  sections: WorkspaceCloudSection[];
  hasCriticalLineChange: boolean;
  syncedAtIso: string;
}

export interface WorkspaceSubscribeOptions {
  workspaceId?: string;
  debounceMs?: number;
  maxWaitMs?: number;
  criticalDebounceMs?: number;
  onBatchApplied?: (meta: WorkspaceCloudSyncMeta) => void;
}

export interface DashboardLineStatusSnapshot {
  workspaceId?: string;
  productionLines?: ProductionLine[];
  activeSkuRuns?: ActiveSkuProductionRun[];
  activeSkuRun?: ActiveSkuProductionRun | null;
  lastUpdatedAtIso: string;
  source: 'firestore' | 'broadcast' | 'local';
  updatedByUid?: string;
}

const LINE_SYNC_CHANNEL_NAME = 'prodtrack_dashboard_line_sync_v1';

export function computeLineAvailabilitySignature(
  lines: ProductionLine[] = [],
  activeRuns: ActiveSkuProductionRun[] = []
): string {
  return JSON.stringify({
    lines: lines.map(l => [l.id, l.code, l.name, l.isActive]),
    runs: activeRuns.map(r => [
      r.id || '',
      r.lineId || '',
      r.lineName || '',
      r.skuId,
      r.isRunning,
      r.completionStatus || '',
      r.plannedCartons || 0,
      r.speedMultiplier || 1,
      r.shift,
      r.selectedHoldingTanks || null
    ])
  });
}

export function computeDashboardLineDigest(
  lines: ProductionLine[] = [],
  activeRuns: ActiveSkuProductionRun[] = []
): string {
  return JSON.stringify({
    lines: lines.map(l => [l.id, l.code, l.name, l.description || '', l.isActive]),
    runs: activeRuns.map(r => [
      r.id || '',
      r.lineId || '',
      r.lineName || '',
      r.skuId,
      r.skuName,
      r.skuCode || '',
      r.isRunning,
      r.completionStatus || '',
      r.cartonsProducedTotal || 0,
      r.plannedCartons || 0,
      r.speedMultiplier || 1,
      r.shift,
      r.startedAt,
      r.completedAt || '',
      r.lastDeductionTime || '',
      r.operatorName || '',
      r.shortageReason || '',
      r.sblReason || '',
      r.sblEstimatedMinutes || 0,
      r.sblStoppedAt || '',
      r.selectedHoldingTanks || null
    ])
  });
}

function extractIsoFromFirestoreTimestamp(ts: unknown): string {
  if (ts && typeof ts === 'object' && 'toDate' in (ts as Record<string, unknown>)) {
    try {
      return ((ts as { toDate: () => Date }).toDate()).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  if (typeof ts === 'string' && ts) return ts;
  return new Date().toISOString();
}

export function publishDashboardLineStatusBroadcast(params: {
  workspaceId?: string;
  productionLines: ProductionLine[];
  activeSkuRuns: ActiveSkuProductionRun[];
  updatedByUid?: string;
}): void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(LINE_SYNC_CHANNEL_NAME);
    const activeRuns = params.activeSkuRuns || [];
    const payload: DashboardLineStatusSnapshot = {
      workspaceId: params.workspaceId || LEGACY_WORKSPACE_ID,
      productionLines: params.productionLines || [],
      activeSkuRuns: activeRuns,
      activeSkuRun: activeRuns.find(r => r.isRunning) || activeRuns[0] || null,
      lastUpdatedAtIso: new Date().toISOString(),
      source: 'broadcast',
      updatedByUid: params.updatedByUid
    };
    channel.postMessage(payload);
    channel.close();
  } catch {
    // Ignore environments where BroadcastChannel is restricted
  }
}

export function subscribeToDashboardLineStatus(
  onLineStatusUpdate: (snapshot: DashboardLineStatusSnapshot) => void,
  onError?: (err: Error) => void,
  options?: { workspaceId?: string; debounceMs?: number; maxWaitMs?: number }
): () => void {
  if (!auth.currentUser) return () => {};

  const workspaceId = (options?.workspaceId || LEGACY_WORKSPACE_ID).slice(0, 64);
  const coalesceMs = options?.debounceMs ?? 60;
  const maxWaitMs = options?.maxWaitMs ?? 350;

  const unsubs: Unsubscribe[] = [];
  let isDisposed = false;
  let latestLines: ProductionLine[] | undefined;
  let latestRuns: ActiveSkuProductionRun[] | undefined;
  let latestUpdatedIso = new Date().toISOString();
  let latestUpdatedByUid: string | undefined;
  let lastEmittedDigest = '';
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSource: 'firestore' | 'broadcast' = 'firestore';

  const clearTimers = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const flushLineUpdate = () => {
    clearTimers();
    if (isDisposed || (latestLines === undefined && latestRuns === undefined)) return;
    const digest = computeDashboardLineDigest(latestLines || [], latestRuns || []);
    if (digest === lastEmittedDigest) return;
    lastEmittedDigest = digest;

    onLineStatusUpdate({
      workspaceId,
      productionLines: latestLines,
      activeSkuRuns: latestRuns,
      activeSkuRun: latestRuns
        ? latestRuns.find(r => r.isRunning) || latestRuns[0] || null
        : undefined,
      lastUpdatedAtIso: latestUpdatedIso,
      source: pendingSource,
      updatedByUid: latestUpdatedByUid
    });
  };

  const scheduleFlush = (source: 'firestore' | 'broadcast', immediate = false) => {
    if (isDisposed) return;
    pendingSource = source;
    if (immediate) {
      flushLineUpdate();
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushLineUpdate, coalesceMs);
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(flushLineUpdate, maxWaitMs);
    }
  };

  const handleSnapshotError = (err: Error, path: string) => {
    if (isDisposed || !auth.currentUser) return;
    if (isQuotaExceededError(err)) {
      tripCloudWriteQuotaPause();
    }
    if (onError) onError(err);
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch {
      // Prevent uncaught exceptions inside Firestore onSnapshot error callbacks
    }
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId, 'data', 'master'),
      snap => {
        if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const incomingLines = Array.isArray(d.productionLines) ? (d.productionLines as ProductionLine[]) : [];
        latestLines = incomingLines;
        latestUpdatedIso = extractIsoFromFirestoreTimestamp(d.updatedAt);
        latestUpdatedByUid = typeof d.updatedByUid === 'string' ? d.updatedByUid : undefined;
        scheduleFlush('firestore');
      },
      err => handleSnapshotError(err, `workspaces/${workspaceId}/data/master`)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId, 'data', 'operations'),
      snap => {
        if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const incomingRuns = Array.isArray(d.activeSkuRuns)
          ? (d.activeSkuRuns as ActiveSkuProductionRun[])
          : [];
        latestRuns = incomingRuns;
        latestUpdatedIso = extractIsoFromFirestoreTimestamp(d.updatedAt);
        latestUpdatedByUid = typeof d.updatedByUid === 'string' ? d.updatedByUid : undefined;
        scheduleFlush('firestore');
      },
      err => handleSnapshotError(err, `workspaces/${workspaceId}/data/operations`)
    )
  );

  let channel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(LINE_SYNC_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<DashboardLineStatusSnapshot>) => {
        if (isDisposed || !event?.data) return;
        const incoming = event.data;
        if (incoming.workspaceId && incoming.workspaceId !== workspaceId) return;
        if (Array.isArray(incoming.productionLines)) {
          latestLines = incoming.productionLines;
        }
        if (Array.isArray(incoming.activeSkuRuns)) {
          latestRuns = incoming.activeSkuRuns;
        }
        latestUpdatedIso = incoming.lastUpdatedAtIso || new Date().toISOString();
        latestUpdatedByUid = incoming.updatedByUid;
        scheduleFlush('broadcast', true);
      };
    } catch {
      channel = null;
    }
  }

  return () => {
    isDisposed = true;
    clearTimers();
    unsubs.forEach(u => u());
    if (channel) {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
  };
}

export function subscribeToWorkspaceCloud(
  cloudRole: UserRole,
  onRemoteUpdate: (patch: WorkspaceRemotePatch) => void,
  onError?: (err: Error) => void,
  options?: WorkspaceSubscribeOptions
): () => void {
  if (!auth.currentUser) return () => {};

  const workspaceId = (options?.workspaceId || LEGACY_WORKSPACE_ID).slice(0, 64);
  const debounceMs = options?.debounceMs ?? 350;
  const maxWaitMs = options?.maxWaitMs ?? 1200;
  const criticalDebounceMs = options?.criticalDebounceMs ?? 60;

  const unsubs: Unsubscribe[] = [];
  let isDisposed = false;

  let pendingPatch: WorkspaceRemotePatch = {};
  const pendingSections = new Set<WorkspaceCloudSection>();
  let pendingEventCount = 0;
  let pendingCriticalLineChange = false;

  const lastSectionJson: Partial<Record<WorkspaceCloudSection, string>> = {};
  let lastKnownLines: ProductionLine[] = [];
  let lastKnownRuns: ActiveSkuProductionRun[] = [];
  let lastLineAvailSig = '';

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const flushBatch = () => {
    clearTimers();
    if (isDisposed || pendingSections.size === 0) return;

    const patchToApply = pendingPatch;
    const appliedSections = Array.from(pendingSections);
    const appliedCount = pendingEventCount;
    const hadCriticalLineChange = pendingCriticalLineChange;

    pendingPatch = {};
    pendingSections.clear();
    pendingEventCount = 0;
    pendingCriticalLineChange = false;

    onRemoteUpdate(patchToApply);
    options?.onBatchApplied?.({
      batchedEvents: appliedCount,
      sections: appliedSections,
      hasCriticalLineChange: hadCriticalLineChange,
      syncedAtIso: new Date().toISOString()
    });
  };

  const enqueueSectionPatch = (
    section: WorkspaceCloudSection,
    patch: WorkspaceRemotePatch,
    fingerprintJson: string,
    isCriticalLineChange = false
  ) => {
    if (isDisposed) return;
    if (lastSectionJson[section] === fingerprintJson) {
      return;
    }
    lastSectionJson[section] = fingerprintJson;

    pendingPatch = {
      ...pendingPatch,
      ...patch,
      ...(pendingPatch.master || patch.master
        ? { master: { ...(pendingPatch.master || {}), ...(patch.master || {}) } }
        : {}),
      ...(pendingPatch.transactions || patch.transactions
        ? { transactions: { ...(pendingPatch.transactions || {}), ...(patch.transactions || {}) } }
        : {})
    };
    pendingSections.add(section);
    pendingEventCount += 1;
    if (isCriticalLineChange) {
      pendingCriticalLineChange = true;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    const targetWait = pendingCriticalLineChange ? criticalDebounceMs : debounceMs;
    debounceTimer = setTimeout(flushBatch, targetWait);

    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(flushBatch, maxWaitMs);
    }
  };

  const handleSnapshotError = (err: Error, path: string) => {
    if (isDisposed || !auth.currentUser) return;
    if (isQuotaExceededError(err)) {
      tripCloudWriteQuotaPause();
    }
    if (onError) onError(err);
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch {
      // Prevent uncaught exceptions inside Firestore onSnapshot error callbacks
    }
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId, 'config', 'meta'),
      snap => {
        if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const remoteAdminEmails = (d.adminGoogleEmails || []).map((e: string) => normalizeEmail(e)).filter(Boolean);
        const remoteOps = (d.registeredOperators || []) as AppState['registeredOperators'];
        const remoteMgts = (d.registeredManagement || []) as AppState['registeredManagement'];
        const metaPatch: Partial<AppState> = {
          factoryName: d.factoryName,
          cloudWorkspaceId: workspaceId,
          cloudOwnerUid: d.ownerUid,
          theme: d.theme,
          adminGoogleEmails: d.adminGoogleEmails || [],
          workspaceAccessConfig: {
            workspaceId,
            ownerUid: d.ownerUid,
            adminEmails: remoteAdminEmails,
            operatorEmails: remoteOps
              .filter(op => op.status === 'ACTIVE' && op.email)
              .map(op => normalizeEmail(op.email || ''))
              .filter(Boolean),
            managementEmails: remoteMgts
              .filter(m => m.hasViewAccess && m.email)
              .map(m => normalizeEmail(m.email))
              .filter(Boolean)
          },
          registeredOperators: d.registeredOperators || [],
          registeredManagement: d.registeredManagement || []
        };
        enqueueSectionPatch('meta', metaPatch, JSON.stringify(metaPatch));
      },
      err => handleSnapshotError(err, `workspaces/${workspaceId}/config/meta`)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId, 'data', 'master'),
      snap => {
        if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const incomingLines = (d.productionLines || []) as ProductionLine[];
        lastKnownLines = incomingLines;

        const nextLineAvailSig = computeLineAvailabilitySignature(lastKnownLines, lastKnownRuns);
        const isCriticalLineChange =
          lastLineAvailSig !== '' && nextLineAvailSig !== lastLineAvailSig;
        lastLineAvailSig = nextLineAvailSig;

        const masterPatch: WorkspaceRemotePatch = {
          master: {
            materials: d.materials || [],
            wips: d.wips || [],
            skus: d.skus || [],
            skuWips: d.skuWips || [],
            wipMats: d.wipMats || [],
            recipes: d.recipes || [],
            machines: d.machines || [],
            tanks: d.tanks || [],
            productionLines: incomingLines
          }
        };
        enqueueSectionPatch('master', masterPatch, JSON.stringify(masterPatch), isCriticalLineChange);
      },
      err => handleSnapshotError(err, `workspaces/${workspaceId}/data/master`)
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId, 'data', 'operations'),
      snap => {
        if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const activeRuns = Array.isArray(d.activeSkuRuns)
          ? (d.activeSkuRuns as ActiveSkuProductionRun[])
          : [];
        lastKnownRuns = activeRuns;

        const nextLineAvailSig = computeLineAvailabilitySignature(lastKnownLines, lastKnownRuns);
        const isCriticalLineChange =
          lastLineAvailSig !== '' && nextLineAvailSig !== lastLineAvailSig;
        lastLineAvailSig = nextLineAvailSig;

        const opsTanks = Array.isArray(d.tanks) ? (d.tanks as WipTank[]) : undefined;
        const activeChangeovers = Array.isArray(d.activeChangeovers)
          ? (d.activeChangeovers as ActiveChangeoverSnapshot[])
          : undefined;
        const hasLegacy = Boolean(
          'requests' in d ||
            'receipts' in d ||
            'usages' in d ||
            'cartonProductions' in d ||
            'tankLogs' in d ||
            'stockAdjustments' in d
        );

        const opsPatch: WorkspaceRemotePatch = {
          transactions: {
            wipBatches: d.wipBatches || [],
            changeovers: d.changeovers || [],
            productionStops: d.productionStops || []
          },
          activeSkuRuns: activeRuns,
          activeSkuRun: activeRuns[0] || null,
          lastShiftHandover: d.lastShiftHandover ?? null,
          weeklyPlannings: Array.isArray(d.weeklyPlannings) ? d.weeklyPlannings : [],
          activeWeeklyPlanId: d.activeWeeklyPlanId ?? null,
          ...(d.tank ? { tank: d.tank } : {}),
          ...(opsTanks ? { opsTanks } : {}),
          ...(activeChangeovers ? { activeChangeovers } : {}),
          hasLegacyOperationsTransactions: hasLegacy,
          transactionsMigrated: Boolean(d.transactionsMigratedAt) && !hasLegacy
        };
        enqueueSectionPatch('operations', opsPatch, JSON.stringify(opsPatch), isCriticalLineChange);
      },
      err => handleSnapshotError(err, `workspaces/${workspaceId}/data/operations`)
    )
  );

  if (cloudRole === 'ADMINISTRATOR') {
    unsubs.push(
      onSnapshot(
        doc(db, 'workspaces', workspaceId, 'config', 'secrets'),
        snap => {
          if (isDisposed || !snap.exists() || snap.metadata.hasPendingWrites) return;
          const d = snap.data();
          if (d.adminPin) {
            const secretPatch: Partial<AppState> = { adminPin: d.adminPin };
            enqueueSectionPatch('secrets', secretPatch, JSON.stringify(secretPatch));
          }
        },
        err => {
          if (!isDisposed && auth.currentUser && onError) onError(err);
        }
      )
    );
  }

  return () => {
    isDisposed = true;
    clearTimers();
    pendingSections.clear();
    pendingPatch = {};
    unsubs.forEach(u => u());
  };
}

export async function saveWorkspaceSectionsToCloud(
  sections: {
    meta?: boolean;
    secrets?: boolean;
    master?: boolean;
    operations?: boolean;
  },
  state: AppState,
  cloudRole: UserRole,
  options?: { preserveLegacyOperationsKeys?: boolean }
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !state.cloudOwnerUid) return;
  if (isCloudWritePaused()) return;

  const uid = user.uid;
  const ownerUid = state.cloudOwnerUid;
  const workspaceId = (state.cloudWorkspaceId || LEGACY_WORKSPACE_ID).slice(0, 64);
  const now = serverTimestamp();

  // Strictly enforce role boundaries & resolveEffectiveRole before attempting writes
  const effective = resolveEffectiveRole(state, {
    firebaseUserEmail: user.email,
    firebaseUid: uid,
    cloudAuthRole: cloudRole
  });
  const canWriteAdminSections = effective.canWriteCloudMaster && cloudRole === 'ADMINISTRATOR';
  const canWriteOperations =
    effective.canWriteCloudOperations &&
    (cloudRole === 'ADMINISTRATOR' || cloudRole === 'OPERATOR');

  const batch = writeBatch(db);
  const pathsWritten: string[] = [];

  if (sections.meta && canWriteAdminSections) {
    const keepOwnerEmail = ownerUid === uid ? user.email || undefined : undefined;
    const accessLists = buildAccessEmailLists(state, keepOwnerEmail);
    const mergedMetaAdminEmails = accessLists.adminEmails;
    batch.set(doc(db, 'workspaces', workspaceId, 'config', 'meta'), {
      workspaceId,
      ownerUid,
      factoryName: sanitizeTextInput(state.factoryName || 'Pabrik ProdTrack', 120),
      adminGoogleEmails: mergedMetaAdminEmails,
      registeredOperators: stripUndefinedDeep((state.registeredOperators || []).slice(0, 200)),
      registeredManagement: stripUndefinedDeep((state.registeredManagement || []).slice(0, 100)),
      theme: state.theme || 'midnight',
      updatedAt: now,
      updatedByUid: uid
    });
    batch.set(doc(db, 'workspaces', workspaceId, 'config', 'access'), {
      workspaceId,
      ownerUid,
      ...accessLists,
      updatedAt: now,
      updatedByUid: uid
    });
    pathsWritten.push(`workspaces/${workspaceId}/config/meta`);
  }

  if (sections.secrets && canWriteAdminSections) {
    const secretVal = (state.adminPin || '').trim();
    if (secretVal.length >= 4) {
      batch.set(doc(db, 'workspaces', workspaceId, 'config', 'secrets'), {
        workspaceId,
        ownerUid,
        adminPin: secretVal.slice(0, 256),
        updatedAt: now,
        updatedByUid: uid
      });
      pathsWritten.push(`workspaces/${workspaceId}/config/secrets`);
    }
  }

  if (sections.master && canWriteAdminSections) {
    batch.set(doc(db, 'workspaces', workspaceId, 'data', 'master'), {
      workspaceId,
      ownerUid,
      ...buildBoundedMasterPayload(state),
      updatedAt: now,
      updatedByUid: uid
    });
    pathsWritten.push(`workspaces/${workspaceId}/data/master`);
  }

  const shouldDeferOpsToUpdateDoc = Boolean(
    sections.operations && canWriteOperations && options?.preserveLegacyOperationsKeys
  );

  if (sections.operations && canWriteOperations && !shouldDeferOpsToUpdateDoc) {
    batch.set(doc(db, 'workspaces', workspaceId, 'data', 'operations'), {
      workspaceId,
      ownerUid,
      ...buildBoundedOperationsPayload(state),
      updatedAt: now,
      updatedByUid: uid
    });
    pathsWritten.push(`workspaces/${workspaceId}/data/operations`);
  }

  if (pathsWritten.length > 0) {
    try {
      await runFirestoreWriteWithGuard(() => batch.commit());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, pathsWritten[0]);
    }
  }

  // When an Operator saves operations BEFORE an Admin runs one-time migration, update only active fields
  // so legacy arrays in data/operations remain intact for the Admin migration.
  if (shouldDeferOpsToUpdateDoc && !isCloudWritePaused()) {
    const opsPath = `workspaces/${workspaceId}/data/operations`;
    try {
      await runFirestoreWriteWithGuard(() =>
        updateDoc(doc(db, 'workspaces', workspaceId, 'data', 'operations'), {
          ...buildBoundedOperationsPayload(state),
          updatedAt: now,
          updatedByUid: uid
        })
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, opsPath);
    }
  }

  if (sections.meta && canWriteAdminSections && !isCloudWritePaused()) {
    void syncWorkspaceDirectoryEntries(workspaceId, ownerUid, uid, state);
  }
}
