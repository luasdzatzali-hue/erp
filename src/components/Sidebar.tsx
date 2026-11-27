import React, { useEffect, useState } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  X,
  LayoutDashboard,
  FileText,
  Truck,
  Database,
  RefreshCw,
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
  Home,
  UserCheck,
  Eye,
  ClipboardList,
  MessageSquare,
  FileSpreadsheet,
  CalendarRange,
  PanelLeftClose,
  PanelLeftOpen,
  Menu
} from 'lucide-react';
import { AppState } from '../types';
import { getCurrentShift } from '../utils/shifts';
import { resolveEffectiveRole } from '../utils/roleAccess';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMobileDrawer?: () => void;
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

const RAIL_EXPANDED_KEY = 'prodtrack_sidebar_expanded_v1';

interface RailNavItem {
  id: string;
  label: string;
  tab?: AppState['currentTab'];
  onClick?: () => void;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  visible: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  onOpenMobileDrawer,
  state,
  onSwitchTab,
  onOpenResetModal,
  onLoadSampleData,
  onExportData,
  onOpenPdfModal,
  onOpenRoleSwitcher,
  onOpenUserManagement,
  onSignOut
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(RAIL_EXPANDED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const effectiveRole = resolveEffectiveRole(state);
  const role = effectiveRole.role;
  const isAdmin = effectiveRole.isAdmin;
  const isOperator = effectiveRole.isOperator;
  const isManagement = effectiveRole.isManagement;
  const currentShift = getCurrentShift();

  const pendingReqCount = state.transactions.requests.filter(r => r.status !== 'Received').length;
  const activeBatchCount = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  ).length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const toggleExpanded = () => {
    setIsExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_EXPANDED_KEY, String(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  const handleNavClick = (tab: AppState['currentTab']) => {
    onSwitchTab(tab);
    onClose();
  };

  const navGroups: { title: string; items: RailNavItem[] }[] = [
    {
      title: 'Utama',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          tab: 'dashboard',
          icon: LayoutDashboard,
          visible: true
        },
        {
          id: 'weekly-planning',
          label: 'Weekly Planning',
          tab: 'weekly-planning',
          icon: CalendarRange,
          visible: true
        },
        {
          id: 'bom-calculator',
          label: 'BOM & Calculator',
          tab: 'bom-calculator',
          icon: Calculator,
          visible: !isManagement
        }
      ]
    },
    {
      title: 'Manufacturing Ops',
      items: [
        {
          id: 'permintaan',
          label: 'Permintaan Material',
          tab: 'permintaan',
          icon: FileText,
          badge: pendingReqCount > 0 ? pendingReqCount : undefined,
          visible: !isManagement
        },
        {
          id: 'penerimaan',
          label: 'Penerimaan Fisik',
          tab: 'penerimaan',
          icon: Truck,
          visible: !isManagement
        },
        {
          id: 'pemakaian',
          label: 'Work Order WIP',
          tab: 'pemakaian',
          icon: Layers,
          badge: activeBatchCount > 0 ? activeBatchCount : undefined,
          visible: !isManagement
        },
        {
          id: 'tank-monitoring',
          label: 'Tangki WIP SCADA',
          tab: 'tank-monitoring',
          icon: Cylinder,
          visible: true
        }
      ]
    },
    {
      title: 'Stock Opname & Reports',
      items: [
        {
          id: 'shift-summary',
          label: 'Ringkasan Shift',
          tab: 'shift-summary',
          icon: ClipboardList,
          visible: true
        },
        {
          id: 'pdf-report',
          label: 'Report PDF Shift',
          onClick: () => {
            onOpenPdfModal?.();
            onClose();
          },
          icon: Printer,
          visible: true
        },
        {
          id: 'sheets-sync',
          label: 'Google Sheets Sync',
          tab: 'sheets-sync',
          icon: FileSpreadsheet,
          visible: true
        }
      ]
    },
    {
      title: 'Master Data',
      items: [
        {
          id: 'admin-portal',
          label: 'Portal Admin',
          tab: 'admin-portal',
          icon: Home,
          visible: isAdmin
        },
        {
          id: 'master',
          label: 'Master BOM & Mesin',
          tab: 'master',
          icon: Database,
          visible: isAdmin
        },
        {
          id: 'users',
          label: 'Kelola Pengguna',
          onClick: () => {
            onOpenUserManagement?.();
            onClose();
          },
          icon: Users,
          visible: isAdmin && Boolean(onOpenUserManagement)
        },
        {
          id: 'contact',
          label: 'Kontak & Dukungan',
          tab: 'contact',
          icon: MessageSquare,
          visible: true
        }
      ]
    }
  ];

