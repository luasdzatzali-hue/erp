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
  ExternalLink
} from 'lucide-react';
import { AppState } from '../types';
import { getCurrentShift } from '../utils/shifts';

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
  const role = state.currentUserRole;
  const isAdmin = role === 'ADMINISTRATOR';
  const isOperator = role === 'OPERATOR';
  const isManagement = role === 'MANAGEMENT';
  const currentShift = getCurrentShift();

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
    <div className="flex flex-col h-full justify-between bg-slate-900 border-r border-slate-800 text-slate-200 select-none">
      {/* Top Header & Branding */}
      <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-indigo-600 p-0.5 shadow-md shadow-cyan-900/30">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <PackageOpen className="w-5 h-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-sm text-white tracking-tight">ProdTrack MES</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                MRP & WMS
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Pabrik Biskuit & Coating
            </p>
          </div>
        </div>

        {/* Close button for popup sidebar on all device sizes */}
        <button
          onClick={onClose}
          aria-label="Tutup Menu Navigasi"
          title="Tutup Menu (Esc)"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-750 transition flex items-center space-x-1 border border-slate-750"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* User Session Profile Card */}
      <div className="px-3.5 py-3 bg-slate-950/40 border-b border-slate-800/60 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5 truncate">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              isAdmin
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : isOperator
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
            }`}>
              {isAdmin ? <Shield className="w-4 h-4" /> : isOperator ? <UserCheck className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-white truncate">
                {state.currentSession?.name || (isAdmin ? 'Administrator' : isOperator ? 'Operator Lini' : 'Executive Management')}
              </p>
              <span className={`text-[9px] font-mono font-bold uppercase tracking-wider block ${
                isAdmin ? 'text-amber-400' : isOperator ? 'text-cyan-400' : 'text-indigo-400'
              }`}>
                {role} {isManagement ? '(Pantau Saja)' : ''}
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
            title="Keluar / Ganti Pengguna"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-400 transition text-xs shrink-0 border border-slate-700/60"
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
            <p className="px-2.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400/90 flex items-center space-x-1.5">
              <span>Halaman Utama Admin</span>
            </p>
            <div className={`w-full flex items-center justify-between rounded-xl font-bold transition ${
              state.currentTab === 'admin-portal'
                ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/10 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}>
              <button
                onClick={() => handleNavClick('admin-portal')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2.5 text-left"
              >
                <Home className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">Portal Modul MRP & WMS</span>
                  <span className="text-[10px] text-amber-400/70 font-normal">5 Modul dalam 1 Layar</span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('admin-portal', e)}
                title="Buka Portal Admin di tab baru"
                className="p-2 mr-1 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SECTION 2: MODUL APLIKASI MRP & WMS */}
        <div className="space-y-1">
          <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Modul Aplikasi MRP & WMS
          </p>

          {/* 1. Manufacturing (Dashboard Simulasi Produksi SKU) */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'dashboard'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}>
            <button
              onClick={() => handleNavClick('dashboard')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">1. Manufacturing</span>
                <span className="text-[10px] text-slate-400 font-mono">Simulasi & OEE</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('dashboard', e)}
              title="Buka Manufacturing di tab baru"
              className="p-1.5 mr-1 text-slate-400 hover:text-cyan-300 rounded-lg hover:bg-slate-800 transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 2. Inventory & Tanks (Penerimaan & Monitoring Tangki WIP) */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'tank-monitoring'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}>
            <button
              onClick={() => handleNavClick('tank-monitoring')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <Cylinder className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">2. Inventory & Tangki WIP</span>
                <span className="text-[10px] text-slate-400 font-mono">{state.master.tanks.length} Tangki Live</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('tank-monitoring', e)}
              title="Buka Inventory & Tangki di tab baru"
              className="p-1.5 mr-1 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-800 transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3. Work Orders WIP (Pemakaian & Batch Resep) - OPERATOR & ADMIN */}
          {!isManagement && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'pemakaian'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}>
              <button
                onClick={() => handleNavClick('pemakaian')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <Layers className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">3. Work Order WIP</span>
                  <span className="text-[10px] text-slate-400 font-mono">Batch & Resep Mesin</span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('pemakaian', e)}
                title="Buka Work Order WIP di tab baru"
                className="p-1.5 mr-1 text-slate-400 hover:text-purple-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 4. Ringkasan Produksi Shift Saat Ini */}
          <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
            state.currentTab === 'shift-summary'
              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
              : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          }`}>
            <button
              onClick={() => handleNavClick('shift-summary')}
              className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
            >
              <ClipboardList className="w-4 h-4 text-sky-400 shrink-0" />
              <div className="flex-1 truncate">
                <span className="block leading-tight">4. Ringkasan Shift</span>
                <span className="text-[10px] text-slate-400 font-mono">Output, SBL &amp; Konsumsi</span>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => handleOpenInNewTab('shift-summary', e)}
              title="Buka Ringkasan Shift di tab baru"
              className="p-1.5 mr-1 text-slate-400 hover:text-sky-300 rounded-lg hover:bg-slate-800 transition shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 5. Report PDF (Shift Production & Actual Stock Balance) */}
          <button
            onClick={() => {
              if (onOpenPdfModal) onOpenPdfModal();
              onClose();
            }}
            className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl font-medium transition text-left text-slate-300 hover:text-white hover:bg-slate-800/60"
          >
            <Printer className="w-4 h-4 text-rose-400 shrink-0" />
            <div className="flex-1 truncate">
              <span className="block leading-tight">5. Report PDF Shift</span>
              <span className="text-[10px] text-slate-400 font-mono">Landscape A4</span>
            </div>
          </button>

          {/* 6. Konfigurasi Master BOM (ADMIN ONLY) */}
          {isAdmin && (
            <div className={`w-full flex items-center justify-between rounded-xl font-medium transition ${
              state.currentTab === 'master'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                : 'text-amber-300/90 hover:text-amber-200 hover:bg-amber-950/30'
            }`}>
              <button
                onClick={() => handleNavClick('master')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-2 text-left"
              >
                <Database className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 truncate">
                  <span className="block leading-tight">6. Konfigurasi Master BOM</span>
                  <span className="text-[10px] text-amber-400/70 font-mono">Hierarki 4 Tingkat</span>
                </div>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('master', e)}
                title="Buka Konfigurasi Master BOM di tab baru"
                className="p-1.5 mr-1 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* SECTION 3: MODUL OPERASIONAL PENDUKUNG */}
        {!isManagement && (
          <div className="space-y-1">
            <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Operasional Gudang
            </p>

            <div className={`w-full flex items-center justify-between rounded-xl text-xs font-medium transition ${
              state.currentTab === 'penerimaan'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}>
              <button
                onClick={() => handleNavClick('penerimaan')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
              >
                <Truck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Penerimaan Bahan GDRM</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('penerimaan', e)}
                title="Buka Penerimaan di tab baru"
                className="p-1 mr-1 text-slate-400 hover:text-emerald-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`w-full flex items-center justify-between rounded-xl text-xs font-medium transition ${
              state.currentTab === 'permintaan'
                ? 'bg-amber-500/20 text-amber-300 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}>
              <button
                onClick={() => handleNavClick('permintaan')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
              >
                <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Permintaan Bahan Baku</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('permintaan', e)}
                title="Buka Permintaan di tab baru"
                className="p-1 mr-1 text-slate-400 hover:text-amber-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className={`w-full flex items-center justify-between rounded-xl text-xs font-medium transition ${
              state.currentTab === 'bom-calculator'
                ? 'bg-indigo-500/20 text-indigo-300 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}>
              <button
                onClick={() => handleNavClick('bom-calculator')}
                className="flex-1 flex items-center space-x-2.5 px-3 py-1.5 text-left"
              >
                <Calculator className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span>Kalkulator Kebutuhan BOM</span>
              </button>
              <button
                type="button"
                onClick={(e) => handleOpenInNewTab('bom-calculator', e)}
                title="Buka Kalkulator BOM di tab baru"
                className="p-1 mr-1 text-slate-400 hover:text-indigo-300 rounded-lg hover:bg-slate-800 transition shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SECTION 4: ADMINISTRATOR UTILITIES */}
        {isAdmin && (
          <div className="space-y-1 pt-1 border-t border-slate-800/70">
            <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Utilitas & Otoritas
            </p>

            {onOpenUserManagement && (
              <button
                onClick={() => {
                  onOpenUserManagement();
                  onClose();
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-cyan-300 hover:bg-cyan-500/10 transition text-left"
              >
                <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Kelola Pengguna ({state.registeredOperators.length + state.registeredManagement.length})</span>
              </button>
            )}

            <button
              onClick={() => {
                onLoadSampleData();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition text-left"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Muat Preset Data Contoh</span>
            </button>

            <button
              onClick={() => {
                onExportData();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition text-left"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Export Database (JSON)</span>
            </button>

            <button
              onClick={() => {
                onOpenResetModal();
                onClose();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-400/90 hover:bg-rose-500/10 transition text-left"
            >
              <RefreshCw className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Reset Sistem</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer / Exit Action */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/80 space-y-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono px-1">
          <span>Shift {currentShift.shift} Terkini</span>
          <span>ProdTrack v4.2</span>
        </div>

        <button
          onClick={() => {
            if (onSignOut) onSignOut();
            else if (onOpenRoleSwitcher) onOpenRoleSwitcher();
            onClose();
          }}
          className="w-full py-2 px-3 bg-slate-800 hover:bg-rose-950/40 hover:border-rose-500/50 hover:text-rose-300 text-slate-300 font-semibold rounded-xl text-xs flex items-center justify-center space-x-1.5 transition border border-slate-700/80 active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar / Ganti Pengguna</span>
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
