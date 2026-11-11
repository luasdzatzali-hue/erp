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
    <header className="bg-slate-900 border-b border-slate-800 z-20 shrink-0 sticky top-0 shadow-md text-slate-100">
      <div className="px-3 sm:px-5 py-2.5 flex items-center justify-between">
        {/* Left Section: Sidebar Popup Toggle & Breadcrumb Title */}
        <div className="flex items-center space-x-3">
          {/* Sidebar Menu Popup Toggle (accessible on computer, tablet, and mobile) */}
          <button
            onClick={onOpenSidebar}
            aria-label="Buka Menu Navigasi Samping"
            title="Buka Menu Navigasi (Popup Drawer)"
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-750 hover:text-white transition border border-slate-700/80 active:scale-95 shadow-sm group"
          >
            <Menu className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-slate-200 hidden sm:inline tracking-wide">Menu</span>
          </button>

          {/* Breadcrumb Module Title */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-mono hidden sm:inline">Modul</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 hidden sm:inline" />
            <span className="font-bold text-white text-xs sm:text-sm tracking-tight">
              {currentViewTitle}
            </span>
            {isManagement && (
              <span className="ml-1 px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                Mode Management (Hanya Melihat)
              </span>
            )}
          </div>
        </div>

        {/* Right Section: Status Bar Telemetry & User Card (NO MODULE SWITCHER BUTTONS) */}
        <div className="flex items-center space-x-2 sm:space-x-2.5">
          {/* Storage Tank Liquid Sensor Readout */}
          <button
            onClick={onOpenTankModal}
            title="Klik untuk membuka detail Storage Tank Liquid"
            className={`flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-800/90 border rounded-xl text-xs font-mono transition active:scale-95 ${
              isTempNormal
                ? 'border-cyan-500/30 text-slate-200 hover:border-cyan-500/60'
                : 'border-amber-500/40 text-amber-300 hover:border-amber-500/70 bg-amber-950/20'
            }`}
          >
            <Droplet className={`w-3.5 h-3.5 ${isTempNormal ? 'text-cyan-400' : 'text-amber-400 animate-bounce'}`} />
            <span className="font-semibold">{state.tank.temp.toFixed(1)}°C</span>
            <span className="text-[10px] text-slate-400 hidden sm:inline">({state.tank.level.toFixed(0)} kg)</span>
          </button>

          {/* Shift Indicator Pill */}
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Shift {currentShift.shift}</span>
          </div>

          {/* Theme Toggle Button (Midnight vs Daylight) */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              type="button"
              title={
                theme === 'daylight' || theme === 'light'
                  ? 'Beralih ke Tema Midnight (Gelap Industrial)'
                  : 'Beralih ke Tema Daylight (Cerah Terang Pabrik)'
              }
              aria-label="Toggle Theme"
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 hover:text-white transition active:scale-95 shadow-sm"
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

          {/* User Profile Pill & Sign Out Button */}
          <div className="flex items-center space-x-1 bg-slate-850 p-1 rounded-xl border border-slate-750">
            <button
              onClick={onOpenRoleSwitcher}
              title="Ganti Jenis Pengguna"
              className={`flex items-center space-x-1.5 px-2 py-1 rounded-lg text-xs font-medium transition ${
                isAdmin
                  ? 'text-amber-300 hover:bg-amber-500/10'
                  : isOperator
                  ? 'text-cyan-300 hover:bg-cyan-500/10'
                  : 'text-indigo-300 hover:bg-indigo-500/10'
              }`}
            >
              <div className={`w-5 h-5 rounded-md flex items-center justify-center font-bold text-[10px] ${
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
              title="Keluar / Ganti Akun Pengguna"
              className="p-1 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/20 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