  const renderDesktopRailButton = (item: RailNavItem) => {
    const Icon = item.icon;
    const isActive = Boolean(item.tab && state.currentTab === item.tab);

    const btn = (
      <button
        type="button"
        onClick={() => {
          if (item.tab) handleNavClick(item.tab);
          else item.onClick?.();
        }}
        aria-label={item.label}
        className={`relative w-full h-9 rounded-lg flex items-center transition active:scale-95 ${
          isExpanded ? 'px-2.5 gap-2.5 justify-start' : 'justify-center px-0'
        } ${
          isActive
            ? 'bg-accent-primary text-accent-primary-foreground font-semibold shadow-xs'
            : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {isExpanded && (
          <span className="text-xs truncate flex-1 text-left">{item.label}</span>
        )}
        {item.badge !== undefined && (
          <span
            className={`${
              isExpanded
                ? 'px-1.5 py-0.5 text-[10px]'
                : 'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 text-[9px]'
            } rounded-full font-mono font-bold tabular-nums flex items-center justify-center ${
              isActive
                ? 'bg-surface text-ink-primary'
                : 'bg-amber-500 text-slate-950'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );

    if (isExpanded) {
      return <React.Fragment key={item.id}>{btn}</React.Fragment>;
    }

    return (
      <Tooltip.Root key={item.id} delayDuration={120}>
        <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="z-50 px-2.5 py-1.5 rounded-lg bg-elevated text-ink-primary border border-border-strong text-xs font-medium shadow-lg select-none"
          >
            {item.label}
            {item.badge !== undefined ? ` (${item.badge})` : ''}
            <Tooltip.Arrow className="fill-[var(--bg-elevated)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  };

  return (
    <Tooltip.Provider>
      {/* 1. DESKTOP COLLAPSIBLE LEFT NAVIGATION RAIL (56px collapsed / 220px expanded) */}
      <aside
        aria-label="Navigasi Utama Desktop"
        className={`hidden md:flex flex-col shrink-0 h-screen bg-surface-header border-r border-border-subtle text-ink-primary transition-all duration-200 select-none no-print ${
          isExpanded ? 'w-56' : 'w-14'
        }`}
      >
        {/* Rail Brand Top (44px aligned with slim Header) */}
        <div
          className={`h-11 border-b border-border-subtle flex items-center shrink-0 ${
            isExpanded ? 'px-3 justify-between' : 'justify-center px-1'
          }`}
        >
          <button
            type="button"
            onClick={() => handleNavClick(isAdmin ? 'admin-portal' : 'dashboard')}
            title="ProdTrack MES"
            className="flex items-center gap-2 min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-tint-cyan border border-tint-cyan-border flex items-center justify-center shrink-0">
              <PackageOpen className="w-4 h-4 text-accent-primary" />
            </div>
            {isExpanded && (
              <div className="truncate text-left">
                <span className="block text-xs font-extrabold tracking-tight text-ink-primary leading-tight">
                  ProdTrack
                </span>
                <span className="block text-[10px] font-mono text-ink-secondary">
                  MES Control
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-2.5 px-2 space-y-3">
          {navGroups.map(group => {
            const visibleItems = group.items.filter(i => i.visible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                {isExpanded ? (
                  <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted truncate">
                    {group.title}
                  </p>
                ) : (
                  <div className="h-px bg-border-subtle mx-1 my-1 first:hidden" />
                )}
                <div className="space-y-1">
                  {visibleItems.map(item => renderDesktopRailButton(item))}
                </div>
              </div>
            );
          })}

          {/* Admin Quick Utilities in expanded rail */}
          {isAdmin && isExpanded && (
            <div className="space-y-1 pt-2 border-t border-border-subtle">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Utilitas Data
              </p>
              <button
                type="button"
                onClick={onLoadSampleData}
                className="w-full h-8 px-2.5 rounded-lg text-xs text-ink-secondary hover:text-ink-primary hover:bg-elevated flex items-center gap-2.5 transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                <span className="truncate">Data Contoh</span>
              </button>
              <button
                type="button"
                onClick={onExportData}
                className="w-full h-8 px-2.5 rounded-lg text-xs text-ink-secondary hover:text-ink-primary hover:bg-elevated flex items-center gap-2.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
                <span className="truncate">Export JSON</span>
              </button>
              <button
                type="button"
                onClick={onOpenResetModal}
                className="w-full h-8 px-2.5 rounded-lg text-xs text-ink-rose hover:bg-tint-rose flex items-center gap-2.5 transition"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Reset Sistem</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Collapse / Expand Toggle */}
        <div className="p-2 border-t border-border-subtle shrink-0 space-y-1">
          <Tooltip.Root delayDuration={120}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={toggleExpanded}
                aria-label={isExpanded ? 'Ciutkan Sidebar' : 'Perluas Sidebar'}
                className={`w-full h-9 rounded-lg bg-surface hover:bg-elevated border border-border-subtle text-ink-secondary hover:text-ink-primary flex items-center transition active:scale-95 ${
                  isExpanded ? 'px-2.5 justify-between' : 'justify-center'
                }`}
              >
                {isExpanded ? (
                  <>
                    <span className="text-xs font-medium">Ciutkan Menu</span>
                    <PanelLeftClose className="w-4 h-4 shrink-0" />
                  </>
                ) : (
                  <PanelLeftOpen className="w-4 h-4 shrink-0" />
                )}
              </button>
            </Tooltip.Trigger>
            {!isExpanded && (
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="z-50 px-2.5 py-1.5 rounded-lg bg-elevated text-ink-primary border border-border-strong text-xs font-medium shadow-lg select-none"
                >
                  Perluas Sidebar (220px)
                  <Tooltip.Arrow className="fill-[var(--bg-elevated)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            )}
          </Tooltip.Root>
        </div>
      </aside>

      {/* 2. MOBILE / TABLET PORTRAIT COMPACT BOTTOM NAV BAR */}
      <nav
        aria-label="Navigasi Cepat Mobile"
        className="md:hidden fixed bottom-0 left-0 right-0 h-14 z-30 bg-surface-header border-t border-border-subtle flex items-center justify-around px-1 no-print"
      >
        {[
          { tab: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
          { tab: 'weekly-planning' as const, label: 'Planning', icon: CalendarRange },
          { tab: 'tank-monitoring' as const, label: 'Tangki', icon: Cylinder },
          { tab: 'shift-summary' as const, label: 'Shift', icon: ClipboardList }
        ].map(item => {
          const Icon = item.icon;
          const isActive = state.currentTab === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => handleNavClick(item.tab)}
              className={`flex flex-col items-center justify-center h-11 px-2.5 rounded-lg transition ${
                isActive ? 'text-accent-primary font-bold' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onOpenMobileDrawer?.()}
          aria-label="Buka Semua Menu"
          className="flex flex-col items-center justify-center h-11 px-2.5 rounded-lg text-ink-secondary hover:text-ink-primary transition"
        >
          <Menu className="w-4 h-4 shrink-0" />
          <span className="text-[10px] mt-0.5">Menu</span>
        </button>
      </nav>

      {/* 3. MOBILE / TABLET SLIDE-OVER DRAWER */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 bg-black/70 backdrop-blur-xs z-40 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        aria-label="Menu Navigasi Mobile"
        className={`md:hidden fixed top-0 bottom-0 left-0 w-72 max-w-[85vw] z-50 bg-surface-header border-r border-border-subtle transform transition-transform duration-200 ease-out shadow-2xl flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-11 px-3.5 border-b border-border-subtle flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-tint-cyan border border-tint-cyan-border flex items-center justify-center">
              <PackageOpen className="w-4 h-4 text-accent-primary" />
            </div>
            <div>
              <span className="font-bold text-xs text-ink-primary block leading-tight">
                ProdTrack MES
              </span>
              <span className="text-[10px] font-mono text-ink-secondary">
                Shift {currentShift.shift} · {currentShift.timeRange}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Menu Navigasi"
            className="p-1.5 rounded-lg bg-elevated text-ink-secondary hover:text-ink-primary border border-border-subtle"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Role summary inside mobile drawer */}
        <div className="px-3.5 py-2.5 border-b border-border-subtle bg-surface flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                isAdmin
                  ? 'bg-tint-amber text-ink-amber'
                  : isOperator
                  ? 'bg-tint-cyan text-ink-cyan'
                  : 'bg-tint-indigo text-ink-indigo'
              }`}
            >
              {isAdmin ? (
                <Shield className="w-3.5 h-3.5" />
              ) : isOperator ? (
                <UserCheck className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink-primary truncate">
                {state.currentSession?.name || role}
              </p>
              <p className="text-[10px] font-mono text-ink-secondary truncate">
                {effectiveRole.isOfflinePinAdmin ? 'Mode PIN Lokal' : role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onSignOut) onSignOut();
              else onOpenRoleSwitcher?.();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-elevated text-ink-secondary hover:text-ink-rose border border-border-subtle"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
          {navGroups.map(group => {
            const visibleItems = group.items.filter(i => i.visible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.title} className="space-y-1">
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  {group.title}
                </p>
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const isActive = Boolean(item.tab && state.currentTab === item.tab);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.tab) handleNavClick(item.tab);
                        else item.onClick?.();
                      }}
                      className={`w-full h-9 px-2.5 rounded-lg flex items-center justify-between text-xs transition ${
                        isActive
                          ? 'bg-accent-primary text-accent-primary-foreground font-semibold'
                          : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500 text-slate-950">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {isAdmin && (
            <div className="space-y-1 pt-2 border-t border-border-subtle">
              <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Utilitas Data
              </p>
              <button
                type="button"
                onClick={() => {
                  onLoadSampleData();
                  onClose();
                }}
                className="w-full h-9 px-2.5 rounded-lg text-xs text-ink-secondary hover:text-ink-primary hover:bg-elevated flex items-center gap-2.5"
              >
                <Sparkles className="w-4 h-4 text-ink-amber" />
                <span>Muat Preset Data Contoh</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportData();
                  onClose();
                }}
                className="w-full h-9 px-2.5 rounded-lg text-xs text-ink-secondary hover:text-ink-primary hover:bg-elevated flex items-center gap-2.5"
              >
                <Download className="w-4 h-4 text-ink-emerald" />
                <span>Export Database (JSON)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onOpenResetModal();
                  onClose();
                }}
                className="w-full h-9 px-2.5 rounded-lg text-xs text-ink-rose hover:bg-tint-rose flex items-center gap-2.5"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reset Sistem</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </Tooltip.Provider>
  );
};
