import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState,
  Material,
  WIP,
  SKU,
  SkuWip,
  WipMaterial,
  WipRecipe,
  WipRecipeItem,
  MaterialRequest,
  MaterialReceipt,
  MaterialUsage,
  StorageLocation,
  TankState,
  WipProductionBatch,
  ProductionMachine,
  WipTank,
  CartonProductionLog,
  TankTransferLog,
  AdminGoogleUser,
  MachineChangeoverRecord,
  ChangeoverType,
  MachineChangeoverChecklist,
  ProductionStopLog,
  UserRole,
  RegisteredOperator,
  RegisteredManagement,
  ActiveSkuProductionRun,
  MaterialStockAdjustment,
  ProductionLine,
  ShiftNumber
} from './types';
import {
  loadStoredState,
  saveStateToStorage,
  getSampleState,
  getCleanBlankState,
  DEFAULT_STATE,
  STORAGE_KEY
} from './utils/storage';
import {
  auth,
  AuthErrorDetail,
  checkFirstTimeSetup,
  computeDashboardLineDigest,
  computeLineAvailabilitySignature,
  consumeGoogleRedirectResult,
  DashboardLineStatusSnapshot,
  formatGoogleAuthError,
  loadCloudWorkspaceDetailed,
  publishDashboardLineStatusBroadcast,
  registerAdministratorWorkspace,
  saveWorkspaceSectionsToCloud,
  signInWithGooglePopup,
  signOutGoogleAuth,
  startGoogleRedirectSignIn,
  subscribeAuthState,
  subscribeToDashboardLineStatus,
  subscribeToWorkspaceCloud
} from './utils/firebaseSync';
import {
  createSecurityAuditEntry,
  enforceHttpsTransport,
  hashPasswordSlow,
  normalizeEmail,
  sanitizeTextInput,
  validatePasswordStrength
} from './utils/security';
import type { User } from 'firebase/auth';
import { getMaterialCompositeKey } from './utils/materialParser';
import { getCurrentShift, getShiftPeriodInfo, getNextShiftNumber } from './utils/shifts';
import { getAllTanksForWip, checkRunHoldingTankAvailability } from './utils/skuTankHelper';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { StorageTankModal } from './components/StorageTankModal';
import { AdminModal } from './components/AdminModal';
import { ResetModal } from './components/ResetModal';
import { DashboardView } from './components/views/DashboardView';
import { PermintaanView } from './components/views/PermintaanView';
import { PenerimaanView } from './components/views/PenerimaanView';
import { PemakaianView } from './components/views/PemakaianView';
import { MasterBOMView } from './components/views/MasterBOMView';
import { BOMCalculatorView } from './components/views/BOMCalculatorView';
import { TankMonitoringView } from './components/views/TankMonitoringView';
import { ShiftSummaryView } from './components/views/ShiftSummaryView';
import { AuthPortalView } from './components/views/AuthPortalView';
import { AdminPortalView } from './components/views/AdminPortalView';
import { ShiftReportPdfModal } from './components/ShiftReportPdfModal';
import { WipCompletionAlarmModal } from './components/WipCompletionAlarmModal';
import { UserRoleSwitcherModal } from './components/UserRoleSwitcherModal';
import { UserManagementModal } from './components/UserManagementModal';
import { MaterialStockAdjustmentModal } from './components/MaterialStockAdjustmentModal';
import { playWipCompletionChime } from './utils/soundAlarm';
import { parseRequestSlipQrHash, RequestSlipDeepLinkData } from './utils/requestSlipPdf';
import { CheckCircle2, AlertCircle, FileText, Activity, Clock, Zap, Layers } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadStoredState());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Enforce HTTPS in production environments
  useEffect(() => {
    enforceHttpsTransport();
  }, []);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isTankModalOpen, setIsTankModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPdfReportModalOpen, setIsPdfReportModalOpen] = useState(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);
  const [stockAdjustmentPreselectedMatId, setStockAdjustmentPreselectedMatId] = useState<string | undefined>(undefined);
  const [alarmWipBatch, setAlarmWipBatch] = useState<WipProductionBatch | null>(null);
  const [preselectedRequestId, setPreselectedRequestId] = useState<string | undefined>(undefined);
  const [deepLinkSlip, setDeepLinkSlip] = useState<RequestSlipDeepLinkData | null>(null);

  const handleOpenStockAdjustment = (materialId?: string) => {
    setStockAdjustmentPreselectedMatId(materialId);
    setIsStockAdjustmentModalOpen(true);
  };

  // Toast Notification state
  const [toast, setToast] = useState<{ msg: string; isError: boolean; visible: boolean }>({
    msg: '',
    isError: false,
    visible: false
  });

  const showToast = useCallback((msg: string, isError = false) => {
    setToast({ msg, isError, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  // Cloud Setup & Cross-Device Firestore Sync State
  const [setupStatus, setSetupStatus] = useState<'checking' | 'needs_setup' | 'ready' | 'error'>('checking');
  const [cloudFactoryName, setCloudFactoryName] = useState<string | undefined>(undefined);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudAuthRole, setCloudAuthRole] = useState<UserRole | null>(null);
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const [authErrorBanner, setAuthErrorBanner] = useState<AuthErrorDetail | null>(null);
  const [liveDashboardLineStatus, setLiveDashboardLineStatus] =
    useState<DashboardLineStatusSnapshot | null>(null);

  const [authViewKey, setAuthViewKey] = useState(0);
  const isApplyingRemoteRef = useRef(false);
  const isLoggingOutRef = useRef(false);
  const manualGoogleLoginInFlightRef = useRef(false);
  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const lineStatusUnsubRef = useRef<(() => void) | null>(null);
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

  const serializeMeta = (s: AppState) =>
    JSON.stringify({
      factoryName: s.factoryName || '',
      theme: s.theme || 'midnight',
      adminGoogleEmails: s.adminGoogleEmails || [],
      registeredOperators: s.registeredOperators || [],
      registeredManagement: s.registeredManagement || []
    });

  const serializeSecrets = (s: AppState) => JSON.stringify({ adminPin: s.adminPin || '' });
  const serializeMaster = (s: AppState) => JSON.stringify(s.master);
  const serializeOperations = (s: AppState) =>
    JSON.stringify({
      transactions: s.transactions,
      activeSkuRuns: s.activeSkuRuns || [],
      tank: s.tank.isSimulationActive ? { ...s.tank, temp: 0 } : s.tank,
      lastShiftHandover: s.lastShiftHandover ?? null
    });

  // Structural/critical operations excluding high-frequency Auto [ simulation counter ticks
  const serializeCriticalOperations = (s: AppState) =>
    JSON.stringify({
      requests: s.transactions.requests,
      receipts: s.transactions.receipts,
      usages: s.transactions.usages,
      wipBatches: s.transactions.wipBatches,
      changeovers: s.transactions.changeovers,
      productionStops: s.transactions.productionStops,
      stockAdjustments: s.transactions.stockAdjustments,
      manualCartonsCount: (s.transactions.cartonProductions || []).filter(
        cp => !cp.notes?.startsWith('Auto [')
      ).length,
      manualTankLogsCount: (s.transactions.tankLogs || []).filter(
        tl => !tl.notes?.startsWith('Auto [')
      ).length,
      tankStatic: {
        maxCapacity: s.tank.maxCapacity,
        minTempTarget: s.tank.minTempTarget,
        maxTempTarget: s.tank.maxTempTarget,
        isSimulationActive: s.tank.isSimulationActive,
        temp: s.tank.isSimulationActive ? 0 : s.tank.temp
      },
      lastShiftHandover: s.lastShiftHandover ?? null
    });

  const getActiveRunsArray = (s: AppState) =>
    s.activeSkuRuns || (s.activeSkuRun ? [s.activeSkuRun] : []);

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

  // Sign In Success from AuthPortalView
  const handleLoginSuccess = useCallback(
    (
      role: UserRole,
      sessionData: { id: string; name: string; subtitle?: string; email?: string }
    ) => {
      isLoggingOutRef.current = false;
      isApplyingRemoteRef.current = false;
      setAuthErrorBanner(null);
      setState(prev => {
        const isNewAdmin = role === 'ADMINISTRATOR';
        const initialTab: AppState['currentTab'] =
          role === 'ADMINISTRATOR'
            ? 'admin-portal'
            : role === 'OPERATOR'
            ? 'pemakaian'
            : 'dashboard';

        const fallbackEmail = normalizeEmail(sessionData.email || auth.currentUser?.email || '');
        const restoredAdminUser =
          isNewAdmin && !prev.currentAdminUser && fallbackEmail
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

        const loginAudit = createSecurityAuditEntry({
          eventType: 'LOGIN_SUCCESS',
          userEmail: fallbackEmail || sessionData.name,
          role,
          notes: `Masuk ke workspace ${prev.factoryName || 'ProdTrack'}`
        });

        return {
          ...prev,
          isAuthenticated: true,
          currentUserRole: role,
          isAdmin: isNewAdmin,
          currentAdminUser: restoredAdminUser,
          currentTab: initialTab,
          currentSession: {
            role,
            id: sessionData.id,
            name: sessionData.name,
            subtitle: sessionData.subtitle,
            email: fallbackEmail || sessionData.email
          },
          securityLogs: [loginAudit, ...(prev.securityLogs || [])].slice(0, 100)
        };
      });
      showToast(`Selamat datang, ${sessionData.name} (${role})`);
    },
    [showToast]
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

      const effectiveRole: UserRole = intendedRole || loaded.cloudRole;

      setAuthErrorBanner(null);
      setCloudAuthRole(loaded.cloudRole);
      setCloudFactoryName(loaded.factoryName);
      isApplyingRemoteRef.current = true;
      setState(prev => {
        const next: AppState = {
          ...prev,
          ...loaded.statePatch
        };
        refreshCloudSnapshotsBaseline(next);
        return next;
      });
      setTimeout(() => {
        isApplyingRemoteRef.current = false;
      }, 200);

      handleLoginSuccess(effectiveRole, {
        id: loaded.matchedProfileId || user.uid,
        name: loaded.matchedProfileName || user.displayName || user.email || 'User',
        email: user.email || undefined,
        subtitle: loaded.matchedProfileSubtitle || `${effectiveRole} • ${loaded.factoryName}`
      });
      return true;
    },
    [handleLoginSuccess, refreshCloudSnapshotsBaseline, showToast]
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
  }, []);

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
        } catch (err: any) {
          const detail = (err as any)?.authDetail || formatGoogleAuthError(err);
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
        lineStatusUnsubRef.current?.();
        lineStatusUnsubRef.current = null;
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
          isApplyingRemoteRef.current = true;
          setState(prev => {
            const next: AppState = {
              ...prev,
              ...loaded.statePatch
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
  }, [setupStatus, firebaseUser, refreshCloudSnapshotsBaseline]);

  // Attach debounced/batched real-time Firestore listeners for multi-device collaboration (isolated per workspaceId)
  useEffect(() => {
    if (setupStatus !== 'ready' || !firebaseUser || !cloudAuthRole) return;
    const unsub = subscribeToWorkspaceCloud(
      cloudAuthRole,
      patch => {
        isApplyingRemoteRef.current = true;
        setState(prev => {
          const next: AppState = {
            ...prev,
            ...patch
          };
          refreshCloudSnapshotsBaseline(next);
          return next;
        });
        setTimeout(() => {
          isApplyingRemoteRef.current = false;
        }, 180);
      },
      err => {
        console.error('Realtime sync warning:', err);
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
  }, [setupStatus, firebaseUser, cloudAuthRole, state.cloudWorkspaceId, refreshCloudSnapshotsBaseline]);

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
          const currentDigest = computeDashboardLineDigest(
            prev.master.productionLines || [],
            prevRuns
          );
          const nextLines =
            snapshot.productionLines && snapshot.productionLines.length > 0
              ? snapshot.productionLines
              : prev.master.productionLines;
          const nextRuns =
            snapshot.activeSkuRuns !== undefined ? snapshot.activeSkuRuns : prevRuns;
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
        console.error('Dashboard line status realtime warning:', err);
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
  }, [setupStatus, firebaseUser, cloudAuthRole, state.cloudWorkspaceId, refreshCloudSnapshotsBaseline]);

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
      } catch (err: any) {
        const detail = (err as any)?.authDetail || formatGoogleAuthError(err);
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
      } catch (err: any) {
        const detail = (err as any)?.authDetail || formatGoogleAuthError(err);
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
    } catch (err: any) {
      const detail = (err as any)?.authDetail || formatGoogleAuthError(err);
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
      await saveWorkspaceSectionsToCloud(sectionsToSave, latestState, cloudAuthRole);
    } catch (err) {
      console.error('Cloud sync save error:', err);
    }
  }, [setupStatus, firebaseUser, cloudAuthRole, refreshCloudSnapshotsBaseline]);

  const performCompleteLogout = useCallback(async (toastMessage: string) => {
    // Prevent re-hydration or interval updates from keeping the dashboard mounted
    isLoggingOutRef.current = true;
    manualGoogleLoginInFlightRef.current = false;
    isApplyingRemoteRef.current = true;

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
    lineStatusUnsubRef.current?.();
    lineStatusUnsubRef.current = null;

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
    setIsSidebarOpen(false);
    setIsAdminModalOpen(false);
    setIsTankModalOpen(false);
    setIsResetModalOpen(false);
    setIsPdfReportModalOpen(false);
    setIsRoleSwitcherOpen(false);
    setIsUserManagementOpen(false);
    setIsStockAdjustmentModalOpen(false);
    setAlarmWipBatch(null);
    setPreselectedRequestId(undefined);
    setDeepLinkSlip(null);

    const currentTheme = stateRef.current.theme || 'midnight';
    const cleanBlank: AppState = {
      ...getCleanBlankState(),
      theme: currentTheme,
      isAuthenticated: false,
      isAdmin: false,
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
  }, [cloudAuthRole, firebaseUser, setupStatus, showToast]);

  const handleFirebaseSignOut = async () => {
    await performCompleteLogout('Sesi akun Google & data perangkat telah diputus total. Silakan login atau daftar akun baru.');
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

    const metaChanged = curMeta !== prevSnaps.meta;
    const secretsChanged = curSecrets !== prevSnaps.secrets;
    const masterChanged = curMaster !== prevSnaps.master;
    const opsChanged = curOps !== prevSnaps.operations;

    if (!metaChanged && !secretsChanged && !masterChanged && !opsChanged) {
      return () => clearTimeout(localSaveTimer);
    }

    if (metaChanged) pendingCloudSectionsRef.current.meta = true;
    if (secretsChanged) pendingCloudSectionsRef.current.secrets = true;
    if (masterChanged) pendingCloudSectionsRef.current.master = true;
    if (opsChanged) pendingCloudSectionsRef.current.operations = true;

    const isCriticalChange =
      metaChanged ||
      secretsChanged ||
      curLineAvailSig !== prevSnaps.lineAvailSig ||
      curCriticalOpsSig !== prevSnaps.criticalOpsSig;

    // Critical/discrete edits flush rapidly (~450ms); high-frequency simulation ticks batch every 2.5s–3.5s
    const writeDebounceMs = isCriticalChange ? 450 : 2500;
    const writeMaxWaitMs = isCriticalChange ? 900 : 3500;

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
  }, [state, setupStatus, firebaseUser, cloudAuthRole, flushPendingCloudWrites]);

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
  }, [flushPendingCloudWrites]);

  // Sync theme with HTML document element (Midnight vs Daylight)
  useEffect(() => {
    const isDaylight = state.theme === 'daylight' || state.theme === 'light';
    const root = document.documentElement;
    if (isDaylight) {
      root.classList.add('theme-daylight');
      root.classList.remove('theme-midnight');
      root.setAttribute('data-theme', 'daylight');
    } else {
      root.classList.add('theme-midnight');
      root.classList.remove('theme-daylight');
      root.setAttribute('data-theme', 'midnight');
    }
  }, [state.theme]);

  // Toggle between Midnight (dark) and Daylight (light)
  const handleToggleTheme = () => {
    const isCurrentlyDaylight = state.theme === 'daylight' || state.theme === 'light';
    const newTheme = isCurrentlyDaylight ? 'midnight' : 'daylight';
    setState(prev => ({ ...prev, theme: newTheme }));
    showToast(
      !isCurrentlyDaylight
        ? 'Beralih ke Tema Daylight (Tampilan Putih Terang Pabrik)'
        : 'Beralih ke Tema Midnight (Tampilan Gelap Industrial)'
    );
  };

  // Periodic simulated temperature sensor reading for Storage Tank Liquid (every 4 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setState(prev => {
        if (!prev.isAuthenticated || !prev.tank.isSimulationActive) return prev;
        const delta = (Math.random() - 0.5) * 0.6;
        let newTemp = prev.tank.temp + delta;
        // Keep within 44.0 - 56.0 range
        newTemp = Math.min(56.0, Math.max(44.0, newTemp));
        return {
          ...prev,
          tank: {
            ...prev.tank,
            temp: parseFloat(newTemp.toFixed(1))
          }
        };
      });
    }, 4000);

    return () => clearInterval(timer);
  }, []);

  // Handle URL hash navigation for opening modules in new tabs (#tab=...) and QR Slip deep-links
  useEffect(() => {
    const handleHashChange = () => {
      if (!stateRef.current.isAuthenticated) return;
      const hash = window.location.hash;
      if (!hash || !hash.startsWith('#')) return;

      const parsedSlip = parseRequestSlipQrHash(hash);
      if (parsedSlip) {
        setDeepLinkSlip(parsedSlip);
        setState(prev => ({ ...prev, currentTab: 'permintaan' }));
        return;
      }

      if (hash.startsWith('#tab=')) {
        const params = new URLSearchParams(hash.slice(1));
        const tab = params.get('tab') as AppState['currentTab'] | null;
        const validTabs: AppState['currentTab'][] = [
          'admin-portal',
          'dashboard',
          'tank-monitoring',
          'shift-summary',
          'permintaan',
          'penerimaan',
          'pemakaian',
          'master',
          'bom-calculator',
          'reports'
        ];
        if (tab && validTabs.includes(tab)) {
          if (tab === 'reports') {
            setIsPdfReportModalOpen(true);
          } else {
            setState(prev => ({ ...prev, currentTab: tab }));
          }
        }
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [state.isAuthenticated]);

  // Switch tabs with role-based access control
  const handleSwitchTab = (tab: AppState['currentTab']) => {
    if (tab === 'reports') {
      setIsPdfReportModalOpen(true);
      return;
    }
    const role = stateRef.current.currentUserRole;
    if (role === 'MANAGEMENT' && tab !== 'dashboard' && tab !== 'tank-monitoring' && tab !== 'shift-summary') {
      showToast('Akses dibatasi: User Management hanya memiliki izin melihat Dashboard, Tangki WIP, dan Ringkasan Shift', true);
      return;
    }
    if (role !== 'ADMINISTRATOR' && (tab === 'master' || tab === 'admin-portal')) {
      showToast('Akses dibatasi: Portal dan Master BOM hanya dapat diakses oleh Administrator', true);
      return;
    }
    setState(prev => ({ ...prev, currentTab: tab }));
    window.location.hash = `tab=${tab}`;
  };

  // Full Logout back to clean AuthPortalView (Sign Up / Login options for any user)
  const handleSignOut = async () => {
    await performCompleteLogout('Berhasil logout total. Anda dapat masuk ke akun lain atau mendaftar akun baru.');
  };

  // Role switching (Administrator, Operator, Management)
  const handleSelectRole = (
    role: UserRole,
    sessionData?: { id: string; name: string; subtitle?: string; email?: string }
  ) => {
    if (cloudAuthRole && cloudAuthRole !== 'ADMINISTRATOR' && role === 'ADMINISTRATOR') {
      showToast('Akses ditolak: Akun Google Cloud Anda bukan Administrator.', true);
      return;
    }
    if (cloudAuthRole === 'MANAGEMENT' && role === 'OPERATOR') {
      showToast('Akses ditolak: Akun Management hanya memiliki izin melihat (Read-Only).', true);
      return;
    }
    setState(prev => {
      const isNewAdmin = role === 'ADMINISTRATOR';
      let nextTab = prev.currentTab;

      // Management is strictly restricted to dashboard, tank-monitoring, and shift-summary
      if (role === 'MANAGEMENT' && nextTab !== 'dashboard' && nextTab !== 'tank-monitoring' && nextTab !== 'shift-summary') {
        nextTab = 'dashboard';
      }
      // Non-admins cannot stay in Master BOM
      if (!isNewAdmin && nextTab === 'master') {
        nextTab = 'dashboard';
      }

      return {
        ...prev,
        currentUserRole: role,
        isAdmin: isNewAdmin,
        currentTab: nextTab,
        currentSession: sessionData
          ? {
              role,
              id: sessionData.id,
              name: sessionData.name,
              subtitle: sessionData.subtitle,
              email: sessionData.email
            }
          : {
              role,
              id: role.toLowerCase(),
              name:
                role === 'ADMINISTRATOR'
                  ? 'Administrator MES'
                  : role === 'OPERATOR'
                  ? 'Operator Lini'
                  : 'Executive Management',
              subtitle:
                role === 'ADMINISTRATOR'
                  ? 'Kewenangan Penuh Master & Akses'
                  : role === 'OPERATOR'
                  ? 'Operasi & Pencatatan Lini'
                  : 'Pemantauan Read-Only'
            }
      };
    });
  };

  // Operator Roster Management (Administrator only)
  const handleAddOperator = (opData: Omit<RegisteredOperator, 'id' | 'registeredAt'>) => {
    const cleanEmail = opData.email ? normalizeEmail(opData.email) : undefined;
    const newOp: RegisteredOperator = {
      ...opData,
      name: sanitizeTextInput(opData.name, 120),
      nik: sanitizeTextInput(opData.nik, 40),
      email: cleanEmail || undefined,
      notes: opData.notes ? sanitizeTextInput(opData.notes, 200) : undefined,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      registeredAt: new Date().toISOString()
    };
    const audit = createSecurityAuditEntry({
      eventType: 'REGISTER_OPERATOR',
      userEmail: cleanEmail || newOp.nik,
      role: 'OPERATOR',
      notes: `Operator terdaftar: ${newOp.name} (${newOp.assignedLine})`
    });
    setState(prev => ({
      ...prev,
      registeredOperators: [newOp, ...(prev.registeredOperators || [])],
      securityLogs: [audit, ...(prev.securityLogs || [])].slice(0, 100)
    }));
    showToast(`Operator "${newOp.name}" berhasil didaftarkan`);
  };

  const handleUpdateOperator = (id: string, updates: Partial<RegisteredOperator>) => {
    const cleanUpdates: Partial<RegisteredOperator> = {
      ...updates,
      ...(updates.name !== undefined ? { name: sanitizeTextInput(updates.name, 120) } : {}),
      ...(updates.email !== undefined
        ? { email: updates.email ? normalizeEmail(updates.email) : undefined }
        : {})
    };
    setState(prev => ({
      ...prev,
      registeredOperators: (prev.registeredOperators || []).map(op =>
        op.id === id ? { ...op, ...cleanUpdates } : op
      )
    }));
    showToast('Data operator berhasil diperbarui');
  };

  const handleDeleteOperator = (id: string) => {
    setState(prev => ({
      ...prev,
      registeredOperators: (prev.registeredOperators || []).filter(op => op.id !== id)
    }));
    showToast('Operator berhasil dihapus');
  };

  // Management Access Control (Administrator only)
  const handleAddManagement = (mgtData: Omit<RegisteredManagement, 'id' | 'registeredAt'>) => {
    const cleanEmail = normalizeEmail(mgtData.email || '');
    const newMgt: RegisteredManagement = {
      ...mgtData,
      name: sanitizeTextInput(mgtData.name, 120),
      email: cleanEmail,
      title: sanitizeTextInput(mgtData.title, 100),
      department: sanitizeTextInput(mgtData.department, 100),
      id: `mgt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      registeredAt: new Date().toISOString()
    };
    const audit = createSecurityAuditEntry({
      eventType: 'REGISTER_OPERATOR',
      userEmail: cleanEmail || newMgt.name,
      role: 'MANAGEMENT',
      notes: `Akun Management terdaftar: ${newMgt.name} (${newMgt.title})`
    });
    setState(prev => ({
      ...prev,
      registeredManagement: [newMgt, ...(prev.registeredManagement || [])],
      securityLogs: [audit, ...(prev.securityLogs || [])].slice(0, 100)
    }));
    showToast(`Management "${newMgt.name}" berhasil didaftarkan`);
  };

  const handleToggleManagementAccess = (id: string, hasAccess: boolean) => {
    setState(prev => ({
      ...prev,
      registeredManagement: (prev.registeredManagement || []).map(mgt =>
        mgt.id === id ? { ...mgt, hasViewAccess: hasAccess } : mgt
      )
    }));
    showToast(`Izin akses melihat dashboard ${hasAccess ? 'diberikan' : 'dicabut'}`);
  };

  const handleDeleteManagement = (id: string) => {
    setState(prev => ({
      ...prev,
      registeredManagement: (prev.registeredManagement || []).filter(mgt => mgt.id !== id)
    }));
    showToast('User management berhasil dihapus');
  };

  // Tank update
  const handleUpdateTank = (updated: Partial<TankState>) => {
    setState(prev => ({
      ...prev,
      tank: {
        ...prev.tank,
        ...updated
      }
    }));
  };

  // Admin authentication
  const handleAdminLogin = (googleUser?: AdminGoogleUser) => {
    setState(prev => ({
      ...prev,
      isAdmin: true,
      currentUserRole: 'ADMINISTRATOR',
      currentAdminUser: googleUser || null
    }));
  };

  const handleAdminLogout = () => {
    setState(prev => ({
      ...prev,
      isAdmin: false,
      currentUserRole: 'OPERATOR',
      currentAdminUser: null
    }));
  };

  const handleChangePin = async (newPin: string) => {
    const check = validatePasswordStrength(newPin);
    if (!check.isValid) {
      showToast(check.message || 'PIN/Password minimal 8 karakter.', true);
      return;
    }
    const hashed = await hashPasswordSlow(newPin);
    const audit = createSecurityAuditEntry({
      eventType: 'PASSWORD_CHANGE',
      userEmail: stateRef.current.currentAdminUser?.email || auth.currentUser?.email || 'admin',
      role: 'ADMINISTRATOR',
      notes: 'PIN/Password Administrator diperbarui (PBKDF2-SHA256)'
    });
    setState(prev => ({
      ...prev,
      adminPin: hashed,
      securityLogs: [audit, ...(prev.securityLogs || [])].slice(0, 100)
    }));
  };

  const handleAddAdminEmail = (email: string) => {
    const cleanEmail = normalizeEmail(email);
    setState(prev => {
      const current = prev.adminGoogleEmails || [];
      if (current.includes(cleanEmail)) return prev;
      return {
        ...prev,
        adminGoogleEmails: [...current, cleanEmail]
      };
    });
  };

  const handleRemoveAdminEmail = (email: string) => {
    const cleanEmail = normalizeEmail(email);
    const activeEmail = normalizeEmail(firebaseUser?.email || '');
    if (cleanEmail === 'luasdzatzali@gmail.com' || (activeEmail && cleanEmail === activeEmail)) {
      showToast('Email Administrator utama / aktif tidak dapat dihapus.', true);
      return;
    }
    setState(prev => ({
      ...prev,
      adminGoogleEmails: (prev.adminGoogleEmails || []).filter(
        e => normalizeEmail(e) !== cleanEmail
      )
    }));
  };

  // Full Reset to empty
  // 1. Reset All Data
  const handleResetAll = () => {
    setState(prev => ({
      ...DEFAULT_STATE,
      factoryName: prev.factoryName,
      cloudWorkspaceId: prev.cloudWorkspaceId,
      cloudOwnerUid: prev.cloudOwnerUid,
      isAuthenticated: prev.isAuthenticated,
      isAdmin: prev.isAdmin,
      currentUserRole: prev.currentUserRole,
      currentSession: prev.currentSession,
      adminPin: prev.adminPin,
      adminGoogleEmails: prev.adminGoogleEmails,
      currentAdminUser: prev.currentAdminUser,
      registeredOperators: prev.registeredOperators,
      registeredManagement: prev.registeredManagement,
      tank: {
        ...DEFAULT_STATE.tank,
        level: 0.0
      }
    }));
    showToast('Kategori 1: Semua data sistem (Master & Transaksi) berhasil di-reset bersih');
  };

  // 2. Reset Master Data
  const handleResetMasterData = () => {
    setState(prev => ({
      ...prev,
      master: {
        materials: [],
        wips: [],
        skus: [],
        skuWips: [],
        wipMats: [],
        recipes: [],
        machines: [],
        tanks: [],
        productionLines: prev.master.productionLines || []
      }
    }));
    showToast('Kategori 2: Master Data (Material, WIP, SKU, Mesin, Tangki & BOM) berhasil di-reset');
  };

  // 3. Reset Data Stock Material Diterima (CK, WINEROTO & Storage Tank Liquid)
  const handleResetStockReceipts = () => {
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        receipts: []
      },
      tank: {
        ...prev.tank,
        level: 0.0
      }
    }));
    showToast('Kategori 3: Data stok diterima di CK, WINEROTO, dan Tangki Liquid berhasil di-reset');
  };

  // 4. Reset Data Pemesanan RM (Permintaan Material)
  const handleResetRequests = () => {
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        requests: []
      }
    }));
    showToast('Kategori 4: Data pemesanan / permintaan bahan baku (RM) berhasil di-reset');
  };

  // 5. Reset Data Pemakaian Material & WIP
  const handleResetUsages = () => {
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        usages: [],
        wipBatches: []
      }
    }));
    showToast('Kategori 5: Data pemakaian bahan baku dan perintah kerja batch WIP berhasil di-reset');
  };

  // Load sample dataset
  const handleLoadSampleData = () => {
    const sample = getSampleState();
    setState(prev => ({
      ...sample,
      factoryName: prev.factoryName || sample.factoryName,
      cloudOwnerUid: prev.cloudOwnerUid,
      isAuthenticated: prev.isAuthenticated,
      isAdmin: prev.isAdmin,
      currentUserRole: prev.currentUserRole,
      currentSession: prev.currentSession,
      adminPin: prev.adminPin,
      adminGoogleEmails: prev.adminGoogleEmails?.length ? prev.adminGoogleEmails : sample.adminGoogleEmails,
      currentAdminUser: prev.currentAdminUser,
      registeredOperators: prev.registeredOperators?.length ? prev.registeredOperators : sample.registeredOperators,
      registeredManagement: prev.registeredManagement?.length ? prev.registeredManagement : sample.registeredManagement
    }));
    showToast('Data contoh industri berhasil dimuat ke sistem');
  };

  // Export JSON backup
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `prodtrack_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Cadangan data JSON berhasil diunduh');
  };

  // Stock transfer between warehouse locations
  const handleTransferStock = (
    materialId: string,
    from: StorageLocation,
    to: StorageLocation,
    qty: number
  ) => {
    const now = new Date().toISOString().slice(0, 10);
    const transferId = Date.now().toString();

    // Record as usage from origin and receipt at destination
    const newUsage: MaterialUsage = {
      id: `usg_tf_${transferId}`,
      usageNumber: `TF-OUT-${transferId.slice(-4)}`,
      date: now,
      skuId: state.master.skus[0]?.id || 'SKU_TRANSFER',
      wipId: state.master.wips[0]?.id || 'WIP_TRANSFER',
      materialId,
      qty,
      batch: 1,
      usageQty: qty,
      sourceLocation: from,
      operatorName: 'Sistem Mutasi Gudang',
      notes: `Transfer stok dari ${from} ke ${to}`
    };

    const newReceipt: MaterialReceipt = {
      id: `rec_tf_${transferId}`,
      receiptNumber: `TF-IN-${transferId.slice(-4)}`,
      date: now,
      materialId,
      requestedQty: qty,
      receivedQty: qty,
      location: to,
      batchLotNumber: `TF-${transferId.slice(-4)}`,
      status: 'Received',
      notes: `Diterima dari mutasi gudang ${from}`
    };

    setState(prev => {
      let updatedTankLevel = prev.tank.level;
      if (from === 'STORAGE_TANK') {
        updatedTankLevel = Math.max(0, updatedTankLevel - qty);
      }
      if (to === 'STORAGE_TANK') {
        updatedTankLevel = Math.min(prev.tank.maxCapacity, updatedTankLevel + qty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: [newUsage, ...prev.transactions.usages],
          receipts: [newReceipt, ...prev.transactions.receipts]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // Add Material
  const handleAddMaterial = (matData: Omit<Material, 'id'>) => {
    const newMat: Material = {
      ...matData,
      id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      code: matData.code?.trim() || `MAT-${String(state.master.materials.length + 1).padStart(3, '0')}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: [...prev.master.materials, newMat]
      }
    }));
  };

  // Delete Material
  const handleDeleteMaterial = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: prev.master.materials.filter(m => m.id !== id),
        wipMats: prev.master.wipMats.filter(wm => wm.materialId !== id),
        recipes: (prev.master.recipes || []).map(r => {
          const filteredItems = r.items.filter(it => it.materialId !== id);
          return {
            ...r,
            items: filteredItems,
            totalWeightKg: filteredItems.reduce((sum, it) => sum + it.amountKg, 0)
          };
        })
      }
    }));
    showToast('Material berhasil dihapus');
  };

  // Adjust Stock Material Awal (Akses Khusus Administrator)
  const handleAdjustMaterialStock = (
    materialId: string,
    adjustments: {
      initialStockCk: number;
      initialStockWineroto: number;
      initialStockTank: number;
      reason: string;
      notes?: string;
    }
  ) => {
    if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan adjust saldo awal material', true);
      return;
    }

    setState(prev => {
      const targetMat = prev.master.materials.find(m => m.id === materialId);
      if (!targetMat) return prev;

      const prevCk = Number(targetMat.initialStockCk ?? 0);
      const prevWineroto = Number(targetMat.initialStockWineroto ?? 0);
      const prevTank = Number(targetMat.initialStockTank ?? 0);
      const prevTotal = prevCk + prevWineroto + prevTank;

      const newCk = Math.max(0, adjustments.initialStockCk);
      const newWineroto = Math.max(0, adjustments.initialStockWineroto);
      const newTank = Math.max(0, adjustments.initialStockTank);
      const newTotal = newCk + newWineroto + newTank;
      const deltaTotal = newTotal - prevTotal;

      const updatedMaterials = prev.master.materials.map(m => {
        if (m.id !== materialId) return m;
        return {
          ...m,
          initialStockCk: newCk,
          initialStockWineroto: newWineroto,
          initialStockTank: newTank
        };
      });

      const now = new Date();
      const adjRecord: MaterialStockAdjustment = {
        id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        adjustmentNumber: `ADJ-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String((prev.transactions.stockAdjustments?.length || 0) + 1).padStart(3, '0')}`,
        date: now.toISOString().slice(0, 10),
        timestamp: now.toISOString(),
        materialId: targetMat.id,
        materialName: targetMat.name,
        materialCode: targetMat.code,
        location: (newCk !== prevCk ? 'CK' : (newWineroto !== prevWineroto ? 'WINEROTO' : (newTank !== prevTank ? 'STORAGE_TANK' : 'ALL'))),
        previousInitialStockKg: prevTotal,
        newInitialStockKg: newTotal,
        deltaKg: deltaTotal,
        previousStockCk: prevCk,
        newStockCk: newCk,
        previousStockWineroto: prevWineroto,
        newStockWineroto: newWineroto,
        previousStockTank: prevTank,
        newStockTank: newTank,
        reason: adjustments.reason || 'Penyesuaian Saldo Awal Material oleh Administrator',
        adjustedBy: prev.currentSession?.name || 'Administrator',
        notes: adjustments.notes
      };

      return {
        ...prev,
        master: {
          ...prev.master,
          materials: updatedMaterials
        },
        transactions: {
          ...prev.transactions,
          stockAdjustments: [adjRecord, ...(prev.transactions.stockAdjustments || [])]
        }
      };
    });

    showToast(`Saldo awal material berhasil disesuaikan oleh Administrator`);
  };

  // Import Materials (Internal Storage & Google Drive Batch Loader)
  // Aturan Master Material: 1 Kode material dapat memiliki sumber pemesanan (GDRM / Formulasi)
  // dan berat material per kemasan yang berbeda (e.g. 15 kg, 25 kg, 50 kg).
  // Saat proses import, walaupun kode material sama, tapi sumber dan berat per kemasan berbeda,
  // JANGAN ADA YANG DIHILANGKAN.
  const handleImportMaterials = (newMaterials: Material[], mode: 'replace' | 'append') => {
    setState(prev => {
      let finalMaterials: Material[] = [];

      if (mode === 'replace') {
        // Gantikan database dengan daftar baru, tetapi pastikan jika dalam file baru ada variasi kode yang sama
        // dengan sumber/berat berbeda, seluruhnya tetap disimpan
        const map = new Map<string, Material>();
        newMaterials.forEach((m, idx) => {
          const key = getMaterialCompositeKey(m);
          const id = m.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...m, id });
        });
        finalMaterials = Array.from(map.values());
      } else {
        // Mode Gabungkan (Append):
        // Memakai composite key: Kode/Nama + Sumber + Berat per kemasan + Kemasan.
        // Walaupun kode material sama, tapi sumber dan berat per kemasan berbeda, jangan ada yg dihilangkan.
        const map = new Map<string, Material>();
        prev.master.materials.forEach(m => {
          const key = getMaterialCompositeKey(m);
          map.set(key, m);
        });
        newMaterials.forEach((m, idx) => {
          const key = getMaterialCompositeKey(m);
          const existing = map.get(key);
          if (existing) {
            // Update item yang sama persis tanpa menghapus ID
            map.set(key, { ...existing, ...m, id: existing.id });
          } else {
            const id = m.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
            map.set(key, { ...m, id });
          }
        });
        finalMaterials = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          materials: finalMaterials
        }
      };
    });
  };

  // Add WIP
  const handleAddWip = (wipData: Omit<WIP, 'id'>) => {
    const newWip: WIP = {
      ...wipData,
      id: `wip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: [...prev.master.wips, newWip]
      }
    }));
  };

  // Delete WIP
  const handleDeleteWip = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: prev.master.wips.filter(w => w.id !== id),
        skuWips: prev.master.skuWips.filter(sw => sw.wipId !== id),
        wipMats: prev.master.wipMats.filter(wm => wm.wipId !== id),
        recipes: (prev.master.recipes || []).filter(r => r.wipId !== id)
      }
    }));
    showToast('WIP berhasil dihapus');
  };

  // Update WIP (Multi-mesin, nama, bobot batch)
  const handleUpdateWip = (wipId: string, updates: Partial<WIP>) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: prev.master.wips.map(w => (w.id === wipId ? { ...w, ...updates } : w))
      }
    }));
  };

  // Add SKU
  const handleAddSku = (skuData: Omit<SKU, 'id'>) => {
    const newSku: SKU = {
      ...skuData,
      id: `sku_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: [...prev.master.skus, newSku]
      }
    }));
  };

  // Delete SKU
  const handleDeleteSku = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: prev.master.skus.filter(s => s.id !== id),
        skuWips: prev.master.skuWips.filter(sw => sw.skuId !== id)
      }
    }));
    showToast('SKU berhasil dihapus');
  };

  // Import SKUs (Internal Storage & Google Drive Batch Loader)
  const handleImportSkus = (newSkus: SKU[], mode: 'replace' | 'append') => {
    let finalSkus: SKU[] = [];

    if (mode === 'replace') {
      const map = new Map<string, SKU>();
      newSkus.forEach((s, idx) => {
        const key = (s.code || s.name).trim().toLowerCase();
        const id = s.id || `sku_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        map.set(key, { ...s, id });
      });
      finalSkus = Array.from(map.values());
    } else {
      const map = new Map<string, SKU>();
      state.master.skus.forEach(s => {
        const key = (s.code || s.name).trim().toLowerCase();
        map.set(key, s);
      });
      newSkus.forEach((s, idx) => {
        const key = (s.code || s.name).trim().toLowerCase();
        const existing = map.get(key);
        if (existing) {
          map.set(key, { ...existing, ...s, id: existing.id });
        } else {
          const id = s.id || `sku_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...s, id });
        }
      });
      finalSkus = Array.from(map.values());
    }

    const kiteCount = finalSkus.filter(s => s.isKite).length;
    const domCount = finalSkus.filter(s => !s.isKite).length;

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: finalSkus
      }
    }));

    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master SKU (${finalSkus.length} SKU: ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
        : `Berhasil mengimpor & memperbarui master SKU (${newSkus.length} SKU diproses: total ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
    );
  };

  // Add SkuWip link
  const handleAddSkuWip = (swData: Omit<SkuWip, 'id'>) => {
    const newSW: SkuWip = {
      ...swData,
      id: `sw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: [...prev.master.skuWips, newSW]
      }
    }));
  };

  // Delete SkuWip link
  const handleDeleteSkuWip = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: prev.master.skuWips.filter(sw => sw.id !== id)
      }
    }));
    showToast('Relasi WIP ke SKU dihapus');
  };

  // Import SkuWip links (Local File & Google Drive Batch Loader)
  const handleImportSkuWips = (newSkuWips: SkuWip[], mode: 'replace' | 'append') => {
    let finalSkuWips: SkuWip[] = [];

    if (mode === 'replace') {
      const map = new Map<string, SkuWip>();
      newSkuWips.forEach((sw, idx) => {
        const key = `${sw.skuId}__${sw.wipId}`;
        const id = sw.id || `sw_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        map.set(key, { ...sw, id });
      });
      finalSkuWips = Array.from(map.values());
    } else {
      const map = new Map<string, SkuWip>();
      state.master.skuWips.forEach(sw => {
        map.set(`${sw.skuId}__${sw.wipId}`, sw);
      });
      newSkuWips.forEach((sw, idx) => {
        const key = `${sw.skuId}__${sw.wipId}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            kgWipPerCartonSku: sw.kgWipPerCartonSku
          });
        } else {
          const id = sw.id || `sw_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...sw, id });
        }
      });
      finalSkuWips = Array.from(map.values());
    }

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: finalSkuWips
      }
    }));

    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh relasi WIP per karton SKU (${finalSkuWips.length} relasi)`
        : `Berhasil mengimpor & memperbarui ${newSkuWips.length} relasi WIP per karton SKU (Total: ${finalSkuWips.length})`
    );
  };

  // Add WipMat link
  const handleAddWipMat = (wmData: Omit<WipMaterial, 'id'>) => {
    const newWM: WipMaterial = {
      ...wmData,
      id: `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wipMats: [...prev.master.wipMats, newWM]
      }
    }));
  };

  // Delete WipMat link
  const handleDeleteWipMat = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wipMats: prev.master.wipMats.filter(wm => wm.materialId !== id)
      }
    }));
    showToast('Relasi Material ke WIP dihapus');
  };

  // Recipe Management (Resep Berdasarkan Material untuk WIP)
  const handleAddRecipe = (recipeData: Omit<WipRecipe, 'id' | 'createdAt'>) => {
    const newRecipeId = `rcp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const initialItems = (recipeData.items || []).map(it => ({
      ...it,
      id: it.id || `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    }));
    const totalWeightKg = initialItems.reduce((sum, it) => sum + (it.amountKg || 0), 0);

    const newRecipe: WipRecipe = {
      ...recipeData,
      id: newRecipeId,
      items: initialItems,
      totalWeightKg: totalWeightKg > 0 ? totalWeightKg : (recipeData.totalWeightKg || 0),
      createdAt: new Date().toISOString()
    };

    setState(prev => {
      // Synchronize with wipMats if recipe contains items
      let updatedWipMats = [...(prev.master.wipMats || [])];
      if (initialItems.length > 0) {
        initialItems.forEach(itemData => {
          const existingWmIdx = updatedWipMats.findIndex(
            wm => wm.wipId === newRecipe.wipId && wm.materialId === itemData.materialId
          );
          const newWmEntry: WipMaterial = {
            id: existingWmIdx >= 0 ? updatedWipMats[existingWmIdx].id : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            wipId: newRecipe.wipId,
            materialId: itemData.materialId,
            materialKgPerBatch: itemData.amountKg,
            recipeId: newRecipeId,
            unit: itemData.unit,
            amount: itemData.amount
          };
          if (existingWmIdx >= 0) {
            updatedWipMats[existingWmIdx] = newWmEntry;
          } else {
            updatedWipMats.push(newWmEntry);
          }
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes: [...(prev.master.recipes || []), newRecipe],
          wipMats: updatedWipMats
        }
      };
    });
    showToast(`Resep "${newRecipe.recipeName}" (${newRecipe.recipeCode}) berhasil disimpan dengan ${initialItems.length} material`);
  };

  const handleUpdateRecipe = (recipeId: string, updates: Partial<WipRecipe>) => {
    setState(prev => {
      const target = (prev.master.recipes || []).find(r => r.id === recipeId);
      const wipId = target?.wipId;
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id === recipeId) {
          return { ...r, ...updates };
        }
        if (updates.isDefault && wipId && r.wipId === wipId) {
          return { ...r, isDefault: false };
        }
        return r;
      });
      return {
        ...prev,
        master: {
          ...prev.master,
          recipes
        }
      };
    });
    showToast('Resep berhasil diperbarui');
  };

  const handleDeleteRecipe = (recipeId: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        recipes: (prev.master.recipes || []).filter(r => r.id !== recipeId)
      }
    }));
    showToast('Resep berhasil dihapus');
  };

  const handleAddMaterialToRecipe = (recipeId: string, itemData: Omit<WipRecipeItem, 'id'>) => {
    const newItem: WipRecipeItem = {
      ...itemData,
      id: `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };

    setState(prev => {
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        const updatedItems = [...r.items.filter(it => it.materialId !== itemData.materialId), newItem];
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      // Synchronize with wipMats for BOM compatibility
      const targetRecipe = prev.master.recipes?.find(r => r.id === recipeId);
      let updatedWipMats = prev.master.wipMats || [];
      if (targetRecipe) {
        const existingWmIdx = updatedWipMats.findIndex(
          wm => wm.wipId === targetRecipe.wipId && wm.materialId === itemData.materialId
        );
        const newWmEntry: WipMaterial = {
          id: existingWmIdx >= 0 ? updatedWipMats[existingWmIdx].id : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          wipId: targetRecipe.wipId,
          materialId: itemData.materialId,
          materialKgPerBatch: itemData.amountKg,
          recipeId: recipeId,
          unit: itemData.unit,
          amount: itemData.amount
        };
        if (existingWmIdx >= 0) {
          updatedWipMats = updatedWipMats.map((wm, idx) => idx === existingWmIdx ? newWmEntry : wm);
        } else {
          updatedWipMats = [...updatedWipMats, newWmEntry];
        }
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    showToast(`Material ${itemData.materialName || ''} ditambahkan ke resep (${itemData.amount} ${itemData.unit})`);
  };

  const handleAddMultipleMaterialsToRecipe = (
    recipeId: string,
    itemsData: Array<Omit<WipRecipeItem, 'id'>>
  ) => {
    if (!itemsData || itemsData.length === 0) return;

    setState(prev => {
      const targetRecipe = prev.master.recipes?.find(r => r.id === recipeId);
      if (!targetRecipe) return prev;

      const newItems: WipRecipeItem[] = itemsData.map(it => ({
        ...it,
        id: `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      }));

      // Merge: replace existing items that have the same materialId, keep others, and append new ones
      const incomingMatIds = new Set(itemsData.map(it => it.materialId));
      const remainingItems = targetRecipe.items.filter(it => !incomingMatIds.has(it.materialId));
      const updatedItems = [...remainingItems, ...newItems];
      const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);

      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      // Synchronize with wipMats for BOM compatibility
      let updatedWipMats = [...(prev.master.wipMats || [])];
      itemsData.forEach(itemData => {
        const existingWmIdx = updatedWipMats.findIndex(
          wm => wm.wipId === targetRecipe.wipId && wm.materialId === itemData.materialId
        );
        const newWmEntry: WipMaterial = {
          id: existingWmIdx >= 0
            ? updatedWipMats[existingWmIdx].id
            : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          wipId: targetRecipe.wipId,
          materialId: itemData.materialId,
          materialKgPerBatch: itemData.amountKg,
          recipeId: recipeId,
          unit: itemData.unit,
          amount: itemData.amount
        };
        if (existingWmIdx >= 0) {
          updatedWipMats[existingWmIdx] = newWmEntry;
        } else {
          updatedWipMats.push(newWmEntry);
        }
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });

    showToast(`Berhasil menambahkan ${itemsData.length} material database ke resep sekaligus!`);
  };

  const handleUpdateRecipeItem = (
    recipeId: string,
    itemId: string,
    newAmount: number,
    newUnit: 'kg' | 'gr'
  ) => {
    const amountKg = newUnit === 'gr' ? newAmount / 1000 : newAmount;
    setState(prev => {
      let targetWipId = '';
      let targetMatId = '';
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        targetWipId = r.wipId;
        const updatedItems = r.items.map(it => {
          if (it.id === itemId) {
            targetMatId = it.materialId;
            return {
              ...it,
              amount: newAmount,
              unit: newUnit,
              amountKg
            };
          }
          return it;
        });
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      // Synchronize with wipMats
      let updatedWipMats = prev.master.wipMats || [];
      if (targetWipId && targetMatId) {
        updatedWipMats = updatedWipMats.map(wm => {
          if (wm.wipId === targetWipId && wm.materialId === targetMatId) {
            return {
              ...wm,
              materialKgPerBatch: amountKg,
              unit: newUnit,
              amount: newAmount
            };
          }
          return wm;
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    showToast('Takaran material dalam resep berhasil diperbarui');
  };

  const handleDeleteMaterialFromRecipe = (recipeId: string, itemId: string) => {
    setState(prev => {
      let removedMaterialId = '';
      let targetWipId = '';
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        targetWipId = r.wipId;
        const targetItem = r.items.find(it => it.id === itemId);
        if (targetItem) removedMaterialId = targetItem.materialId;
        const updatedItems = r.items.filter(it => it.id !== itemId);
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      let updatedWipMats = prev.master.wipMats || [];
      if (removedMaterialId && targetWipId) {
        updatedWipMats = updatedWipMats.filter(
          wm => !(wm.wipId === targetWipId && wm.materialId === removedMaterialId)
        );
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    showToast('Material dihapus dari resep');
  };

  // Import Resep Formulasi (Google Drive & Local File Batch Loader)
  const handleImportRecipes = (newRecipes: WipRecipe[], mode: 'replace' | 'append') => {
    setState(prev => {
      let finalRecipes: WipRecipe[] = [];
      if (mode === 'replace') {
        finalRecipes = newRecipes;
      } else {
        const map = new Map<string, WipRecipe>();
        (prev.master.recipes || []).forEach(r => {
          map.set(`${r.wipId}_${r.recipeCode.toUpperCase()}`, r);
        });
        newRecipes.forEach(nr => {
          const key = `${nr.wipId}_${nr.recipeCode.toUpperCase()}`;
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...nr, id: existing.id });
          } else {
            map.set(key, nr);
          }
        });
        finalRecipes = Array.from(map.values());
      }

      // Synchronize with wipMats for BOM calculations
      let updatedWipMats = [...(prev.master.wipMats || [])];
      finalRecipes.forEach(recipe => {
        recipe.items.forEach(item => {
          const existingIdx = updatedWipMats.findIndex(
            wm => wm.wipId === recipe.wipId && wm.materialId === item.materialId
          );
          const newEntry: WipMaterial = {
            id: existingIdx >= 0 ? updatedWipMats[existingIdx].id : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            wipId: recipe.wipId,
            materialId: item.materialId,
            materialKgPerBatch: item.amountKg,
            recipeId: recipe.id,
            unit: item.unit,
            amount: item.amount
          };
          if (existingIdx >= 0) {
            updatedWipMats[existingIdx] = newEntry;
          } else {
            updatedWipMats.push(newEntry);
          }
        });
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes: finalRecipes,
          wipMats: updatedWipMats
        }
      };
    });
    showToast(`Berhasil mengimpor ${newRecipes.length} resep formulasi`);
  };

  // Add Machine
  const handleAddMachine = (machData: Omit<ProductionMachine, 'id'>) => {
    const newMach: ProductionMachine = {
      ...machData,
      id: `mach_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        machines: [...prev.master.machines, newMach]
      }
    }));
  };

  // Delete Machine
  const handleDeleteMachine = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        machines: prev.master.machines.filter(m => m.id !== id),
        wips: prev.master.wips.map(w => w.assignedMachineId === id ? { ...w, assignedMachineId: undefined } : w)
      }
    }));
    showToast('Mesin berhasil dihapus dari master data');
  };

  // Add Tank
  const handleAddTank = (tankData: Omit<WipTank, 'id'>) => {
    const newTank: WipTank = {
      ...tankData,
      id: `tank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: [...prev.master.tanks, newTank]
      }
    }));
  };

  // Delete Tank
  const handleDeleteTank = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.filter(t => t.id !== id),
        wips: prev.master.wips.map(w => w.targetTankId === id ? { ...w, targetTankId: undefined } : w)
      }
    }));
    showToast('Tangki berhasil dihapus dari master data');
  };

  // Import Machines (Internal Storage & Google Drive Batch Loader)
  const handleImportMachines = (newMachines: ProductionMachine[], mode: 'replace' | 'append') => {
    setState(prev => {
      let finalMachines: ProductionMachine[] = [];

      if (mode === 'replace') {
        finalMachines = newMachines;
      } else {
        // Append mode: merge based on machine code
        const map = new Map<string, ProductionMachine>();
        prev.master.machines.forEach(m => {
          const key = m.code.toUpperCase().trim();
          map.set(key, m);
        });
        newMachines.forEach(m => {
          const key = m.code.toUpperCase().trim();
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...m, id: existing.id });
          } else {
            map.set(key, m);
          }
        });
        finalMachines = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: finalMachines
        }
      };
    });
    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master mesin (${newMachines.length} unit)`
        : `Berhasil mengimpor & memperbarui data mesin (${newMachines.length} unit diproses)`
    );
  };

  // 1. Start Machine Product Changeover
  const handleStartMachineChangeover = (
    machineId: string,
    data: {
      toWipId: string;
      toWipName: string;
      fromWipId?: string;
      fromWipName?: string;
      targetTankId?: string;
      targetTankCode?: string;
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      qcInspectorName?: string;
      checklist: MachineChangeoverChecklist;
      notes?: string;
    }
  ) => {
    setState(prev => {
      const now = new Date().toISOString();
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          return {
            ...m,
            status: 'CHANGEOVER' as const,
            activeChangeover: {
              ...data,
              startedAt: now
            }
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        }
      };
    });
  };

  // 2. Complete and verify Machine Product Changeover
  const handleCompleteMachineChangeover = (
    machineId: string,
    record: MachineChangeoverRecord
  ) => {
    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          const currentHistory = Array.isArray(m.changeoverHistory) ? m.changeoverHistory : [];
          return {
            ...m,
            status: 'OPERATIONAL' as const,
            currentWipId: record.toWipId,
            currentWipName: record.toWipName,
            lastChangeoverDate: record.completedAt || new Date().toISOString(),
            activeChangeover: undefined,
            changeoverHistory: [record, ...currentHistory]
          };
        }
        return m;
      });

      const currentGlobalChangeovers = Array.isArray(prev.transactions.changeovers)
        ? prev.transactions.changeovers
        : [];

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          changeovers: [record, ...currentGlobalChangeovers]
        }
      };
    });
  };

  // 3. Cancel Machine Product Changeover
  const handleCancelMachineChangeover = (machineId: string) => {
    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          return {
            ...m,
            status: 'OPERATIONAL' as const,
            activeChangeover: undefined
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        }
      };
    });
  };

  // Import Tanks (Internal Storage & Google Drive Batch Loader)
  const handleImportTanks = (newTanks: WipTank[], mode: 'replace' | 'append') => {
    setState(prev => {
      let finalTanks: WipTank[] = [];

      if (mode === 'replace') {
        finalTanks = newTanks;
      } else {
        // Append mode: merge based on tank code
        const map = new Map<string, WipTank>();
        prev.master.tanks.forEach(t => {
          const key = t.code.toUpperCase().trim();
          map.set(key, t);
        });
        newTanks.forEach(t => {
          const key = t.code.toUpperCase().trim();
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...t, id: existing.id });
          } else {
            map.set(key, t);
          }
        });
        finalTanks = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          tanks: finalTanks
        }
      };
    });
    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master tangki WIP (${newTanks.length} tangki)`
        : `Berhasil mengimpor & memperbarui master tangki WIP (${newTanks.length} tangki diproses)`
    );
  };

  // Update Tank Item
  const handleUpdateTankItem = (tankId: string, updates: Partial<WipTank>) => {
    if (
      updates.currentLevelKg !== undefined &&
      stateRef.current.currentUserRole !== 'ADMINISTRATOR' &&
      !stateRef.current.isAdmin
    ) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan kalibrasi isi tangki', true);
      return;
    }

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.map(t => t.id === tankId ? { ...t, ...updates } : t)
      }
    }));
  };

  // Top Up / Transfer WIP into Tank
  const handleTopUpTank = (tankId: string, amountKg: number, notes?: string) => {
    if (stateRef.current.currentUserRole !== 'ADMINISTRATOR' && !stateRef.current.isAdmin) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan Isi Batch WIP ke tangki', true);
      return;
    }

    setState(prev => {
      let logEntry: TankTransferLog | null = null;
      const updatedTanks = prev.master.tanks.map(t => {
        if (t.id === tankId) {
          const prevLvl = t.currentLevelKg;
          const newLvl = Math.min(t.capacityKg, prevLvl + amountKg);
          logEntry = {
            id: `tl_${Date.now()}`,
            timestamp: new Date().toISOString(),
            tankId: t.id,
            tankCode: t.code,
            tankName: t.name,
            type: 'MANUAL_TOPUP',
            amountKg,
            previousLevelKg: prevLvl,
            newLevelKg: newLvl,
            notes: notes || `Top-up / refill manual sebesar ${amountKg.toFixed(2)} kg`
          };
          return {
            ...t,
            currentLevelKg: newLvl
          };
        }
        return t;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          tanks: updatedTanks
        },
        transactions: {
          ...prev.transactions,
          tankLogs: logEntry ? [logEntry, ...(prev.transactions.tankLogs || [])] : prev.transactions.tankLogs
        }
      };
    });
  };

  // Automatic Carton Production Depletion Engine (Holding Tank & Storage Tank Real-Time Depletion)
  const handleProduceCartons = (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ): { success: boolean; message: string } => {
    const currentState = stateRef.current;
    const targetSku = currentState.master.skus.find(s => s.id === skuId);
    if (!targetSku) return { success: false, message: 'SKU tidak ditemukan!' };

    const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuId);
    if (linkedWips.length === 0) {
      return {
        success: false,
        message: `SKU "${targetSku.name}" belum memiliki relasi BOM WIP! Tambahkan relasi di Master BOM.`
      };
    }

    const activeRunsNow = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const activeRunForLine =
      (runId ? activeRunsNow.find(r => r.id === runId) : undefined) ||
      (lineId ? activeRunsNow.find(r => r.lineId === lineId && r.isRunning) : undefined) ||
      activeRunsNow.find(r => r.skuId === skuId && r.isRunning) ||
      activeRunsNow.find(r => r.skuId === skuId);

    const resolvedLineId = lineId || activeRunForLine?.lineId;
    const resolvedLineName = lineName || activeRunForLine?.lineName;

    let effectiveCartons = cartonCount;
    if (activeRunForLine?.plannedCartons && activeRunForLine.plannedCartons > 0) {
      const remaining = activeRunForLine.plannedCartons - (activeRunForLine.cartonsProducedTotal || 0);
      if (remaining <= 0) {
        setState(prev => {
          const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
          const updatedRuns = prevRuns.map(r => {
            const isMatch = runId
              ? r.id === runId
              : resolvedLineId
              ? r.lineId === resolvedLineId && r.isRunning
              : r.skuId === skuId && r.isRunning;
            return isMatch
              ? { ...r, isRunning: false, completionStatus: 'COMPLETED' as const, completedAt: new Date().toISOString() }
              : r;
          });
          return {
            ...prev,
            activeSkuRuns: updatedRuns,
            activeSkuRun: updatedRuns.find(r => r.isRunning) || null
          };
        });
        return {
          success: true,
          message: `Planning ${activeRunForLine.plannedCartons.toLocaleString()} karton pada ${resolvedLineName || targetSku.name} telah selesai tercapai!`
        };
      }
      effectiveCartons = Math.min(cartonCount, remaining);
    }

    const effectiveSelectedTanks: Record<string, string> = {
      ...(activeRunForLine?.selectedHoldingTanks || {}),
      ...(overrideSelectedHoldingTanks || {})
    };

    // Pre-check all candidate tanks (respecting selected Holding Tank when configured)
    for (const sw of linkedWips) {
      const wip = currentState.master.wips.find(w => w.id === sw.wipId);
      const neededKg = effectiveCartons * sw.kgWipPerCartonSku;
      const allWipTanks = getAllTanksForWip(wip, currentState.master.tanks);
      const chosenHtId = wip ? effectiveSelectedTanks[wip.id] : undefined;
      const hasValidChosenHt = Boolean(chosenHtId && allWipTanks.some(t => t.id === chosenHtId));

      const candidateTanks = hasValidChosenHt
        ? allWipTanks.filter(t => t.type !== 'HOLDING_TANK' || t.id === chosenHtId)
        : allWipTanks;

      if (candidateTanks.length === 0) {
        return {
          success: false,
          message: `WIP "${wip?.name || 'WIP'}" belum memiliki tangki holding atau storage yang ditautkan!`
        };
      }

      const totalAvailableKg = candidateTanks.reduce((sum, t) => sum + t.currentLevelKg, 0);
      if (totalAvailableKg < neededKg) {
        const chosenTankObj = hasValidChosenHt ? allWipTanks.find(t => t.id === chosenHtId) : undefined;
        return {
          success: false,
          message: chosenTankObj
            ? `Massa WIP "${wip?.name}" pada Holding Tank terpilih (${chosenTankObj.code}) tidak cukup! Butuh ${neededKg.toFixed(2)} kg, tersisa ${totalAvailableKg.toFixed(2)} kg.`
            : `Massa WIP "${wip?.name}" tidak cukup! Butuh ${neededKg.toFixed(2)} kg, total di holding & storage tank hanya tersisa ${totalAvailableKg.toFixed(2)} kg.`
        };
      }
    }

    // Execute deduction
    const timestamp = new Date().toISOString();
    const currentShiftObj = getCurrentShift();
    const deductions: CartonProductionLog['tankDeductions'] = [];
    const newTankLogs: TankTransferLog[] = [];
    let autoCompletedLineMsg: string | null = null;

    setState(prev => {
      const updatedTanks = prev.master.tanks.map(t => ({ ...t }));
      const prevRunsForChoice = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const runForChoice =
        (runId ? prevRunsForChoice.find(r => r.id === runId) : undefined) ||
        (resolvedLineId ? prevRunsForChoice.find(r => r.lineId === resolvedLineId && r.isRunning) : undefined) ||
        prevRunsForChoice.find(r => r.skuId === skuId && r.isRunning) ||
        prevRunsForChoice.find(r => r.skuId === skuId);

      const runSelectedTanks: Record<string, string> = {
        ...(runForChoice?.selectedHoldingTanks || {}),
        ...(overrideSelectedHoldingTanks || {})
      };

      linkedWips.forEach(sw => {
        const wip = prev.master.wips.find(w => w.id === sw.wipId);
        let neededKg = effectiveCartons * sw.kgWipPerCartonSku;

        const allWipTanks = getAllTanksForWip(wip, updatedTanks);
        const allWipTankIdSet = new Set(allWipTanks.map(t => t.id));
        const chosenHtId = wip ? runSelectedTanks[wip.id] : undefined;
        const hasValidChosenHt = Boolean(chosenHtId && allWipTankIdSet.has(chosenHtId));

        // Find candidate tanks: if user selected a Holding Tank for this WIP, ONLY use that Holding Tank (plus Storage Tank if linked)
        const candidateIndices = updatedTanks
          .map((t, idx) => ({ t, idx }))
          .filter(({ t }) => {
            if (!allWipTankIdSet.has(t.id)) return false;
            if (hasValidChosenHt && t.type === 'HOLDING_TANK' && t.id !== chosenHtId) {
              return false;
            }
            return true;
          })
          .sort((a, b) => {
            if (hasValidChosenHt) {
              if (a.t.id === chosenHtId && b.t.id !== chosenHtId) return -1;
              if (a.t.id !== chosenHtId && b.t.id === chosenHtId) return 1;
            }
            if (a.t.type === 'HOLDING_TANK' && b.t.type !== 'HOLDING_TANK') return -1;
            if (a.t.type !== 'HOLDING_TANK' && b.t.type === 'HOLDING_TANK') return 1;
            return 0;
          });

        for (const { idx } of candidateIndices) {
          if (neededKg <= 0.0001) break;
          const prevLvl = updatedTanks[idx].currentLevelKg;
          if (prevLvl <= 0) continue;

          const deductThisTank = Math.min(prevLvl, neededKg);
          const newLvl = Math.max(0, prevLvl - deductThisTank);
          updatedTanks[idx].currentLevelKg = newLvl;
          neededKg -= deductThisTank;

          deductions.push({
            tankId: updatedTanks[idx].id,
            tankCode: updatedTanks[idx].code,
            tankName: updatedTanks[idx].name,
            tankType: updatedTanks[idx].type,
            wipId: wip?.id || '',
            wipName: wip?.name || '',
            kgPerCarton: sw.kgWipPerCartonSku,
            kgDeducted: deductThisTank,
            remainingLevelKg: newLvl
          });

          newTankLogs.push({
            id: `tl_${Date.now()}_${sw.id}_${updatedTanks[idx].id}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            tankId: updatedTanks[idx].id,
            tankCode: updatedTanks[idx].code,
            tankName: updatedTanks[idx].name,
            type: 'CARTON_DEPLETION',
            amountKg: -deductThisTank,
            previousLevelKg: prevLvl,
            newLevelKg: newLvl,
            wipId: wip?.id,
            wipName: wip?.name,
            skuName: resolvedLineName ? `[${resolvedLineName}] ${targetSku.name}` : targetSku.name,
            cartonsCount: effectiveCartons,
            operatorName,
            notes:
              notes ||
              `Otomatis terpotong untuk ${effectiveCartons} karton ${targetSku.name}${resolvedLineName ? ` (${resolvedLineName})` : ''} (${updatedTanks[idx].type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})`
          });
        }
      });

      const dateKey = timestamp.slice(0, 10);
      const isAutoTick = Boolean(notes?.startsWith('Auto ['));

      const newCartonLog: CartonProductionLog = {
        id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        lineId: resolvedLineId,
        lineName: resolvedLineName,
        skuId: targetSku.id,
        skuName: targetSku.name,
        skuCode: targetSku.code,
        cartonsProduced: effectiveCartons,
        shift: currentShiftObj.shift, // Selalu mengikuti jam shift berjalan
        operatorName,
        tankDeductions: deductions,
        notes
      };

      const prevCartonLogs = prev.transactions.cartonProductions || [];
      let nextCartonLogs: CartonProductionLog[];
      if (isAutoTick) {
        const matchIdx = prevCartonLogs.findIndex(
          cp =>
            cp.notes?.startsWith('Auto [') &&
            (cp.timestamp || '').slice(0, 10) === dateKey &&
            cp.shift === currentShiftObj.shift &&
            (cp.lineId || '') === (resolvedLineId || '') &&
            cp.skuId === targetSku.id
        );
        if (matchIdx >= 0) {
          const existing = prevCartonLogs[matchIdx];
          const mergedDeductions = [...(existing.tankDeductions || [])];
          deductions.forEach(d => {
            const dIdx = mergedDeductions.findIndex(
              m => m.tankId === d.tankId && m.wipId === d.wipId
            );
            if (dIdx >= 0) {
              mergedDeductions[dIdx] = {
                ...mergedDeductions[dIdx],
                kgDeducted: parseFloat((mergedDeductions[dIdx].kgDeducted + d.kgDeducted).toFixed(4)),
                remainingLevelKg: d.remainingLevelKg
              };
            } else {
              mergedDeductions.push({ ...d });
            }
          });
          const mergedEntry: CartonProductionLog = {
            ...existing,
            timestamp,
            cartonsProduced: existing.cartonsProduced + effectiveCartons,
            operatorName: operatorName || existing.operatorName,
            tankDeductions: mergedDeductions,
            notes
          };
          nextCartonLogs = [
            mergedEntry,
            ...prevCartonLogs.slice(0, matchIdx),
            ...prevCartonLogs.slice(matchIdx + 1)
          ];
        } else {
          nextCartonLogs = [newCartonLog, ...prevCartonLogs];
        }
      } else {
        nextCartonLogs = [newCartonLog, ...prevCartonLogs];
      }

      const prevTankLogs = [...(prev.transactions.tankLogs || [])];
      let nextTankLogs: TankTransferLog[];
      if (isAutoTick) {
        const mergedFresh: TankTransferLog[] = [];
        newTankLogs.forEach(ntl => {
          const existingIdx = prevTankLogs.findIndex(
            tl =>
              tl.type === 'CARTON_DEPLETION' &&
              tl.notes?.startsWith('Auto [') &&
              (tl.timestamp || '').slice(0, 10) === dateKey &&
              tl.tankId === ntl.tankId &&
              (tl.wipId || '') === (ntl.wipId || '') &&
              (tl.skuName || '') === (ntl.skuName || '')
          );
          if (existingIdx >= 0) {
            const ex = prevTankLogs[existingIdx];
            prevTankLogs.splice(existingIdx, 1);
            mergedFresh.push({
              ...ex,
              timestamp,
              amountKg: parseFloat((ex.amountKg + ntl.amountKg).toFixed(4)),
              newLevelKg: ntl.newLevelKg,
              cartonsCount: (ex.cartonsCount || 0) + (ntl.cartonsCount || 0),
              operatorName: ntl.operatorName || ex.operatorName,
              notes: ntl.notes
            });
          } else {
            mergedFresh.push(ntl);
          }
        });
        nextTankLogs = [...mergedFresh, ...prevTankLogs].slice(0, 200);
      } else {
        nextTankLogs = [...newTankLogs, ...prevTankLogs].slice(0, 200);
      }

      // Update ONLY the matched active SKU run cartons count
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedActiveRuns = prevRuns.map(r => {
        const isMatch = runId
          ? r.id === runId
          : resolvedLineId
          ? r.lineId === resolvedLineId && r.isRunning
          : r.skuId === targetSku.id && r.isRunning;

        if (isMatch) {
          const newTotal = (r.cartonsProducedTotal || 0) + effectiveCartons;
          const reachedTarget = Boolean(r.plannedCartons && r.plannedCartons > 0 && newTotal >= r.plannedCartons);
          if (reachedTarget) {
            autoCompletedLineMsg = `${r.lineName || 'Line'}: Target planning ${r.plannedCartons?.toLocaleString()} karton (${r.skuName}) selesai diproduksi!`;
          }
          return {
            ...r,
            cartonsProducedTotal: newTotal,
            lastDeductionTime: timestamp,
            isRunning: reachedTarget ? false : r.isRunning,
            completionStatus: reachedTarget ? ('COMPLETED' as const) : r.completionStatus,
            completedAt: reachedTarget ? timestamp : r.completedAt
          };
        }
        return r;
      });

      const updatedActiveRun = updatedActiveRuns.find(r => r.isRunning) || updatedActiveRuns[0] || null;

      return {
        ...prev,
        activeSkuRun: updatedActiveRun,
        activeSkuRuns: updatedActiveRuns,
        master: {
          ...prev.master,
          tanks: updatedTanks
        },
        transactions: {
          ...prev.transactions,
          cartonProductions: nextCartonLogs,
          tankLogs: nextTankLogs
        }
      };
    });

    if (autoCompletedLineMsg) {
      setTimeout(() => showToast(autoCompletedLineMsg!), 30);
    }

    return {
      success: true,
      message: `Berhasil mencatat ${effectiveCartons} karton ${targetSku.name}${resolvedLineName ? ` (${resolvedLineName})` : ''}. Isi tangki Holding & Storage otomatis berkurang!`
    };
  };

  // Rule Baru: Inter-Tank Transfer (Holding Tank ➔ Storage Tank, Storage Tank ➔ Holding Tank)
  const handleTransferBetweenTanks = (
    sourceTankId: string,
    destTankId: string,
    amountKg: number,
    notes?: string,
    operatorName?: string
  ): { success: boolean; message: string } => {
    const source = state.master.tanks.find(t => t.id === sourceTankId);
    const dest = state.master.tanks.find(t => t.id === destTankId);
    if (!source || !dest) return { success: false, message: 'Tangki tidak ditemukan!' };

    if (source.currentLevelKg < amountKg) {
      return {
        success: false,
        message: `Level tangki ${source.code} tidak mencukupi (${source.currentLevelKg.toFixed(1)} kg)`
      };
    }

    const freeSpace = dest.capacityKg - dest.currentLevelKg;
    if (amountKg > freeSpace) {
      return {
        success: false,
        message: `Melebihi kapasitas sisa tangki tujuan ${dest.code} (${freeSpace.toFixed(1)} kg tersisa)`
      };
    }

    // 1-WIP Rule check
    if (
      dest.currentLevelKg > 0.001 &&
      dest.assignedWipId &&
      source.assignedWipId &&
      dest.assignedWipId !== source.assignedWipId
    ) {
      return {
        success: false,
        message: 'Pelanggaran Aturan 1-WIP: Tangki tujuan memiliki WIP berbeda! Transfer dibatalkan.'
      };
    }

    const timestamp = new Date().toISOString();
    const sourceWip = state.master.wips.find(w => w.id === source.assignedWipId);
    const newSourceLevel = Math.max(0, source.currentLevelKg - amountKg);
    const newDestLevel = Math.min(dest.capacityKg, dest.currentLevelKg + amountKg);

    setState(prev => {
      const updatedTanks = prev.master.tanks.map(t => {
        if (t.id === sourceTankId) {
          return { ...t, currentLevelKg: newSourceLevel };
        }
        if (t.id === destTankId) {
          return {
            ...t,
            currentLevelKg: newDestLevel,
            assignedWipId: t.assignedWipId || source.assignedWipId
          };
        }
        return t;
      });

      const transferLog1: TankTransferLog = {
        id: `tl_${Date.now()}_src`,
        timestamp,
        tankId: source.id,
        tankCode: source.code,
        tankName: source.name,
        type: 'MANUAL_TOPUP',
        amountKg: -amountKg,
        previousLevelKg: source.currentLevelKg,
        newLevelKg: newSourceLevel,
        wipId: source.assignedWipId,
        wipName: sourceWip?.name,
        operatorName,
        notes: `Transfer keluar (${amountKg.toFixed(1)} kg) ➔ ${dest.code} (${dest.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}). ${notes || ''}`
      };

      const transferLog2: TankTransferLog = {
        id: `tl_${Date.now()}_dest`,
        timestamp,
        tankId: dest.id,
        tankCode: dest.code,
        tankName: dest.name,
        type: 'WIP_BATCH_INFLOW',
        amountKg,
        previousLevelKg: dest.currentLevelKg,
        newLevelKg: newDestLevel,
        wipId: source.assignedWipId,
        wipName: sourceWip?.name,
        operatorName,
        notes: `Transfer masuk (${amountKg.toFixed(1)} kg) dari ${source.code} (${source.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}). ${notes || ''}`
      };

      return {
        ...prev,
        master: {
          ...prev.master,
          tanks: updatedTanks
        },
        transactions: {
          ...prev.transactions,
          tankLogs: [transferLog1, transferLog2, ...(prev.transactions.tankLogs || [])]
        }
      };
    });

    const isRuleBaru = source.type === 'HOLDING_TANK' && dest.type === 'STORAGE_TANK';
    return {
      success: true,
      message: `Berhasil mentransfer ${amountKg.toFixed(1)} kg WIP dari ${source.code} (${source.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}) ke ${dest.code} (${dest.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})${isRuleBaru ? ' [Rule Baru: Holding ➔ Storage]' : ''}`
    };
  };

  // Production Line Customization CRUD (Line A, B, C, D, etc.)
  const isAdminSession = () => {
    const s = stateRef.current;
    return s.currentUserRole === 'ADMINISTRATOR' || s.isAdmin;
  };

  const handleAddProductionLine = (lineData: Omit<ProductionLine, 'id'>) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const newLine: ProductionLine = {
      ...lineData,
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: [...(prev.master.productionLines || []), newLine]
      }
    }));
    showToast(`Line produksi "${newLine.name}" berhasil ditambahkan`);
  };

  const handleUpdateProductionLine = (lineId: string, updates: Partial<ProductionLine>) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    setState(prev => {
      const updatedLines = (prev.master.productionLines || []).map(l =>
        l.id === lineId ? { ...l, ...updates } : l
      );
      const updatedLineName = updates.name;
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = updatedLineName
        ? prevRuns.map(r => (r.lineId === lineId ? { ...r, lineName: updatedLineName } : r))
        : prevRuns;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun:
          prev.activeSkuRun && prev.activeSkuRun.lineId === lineId && updatedLineName
            ? { ...prev.activeSkuRun, lineName: updatedLineName }
            : prev.activeSkuRun,
        master: {
          ...prev.master,
          productionLines: updatedLines
        }
      };
    });
    showToast('Data line produksi berhasil diperbarui');
  };

  const handleDeleteProductionLine = (lineId: string) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const currentState = stateRef.current;
    const runs = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const isBusy = runs.some(r => r.lineId === lineId && r.isRunning);
    if (isBusy) {
      showToast('Tidak dapat menghapus line yang sedang memproduksi SKU.', true);
      return;
    }
    const existing = currentState.master.productionLines || [];
    if (existing.length <= 1) {
      showToast('Minimal harus terdapat 1 line produksi.', true);
      return;
    }
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: (prev.master.productionLines || []).filter(l => l.id !== lineId)
      }
    }));
    showToast('Line produksi berhasil dihapus');
  };

  const handleSetProductionLinesCount = (targetCount: number) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const currentState = stateRef.current;
    const existing = currentState.master.productionLines || [];
    const runs = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningLineIds = new Set(runs.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));

    const getAlpha = (index: number) => {
      let n = index;
      let label = '';
      while (n >= 0) {
        label = String.fromCharCode((n % 26) + 65) + label;
        n = Math.floor(n / 26) - 1;
      }
      return label;
    };

    let nextLines = [...existing];
    if (targetCount > existing.length) {
      for (let i = existing.length; i < targetCount; i++) {
        const alpha = getAlpha(i);
        nextLines.push({
          id: `line_${alpha.toLowerCase()}_${Date.now()}_${i}`,
          code: `LINE-${alpha}`,
          name: `Line ${alpha}`,
          description: `Jalur Produksi ${alpha}`,
          isActive: true
        });
      }
    } else if (targetCount < existing.length) {
      // Remove from the end only lines that are NOT currently running
      while (nextLines.length > targetCount) {
        const removableIdx = [...nextLines].reverse().findIndex(l => !runningLineIds.has(l.id));
        if (removableIdx === -1) break;
        const actualIdx = nextLines.length - 1 - removableIdx;
        nextLines.splice(actualIdx, 1);
      }
    }

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: nextLines
      }
    }));
    showToast(`Jumlah line produksi diperbarui menjadi ${nextLines.length} line`);
  };

  // Start Single SKU Production on a Line (Enforces 1 SKU per Line; allows same SKU on multiple lines concurrently)
  const handleStartSkuProduction = (
    skuId: string,
    operatorName?: string,
    speedMultiplier: number = 1,
    selectedHoldingTanks?: Record<string, string>,
    lineId?: string,
    plannedCartons?: number,
    shiftOverride?: ShiftNumber
  ) => {
    const currentState = stateRef.current;
    const targetSku = currentState.master.skus.find(s => s.id === skuId);
    if (!targetSku) return;

    const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuId);
    if (linkedWips.length === 0) {
      showToast(`SKU "${targetSku.name}" belum memiliki relasi BOM WIP! Harap atur di Master BOM.`, true);
      return;
    }

    const lines = currentState.master.productionLines || [];
    const prevRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningRuns = prevRuns.filter(r => r.isRunning);

    let targetLine = lineId ? lines.find(l => l.id === lineId) : undefined;
    if (lineId && !targetLine) {
      showToast('Line produksi tidak ditemukan.', true);
      return;
    }

    if (targetLine) {
      const busyRun = runningRuns.find(r => r.lineId === targetLine!.id);
      if (busyRun) {
        showToast(
          `${targetLine.name} sedang memproduksi "${busyRun.skuName}". Tunggu hingga selesai/dihentikan sebelum menjalankan SKU lain.`,
          true
        );
        return;
      }
    } else {
      targetLine = lines.find(l => l.isActive && !runningRuns.some(r => r.lineId === l.id)) || lines[0];
      if (targetLine && runningRuns.some(r => r.lineId === targetLine!.id)) {
        showToast('Semua line produksi sedang berjalan. Selesaikan satu line terlebih dahulu atau tambahkan line baru.', true);
        return;
      }
    }

    const currentPeriod = getShiftPeriodInfo();
    const activeShift = shiftOverride || currentPeriod.shift;
    const op = operatorName || currentState.currentSession?.name || 'Operator Line Produksi';
    const resolvedPlanned = plannedCartons && plannedCartons > 0 ? plannedCartons : (targetSku.targetHour || 500) * 8;
    const resolvedLineId = targetLine?.id || 'line_a';
    const resolvedLineName = targetLine?.name || 'Line A';
    const runId = `run_${resolvedLineId}_${Date.now()}`;

    const newRun: ActiveSkuProductionRun = {
      id: runId,
      lineId: resolvedLineId,
      lineName: resolvedLineName,
      skuId: targetSku.id,
      skuName: targetSku.name,
      skuCode: targetSku.code,
      shift: activeShift,
      shiftPeriodKey: currentPeriod.shiftKey,
      plannedCartons: resolvedPlanned,
      startedAt: new Date().toISOString(),
      isRunning: true,
      completionStatus: 'RUNNING',
      cartonsProducedTotal: 0,
      operatorName: op,
      targetPerHour: targetSku.targetHour,
      speedMultiplier: speedMultiplier || 1,
      selectedHoldingTanks: selectedHoldingTanks && Object.keys(selectedHoldingTanks).length > 0 ? selectedHoldingTanks : undefined
    };

    setState(prev => {
      const curRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      // Keep runs on other lines AND archived SHIFT_HANDOVER records for shift summaries
      const preservedRuns = curRuns.filter(
        r => r.lineId !== resolvedLineId || r.completionStatus === 'SHIFT_HANDOVER'
      );
      const updatedRuns = [newRun, ...preservedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRun
      };
    });

    // Deduct initial 1 carton immediately from Holding Tank per BOM
    setTimeout(() => {
      const res = handleProduceCartons(
        targetSku.id,
        1,
        op,
        `Mulai Produksi [${resolvedLineName}]: ${targetSku.name} (Planning ${resolvedPlanned.toLocaleString()} ktn / Shift ${activeShift})`,
        selectedHoldingTanks,
        runId,
        resolvedLineId,
        resolvedLineName
      );
      if (!res.success) {
        handleTriggerMaterialShortageStop(newRun, res.message);
      }
    }, 50);

    const selectedCodes = selectedHoldingTanks
      ? Object.values(selectedHoldingTanks)
          .map(tId => currentState.master.tanks.find(t => t.id === tId)?.code)
          .filter(Boolean)
      : [];

    showToast(
      selectedCodes.length > 0
        ? `[${resolvedLineName}] Produksi "${targetSku.name}" dimulai (Planning: ${resolvedPlanned.toLocaleString()} ktn) dengan Holding Tank [${selectedCodes.join(', ')}].`
        : `[${resolvedLineName}] Produksi "${targetSku.name}" dimulai (Planning: ${resolvedPlanned.toLocaleString()} ktn / Shift ${activeShift}).`
    );
  };

  // Start 1 or Multiple Production Lines Concurrently (supports same or different SKUs across lines)
  const handleStartLineBatchRuns = (
    assignments: {
      lineId: string;
      skuId: string;
      plannedCartons: number;
      shift?: ShiftNumber;
      operatorName?: string;
      speedMultiplier?: number;
      selectedHoldingTanks?: Record<string, string>;
    }[]
  ) => {
    const currentState = stateRef.current;
    if (assignments.length === 0) {
      showToast('Pilih minimal satu line produksi & SKU untuk dijalankan.', true);
      return;
    }

    const lines = currentState.master.productionLines || [];
    const prevRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningLineIds = new Set(prevRuns.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));
    const currentPeriod = getShiftPeriodInfo();

    // Validate every assignment
    const seenLineIds = new Set<string>();
    const newRuns: ActiveSkuProductionRun[] = [];

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (seenLineIds.has(a.lineId)) {
        showToast('Setiap line produksi hanya dapat memproduksi 1 jenis SKU dalam satu waktu.', true);
        return;
      }
      seenLineIds.add(a.lineId);

      const lineObj = lines.find(l => l.id === a.lineId);
      if (!lineObj) {
        showToast('Line produksi tidak ditemukan.', true);
        return;
      }
      if (runningLineIds.has(a.lineId)) {
        showToast(`${lineObj.name} masih berjalan. Selesaikan atau hentikan dahulu sebelum mengganti SKU.`, true);
        return;
      }

      const skuObj = currentState.master.skus.find(s => s.id === a.skuId);
      if (!skuObj) {
        showToast(`SKU untuk ${lineObj.name} belum dipilih.`, true);
        return;
      }
      const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuObj.id);
      if (linkedWips.length === 0) {
        showToast(`SKU "${skuObj.name}" (${lineObj.name}) belum memiliki relasi BOM WIP di Master BOM.`, true);
        return;
      }

      const planned = a.plannedCartons > 0 ? a.plannedCartons : (skuObj.targetHour || 500) * 8;
      const op = a.operatorName || currentState.currentSession?.name || 'Operator Line Produksi';

      newRuns.push({
        id: `run_${lineObj.id}_${Date.now()}_${i}`,
        lineId: lineObj.id,
        lineName: lineObj.name,
        skuId: skuObj.id,
        skuName: skuObj.name,
        skuCode: skuObj.code,
        shift: a.shift || currentPeriod.shift,
        shiftPeriodKey: currentPeriod.shiftKey,
        plannedCartons: planned,
        startedAt: new Date().toISOString(),
        isRunning: true,
        completionStatus: 'RUNNING',
        cartonsProducedTotal: 0,
        operatorName: op,
        targetPerHour: skuObj.targetHour,
        speedMultiplier: a.speedMultiplier || 1,
        selectedHoldingTanks: a.selectedHoldingTanks && Object.keys(a.selectedHoldingTanks).length > 0 ? a.selectedHoldingTanks : undefined
      });
    }

    const replacingLineIds = new Set(newRuns.map(r => r.lineId));
    setState(prev => {
      const curRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const unchangedRuns = curRuns.filter(
        r => !replacingLineIds.has(r.lineId) || r.completionStatus === 'SHIFT_HANDOVER'
      );
      const updatedRuns = [...newRuns, ...unchangedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRuns[0] || null
      };
    });

    newRuns.forEach((run, idx) => {
      setTimeout(() => {
        const res = handleProduceCartons(
          run.skuId,
          1,
          run.operatorName,
          `Mulai Produksi [${run.lineName}]: ${run.skuName} (Planning ${run.plannedCartons?.toLocaleString()} ktn / Shift ${run.shift})`,
          run.selectedHoldingTanks,
          run.id,
          run.lineId,
          run.lineName
        );
        if (!res.success) {
          handleTriggerMaterialShortageStop(run, res.message);
        }
      }, 60 * (idx + 1));
    });

    showToast(`${newRuns.length} Line Produksi dijalankan bersamaan! Pengurangan WIP Holding Tank aktif sesuai BOM.`);
  };

  // Legacy wrapper for multi-SKU quick start
  const handleStartMultipleSkus = (
    skuIds: string[],
    operatorName?: string,
    speedMultiplier: number = 1,
    selectedHoldingTanksBySku?: Record<string, Record<string, string>>
  ) => {
    const currentState = stateRef.current;
    const lines = currentState.master.productionLines || [];
    const prevRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const busyLineIds = new Set(prevRuns.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));
    const freeLines = lines.filter(l => l.isActive && !busyLineIds.has(l.id));

    const assignments = skuIds.slice(0, freeLines.length).map((skuId, idx) => {
      const sku = currentState.master.skus.find(s => s.id === skuId);
      return {
        lineId: freeLines[idx].id,
        skuId,
        plannedCartons: (sku?.targetHour || 500) * 8,
        operatorName,
        speedMultiplier,
        selectedHoldingTanks: selectedHoldingTanksBySku?.[skuId]
      };
    });

    if (assignments.length === 0) {
      showToast('Tidak ada line produksi standby yang tersedia.', true);
      return;
    }
    handleStartLineBatchRuns(assignments);
  };

  // Handle SKU Changeover on a production line
  const handleSkuChangeover = (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => {
    const currentState = stateRef.current;
    const targetLine = (currentState.master.productionLines || []).find(l => l.id === lineId);
    const targetSku = currentState.master.skus.find(s => s.id === newSkuId);
    if (!targetSku) return;

    const completedAt = new Date().toISOString();
    const startedAt = completedAt;
    const currentPeriod = getShiftPeriodInfo();

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (r.lineId === lineId && r.isRunning) {
          return {
            ...r,
            isRunning: false,
            completionStatus: 'COMPLETED' as const,
            completedAt
          };
        }
        return r;
      });

      const newRun: ActiveSkuProductionRun = {
        id: `run_${lineId}_${Date.now()}_co`,
        lineId,
        lineName: targetLine?.name || 'Line Produksi',
        skuId: newSkuId,
        skuName: targetSku.name,
        skuCode: targetSku.code,
        shift: currentPeriod.shift,
        shiftPeriodKey: currentPeriod.shiftKey,
        startedAt,
        isRunning: true,
        completionStatus: 'RUNNING',
        cartonsProducedTotal: 0,
        plannedCartons: (targetSku.targetHour || 500) * 8,
        operatorName: changeoverData.operatorName,
        targetPerHour: targetSku.targetHour,
        speedMultiplier: 1
      };

      const newChangeoverRecord: MachineChangeoverRecord = {
        id: `co_${Date.now()}`,
        machineId: lineId,
        machineCode: targetLine?.code || lineId,
        machineName: targetLine?.name || 'Line',
        timestamp: completedAt,
        startedAt,
        status: 'COMPLETED',
        fromWipId: '',
        fromWipName: '',
        toWipId: newSkuId,
        toWipName: targetSku.name,
        changeoverType: changeoverData.changeoverType,
        durationMinutes: changeoverData.estimatedMinutes,
        operatorName: changeoverData.operatorName,
        completedAt,
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: changeoverData.changeoverType === 'MOULD_TOOLING',
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        notes: `Changeover SKU ke ${targetSku.name} (${changeoverData.changeoverType}). ${changeoverData.notes || ''}`
      };

      return {
        ...prev,
        activeSkuRuns: [newRun, ...updatedRuns],
        activeSkuRun: newRun,
        transactions: {
          ...prev.transactions,
          changeovers: [newChangeoverRecord, ...(prev.transactions.changeovers || [])]
        }
      };
    });

    showToast(`Changeover SKU ke "${targetSku.name}" pada ${targetLine?.name || lineId} berhasil dilakukan.`);
  };

  // Switch active Holding Tank for a WIP during an ongoing line production run
  const handleUpdateRunHoldingTank = (skuId: string, wipId: string, tankId: string, runId?: string) => {
    const currentState = stateRef.current;
    const tankObj = currentState.master.tanks.find(t => t.id === tankId);
    const wipObj = currentState.master.wips.find(w => w.id === wipId);

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        const isMatch = runId ? r.id === runId : r.skuId === skuId && r.isRunning;
        if (!isMatch) return r;
        return {
          ...r,
          selectedHoldingTanks: {
            ...(r.selectedHoldingTanks || {}),
            [wipId]: tankId
          }
        };
      });
      const updatedActiveRun =
        prev.activeSkuRun && (runId ? prev.activeSkuRun.id === runId : prev.activeSkuRun.skuId === skuId)
          ? {
              ...prev.activeSkuRun,
              selectedHoldingTanks: {
                ...(prev.activeSkuRun.selectedHoldingTanks || {}),
                [wipId]: tankId
              }
            }
          : prev.activeSkuRun;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: updatedActiveRun
      };
    });

    if (tankObj && wipObj) {
      showToast(`Sumber Holding Tank untuk ${wipObj.name} dialihkan ke ${tankObj.code} (${tankObj.name})`);
    }
  };

  // Change Speed Multiplier for live automated depletion (targets specific runId/lineId or skuId)
  const handleSetRunSpeedMultiplier = (speedMultiplier: number, runIdOrSkuId?: string) => {
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (!runIdOrSkuId || r.id === runIdOrSkuId || r.lineId === runIdOrSkuId || r.skuId === runIdOrSkuId) {
          return { ...r, speedMultiplier };
        }
        return r;
      });
      const updatedActiveRun = prev.activeSkuRun
        ? (!runIdOrSkuId ||
          prev.activeSkuRun.id === runIdOrSkuId ||
          prev.activeSkuRun.lineId === runIdOrSkuId ||
          prev.activeSkuRun.skuId === runIdOrSkuId
            ? { ...prev.activeSkuRun, speedMultiplier }
            : prev.activeSkuRun)
        : null;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: updatedActiveRun
      };
    });
  };

  // Complete a Line Run Normally (Target finished / batch selesai - no SBL breakdown recorded)
  const handleCompleteLineRun = (runIdOrLineId: string, notes?: string) => {
    const completedAt = new Date().toISOString();
    let completedInfo = '';

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (r.id === runIdOrLineId || (r.lineId === runIdOrLineId && r.isRunning)) {
          completedInfo = `${r.lineName || 'Line'} (${r.skuName} · ${(r.cartonsProducedTotal || 0).toLocaleString()} ktn)`;
          return {
            ...r,
            isRunning: false,
            completionStatus: 'COMPLETED' as const,
            completedAt
          };
        }
        return r;
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || null
      };
    });

    showToast(
      `Produksi selesai normal: ${completedInfo || 'Line'} sekarang berstatus Standby${notes ? ` (${notes})` : ''}.`
    );
  };

  // Stop a line automatically due to Material Shortage (empty / insufficient WIP in Holding Tank)
  const handleTriggerMaterialShortageStop = (
    targetRunOrId: ActiveSkuProductionRun | string,
    reasonMessage: string
  ) => {
    const currentState = stateRef.current;
    const prevRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const targetRun =
      typeof targetRunOrId === 'string'
        ? prevRuns.find(r => r.id === targetRunOrId || (r.lineId === targetRunOrId && r.isRunning))
        : prevRuns.find(r => (targetRunOrId.id ? r.id === targetRunOrId.id : r.lineId === targetRunOrId.lineId && r.isRunning)) ||
          targetRunOrId;

    if (!targetRun) return;

    const stoppedAt = new Date().toISOString();
    const stopLogId = `stop_shortage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newStopLog: ProductionStopLog = {
      id: stopLogId,
      lineId: targetRun.lineId,
      lineName: targetRun.lineName,
      skuId: targetRun.skuId,
      skuName: targetRun.skuName,
      skuCode: targetRun.skuCode,
      shift: targetRun.shift || getCurrentShift().shift,
      startedAt: targetRun.startedAt,
      stoppedAt,
      durationMinutes: 1,
      category: 'MATERIAL_SHORTAGE',
      categoryLabel: 'Material Shortage (WIP Holding Tank Habis)',
      lossType: 'DOWNTIME',
      reasonTitle: reasonMessage || 'Material / WIP di Holding Tank habis atau di bawah kebutuhan 1 karton',
      subReason: 'Stok WIP di Holding Tank habis saat produksi berjalan',
      actionTaken: 'Menunggu pengisian / transfer batch WIP kembali ke Holding Tank',
      operatorName: targetRun.operatorName,
      cartonsProducedDuringRun: targetRun.cartonsProducedTotal || 0
    };

    setState(prev => {
      const currentRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = currentRuns.map(r => {
        const isMatch = targetRun.id
          ? r.id === targetRun.id
          : r.lineId === targetRun.lineId && r.skuId === targetRun.skuId && r.isRunning;
        if (!isMatch) return r;
        return {
          ...r,
          isRunning: false,
          completionStatus: 'STOPPED_SHORTAGE' as const,
          shortageReason: reasonMessage,
          shortageStopLogId: stopLogId,
          sblStopLogId: undefined,
          sblEstimatedMinutes: undefined,
          sblStoppedAt: undefined,
          sblReason: undefined,
          sblCategoryLabel: undefined,
          completedAt: stoppedAt
        };
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || null,
        transactions: {
          ...prev.transactions,
          productionStops: [newStopLog, ...(prev.transactions.productionStops || [])]
        }
      };
    });

    showToast(
      `Material Shortage [${targetRun.lineName || 'Line'} · ${targetRun.skuName}]: ${reasonMessage}`,
      true
    );
  };

  // Resume a stopped line run (e.g. after Material Shortage WIP has been replenished in Holding Tank)
  const handleResumeLineRun = (runIdOrLineId: string) => {
    const currentState = stateRef.current;
    const prevRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const targetRun = prevRuns.find(
      r =>
        !r.isRunning &&
        r.completionStatus !== 'SHIFT_HANDOVER' &&
        (r.id === runIdOrLineId || r.lineId === runIdOrLineId)
    );
    if (!targetRun) {
      showToast('Data run produksi yang akan dilanjutkan tidak ditemukan.', true);
      return;
    }

    if (targetRun.lineId && prevRuns.some(r => r.lineId === targetRun.lineId && r.isRunning)) {
      showToast(`${targetRun.lineName || 'Line'} sedang menjalankan SKU lain.`, true);
      return;
    }

    const availability = checkRunHoldingTankAvailability(
      targetRun.skuId,
      currentState,
      targetRun.selectedHoldingTanks
    );

    if (!availability.isReady) {
      showToast(
        `WIP di Holding Tank belum mencukupi untuk melanjutkan [${targetRun.lineName || 'Line'}]: ${availability.missingDetails.join('; ')}`,
        true
      );
      return;
    }

    const resumedAtIso = new Date().toISOString();
    const currentPeriod = getShiftPeriodInfo();
    const isCrossShiftResume =
      targetRun.shift !== currentPeriod.shift ||
      (targetRun.shiftPeriodKey
        ? !targetRun.shiftPeriodKey.startsWith('MANUAL_HANDOVER_') &&
          targetRun.shiftPeriodKey !== currentPeriod.shiftKey
        : new Date(targetRun.startedAt).getTime() < new Date(currentPeriod.periodStartIso).getTime());

    const targetRunId = isCrossShiftResume
      ? `run_${targetRun.lineId || 'line'}_${Date.now()}_resumed`
      : targetRun.id || `run_${targetRun.lineId || 'line'}_${Date.now()}`;
    const wasSblStop = targetRun.completionStatus === 'STOPPED_SBL';
    const linkedSblLog = targetRun.sblStopLogId
      ? (currentState.transactions.productionStops || []).find(l => l.id === targetRun.sblStopLogId)
      : undefined;
    const sblEstMin =
      targetRun.sblEstimatedMinutes ?? linkedSblLog?.estimatedRepairMinutes ?? linkedSblLog?.durationMinutes ?? 0;
    const sblStoppedTimestamp = targetRun.sblStoppedAt || linkedSblLog?.stoppedAt || targetRun.completedAt;
    const sblElapsedMin = sblStoppedTimestamp
      ? Math.max(1, Math.round((Date.now() - new Date(sblStoppedTimestamp).getTime()) / 60000))
      : 1;
    const sblSavedMin = Math.max(0, sblEstMin - sblElapsedMin);

    setState(prev => {
      const currentRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      let resumedRunObj: ActiveSkuProductionRun | null = null;
      const updatedRuns: ActiveSkuProductionRun[] = [];

      currentRuns.forEach(r => {
        const isMatch = targetRun.id ? r.id === targetRun.id : r.lineId === targetRun.lineId && r.skuId === targetRun.skuId;
        if (!isMatch) {
          updatedRuns.push(r);
          return;
        }
        if (isCrossShiftResume) {
          const remaining =
            r.plannedCartons && r.plannedCartons > 0
              ? Math.max(1, r.plannedCartons - (r.cartonsProducedTotal || 0))
              : (r.targetPerHour || 500) * 8;
          resumedRunObj = {
            ...r,
            id: targetRunId,
            shift: currentPeriod.shift,
            shiftPeriodKey: currentPeriod.shiftKey,
            startedAt: resumedAtIso,
            isRunning: true,
            completionStatus: 'RUNNING' as const,
            cartonsProducedTotal: 0,
            plannedCartons: remaining,
            carriedOverFromShift: r.shift,
            previousShiftCartons: r.cartonsProducedTotal || 0,
            shortageReason: undefined,
            shortageStopLogId: undefined,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            completedAt: undefined,
            lastDeductionTime: resumedAtIso
          };
          updatedRuns.push(resumedRunObj, {
            ...r,
            isRunning: false,
            completionStatus: 'SHIFT_HANDOVER' as const,
            handoverToShift: currentPeriod.shift,
            completedAt: resumedAtIso
          });
        } else {
          resumedRunObj = {
            ...r,
            id: targetRunId,
            isRunning: true,
            completionStatus: 'RUNNING' as const,
            shortageReason: undefined,
            shortageStopLogId: undefined,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            completedAt: undefined,
            lastDeductionTime: resumedAtIso
          };
          updatedRuns.push(resumedRunObj);
        }
      });

      const updatedStops = (prev.transactions.productionStops || []).map(log => {
        if (targetRun.shortageStopLogId && log.id === targetRun.shortageStopLogId) {
          const elapsedMin = Math.max(
            1,
            Math.round((Date.now() - new Date(log.stoppedAt).getTime()) / 60000)
          );
          return {
            ...log,
            durationMinutes: elapsedMin,
            actualRepairMinutes: elapsedMin,
            resumedAt: resumedAtIso,
            actionTaken: 'Produksi dilanjutkan kembali setelah WIP tersedia di Holding Tank'
          };
        }
        if (targetRun.sblStopLogId && log.id === targetRun.sblStopLogId) {
          const estMin = targetRun.sblEstimatedMinutes ?? log.estimatedRepairMinutes ?? log.durationMinutes;
          const elapsedMin = Math.max(
            1,
            Math.round((Date.now() - new Date(log.stoppedAt).getTime()) / 60000)
          );
          const savedMin = Math.max(0, estMin - elapsedMin);
          const summaryNote =
            savedMin > 0
              ? `Perbaikan selesai ${elapsedMin} mnt (lebih cepat ${savedMin} mnt dari est. ${estMin} mnt) · Produksi dilanjutkan`
              : `Perbaikan selesai (${elapsedMin} mnt dari est. ${estMin} mnt) · Produksi dilanjutkan`;
          return {
            ...log,
            estimatedRepairMinutes: estMin,
            actualRepairMinutes: elapsedMin,
            durationMinutes: elapsedMin,
            resumedAt: resumedAtIso,
            actionTaken: log.actionTaken ? `${log.actionTaken} | ${summaryNote}` : summaryNote
          };
        }
        return log;
      });

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: resumedRunObj || updatedRuns.find(r => r.isRunning) || null,
        transactions: {
          ...prev.transactions,
          productionStops: updatedStops
        }
      };
    });

    setTimeout(() => {
      const res = handleProduceCartons(
        targetRun.skuId,
        1,
        targetRun.operatorName,
        wasSblStop
          ? `Lanjut Produksi [${targetRun.lineName || 'Line'}]: ${targetRun.skuName} setelah perbaikan SBL (${sblElapsedMin} mnt)`
          : `Lanjut Produksi [${targetRun.lineName || 'Line'}]: ${targetRun.skuName} setelah pengisian WIP Holding Tank`,
        targetRun.selectedHoldingTanks,
        targetRunId,
        targetRun.lineId,
        targetRun.lineName
      );
      if (!res.success) {
        handleTriggerMaterialShortageStop(targetRunId, res.message);
      }
    }, 50);

    const remainingTarget = targetRun.plannedCartons
      ? Math.max(0, targetRun.plannedCartons - (targetRun.cartonsProducedTotal || 0))
      : 0;
    if (wasSblStop) {
      showToast(
        sblSavedMin > 0
          ? `[${targetRun.lineName || 'Line'}] Perbaikan selesai dalam ${sblElapsedMin} menit (lebih cepat ${sblSavedMin} mnt dari estimasi ${sblEstMin} mnt)! Produksi "${targetRun.skuName}" dilanjutkan.`
          : `[${targetRun.lineName || 'Line'}] Perbaikan selesai (${sblElapsedMin} menit). Produksi "${targetRun.skuName}" dilanjutkan kembali.`
      );
    } else {
      showToast(
        `[${targetRun.lineName || 'Line'}] Produksi "${targetRun.skuName}" dilanjutkan kembali! WIP siap (±${availability.minPossibleCartons.toLocaleString()} ktn${remainingTarget > 0 ? `, sisa target ${remainingTarget.toLocaleString()} ktn` : ''}).`
      );
    }
  };

  // Stop Specific Line / SKU Production due to Problem (Six Big Losses TPM)
  const handleStopSkuProduction = (stopData: Omit<ProductionStopLog, 'id'>) => {
    const newStopLog: ProductionStopLog = {
      ...stopData,
      estimatedRepairMinutes: stopData.estimatedRepairMinutes ?? stopData.durationMinutes,
      id: `stop_${Date.now()}`
    };

    const targetLineId = stopData.lineId;
    const targetSkuId = stopData.skuId;
    const completedAt = new Date().toISOString();
    const isMaterialShortage = stopData.category === 'MATERIAL_SHORTAGE';
    const estMinutes = stopData.estimatedRepairMinutes ?? stopData.durationMinutes;

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        const isMatch = targetLineId
          ? r.lineId === targetLineId && r.isRunning
          : r.skuId === targetSkuId && r.isRunning;
        if (isMatch) {
          return {
            ...r,
            isRunning: false,
            completionStatus: isMaterialShortage ? ('STOPPED_SHORTAGE' as const) : ('STOPPED_SBL' as const),
            shortageReason: isMaterialShortage ? stopData.reasonTitle : undefined,
            shortageStopLogId: isMaterialShortage ? newStopLog.id : undefined,
            sblStopLogId: !isMaterialShortage ? newStopLog.id : undefined,
            sblEstimatedMinutes: !isMaterialShortage ? estMinutes : undefined,
            sblStoppedAt: !isMaterialShortage ? (stopData.stoppedAt || completedAt) : undefined,
            sblReason: !isMaterialShortage ? stopData.reasonTitle : undefined,
            sblCategoryLabel: !isMaterialShortage ? stopData.categoryLabel : undefined,
            completedAt
          };
        }
        return r;
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || null,
        transactions: {
          ...prev.transactions,
          productionStops: [newStopLog, ...(prev.transactions.productionStops || [])]
        }
      };
    });

    showToast(
      isMaterialShortage
        ? `Produksi ${stopData.lineName ? `[${stopData.lineName}] ` : ''}"${stopData.skuName}" dihentikan: Material Shortage tercatat. Dapat dilanjutkan kembali setelah WIP Holding Tank terisi.`
        : `Produksi ${stopData.lineName ? `[${stopData.lineName}] ` : ''}"${stopData.skuName}" dihentikan (SBL · Est. perbaikan ${estMinutes} mnt). Klik "Start Produksi Kembali" jika perbaikan selesai.`
    );
  };

  // Stop All Running Lines Production
  const handleStopAllSkuProduction = () => {
    const completedAt = new Date().toISOString();
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r =>
        r.isRunning
          ? { ...r, isRunning: false, completionStatus: 'COMPLETED' as const, completedAt }
          : r
      );
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: null
      };
    });
    showToast('Seluruh line produksi yang sedang berjalan telah dihentikan.');
  };

  // Shift Transition / Handover Logic:
  // Every start of a new shift stops running production from the previous shift and continues it into the next shift.
  const handleTriggerShiftHandover = (options?: {
    isAutomatic?: boolean;
    targetShift?: ShiftNumber;
    targetPeriodKey?: string;
    forceHandoverAll?: boolean;
  }) => {
    const currentState = stateRef.current;
    const curRuns = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const currentPeriod = getShiftPeriodInfo(new Date());
    const isAuto = options?.isAutomatic ?? false;
    const forceAll = options?.forceHandoverAll ?? !isAuto;

    const runsToHandover = curRuns.filter(r => {
      if (!r.isRunning) return false;
      if (forceAll) return true;
      const isManual = r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_');
      if (isManual) {
        return Boolean(options?.targetShift && r.shift !== options.targetShift);
      }
      return (
        r.shift !== currentPeriod.shift ||
        (r.shiftPeriodKey
          ? r.shiftPeriodKey !== currentPeriod.shiftKey
          : new Date(r.startedAt).getTime() < new Date(currentPeriod.periodStartIso).getTime())
      );
    });

    if (runsToHandover.length === 0) {
      if (!isAuto) {
        showToast('Tidak ada line produksi aktif yang perlu di-handover ke shift berikutnya.', true);
      }
      return;
    }

    const handoverIso = new Date().toISOString();
    const handoverRunIds = new Set(runsToHandover.map((r, i) => r.id || `${r.lineId}_${r.skuId}_${i}`));
    const firstFromShift = runsToHandover[0].shift;
    const resolvedGlobalNextShift = isAuto
      ? options?.targetShift || currentPeriod.shift
      : getNextShiftNumber(firstFromShift);

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const continuedRuns: ActiveSkuProductionRun[] = [];
      const archivedPrevRuns: ActiveSkuProductionRun[] = [];
      const untouchedRuns: ActiveSkuProductionRun[] = [];

      prevRuns.forEach((r, idx) => {
        const key = r.id || `${r.lineId}_${r.skuId}_${idx}`;
        const matches =
          r.isRunning &&
          (forceAll ||
            handoverRunIds.has(key) ||
            (!r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_') &&
              (r.shift !== currentPeriod.shift ||
                (r.shiftPeriodKey ? r.shiftPeriodKey !== currentPeriod.shiftKey : false))));

        if (!matches) {
          untouchedRuns.push(r);
          return;
        }

        const nextShift = isAuto
          ? options?.targetShift || currentPeriod.shift
          : getNextShiftNumber(r.shift);
        const nextPeriodKey = isAuto
          ? options?.targetPeriodKey || currentPeriod.shiftKey
          : `MANUAL_HANDOVER_${currentPeriod.shiftKey}_${Date.now()}`;

        const skuObj = prev.master.skus.find(s => s.id === r.skuId);
        const defaultShiftPlan = (skuObj?.targetHour || r.targetPerHour || 500) * 8;
        const remainingTarget =
          r.plannedCartons && r.plannedCartons > 0
            ? Math.max(0, r.plannedCartons - (r.cartonsProducedTotal || 0))
            : defaultShiftPlan;
        const nextPlannedCartons = remainingTarget > 0 ? remainingTarget : defaultShiftPlan;

        archivedPrevRuns.push({
          ...r,
          isRunning: false,
          completionStatus: 'SHIFT_HANDOVER' as const,
          handoverToShift: nextShift,
          completedAt: handoverIso
        });

        continuedRuns.push({
          ...r,
          id: `run_${r.lineId || 'line'}_${Date.now()}_${idx}`,
          shift: nextShift,
          shiftPeriodKey: nextPeriodKey,
          startedAt: handoverIso,
          completedAt: undefined,
          isRunning: true,
          completionStatus: 'RUNNING' as const,
          cartonsProducedTotal: 0,
          plannedCartons: nextPlannedCartons,
          carriedOverFromShift: r.shift,
          previousShiftCartons: r.cartonsProducedTotal || 0,
          handoverToShift: undefined,
          shortageReason: undefined,
          shortageStopLogId: undefined,
          sblStopLogId: undefined,
          sblEstimatedMinutes: undefined,
          sblStoppedAt: undefined,
          sblReason: undefined,
          sblCategoryLabel: undefined,
          lastDeductionTime: handoverIso
        });
      });

      const updatedRuns = [...continuedRuns, ...archivedPrevRuns, ...untouchedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: continuedRuns[0] || updatedRuns.find(r => r.isRunning) || null,
        lastShiftHandover: {
          fromShift: firstFromShift,
          toShift: resolvedGlobalNextShift,
          timestamp: handoverIso,
          handedOverCount: continuedRuns.length
        }
      };
    });

    showToast(
      `Pergantian Shift: ${runsToHandover.length} line produksi dari Shift ${firstFromShift} dihentikan & otomatis dilanjutkan ke Shift ${resolvedGlobalNextShift}.`
    );
  };

  // Automatic clock watcher for shift boundaries (07:01 Shift 1, 15:01 Shift 2, 23:01 Shift 3)
  const lastClockShiftKeyRef = useRef<string>(getShiftPeriodInfo().shiftKey);
  useEffect(() => {
    const checkShiftBoundary = () => {
      const period = getShiftPeriodInfo(new Date());
      const clockBoundaryCrossed = lastClockShiftKeyRef.current !== period.shiftKey;
      if (clockBoundaryCrossed) {
        lastClockShiftKeyRef.current = period.shiftKey;
      }

      const runsNow =
        stateRef.current.activeSkuRuns ||
        (stateRef.current.activeSkuRun ? [stateRef.current.activeSkuRun] : []);
      const hasPendingHandover = runsNow.some(r => {
        if (!r.isRunning) return false;
        const isManual = r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_');
        if (isManual) {
          return clockBoundaryCrossed && r.shift !== period.shift;
        }
        return (
          r.shift !== period.shift ||
          (r.shiftPeriodKey
            ? r.shiftPeriodKey !== period.shiftKey
            : new Date(r.startedAt).getTime() < new Date(period.periodStartIso).getTime())
        );
      });

      if (hasPendingHandover) {
        handleTriggerShiftHandover({
          isAutomatic: true,
          targetShift: period.shift,
          targetPeriodKey: period.shiftKey,
          forceHandoverAll: false
        });
      }
    };

    checkShiftBoundary();
    const timer = setInterval(checkShiftBoundary, 3000);
    return () => clearInterval(timer);
  }, []);

  // Engine Pengurangan Isi Tangki Otomatis Real-Time untuk SEMUA Line Produksi yang Berjalan Bersamaan
  const runningRunsSnapshot = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
    r => r.isRunning
  );
  const runningRunsSignature = runningRunsSnapshot
    .map(r => `${r.id || r.lineId || r.skuId}:${r.skuId}:${r.speedMultiplier || 1}`)
    .join('|');

  useEffect(() => {
    const prevRuns = stateRef.current.activeSkuRuns || (stateRef.current.activeSkuRun ? [stateRef.current.activeSkuRun] : []);
    const runningRuns = prevRuns.filter(r => r.isRunning);
    if (runningRuns.length === 0) return;

    const intervalIds: NodeJS.Timeout[] = [];

    runningRuns.forEach(run => {
      const currentSku = stateRef.current.master.skus.find(s => s.id === run.skuId);
      if (!currentSku) return;

      const targetPerHour = currentSku.targetHour || 600;
      const speedMult = run.speedMultiplier || 1;
      const secondsPerCarton = 3600 / targetPerHour;
      const intervalMs = Math.max(800, Math.round((secondsPerCarton / speedMult) * 1000));

      const timer = setInterval(() => {
        const activeState = stateRef.current;
        const runsNow = activeState.activeSkuRuns || (activeState.activeSkuRun ? [activeState.activeSkuRun] : []);
        const thisRun =
          (run.id ? runsNow.find(r => r.id === run.id) : undefined) ||
          (run.lineId ? runsNow.find(r => r.lineId === run.lineId && r.isRunning) : undefined) ||
          runsNow.find(r => r.skuId === run.skuId && r.isRunning);
        if (!thisRun?.isRunning) return;

        const res = handleProduceCartons(
          run.skuId,
          1,
          thisRun.operatorName || 'Auto Depletion Engine (BOM)',
          `Auto [${thisRun.lineName || 'Line'}] (${currentSku.name} - ${targetPerHour} ktn/jam) - Pengurangan Holding Tank sesuai BOM`,
          thisRun.selectedHoldingTanks,
          thisRun.id,
          thisRun.lineId,
          thisRun.lineName
        );

        if (!res.success) {
          handleTriggerMaterialShortageStop(thisRun, res.message);
        }
      }, intervalMs);

      intervalIds.push(timer);
    });

    return () => {
      intervalIds.forEach(id => clearInterval(id));
    };
  }, [runningRunsSignature, state.master.skus]);


  // Create Single Request
  const handleCreateRequest = (reqData: Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>) => {
    setState(prev => {
      const count = prev.transactions.requests.length + 1;
      const reqNumber = `REQ-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
      const uniqueSuffix = Math.random().toString(36).substring(2, 8);
      const newReq: MaterialRequest = {
        ...reqData,
        id: `req_${Date.now()}_${uniqueSuffix}`,
        requestNumber: reqNumber,
        date: new Date().toISOString().slice(0, 10),
        status: 'Pending'
      };

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          requests: [newReq, ...prev.transactions.requests]
        }
      };
    });
  };

  // Create Multiple Requests atomically (from shopping cart checkout)
  const handleCreateMultipleRequests = (items: Array<Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>>) => {
    if (items.length === 0) return;
    setState(prev => {
      const baseCount = prev.transactions.requests.length;
      const datePrefix = new Date().toISOString().slice(0, 7).replace('-', '');
      const dateStr = new Date().toISOString().slice(0, 10);
      const timestamp = Date.now();

      const newRequests: MaterialRequest[] = items.map((reqData, idx) => {
        const count = baseCount + idx + 1;
        const reqNumber = `REQ-${datePrefix}-${String(count).padStart(3, '0')}`;
        const uniqueSuffix = Math.random().toString(36).substring(2, 8);
        return {
          ...reqData,
          id: `req_${timestamp}_${idx}_${uniqueSuffix}`,
          requestNumber: reqNumber,
          date: dateStr,
          status: 'Pending'
        };
      });

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          requests: [...newRequests, ...prev.transactions.requests]
        }
      };
    });
  };

  // Receive Material
  const handleReceiveMaterial = (receiptData: Omit<MaterialReceipt, 'id' | 'receiptNumber' | 'date'>) => {
    setState(prev => {
      const count = prev.transactions.receipts.length + 1;
      const receiptNumber = `RCV-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
      const newReceipt: MaterialReceipt = {
        ...receiptData,
        id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        receiptNumber,
        date: new Date().toISOString().slice(0, 10)
      };

      // Mark request as received if linked
      const updatedRequests = prev.transactions.requests.map(r => {
        if (receiptData.requestId && r.id === receiptData.requestId) {
          return { ...r, status: 'Received' as const };
        }
        return r;
      });

      // If location is Storage Tank, add to liquid level
      let updatedTankLevel = prev.tank.level;
      if (receiptData.location === 'STORAGE_TANK') {
        updatedTankLevel = Math.min(prev.tank.maxCapacity, updatedTankLevel + receiptData.receivedQty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          requests: updatedRequests,
          receipts: [newReceipt, ...prev.transactions.receipts]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // Record Usage (Shift selalu mengikuti jam shift berjalan saat transaksi dicatat)
  const handleRecordUsage = (usageData: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => {
    const liveShift = getCurrentShift().shift;
    setState(prev => {
      const count = prev.transactions.usages.length + 1;
      const usageNumber = `USG-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
      const newUsage: MaterialUsage = {
        ...usageData,
        shift: liveShift,
        id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        usageNumber,
        date: new Date().toISOString().slice(0, 10)
      };

      let updatedTankLevel = prev.tank.level;
      const mObj = prev.master.materials.find(m => m.id === usageData.materialId);

      // If source location is tank or material is liquid
      if (usageData.sourceLocation === 'STORAGE_TANK' || (mObj && mObj.type === 'liquid')) {
        updatedTankLevel = Math.max(0, updatedTankLevel - usageData.usageQty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: [newUsage, ...prev.transactions.usages]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // Start WIP Production Batch (strictly 1 batch per selected machine at a time)
  const handleStartWipBatch = (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => {
    // Check if there is already an active batch on this specific machine
    const activeForMachine = (state.transactions.wipBatches || []).find(
      b => b.targetMachineId === batchData.targetMachineId && b.status === 'SEDANG_PRODUKSI'
    );
    if (activeForMachine) {
      const mach = state.master.machines.find(m => m.id === batchData.targetMachineId);
      const machName = mach ? `${mach.code} - ${mach.name}` : 'Mesin terpilih';
      showToast(`${machName} masih memiliki 1 batch aktif yang belum selesai (${activeForMachine.batchCode})! Selesaikan atau batalkan terlebih dahulu.`, true);
      return;
    }

    const liveShift = getCurrentShift().shift;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const startedAt = `${dateStr} ${timeStr}`;
    const batchCount = (state.transactions.wipBatches || []).length + 1;
    const batchCode = `PK-WIP-${dateStr.replace(/-/g, '').slice(0, 6)}-${String(batchCount).padStart(3, '0')}`;
    const batchId = `wpb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newBatch: WipProductionBatch = {
      ...batchData,
      shift: liveShift, // Pemakaian material & batch selalu mengikuti shift sesuai jam berjalan
      id: batchId,
      batchCode,
      status: 'SEDANG_PRODUKSI',
      startedAt
    };

    // Create material usage records for each material in BOM
    const newUsages: MaterialUsage[] = [];
    let tankDeduction = 0;

    batchData.materials.forEach((matItem, idx) => {
      const uCount = state.transactions.usages.length + 1 + idx;
      const usageNumber = `USG-${dateStr.slice(0, 7).replace('-', '')}-${String(uCount).padStart(3, '0')}`;
      const palletSummary = matItem.palletAllocations && matItem.palletAllocations.length > 0
        ? ` [Alokasi Pallet FIFO: ${matItem.palletAllocations.map(a => `${a.palletLabel} (${a.bagsUsed} zak @ ${a.weightPerBagKg} kg = ${a.subtotalKg.toFixed(2)} kg)`).join(', ')}]`
        : '';

      newUsages.push({
        id: `use_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        usageNumber,
        date: dateStr,
        shift: liveShift,
        skuId: batchData.skuId || state.master.skus[0]?.id || 'SKU_GENERIC',
        wipId: batchData.wipId,
        materialId: matItem.materialId,
        qty: matItem.requiredKg,
        batch: 1,
        usageQty: matItem.actualUsedKg,
        sourceLocation: matItem.sourceLocation,
        operatorName: batchData.operatorName || `Operator Shift ${liveShift}`,
        notes: `Produksi Batch ${batchCode} (1 Batch ${batchData.wipName})${palletSummary}`,
        batchOrderId: batchId,
        palletAllocations: matItem.palletAllocations
      });

      const mObj = state.master.materials.find(m => m.id === matItem.materialId);
      if (matItem.sourceLocation === 'STORAGE_TANK' || (mObj && mObj.type === 'liquid')) {
        tankDeduction += matItem.actualUsedKg;
      }
    });

    const targetMach = state.master.machines.find(m => m.id === batchData.targetMachineId);
    const machDisplay = targetMach ? `${targetMach.code} - ${targetMach.name}` : '';

    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (batchData.targetMachineId && m.id === batchData.targetMachineId) {
          return {
            ...m,
            currentWipId: batchData.wipId,
            currentWipName: batchData.wipName
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          wipBatches: [newBatch, ...(prev.transactions.wipBatches || [])],
          usages: [...newUsages, ...prev.transactions.usages]
        },
        tank: {
          ...prev.tank,
          level: Math.max(0, prev.tank.level - tankDeduction)
        }
      };
    });

    showToast(`Perintah Kerja ${batchCode} dimulai pada mesin ${machDisplay || 'Produksi'} (1 Batch ${batchData.wipName}). Bahan baku dipotong dari stok.`);
  };

  // Complete WIP Batch with Auto-Transfer into designated Tank
  const handleCompleteWipBatch = (batchId: string) => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const completedAt = `${dateStr} ${timeStr}`;

    let completedBatchName = '';
    let tankTransferMessage = '';

    setState(prev => {
      let wipId = '';
      let batchWeight = 0;
      let batchCode = '';
      let wipName = '';

      const updatedBatches = (prev.transactions.wipBatches || []).map(b => {
        if (b.id === batchId) {
          completedBatchName = `${b.batchCode} (${b.wipName})`;
          wipId = b.wipId;
          batchWeight = b.batchWeightKg;
          batchCode = b.batchCode;
          wipName = b.wipName;
          return {
            ...b,
            status: 'SELESAI' as const,
            completedAt
          };
        }
        return b;
      });

      // Find destination tank: batch target tank first, then WIP master target tanks, then assigned tank
      const activeBatchObj = (prev.transactions.wipBatches || []).find(b => b.id === batchId);
      const wipDef = prev.master.wips.find(w => w.id === wipId);
      const targetTankId = activeBatchObj?.targetTankId || wipDef?.targetTankId || (wipDef?.targetTankIds && wipDef.targetTankIds[0]) || prev.master.tanks.find(t => t.assignedWipId === wipId)?.id;

      let updatedTanks = prev.master.tanks;
      let newTankLogs = prev.transactions.tankLogs || [];

      if (targetTankId) {
        updatedTanks = prev.master.tanks.map(t => {
          if (t.id === targetTankId) {
            const prevLvl = t.currentLevelKg;
            const newLvl = Math.min(t.capacityKg, prevLvl + batchWeight);
            tankTransferMessage = ` & otomatis ditransfer ${batchWeight.toFixed(1)} kg ke ${t.code} (${t.name})`;

            newTankLogs = [
              {
                id: `tl_${Date.now()}`,
                timestamp: new Date().toISOString(),
                tankId: t.id,
                tankCode: t.code,
                tankName: t.name,
                type: 'WIP_BATCH_INFLOW',
                amountKg: batchWeight,
                previousLevelKg: prevLvl,
                newLevelKg: newLvl,
                wipId,
                wipName,
                batchCode,
                notes: `Transfer selesai batch ${batchCode} ke ${t.code}`
              },
              ...newTankLogs
            ];

            return {
              ...t,
              currentLevelKg: newLvl
            };
          }
          return t;
        });
      }

      // Release machine currentWip assignment upon completion
      const completingBatch = (prev.transactions.wipBatches || []).find(b => b.id === batchId);
      let updatedMachines = prev.master.machines;
      if (completingBatch?.targetMachineId) {
        updatedMachines = prev.master.machines.map(m => {
          if (m.id === completingBatch.targetMachineId && m.currentWipId === completingBatch.wipId) {
            return {
              ...m,
              currentWipId: undefined,
              currentWipName: undefined
            };
          }
          return m;
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines,
          tanks: updatedTanks
        },
        transactions: {
          ...prev.transactions,
          wipBatches: updatedBatches,
          tankLogs: newTankLogs
        }
      };
    });

    showToast(`Batch WIP ${completedBatchName} selesai diproduksi${tankTransferMessage}!`);

    // Trigger synthetic audio alarm chime & visual modal notification
    const currentBatches = stateRef.current.transactions.wipBatches || [];
    const completedBatch = currentBatches.find(b => b.id === batchId);
    if (completedBatch) {
      const wipDef = stateRef.current.master.wips.find(w => w.id === completedBatch.wipId);
      const targetTankId = wipDef?.targetTankId || stateRef.current.master.tanks.find(t => t.assignedWipId === completedBatch.wipId)?.id;
      setAlarmWipBatch({
        ...completedBatch,
        status: 'SELESAI',
        completedAt,
        targetTankId
      });
      playWipCompletionChime();
    }
  };

  // Auto-completion of WIP Production Batches when duration expired + Audio Alarm
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (!stateRef.current.isAuthenticated) return;
      const activeBatches = (stateRef.current.transactions.wipBatches || []).filter(
        b => b.status === 'SEDANG_PRODUKSI'
      );
      if (activeBatches.length === 0) return;

      const now = Date.now();
      activeBatches.forEach(batch => {
        if (batch.estimatedCompletionTime) {
          const compTime = new Date(batch.estimatedCompletionTime).getTime();
          if (now >= compTime) {
            handleCompleteWipBatch(batch.id);
          }
        }
      });
    }, 2000);

    return () => clearInterval(checkInterval);
  }, []);

  // Cancel WIP Batch
  const handleCancelWipBatch = (batchId: string) => {
    setState(prev => {
      const cancellingBatch = (prev.transactions.wipBatches || []).find(b => b.id === batchId);
      let updatedMachines = prev.master.machines;
      if (cancellingBatch?.targetMachineId) {
        updatedMachines = prev.master.machines.map(m => {
          if (m.id === cancellingBatch.targetMachineId && m.currentWipId === cancellingBatch.wipId) {
            return {
              ...m,
              currentWipId: undefined,
              currentWipName: undefined
            };
          }
          return m;
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          wipBatches: (prev.transactions.wipBatches || []).map(b =>
            b.id === batchId ? { ...b, status: 'DIBATALKAN' as const } : b
          )
        }
      };
    });
    showToast('Perintah kerja batch WIP telah dibatalkan', true);
  };

  // Jump from Request row to Receive form
  const handleJumpToReceive = (req: MaterialRequest) => {
    setPreselectedRequestId(req.id);
    handleSwitchTab('penerimaan');
  };

  // Titles for views
  const viewTitles: Record<AppState['currentTab'], string> = {
    'admin-portal': 'Cockpit Modul MRP & WMS Administrator',
    dashboard: 'Manufacturing - Simulasi Produksi & Status Line',
    'tank-monitoring': 'Inventory & Tangki WIP - Monitoring 5 Tangki',
    'shift-summary': 'Ringkasan Produksi Shift (Output, SBL & Konsumsi Material)',
    permintaan: 'Permintaan Material GDRM (Warehouse)',
    penerimaan: 'Penerimaan Material & Inbound Kedatangan',
    pemakaian: 'Work Order WIP & Pemakaian Material Resep',
    master: 'Konfigurasi Master BOM, Resep, Mesin & Tangki',
    'bom-calculator': 'Kalkulator Kebutuhan Produksi & Formulasi BOM',
    reports: 'Laporan Saldo Stock Aktual Shift (PDF Landscape)'
  };

  // 1. TAMPILAN AWAL: WIZARD REGISTRASI ADMIN PERTAMA ATAU PORTAL SIGN IN
  if (!state.isAuthenticated || setupStatus !== 'ready') {
    return (
      <div
        key={`auth-portal-shell-${authViewKey}`}
        className="min-h-screen w-full overflow-y-auto bg-slate-950 text-slate-100 font-sans"
      >
        <AuthPortalView
          key={`auth-portal-${authViewKey}`}
          state={state}
          theme={state.theme === 'daylight' || state.theme === 'light' ? 'daylight' : 'midnight'}
          onToggleTheme={handleToggleTheme}
          setupStatus={setupStatus}
          cloudFactoryName={cloudFactoryName}
          firebaseUser={firebaseUser}
          cloudAuthRole={cloudAuthRole}
          isSyncingCloud={isSyncingCloud}
          authError={authErrorBanner}
          onClearAuthError={() => setAuthErrorBanner(null)}
          onRetryCheckSetup={runSetupCheck}
          onCompleteFirstAdminSetup={handleCompleteFirstAdminSetup}
          onGoogleCloudLogin={handleGoogleCloudLogin}
          onFirebaseSignOut={handleFirebaseSignOut}
          onLoginSuccess={handleLoginSuccess}
          showToast={showToast}
        />

        {/* Global Toast Notification */}
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] transform transition-all duration-300 pointer-events-none ${
            toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'
          }`}
        >
          <div className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium flex items-center space-x-2 border ${
            toast.isError
              ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
              : 'bg-slate-900/95 text-slate-100 border-slate-700'
          }`}>
            {toast.isError ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toast.msg}</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. TAMPILAN SETELAH LOGIN (NAVIGASI MODEL POPUP DRAWER & KONTEN LEBAR PENUH)
  return (
    <div
      key={`app-shell-${authViewKey}`}
      className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100 font-sans select-none"
    >
      {/* Sidebar: Model Popup Drawer (Slide-Over) untuk Komputer, Tablet & Mobile */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        state={state}
        onSwitchTab={handleSwitchTab}
        onOpenAdminModal={() => setIsAdminModalOpen(true)}
        onOpenResetModal={() => setIsResetModalOpen(true)}
        onLoadSampleData={handleLoadSampleData}
        onExportData={handleExportJSON}
        onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
        onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* Main Right Area: Header, Live Ticker, and Content View */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Top Header */}
        <Header
          state={state}
          theme={state.theme === 'daylight' || state.theme === 'light' ? 'daylight' : 'midnight'}
          onToggleTheme={handleToggleTheme}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          onOpenAdminModal={() => setIsAdminModalOpen(true)}
          onOpenTankModal={() => setIsTankModalOpen(true)}
          onLoadSampleData={handleLoadSampleData}
          onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
          onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
          onOpenUserManagement={() => setIsUserManagementOpen(true)}
          onSwitchTab={handleSwitchTab}
          onSignOut={handleSignOut}
          currentViewTitle={viewTitles[state.currentTab] || 'ProdTrack MES'}
        />

        {/* Live Factory Telemetry Ticker Bar */}
        <div className="bg-slate-900/90 border-b border-slate-800/80 px-3 sm:px-4 py-1.5 flex items-center justify-between overflow-x-auto no-scrollbar gap-2 shrink-0 text-xs">
          <div className="flex items-center space-x-2 shrink-0">
            {/* Shift Beacon */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2.5 py-1 rounded-full border border-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white text-[11px]">Shift {getCurrentShift().shift}</span>
              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">({getCurrentShift().timeRange})</span>
            </div>

            {/* Running Multi-SKU Ticker */}
            {(() => {
              const runs = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(r => r.isRunning);
              if (runs.length > 0) {
                return (
                  <div
                    onClick={() => handleSwitchTab('dashboard')}
                    className="flex items-center space-x-1.5 cursor-pointer bg-cyan-950/70 border border-cyan-500/50 px-2.5 py-1 rounded-full text-[11px] hover:bg-cyan-900/60 transition"
                    title="Klik untuk membuka modul Manufacturing & melihat SKU yang sedang diproses"
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span className="font-bold text-cyan-300 font-mono">
                      {runs.length === 1 ? '1 Line Aktif:' : `${runs.length} Line Aktif:`}
                    </span>
                    <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-[450px]">
                      {runs.map((r, i) => (
                        <span key={r.id || `${r.lineId || ''}_${r.skuId}_${i}`} className="flex items-center space-x-1 whitespace-nowrap">
                          {i > 0 && <span className="text-slate-500">·</span>}
                          {r.lineName && <span className="text-cyan-300 font-bold">{r.lineName}:</span>}
                          <span className="text-white font-semibold">{r.skuName}</span>
                          <span className="text-cyan-400 font-mono text-[10px]">
                            ({(r.cartonsProducedTotal || 0).toLocaleString()}{r.plannedCartons ? `/${r.plannedCartons.toLocaleString()}` : ''} ktn)
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              }
              return (
                <div className="flex items-center space-x-1 bg-slate-950/60 px-2.5 py-1 rounded-full border border-slate-800 text-[11px] text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  <span>Line Standby</span>
                </div>
              );
            })()}

            {/* Active Running WIP Batch Countdown Indicator */}
            {(() => {
              const running = (state.transactions.wipBatches || []).find(b => b.status === 'SEDANG_PRODUKSI');
              if (!running) return null;
              return (
                <div
                  onClick={() => handleSwitchTab('pemakaian')}
                  className="cursor-pointer flex items-center space-x-1.5 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-full text-[11px] hover:border-amber-400 transition"
                  title="Klik untuk membuka rincian batch di Pemakaian"
                >
                  <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                  <span className="text-amber-300 font-semibold">{running.batchCode} ({running.wipName})</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCompleteWipBatch(running.id);
                    }}
                    className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9px] font-black uppercase hover:bg-amber-400 active:scale-95 ml-1"
                    title="Selesaikan batch sekarang & picu alarm"
                  >
                    ⚡ Selesai
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Quick Report Download Trigger (One UI Pill) */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setIsPdfReportModalOpen(true)}
              className="flex items-center space-x-1 bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 px-2.5 py-1 rounded-full text-[11px] font-semibold transition active:scale-95"
              title="Download Laporan Saldo Stock Aktual Shift Format PDF (A4 Landscape)"
            >
              <FileText className="w-3 h-3 text-rose-400" />
              <span>Laporan Shift (PDF)</span>
            </button>
          </div>
        </div>

        {/* Main Content View Area */}
        <main className={`flex-1 ${state.currentTab === 'admin-portal' ? 'overflow-y-auto lg:overflow-hidden p-2 sm:p-3 lg:p-4' : 'overflow-y-auto p-3 sm:p-4 pb-6 sm:pb-8'} bg-slate-950 relative`}>
          {state.currentTab === 'admin-portal' && (
            <AdminPortalView
              state={state}
              onSwitchTab={handleSwitchTab}
              onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
              onOpenTankModal={() => setIsTankModalOpen(true)}
              onOpenUserManagement={() => setIsUserManagementOpen(true)}
              onOpenStockAdjustment={handleOpenStockAdjustment}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'dashboard' && (
            <DashboardView
              state={state}
              liveLineStatus={liveDashboardLineStatus}
              onOpenTankModal={() => setIsTankModalOpen(true)}
              onSwitchTab={handleSwitchTab}
              onTransferStock={handleTransferStock}
              onProduceCartons={handleProduceCartons}
              onStartSkuProduction={handleStartSkuProduction}
              onStartMultipleSkus={handleStartMultipleSkus}
              onStartLineBatchRuns={handleStartLineBatchRuns}
              onCompleteLineRun={handleCompleteLineRun}
              onResumeLineRun={handleResumeLineRun}
              onRecordMaterialShortage={handleTriggerMaterialShortageStop}
              onUpdateRunHoldingTank={handleUpdateRunHoldingTank}
              onStopSkuProduction={handleStopSkuProduction}
              onStopAllSkuProduction={handleStopAllSkuProduction}
              onTriggerShiftHandover={() => handleTriggerShiftHandover({ isAutomatic: false, forceHandoverAll: true })}
              onSetRunSpeedMultiplier={handleSetRunSpeedMultiplier}
              onAddProductionLine={handleAddProductionLine}
              onUpdateProductionLine={handleUpdateProductionLine}
              onDeleteProductionLine={handleDeleteProductionLine}
              onSetProductionLinesCount={handleSetProductionLinesCount}
              onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
              onChangeSku={handleSkuChangeover}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'tank-monitoring' && (
            <TankMonitoringView
              state={state}
              onProduceCartons={handleProduceCartons}
              onUpdateTankItem={handleUpdateTankItem}
              onTopUpTank={handleTopUpTank}
              onTransferTanks={handleTransferBetweenTanks}
              onStartSkuProduction={handleStartSkuProduction}
              onUpdateRunHoldingTank={handleUpdateRunHoldingTank}
              onStopSkuProduction={handleStopSkuProduction}
              onSetRunSpeedMultiplier={handleSetRunSpeedMultiplier}
              showToast={showToast}
              onSwitchTab={handleSwitchTab}
            />
          )}

          {state.currentTab === 'permintaan' && (
            <PermintaanView
              state={state}
              onCreateRequest={handleCreateRequest}
              onCreateMultipleRequests={handleCreateMultipleRequests}
              onJumpToReceive={handleJumpToReceive}
              onSwitchTab={handleSwitchTab}
              onOpenStockAdjustment={handleOpenStockAdjustment}
              deepLinkSlip={deepLinkSlip}
              onClearDeepLinkSlip={() => {
                setDeepLinkSlip(null);
                if (window.location.hash.includes('bon=') || window.location.hash.includes('req=')) {
                  window.location.hash = 'tab=permintaan';
                }
              }}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'penerimaan' && (
            <PenerimaanView
              state={state}
              onReceiveMaterial={handleReceiveMaterial}
              preselectedRequestId={preselectedRequestId}
              onOpenStockAdjustment={handleOpenStockAdjustment}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'pemakaian' && (
            <PemakaianView
              state={state}
              onRecordUsage={handleRecordUsage}
              onStartWipBatch={handleStartWipBatch}
              onCompleteWipBatch={handleCompleteWipBatch}
              onCancelWipBatch={handleCancelWipBatch}
              onSwitchTab={handleSwitchTab}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'master' && (
            <MasterBOMView
              state={state}
              onAddMaterial={handleAddMaterial}
              onDeleteMaterial={handleDeleteMaterial}
              onImportMaterials={handleImportMaterials}
              onOpenStockAdjustment={handleOpenStockAdjustment}
              onAddWip={handleAddWip}
              onUpdateWip={handleUpdateWip}
              onDeleteWip={handleDeleteWip}
              onAddSku={handleAddSku}
              onDeleteSku={handleDeleteSku}
              onImportSkus={handleImportSkus}
              onAddSkuWip={handleAddSkuWip}
              onDeleteSkuWip={handleDeleteSkuWip}
              onImportSkuWips={handleImportSkuWips}
              onAddWipMat={handleAddWipMat}
              onDeleteWipMat={handleDeleteWipMat}
              onAddRecipe={handleAddRecipe}
              onUpdateRecipe={handleUpdateRecipe}
              onDeleteRecipe={handleDeleteRecipe}
              onImportRecipes={handleImportRecipes}
              onAddMaterialToRecipe={handleAddMaterialToRecipe}
              onAddMultipleMaterialsToRecipe={handleAddMultipleMaterialsToRecipe}
              onUpdateRecipeItem={handleUpdateRecipeItem}
              onDeleteMaterialFromRecipe={handleDeleteMaterialFromRecipe}
              onAddMachine={handleAddMachine}
              onDeleteMachine={handleDeleteMachine}
              onImportMachines={handleImportMachines}
              onStartMachineChangeover={handleStartMachineChangeover}
              onCompleteMachineChangeover={handleCompleteMachineChangeover}
              onCancelMachineChangeover={handleCancelMachineChangeover}
              onAddTank={handleAddTank}
              onUpdateTank={handleUpdateTankItem}
              onDeleteTank={handleDeleteTank}
              onImportTanks={handleImportTanks}
              onAddOperator={handleAddOperator}
              onUpdateOperator={handleUpdateOperator}
              onDeleteOperator={handleDeleteOperator}
              onAddManagement={handleAddManagement}
              onToggleManagementAccess={handleToggleManagementAccess}
              onDeleteManagement={handleDeleteManagement}
              onChangeAdminPin={handleChangePin}
              onOpenAdminModal={() => setIsAdminModalOpen(true)}
              onOpenUserManagement={() => setIsUserManagementOpen(true)}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'bom-calculator' && (
            <BOMCalculatorView
              state={state}
              onSwitchTab={handleSwitchTab}
              onQuickGenerateRequest={handleCreateRequest}
              showToast={showToast}
            />
          )}

          {state.currentTab === 'shift-summary' && (
            <ShiftSummaryView
              state={state}
              onSwitchTab={handleSwitchTab}
              onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Storage Tank Liquid Modal */}
      <StorageTankModal
        isOpen={isTankModalOpen}
        onClose={() => setIsTankModalOpen(false)}
        tank={state.tank}
        onUpdateTank={handleUpdateTank}
      />

      {/* Admin Authentication Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={state.isAdmin}
        adminPin={state.adminPin}
        adminGoogleEmails={state.adminGoogleEmails}
        currentAdminUser={state.currentAdminUser}
        onLogin={handleAdminLogin}
        onLogout={handleAdminLogout}
        onChangePin={handleChangePin}
        onAddAdminEmail={handleAddAdminEmail}
        onRemoveAdminEmail={handleRemoveAdminEmail}
        showToast={showToast}
      />

      {/* Reset Confirmation Modal */}
      <ResetModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        state={state}
        onResetAll={handleResetAll}
        onResetMasterData={handleResetMasterData}
        onResetStockReceipts={handleResetStockReceipts}
        onResetRequests={handleResetRequests}
        onResetUsages={handleResetUsages}
        onLoadPreset={handleLoadSampleData}
      />

      {/* Laporan Produksi Per Shift Format PDF Modal */}
      <ShiftReportPdfModal
        isOpen={isPdfReportModalOpen}
        onClose={() => setIsPdfReportModalOpen(false)}
        state={state}
        showToast={showToast}
      />

      {/* Alarm Peringatan Batch WIP Selesai Modal (Audio & Visual) */}
      <WipCompletionAlarmModal
        completedBatch={alarmWipBatch}
        onDismiss={() => setAlarmWipBatch(null)}
        onNavigateToTanks={() => handleSwitchTab('tank-monitoring')}
        tanks={state.master.tanks}
        machines={state.master.machines}
      />

      {/* 3-Tier User Role Switcher Modal (Administrator, Operator, Management) */}
      <UserRoleSwitcherModal
        isOpen={isRoleSwitcherOpen}
        onClose={() => setIsRoleSwitcherOpen(false)}
        state={state}
        onSelectRole={handleSelectRole}
        showToast={showToast}
      />

      {/* Administrator-Only User & Access Rights Management Modal */}
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        state={state}
        onAddOperator={handleAddOperator}
        onUpdateOperator={handleUpdateOperator}
        onDeleteOperator={handleDeleteOperator}
        onAddManagement={handleAddManagement}
        onToggleManagementAccess={handleToggleManagementAccess}
        onDeleteManagement={handleDeleteManagement}
        onChangeAdminPin={handleChangePin}
        showToast={showToast}
      />

      {/* Administrator Material Initial Stock Adjustment Modal */}
      <MaterialStockAdjustmentModal
        isOpen={isStockAdjustmentModalOpen}
        onClose={() => setIsStockAdjustmentModalOpen(false)}
        state={state}
        preselectedMaterialId={stockAdjustmentPreselectedMatId}
        onAdjustStock={handleAdjustMaterialStock}
        showToast={showToast}
      />

      {/* Global Toast Notification */}
      <div
        className={`fixed top-14 left-1/2 -translate-x-1/2 z-[100] transform transition-all duration-300 pointer-events-none ${
          toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-12 opacity-0'
        }`}
      >
        <div className={`px-4 py-2.5 rounded-xl shadow-2xl text-xs font-medium flex items-center space-x-2 border ${
          toast.isError
            ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
            : 'bg-slate-900/95 text-slate-100 border-slate-700'
        }`}>
          {toast.isError ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.msg}</span>
        </div>
      </div>
    </div>
  );
}
