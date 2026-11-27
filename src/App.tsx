import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppState,
  MaterialRequest,
  AdminGoogleUser,
  UserRole,
  RegisteredOperator,
  RegisteredManagement
} from './types';
import { auth } from './utils/firebaseSync';
import {
  createSecurityAuditEntry,
  hashPasswordSlow,
  normalizeEmail,
  sanitizeTextInput,
  validatePasswordStrength
} from './utils/security';
import { resolveEffectiveRole } from './utils/roleAccess';
import { getCurrentShift } from './utils/shifts';
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
import { GoogleSheetsSyncView } from './components/views/GoogleSheetsSyncView';
import { WeeklyPlanningView } from './components/views/WeeklyPlanningView';
import { LineStationMonitorView } from './components/views/LineStationMonitorView';
import { CkStationMonitorView } from './components/views/CkStationMonitorView';
import { OperationalWorkflowStepper } from './components/OperationalWorkflowStepper';
import { ShiftReportPdfModal } from './components/ShiftReportPdfModal';
import { WipCompletionAlarmModal } from './components/WipCompletionAlarmModal';
import { UserRoleSwitcherModal } from './components/UserRoleSwitcherModal';
import { UserManagementModal } from './components/UserManagementModal';
import { MaterialStockAdjustmentModal } from './components/MaterialStockAdjustmentModal';
import { GlobalCommandPalette } from './components/GlobalCommandPalette';
import { parseRequestSlipQrHash, RequestSlipDeepLinkData } from './utils/requestSlipPdf';
import { ContactSection, ContactFormData } from '@/components/ui/contact';
import { Toaster } from 'sonner';
import { FileText, Clock, PauseCircle, Play, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { useErp } from './context/ErpContext';

export default function App() {
  const {
    state,
    setState,
    stateRef,
    showToast,
    registerLogoutUiReset,
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
    handleLoginSuccess,
    runSetupCheck,
    handleCompleteFirstAdminSetup,
    handleGoogleCloudLogin,
    handleResetQuotaAndRetrySync,
    performCompleteLogout,
    handleFirebaseSignOut,
    handleUpdateTank,
    handleResetMasterData,
    handleAddMaterial,
    handleUpdateMaterial,
    handleDeleteMaterial,
    handleAdjustMaterialStock,
    handleImportMaterials,
    handleAddWip,
    handleDeleteWip,
    handleUpdateWip,
    handleAddSku,
    handleUpdateSku,
    handleDeleteSku,
    handleImportSkus,
    handleAddSkuWip,
    handleDeleteSkuWip,
    handleImportSkuWips,
    handleAddWipMat,
    handleDeleteWipMat,
    handleAddRecipe,
    handleUpdateRecipe,
    handleDeleteRecipe,
    handleAddMaterialToRecipe,
    handleAddMultipleMaterialsToRecipe,
    handleUpdateRecipeItem,
    handleDeleteMaterialFromRecipe,
    handleImportRecipes,
    handleAddMachine,
    handleDeleteMachine,
    handleImportMachines,
    handleAddTank,
    handleDeleteTank,
    handleImportTanks,
    handleUpdateTankItem,
    handleTopUpTank,
    handleAddProductionLine,
    handleUpdateProductionLine,
    handleDeleteProductionLine,
    handleSetProductionLinesCount,
    alarmWipBatch,
    setAlarmWipBatch,
    handleResetAll,
    handleResetStockReceipts,
    handleResetRequests,
    handleResetUsages,
    handleLoadSampleData,
    handleTransferStock,
    handleStartMachineChangeover,
    handleCompleteMachineChangeover,
    handleCancelMachineChangeover,
    handleProduceCartons,
    handleTransferBetweenTanks,
    handleStartSkuProduction,
    handleStartLineBatchRuns,
    handleStartMultipleSkus,
    handleSkuChangeover,
    handleUpdateRunHoldingTank,
    handleSetRunSpeedMultiplier,
    handleCompleteLineRun,
    handleTriggerMaterialShortageStop,
    handleResumeLineRun,
    handleStopSkuProduction,
    handleStopAllSkuProduction,
    handleTriggerShiftHandover,
    handleCreateRequest,
    handleCreateMultipleRequests,
    handleSaveWeeklyPlan,
    handleSelectWeeklyPlan,
    handleDeleteWeeklyPlan,
    handleReceiveMaterial,
    handleRecordUsage,
    handleStartWipBatch,
    handlePauseWipBatch,
    handleResumeWipBatch,
    handleCompleteWipBatch,
    handleCancelWipBatch,
    handleRecordMaterialReject
  } = useErp();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isTankModalOpen, setIsTankModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPdfReportModalOpen, setIsPdfReportModalOpen] = useState(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);
  const [stockAdjustmentPreselectedMatId, setStockAdjustmentPreselectedMatId] = useState<string | undefined>(undefined);
  const [preselectedRequestId, setPreselectedRequestId] = useState<string | undefined>(undefined);
  const [deepLinkSlip, setDeepLinkSlip] = useState<RequestSlipDeepLinkData | null>(null);
  const [focusedTankId, setFocusedTankId] = useState<string | null>(null);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return registerLogoutUiReset(() => {
      setIsSidebarOpen(false);
      setIsAdminModalOpen(false);
      setIsTankModalOpen(false);
      setIsResetModalOpen(false);
      setIsPdfReportModalOpen(false);
      setIsRoleSwitcherOpen(false);
      setIsUserManagementOpen(false);
      setIsStockAdjustmentModalOpen(false);
      setPreselectedRequestId(undefined);
      setDeepLinkSlip(null);
    });
  }, [registerLogoutUiReset]);

  const parseStationFromLocation = useCallback((): { type: 'line' | 'ck'; id: string } | null => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const qType = searchParams.get('station');
      const qId = searchParams.get('id');
      if ((qType === 'line' || qType === 'ck') && qId && qId.trim()) {
        return { type: qType, id: qId.trim() };
      }
      const rawHash = window.location.hash || '';
      if (rawHash.includes('station=')) {
        const hashParams = new URLSearchParams(rawHash.replace(/^#/, ''));
        const hType = hashParams.get('station');
        const hId = hashParams.get('id');
        if ((hType === 'line' || hType === 'ck') && hId && hId.trim()) {
          return { type: hType, id: hId.trim() };
        }
      }
    } catch {
      // ignore malformed URL
    }
    return null;
  }, []);

  const [activeStation, setActiveStation] = useState<{ type: 'line' | 'ck'; id: string } | null>(() =>
    parseStationFromLocation()
  );

  const handleOpenStationMonitor = useCallback((station: { type: 'line' | 'ck'; id: string }) => {
    setActiveStation(station);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('station', station.type);
      url.searchParams.set('id', station.id);
      url.hash = '';
      window.history.pushState({ station }, '', url.toString());
    } catch {
      window.location.hash = `station=${station.type}&id=${encodeURIComponent(station.id)}`;
    }
  }, []);

  const handleExitStationMonitor = useCallback(() => {
    const prevType = activeStation?.type;
    setActiveStation(null);
    const targetTab: AppState['currentTab'] = prevType === 'ck' ? 'pemakaian' : 'dashboard';
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('station');
      url.searchParams.delete('id');
      url.hash = `tab=${targetTab}`;
      window.history.pushState({ tab: targetTab }, '', url.toString());
    } catch {
      window.location.hash = `tab=${targetTab}`;
    }
    setState(prev => ({ ...prev, currentTab: targetTab }));
  }, [activeStation?.type, setState]);

  const handleOpenStockAdjustment = (materialId?: string) => {
    setStockAdjustmentPreselectedMatId(materialId);
    setIsStockAdjustmentModalOpen(true);
  };

  // Global Command Palette shortcut (Ctrl+K / Cmd+K)
  useEffect(() => {
    if (!state.isAuthenticated || setupStatus !== 'ready') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandMenuOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isAuthenticated, setupStatus]);

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
  }, [setState]);

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
          'weekly-planning',
          'tank-monitoring',
          'shift-summary',
          'permintaan',
          'penerimaan',
          'pemakaian',
          'master',
          'bom-calculator',
          'reports',
          'contact',
          'sheets-sync'
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
    const handlePopOrHash = () => {
      const st = parseStationFromLocation();
      setActiveStation(st);
      if (!st) {
        handleHashChange();
      }
    };
    handlePopOrHash();
    window.addEventListener('hashchange', handlePopOrHash);
    window.addEventListener('popstate', handlePopOrHash);
    return () => {
      window.removeEventListener('hashchange', handlePopOrHash);
      window.removeEventListener('popstate', handlePopOrHash);
    };
  }, [state.isAuthenticated, parseStationFromLocation, setState, stateRef]);

  // Switch tabs with role-based access control
  const handleSwitchTab = (tab: AppState['currentTab']) => {
    if (tab === 'reports') {
      setIsPdfReportModalOpen(true);
      return;
    }
    const resolved = getEffectiveRoleForState();
    if (
      resolved.isManagement &&
      tab !== 'dashboard' &&
      tab !== 'weekly-planning' &&
      tab !== 'tank-monitoring' &&
      tab !== 'shift-summary' &&
      tab !== 'contact' &&
      tab !== 'sheets-sync'
    ) {
      showToast('Akses dibatasi: User Management hanya memiliki izin melihat (Read-Only)', true);
      return;
    }
    if (!resolved.isAdmin && (tab === 'master' || tab === 'admin-portal')) {
      showToast('Akses dibatasi: Portal dan Master BOM hanya dapat diakses oleh Administrator', true);
      return;
    }
    setState(prev => ({ ...prev, currentTab: tab }));
    window.location.hash = `tab=${tab}`;
    requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  // Full Logout back to clean AuthPortalView
  const handleSignOut = async () => {
    await performCompleteLogout(
      'Berhasil logout total. Anda dapat masuk ke akun lain atau mendaftar akun baru.'
    );
  };

  // Role switching (Administrator, Offline PIN Admin, Operator, Management)
  const handleSelectRole = (
    role: UserRole,
    sessionData?: { id: string; name: string; subtitle?: string; email?: string }
  ) => {
    if (cloudAuthRole === 'MANAGEMENT' && role !== 'MANAGEMENT') {
      showToast('Akses ditolak: Akun Management hanya memiliki izin melihat (Read-Only).', true);
      return;
    }
    const liveEmail = firebaseUser?.email || auth.currentUser?.email || null;
    const liveUid = firebaseUser?.uid || auth.currentUser?.uid || null;

    setState(prev => {
      const resolved = resolveEffectiveRole(
        {
          ...prev,
          currentUserRole: role,
          currentAdminUser:
            role === 'ADMINISTRATOR'
              ? prev.currentAdminUser ||
                (liveEmail
                  ? {
                      email: normalizeEmail(liveEmail),
                      displayName: firebaseUser?.displayName || liveEmail.split('@')[0],
                      photoURL: firebaseUser?.photoURL || undefined,
                      registeredAt: new Date().toISOString(),
                      role: prev.cloudOwnerUid === liveUid ? 'SUPER_ADMIN' : 'ADMIN'
                    }
                  : null)
              : null
        },
        {
          firebaseUserEmail: liveEmail,
          firebaseUid: liveUid,
          cloudAuthRole
        }
      );

      const finalRole = resolved.role;
      let nextTab = prev.currentTab;

      if (
        resolved.isManagement &&
        nextTab !== 'dashboard' &&
        nextTab !== 'weekly-planning' &&
        nextTab !== 'tank-monitoring' &&
        nextTab !== 'shift-summary' &&
        nextTab !== 'contact' &&
        nextTab !== 'sheets-sync'
      ) {
        nextTab = 'dashboard';
      }
      if (!resolved.isAdmin && (nextTab === 'master' || nextTab === 'admin-portal')) {
        nextTab = 'dashboard';
      }

      if (resolved.isOfflinePinAdmin && (role === 'ADMINISTRATOR' || role === 'OFFLINE_PIN_ADMIN')) {
        showToast('Mode PIN Lokal aktif — perubahan Master tidak tersimpan ke Cloud');
      } else if (finalRole === 'ADMINISTRATOR') {
        showToast('Berhasil masuk sebagai Administrator (Akses Penuh)');
      }

      return {
        ...prev,
        currentUserRole: finalRole,
        currentAdminUser: resolved.isCloudAdmin ? prev.currentAdminUser : null,
        currentTab: nextTab,
        currentSession: sessionData
          ? {
              role: finalRole,
              id: sessionData.id,
              name: sessionData.name,
              subtitle: resolved.isOfflinePinAdmin
                ? 'Mode PIN Lokal (Perubahan Master Tidak Tersimpan ke Cloud)'
                : sessionData.subtitle,
              email: resolved.isCloudAdmin ? sessionData.email || liveEmail || undefined : undefined
            }
          : {
              role: finalRole,
              id: finalRole.toLowerCase(),
              name: resolved.isAdmin
                ? 'Administrator MES'
                : finalRole === 'OPERATOR'
                ? 'Operator Lini'
                : 'Executive Management',
              subtitle: resolved.isOfflinePinAdmin
                ? 'Mode PIN Lokal (Perubahan Master Tidak Tersimpan ke Cloud)'
                : finalRole === 'ADMINISTRATOR'
                ? 'Kewenangan Penuh Master & Akses'
                : finalRole === 'OPERATOR'
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

  // Admin authentication (Single Source of Truth via resolveEffectiveRole)
  const handleAdminLogin = (googleUser?: AdminGoogleUser) => {
    const liveEmail = googleUser?.email || firebaseUser?.email || auth.currentUser?.email || null;
    const liveUid = firebaseUser?.uid || auth.currentUser?.uid || null;
    const liveCloudRole: UserRole | null = googleUser ? 'ADMINISTRATOR' : cloudAuthRole;

    setState(prev => {
      const candidateAdminUser: AdminGoogleUser | null =
        googleUser ||
        (liveEmail
          ? {
              email: normalizeEmail(liveEmail),
              displayName:
                prev.currentAdminUser?.displayName ||
                firebaseUser?.displayName ||
                liveEmail.split('@')[0],
              photoURL: prev.currentAdminUser?.photoURL || firebaseUser?.photoURL || undefined,
              registeredAt: prev.currentAdminUser?.registeredAt || new Date().toISOString(),
              role: (prev.cloudOwnerUid === liveUid ? 'SUPER_ADMIN' : 'ADMIN') as
                | 'SUPER_ADMIN'
                | 'ADMIN'
            }
          : null);

      const resolved = resolveEffectiveRole(
        {
          ...prev,
          currentUserRole: 'ADMINISTRATOR',
          currentAdminUser: candidateAdminUser
        },
        {
          firebaseUserEmail: liveEmail,
          firebaseUid: liveUid,
          cloudAuthRole: liveCloudRole
        }
      );

      return {
        ...prev,
        currentUserRole: resolved.role,
        currentAdminUser: resolved.isCloudAdmin ? candidateAdminUser : null,
        currentSession: {
          ...prev.currentSession,
          role: resolved.role,
          email: resolved.isCloudAdmin ? candidateAdminUser?.email || prev.currentSession?.email : undefined,
          subtitle: resolved.isOfflinePinAdmin
            ? 'Mode PIN Lokal (Perubahan Master Tidak Tersimpan ke Cloud)'
            : prev.currentSession?.subtitle
        }
      };
    });
  };

  const handleAdminLogout = () => {
    setState(prev => {
      const nextTab =
        prev.currentTab === 'master' || prev.currentTab === 'admin-portal'
          ? 'dashboard'
          : prev.currentTab;
      return {
        ...prev,
        currentUserRole: 'OPERATOR',
        currentAdminUser: null,
        currentTab: nextTab,
        currentSession: {
          ...prev.currentSession,
          role: 'OPERATOR'
        }
      };
    });
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

  // Jump from Request row to Receive form
  const handleJumpToReceive = (req: MaterialRequest) => {
    setPreselectedRequestId(req.id);
    handleSwitchTab('penerimaan');
  };

  // Titles for views
  const viewTitles: Record<AppState['currentTab'], string> = {
    'admin-portal': 'Portal Alur Kerja Operasional Administrator',
    master: 'Tahap 01 · Konfigurasi Master BOM, Resep, Mesin & Tangki',
    'weekly-planning': 'Tahap 02 · Penentuan Planning Produksi Mingguan',
    permintaan: 'Tahap 03 · Permintaan Material GDRM & Formulasi',
    penerimaan: 'Tahap 04 · Kedatangan & Penerimaan Fisik Material',
    pemakaian: 'Tahap 05 · Pembuatan Work Order WIP & Batch Resep',
    'tank-monitoring': 'Tahap 06 · Transfer WIP ke Storage & Tangki Holding',
    dashboard: 'Tahap 07 · Manufacturing Control Room & Eksekusi Lini',
    'shift-summary': 'Ringkasan Produksi Shift (Output, SBL & Konsumsi Material)',
    'bom-calculator': 'Kalkulator Kebutuhan Produksi & Formulasi BOM',
    reports: 'Laporan Saldo Stock Aktual Shift (PDF Landscape)',
    contact: 'Kontak & Dukungan Tim Teknis ProdTrack MES',
    'sheets-sync': 'Integrasi Otomatis Hasil Produksi ke Google Sheets'
  };

  const isDaylightTheme = state.theme === 'daylight' || state.theme === 'light';

  const toasterNode = (
    <Toaster
      position="bottom-right"
      richColors
      theme={isDaylightTheme ? 'light' : 'dark'}
      closeButton
      duration={3200}
      toastOptions={{
        className: 'font-sans text-xs border border-border shadow-xl'
      }}
    />
  );

  // 1. TAMPILAN AWAL: WIZARD REGISTRASI ADMIN PERTAMA ATAU PORTAL SIGN IN
  if (!state.isAuthenticated || setupStatus !== 'ready') {
    return (
      <>
        <div
          key={`auth-portal-shell-${authViewKey}`}
          className="min-h-screen w-full overflow-y-auto bg-background text-foreground font-sans"
        >
          <AuthPortalView
            key={`auth-portal-${authViewKey}`}
            state={state}
            theme={isDaylightTheme ? 'daylight' : 'midnight'}
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
        </div>
        {toasterNode}
      </>
    );
  }

  // 1B. DEDICATED STATION MONITOR MODE (KIOSK MODE: ?station=line&id=... or ?station=ck&id=...)
  if (activeStation) {
    return (
      <>
        {activeStation.type === 'line' ? (
          <LineStationMonitorView
            state={state}
            lineId={activeStation.id}
            theme={isDaylightTheme ? 'daylight' : 'midnight'}
            onToggleTheme={handleToggleTheme}
            onExitMonitor={handleExitStationMonitor}
            onRecordMaterialReject={handleRecordMaterialReject}
            onProduceCartons={handleProduceCartons}
          />
        ) : (
          <CkStationMonitorView
            state={state}
            machineId={activeStation.id}
            theme={isDaylightTheme ? 'daylight' : 'midnight'}
            onToggleTheme={handleToggleTheme}
            onExitMonitor={handleExitStationMonitor}
            onRecordMaterialReject={handleRecordMaterialReject}
            onCompleteWipBatch={handleCompleteWipBatch}
            onResumeWipBatch={handleResumeWipBatch}
            onPauseWipBatch={handlePauseWipBatch}
          />
        )}
        <WipCompletionAlarmModal
          completedBatch={alarmWipBatch}
          onDismiss={() => setAlarmWipBatch(null)}
          onNavigateToTanks={() => {
            setAlarmWipBatch(null);
            handleExitStationMonitor();
            handleSwitchTab('tank-monitoring');
          }}
          tanks={state.master.tanks}
          machines={state.master.machines}
        />
        {toasterNode}
      </>
    );
  }

  // 2. TAMPILAN SETELAH LOGIN (LEFT NAVIGATION RAIL + SLIM TOP BAR + COMPACT STEPPER)
  return (
    <>
      <div
        key={`app-shell-${authViewKey}`}
        className="h-screen w-screen overflow-hidden flex flex-col md:flex-row bg-background text-foreground font-sans select-none"
      >
        {/* Sidebar: Desktop Collapsible Rail (56px/220px) + Mobile Bottom Bar & Slide-Over Drawer */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onOpenMobileDrawer={() => setIsSidebarOpen(true)}
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

        {/* Main Right Area: Slim Header, Live Ticker, Compact Stepper, and Content View */}
        <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
          {/* Slim Top Bar (max 48px) */}
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
            onOpenCommandMenu={() => setIsCommandMenuOpen(true)}
            isSyncingCloud={isSyncingCloud}
            isCloudConnected={Boolean(firebaseUser && cloudAuthRole)}
            isCloudQuotaExceeded={cloudQuotaStatus.isQuotaExceeded}
            currentViewTitle={viewTitles[state.currentTab] || 'ProdTrack MES'}
          />

          {cloudQuotaStatus.isQuotaExceeded && !quotaBannerDismissed && (
            <div className="bg-tint-amber border-b border-tint-amber-border px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-amber shrink-0 no-print">
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 leading-snug">
                  <span className="font-bold">Kuota Tulis Harian Cloud Penuh: </span>
                  <span className="text-ink-primary">
                    Batas gratis tulis harian Firestore tercapai
                    {cloudQuotaStatus.pausedUntilMs
                      ? ` (reset otomatis sekitar ${new Date(cloudQuotaStatus.pausedUntilMs).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Jakarta'
                        })} WIB)`
                      : ' dan akan reset otomatis besok'}
                    . Operasional & data tetap tersimpan aman di perangkat lokal.
                  </span>{' '}
                  <a
                    href={cloudQuotaStatus.upgradeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-ink-amber hover:opacity-80"
                  >
                    Upgrade / Detail Firebase
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={isTestingQuotaReset}
                  onClick={() => void handleResetQuotaAndRetrySync()}
                  className="px-2.5 py-1 rounded-md bg-surface hover:bg-elevated disabled:opacity-60 border border-tint-amber-border text-ink-primary text-[11px] font-semibold flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${isTestingQuotaReset ? 'animate-spin' : ''}`} />
                  <span>
                    {isTestingQuotaReset
                      ? 'Menguji Koneksi Cloud...'
                      : 'Reset Status Kuota & Coba Sinkron Cloud'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuotaBannerDismissed(true)}
                  aria-label="Tutup pemberitahuan kuota"
                  className="p-1 rounded-md hover:bg-surface/60 text-ink-secondary hover:text-ink-primary transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Live Factory Dispatch Console Strip */}
          <div className="bg-canvas border-b border-border-subtle px-3 sm:px-5 py-1.5 flex items-center justify-between overflow-x-auto no-scrollbar gap-3 shrink-0 text-xs">
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Shift Telemetry */}
              <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-md border border-border-subtle font-mono tabular-nums whitespace-nowrap">
                <span className="font-bold text-ink-emerald text-[11px]">Shift {getCurrentShift().shift}</span>
                <span className="text-[10px] text-ink-secondary hidden sm:inline">
                  · {getCurrentShift().timeRange}
                </span>
              </div>

              {/* Running Multi-SKU Dispatch */}
              {(() => {
                const runs = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
                  r => r.isRunning
                );
                if (runs.length > 0) {
                  return (
                    <div
                      onClick={() => handleSwitchTab('dashboard')}
                      className="flex items-center gap-2 cursor-pointer bg-tint-cyan border border-tint-cyan-border px-2.5 py-1 rounded-md text-[11px] hover:border-accent-primary transition whitespace-nowrap"
                      title="Klik untuk membuka modul Manufacturing & melihat SKU yang sedang diproses"
                    >
                      <span className="font-bold text-ink-cyan font-mono">
                        {runs.length === 1 ? '1 Lini Aktif:' : `${runs.length} Lini Aktif:`}
                      </span>
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-[480px]">
                        {runs.map((r, i) => (
                          <span
                            key={r.id || `${r.lineId || ''}_${r.skuId}_${i}`}
                            className="flex items-center gap-1 whitespace-nowrap"
                          >
                            {i > 0 && <span className="text-ink-secondary">·</span>}
                            {r.lineName && <span className="text-ink-cyan font-semibold">{r.lineName}:</span>}
                            <span className="text-ink-primary font-medium">{r.skuName}</span>
                            <span className="text-ink-cyan font-mono text-[10px] tabular-nums">
                              ({(r.cartonsProducedTotal || 0).toLocaleString()}
                              {r.plannedCartons ? `/${r.plannedCartons.toLocaleString()}` : ''} ktn)
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-md border border-border-subtle text-[11px] text-ink-secondary whitespace-nowrap">
                    <span>Lini Siaga</span>
                  </div>
                );
              })()}

              {/* Active Running / Paused WIP Batch Quick Action */}
              {(() => {
                const running = (state.transactions.wipBatches || []).find(
                  b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
                );
                if (!running) return null;
                const isPaused = running.status === 'DIJEDA';
                return (
                  <div
                    onClick={() => handleSwitchTab('pemakaian')}
                    className={`cursor-pointer flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] transition whitespace-nowrap border ${
                      isPaused
                        ? 'bg-tint-cyan border-tint-cyan-border hover:border-accent-primary'
                        : 'bg-tint-amber border-tint-amber-border hover:border-ink-amber'
                    }`}
                    title={
                      isPaused
                        ? `Batch dijeda: ${running.pauseReason || ''}`
                        : 'Klik untuk membuka rincian batch & Gantt WIP'
                    }
                  >
                    {isPaused ? (
                      <PauseCircle className="w-3 h-3 text-ink-sky shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-ink-amber shrink-0" />
                    )}
                    <span className={`${isPaused ? 'text-ink-sky' : 'text-ink-amber'} font-mono font-semibold`}>
                      {running.batchCode}
                    </span>
                    <span className="text-ink-primary hidden sm:inline">
                      · {running.wipName} {isPaused ? '(Dijeda)' : ''}
                    </span>
                    {isPaused ? (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleResumeWipBatch(running.id);
                        }}
                        className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                        title="Lanjutkan kembali penghitungan waktu batch ini"
                      >
                        <Play className="w-2.5 h-2.5" />
                        <span>Lanjutkan</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleCompleteWipBatch(running.id);
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition whitespace-nowrap shrink-0"
                        title="Selesaikan batch sekarang & transfer ke tangki"
                      >
                        Selesai
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Quick Report Download Trigger */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsPdfReportModalOpen(true)}
                className="flex items-center gap-1.5 bg-surface hover:bg-elevated border border-border-subtle hover:border-tint-rose-border text-ink-primary px-2.5 py-1 rounded-md text-[11px] font-semibold transition active:scale-95 whitespace-nowrap shrink-0"
                title="Download Laporan Saldo Stock Aktual Shift Format PDF (A4 Landscape)"
              >
                <FileText className="w-3.5 h-3.5 text-ink-rose" />
                <span>Laporan Shift (PDF)</span>
              </button>
            </div>
          </div>

          {/* Persistent Pinned Operational Workflow Stepper (Remains Visible on Scroll) */}
          {state.currentTab !== 'contact' && (
            <OperationalWorkflowStepper state={state} onSwitchTab={handleSwitchTab} />
          )}

          {/* Main Content View Area */}
          <main
            ref={mainScrollRef}
            className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 md:pb-6 bg-background relative"
          >
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

            {state.currentTab === 'weekly-planning' && (
              <WeeklyPlanningView
                state={state}
                onSaveWeeklyPlan={handleSaveWeeklyPlan}
                onSelectWeeklyPlan={handleSelectWeeklyPlan}
                onDeleteWeeklyPlan={handleDeleteWeeklyPlan}
                onSwitchTab={handleSwitchTab}
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
                onTriggerShiftHandover={() =>
                  handleTriggerShiftHandover({ isAutomatic: false, forceHandoverAll: true })
                }
                onSetRunSpeedMultiplier={handleSetRunSpeedMultiplier}
                onAddProductionLine={handleAddProductionLine}
                onUpdateProductionLine={handleUpdateProductionLine}
                onDeleteProductionLine={handleDeleteProductionLine}
                onSetProductionLinesCount={handleSetProductionLinesCount}
                onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
                onChangeSku={handleSkuChangeover}
                onOpenStationMonitor={handleOpenStationMonitor}
                focusedLineId={focusedLineId}
                onClearFocusedLine={() => setFocusedLineId(null)}
                showToast={showToast}
              />
            )}

            {state.currentTab === 'tank-monitoring' && (
              <TankMonitoringView
                state={state}
                onUpdateTankItem={handleUpdateTankItem}
                onTopUpTank={handleTopUpTank}
                onTransferTanks={handleTransferBetweenTanks}
                showToast={showToast}
                onSwitchTab={handleSwitchTab}
                focusedTankId={focusedTankId}
                onClearFocusedTank={() => setFocusedTankId(null)}
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
                onSwitchTab={handleSwitchTab}
                showToast={showToast}
              />
            )}

            {state.currentTab === 'pemakaian' && (
              <PemakaianView
                state={state}
                onRecordUsage={handleRecordUsage}
                onStartWipBatch={handleStartWipBatch}
                onPauseWipBatch={handlePauseWipBatch}
                onResumeWipBatch={handleResumeWipBatch}
                onCompleteWipBatch={handleCompleteWipBatch}
                onCancelWipBatch={handleCancelWipBatch}
                onSwitchTab={handleSwitchTab}
                onOpenStationMonitor={handleOpenStationMonitor}
                showToast={showToast}
              />
            )}

            {state.currentTab === 'master' && (
              <MasterBOMView
                state={state}
                onAddMaterial={handleAddMaterial}
                onUpdateMaterial={handleUpdateMaterial}
                onDeleteMaterial={handleDeleteMaterial}
                onImportMaterials={handleImportMaterials}
                onOpenStockAdjustment={handleOpenStockAdjustment}
                onAddWip={handleAddWip}
                onUpdateWip={handleUpdateWip}
                onDeleteWip={handleDeleteWip}
                onAddSku={handleAddSku}
                onUpdateSku={handleUpdateSku}
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
                onSwitchTab={handleSwitchTab}
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

            {state.currentTab === 'sheets-sync' && (
              <GoogleSheetsSyncView state={state} onSwitchTab={handleSwitchTab} showToast={showToast} />
            )}

            {state.currentTab === 'contact' && (
              <ContactSection
                brandName={state.factoryName || 'ProdTrack MES Support'}
                title="Dukungan Teknis & Integrasi Operasional Pabrik"
                mainMessage="Hubungi Tim Engineering"
                contactEmail="support@prodtrack-mes.local"
                ctaLabel="Kirim Tiket"
                navLinks={[
                  { label: 'Dashboard', href: '#tab=dashboard', onClick: () => handleSwitchTab('dashboard') },
                  {
                    label: 'Tangki WIP',
                    href: '#tab=tank-monitoring',
                    onClick: () => handleSwitchTab('tank-monitoring')
                  },
                  {
                    label: 'Permintaan Material',
                    href: '#tab=permintaan',
                    onClick: () => handleSwitchTab('permintaan')
                  },
                  {
                    label: 'Ringkasan Shift',
                    href: '#tab=shift-summary',
                    onClick: () => handleSwitchTab('shift-summary')
                  }
                ]}
                projectTypeOptions={[
                  'Penyesuaian BOM & Resep',
                  'Integrasi SAP / Warehouse',
                  'Kalibrasi Tangki WIP',
                  'Planning Mingguan',
                  'Laporan PDF Shift',
                  'Akses Pengguna & Role',
                  'Permasalahan Jaringan',
                  'Permintaan Fitur Baru',
                  'Lainnya'
                ]}
                onSubmit={(data: ContactFormData) => {
                  showToast(`Pesan dukungan dari ${data.name} berhasil dicatat (${data.projectType.length} topik).`);
                }}
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
          effectiveRole={effectiveRole}
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

        {/* Global Command Palette (Ctrl+K / Cmd+K) */}
        <GlobalCommandPalette
          open={isCommandMenuOpen}
          onOpenChange={setIsCommandMenuOpen}
          state={state}
          theme={isDaylightTheme ? 'daylight' : 'midnight'}
          onSwitchTab={handleSwitchTab}
          onToggleTheme={handleToggleTheme}
          onOpenTankModal={() => setIsTankModalOpen(true)}
          onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
          onOpenStockAdjustment={handleOpenStockAdjustment}
          onOpenRoleSwitcher={() => setIsRoleSwitcherOpen(true)}
          onOpenUserManagement={() => setIsUserManagementOpen(true)}
          onSelectTank={tankId => {
            setFocusedTankId(tankId);
            handleSwitchTab('tank-monitoring');
          }}
          onSelectLine={lineId => {
            setFocusedLineId(lineId);
            handleSwitchTab('dashboard');
          }}
        />
      </div>
      {toasterNode}
    </>
  );
}
