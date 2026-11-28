import React from 'react';
import {
  Menu,
  Shield,
  UserCheck,
  Eye,
  LogOut,
  Sun,
  Moon,
  Search,
  Cloud,
  CloudOff,
  Loader2,
  FileText,
  Lock,
  CheckCircle2,
  RefreshCw,
  WifiOff
} from 'lucide-react';
import { AppState } from '../types';
import { resolveEffectiveRole } from '../utils/roleAccess';
import { getCurrentShift } from '../utils/shifts';

interface HeaderProps {
  state: AppState;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  onOpenSidebar: () => void;
  onOpenAdminModal: () => void;
  onOpenTankModal: () => void;
  onLoadSampleData?: () => void;
  onOpenPdfModal?: () => void;
  onOpenRoleSwitcher: () => void;
  onOpenUserManagement?: () => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onSignOut?: () => void;
  onOpenCommandMenu?: () => void;
  isSyncingCloud?: boolean;
  isCloudConnected?: boolean;
  isCloudQuotaExceeded?: boolean;
  offlinePendingCount?: number;
  isOfflineFlushing?: boolean;
  isNetworkOnline?: boolean;
  onSyncOfflineQueueNow?: () => void;
  currentViewTitle: string;
}

interface CoreTabDef {
  id: string;
  label: string;
  targetTab: AppState['currentTab'];
  isActive: boolean;
  locked?: boolean;
  title?: string;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  theme,
  onToggleTheme,
  onOpenSidebar,
  onOpenTankModal,
  onOpenPdfModal,
  onOpenRoleSwitcher,
  onSwitchTab,
  onSignOut,
  onOpenCommandMenu,
  isSyncingCloud = false,
  isCloudConnected = false,
  isCloudQuotaExceeded = false,
  offlinePendingCount = 0,
  isOfflineFlushing = false,
  isNetworkOnline = true,
  onSyncOfflineQueueNow
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isManagement = effectiveRole.isManagement;
  const isAdmin = effectiveRole.isAdmin;
  const isOperator = effectiveRole.isOperator;
  const isDaylight = theme === 'daylight' || theme === 'light';
  const shiftInfo = getCurrentShift();

  const isTempNormal =
    state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;

  const workspaceLabel = state.factoryName?.trim() || 'ProdTrack MES';

  const roleBadgeLabel = effectiveRole.isOfflinePinAdmin
    ? 'PIN Lokal'
    : isAdmin
    ? 'Admin'
    : isOperator
    ? 'Operator'
    : 'Mgmt';

  // 4 Tab Inti Dinamis (1-Klik sesuai Role)
  const coreTabs: CoreTabDef[] = isOperator
    ? [
        {
          id: 'op-dashboard',
          label: 'Manufacturing (Lini)',
          targetTab: 'dashboard',
          isActive: state.currentTab === 'dashboard'
        },
        {
          id: 'op-tanks',
          label: 'Tangki WIP',
          targetTab: 'tank-monitoring',
          isActive: state.currentTab === 'tank-monitoring'
        },
        {
          id: 'op-pemakaian',
          label: 'Pemakaian & Batch',
          targetTab: 'pemakaian',
          isActive: state.currentTab === 'pemakaian'
        },
        {
          id: 'op-permintaan-terima',
          label: 'Permintaan / Terima',
          targetTab: state.currentTab === 'permintaan' ? 'penerimaan' : 'permintaan',
          isActive: state.currentTab === 'permintaan' || state.currentTab === 'penerimaan',
          title:
            state.currentTab === 'permintaan'
              ? 'Klik untuk beralih ke Penerimaan Material'
              : 'Klik untuk membuka Permintaan / Terima Material'
        }
      ]
    : [
        {
          id: 'adm-dashboard',
          label: 'Control Room',
          targetTab: 'dashboard',
          isActive: state.currentTab === 'dashboard'
        },
        {
          id: 'adm-master',
          label: 'Master BOM',
          targetTab: 'master',
          isActive: state.currentTab === 'master',
          locked: !isAdmin,
          title: isAdmin ? 'Konfigurasi Master BOM & Resep' : 'Khusus Administrator'
        },
        {
          id: 'adm-planning',
          label: 'Planning Mingguan',
          targetTab: 'weekly-planning',
          isActive: state.currentTab === 'weekly-planning'
        },
        {
          id: 'adm-shift',
          label: 'Ringkasan Shift',
          targetTab: 'shift-summary',
          isActive: state.currentTab === 'shift-summary'
        }
      ];

