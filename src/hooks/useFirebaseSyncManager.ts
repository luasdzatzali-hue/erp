import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { User } from 'firebase/auth';
import {
  AppState,
  CartonProductionLog,
  EffectiveRoleResolution,
  TankTransferLog,
  UserRole
} from '../types';
import { getCleanBlankState, getSampleState, STORAGE_KEY, saveStateToStorage } from '../utils/storage';
import {
  auth,
  AuthErrorDetail,
  buildCriticalOperationsFingerprint,
  buildOperationsFingerprint,
  checkFirstTimeSetup,
  CloudQuotaStatus,
  computeDashboardLineDigest,
  computeLineAvailabilitySignature,
  consumeGoogleRedirectResult,
  DashboardLineStatusSnapshot,
  formatGoogleAuthError,
  getCloudQuotaStatus,
  isCloudWritePaused,
  isQuotaExceededError,
  loadCloudWorkspaceDetailed,
  mergeMachinesWithActiveChangeovers,
  mergeMasterAndOpsTanks,
  publishDashboardLineStatusBroadcast,
  registerAdministratorWorkspace,
  resetCloudWriteQuotaPause,
  saveWorkspaceSectionsToCloud,
  signInWithGooglePopup,
  signOutGoogleAuth,
  startGoogleRedirectSignIn,
  subscribeAuthState,
  subscribeCloudQuotaStatus,
  subscribeToDashboardLineStatus,
  subscribeToWorkspaceCloud,
  testConnection,
  tripCloudWriteQuotaPause,
  WorkspaceRemotePatch
} from '../utils/firebaseSync';
import {
  appendTransaction,
  hydrateTransactionsFromDocs,
  mergeMigratedTransactionsIntoState,
  migrateLegacyOperationsTransactionsIfNeeded,
  subscribeRecentTransactions,
  toTransactionDocFromAdjustment,
  toTransactionDocFromCartonProd,
  toTransactionDocFromReceipt,
  toTransactionDocFromRequest,
  toTransactionDocFromTankLog,
  toTransactionDocFromUsage,
  WorkspaceTransactionDoc
} from '../services/transactionService';
import { createSecurityAuditEntry, normalizeEmail, sanitizeTextInput } from '../utils/security';
import { resolveEffectiveRole } from '../utils/roleAccess';

export interface AutoCartonBufferEntry {
  cartonLog: CartonProductionLog;
  tankLogs: Map<string, TankTransferLog>;
  lastFlushedAt: number;
  accumulatedCartons: number;
}

export interface UseFirebaseSyncManagerParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  stateRef: React.MutableRefObject<AppState>;
  showToast: (msg: string, isError?: boolean) => void;
  onResetUiOnLogout?: () => void;
}

const serializeMeta = (s: AppState) =>
  JSON.stringify({
    factoryName: s.factoryName || '',
    theme: s.theme || 'midnight',
    adminGoogleEmails: s.adminGoogleEmails || [],
    registeredOperators: s.registeredOperators || [],
    registeredManagement: s.registeredManagement || []
  });

const serializeSecrets = (s: AppState) => JSON.stringify({ adminPin: s.adminPin || '' });

// Exclude high-frequency operational tank levels/statuses & activeChangeover snapshots that live in data/operations
const serializeMaster = (s: AppState) =>
  JSON.stringify({
    materials: s.master.materials || [],
    wips: s.master.wips || [],
    skus: s.master.skus || [],
    skuWips: s.master.skuWips || [],
    wipMats: s.master.wipMats || [],
    recipes: s.master.recipes || [],
    productionLines: s.master.productionLines || [],
    machines: (s.master.machines || []).map(({ activeChangeover: _co, status, ...rest }) => ({
      ...rest,
      status: status === 'CHANGEOVER' ? 'OPERATIONAL' : status
    })),
    tanks: (s.master.tanks || []).map(
      ({
        currentLevelKg: _lvl,
        status: _st,
        assignedWipId: _wip,
        temp: _t,
        agitatorStatus: _ag,
        ...rest
      }) => rest
    )
  });

const getActiveRunsArray = (s: AppState) =>
  s.activeSkuRuns || (s.activeSkuRun ? [s.activeSkuRun] : []);

