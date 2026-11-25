import React, { useEffect, useMemo, useState } from 'react';
import {
  Menu,
  Droplet,
  Shield,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UserCheck,
  Eye,
  LogOut,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';
import { AppState } from '../types';
import { getCurrentShift } from '../utils/shifts';
import { resolveEffectiveRole } from '../utils/roleAccess';
import {
  GoogleSheetsSyncSettings,
  loadSheetsSyncSettings,
  SHEETS_SYNC_EVENT
} from '../utils/sheetsSyncStore';

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
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  onSignOut?: () => void;
  currentViewTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  theme,
  onToggleTheme,
  onOpenSidebar,
  onOpenTankModal,
  onOpenRoleSwitcher,
  onSwitchTab,
  onSignOut,
  currentViewTitle
}) => {
  const isTempNormal = state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;
  const currentShift = getCurrentShift();
  const effectiveRole = resolveEffectiveRole(state);

  const isManagement = effectiveRole.isManagement;
  const isAdmin = effectiveRole.isAdmin;
  const isOperator = effectiveRole.isOperator;

  const [syncSettings, setSyncSettings] = useState<GoogleSheetsSyncSettings>(() =>
    loadSheetsSyncSettings()
  );

  useEffect(() => {
    const handleSyncUpdate = (ev: Event) => {
      const custom = ev as CustomEvent<GoogleSheetsSyncSettings>;
      if (custom.detail) {
        setSyncSettings(custom.detail);
      } else {
        setSyncSettings(loadSheetsSyncSettings());
      }
    };
    const handleStorage = (ev: StorageEvent) => {
      if (!ev.key || ev.key === 'prodtrack_gsheets_sync_v1') {
        setSyncSettings(loadSheetsSyncSettings());
      }
    };
    window.addEventListener(SHEETS_SYNC_EVENT, handleSyncUpdate);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(SHEETS_SYNC_EVENT, handleSyncUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const unsyncedCount = useMemo(() => {
    const syncedSet = new Set(syncSettings.syncedProductionIds || []);
    return (state.transactions.cartonProductions || []).filter(cp => !syncedSet.has(cp.id)).length;
  }, [state.transactions.cartonProductions, syncSettings.syncedProductionIds]);

  const formattedLastSyncTime = useMemo(() => {
    if (!syncSettings.lastSyncedAt) return null;
    const d = new Date(syncSettings.lastSyncedAt);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const hhmm = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const full = d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    return {
      short: isToday ? hhmm : full,
      full: d.toLocaleString('id-ID')
    };
  }, [syncSettings.lastSyncedAt]);

  const syncStatus = syncSettings.syncStatus || (syncSettings.lastSyncedAt ? 'Success' : 'Idle');

  const syncTooltip = [
    `Status Google Sheets: ${syncStatus}`,
    formattedLastSyncTime
      ? `Terakhir berhasil dikirim: ${formattedLastSyncTime.full}`
      : 'Belum pernah dikirim ke Google Sheets',
    unsyncedCount > 0
      ? `Antrean belum dikirim: ${unsyncedCount} log produksi`
      : 'Semua log produksi tersinkron',
    syncStatus === 'Error' && syncSettings.lastSyncError
      ? `Kendala: ${syncSettings.lastSyncError}`
      : null,
    'Klik untuk membuka panel Sinkronisasi Google Sheets'
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <header className="bg-surface-header border-b border-border-subtle z-20 shrink-0 sticky top-0 text-ink-primary">
      <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Left Zone: Navigation Drawer Trigger & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenSidebar}
            aria-label="Buka Menu Navigasi Samping"
            title="Buka Menu Navigasi (Popup Drawer)"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-elevated text-ink-primary hover:border-accent-primary/60 transition border border-border-subtle active:scale-95 whitespace-nowrap shrink-0"
          >
            <Menu className="w-4 h-4 text-accent-primary" />
            <span className="text-xs font-semibold hidden sm:inline">Menu</span>
          </button>

          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="text-ink-secondary font-mono hidden sm:inline whitespace-nowrap">Konsol Kendali</span>
            <ChevronRight className="w-3.5 h-3.5 text-ink-secondary hidden sm:inline shrink-0" />
            <h1 className="font-bold text-ink-primary text-xs sm:text-sm tracking-tight truncate">
              {currentViewTitle}
            </h1>
            {isManagement && (
              <span className="hidden md:inline text-[11px] font-mono text-ink-indigo whitespace-nowrap shrink-0">
                · Mode Pantau
              </span>
            )}
          </div>
        </div>

        {/* Right Zone: Google Sheets Sync Status, Tank Sensor, Shift, Theme & User Session */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Real-Time Google Sheets Sync Status Indicator */}
          <button
            type="button"
            onClick={() => onSwitchTab?.('sheets-sync')}
            title={syncTooltip}
            aria-label={`Status Sinkronisasi Google Sheets: ${syncStatus}`}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-elevated border rounded-lg text-xs font-mono tabular-nums transition active:scale-95 whitespace-nowrap shrink-0 ${
              syncStatus === 'Syncing'
                ? 'border-tint-cyan-border text-ink-cyan hover:border-accent-primary'
                : syncStatus === 'Success'
                ? 'border-tint-emerald-border text-ink-primary hover:border-ink-emerald'
                : syncStatus === 'Error'
                ? 'border-tint-rose-border text-ink-rose hover:border-ink-rose'
                : 'border-border-subtle text-ink-primary hover:border-accent-primary/60'
            }`}
          >
            {syncStatus === 'Syncing' ? (
              <Loader2 className="w-3.5 h-3.5 text-ink-cyan animate-spin shrink-0" />
            ) : syncStatus === 'Success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
            ) : syncStatus === 'Error' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-ink-rose shrink-0" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-ink-secondary shrink-0" />
            )}

            <span
              className={`font-semibold ${
                syncStatus === 'Syncing'
                  ? 'text-ink-cyan'
                  : syncStatus === 'Success'
                  ? 'text-ink-emerald'
                  : syncStatus === 'Error'
                  ? 'text-ink-rose'
                  : 'text-ink-primary'
              }`}
            >
              {syncStatus}
            </span>

            {syncStatus === 'Syncing' ? (
              <span className="text-[11px] text-ink-cyan hidden md:inline">· Sheets</span>
            ) : syncStatus === 'Error' ? (
              <span className="text-[11px] text-ink-rose hidden md:inline">
                {formattedLastSyncTime ? `· ${formattedLastSyncTime.short}` : '· Gagal'}
              </span>
            ) : formattedLastSyncTime ? (
              <span className="text-[11px] text-ink-secondary hidden sm:inline">
                · {formattedLastSyncTime.short}
              </span>
            ) : (
              <span className="text-[11px] text-ink-secondary hidden lg:inline">
                · {unsyncedCount > 0 ? `${unsyncedCount} antrean` : 'Belum sync'}
              </span>
            )}

            {syncStatus !== 'Syncing' && unsyncedCount > 0 && (formattedLastSyncTime || syncStatus === 'Error') && (
              <span className="text-[11px] text-ink-amber font-semibold hidden xl:inline">
                · {unsyncedCount} baru
              </span>
            )}
          </button>

          {/* Storage Tank Liquid Sensor Readout */}
          <button
            onClick={onOpenTankModal}
            title="Klik untuk membuka detail Storage Tank Liquid"
            className={`flex items-center gap-2 px-2.5 py-1.5 border rounded-lg text-xs font-mono tabular-nums transition active:scale-95 whitespace-nowrap shrink-0 ${
              isTempNormal
                ? 'bg-surface hover:bg-elevated border-border-subtle text-ink-primary hover:border-accent-primary/60'
                : 'bg-tint-amber border-tint-amber-border text-ink-amber'
            }`}
          >
            <Droplet className={`w-3.5 h-3.5 ${isTempNormal ? 'text-accent-primary' : 'text-ink-amber'}`} />
            <span className="font-semibold">{state.tank.temp.toFixed(1)}°C</span>
            <span className="text-[11px] text-ink-secondary hidden sm:inline">· {state.tank.level.toFixed(0)} kg</span>
          </button>

          {/* Shift Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border-subtle text-xs font-mono text-ink-primary tabular-nums whitespace-nowrap shrink-0">
            <span className="text-ink-emerald font-semibold">S{currentShift.shift}</span>
            <span className="text-ink-secondary">·</span>
            <span className="text-[11px] text-ink-secondary">{currentShift.timeRange}</span>
          </div>

          {/* Theme Toggle Button (Midnight vs Daylight) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              type="button"
              title={
                theme === 'daylight' || theme === 'light'
                  ? 'Beralih ke Tema Midnight (Gelap Control Room)'
                  : 'Beralih ke Tema Daylight (Cerah Terang Pabrik)'
              }
              aria-label="Toggle Theme"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/50 text-xs font-medium text-ink-primary transition active:scale-95 whitespace-nowrap shrink-0"
            >
              {theme === 'daylight' || theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-ink-indigo" />
                  <span className="hidden md:inline text-[11px] font-semibold">Midnight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-ink-amber" />
                  <span className="hidden md:inline text-[11px] font-semibold">Daylight</span>
                </>
              )}
            </button>
          )}

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-1 bg-surface p-0.5 rounded-lg border border-border-subtle shrink-0">
            <button
              onClick={onOpenRoleSwitcher}
              title="Ganti Jenis Pengguna"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${
                isAdmin
                  ? 'text-ink-amber hover:bg-tint-amber'
                  : isOperator
                  ? 'text-ink-cyan hover:bg-tint-cyan'
                  : 'text-ink-indigo hover:bg-tint-indigo'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${
                isAdmin
                  ? 'bg-amber-500 text-slate-950'
                  : isOperator
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-indigo-600 text-white'
              }`}>
                {isAdmin ? <Shield className="w-3 h-3" /> : isOperator ? <UserCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </div>
              <span className="font-semibold truncate max-w-[100px] sm:max-w-[130px] hidden sm:inline">
                {state.currentSession?.name || (isAdmin ? 'Administrator' : isOperator ? 'Operator' : 'Management')}
              </span>
            </button>

            <button
              onClick={() => {
                if (onSignOut) onSignOut();
                else onOpenRoleSwitcher();
              }}
              title="Logout Total (Keluar ke Halaman Login & Sign Up)"
              className="p-1.5 rounded-md text-ink-secondary hover:text-ink-rose hover:bg-tint-rose transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
