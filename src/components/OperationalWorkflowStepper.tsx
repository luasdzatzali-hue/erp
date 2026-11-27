import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Lock
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
}

const STEPPER_COLLAPSED_KEY = 'prodtrack_stepper_collapsed_v1';

export const OperationalWorkflowStepper: React.FC<OperationalWorkflowStepperProps> = ({
  state,
  onSwitchTab
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isAdmin = effectiveRole.isAdmin;
  const isManagement = effectiveRole.isManagement;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STEPPER_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        window.localStorage.setItem(STEPPER_COLLAPSED_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

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
        restrictedReason: 'Khusus Administrator'
      },
      {
        stepNumber: '02',
        tab: 'weekly-planning',
        shortTitle: 'Planning',
        hint: activePlan ? `${activePlan.weekLabel} (${activePlan.items.length} item)` : 'Belum diatur',
        isReady: Boolean(activePlan && activePlan.items.length > 0),
        isAllowed: true
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
        restrictedReason: 'Mode Pantau Saja'
      },
      {
        stepNumber: '04',
        tab: 'penerimaan',
        shortTitle: 'Penerimaan',
        hint: receiptsCount > 0 ? `${receiptsCount} Kedatangan` : 'Menunggu masuk',
        isReady: receiptsCount > 0,
        isAllowed: !isManagement,
        restrictedReason: 'Mode Pantau Saja'
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
        restrictedReason: 'Mode Pantau Saja'
      },
      {
        stepNumber: '06',
        tab: 'tank-monitoring',
        shortTitle: 'Tangki WIP',
        hint: `${Math.round(totalTankKg).toLocaleString('id-ID')} kg · ${state.master.tanks.length} Tangki`,
        isReady: totalTankKg > 0,
        isAllowed: true
      },
      {
        stepNumber: '07',
        tab: 'dashboard',
        shortTitle: 'Manufacturing',
        hint: activeRuns > 0 ? `${activeRuns} Lini Jalan` : 'Siap produksi',
        isReady: activeRuns > 0 || (state.transactions.cartonProductions || []).length > 0,
        isAllowed: true
      }
    ];
  }, [state, isAdmin, isManagement]);

  const completedCount = steps.filter(s => s.isReady).length;
  const activeStep = steps.find(s => s.tab === state.currentTab);

  if (isCollapsed) {
    return (
      <div
        aria-label="Alur Kerja 7 Tahap Disembunyikan"
        className="h-6 shrink-0 bg-surface-header/80 border-b border-border-subtle px-3 sm:px-4 flex items-center justify-between text-[11px] no-print"
      >
        <div className="flex items-center gap-2 text-ink-secondary min-w-0 truncate">
          <span className="font-mono font-bold text-accent-primary tabular-nums">
            {completedCount}/7 Tahap
          </span>
          {activeStep && (
            <>
              <span className="text-ink-muted">·</span>
              <span className="truncate font-medium text-ink-primary">
                {activeStep.stepNumber} {activeStep.shortTitle}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          title="Tampilkan Bar Alur 7 Tahap"
          aria-label="Tampilkan Bar Alur 7 Tahap"
          className="h-5 px-2 rounded text-[10px] font-semibold text-ink-secondary hover:text-ink-primary hover:bg-elevated flex items-center gap-1 transition shrink-0"
        >
          <span>Alur 7 Tahap</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <nav
      aria-label="Alur Kerja Operasional 7 Tahap"
      className="h-8 shrink-0 bg-surface-header border-b border-border-subtle z-10 no-print flex items-center justify-between px-2.5 sm:px-3.5 gap-2"
    >
      <div className="flex-1 min-w-0 h-full flex items-center gap-1 overflow-x-auto no-scrollbar">
        <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono tabular-nums font-bold text-ink-secondary whitespace-nowrap shrink-0 pr-2 mr-1 border-r border-border-subtle">
          <span className="text-accent-primary">{completedCount}/7</span>
          <span>Tahap</span>
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          {steps.map((step, index) => {
            const isActive = state.currentTab === step.tab;

            return (
              <React.Fragment key={step.tab}>
                {index > 0 && (
                  <ChevronRight className="w-3 h-3 text-ink-muted/70 shrink-0" aria-hidden="true" />
                )}
                <button
                  type="button"
                  onClick={() => onSwitchTab(step.tab)}
                  title={
                    step.isAllowed
                      ? `${step.stepNumber}. ${step.shortTitle} — ${step.hint}`
                      : `${step.shortTitle} (${step.restrictedReason || 'Terbatas'})`
                  }
                  className={`h-6 px-2 rounded text-[11px] font-medium flex items-center gap-1 transition whitespace-nowrap shrink-0 active:scale-95 ${
                    isActive
                      ? 'bg-accent-primary text-accent-primary-foreground font-bold shadow-xs'
                      : !step.isAllowed
                      ? 'text-ink-muted opacity-65 hover:opacity-90 hover:bg-elevated/50'
                      : step.isReady
                      ? 'text-ink-emerald hover:bg-tint-emerald/70'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
                  }`}
                >
                  <span className="font-mono font-bold tabular-nums text-[10px]">
                    {step.stepNumber}
                  </span>
                  <span>{step.shortTitle}</span>
                  {!step.isAllowed ? (
                    <Lock className="w-2.5 h-2.5 shrink-0" />
                  ) : step.isReady && !isActive ? (
                    <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                  ) : null}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Hide Stepper Toggle */}
      <button
        type="button"
        onClick={toggleCollapsed}
        title="Sembunyikan Bar Alur 7 Tahap untuk ruang kanvas penuh"
        aria-label="Sembunyikan Bar Alur 7 Tahap"
        className="h-6 px-1.5 rounded text-[10px] font-medium text-ink-secondary hover:text-ink-primary hover:bg-elevated border border-transparent hover:border-border-subtle flex items-center gap-1 transition shrink-0"
      >
        <span className="hidden md:inline">Sembunyikan</span>
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
    </nav>
  );
};