export function useFirebaseSyncManager({
  state,
  setState,
  stateRef,
  showToast,
  onResetUiOnLogout
}: UseFirebaseSyncManagerParams) {
  const [setupStatus, setSetupStatus] = useState<'checking' | 'needs_setup' | 'ready' | 'error'>('checking');
  const [cloudFactoryName, setCloudFactoryName] = useState<string | undefined>(undefined);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudAuthRole, setCloudAuthRole] = useState<UserRole | null>(null);

  const effectiveRole: EffectiveRoleResolution = useMemo(
    () =>
      resolveEffectiveRole(state, {
        firebaseUserEmail: firebaseUser?.email ?? auth.currentUser?.email ?? null,
        firebaseUid: firebaseUser?.uid ?? auth.currentUser?.uid ?? null,
        cloudAuthRole
      }),
    [state, firebaseUser, cloudAuthRole]
  );

  const getEffectiveRoleForState = useCallback(
    (targetState: AppState = stateRef.current): EffectiveRoleResolution =>
      resolveEffectiveRole(targetState, {
        firebaseUserEmail: firebaseUser?.email ?? auth.currentUser?.email ?? null,
        firebaseUid: firebaseUser?.uid ?? auth.currentUser?.uid ?? null,
        cloudAuthRole
      }),
    [firebaseUser, cloudAuthRole, stateRef]
  );

  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [authErrorBanner, setAuthErrorBanner] = useState<AuthErrorDetail | null>(null);
  const [cloudQuotaStatus, setCloudQuotaStatus] = useState<CloudQuotaStatus>(() => getCloudQuotaStatus());
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);
  const [isTestingQuotaReset, setIsTestingQuotaReset] = useState(false);
  const [liveDashboardLineStatus, setLiveDashboardLineStatus] =
    useState<DashboardLineStatusSnapshot | null>(null);

  useEffect(() => {
    const unsub = subscribeCloudQuotaStatus(status => {
      setCloudQuotaStatus(status);
      if (status.isQuotaExceeded) {
        setQuotaBannerDismissed(false);
      }
    });
    return () => unsub();
  }, []);

  const [authViewKey, setAuthViewKey] = useState(0);
  const isApplyingRemoteRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const manualGoogleLoginInFlightRef = useRef(false);
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const txUnsubRef = useRef<(() => void) | null>(null);
  const lineStatusUnsubRef = useRef<(() => void) | null>(null);
  const hasLegacyOperationsRef = useRef<boolean>(false);
  const pendingTxDocsRef = useRef<Map<string, WorkspaceTransactionDoc>>(new Map());
  const autoCartonBufferRef = useRef<Map<string, AutoCartonBufferEntry>>(new Map());
  const cloudWriteTimersRef = useRef<{
    debounceTimer: ReturnType<typeof setTimeout> | null;
    maxWaitTimer: ReturnType<typeof setTimeout> | null;
  }>({ debounceTimer: null, maxWaitTimer: null });
  const pendingCloudSectionsRef = useRef<{
    meta: boolean;
    secrets: boolean;
    master: boolean;
    operations: boolean;
  }>({ meta: false, secrets: false, master: false, operations: false });
  const cloudInitializedSnapshotsRef = useRef<{
    meta: string;
    secrets: string;
    master: string;
    operations: string;
    lineAvailSig: string;
    criticalOpsSig: string;
    lineDigest: string;
  } | null>(null);

  const onResetUiOnLogoutRef = useRef(onResetUiOnLogout);
  useEffect(() => {
    onResetUiOnLogoutRef.current = onResetUiOnLogout;
  }, [onResetUiOnLogout]);

  const explicitOpsVersionRef = useRef<number>(0);
  const markExplicitOperationsWrite = useCallback(() => {
    explicitOpsVersionRef.current += 1;
  }, []);

  const serializeOperations = (s: AppState) =>
    buildOperationsFingerprint(s, explicitOpsVersionRef.current);

  const serializeCriticalOperations = (s: AppState) =>
    buildCriticalOperationsFingerprint(s, explicitOpsVersionRef.current);

  const refreshCloudSnapshotsBaseline = useCallback((s: AppState) => {
    const runs = s.activeSkuRuns || (s.activeSkuRun ? [s.activeSkuRun] : []);
    cloudInitializedSnapshotsRef.current = {
      meta: serializeMeta(s),
      secrets: serializeSecrets(s),
      master: serializeMaster(s),
      operations: serializeOperations(s),
      lineAvailSig: computeLineAvailabilitySignature(s.master.productionLines || [], runs),
      criticalOpsSig: serializeCriticalOperations(s),
      lineDigest: computeDashboardLineDigest(s.master.productionLines || [], runs)
    };
  }, []);

  const applyRemoteWorkspacePatch = useCallback(
    (prev: AppState, patch: WorkspaceRemotePatch): AppState => {
      const {
        master: masterPatch,
        transactions: txPatch,
        opsTanks,
        activeChangeovers,
        hasLegacyOperationsTransactions: _hasLegacy,
        transactionsMigrated: _migrated,
        ...restPatch
      } = patch;

      let nextMaster = masterPatch ? { ...prev.master, ...masterPatch } : { ...prev.master };
      if (opsTanks) {
        nextMaster = {
          ...nextMaster,
          tanks: mergeMasterAndOpsTanks(nextMaster.tanks, opsTanks)
        };
      }
      if (activeChangeovers) {
        nextMaster = {
          ...nextMaster,
          machines: mergeMachinesWithActiveChangeovers(nextMaster.machines, activeChangeovers)
        };
      }

      const nextTransactions = txPatch
        ? {
            ...prev.transactions,
            ...txPatch
          }
        : prev.transactions;

      return {
        ...prev,
        ...restPatch,
        master: nextMaster,
        transactions: nextTransactions
      };
    },
    []
  );

  const getActiveActorEmail = useCallback(() => {
    return (
      firebaseUser?.email ||
      auth.currentUser?.email ||
      stateRef.current.currentSession?.email ||
      stateRef.current.currentAdminUser?.email ||
      'system@prodtrack.local'
    );
  }, [firebaseUser, stateRef]);

  const dispatchAppendTx = useCallback(
    (txDoc: WorkspaceTransactionDoc) => {
      const currentState = stateRef.current;
      const canWriteTx = cloudAuthRole === 'ADMINISTRATOR' || cloudAuthRole === 'OPERATOR';
      if (
        setupStatus !== 'ready' ||
        !(auth.currentUser || firebaseUser) ||
        !canWriteTx ||
        !currentState.cloudOwnerUid ||
        isCloudWritePaused()
      ) {
        return;
      }
      const workspaceId = currentState.cloudWorkspaceId || 'main';
      pendingTxDocsRef.current.set(txDoc.id, txDoc);
      void appendTransaction(workspaceId, txDoc).catch(err => {
        if (isQuotaExceededError(err)) {
          tripCloudWriteQuotaPause();
          return;
        }
        console.error('Failed to append transaction to Firestore sub-collection:', err);
      });
    },
    [setupStatus, firebaseUser, cloudAuthRole, stateRef]
  );

  const getBufferedAutoTxDocs = useCallback((): Map<string, WorkspaceTransactionDoc> => {
    const combined = new Map<string, WorkspaceTransactionDoc>(pendingTxDocsRef.current);
    const actorEmail = getActiveActorEmail();
    autoCartonBufferRef.current.forEach(entry => {
      const cpDoc = toTransactionDocFromCartonProd(entry.cartonLog, actorEmail);
      combined.set(cpDoc.id, cpDoc);
      entry.tankLogs.forEach(tl => {
        const tlDoc = toTransactionDocFromTankLog(tl, actorEmail);
        combined.set(tlDoc.id, tlDoc);
      });
    });
    return combined;
  }, [getActiveActorEmail]);

  const flushAutoCartonBuffer = useCallback(
    (targetLineOrRunKey?: string) => {
      if (autoCartonBufferRef.current.size === 0 || isCloudWritePaused()) return;
      const actorEmail = getActiveActorEmail();
      const keysToFlush = Array.from(autoCartonBufferRef.current.keys()).filter(k =>
        targetLineOrRunKey ? k.includes(targetLineOrRunKey) : true
      );
      keysToFlush.forEach(k => {
        const entry = autoCartonBufferRef.current.get(k);
        if (!entry) return;
        autoCartonBufferRef.current.delete(k);
        dispatchAppendTx(toTransactionDocFromCartonProd(entry.cartonLog, actorEmail));
        entry.tankLogs.forEach(tl => {
          dispatchAppendTx(toTransactionDocFromTankLog(tl, actorEmail));
        });
      });
    },
    [dispatchAppendTx, getActiveActorEmail]
  );

  // Sign In Success from AuthPortalView
  const handleLoginSuccess = useCallback(
    (
      role: UserRole,
      sessionData: { id: string; name: string; subtitle?: string; email?: string },
      cloudVerifiedRole?: UserRole | null
    ) => {
      isLoggingOutRef.current = false;
      isApplyingRemoteRef.current = false;
      setAuthErrorBanner(null);
      setState(prev => {
        const initialTab: AppState['currentTab'] =
          role === 'ADMINISTRATOR' || role === 'OFFLINE_PIN_ADMIN'
            ? 'admin-portal'
            : role === 'OPERATOR'
            ? 'pemakaian'
            : 'dashboard';

        const isVerifiedCloudAdminCall = cloudVerifiedRole === 'ADMINISTRATOR';
        const fallbackEmail = normalizeEmail(
          sessionData.email || (isVerifiedCloudAdminCall ? auth.currentUser?.email || '' : '')
        );
        const restoredAdminUser =
          role === 'ADMINISTRATOR' && !prev.currentAdminUser && fallbackEmail
            ? {
                email: fallbackEmail,
                displayName: sanitizeTextInput(sessionData.name, 120),
                photoURL: auth.currentUser?.photoURL || undefined,
                registeredAt: new Date().toISOString(),
                role: (prev.cloudOwnerUid === auth.currentUser?.uid ||
                fallbackEmail === 'luasdzatzali@gmail.com'
                  ? 'SUPER_ADMIN'
                  : 'ADMIN') as 'SUPER_ADMIN' | 'ADMIN'
              }
            : prev.currentAdminUser;

        const resolvedLoginRole = resolveEffectiveRole(
          {
            ...prev,
            currentUserRole: role,
            currentAdminUser: restoredAdminUser
          },
          {
            firebaseUserEmail: auth.currentUser?.email ?? firebaseUser?.email ?? null,
            firebaseUid: auth.currentUser?.uid ?? firebaseUser?.uid ?? null,
            cloudAuthRole: cloudVerifiedRole ?? cloudAuthRole
          }
        );

        const loginAudit = createSecurityAuditEntry({
          eventType: 'LOGIN_SUCCESS',
          userEmail: fallbackEmail || sessionData.name,
          role: resolvedLoginRole.role,
          notes: `Masuk ke workspace ${prev.factoryName || 'ProdTrack'}`
        });

        return {
          ...prev,
          isAuthenticated: true,
          currentUserRole: resolvedLoginRole.role,
          currentAdminUser: resolvedLoginRole.isCloudAdmin ? restoredAdminUser : null,
          currentTab: initialTab,
          currentSession: {
            role: resolvedLoginRole.role,
            id: sessionData.id,
            name: sessionData.name,
            subtitle: sessionData.subtitle,
            email: fallbackEmail || sessionData.email
          },
          securityLogs: [loginAudit, ...(prev.securityLogs || [])].slice(0, 100)
        };
      });
      showToast(
        `Selamat datang, ${sessionData.name} (${role === 'OFFLINE_PIN_ADMIN' ? 'Mode PIN Lokal' : role})`
      );
    },
    [showToast, firebaseUser, cloudAuthRole, setState]
  );

  const applyCloudWorkspaceEntry = useCallback(
    async (user: User, intendedRole?: UserRole): Promise<boolean> => {
      const outcome = await loadCloudWorkspaceDetailed(user);
      if (outcome.status === 'workspace_missing') {
        const msg = 'Data workspace pabrik belum ditemukan di Cloud Firestore.';
        setAuthErrorBanner({ message: msg });
        showToast(msg, true);
        return false;
      }

      if (outcome.status === 'not_authorized') {
        const factoryLabel = outcome.factoryName ? ` (${outcome.factoryName})` : '';
        const msg = `Akun Google (${outcome.email}) belum terdaftar sebagai Administrator, Operator, atau Management pada pabrik${factoryLabel}. Gunakan "Ganti Akun Google" untuk login dengan email Administrator yang terdaftar.`;
        setAuthErrorBanner({ message: msg });
        showToast(msg, true);
        return false;
      }

      const loaded = outcome.workspace;

      if (intendedRole === 'ADMINISTRATOR' && loaded.cloudRole !== 'ADMINISTRATOR') {
        const msg = `Akun Google (${user.email}) saat ini memiliki peran ${loaded.cloudRole}, bukan Administrator. Klik "Ganti Akun Google" untuk masuk dengan email Administrator terdaftar.`;
        setAuthErrorBanner({ message: msg });
        showToast(msg, true);
        return false;
      }

      if (intendedRole === 'OPERATOR' && loaded.cloudRole === 'MANAGEMENT') {
        const msg = `Akun (${user.email}) terdaftar sebagai Management (Read-Only), bukan Operator.`;
        setAuthErrorBanner({ message: msg });
        showToast(msg, true);
        return false;
      }

      const nextEffectiveRole: UserRole = intendedRole || loaded.cloudRole;

      setAuthErrorBanner(null);
      setCloudAuthRole(loaded.cloudRole);
      setCloudFactoryName(loaded.factoryName);
      hasLegacyOperationsRef.current = loaded.hasLegacyOperationsTransactions;
      isApplyingRemoteRef.current = true;
      setState(prev => {
        const next = applyRemoteWorkspacePatch(prev, loaded.statePatch);
        refreshCloudSnapshotsBaseline(next);
        return next;
      });
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 200);

      handleLoginSuccess(
        nextEffectiveRole,
        {
          id: loaded.matchedProfileId || user.uid,
          name: loaded.matchedProfileName || user.displayName || user.email || 'User',
          email: user.email || undefined,
          subtitle: loaded.matchedProfileSubtitle || `${nextEffectiveRole} • ${loaded.factoryName}`
        },
        loaded.cloudRole
      );
      return true;
    },
    [applyRemoteWorkspacePatch, handleLoginSuccess, refreshCloudSnapshotsBaseline, showToast, setState]
  );

  const runSetupCheck = useCallback(async () => {
    setSetupStatus('checking');
    try {
      const boot = await checkFirstTimeSetup();
      if (!boot.isInitialized) {
        setSetupStatus('needs_setup');
        setCloudFactoryName(undefined);
        // Ensure first-time Admin Setup Wizard always blocks bypassing into app
        setState(prev => (prev.isAuthenticated ? { ...prev, isAuthenticated: false } : prev));
      } else {
        setSetupStatus('ready');
        setCloudFactoryName(boot.factoryName);
      }
    } catch (err) {
      console.error('Failed to verify setup status:', err);
      setSetupStatus('error');
    }
  }, [setState]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Check redirect login result first (in case user returned from Google signInWithRedirect)
      const redirectResult = await consumeGoogleRedirectResult();
      if (cancelled) return;

      if (redirectResult.errorDetail) {
        setAuthErrorBanner(redirectResult.errorDetail);
        showToast(redirectResult.errorDetail.message, true);
      }

      const hasPendingRoleRedirect = Boolean(
        redirectResult.user &&
          !redirectResult.isDriveConnectRedirect &&
          redirectResult.intendedRole &&
          redirectResult.intendedRole !== 'SETUP'
      );

      if (hasPendingRoleRedirect) {
        manualGoogleLoginInFlightRef.current = true;
      }

      if (redirectResult.user) {
        setFirebaseUser(redirectResult.user);
      }

      await runSetupCheck();
      if (cancelled) {
        if (hasPendingRoleRedirect) {
          manualGoogleLoginInFlightRef.current = false;
        }
        return;
      }

      if (redirectResult.isDriveConnectRedirect && redirectResult.user) {
        showToast(
          `Google Drive terhubung (${redirectResult.user.email}). Buka kembali Master BOM → Import untuk memilih dokumen.`
        );
      } else if (hasPendingRoleRedirect && redirectResult.user) {
        setIsSyncingCloud(true);
        try {
          await applyCloudWorkspaceEntry(redirectResult.user, redirectResult.intendedRole as UserRole);
        } catch (err: unknown) {
          const detail = (err as { authDetail?: AuthErrorDetail })?.authDetail || formatGoogleAuthError(err);
          setAuthErrorBanner(detail);
          showToast(detail.message, true);
        } finally {
          manualGoogleLoginInFlightRef.current = false;
          if (!cancelled) setIsSyncingCloud(false);
        }
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [runSetupCheck, applyCloudWorkspaceEntry, showToast]);

  // Listen to Firebase Auth state changes
  useEffect(() => {
    const unsub = subscribeAuthState(user => {
      if (user && isLoggingOutRef.current) {
        return;
      }
      setFirebaseUser(user);
      if (!user) {
        cloudUnsubRef.current?.();
        cloudUnsubRef.current = null;
        txUnsubRef.current?.();
        txUnsubRef.current = null;
        lineStatusUnsubRef.current?.();
        lineStatusUnsubRef.current = null;
        hasLegacyOperationsRef.current = false;
        pendingTxDocsRef.current.clear();
        autoCartonBufferRef.current.clear();
        if (cloudWriteTimersRef.current.debounceTimer) {
          clearTimeout(cloudWriteTimersRef.current.debounceTimer);
          cloudWriteTimersRef.current.debounceTimer = null;
        }
        if (cloudWriteTimersRef.current.maxWaitTimer) {
          clearTimeout(cloudWriteTimersRef.current.maxWaitTimer);
          cloudWriteTimersRef.current.maxWaitTimer = null;
        }
        setLiveDashboardLineStatus(null);
        setCloudAuthRole(null);
        cloudInitializedSnapshotsRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Hydrate workspace from Cloud Firestore once setupStatus is ready and Firebase user is authenticated
  useEffect(() => {
    if (setupStatus !== 'ready' || !firebaseUser) return;
    if (manualGoogleLoginInFlightRef.current || isLoggingOutRef.current) return;
    let isCancelled = false;

    const syncFromCloud = async () => {
      setIsSyncingCloud(true);
      try {
        const outcome = await loadCloudWorkspaceDetailed(firebaseUser);
        if (isCancelled || manualGoogleLoginInFlightRef.current || isLoggingOutRef.current) return;
        if (outcome.status === 'ok') {
          const loaded = outcome.workspace;
          setCloudAuthRole(loaded.cloudRole);
          setCloudFactoryName(loaded.factoryName);
          hasLegacyOperationsRef.current = loaded.hasLegacyOperationsTransactions;
          isApplyingRemoteRef.current = true;
          setState(prev => {
            const patched = applyRemoteWorkspacePatch(prev, loaded.statePatch);
            const resolved = resolveEffectiveRole(patched, {
              firebaseUserEmail: firebaseUser.email,
              firebaseUid: firebaseUser.uid,
              cloudAuthRole: loaded.cloudRole
            });
            const next: AppState = {
              ...patched,
              currentUserRole: resolved.role,
              currentAdminUser: resolved.isCloudAdmin ? patched.currentAdminUser : null
            };
            refreshCloudSnapshotsBaseline(next);
            return next;
          });
          setTimeout(() => {
            isApplyingRemoteRef.current = false;
          }, 150);
        } else {
          setCloudAuthRole(null);
        }
      } catch (err) {
        console.error('Cloud hydration error:', err);
      } finally {
        if (!isCancelled) setIsSyncingCloud(false);
      }
    };

    syncFromCloud();
    return () => {
      isCancelled = true;
    };
  }, [setupStatus, firebaseUser, applyRemoteWorkspacePatch, refreshCloudSnapshotsBaseline, setState]);

  // Attach debounced/batched real-time Firestore listeners for multi-device collaboration (isolated per workspaceId)
  useEffect(() => {
    if (setupStatus !== 'ready' || !firebaseUser || !cloudAuthRole) return;
    const unsub = subscribeToWorkspaceCloud(
      cloudAuthRole,
      patch => {
        if (typeof patch.hasLegacyOperationsTransactions === 'boolean') {
          hasLegacyOperationsRef.current = patch.hasLegacyOperationsTransactions;
        }
        isApplyingRemoteRef.current = true;
        setState(prev => {
          const next = applyRemoteWorkspacePatch(prev, patch);
          refreshCloudSnapshotsBaseline(next);
          return next;
        });
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 180);
      },
      err => {
        if (!isQuotaExceededError(err)) {
          console.error('Realtime sync warning:', err);
        }
      },
      {
        workspaceId: state.cloudWorkspaceId,
        debounceMs: 350,
        maxWaitMs: 1200,
        criticalDebounceMs: 60
      }
    );
    cloudUnsubRef.current = unsub;
    return () => {
      unsub();
      if (cloudUnsubRef.current === unsub) {
        cloudUnsubRef.current = null;
      }
    };
  }, [
    setupStatus,
    firebaseUser,
    cloudAuthRole,
    state.cloudWorkspaceId,
    applyRemoteWorkspacePatch,
    refreshCloudSnapshotsBaseline,
    setState
  ]);

  // Attach real-time Firestore listener for /workspaces/{workspaceId}/transactions sub-collection
  useEffect(() => {
    if (setupStatus !== 'ready' || !firebaseUser || !cloudAuthRole) return;
    const workspaceId = state.cloudWorkspaceId || 'main';
    const unsubTx = subscribeRecentTransactions(
      workspaceId,
      500,
      docs => {
        docs.forEach(d => {
          pendingTxDocsRef.current.delete(d.id);
        });
        if (docs.length === 0 && hasLegacyOperationsRef.current) {
          return;
        }
        const hydrated = hydrateTransactionsFromDocs(docs);
        const pendingMap = getBufferedAutoTxDocs();
        isApplyingRemoteRef.current = true;
        setState(prev => ({
          ...prev,
          transactions: mergeMigratedTransactionsIntoState(prev.transactions, hydrated, pendingMap)
        }));
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 100);
      },
      err => {
        if (!isQuotaExceededError(err)) {
          console.error('Realtime transaction sub-collection warning:', err);
        }
      }
    );
    txUnsubRef.current = unsubTx;
    return () => {
      unsubTx();
      if (txUnsubRef.current === unsubTx) {
        txUnsubRef.current = null;
      }
    };
  }, [setupStatus, firebaseUser, cloudAuthRole, state.cloudWorkspaceId, getBufferedAutoTxDocs, setState]);

  // One-time automatic Admin migration of legacy transaction arrays from data/operations -> /transactions
  useEffect(() => {
    if (
      setupStatus !== 'ready' ||
      !firebaseUser ||
      cloudAuthRole !== 'ADMINISTRATOR' ||
      !effectiveRole.canWriteCloudMaster
    ) {
      return;
    }
    const workspaceId = state.cloudWorkspaceId;
    if (!workspaceId) return;

    let cancelled = false;
    const runMigration = async () => {
      try {
        const res = await migrateLegacyOperationsTransactionsIfNeeded({
          workspaceId,
          adminEmail: firebaseUser.email,
          skus: stateRef.current.master.skus
        });
        if (cancelled) return;
        hasLegacyOperationsRef.current = false;
        if (res.migrated && res.migratedCount > 0) {
          showToast(
            `Migrasi otomatis selesai: ${res.migratedCount} transaksi dipindahkan ke sub-koleksi Firestore.`
          );
        }
      } catch (err) {
        console.error('Legacy transaction migration warning:', err);
      }
    };
    void runMigration();
    return () => {
      cancelled = true;
    };
  }, [
    setupStatus,
    firebaseUser,
    cloudAuthRole,
    state.cloudWorkspaceId,
    effectiveRole.canWriteCloudMaster,
    stateRef,
    showToast
  ]);

  // Dedicated real-time listener specifically for DashboardView production line availability & SKU run progress
  useEffect(() => {
    if (setupStatus !== 'ready' || !firebaseUser || !cloudAuthRole) return;
    const unsubLines = subscribeToDashboardLineStatus(
      snapshot => {
        setLiveDashboardLineStatus(snapshot);
        // Ensure AppState activeSkuRuns & productionLines stay synchronized cleanly on remote changes
        isApplyingRemoteRef.current = true;
        setState(prev => {
          const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
          const currentDigest = computeDashboardLineDigest(prev.master.productionLines || [], prevRuns);
          const nextLines =
            snapshot.productionLines && snapshot.productionLines.length > 0
              ? snapshot.productionLines
              : prev.master.productionLines;
          const nextRuns = snapshot.activeSkuRuns !== undefined ? snapshot.activeSkuRuns : prevRuns;
          const nextDigest = computeDashboardLineDigest(nextLines, nextRuns);
          if (currentDigest === nextDigest) {
            return prev;
          }
          const next: AppState = {
            ...prev,
            master: {
              ...prev.master,
              productionLines: nextLines
            },
            activeSkuRuns: nextRuns,
            activeSkuRun:
              snapshot.activeSkuRun !== undefined
                ? snapshot.activeSkuRun
                : nextRuns.find(r => r.isRunning) || nextRuns[0] || null
          };
          refreshCloudSnapshotsBaseline(next);
          return next;
        });
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 180);
      },
      err => {
        if (!isQuotaExceededError(err)) {
          console.error('Dashboard line status realtime warning:', err);
        }
      },
      { workspaceId: state.cloudWorkspaceId, debounceMs: 60, maxWaitMs: 350 }
    );
    lineStatusUnsubRef.current = unsubLines;
    return () => {
      unsubLines();
      if (lineStatusUnsubRef.current === unsubLines) {
        lineStatusUnsubRef.current = null;
      }
    };
  }, [setupStatus, firebaseUser, cloudAuthRole, state.cloudWorkspaceId, refreshCloudSnapshotsBaseline, setState]);

  // Administrator Setup Wizard completion handler (creates isolated multi-tenant workspace)
  const handleCompleteFirstAdminSetup = async (data: {
    user: User;
    factoryName: string;
    adminName: string;
    adminPin: string;
    initMode: 'template' | 'blank';
  }) => {
    const baseState = data.initMode === 'template' ? getSampleState() : getCleanBlankState();
    const registeredState = await registerAdministratorWorkspace({
      user: data.user,
      displayName: data.adminName,
      factoryName: data.factoryName,
      adminPin: data.adminPin,
      initialState: baseState
    });

    const signupAudit = createSecurityAuditEntry({
      eventType: 'SIGNUP_ADMIN',
      userEmail: data.user.email || 'admin',
      role: 'ADMINISTRATOR',
      notes: `Registrasi workspace baru: ${data.factoryName} (${data.initMode})`
    });

    const finalState: AppState = {
      ...registeredState,
      securityLogs: [signupAudit, ...(registeredState.securityLogs || [])].slice(0, 100)
    };

    isLoggingOutRef.current = false;
    hasLegacyOperationsRef.current = false;
    setAuthErrorBanner(null);
    isApplyingRemoteRef.current = true;
    setState(finalState);
    refreshCloudSnapshotsBaseline(finalState);
    setCloudFactoryName(data.factoryName);
    setCloudAuthRole('ADMINISTRATOR');
    setSetupStatus('ready');
    setTimeout(() => {
      isApplyingRemoteRef.current = false;
    }, 200);

    // Seed initial template transactions (if any) directly into /transactions sub-collection
    if (data.initMode === 'template' && finalState.cloudWorkspaceId) {
      const wsId = finalState.cloudWorkspaceId;
      const actor = data.user.email || 'admin@prodtrack.local';
      const skus = finalState.master.skus || [];
      const seedDocs: WorkspaceTransactionDoc[] = [
        ...(finalState.transactions.requests || []).map(r => toTransactionDocFromRequest(r, actor, skus)),
        ...(finalState.transactions.receipts || []).map(r => toTransactionDocFromReceipt(r, actor)),
        ...(finalState.transactions.usages || []).map(u => toTransactionDocFromUsage(u, actor, skus)),
        ...(finalState.transactions.cartonProductions || []).map(c => toTransactionDocFromCartonProd(c, actor)),
        ...(finalState.transactions.tankLogs || []).map(t => toTransactionDocFromTankLog(t, actor)),
        ...(finalState.transactions.stockAdjustments || []).map(a => toTransactionDocFromAdjustment(a, actor))
      ];
      seedDocs.forEach(d => {
        pendingTxDocsRef.current.set(d.id, d);
        void appendTransaction(wsId, d).catch(err => console.error('Template tx seed error:', err));
      });
    }

    showToast(`Administrator ${data.adminName} & Workspace "${data.factoryName}" berhasil disimpan ke Cloud!`);
  };

  // Sign in via Google & load Cloud Workspace (Admin / Operator / Management)
  const handleGoogleCloudLogin = async (
    intendedRole?: UserRole,
    options?: { forceAccountSelect?: boolean; useRedirect?: boolean }
  ) => {
    setAuthErrorBanner(null);

    if (options?.useRedirect) {
      try {
        await startGoogleRedirectSignIn(intendedRole);
      } catch (err: unknown) {
        const detail = (err as { authDetail?: AuthErrorDetail })?.authDetail || formatGoogleAuthError(err);
        setAuthErrorBanner(detail);
        showToast(detail.message, true);
      }
      return;
    }

    const activeUser = auth.currentUser || firebaseUser;
    if (activeUser && !options?.forceAccountSelect) {
      setIsSyncingCloud(true);
      try {
        await applyCloudWorkspaceEntry(activeUser, intendedRole);
        return;
      } catch (err: unknown) {
        const detail = (err as { authDetail?: AuthErrorDetail })?.authDetail || formatGoogleAuthError(err);
        setAuthErrorBanner(detail);
        showToast(detail.message, true);
        return;
      } finally {
        setIsSyncingCloud(false);
      }
    }

    manualGoogleLoginInFlightRef.current = true;
    setIsSyncingCloud(true);
    try {
      const outcome = await signInWithGooglePopup(true);
      if (outcome.status !== 'success') {
        setAuthErrorBanner(outcome.error);
        showToast(outcome.error.message, true);
        return;
      }
      setFirebaseUser(outcome.user);
      await applyCloudWorkspaceEntry(outcome.user, intendedRole);
    } catch (err: unknown) {
      const detail = (err as { authDetail?: AuthErrorDetail })?.authDetail || formatGoogleAuthError(err);
      setAuthErrorBanner(detail);
      showToast(detail.message, true);
    } finally {
      manualGoogleLoginInFlightRef.current = false;
      setIsSyncingCloud(false);
    }
  };

  // Flush any queued batched Firestore writes cleanly
  const flushPendingCloudWrites = useCallback(async () => {
    const timers = cloudWriteTimersRef.current;
    if (timers.debounceTimer) {
      clearTimeout(timers.debounceTimer);
      timers.debounceTimer = null;
    }
    if (timers.maxWaitTimer) {
      clearTimeout(timers.maxWaitTimer);
      timers.maxWaitTimer = null;
    }

    if (isCloudWritePaused()) {
      return;
    }

    const pending = pendingCloudSectionsRef.current;
    const sectionsToSave = { ...pending };
    pendingCloudSectionsRef.current = {
      meta: false,
      secrets: false,
      master: false,
      operations: false
    };

    if (
      !sectionsToSave.meta &&
      !sectionsToSave.secrets &&
      !sectionsToSave.master &&
      !sectionsToSave.operations
    ) {
      return;
    }

    const latestState = stateRef.current;
    if (
      setupStatus !== 'ready' ||
      !firebaseUser ||
      !cloudAuthRole ||
      !latestState.cloudOwnerUid
    ) {
      return;
    }

    refreshCloudSnapshotsBaseline(latestState);
    try {
      await saveWorkspaceSectionsToCloud(sectionsToSave, latestState, cloudAuthRole, {
        preserveLegacyOperationsKeys:
          cloudAuthRole !== 'ADMINISTRATOR' && hasLegacyOperationsRef.current
      });
    } catch (err) {
      if (isQuotaExceededError(err)) {
        tripCloudWriteQuotaPause();
        // Re-queue sections for retry if quota resets or user retries manually
        pendingCloudSectionsRef.current = {
          meta: pendingCloudSectionsRef.current.meta || Boolean(sectionsToSave.meta),
          secrets: pendingCloudSectionsRef.current.secrets || Boolean(sectionsToSave.secrets),
          master: pendingCloudSectionsRef.current.master || Boolean(sectionsToSave.master),
          operations: pendingCloudSectionsRef.current.operations || Boolean(sectionsToSave.operations)
        };
        return;
      }
      console.error('Cloud sync save error:', err);
    }
  }, [setupStatus, firebaseUser, cloudAuthRole, refreshCloudSnapshotsBaseline, stateRef]);

  const handleResetQuotaAndRetrySync = useCallback(async () => {
    if (isTestingQuotaReset) return;
    setIsTestingQuotaReset(true);
    try {
      resetCloudWriteQuotaPause();
      const conn = await testConnection({ forceEnableNetwork: true });
      if (!conn.ok) {
        if (conn.quotaExceeded) {
          showToast(
            'Kuota Firestore masih penuh. Operasional tetap aman tersimpan di perangkat lokal.',
            true
          );
        } else if (conn.offline) {
          showToast(
            'Koneksi ke Cloud Firestore masih offline. Periksa jaringan internet Anda.',
            true
          );
        } else {
          showToast(
            `Gagal menguji koneksi Cloud Firestore: ${conn.message || 'Coba lagi nanti.'}`,
            true
          );
        }
        return;
      }

      flushAutoCartonBuffer();
      const latestState = stateRef.current;
      const role = getEffectiveRoleForState(latestState);
      if (
        setupStatus === 'ready' &&
        firebaseUser &&
        cloudAuthRole &&
        latestState.cloudOwnerUid &&
        role.canWriteCloudOperations &&
        (cloudAuthRole === 'ADMINISTRATOR' || cloudAuthRole === 'OPERATOR')
      ) {
        pendingCloudSectionsRef.current.operations = true;
      }
      await flushPendingCloudWrites();
      if (isCloudWritePaused()) {
        showToast(
          'Kuota tulis harian Firestore masih penuh di server. Coba kembali setelah reset jam 15.00 WIB.',
          true
        );
      } else {
        showToast('Status kuota direset & koneksi Cloud Firestore aktif! Sinkronisasi cloud dilanjutkan.');
      }
    } finally {
      setIsTestingQuotaReset(false);
    }
  }, [
    isTestingQuotaReset,
    flushAutoCartonBuffer,
    getEffectiveRoleForState,
    setupStatus,
    firebaseUser,
    cloudAuthRole,
    flushPendingCloudWrites,
    showToast,
    stateRef
  ]);

  const performCompleteLogout = useCallback(
    async (toastMessage: string) => {
      // Prevent re-hydration or interval updates from keeping the dashboard mounted
      isLoggingOutRef.current = true;
      manualGoogleLoginInFlightRef.current = false;
      isApplyingRemoteRef.current = true;

      flushAutoCartonBuffer();

      // Capture any queued cloud sections & active user context BEFORE wiping local state
      const capturedSections = { ...pendingCloudSectionsRef.current };
      const capturedState = stateRef.current;
      const capturedRole = cloudAuthRole;
      const shouldFlushCaptured =
        setupStatus === 'ready' &&
        Boolean(auth.currentUser || firebaseUser) &&
        Boolean(capturedRole) &&
        Boolean(capturedState.cloudOwnerUid) &&
        (capturedSections.meta ||
          capturedSections.secrets ||
          capturedSections.master ||
          capturedSections.operations);

      // Tear down realtime listeners & pending write timers immediately
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      txUnsubRef.current?.();
      txUnsubRef.current = null;
      lineStatusUnsubRef.current?.();
      lineStatusUnsubRef.current = null;
      hasLegacyOperationsRef.current = false;
      pendingTxDocsRef.current.clear();
      autoCartonBufferRef.current.clear();

      if (cloudWriteTimersRef.current.debounceTimer) {
        clearTimeout(cloudWriteTimersRef.current.debounceTimer);
        cloudWriteTimersRef.current.debounceTimer = null;
      }
      if (cloudWriteTimersRef.current.maxWaitTimer) {
        clearTimeout(cloudWriteTimersRef.current.maxWaitTimer);
        cloudWriteTimersRef.current.maxWaitTimer = null;
      }
      pendingCloudSectionsRef.current = {
        meta: false,
        secrets: false,
        master: false,
        operations: false
      };

      try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('prodtrack_auth_mode');
        sessionStorage.removeItem('prodtrack_pending_google_role_v1');
        sessionStorage.removeItem('prodtrack_pending_drive_redirect');
      } catch {
        // ignore storage errors
      }

      // Explicitly reset URL state (remove hash and stale OAuth/query parameters) so re-auth works cleanly
      if (typeof window !== 'undefined') {
        try {
          const cleanPath = window.location.pathname || '/';
          if (window.location.search || window.location.hash) {
            window.history.replaceState(null, document.title || '', cleanPath);
          }
        } catch {
          // ignore history error
        }
        if (window.location.hash) {
          window.location.hash = '';
        }
        try {
          window.scrollTo(0, 0);
        } catch {
          // ignore scroll error
        }
      }

      // Close all open drawers/modals so clean login/signup screen appears unobstructed
      onResetUiOnLogoutRef.current?.();

      const currentTheme = stateRef.current.theme || 'midnight';
      const cleanBlank: AppState = {
        ...getCleanBlankState(),
        theme: currentTheme,
        isAuthenticated: false,
        currentTab: 'admin-portal',
        cloudWorkspaceId: undefined,
        cloudOwnerUid: undefined,
        currentAdminUser: null
      };

      // Synchronously overwrite stateRef & React states + increment authViewKey to force a full re-render to AuthPortalView
      stateRef.current = cleanBlank;
      cloudInitializedSnapshotsRef.current = null;
      setIsSyncingCloud(false);
      setLiveDashboardLineStatus(null);
      setCloudAuthRole(null);
      setCloudFactoryName(undefined);
      setAuthErrorBanner(null);
      setFirebaseUser(null);
      setState(() => ({ ...cleanBlank }));
      setSetupStatus(prev => (prev === 'needs_setup' ? 'needs_setup' : 'ready'));
      setAuthViewKey(prev => prev + 1);

      showToast(toastMessage);

      // Best-effort bounded cloud flush + Firebase Auth sign-out in background
      try {
        if (shouldFlushCaptured && capturedRole) {
          await Promise.race([
            saveWorkspaceSectionsToCloud(capturedSections, capturedState, capturedRole),
            new Promise<void>(resolve => setTimeout(resolve, 1200))
          ]).catch(() => {});
        }
        await signOutGoogleAuth().catch(() => {});
      } finally {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore storage errors
        }
        isLoggingOutRef.current = false;
        isApplyingRemoteRef.current = false;
      }
    },
    [cloudAuthRole, firebaseUser, flushAutoCartonBuffer, setupStatus, showToast, setState, stateRef]
  );

  const handleFirebaseSignOut = async () => {
    await performCompleteLogout(
      'Sesi akun Google & data perangkat telah diputus total. Silakan login atau daftar akun baru.'
    );
  };

  // Save state to localStorage + two-tier debounced/batched Cloud Firestore sync + BroadcastChannel line broadcast
  useEffect(() => {
    const localSaveTimer = setTimeout(() => {
      if (!state.isAuthenticated && !state.cloudOwnerUid) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        return;
      }
      saveStateToStorage(state);
    }, 200);

    const activeRunsNow = getActiveRunsArray(state);
    const currentLineDigest = computeDashboardLineDigest(
      state.master.productionLines || [],
      activeRunsNow
    );

    // Sync local line status & broadcast instantaneously to other tabs on the same browser
    if (
      !isApplyingRemoteRef.current &&
      cloudInitializedSnapshotsRef.current &&
      currentLineDigest !== cloudInitializedSnapshotsRef.current.lineDigest
    ) {
      cloudInitializedSnapshotsRef.current.lineDigest = currentLineDigest;
      const localSnapshot: DashboardLineStatusSnapshot = {
        workspaceId: state.cloudWorkspaceId,
        productionLines: state.master.productionLines || [],
        activeSkuRuns: activeRunsNow,
        activeSkuRun: activeRunsNow.find(r => r.isRunning) || activeRunsNow[0] || null,
        lastUpdatedAtIso: new Date().toISOString(),
        source: 'local',
        updatedByUid: firebaseUser?.uid
      };
      setLiveDashboardLineStatus(localSnapshot);
      publishDashboardLineStatusBroadcast({
        workspaceId: state.cloudWorkspaceId,
        productionLines: localSnapshot.productionLines || [],
        activeSkuRuns: localSnapshot.activeSkuRuns || [],
        updatedByUid: firebaseUser?.uid
      });
    }

    if (
      isApplyingRemoteRef.current ||
      setupStatus !== 'ready' ||
      !firebaseUser ||
      !cloudAuthRole ||
      !state.cloudOwnerUid ||
      !cloudInitializedSnapshotsRef.current
    ) {
      return () => clearTimeout(localSaveTimer);
    }

    const prevSnaps = cloudInitializedSnapshotsRef.current;
    const curMeta = serializeMeta(state);
    const curSecrets = serializeSecrets(state);
    const curMaster = serializeMaster(state);
    const curOps = serializeOperations(state);
    const curLineAvailSig = computeLineAvailabilitySignature(
      state.master.productionLines || [],
      activeRunsNow
    );
    const curCriticalOpsSig = serializeCriticalOperations(state);

    const resolvedSyncRole = getEffectiveRoleForState(state);
    const canWriteMaster = resolvedSyncRole.canWriteCloudMaster && cloudAuthRole === 'ADMINISTRATOR';
    const canWriteOps =
      resolvedSyncRole.canWriteCloudOperations &&
      (cloudAuthRole === 'ADMINISTRATOR' || cloudAuthRole === 'OPERATOR');

    const metaChanged = canWriteMaster && curMeta !== prevSnaps.meta;
    const secretsChanged = canWriteMaster && curSecrets !== prevSnaps.secrets;
    const masterChanged = canWriteMaster && curMaster !== prevSnaps.master;
    const opsChanged = canWriteOps && curOps !== prevSnaps.operations;

    if (!metaChanged && !secretsChanged && !masterChanged && !opsChanged) {
      return () => clearTimeout(localSaveTimer);
    }

    if (metaChanged) pendingCloudSectionsRef.current.meta = true;
    if (secretsChanged) pendingCloudSectionsRef.current.secrets = true;
    if (masterChanged) pendingCloudSectionsRef.current.master = true;
    if (opsChanged) pendingCloudSectionsRef.current.operations = true;

    if (isCloudWritePaused()) {
      return () => clearTimeout(localSaveTimer);
    }

    const isCriticalChange =
      metaChanged ||
      secretsChanged ||
      masterChanged ||
      curLineAvailSig !== prevSnaps.lineAvailSig ||
      curCriticalOpsSig !== prevSnaps.criticalOpsSig;

    // Only discrete operational transitions & physical transactions trigger saveWorkspaceSectionsToCloud
    const writeDebounceMs = isCriticalChange ? 800 : 2000;
    const writeMaxWaitMs = isCriticalChange ? 2000 : 4000;

    if (cloudWriteTimersRef.current.debounceTimer) {
      clearTimeout(cloudWriteTimersRef.current.debounceTimer);
    }
    cloudWriteTimersRef.current.debounceTimer = setTimeout(() => {
      flushPendingCloudWrites();
    }, writeDebounceMs);

    if (!cloudWriteTimersRef.current.maxWaitTimer) {
      cloudWriteTimersRef.current.maxWaitTimer = setTimeout(() => {
        flushPendingCloudWrites();
      }, writeMaxWaitMs);
    }

    return () => clearTimeout(localSaveTimer);
  }, [state, setupStatus, firebaseUser, cloudAuthRole, flushPendingCloudWrites, getEffectiveRoleForState]);

  useEffect(() => {
    const flushState = () => {
      if (!stateRef.current.isAuthenticated && !stateRef.current.cloudOwnerUid) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        return;
      }
      // Keep Auto [ running simulation strictly in localStorage; only flush already-queued explicit cloud writes
      saveStateToStorage(stateRef.current);
      void flushPendingCloudWrites();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushState();
      }
    };
    window.addEventListener('beforeunload', flushState);
    window.addEventListener('pagehide', flushState);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('beforeunload', flushState);
      window.removeEventListener('pagehide', flushState);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushPendingCloudWrites, stateRef]);

  return {
    setupStatus,
    cloudFactoryName,
    firebaseUser,
    cloudAuthRole,
    effectiveRole,
    getEffectiveRoleForState,
    isSyncingCloud,
    authErrorBanner,
    setAuthErrorBanner,
    cloudQuotaStatus,
    quotaBannerDismissed,
    setQuotaBannerDismissed,
    isTestingQuotaReset,
    liveDashboardLineStatus,
    authViewKey,
    isApplyingRemoteRef,
    pendingTxDocsRef,
    autoCartonBufferRef,
    markExplicitOperationsWrite,
    getActiveActorEmail,
    dispatchAppendTx,
    flushAutoCartonBuffer,
    handleLoginSuccess,
    runSetupCheck,
    handleCompleteFirstAdminSetup,
    handleGoogleCloudLogin,
    flushPendingCloudWrites,
    handleResetQuotaAndRetrySync,
    performCompleteLogout,
    handleFirebaseSignOut
  };
}
