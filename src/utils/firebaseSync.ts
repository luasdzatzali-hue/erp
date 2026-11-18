import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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
  writeBatch,
  onSnapshot,
  serverTimestamp,
  Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { AppState, UserRole } from '../types';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const WORKSPACE_ID = 'main';
const BOOTSTRAP_EMAIL = 'luasdzatzali@gmail.com';

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
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
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

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

// Keep operational arrays within blueprint & 1MB Firestore document limits
export function buildBoundedOperationsPayload(state: AppState) {
  const keepRecent = <T,>(arr: T[] | undefined, max: number): T[] => {
    if (!arr || !Array.isArray(arr)) return [];
    if (arr.length <= max) return arr;
    return arr.slice(arr.length - max);
  };

  return stripUndefinedDeep({
    requests: keepRecent(state.transactions.requests, 500),
    receipts: keepRecent(state.transactions.receipts, 500),
    usages: keepRecent(state.transactions.usages, 600),
    wipBatches: keepRecent(state.transactions.wipBatches, 400),
    cartonProductions: keepRecent(state.transactions.cartonProductions, 600),
    tankLogs: keepRecent(state.transactions.tankLogs, 600),
    changeovers: keepRecent(state.transactions.changeovers, 250),
    productionStops: keepRecent(state.transactions.productionStops, 400),
    stockAdjustments: keepRecent(state.transactions.stockAdjustments, 250),
    activeSkuRuns: (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).slice(0, 80),
    tank: state.tank,
    lastShiftHandover: state.lastShiftHandover ?? null
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

export async function signInWithGoogleAuth(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const code = error?.code || '';
    if (
      code === 'auth/popup-closed-by-user' ||
      code === 'auth/cancelled-popup-request' ||
      code === 'auth/user-cancelled'
    ) {
      return null;
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Popup login Google diblokir oleh browser. Izinkan popup lalu coba lagi.');
    }
    if (code === 'auth/network-request-failed') {
      throw new Error('Koneksi internet bermasalah saat menghubungi Google Sign-In.');
    }
    throw new Error(error?.message || 'Gagal autentikasi akun Google.');
  }
}

export async function signOutGoogleAuth(): Promise<void> {
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
    const snap = await getDocFromServer(doc(db, 'system', 'bootstrap'));
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
    // Fallback to cached getDoc if server unreachable
    try {
      const cached = await getDoc(doc(db, 'system', 'bootstrap'));
      if (cached.exists()) {
        const data = cached.data();
        return {
          isInitialized: Boolean(data?.isInitialized),
          factoryName: data?.factoryName,
          ownerUid: data?.ownerUid
        };
      }
      return { isInitialized: false };
    } catch {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
}

export async function registerFirstAdministrator(params: {
  user: User;
  displayName: string;
  factoryName: string;
  adminPin: string;
  initialState: AppState;
}): Promise<AppState> {
  const { user, displayName, factoryName, adminPin, initialState } = params;
  const uid = user.uid;
  const email = (user.email || '').toLowerCase().trim();

  if (!uid || !email) {
    throw new Error('Akun Google tidak memiliki email terverifikasi.');
  }

  const cleanFactory = factoryName.trim().slice(0, 120) || 'Pabrik ProdTrack';
  const cleanName = displayName.trim().slice(0, 120) || email.split('@')[0];
  const cleanPin = adminPin.trim().slice(0, 16);

  const nextState: AppState = {
    ...initialState,
    factoryName: cleanFactory,
    cloudOwnerUid: uid,
    adminPin: cleanPin,
    adminGoogleEmails: Array.from(
      new Set([email, ...(initialState.adminGoogleEmails || []).map(e => e.toLowerCase().trim())].filter(Boolean))
    ),
    currentAdminUser: {
      email,
      displayName: cleanName,
      photoURL: user.photoURL || undefined,
      registeredAt: new Date().toISOString(),
      role: 'SUPER_ADMIN'
    },
    isAuthenticated: true,
    isAdmin: true,
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

  batch.set(doc(db, 'system', 'bootstrap'), {
    isInitialized: true,
    ownerUid: uid,
    factoryName: cleanFactory,
    initializedAt: now,
    updatedAt: now
  });

  batch.set(doc(db, 'admins', uid), {
    uid,
    email,
    displayName: cleanName,
    factoryName: cleanFactory,
    role: 'SUPER_ADMIN',
    createdAt: now,
    updatedAt: now
  });

  const accessLists = buildAccessEmailLists(nextState, email);
  batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'access'), {
    workspaceId: WORKSPACE_ID,
    ownerUid: uid,
    ...accessLists,
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'secrets'), {
    workspaceId: WORKSPACE_ID,
    ownerUid: uid,
    adminPin: cleanPin,
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'meta'), {
    workspaceId: WORKSPACE_ID,
    ownerUid: uid,
    factoryName: cleanFactory,
    adminGoogleEmails: nextState.adminGoogleEmails || [email],
    registeredOperators: stripUndefinedDeep((nextState.registeredOperators || []).slice(0, 200)),
    registeredManagement: stripUndefinedDeep((nextState.registeredManagement || []).slice(0, 100)),
    theme: nextState.theme || 'midnight',
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'master'), {
    workspaceId: WORKSPACE_ID,
    ownerUid: uid,
    ...buildBoundedMasterPayload(nextState),
    updatedAt: now,
    updatedByUid: uid
  });

  batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'operations'), {
    workspaceId: WORKSPACE_ID,
    ownerUid: uid,
    ...buildBoundedOperationsPayload(nextState),
    updatedAt: now,
    updatedByUid: uid
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'system/bootstrap');
  }

  return nextState;
}