  return (
    <header className="h-11 bg-surface-header border-b border-border-subtle z-20 shrink-0 sticky top-0 text-ink-primary no-print">
      <div className="h-full px-2.5 sm:px-3.5 flex items-center justify-between gap-2">
        {/* Left: Mobile Menu + App Launcher (⋮⋮⋮) & Workspace Name + 4 Dynamic Core Tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buka Menu Navigasi"
            className="md:hidden h-7 w-7 flex items-center justify-center rounded-md bg-surface hover:bg-elevated border border-border-subtle text-ink-primary transition active:scale-95 shrink-0"
          >
            <Menu className="w-3.5 h-3.5 text-accent-primary" />
          </button>

          {/* App Launcher (⋮⋮⋮) & Factory / Workspace Name */}
          <button
            type="button"
            onClick={onOpenCommandMenu}
            title="Buka Peluncur Cepat & Pencarian Global (Ctrl+K)"
            aria-label="App Launcher dan Workspace"
            className="h-7 px-1.5 sm:px-2 rounded-md bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/60 flex items-center gap-1.5 transition active:scale-95 shrink-0 max-w-[165px] sm:max-w-[200px]"
          >
            {/* 3x3 Dot Grid (⋮⋮⋮) */}
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
              className="w-3.5 h-3.5 text-accent-primary shrink-0"
            >
              <circle cx="3.5" cy="3.5" r="1.35" />
              <circle cx="8" cy="3.5" r="1.35" />
              <circle cx="12.5" cy="3.5" r="1.35" />
              <circle cx="3.5" cy="8" r="1.35" />
              <circle cx="8" cy="8" r="1.35" />
              <circle cx="12.5" cy="8" r="1.35" />
              <circle cx="3.5" cy="12.5" r="1.35" />
              <circle cx="8" cy="12.5" r="1.35" />
              <circle cx="12.5" cy="12.5" r="1.35" />
            </svg>
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isCloudConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="text-[11px] font-bold text-ink-primary truncate">
              {workspaceLabel}
            </span>
          </button>

          {/* 4 Dynamic Core Tabs (1-Click by Role) */}
          <nav
            aria-label="Navigasi Inti"
            className="hidden lg:flex items-center gap-1 pl-1 border-l border-border-subtle"
          >
            {coreTabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSwitchTab(tab.targetTab)}
                title={tab.title || tab.label}
                className={`h-7 px-2.5 rounded-md text-[11px] font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0 active:scale-95 ${
                  tab.isActive
                    ? 'bg-accent-primary text-accent-primary-foreground shadow-xs'
                    : tab.locked
                    ? 'text-ink-muted hover:text-ink-secondary hover:bg-elevated/60'
                    : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
                }`}
              >
                <span>{tab.label}</span>
                {tab.locked && <Lock className="w-2.5 h-2.5 shrink-0 opacity-75" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Right: Quick Search Pill + Shift Badge + PDF + Theme + Cloud/IoT + Profile/Role */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Search Pill */}
          {onOpenCommandMenu && (
            <button
              type="button"
              onClick={onOpenCommandMenu}
              title="Pencarian Cepat & Lompat Objek (Ctrl+K)"
              aria-label="Cari Menu, Tangki, atau Lini"
              className="h-7 px-2 sm:px-2.5 rounded-full bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/60 text-[11px] text-ink-secondary hover:text-ink-primary flex items-center gap-1.5 transition active:scale-95 shrink-0"
            >
              <Search className="w-3 h-3 text-accent-primary shrink-0" />
              <span className="hidden xl:inline truncate">Cari Menu / Tangki / Lini</span>
              <span className="hidden sm:inline xl:hidden">Cari</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.25 rounded bg-elevated border border-border-subtle font-mono text-[10px] text-ink-primary">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Active Shift Badge */}
          <div
            title={`Shift Aktif: ${shiftInfo.name} (${shiftInfo.timeRange})`}
            className="hidden sm:flex h-7 px-2 rounded-md bg-tint-emerald border border-tint-emerald-border items-center gap-1 font-mono tabular-nums text-[11px] font-bold text-ink-emerald shrink-0"
          >
            <span>Shift {shiftInfo.shift}</span>
          </div>

          {/* PDF Shift Report Button */}
          {onOpenPdfModal && (
            <button
              type="button"
              onClick={onOpenPdfModal}
              title="Laporan Shift PDF (A4 Landscape)"
              aria-label="Buka Laporan PDF Shift"
              className="h-7 px-2 rounded-md bg-surface hover:bg-elevated border border-border-subtle hover:border-tint-rose-border text-ink-primary flex items-center gap-1 text-[11px] font-semibold transition active:scale-95 shrink-0"
            >
              <FileText className="w-3.5 h-3.5 text-ink-rose shrink-0" />
              <span className="hidden 2xl:inline">PDF</span>
            </button>
          )}

          {/* Midnight / Daylight Theme Toggle */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={
                isDaylight
                  ? 'Beralih ke Tema Midnight (Control Room)'
                  : 'Beralih ke Tema Daylight (Lantai Pabrik)'
              }
              aria-label="Toggle Tema Midnight atau Daylight"
              className="h-7 w-7 sm:w-auto sm:px-2 rounded-md bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/50 text-[11px] font-semibold text-ink-primary flex items-center justify-center gap-1 transition active:scale-95 shrink-0"
            >
              {isDaylight ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-ink-indigo shrink-0" />
                  <span className="hidden 2xl:inline">Midnight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                  <span className="hidden 2xl:inline">Daylight</span>
                </>
              )}
            </button>
          )}

          {/* Offline-First Queue & Cloud Sync Status Badge */}
          <div className="flex items-center gap-1 shrink-0">
            {!isNetworkOnline ? (
              <span
                title="Koneksi jaringan terputus. Semua transaksi dicatat aman secara lokal (FIFO Queue) dan akan otomatis dikirim saat online."
                className="h-7 px-2 rounded-md bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-mono font-bold flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums"
              >
                <WifiOff className="w-3 h-3 shrink-0" />
                <span>
                  {offlinePendingCount > 0
                    ? `OFFLINE - ${offlinePendingCount} ANTREAN TERSIMPAN`
                    : 'OFFLINE - MODE LOKAL'}
                </span>
              </span>
            ) : offlinePendingCount > 0 ? (
              <div className="flex items-center gap-1 shrink-0">
                <span
                  title={`${offlinePendingCount} transaksi antrean offline menunggu sinkronisasi Cloud`}
                  className="h-7 px-2 rounded-md bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-mono font-bold flex items-center gap-1 whitespace-nowrap shrink-0 tabular-nums"
                >
                  <CloudOff className="w-3 h-3 shrink-0" />
                  <span>{offlinePendingCount} ANTREAN PENDING</span>
                </span>
                {onSyncOfflineQueueNow && (
                  <button
                    type="button"
                    onClick={onSyncOfflineQueueNow}
                    disabled={isOfflineFlushing || isSyncingCloud}
                    title="Sinkronkan Antrean Offline ke Cloud Firestore Sekarang"
                    className="h-7 px-2 rounded-md bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-[10px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 transition active:scale-95"
                  >
                    <RefreshCw
                      className={`w-3 h-3 shrink-0 ${
                        isOfflineFlushing || isSyncingCloud ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Sync Now</span>
                  </button>
                )}
              </div>
            ) : (
              isCloudConnected &&
              !isCloudQuotaExceeded && (
                <span
                  title="Koneksi online dan seluruh transaksi tersinkronisasi ke Cloud Firestore"
                  className="hidden xl:flex h-7 px-2 rounded-md bg-tint-emerald border border-tint-emerald-border text-ink-emerald text-[10px] font-mono font-bold items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>ONLINE SYNCED</span>
                </span>
              )
            )}
          </div>

          {/* Compact Firestore & IoT Status Indicator */}
          <button
            type="button"
            onClick={onOpenTankModal}
            title={`Firestore: ${
              !isNetworkOnline
                ? 'Offline (Antrean Lokal Aktif)'
                : isCloudQuotaExceeded
                ? 'Kuota Harian Penuh (Mode Lokal Aman)'
                : isSyncingCloud || isOfflineFlushing
                ? 'Menyinkronkan'
                : isCloudConnected
                ? 'Terhubung'
                : 'Lokal'
            } · Tangki Utama: ${state.tank.temp.toFixed(1)}°C (${state.tank.level.toFixed(0)} kg)`}
            aria-label="Status Firestore dan Sensor Tangki"
            className={`h-7 px-2 rounded-md border text-[11px] font-mono tabular-nums flex items-center gap-1 transition active:scale-95 shrink-0 ${
              isCloudQuotaExceeded || !isTempNormal || !isNetworkOnline
                ? 'bg-tint-amber border-tint-amber-border text-ink-amber'
                : isSyncingCloud || isOfflineFlushing
                ? 'bg-tint-cyan border-tint-cyan-border text-ink-cyan'
                : 'bg-surface hover:bg-elevated border-border-subtle text-ink-primary'
            }`}
          >
            {isCloudQuotaExceeded || !isNetworkOnline ? (
              <CloudOff className="w-3.5 h-3.5 text-ink-amber shrink-0" />
            ) : isSyncingCloud || isOfflineFlushing ? (
              <Loader2 className="w-3.5 h-3.5 text-ink-cyan animate-spin shrink-0" />
            ) : isCloudConnected ? (
              <Cloud className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-ink-amber shrink-0" />
            )}
            <span className="hidden md:inline font-semibold">
              {state.tank.temp.toFixed(1)}°C
            </span>
          </button>

          {/* Profile / Role Menu + Quick Logout */}
          <div className="h-7 flex items-center gap-0.5 bg-surface px-1 rounded-md border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={onOpenRoleSwitcher}
              title={`Role aktif: ${effectiveRole.role}${isManagement ? ' (Pantau Saja)' : ''} — Klik untuk ganti role`}
              className={`h-5.5 flex items-center gap-1 px-1.5 rounded text-[11px] font-semibold transition whitespace-nowrap ${
                isAdmin
                  ? 'text-ink-amber hover:bg-tint-amber'
                  : isOperator
                  ? 'text-ink-cyan hover:bg-tint-cyan'
                  : 'text-ink-indigo hover:bg-tint-indigo'
              }`}
            >
              {isAdmin ? (
                <Shield className="w-3 h-3 shrink-0" />
              ) : isOperator ? (
                <UserCheck className="w-3 h-3 shrink-0" />
              ) : (
                <Eye className="w-3 h-3 shrink-0" />
              )}
              <span>{roleBadgeLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onSignOut) onSignOut();
                else onOpenRoleSwitcher();
              }}
              title="Logout Total"
              aria-label="Logout Total"
              className="h-5.5 w-5.5 flex items-center justify-center rounded text-ink-secondary hover:text-ink-rose hover:bg-tint-rose transition shrink-0"
            >
              <LogOut className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
