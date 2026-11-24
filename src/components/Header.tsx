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
  const role = state.currentUserRole;

  const isManagement = role === 'MANAGEMENT';
  const isAdmin = role === 'ADMINISTRATOR';
  const isOperator = role === 'OPERATOR';

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
    <header className="bg-[#080c14] border-b border-slate-800 z-20 shrink-0 sticky top-0 text-slate-100">
      <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between gap-4">
        {/* Left Zone: Navigation Drawer Trigger & Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenSidebar}
            aria-label="Buka Menu Navigasi Samping"
            title="Buka Menu Navigasi (Popup Drawer)"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c121d] text-slate-200 hover:text-white hover:border-cyan-500/50 transition border border-slate-800 active:scale-95 whitespace-nowrap shrink-0"
          >
            <Menu className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold hidden sm:inline">Menu</span>
          </button>

          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="text-slate-500 font-mono hidden sm:inline whitespace-nowrap">Konsol Kendali</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline shrink-0" />
            <h1 className="font-bold text-white text-xs sm:text-sm tracking-tight truncate">
              {currentViewTitle}
            </h1>
            {isManagement && (
              <span className="hidden md:inline text-[11px] font-mono text-indigo-300 whitespace-nowrap shrink-0">
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
            className={`flex items-center gap-1.5 px-2.5 py-1.5 bg-[#0c121d] border rounded-lg text-xs font-mono tabular-nums transition active:scale-95 whitespace-nowrap shrink-0 ${
              syncStatus === 'Syncing'
                ? 'border-cyan-500/50 text-cyan-300 hover:border-cyan-400'
                : syncStatus === 'Success'
                ? 'border-emerald-500/40 text-slate-200 hover:border-emerald-400'
                : syncStatus === 'Error'
                ? 'border-rose-500/50 text-rose-300 hover:border-rose-400'
                : 'border-slate-800 text-slate-300 hover:border-cyan-500/50'
            }`}
          >
            {syncStatus === 'Syncing' ? (
              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
            ) : syncStatus === 'Success' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : syncStatus === 'Error' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}

            <span
              className={`font-semibold ${
                syncStatus === 'Syncing'
                  ? 'text-cyan-400'
                  : syncStatus === 'Success'
                  ? 'text-emerald-400'
                  : syncStatus === 'Error'
                  ? 'text-rose-400'
                  : 'text-slate-300'
              }`}
            >
              {syncStatus}
            </span>

            {syncStatus === 'Syncing' ? (
              <span className="text-[11px] text-cyan-300 hidden md:inline">· Sheets</span>
            ) : syncStatus === 'Error' ? (
              <span className="text-[11px] text-rose-400 hidden md:inline">
                {formattedLastSyncTime ? `· ${formattedLastSyncTime.short}` : '· Gagal'}
              </span>
            ) : formattedLastSyncTime ? (
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                · {formattedLastSyncTime.short}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 hidden lg:inline">
                · {unsyncedCount > 0 ? `${unsyncedCount} antrean` : 'Belum sync'}
              </span>
            )}

            {syncStatus !== 'Syncing' && unsyncedCount > 0 && (formattedLastSyncTime || syncStatus === 'Error') && (
              <span className="text-[11px] text-amber-400 font-semibold hidden xl:inline">
                · {unsyncedCount} baru
              </span>
            )}
          </button>

          {/* Storage Tank Liquid Sensor Readout */}
          <button
            onClick={onOpenTankModal}
            title="Klik untuk membuka detail Storage Tank Liquid"
            className={`flex items-center gap-2 px-2.5 py-1.5 bg-[#0c121d] border rounded-lg text-xs font-mono tabular-nums transition active:scale-95 whitespace-nowrap shrink-0 ${
              isTempNormal
                ? 'border-slate-800 text-slate-200 hover:border-cyan-500/60'
                : 'border-amber-500/50 text-amber-300 bg-amber-950/20'
            }`}
          >
            <Droplet className={`w-3.5 h-3.5 ${isTempNormal ? 'text-cyan-400' : 'text-amber-400'}`} />
            <span className="font-semibold">{state.tank.temp.toFixed(1)}°C</span>
            <span className="text-[11px] text-slate-400 hidden sm:inline">· {state.tank.level.toFixed(0)} kg</span>
          </button>

          {/* Shift Indicator */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0c121d] border border-slate-800 text-xs font-mono text-slate-200 tabular-nums whitespace-nowrap shrink-0">
            <span className="text-emerald-400 font-semibold">S{currentShift.shift}</span>
            <span className="text-slate-600">·</span>
            <span className="text-[11px] text-slate-400">{currentShift.timeRange}</span>
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0c121d] border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-200 hover:text-white transition active:scale-95 whitespace-nowrap shrink-0"
            >
              {theme === 'daylight' || theme === 'light' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden md:inline text-[11px] font-semibold">Midnight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden md:inline text-[11px] font-semibold">Daylight</span>
                </>
              )}
            </button>
          )}

          {/* User Profile & Sign Out */}
          <div className="flex items-center gap-1 bg-[#0c121d] p-0.5 rounded-lg border border-slate-800 shrink-0">
            <button
              onClick={onOpenRoleSwitcher}
              title="Ganti Jenis Pengguna"
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition whitespace-nowrap ${
                isAdmin
                  ? 'text-amber-300 hover:bg-amber-500/10'
                  : isOperator
                  ? 'text-cyan-300 hover:bg-cyan-500/10'
                  : 'text-indigo-300 hover:bg-indigo-500/10'
              }`}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] shrink-0 ${
                isAdmin
                  ? 'bg-amber-500 text-slate-950'
                  : isOperator
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-indigo-500 text-white'
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
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