export interface LoadedCloudWorkspace {
  cloudRole: UserRole;
  factoryName: string;
  ownerUid: string;
  matchedProfileName?: string;
  matchedProfileId?: string;
  matchedProfileSubtitle?: string;
  statePatch: Partial<AppState>;
}

export async function loadCloudWorkspaceForUser(user: User): Promise<LoadedCloudWorkspace | null> {
  const email = (user.email || '').toLowerCase().trim();
  const uid = user.uid;
  if (!uid || !email) return null;

  // 1. Check if UID has a registered admin doc (avoid throwing on non-admin permission check)
  let isAdminUser = email === BOOTSTRAP_EMAIL;
  try {
    const adminSnap = await getDocFromServer(doc(db, 'admins', uid));
    if (adminSnap.exists()) {
      isAdminUser = true;
    }
  } catch {
    // Non-admin or offline; proceed to workspace meta check
  }

  // 2. Read Workspace Meta, Master Data, Operations Data
  const metaPath = `workspaces/${WORKSPACE_ID}/config/meta`;
  let metaSnap;
  try {
    metaSnap = await getDocFromServer(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'meta'));
  } catch (error: any) {
    const msg = String(error?.message || '');
    if (msg.includes('Missing or insufficient permissions') || error?.code === 'permission-denied') {
      // User is not authorized in this workspace
      return null;
    }
    handleFirestoreError(error, OperationType.GET, metaPath);
  }

  if (!metaSnap || !metaSnap.exists()) {
    return null;
  }

  const meta = metaSnap.data();
  const adminEmailsList: string[] = (meta.adminGoogleEmails || []).map((e: string) => e.toLowerCase().trim());
  if (adminEmailsList.includes(email)) {
    isAdminUser = true;
  }

  const masterPath = `workspaces/${WORKSPACE_ID}/data/master`;
  const opsPath = `workspaces/${WORKSPACE_ID}/data/operations`;

  let masterSnap;
  let opsSnap;
  try {
    [masterSnap, opsSnap] = await Promise.all([
      getDocFromServer(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'master')),
      getDocFromServer(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'operations'))
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, masterPath);
  }

  let secretPin: string | undefined;
  if (isAdminUser) {
    try {
      const secSnap = await getDocFromServer(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'secrets'));
      if (secSnap.exists()) {
        secretPin = secSnap.data()?.adminPin;
      }
    } catch {
      // ignore if secrets missing
    }

    // Ensure secondary admin gets their /admins/{uid} profile created if invited via adminGoogleEmails
    try {
      const checkAdmin = await getDoc(doc(db, 'admins', uid));
      if (!checkAdmin.exists()) {
        await setDoc(doc(db, 'admins', uid), {
          uid,
          email,
          displayName: user.displayName || email.split('@')[0],
          factoryName: meta.factoryName || 'Pabrik ProdTrack',
          role: email === BOOTSTRAP_EMAIL ? 'SUPER_ADMIN' : 'ADMIN',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch {
      // Non-fatal if bootstrap admin creates on first write
    }
  }

  const masterData = masterSnap?.exists() ? masterSnap.data() : {};
  const opsData = opsSnap?.exists() ? opsSnap.data() : {};

  // Determine effective cloud role for this Google user
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
      op => op.status === 'ACTIVE' && (op.email || '').toLowerCase().trim() === email
    );
    if (matchedOp) {
      cloudRole = 'OPERATOR';
      matchedProfileId = matchedOp.id;
      matchedProfileName = matchedOp.name;
      matchedProfileSubtitle = `${matchedOp.nik} • ${matchedOp.assignedLine} • Shift ${matchedOp.assignedShift}`;
    } else {
      const matchedMgt = managements.find(
        m => m.hasViewAccess && m.email.toLowerCase().trim() === email
      );
      if (matchedMgt) {
        cloudRole = 'MANAGEMENT';
        matchedProfileId = matchedMgt.id;
        matchedProfileName = matchedMgt.name;
        matchedProfileSubtitle = `${matchedMgt.title} (${matchedMgt.department})`;
      } else {
        return null;
      }
    }
  }

  const activeRuns = Array.isArray(opsData.activeSkuRuns) ? opsData.activeSkuRuns : [];

  const statePatch: Partial<AppState> = {
    factoryName: meta.factoryName || 'Pabrik ProdTrack',
    cloudOwnerUid: meta.ownerUid,
    theme: meta.theme || 'midnight',
    adminGoogleEmails: meta.adminGoogleEmails || [],
    registeredOperators: operators,
    registeredManagement: managements,
    ...(secretPin ? { adminPin: secretPin } : {}),
    master: {
      materials: masterData.materials || [],
      wips: masterData.wips || [],
      skus: masterData.skus || [],
      skuWips: masterData.skuWips || [],
      wipMats: masterData.wipMats || [],
      recipes: masterData.recipes || [],
      machines: masterData.machines || [],
      tanks: masterData.tanks || [],
      productionLines: masterData.productionLines || []
    },
    transactions: {
      requests: opsData.requests || [],
      receipts: opsData.receipts || [],
      usages: opsData.usages || [],
      wipBatches: opsData.wipBatches || [],
      cartonProductions: opsData.cartonProductions || [],
      tankLogs: opsData.tankLogs || [],
      changeovers: opsData.changeovers || [],
      productionStops: opsData.productionStops || [],
      stockAdjustments: opsData.stockAdjustments || []
    },
    activeSkuRuns: activeRuns,
    activeSkuRun: activeRuns[0] || null,
    lastShiftHandover: opsData.lastShiftHandover ?? null,
    ...(opsData.tank ? { tank: opsData.tank } : {})
  };

  return {
    cloudRole,
    factoryName: meta.factoryName || 'Pabrik ProdTrack',
    ownerUid: meta.ownerUid,
    matchedProfileName,
    matchedProfileId,
    matchedProfileSubtitle,
    statePatch
  };
}

