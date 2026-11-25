import React from 'react';
import {
  X,
  LayoutDashboard,
  FileText,
  Truck,
  Cpu,
  Database,
  RefreshCw,
  Lock,
  LogOut,
  PackageOpen,
  Calculator,
  Download,
  Sparkles,
  Layers,
  Cylinder,
  Users,
  Shield,
  Printer,
  Boxes,
  Home,
  UserCheck,
  Eye,
  KeyRound,
  ArrowRight,
  ClipboardList,
  ExternalLink,
  MessageSquare,
  FileSpreadsheet,
  CalendarRange
} from 'lucide-react';
import { AppState } from '../types';
import { getCurrentShift } from '../utils/shifts';
import { getActiveWeeklyPlan } from '../utils/weeklyPlanComparison';
import { resolveEffectiveRole } from '../utils/roleAccess';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onOpenAdminModal: () => void;
  onOpenResetModal: () => void;
  onLoadSampleData: () => void;
  onExportData: () => void;
  onOpenPdfModal?: () => void;
  onOpenRoleSwitcher?: () => void;
  onOpenUserManagement?: () => void;
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  state,
  onSwitchTab,
  onOpenAdminModal,
  onOpenResetModal,
  onLoadSampleData,
  onExportData,
  onOpenPdfModal,
  onOpenRoleSwitcher,
  onOpenUserManagement,
  onSignOut
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const role = effectiveRole.role;
  const isAdmin = effectiveRole.isAdmin;
  const isOperator = effectiveRole.isOperator;
  const isManagement = effectiveRole.isManagement;
  const currentShift = getCurrentShift();
  const activeWeeklyPlan = getActiveWeeklyPlan(state);
  const pendingReqCount = state.transactions.requests.filter(r => r.status !== 'Received').length;
  const activeBatchCount = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  ).length;

  // Close sidebar on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleNavClick = (tab: AppState['currentTab']) => {
    onSwitchTab(tab);
    onClose();
  };

  const handleOpenInNewTab = (tab: AppState['currentTab'], e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}#tab=${tab}`;
    window.open(url, '_blank');
    onClose();
  };

  const navContent = (
    <div className="flex flex-col h-full justify-between bg-[var(--surface-header)] border-r border-border text-foreground select-none">
      {/* Top Header & Branding */}
      <div className="p-4 border-b border-border bg-background flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <PackageOpen className="w-5 h-5 text-brand" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm text-ink-primary tracking-tight">ProdTrack MES</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-tint-cyan text-brand border border-tint-cyan-border font-bold">
                MRP & WMS
              </span>
            </div>
            <p className="text-[10px] text-ink-secondary">
              Pabrik Biskuit & Coating
            </p>
          </div>
        </div>

        {/* Close button for popup sidebar on all device sizes */}
        <button
          onClick={onClose}
          aria-label="Tutup Menu Navigasi"
          title="Tutup Menu (Esc)"
          className="p-1.5 text-ink-secondary hover:text-ink-primary rounded-lg bg-elevated hover:bg-accent transition flex items-center space-x-1 border border-border-strong"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* User Session Profile Card */}
      <div className="px-3.5 py-3 bg-surface border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 truncate">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              isAdmin
                ? 'bg-amber-500/20 text-ink-amber border border-amber-500/40'
                : isOperator
                ? 'bg-cyan-500/20 text-brand border border-cyan-500/40'
                : 'bg-indigo-500/20 text-ink-indigo border border-indigo-500/40'
            }`}>
              {isAdmin ? <Shield className="w-4 h-4" /> : isOperator ? <UserCheck className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-ink-primary truncate">
                {state.currentSession?.name || (isAdmin ? 'Administrator' : isOperator ? 'Operator Lini' : 'Executive Management')}
              </p>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wider block ${
                isAdmin ? 'text-ink-amber' : isOperator ? 'text-brand' : 'text-ink-indigo'
              }`}>
                {effectiveRole.isOfflinePinAdmin ? 'Mode PIN Lokal' : role} {isManagement ? '(Pantau Saja)' : ''}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onSignOut) onSignOut();
              else if (onOpenRoleSwitcher) onOpenRoleSwitcher();
              onClose();
            }}
            title="Logout Total (Keluar ke Halaman Login & Sign Up)"
            className="p-1.5 rounded-lg bg-elevated hover:bg-rose-500/20 hover:text-ink-rose text-ink-secondary transition text-xs shrink-0 border border-border-strong"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Navigation Items */}
      <div className="flex-1 overflow-y-auto no-scrollbar py-3 px-2 space-y-4 text-xs">
        {/* SECTION 1: HALAMAN AWAL MODUL MRP & WMS (ADMINISTRATOR ONLY) */}
        {isAdmin && (
          <div className="space-y-1">
            <p className="px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-amber flex items-center space-x-1.5">
              <span>Halaman Utama Admin</span>
            </p>
            <div className={`w-full flex items-center justify-between rounded-xl font-bold transition ${
              state.currentTab === 'admin-portal'
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-ink-amber border border-amber-500/40 shadow-sm'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('admin-portal')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2.5 text-left"
              >
                <Home className="w-4 h-4 text-ink-amber shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">Portal Alur Operasional</span>
                  <span className="text-[10px] text-ink-amber font-normal">Ringkasan 7 Tahap MRP &amp; WMS</span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('admin-portal', e)}
                title="Buka Portal Admin di tab baru"
                className="p-2 mr-1 text-ink-secondary hover:text-ink-amber rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SECTION 2: ALUR KERJA OPERASIONAL BERURUTAN (TAHAP 1 - 7) */}
        <div className="space-y-1">
          <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
            Alur Kerja Operasional (1 → 7)
          </p>

          {/* 1. Konfigurasi Master BOM (ADMIN ONLY) */}
          {isAdmin && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'master'
                ? 'bg-amber-500/20 text-ink-amber border border-amber-500/40 font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('master')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <Database className="w-4 h-4 text-ink-amber shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">1. Konfigurasi Master BOM</span>
                  <span className="text-[10px] text-ink-secondary font-mono">
                    {state.master.skus.length} SKU · {state.master.materials.length} Mat · Mesin
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('master', e)}
                title="Buka Konfigurasi Master BOM di tab baru"
                className="p-1.5 mr-1 text-ink-secondary hover:text-ink-amber rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 2. Penentuan Planning Mingguan */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'weekly-planning'
              ? 'bg-emerald-500/20 text-ink-emerald border border-emerald-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('weekly-planning')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <CalendarRange className="w-4 h-4 text-ink-emerald shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">2. Planning Mingguan</span>
                <span className="text-[10px] text-ink-secondary font-mono">
                  {activeWeeklyPlan ? activeWeeklyPlan.weekLabel : 'Atur Target SKU/Shift'}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('weekly-planning', e)}
              title="Buka Planning Mingguan di tab baru"
              className="p-1.5 mr-1 text-ink-secondary hover:text-ink-emerald rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3. Permintaan Material (ADMIN & OPERATOR) */}
          {!isManagement && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'permintaan'
                ? 'bg-amber-500/20 text-ink-amber border border-amber-500/40 font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('permintaan')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <FileText className="w-4 h-4 text-ink-amber shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">3. Permintaan Material</span>
                  <span className="text-[10px] text-ink-secondary font-mono">
                    {pendingReqCount > 0 ? `${pendingReqCount} Order Menunggu` : 'Slip Order & Allowance'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('permintaan', e)}
                title="Buka Permintaan Material di tab baru"
                className="p-1.5 mr-1 text-ink-secondary hover:text-ink-amber rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 4. Pencatatan Kedatangan & Penerimaan Fisik Material (ADMIN & OPERATOR) */}
          {!isManagement && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'penerimaan'
                ? 'bg-emerald-500/20 text-ink-emerald border border-emerald-500/40 font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('penerimaan')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <Truck className="w-4 h-4 text-ink-emerald shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">4. Penerimaan Fisik</span>
                  <span className="text-[10px] text-ink-secondary font-mono">
                    Kedatangan, Zak &amp; Lot GDRM
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('penerimaan', e)}
                title="Buka Penerimaan Fisik Material di tab baru"
                className="p-1.5 mr-1 text-ink-secondary hover:text-ink-emerald rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 5. Pembuatan Work Order WIP (ADMIN & OPERATOR) */}
          {!isManagement && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'pemakaian'
                ? 'bg-purple-500/20 text-ink-purple border border-purple-500/40 font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('pemakaian')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <Layers className="w-4 h-4 text-ink-purple shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">5. Work Order WIP</span>
                  <span className="text-[10px] text-ink-secondary font-mono">
                    {activeBatchCount > 0 ? `${activeBatchCount} Batch Jalan` : 'Batch Mesin & FIFO'}
                  </span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('pemakaian', e)}
                title="Buka Work Order WIP di tab baru"
                className="p-1.5 mr-1 text-ink-secondary hover:text-ink-purple rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 6. Transfer WIP ke Storage & Tangki */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'tank-monitoring'
              ? 'bg-emerald-500/20 text-ink-emerald border border-emerald-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('tank-monitoring')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <Cylinder className="w-4 h-4 text-ink-emerald shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">6. Transfer WIP ke Storage</span>
                <span className="text-[10px] text-ink-secondary font-mono">
                  {state.master.tanks.length} Tangki Storage &amp; Holding
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('tank-monitoring', e)}
              title="Buka Transfer WIP & Tangki di tab baru"
              className="p-1.5 mr-1 text-ink-secondary hover:text-ink-emerald rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 7. Manufacturing (Control Room Produksi SKU) */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'dashboard'
              ? 'bg-cyan-500/20 text-brand border border-cyan-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('dashboard')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <Cpu className="w-4 h-4 text-brand shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">7. Manufacturing</span>
                <span className="text-[10px] text-ink-secondary font-mono">Control Room Lini &amp; OEE</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('dashboard', e)}
              title="Buka Manufacturing di tab baru"
              className="p-1.5 mr-1 text-ink-secondary hover:text-brand rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* SECTION 3: LAPORAN, KALKULATOR & INTEGRASI */}
        <div className="space-y-1 pt-1 border-t border-border-subtle">
          <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
            Laporan, Kalkulator &amp; Sync
          </p>

          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'shift-summary'
              ? 'bg-sky-500/20 text-ink-sky border border-sky-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('shift-summary')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
            >
              <ClipboardList className="w-3.5 h-3.5 text-ink-sky shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">Ringkasan Shift</span>
                <span className="text-[10px] text-ink-secondary font-mono">Output, SBL &amp; Konsumsi</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('shift-summary', e)}
              title="Buka Ringkasan Shift di tab baru"
              className="p-1 mr-1 text-ink-secondary hover:text-ink-sky rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={() => {
              if (onOpenPdfModal) onOpenPdfModal();
              onClose();
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl font-medium transition text-left text-ink-secondary hover:text-ink-primary hover:bg-elevated"
          >
            <Printer className="w-3.5 h-3.5 text-ink-rose shrink-0" />
            <div className="flex-1 truncate">
              <span className="block leading-tight">Report PDF Shift</span>
              <span className="text-[10px] text-ink-secondary font-mono">Landscape A4</span>
            </div>
          </button>

          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'sheets-sync'
              ? 'bg-emerald-500/20 text-ink-emerald border border-emerald-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('sheets-sync')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">Integrasi Google Sheets</span>
                <span className="text-[10px] text-ink-secondary font-mono">Sync Hasil Produksi</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('sheets-sync', e)}
              title="Buka Integrasi Google Sheets di tab baru"
              className="p-1 mr-1 text-ink-secondary hover:text-ink-emerald rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {!isManagement && (
            <div className={`w-full flex items-center justify-between rounded-xl text-xs font-medium transition ${
              state.currentTab === 'bom-calculator'
                ? 'bg-indigo-500/20 text-ink-indigo font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}>
              <button
                onClick={() => handleNavClick('bom-calculator')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
              >
                <Calculator className="w-3.5 h-3.5 text-ink-indigo shrink-0" />
                <span>Kalkulator Kebutuhan BOM</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('bom-calculator', e)}
                title="Buka Kalkulator BOM di tab baru"
                className="p-1 mr-1 text-ink-secondary hover:text-ink-indigo rounded-lg hover:bg-elevated transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* SECTION 4: ADMINISTRATOR UTILITIES */}
        {isAdmin && (
          <div className="space-y-1 pt-1 border-t border-border-subtle">
            <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
              Utilitas & Otoritas
            </p>

            {onOpenUserManagement && (
              <button
                onClick={() => {
                  onOpenUserManagement();
                  onClose();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-brand hover:bg-cyan-500/10 transition text-left"
              >
                <Users className="w-3.5 h-3.5 text-brand shrink-0" />
                <span>Kelola Pengguna ({state.registeredOperators.length + state.registeredManagement.length})</span>
              </button>
            )}

            <button
              onClick={() => {
                onLoadSampleData();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-elevated transition text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-ink-amber shrink-0" />
              <span>Muat Preset Data Contoh</span>
            </button>

            <button
              onClick={() => {
                onExportData();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-elevated transition text-left"
            >
              <Download className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
              <span>Export Database (JSON)</span>
            </button>

            <button
              onClick={() => {
                onOpenResetModal();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-ink-rose hover:bg-rose-500/10 transition text-left"
            >
              <RefreshCw className="w-3.5 h-3.5 text-ink-rose shrink-0" />
              <span>Reset Sistem</span>
            </button>
          </div>
        )}
        {/* SECTION 5: DUKUNGAN & KONTAK TEKNIS */}
        <div className="space-y-1 pt-1 border-t border-border-subtle">
          <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
            Bantuan &amp; Layanan
          </p>
          <div className={`w-full flex items-center justify-between rounded-xl text-xs font-medium transition ${
            state.currentTab === 'contact'
              ? 'bg-cyan-500/20 text-brand border border-cyan-500/40 font-bold'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}>
            <button
              onClick={() => handleNavClick('contact')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <MessageSquare className="w-3.5 h-3.5 text-brand shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">Kontak &amp; Dukungan</span>
                <span className="text-[10px] text-ink-secondary font-mono">Helpdesk Teknis MES</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('contact', e)}
              title="Buka Kontak & Dukungan di tab baru"
              className="p-1 mr-1 text-ink-secondary hover:text-brand rounded-lg hover:bg-elevated transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer / Exit Action */}
      <div className="p-3 border-t border-border-subtle bg-canvas space-y-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono px-1">
          <span>Shift {currentShift.shift} Terkini</span>
          <span>ProdTrack v4.2</span>
        </div>

        <button
          onClick={() => {
            if (onSignOut) onSignOut();
            else if (onOpenRoleSwitcher) onOpenRoleSwitcher();
            onClose();
          }}
          className="w-full py-2 px-3 bg-elevated hover:bg-tint-rose hover:border-rose-500/50 hover:text-ink-rose text-ink-secondary font-semibold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition border border-border-strong active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Logout Total / Ganti Akun</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Backdrop overlay for all devices (computer, tablet, mobile) */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 bg-black/75 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* 2. Slide-over popup navigation drawer for all devices */}
      <aside
        aria-label="Menu Navigasi Modul"
        className={`fixed top-0 bottom-0 left-0 w-80 sm:w-84 max-w-[88vw] z-50 transform transition-transform duration-300 ease-out shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>
    </>
  );
};
