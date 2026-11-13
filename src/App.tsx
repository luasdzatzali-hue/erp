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
  MaterialStockAdjustment
} from './types';
import {
  loadStoredState,
  saveStateToStorage,
  getSampleState,
  DEFAULT_STATE
} from './utils/storage';
import { getMaterialCompositeKey } from './utils/materialParser';
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
import { AuthPortalView } from './components/views/AuthPortalView';
import { AdminPortalView } from './components/views/AdminPortalView';
import { ShiftReportPdfModal } from './components/ShiftReportPdfModal';
import { WipCompletionAlarmModal } from './components/WipCompletionAlarmModal';
import { UserRoleSwitcherModal } from './components/UserRoleSwitcherModal';
import { UserManagementModal } from './components/UserManagementModal';
import { MaterialStockAdjustmentModal } from './components/MaterialStockAdjustmentModal';
import { playWipCompletionChime } from './utils/soundAlarm';
import { CheckCircle2, AlertCircle, FileText, Activity, Clock, Zap, Layers } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadStoredState());
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
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

  // Save state on any change
  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

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
        if (!prev.tank.isSimulationActive) return prev;
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

  // Switch tabs with role-based access control
  const handleSwitchTab = (tab: AppState['currentTab']) => {
    if (tab === 'reports') {
      setIsPdfReportModalOpen(true);
      return;
    }
    const role = stateRef.current.currentUserRole;
    if (role === 'MANAGEMENT' && tab !== 'dashboard' && tab !== 'tank-monitoring') {
      showToast('Akses dibatasi: User Management hanya memiliki izin melihat Dashboard dan Tangki WIP', true);
      return;
    }
    if (role !== 'ADMINISTRATOR' && (tab === 'master' || tab === 'admin-portal')) {
      showToast('Akses dibatasi: Portal dan Master BOM hanya dapat diakses oleh Administrator', true);
      return;
    }
    setState(prev => ({ ...prev, currentTab: tab }));
  };

  // Sign In Success from AuthPortalView
  const handleLoginSuccess = (
    role: UserRole,
    sessionData: { id: string; name: string; subtitle?: string; email?: string }
  ) => {
    setState(prev => {
      const isNewAdmin = role === 'ADMINISTRATOR';
      const initialTab: AppState['currentTab'] =
        role === 'ADMINISTRATOR'
          ? 'admin-portal'
          : role === 'OPERATOR'
          ? 'pemakaian'
          : 'dashboard';

      return {
        ...prev,
        isAuthenticated: true,
        currentUserRole: role,
        isAdmin: isNewAdmin,
        currentTab: initialTab,
        currentSession: {
          role,
          id: sessionData.id,
          name: sessionData.name,
          subtitle: sessionData.subtitle,
          email: sessionData.email
        }
      };
    });
    showToast(`Selamat datang, ${sessionData.name} (${role})`);
  };

  // Sign Out back to AuthPortalView
  const handleSignOut = () => {
    setState(prev => ({
      ...prev,
      isAuthenticated: false
    }));
    showToast('Berhasil keluar dari sistem');
  };

  // Role switching (Administrator, Operator, Management)
  const handleSelectRole = (
    role: UserRole,
    sessionData?: { id: string; name: string; subtitle?: string; email?: string }
  ) => {
    setState(prev => {
      const isNewAdmin = role === 'ADMINISTRATOR';
      let nextTab = prev.currentTab;

      // Management is strictly restricted to dashboard & tank-monitoring
      if (role === 'MANAGEMENT' && nextTab !== 'dashboard' && nextTab !== 'tank-monitoring') {
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
    const newOp: RegisteredOperator = {
      ...opData,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      registeredAt: new Date().toISOString()
    };
    setState(prev => ({
      ...prev,
      registeredOperators: [newOp, ...(prev.registeredOperators || [])]
    }));
    showToast(`Operator "${newOp.name}" berhasil didaftarkan`);
  };

  const handleUpdateOperator = (id: string, updates: Partial<RegisteredOperator>) => {
    setState(prev => ({
      ...prev,
      registeredOperators: (prev.registeredOperators || []).map(op =>
        op.id === id ? { ...op, ...updates } : op
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
    const newMgt: RegisteredManagement = {
      ...mgtData,
      id: `mgt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      registeredAt: new Date().toISOString()
    };
    setState(prev => ({
      ...prev,
      registeredManagement: [newMgt, ...(prev.registeredManagement || [])]
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

  const handleChangePin = (newPin: string) => {
    setState(prev => ({ ...prev, adminPin: newPin }));
  };

  const handleAddAdminEmail = (email: string) => {
    const cleanEmail = email.toLowerCase().trim();
    setState(prev => {
      const current = prev.adminGoogleEmails || ['luasdzatzali@gmail.com'];
      if (current.includes(cleanEmail)) return prev;
      return {
        ...prev,
        adminGoogleEmails: [...current, cleanEmail]
      };
    });
  };

  const handleRemoveAdminEmail = (email: string) => {
    const cleanEmail = email.toLowerCase().trim();
    if (cleanEmail === 'luasdzatzali@gmail.com') return; // Protect super admin
    setState(prev => ({
      ...prev,
      adminGoogleEmails: (prev.adminGoogleEmails || ['luasdzatzali@gmail.com']).filter(
        e => e.toLowerCase().trim() !== cleanEmail
      )
    }));
  };

  // Full Reset to empty
  // 1. Reset All Data
  const handleResetAll = () => {
    setState({
      ...DEFAULT_STATE,
      isAdmin: state.isAdmin,
      adminPin: state.adminPin,
      tank: {
        ...DEFAULT_STATE.tank,
        level: 0.0
      }
    });
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
        machines: [],
        tanks: []
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
    setState({
      ...sample,
      isAdmin: state.isAdmin,
      adminPin: state.adminPin
    });
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
    setState(prev => {
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
        // Append mode: merge based on SKU code / name
        const map = new Map<string, SKU>();
        prev.master.skus.forEach(s => {
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
      showToast(
        mode === 'replace'
          ? `Berhasil mengganti seluruh master SKU (${finalSkus.length} SKU: ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
          : `Berhasil mengimpor & memperbarui master SKU (${newSkus.length} SKU diproses: total ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
      );

      return {
        ...prev,
        master: {
          ...prev.master,
          skus: finalSkus
        }
      };
    });
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
    notes?: string
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

    // Pre-check all candidate tanks (holding & storage tanks) to guarantee sufficient WIP availability
    for (const sw of linkedWips) {
      const wip = currentState.master.wips.find(w => w.id === sw.wipId);
      const neededKg = cartonCount * sw.kgWipPerCartonSku;
      const candidateTanks = currentState.master.tanks.filter(
        t => t.id === wip?.targetTankId || t.assignedWipId === wip?.id
      );

      if (candidateTanks.length === 0) {
        return {
          success: false,
          message: `WIP "${wip?.name || 'WIP'}" belum memiliki tangki holding atau storage yang ditautkan!`
        };
      }

      const totalAvailableKg = candidateTanks.reduce((sum, t) => sum + t.currentLevelKg, 0);
      if (totalAvailableKg < neededKg) {
        return {
          success: false,
          message: `Massa WIP "${wip?.name}" tidak cukup! Butuh ${neededKg.toFixed(2)} kg, total di holding & storage tank hanya tersisa ${totalAvailableKg.toFixed(2)} kg.`
        };
      }
    }

    // Execute deduction
    const timestamp = new Date().toISOString();
    const currentShiftObj = getCurrentShift();
    const deductions: CartonProductionLog['tankDeductions'] = [];
    const newTankLogs: TankTransferLog[] = [];

    setState(prev => {
      const updatedTanks = prev.master.tanks.map(t => ({ ...t }));

      linkedWips.forEach(sw => {
        const wip = prev.master.wips.find(w => w.id === sw.wipId);
        let neededKg = cartonCount * sw.kgWipPerCartonSku;

        // Find candidate tanks, prioritizing HOLDING_TANK first, then STORAGE_TANK
        const candidateIndices = updatedTanks
          .map((t, idx) => ({ t, idx }))
          .filter(
            item => item.t.id === wip?.targetTankId || item.t.assignedWipId === wip?.id
          )
          .sort((a, b) => {
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
            id: `tl_${Date.now()}_${sw.id}_${updatedTanks[idx].id}`,
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
            skuName: targetSku.name,
            cartonsCount: cartonCount,
            operatorName,
            notes: notes || `Otomatis terpotong untuk ${cartonCount} karton ${targetSku.name} (${updatedTanks[idx].type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})`
          });
        }
      });

      const newCartonLog: CartonProductionLog = {
        id: `cp_${Date.now()}`,
        timestamp,
        skuId: targetSku.id,
        skuName: targetSku.name,
        skuCode: targetSku.code,
        cartonsProduced: cartonCount,
        shift: currentShiftObj.shift,
        operatorName,
        tankDeductions: deductions,
        notes
      };

      // Update active SKU runs cartons count if running
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedActiveRuns = prevRuns.map(r => {
        if (r.skuId === targetSku.id) {
          return {
            ...r,
            cartonsProducedTotal: (r.cartonsProducedTotal || 0) + cartonCount,
            lastDeductionTime: timestamp
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
          cartonProductions: [newCartonLog, ...(prev.transactions.cartonProductions || [])],
          tankLogs: [...newTankLogs, ...(prev.transactions.tankLogs || [])]
        }
      };
    });

    return {
      success: true,
      message: `Berhasil mencatat ${cartonCount} karton ${targetSku.name}. Isi tangki Holding & Storage otomatis berkurang secara real-time!`
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

  // Start Single SKU Production - Supports running multiple SKUs concurrently
  const handleStartSkuProduction = (skuId: string, operatorName?: string, speedMultiplier: number = 1) => {
    const currentState = stateRef.current;
    const targetSku = currentState.master.skus.find(s => s.id === skuId);
    if (!targetSku) return;

    const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuId);
    if (linkedWips.length === 0) {
      showToast(`SKU "${targetSku.name}" belum memiliki relasi BOM WIP! Harap atur di Master BOM.`, true);
      return;
    }

    const currentShiftObj = getCurrentShift();
    const op = operatorName || 'Operator Line Produksi';

    const newRun: ActiveSkuProductionRun = {
      skuId: targetSku.id,
      skuName: targetSku.name,
      skuCode: targetSku.code,
      shift: currentShiftObj.shift,
      startedAt: new Date().toISOString(),
      isRunning: true,
      cartonsProducedTotal: 0,
      operatorName: op,
      targetPerHour: targetSku.targetHour,
      speedMultiplier: speedMultiplier || 1
    };

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const otherRuns = prevRuns.filter(r => r.skuId !== targetSku.id);
      const updatedRuns = [newRun, ...otherRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRun
      };
    });

    // Langsung lakukan pemotongan awal (1 karton) seketika tombol Start ditekan,
    // sehingga isi holding & storage tank langsung terpotong secara real-time tanpa harus input manual
    setTimeout(() => {
      handleProduceCartons(
        targetSku.id,
        1,
        op,
        `Mulai Produksi: Pengurangan awal otomatis (${targetSku.name}) - Target BOM: ${targetSku.targetHour} ktn/jam`
      );
    }, 50);

    showToast(`Produksi "${targetSku.name}" dimulai! Isi holding & storage tank otomatis berkurang secara real-time (${targetSku.targetHour} ktn/jam).`);
  };

  // Start Multiple SKUs Production Concurrently
  const handleStartMultipleSkus = (skuIds: string[], operatorName?: string, speedMultiplier: number = 1) => {
    const currentState = stateRef.current;
    const validSkus = currentState.master.skus.filter(s => skuIds.includes(s.id));
    if (validSkus.length === 0) {
      showToast('Pilih minimal satu SKU untuk dijalankan.', true);
      return;
    }

    const currentShiftObj = getCurrentShift();
    const op = operatorName || 'Operator Line Produksi';

    const newRuns: ActiveSkuProductionRun[] = validSkus.map(s => ({
      skuId: s.id,
      skuName: s.name,
      skuCode: s.code,
      shift: currentShiftObj.shift,
      startedAt: new Date().toISOString(),
      isRunning: true,
      cartonsProducedTotal: 0,
      operatorName: op,
      targetPerHour: s.targetHour,
      speedMultiplier: speedMultiplier || 1
    }));

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const unchangedRuns = prevRuns.filter(r => !skuIds.includes(r.skuId));
      const updatedRuns = [...newRuns, ...unchangedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRuns[0] || null
      };
    });

    // Trigger initial deduction for each started SKU
    newRuns.forEach((run, idx) => {
      setTimeout(() => {
        handleProduceCartons(
          run.skuId,
          1,
          op,
          `Mulai Multi-SKU: Pengurangan awal otomatis (${run.skuName})`
        );
      }, 50 * (idx + 1));
    });

    showToast(`${validSkus.length} SKU berhasil dijalankan bersamaan! Tangki holding & storage otomatis berkurang secara real-time.`);
  };

  // Change Speed Multiplier for live automated depletion (can target specific SKU or all)
  const handleSetRunSpeedMultiplier = (speedMultiplier: number, skuId?: string) => {
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (!skuId || r.skuId === skuId) {
          return { ...r, speedMultiplier };
        }
        return r;
      });
      const updatedActiveRun = prev.activeSkuRun
        ? (!skuId || prev.activeSkuRun.skuId === skuId
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

  // Stop Specific SKU Production (Six Big Losses TPM)
  const handleStopSkuProduction = (stopData: Omit<ProductionStopLog, 'id'>) => {
    const newStopLog: ProductionStopLog = {
      ...stopData,
      id: `stop_${Date.now()}`
    };

    const targetSkuId = stopData.skuId;

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (r.skuId === targetSkuId) {
          return { ...r, isRunning: false };
        }
        return r;
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || (prev.activeSkuRun?.skuId === targetSkuId ? { ...prev.activeSkuRun, isRunning: false } : prev.activeSkuRun),
        transactions: {
          ...prev.transactions,
          productionStops: [newStopLog, ...(prev.transactions.productionStops || [])]
        }
      };
    });

    showToast(`Produksi SKU "${stopData.skuName}" dihentikan: Alasan Six Big Losses tercatat.`);
  };

  // Stop All Running SKUs Production
  const handleStopAllSkuProduction = () => {
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => ({ ...r, isRunning: false }));
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: prev.activeSkuRun ? { ...prev.activeSkuRun, isRunning: false } : null
      };
    });
    showToast('Seluruh lini SKU yang sedang berjalan telah dihentikan.');
  };

  // Engine Pengurangan Isi Tangki Otomatis Real-Time untuk SEMUA SKU yang Sedang Berjalan (Multi-SKU)
  // Menghitung laju konsumsi WIP berdasarkan Target Karton per Jam (targetHour) masing-masing SKU dari Master BOM.
  useEffect(() => {
    const prevRuns = state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : []);
    const runningRuns = prevRuns.filter(r => r.isRunning);
    if (runningRuns.length === 0) return;

    const intervalIds: NodeJS.Timeout[] = [];

    runningRuns.forEach(run => {
      const currentSku = state.master.skus.find(s => s.id === run.skuId);
      if (!currentSku) return;

      const targetPerHour = currentSku.targetHour || 600;
      const speedMult = run.speedMultiplier || 1;
      const secondsPerCarton = 3600 / targetPerHour;
      const intervalMs = Math.max(800, Math.round((secondsPerCarton / speedMult) * 1000));

      const timer = setInterval(() => {
        const activeState = stateRef.current;
        const runsNow = activeState.activeSkuRuns || (activeState.activeSkuRun ? [activeState.activeSkuRun] : []);
        const thisRun = runsNow.find(r => r.skuId === run.skuId);
        if (!thisRun?.isRunning) return;

        const res = handleProduceCartons(
          run.skuId,
          1,
          thisRun.operatorName || 'Auto Depletion Engine (BOM)',
          `Auto Multi-SKU (${currentSku.name} - Target BOM: ${targetPerHour} ktn/jam) - Pengurangan Tangki Holding & Storage`
        );

        if (!res.success) {
          setState(prev => {
            const currentRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
            const updatedRuns = currentRuns.map(r =>
              r.skuId === run.skuId ? { ...r, isRunning: false } : r
            );
            return {
              ...prev,
              activeSkuRuns: updatedRuns,
              activeSkuRun: updatedRuns.find(r => r.isRunning) || null
            };
          });
          showToast(`⚠️ Stok Tangki Habis untuk SKU "${currentSku.name}": ${res.message}`, true);
        }
      }, intervalMs);

      intervalIds.push(timer);
    });

    return () => {
      intervalIds.forEach(id => clearInterval(id));
    };
  }, [
    state.activeSkuRuns,
    state.activeSkuRun,
    state.master.skus
  ]);


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

  // Record Usage
  const handleRecordUsage = (usageData: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => {
    setState(prev => {
      const count = prev.transactions.usages.length + 1;
      const usageNumber = `USG-${new Date().toISOString().slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
      const newUsage: MaterialUsage = {
        ...usageData,
        shift: usageData.shift || (getCurrentShift().shift),
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

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const startedAt = `${dateStr} ${timeStr}`;
    const batchCount = (state.transactions.wipBatches || []).length + 1;
    const batchCode = `PK-WIP-${dateStr.replace(/-/g, '').slice(0, 6)}-${String(batchCount).padStart(3, '0')}`;
    const batchId = `wpb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newBatch: WipProductionBatch = {
      ...batchData,
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
        shift: batchData.shift || (getCurrentShift().shift),
        skuId: batchData.skuId || state.master.skus[0]?.id || 'SKU_GENERIC',
        wipId: batchData.wipId,
        materialId: matItem.materialId,
        qty: matItem.requiredKg,
        batch: 1,
        usageQty: matItem.actualUsedKg,
        sourceLocation: matItem.sourceLocation,
        operatorName: batchData.operatorName || `Operator Shift ${batchData.shift || 1}`,
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
    permintaan: 'Permintaan Material GDRM (Warehouse)',
    penerimaan: 'Penerimaan Material & Inbound Kedatangan',
    pemakaian: 'Work Order WIP & Pemakaian Material Resep',
    master: 'Konfigurasi Master BOM, Resep, Mesin & Tangki',
    'bom-calculator': 'Kalkulator Kebutuhan Produksi & Formulasi BOM',
    reports: 'Laporan Saldo Stock Aktual Shift (PDF Landscape)'
  };

  // 1. TAMPILAN AWAL: PORTAL SIGN IN (PILIH JENIS PENGGUNA)
  if (!state.isAuthenticated) {
    return (
      <div className="min-h-screen w-full overflow-y-auto bg-slate-950 text-slate-100 font-sans">
        <AuthPortalView
          state={state}
          theme={state.theme === 'daylight' || state.theme === 'light' ? 'daylight' : 'midnight'}
          onToggleTheme={handleToggleTheme}
          onLoginSuccess={handleLoginSuccess}
          showToast={showToast}
        />

        {/* Global Toast Notification */}
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 transform transition-all duration-300 pointer-events-none ${
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100 font-sans select-none">
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
                      {runs.length === 1 ? '1 SKU Diproses:' : `${runs.length} SKU Diproses:`}
                    </span>
                    <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-[450px]">
                      {runs.map((r, i) => (
                        <span key={r.skuId} className="flex items-center space-x-1 whitespace-nowrap">
                          {i > 0 && <span className="text-slate-500">•</span>}
                          <span className="text-white font-semibold">{r.skuName}</span>
                          <span className="text-cyan-400 font-mono text-[10px]">
                            ({((r.targetPerHour || 600) * (r.speedMultiplier || 1)).toFixed(0)} ktn/j)
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
              onOpenTankModal={() => setIsTankModalOpen(true)}
              onSwitchTab={handleSwitchTab}
              onTransferStock={handleTransferStock}
              onProduceCartons={handleProduceCartons}
              onStartSkuProduction={handleStartSkuProduction}
              onStartMultipleSkus={handleStartMultipleSkus}
              onStopSkuProduction={handleStopSkuProduction}
              onStopAllSkuProduction={handleStopAllSkuProduction}
              onSetRunSpeedMultiplier={handleSetRunSpeedMultiplier}
              onOpenPdfModal={() => setIsPdfReportModalOpen(true)}
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
        className={`fixed top-14 left-1/2 -translate-x-1/2 z-50 transform transition-all duration-300 pointer-events-none ${
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