export function subscribeToWorkspaceCloud(
  cloudRole: UserRole,
  onRemoteUpdate: (patch: Partial<AppState>) => void,
  onError?: (err: Error) => void
): () => void {
  if (!auth.currentUser) return () => {};

  const unsubs: Unsubscribe[] = [];

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', WORKSPACE_ID, 'config', 'meta'),
      snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        onRemoteUpdate({
          factoryName: d.factoryName,
          cloudOwnerUid: d.ownerUid,
          theme: d.theme,
          adminGoogleEmails: d.adminGoogleEmails || [],
          registeredOperators: d.registeredOperators || [],
          registeredManagement: d.registeredManagement || []
        });
      },
      err => {
        if (onError) onError(err);
        handleFirestoreError(err, OperationType.GET, `workspaces/${WORKSPACE_ID}/config/meta`);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', WORKSPACE_ID, 'data', 'master'),
      snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        onRemoteUpdate({
          master: {
            materials: d.materials || [],
            wips: d.wips || [],
            skus: d.skus || [],
            skuWips: d.skuWips || [],
            wipMats: d.wipMats || [],
            recipes: d.recipes || [],
            machines: d.machines || [],
            tanks: d.tanks || [],
            productionLines: d.productionLines || []
          }
        });
      },
      err => {
        if (onError) onError(err);
        handleFirestoreError(err, OperationType.GET, `workspaces/${WORKSPACE_ID}/data/master`);
      }
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', WORKSPACE_ID, 'data', 'operations'),
      snap => {
        if (!snap.exists() || snap.metadata.hasPendingWrites) return;
        const d = snap.data();
        const activeRuns = Array.isArray(d.activeSkuRuns) ? d.activeSkuRuns : [];
        onRemoteUpdate({
          transactions: {
            requests: d.requests || [],
            receipts: d.receipts || [],
            usages: d.usages || [],
            wipBatches: d.wipBatches || [],
            cartonProductions: d.cartonProductions || [],
            tankLogs: d.tankLogs || [],
            changeovers: d.changeovers || [],
            productionStops: d.productionStops || [],
            stockAdjustments: d.stockAdjustments || []
          },
          activeSkuRuns: activeRuns,
          activeSkuRun: activeRuns[0] || null,
          lastShiftHandover: d.lastShiftHandover ?? null,
          ...(d.tank ? { tank: d.tank } : {})
        });
      },
      err => {
        if (onError) onError(err);
        handleFirestoreError(err, OperationType.GET, `workspaces/${WORKSPACE_ID}/data/operations`);
      }
    )
  );

  if (cloudRole === 'ADMINISTRATOR') {
    unsubs.push(
      onSnapshot(
        doc(db, 'workspaces', WORKSPACE_ID, 'config', 'secrets'),
        snap => {
          if (!snap.exists() || snap.metadata.hasPendingWrites) return;
          const d = snap.data();
          if (d.adminPin) {
            onRemoteUpdate({ adminPin: d.adminPin });
          }
        },
        err => {
          if (onError) onError(err);
        }
      )
    );
  }

  return () => {
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
  cloudRole: UserRole
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !state.cloudOwnerUid) return;

  const uid = user.uid;
  const ownerUid = state.cloudOwnerUid;
  const now = serverTimestamp();

  // Strictly enforce role boundaries before attempting writes
  const canWriteAdminSections = cloudRole === 'ADMINISTRATOR';
  const canWriteOperations = cloudRole === 'ADMINISTRATOR' || cloudRole === 'OPERATOR';

  if (sections.meta && canWriteAdminSections) {
    const accessLists = buildAccessEmailLists(state);
    const batch = writeBatch(db);
    batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'meta'), {
      workspaceId: WORKSPACE_ID,
      ownerUid,
      factoryName: (state.factoryName || 'Pabrik ProdTrack').slice(0, 120),
      adminGoogleEmails: (state.adminGoogleEmails || []).slice(0, 30),
      registeredOperators: stripUndefinedDeep((state.registeredOperators || []).slice(0, 200)),
      registeredManagement: stripUndefinedDeep((state.registeredManagement || []).slice(0, 100)),
      theme: state.theme || 'midnight',
      updatedAt: now,
      updatedByUid: uid
    });
    batch.set(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'access'), {
      workspaceId: WORKSPACE_ID,
      ownerUid,
      ...accessLists,
      updatedAt: now,
      updatedByUid: uid
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/config/meta`);
    }
  }

  if (sections.secrets && canWriteAdminSections) {
    try {
      await setDoc(doc(db, 'workspaces', WORKSPACE_ID, 'config', 'secrets'), {
        workspaceId: WORKSPACE_ID,
        ownerUid,
        adminPin: (state.adminPin || '1234').slice(0, 16),
        updatedAt: now,
        updatedByUid: uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/config/secrets`);
    }
  }

  if (sections.master && canWriteAdminSections) {
    try {
      await setDoc(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'master'), {
        workspaceId: WORKSPACE_ID,
        ownerUid,
        ...buildBoundedMasterPayload(state),
        updatedAt: now,
        updatedByUid: uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/data/master`);
    }
  }

  if (sections.operations && canWriteOperations) {
    try {
      await setDoc(doc(db, 'workspaces', WORKSPACE_ID, 'data', 'operations'), {
        workspaceId: WORKSPACE_ID,
        ownerUid,
        ...buildBoundedOperationsPayload(state),
        updatedAt: now,
        updatedByUid: uid
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `workspaces/${WORKSPACE_ID}/data/operations`);
    }
  }
}
