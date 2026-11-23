import React from 'react';
import {
  Menu,
  Droplet,
  Shield,
  FileText,
  UserCheck,
  Eye,
  LogOut,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';
import { AppState } from '../types';
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
  onSignOut,
  currentViewTitle
}) => {
  const isTempNormal = state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;
  const currentShift = getCurrentShift();
  const role = state.currentUserRole;

  const isManagement = role === 'MANAGEMENT';
  const isAdmin = role === 'ADMINISTRATOR';
  const isOperator = role === 'OPERATOR';

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

        {/* Right Zone: Live Tank Sensor Readout, Shift, Theme & User Session */}
        <div className="flex items-center gap-2 shrink-0">
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
