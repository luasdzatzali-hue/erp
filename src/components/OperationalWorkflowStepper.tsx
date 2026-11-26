import React, { useMemo } from 'react';
import {
  CalendarRange,
  CheckCircle2,
  Cpu,
  Cylinder,
  Database,
  FileText,
  Layers,
  Lock,
  Truck
} from 'lucide-react';
import { AppState } from '../types';
import { getActiveWeeklyPlan } from '../utils/weeklyPlanComparison';
import { resolveEffectiveRole } from '../utils/roleAccess';

interface OperationalWorkflowStepperProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
}

interface WorkflowStepDef {
  stepNumber: string;
  tab: AppState['currentTab'];
  shortTitle: string;
  hint: string;
  isReady: boolean;
  isAllowed: boolean;
  restrictedReason?: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const OperationalWorkflowStepper: React.FC<OperationalWorkflowStepperProps> = ({
  state,
  onSwitchTab
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isAdmin = effectiveRole.isAdmin;
  const isManagement = effectiveRole.isManagement;

  const steps: WorkflowStepDef[] = useMemo(() => {
    const skuCount = state.master.skus.length;
    const matCount = state.master.materials.length;
    const wipCount = state.master.wips.length;
    const bomConfigured = skuCount > 0 && matCount > 0 && wipCount > 0;

    const activePlan = getActiveWeeklyPlan(state);
    const pendingRequests = state.transactions.requests.filter(r => r.status !== 'Received').length;
    const totalRequests = state.transactions.requests.length;
    const receiptsCount = state.transactions.receipts.length;

    const wipBatches = state.transactions.wipBatches || [];
    const activeWipBatches = wipBatches.filter(
      b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
    ).length;
    const completedWipBatches = wipBatches.filter(b => b.status === 'SELESAI').length;

    const totalTankKg = state.master.tanks.reduce((s, t) => s + (t.currentLevelKg || 0), 0);
    const activeRuns = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
      r => r.isRunning
    ).length;

    return [
      {
        stepNumber: '01',
        tab: 'master',
        shortTitle: 'Master BOM',
        hint: bomConfigured ? `${skuCount} SKU · ${matCount} Mat` : 'Belum lengkap',
        isReady: bomConfigured,
        isAllowed: isAdmin,
        restrictedReason: 'Khusus Administrator',
        icon: Database
      },
      {
        stepNumber: '02',
        tab: 'weekly-planning',
        shortTitle: 'Planning',
        hint: activePlan ? `${activePlan.weekLabel} (${activePlan.items.length} item)` : 'Belum diatur',
        isReady: Boolean(activePlan && activePlan.items.length > 0),
        isAllowed: true,
        icon: CalendarRange
      },
      {
        stepNumber: '03',
        tab: 'permintaan',
        shortTitle: 'Permintaan',
        hint:
          pendingRequests > 0
            ? `${pendingRequests} Menunggu`
            : totalRequests > 0
            ? `${totalRequests} Slip`
            : 'Belum ada order',
        isReady: totalRequests > 0,
        isAllowed: !isManagement,
        restrictedReason: 'Mode Pantau Saja',
        icon: FileText
      },
      {
        stepNumber: '04',
        tab: 'penerimaan',
        shortTitle: 'Penerimaan',
        hint: receiptsCount > 0 ? `${receiptsCount} Kedatangan` : 'Menunggu masuk',
        isReady: receiptsCount > 0,
        isAllowed: !isManagement,
        restrictedReason: 'Mode Pantau Saja',
        icon: Truck
      },
      {
        stepNumber: '05',
        tab: 'pemakaian',
        shortTitle: 'WO WIP',
        hint:
          activeWipBatches > 0
            ? `${activeWipBatches} Proses`
            : completedWipBatches > 0
            ? `${completedWipBatches} Selesai`
            : 'Siap batching',
        isReady: activeWipBatches > 0 || completedWipBatches > 0,
        isAllowed: !isManagement,
        restrictedReason: 'Mode Pantau Saja',
        icon: Layers
      },
      {
        stepNumber: '06',
        tab: 'tank-monitoring',
        shortTitle: 'Tangki WIP',
        hint: `${Math.round(totalTankKg).toLocaleString('id-ID')} kg · ${state.master.tanks.length} Tangki`,
        isReady: totalTankKg > 0,
        isAllowed: true,
        icon: Cylinder
      },
      {
        stepNumber: '07',
        tab: 'dashboard',
        shortTitle: 'Manufacturing',
        hint: activeRuns > 0 ? `${activeRuns} Lini Jalan` : 'Siap produksi',
        isReady: activeRuns > 0 || (state.transactions.cartonProductions || []).length > 0,
        isAllowed: true,
        icon: Cpu
      }
    ];
  }, [state, isAdmin, isManagement]);

  const completedCount = steps.filter(s => s.isReady).length;

  return (
    <nav
      aria-label="Alur Kerja Operasional 7 Tahap"
      className="h-10 shrink-0 bg-surface-header border-b border-border-subtle z-10 no-print flex items-center"
    >
      <div className="w-full h-full px-3 sm:px-4 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="hidden lg:inline-flex items-center gap-1.5 text-[11px] font-mono tabular-nums font-semibold text-ink-secondary whitespace-nowrap shrink-0 pr-1 border-r border-border-subtle">
          <span className="text-accent-primary">{completedCount}/7</span>
          <span>Tahap</span>
        </span>

        <div className="flex items-center gap-1.5 shrink-0">
          {steps.map(step => {
            const isActive = state.currentTab === step.tab;

            return (
              <button
                key={step.tab}
                type="button"
                onClick={() => onSwitchTab(step.tab)}
                title={
                  step.isAllowed
                    ? `${step.stepNumber}. ${step.shortTitle} — ${step.hint}`
                    : `${step.shortTitle} (${step.restrictedReason || 'Terbatas'})`
                }
                className={`h-7 px-2.5 rounded-md border text-[11px] font-medium flex items-center gap-1.5 transition whitespace-nowrap shrink-0 active:scale-95 ${
                  isActive
                    ? 'bg-accent-primary border-accent-primary text-accent-primary-foreground font-bold shadow-xs'
                    : !step.isAllowed
                    ? 'bg-canvas/70 border-border-subtle/70 text-ink-muted opacity-65 hover:opacity-90'
                    : step.isReady
                    ? 'bg-tint-emerald border-tint-emerald-border text-ink-emerald hover:border-accent-primary'
                    : 'bg-surface border-border-subtle text-ink-secondary hover:text-ink-primary hover:bg-elevated'
                }`}
              >
                <span className="font-mono font-bold tabular-nums text-[10px]">
                  {step.stepNumber}
                </span>
                <span>{step.shortTitle}</span>
                {!step.isAllowed ? (
                  <Lock className="w-3 h-3 shrink-0" />
                ) : step.isReady && !isActive ? (
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
