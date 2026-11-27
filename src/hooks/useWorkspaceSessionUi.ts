import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AdminGoogleUser,
  AppState,
  MaterialRequest,
  ProductionMachine,
  ProductionStopLog,
  RegisteredManagement,
  RegisteredOperator,
  RequestCartItem,
  ShiftNumber,
  UserRole,
  WipProductionBatch
} from '../types';
import { auth } from '../utils/firebaseSync';
import {
  createSecurityAuditEntry,
  hashPasswordSlow,
  normalizeEmail,
  sanitizeTextInput,
  validatePasswordStrength
} from '../utils/security';
import { resolveEffectiveRole } from '../utils/roleAccess';
import { parseRequestSlipQrHash, RequestSlipDeepLinkData } from '../utils/requestSlipPdf';
import type { BomPopupAction, BomPopupContext } from '../components/BomActionPopupModal';
import type { MaterialQrScannerModalProps } from '../components/MaterialQrScannerModal';
import type { PendingLineSkuAssignment } from '../components/HoldingTankSelectionModal';
import type { ParsedMaterialQrResult } from '../utils/materialQr';

export type BomImportTarget = 'MATERIAL' | 'SKU' | 'SKU_WIP' | 'RECIPE' | 'MACHINE' | 'TANK';

export interface GlobalBomPopupState {
  open: boolean;
  initialAction: BomPopupAction;
  initialContext?: BomPopupContext;
  onOpenImportModal?: (target: BomImportTarget) => void;
}

export interface GlobalSixBigLossesState {
  isOpen: boolean;
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  startedAt?: string;
  cartonsProducedDuringRun?: number;
  onConfirmStop?: (
    stopData: Omit<ProductionStopLog, 'id'>,
    options?: { sendWhatsApp?: boolean; whatsappPhone?: string }
  ) => void;
}

export interface GlobalMachineChangeoverState {
  isOpen: boolean;
  machine: ProductionMachine | null;
}

export interface GlobalQrScannerState {
  isOpen: boolean;
  title?: string;
  subtitle?: string;
  allowContinuous?: boolean;
  lastFeedback?: MaterialQrScannerModalProps['lastFeedback'];
  onScanMatched?: (result: ParsedMaterialQrResult) => void;
  onOpenLabelGenerator?: () => void;
}

export interface GlobalMachineChangeoverHistoryState {
  isOpen: boolean;
  selectedMachineId?: string | null;
}

export interface GlobalQrLabelState {
  isOpen: boolean;
  initialMaterialId?: string;
}

export interface GlobalHoldingTankState {
  isOpen: boolean;
  pendingSkuIds?: string[];
  pendingAssignments?: PendingLineSkuAssignment[];
  initialSelectionsBySku?: Record<string, Record<string, string>>;
  onConfirmStart?: (selectionsBySku: Record<string, Record<string, string>>) => void;
  onConfirmAssignments?: (selectionsByKey: Record<string, Record<string, string>>) => void;
}

export interface GlobalInterTankTransferState {
  isOpen: boolean;
  initialSourceTankId?: string;
}

export interface GlobalWipBatchPauseState {
  isOpen: boolean;
  batch: WipProductionBatch | null;
  machineLabel?: string;
  actorName?: string;
  onConfirmPause?: (batchId: string, reason: string, category: string) => void;
}

export interface GlobalRequestSlipPdfState {
  isOpen: boolean;
  cartItems: RequestCartItem[];
  initialGroupKey?: string;
  initialSupplier?: string;
  requestNumbers?: string[];
  onPreviewQrDetail?: (data: RequestSlipDeepLinkData) => void;
}

export interface GlobalWhatsAppSblState {
  isOpen: boolean;
  stopLog?: Omit<ProductionStopLog, 'id'> | ProductionStopLog | null;
  recapLogs?: ProductionStopLog[];
  recapDate?: string;
  recapShift?: ShiftNumber;
  initialPhone?: string;
}

export type WorkspaceSetupStatus = 'checking' | 'needs_setup' | 'ready' | 'error';

export interface UseWorkspaceSessionUiParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  stateRef: React.MutableRefObject<AppState>;
  setupStatus: WorkspaceSetupStatus;
  firebaseUser: User | null;
  cloudAuthRole: UserRole | null;
  getEffectiveRoleForState: () => ReturnType<typeof resolveEffectiveRole>;
  performCompleteLogout: (toastMessage: string) => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export const CONTACT_PROJECT_TYPE_OPTIONS = [
  'Penyesuaian BOM & Resep',
  'Integrasi SAP / Warehouse',
  'Kalibrasi Tangki WIP',
  'Planning Mingguan',
  'Laporan PDF Shift',
  'Akses Pengguna & Role',
  'Permasalahan Jaringan',
  'Permintaan Fitur Baru',
  'Lainnya'
];

export const VIEW_TITLES: Record<AppState['currentTab'], string> = {
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

export function useWorkspaceSessionUi({
  state,
  setState,
  stateRef,
  setupStatus,
  firebaseUser,
  cloudAuthRole,
  getEffectiveRoleForState,
  performCompleteLogout,
  showToast
}: UseWorkspaceSessionUiParams) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isTankModalOpen, setIsTankModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPdfReportModalOpen, setIsPdfReportModalOpen] = useState(false);
  const [isRoleSwitcherOpen, setIsRoleSwitcherOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isStockAdjustmentModalOpen, setIsStockAdjustmentModalOpen] = useState(false);
  const [stockAdjustmentPreselectedMatId, setStockAdjustmentPreselectedMatId] = useState<string | undefined>(
    undefined
  );

  const [bomPopupModal, setBomPopupModal] = useState<GlobalBomPopupState>({
    open: false,
    initialAction: 'LAUNCHER'
  });
  const [sixBigLossesModal, setSixBigLossesModal] = useState<GlobalSixBigLossesState>({
    isOpen: false,
    skuId: '',
    skuName: ''
  });
  const [machineChangeoverModal, setMachineChangeoverModal] = useState<GlobalMachineChangeoverState>({
    isOpen: false,
    machine: null
  });
  const [qrScannerModal, setQrScannerModal] = useState<GlobalQrScannerState>({
    isOpen: false
  });
  const [machineChangeoverHistoryModal, setMachineChangeoverHistoryModal] =
    useState<GlobalMachineChangeoverHistoryState>({ isOpen: false, selectedMachineId: null });
  const [qrLabelModal, setQrLabelModal] = useState<GlobalQrLabelState>({ isOpen: false });
  const [holdingTankModal, setHoldingTankModal] = useState<GlobalHoldingTankState>({ isOpen: false });
  const [interTankTransferModal, setInterTankTransferModal] = useState<GlobalInterTankTransferState>({
    isOpen: false
  });
  const [wipBatchPauseModal, setWipBatchPauseModal] = useState<GlobalWipBatchPauseState>({
    isOpen: false,
    batch: null
  });
  const [requestSlipPdfModal, setRequestSlipPdfModal] = useState<GlobalRequestSlipPdfState>({
    isOpen: false,
    cartItems: []
  });
  const [whatsAppSblModal, setWhatsAppSblModal] = useState<GlobalWhatsAppSblState>({ isOpen: false });
  const [isCloudBackupModalOpen, setIsCloudBackupModalOpen] = useState(false);

  const [preselectedRequestId, setPreselectedRequestId] = useState<string | undefined>(undefined);
  const [deepLinkSlip, setDeepLinkSlip] = useState<RequestSlipDeepLinkData | null>(null);
  const [focusedTankId, setFocusedTankId] = useState<string | null>(null);
  const [focusedLineId, setFocusedLineId] = useState<string | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

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

  const resetAllUiOnLogout = useCallback(() => {
    setIsSidebarOpen(false);
    setIsCommandMenuOpen(false);
    setIsAdminModalOpen(false);
    setIsTankModalOpen(false);
    setIsResetModalOpen(false);
    setIsPdfReportModalOpen(false);
    setIsRoleSwitcherOpen(false);
    setIsUserManagementOpen(false);
    setIsStockAdjustmentModalOpen(false);
    setBomPopupModal({ open: false, initialAction: 'LAUNCHER' });
    setSixBigLossesModal({ isOpen: false, skuId: '', skuName: '' });
    setMachineChangeoverModal({ isOpen: false, machine: null });
    setQrScannerModal({ isOpen: false });
    setMachineChangeoverHistoryModal({ isOpen: false, selectedMachineId: null });
    setQrLabelModal({ isOpen: false });
    setHoldingTankModal({ isOpen: false });
    setInterTankTransferModal({ isOpen: false });
    setWipBatchPauseModal({ isOpen: false, batch: null });
    setRequestSlipPdfModal({ isOpen: false, cartItems: [] });
    setWhatsAppSblModal({ isOpen: false });
    setIsCloudBackupModalOpen(false);
    setPreselectedRequestId(undefined);
    setDeepLinkSlip(null);
  }, []);

  const openBomPopupModal = useCallback(
    (
      initialAction: BomPopupAction = 'LAUNCHER',
      initialContext?: BomPopupContext,
      onOpenImportModal?: (target: BomImportTarget) => void
    ) => {
      setBomPopupModal({
        open: true,
        initialAction,
        initialContext,
        onOpenImportModal
      });
    },
    []
  );

  const closeBomPopupModal = useCallback(() => {
    setBomPopupModal(prev => ({ ...prev, open: false }));
  }, []);

  const openSixBigLossesModal = useCallback(
    (payload: Omit<GlobalSixBigLossesState, 'isOpen'>) => {
      setSixBigLossesModal({
        ...payload,
        isOpen: true
      });
    },
    []
  );

  const closeSixBigLossesModal = useCallback(() => {
    setSixBigLossesModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openMachineChangeoverModal = useCallback((machine: ProductionMachine) => {
    setMachineChangeoverModal({ isOpen: true, machine });
  }, []);

  const closeMachineChangeoverModal = useCallback(() => {
    setMachineChangeoverModal({ isOpen: false, machine: null });
  }, []);

  const openQrScannerModal = useCallback((payload: Omit<GlobalQrScannerState, 'isOpen'>) => {
    setQrScannerModal({
      ...payload,
      isOpen: true
    });
  }, []);

  const closeQrScannerModal = useCallback(() => {
    setQrScannerModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openMachineChangeoverHistoryModal = useCallback((selectedMachineId?: string | null) => {
    setMachineChangeoverHistoryModal({ isOpen: true, selectedMachineId: selectedMachineId ?? null });
  }, []);

  const closeMachineChangeoverHistoryModal = useCallback(() => {
    setMachineChangeoverHistoryModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openQrLabelModal = useCallback((initialMaterialId?: string) => {
    setQrLabelModal({ isOpen: true, initialMaterialId });
  }, []);

  const closeQrLabelModal = useCallback(() => {
    setQrLabelModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openHoldingTankModal = useCallback((payload: Omit<GlobalHoldingTankState, 'isOpen'>) => {
    setHoldingTankModal({ ...payload, isOpen: true });
  }, []);

  const closeHoldingTankModal = useCallback(() => {
    setHoldingTankModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openInterTankTransferModal = useCallback((initialSourceTankId?: string) => {
    setInterTankTransferModal({ isOpen: true, initialSourceTankId });
  }, []);

  const closeInterTankTransferModal = useCallback(() => {
    setInterTankTransferModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openWipBatchPauseModal = useCallback((payload: Omit<GlobalWipBatchPauseState, 'isOpen'>) => {
    setWipBatchPauseModal({ ...payload, isOpen: true });
  }, []);

  const closeWipBatchPauseModal = useCallback(() => {
    setWipBatchPauseModal(prev => ({ ...prev, isOpen: false, batch: null }));
  }, []);

  const openRequestSlipPdfModal = useCallback((payload: Omit<GlobalRequestSlipPdfState, 'isOpen'>) => {
    setRequestSlipPdfModal({ ...payload, isOpen: true });
  }, []);

  const closeRequestSlipPdfModal = useCallback(() => {
    setRequestSlipPdfModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openWhatsAppSblModal = useCallback((payload: Omit<GlobalWhatsAppSblState, 'isOpen'>) => {
    setWhatsAppSblModal({ ...payload, isOpen: true });
  }, []);

  const closeWhatsAppSblModal = useCallback(() => {
    setWhatsAppSblModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleRestoreCloudBackupState = useCallback(
    (restored: AppState) => {
      setState(prev => ({
        ...prev,
        master: restored.master || prev.master,
        transactions: restored.transactions || prev.transactions,
        tank: restored.tank || prev.tank
      }));
    },
    [setState]
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

  const handleOpenStockAdjustment = useCallback((materialId?: string) => {
    setStockAdjustmentPreselectedMatId(materialId);
    setIsStockAdjustmentModalOpen(true);
  }, []);

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
  const handleToggleTheme = useCallback(() => {
    const isCurrentlyDaylight = stateRef.current.theme === 'daylight' || stateRef.current.theme === 'light';
    const newTheme = isCurrentlyDaylight ? 'midnight' : 'daylight';
    setState(prev => ({ ...prev, theme: newTheme }));
    showToast(
      !isCurrentlyDaylight
        ? 'Beralih ke Tema Daylight (Tampilan Putih Terang Pabrik)'
        : 'Beralih ke Tema Midnight (Tampilan Gelap Industrial)'
    );
  }, [setState, showToast, stateRef]);

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
  const handleSwitchTab = useCallback(
    (tab: AppState['currentTab']) => {
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
    },
    [getEffectiveRoleForState, setState, showToast]
  );

  // Full Logout back to clean AuthPortalView
  const handleSignOut = useCallback(async () => {
    await performCompleteLogout(
      'Berhasil logout total. Anda dapat masuk ke akun lain atau mendaftar akun baru.'
    );
  }, [performCompleteLogout]);

  // Role switching (Administrator, Offline PIN Admin, Operator, Management)
  const handleSelectRole = useCallback(
    (
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
    },
    [cloudAuthRole, firebaseUser, setState, showToast]
  );

  // Operator Roster Management (Administrator only)
  const handleAddOperator = useCallback(
    (opData: Omit<RegisteredOperator, 'id' | 'registeredAt'>) => {
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
    },
    [setState, showToast]
  );

  const handleUpdateOperator = useCallback(
    (id: string, updates: Partial<RegisteredOperator>) => {
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
    },
    [setState, showToast]
  );

  const handleDeleteOperator = useCallback(
    (id: string) => {
      setState(prev => ({
        ...prev,
        registeredOperators: (prev.registeredOperators || []).filter(op => op.id !== id)
      }));
      showToast('Operator berhasil dihapus');
    },
    [setState, showToast]
  );

  // Management Access Control (Administrator only)
  const handleAddManagement = useCallback(
    (mgtData: Omit<RegisteredManagement, 'id' | 'registeredAt'>) => {
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
    },
    [setState, showToast]
  );

  const handleToggleManagementAccess = useCallback(
    (id: string, hasAccess: boolean) => {
      setState(prev => ({
        ...prev,
        registeredManagement: (prev.registeredManagement || []).map(mgt =>
          mgt.id === id ? { ...mgt, hasViewAccess: hasAccess } : mgt
        )
      }));
      showToast(`Izin akses melihat dashboard ${hasAccess ? 'diberikan' : 'dicabut'}`);
    },
    [setState, showToast]
  );

  const handleDeleteManagement = useCallback(
    (id: string) => {
      setState(prev => ({
        ...prev,
        registeredManagement: (prev.registeredManagement || []).filter(mgt => mgt.id !== id)
      }));
      showToast('User management berhasil dihapus');
    },
    [setState, showToast]
  );

  // Admin authentication (Single Source of Truth via resolveEffectiveRole)
  const handleAdminLogin = useCallback(
    (googleUser?: AdminGoogleUser) => {
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
            email: resolved.isCloudAdmin
              ? candidateAdminUser?.email || prev.currentSession?.email
              : undefined,
            subtitle: resolved.isOfflinePinAdmin
              ? 'Mode PIN Lokal (Perubahan Master Tidak Tersimpan ke Cloud)'
              : prev.currentSession?.subtitle
          }
        };
      });
    },
    [cloudAuthRole, firebaseUser, setState]
  );

  const handleAdminLogout = useCallback(() => {
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
  }, [setState]);

  const handleChangePin = useCallback(
    async (newPin: string) => {
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
    },
    [setState, showToast, stateRef]
  );

  const handleAddAdminEmail = useCallback(
    (email: string) => {
      const cleanEmail = normalizeEmail(email);
      setState(prev => {
        const current = prev.adminGoogleEmails || [];
        if (current.includes(cleanEmail)) return prev;
        return {
          ...prev,
          adminGoogleEmails: [...current, cleanEmail]
        };
      });
    },
    [setState]
  );

  const handleRemoveAdminEmail = useCallback(
    (email: string) => {
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
    },
    [firebaseUser?.email, setState, showToast]
  );

  // Export JSON backup
  const handleExportJSON = useCallback(() => {
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stateRef.current, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `prodtrack_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Cadangan data JSON berhasil diunduh');
  }, [showToast, stateRef]);

  // Jump from Request row to Receive form
  const handleJumpToReceive = useCallback(
    (req: MaterialRequest) => {
      setPreselectedRequestId(req.id);
      handleSwitchTab('penerimaan');
    },
    [handleSwitchTab]
  );

  const isDaylightTheme = state.theme === 'daylight' || state.theme === 'light';

  return {
    isSidebarOpen,
    setIsSidebarOpen,
    isCommandMenuOpen,
    setIsCommandMenuOpen,
    isAdminModalOpen,
    setIsAdminModalOpen,
    isTankModalOpen,
    setIsTankModalOpen,
    isResetModalOpen,
    setIsResetModalOpen,
    isPdfReportModalOpen,
    setIsPdfReportModalOpen,
    isRoleSwitcherOpen,
    setIsRoleSwitcherOpen,
    isUserManagementOpen,
    setIsUserManagementOpen,
    isStockAdjustmentModalOpen,
    setIsStockAdjustmentModalOpen,
    stockAdjustmentPreselectedMatId,
    setStockAdjustmentPreselectedMatId,
    bomPopupModal,
    openBomPopupModal,
    closeBomPopupModal,
    sixBigLossesModal,
    openSixBigLossesModal,
    closeSixBigLossesModal,
    machineChangeoverModal,
    openMachineChangeoverModal,
    closeMachineChangeoverModal,
    qrScannerModal,
    openQrScannerModal,
    closeQrScannerModal,
    machineChangeoverHistoryModal,
    openMachineChangeoverHistoryModal,
    closeMachineChangeoverHistoryModal,
    qrLabelModal,
    openQrLabelModal,
    closeQrLabelModal,
    holdingTankModal,
    openHoldingTankModal,
    closeHoldingTankModal,
    interTankTransferModal,
    openInterTankTransferModal,
    closeInterTankTransferModal,
    wipBatchPauseModal,
    openWipBatchPauseModal,
    closeWipBatchPauseModal,
    requestSlipPdfModal,
    openRequestSlipPdfModal,
    closeRequestSlipPdfModal,
    whatsAppSblModal,
    openWhatsAppSblModal,
    closeWhatsAppSblModal,
    isCloudBackupModalOpen,
    setIsCloudBackupModalOpen,
    handleRestoreCloudBackupState,
    preselectedRequestId,
    setPreselectedRequestId,
    deepLinkSlip,
    setDeepLinkSlip,
    focusedTankId,
    setFocusedTankId,
    focusedLineId,
    setFocusedLineId,
    mainScrollRef,
    activeStation,
    handleOpenStationMonitor,
    handleExitStationMonitor,
    handleOpenStockAdjustment,
    handleToggleTheme,
    isDaylightTheme,
    handleSwitchTab,
    handleSignOut,
    handleSelectRole,
    handleAddOperator,
    handleUpdateOperator,
    handleDeleteOperator,
    handleAddManagement,
    handleToggleManagementAccess,
    handleDeleteManagement,
    handleAdminLogin,
    handleAdminLogout,
    handleChangePin,
    handleAddAdminEmail,
    handleRemoveAdminEmail,
    handleExportJSON,
    handleJumpToReceive,
    resetAllUiOnLogout,
    viewTitles: VIEW_TITLES,
    contactProjectTypeOptions: CONTACT_PROJECT_TYPE_OPTIONS
  };
}
