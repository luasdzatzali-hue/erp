import React from 'react';
import {
  Menu,
  Shield,
  UserCheck,
  Eye,
  LogOut,
  ChevronRight,
  Sun,
  Moon,
  Search,
  Cloud,
  CloudOff,
  Loader2
} from 'lucide-react';
import { AppState } from '../types';
import { resolveEffectiveRole } from '../utils/roleAccess';

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
  onOpenCommandMenu?: () => void;
  isSyncingCloud?: boolean;
  isCloudConnected?: boolean;
  currentViewTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  theme,
  onToggleTheme,
  onOpenSidebar,
  onOpenTankModal,
  onOpenRoleSwitcher,
  onSignOut,
  onOpenCommandMenu,
  isSyncingCloud = false,
  isCloudConnected = false,
  currentViewTitle
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isManagement = effectiveRole.isManagement;
  const isAdmin = effectiveRole.isAdmin;
  const isOperator = effectiveRole.isOperator;
  const isDaylight = theme === 'daylight' || theme === 'light';

  const isTempNormal =
    state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;

  const shortModuleName = currentViewTitle.includes('·')
    ? currentViewTitle.split('·')[1].trim()
    : currentViewTitle;

  const workspaceLabel = state.factoryName?.trim() || 'ProdTrack MES';

  const roleBadgeLabel = effectiveRole.isOfflinePinAdmin
    ? 'PIN Lokal'
    : isAdmin
    ? 'Admin'
    : isOperator
    ? 'Operator'
    : 'Mgmt';

  return (
    <header className="h-12 bg-surface-header border-b border-border-subtle z-20 shrink-0 sticky top-0 text-ink-primary no-print">
      <div className="h-full px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left Zone: Mobile Drawer Trigger, Workspace Status & Active Breadcrumb */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Buka Menu Navigasi"
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg bg-surface hover:bg-elevated border border-border-subtle text-ink-primary transition active:scale-95 shrink-0"
          >
            <Menu className="w-4 h-4 text-accent-primary" />
          </button>

          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isCloudConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              title={isCloudConnected ? 'Workspace Cloud Aktif' : 'Workspace Lokal'}
            />
            <span className="text-xs font-bold text-ink-primary truncate max-w-[115px] sm:max-w-[160px]">
              {workspaceLabel}
            </span>
          </div>

          <ChevronRight className="w-3.5 h-3.5 text-ink-muted shrink-0 hidden sm:inline" />

          <h1 className="hidden sm:block font-semibold text-ink-secondary text-xs truncate max-w-[200px] lg:max-w-[320px]">
            {shortModuleName}
          </h1>
        </div>

        {/* Right Zone: Command Palette, Theme Toggle, Firestore/IoT Indicator, Role Badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Command Palette Trigger (Ctrl+K) */}
          {onOpenCommandMenu && (
            <button
              type="button"
              onClick={onOpenCommandMenu}
              title="Pencarian Cepat & Aksi (Ctrl+K)"
              aria-label="Buka Command Palette"
              className="h-8 px-2 sm:px-2.5 rounded-lg bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/60 text-xs text-ink-secondary hover:text-ink-primary flex items-center gap-2 transition active:scale-95 shrink-0"
            >
              <Search className="w-3.5 h-3.5 text-accent-primary shrink-0" />
              <span className="hidden md:inline text-[11px]">Cari SKU, Tangki...</span>
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-elevated border border-border-subtle font-mono text-[10px] text-ink-primary">
                Ctrl+K
              </kbd>
            </button>
          )}

          {/* Theme Toggle (Midnight / Daylight) */}
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
              className="h-8 px-2 sm:px-2.5 rounded-lg bg-surface hover:bg-elevated border border-border-subtle hover:border-accent-primary/50 text-xs font-medium text-ink-primary flex items-center gap-1.5 transition active:scale-95 shrink-0"
            >
              {isDaylight ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-ink-indigo shrink-0" />
                  <span className="hidden lg:inline text-[11px] font-semibold">Midnight</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                  <span className="hidden lg:inline text-[11px] font-semibold">Daylight</span>
                </>
              )}
            </button>
          )}

          {/* Firestore & IoT Connection Status Indicator */}
          <button
            type="button"
            onClick={onOpenTankModal}
            title={`Firestore: ${
              isSyncingCloud ? 'Menyinkronkan' : isCloudConnected ? 'Terhubung' : 'Lokal'
            } · IoT Storage Tank: ${state.tank.temp.toFixed(1)}°C (${state.tank.level.toFixed(0)} kg)`}
            aria-label="Status Koneksi Firestore dan Sensor IoT"
            className={`h-8 px-2 sm:px-2.5 rounded-lg border text-[11px] font-mono tabular-nums flex items-center gap-1.5 transition active:scale-95 shrink-0 ${
              !isTempNormal
                ? 'bg-tint-amber border-tint-amber-border text-ink-amber'
                : isSyncingCloud
                ? 'bg-tint-cyan border-tint-cyan-border text-ink-cyan'
                : 'bg-surface hover:bg-elevated border-border-subtle text-ink-primary'
            }`}
          >
            {isSyncingCloud ? (
              <Loader2 className="w-3.5 h-3.5 text-ink-cyan animate-spin shrink-0" />
            ) : isCloudConnected ? (
              <Cloud className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
            ) : (
              <CloudOff className="w-3.5 h-3.5 text-ink-amber shrink-0" />
            )}
            <span className="hidden sm:inline font-semibold">
              {isSyncingCloud ? 'Sync' : isCloudConnected ? 'Cloud' : 'Lokal'}
            </span>
            <span className="text-ink-muted hidden md:inline">·</span>
            <span className="hidden md:inline font-semibold">
              {state.tank.temp.toFixed(1)}°C
            </span>
          </button>

          {/* User Role Badge & Quick Logout */}
          <div className="h-8 flex items-center gap-0.5 bg-surface px-1 rounded-lg border border-border-subtle shrink-0">
            <button
              type="button"
              onClick={onOpenRoleSwitcher}
              title={`Role aktif: ${effectiveRole.role}${isManagement ? ' (Pantau Saja)' : ''} — Klik untuk ganti role`}
              className={`h-6 flex items-center gap-1.5 px-1.5 rounded text-[11px] font-semibold transition whitespace-nowrap ${
                isAdmin
                  ? 'text-ink-amber hover:bg-tint-amber'
                  : isOperator
                  ? 'text-ink-cyan hover:bg-tint-cyan'
                  : 'text-ink-indigo hover:bg-tint-indigo'
              }`}
            >
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5 shrink-0" />
              ) : isOperator ? (
                <UserCheck className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Eye className="w-3.5 h-3.5 shrink-0" />
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
              className="h-6 w-6 flex items-center justify-center rounded text-ink-secondary hover:text-ink-rose hover:bg-tint-rose transition shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
