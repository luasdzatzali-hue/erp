import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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

interface OperationalWorkflowStepperProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
}

interface WorkflowStepDef {
  stepNumber: string;
  tab: AppState['currentTab'];
  title: string;
  shortTitle: string;
  hint: string;
  statusLabel: string;
  isReady: boolean;
  isAllowed: boolean;
  restrictedReason?: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STEPPER_COLLAPSE_KEY = 'prodtrack_workflow_stepper_collapsed_v1';

export const OperationalWorkflowStepper: React.FC<OperationalWorkflowStepperProps> = ({
  state,
  onSwitchTab
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STEPPER_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const role = state.currentUserRole;
  const isAdmin = role === 'ADMINISTRATOR';
  const isManagement = role === 'MANAGEMENT';

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STEPPER_COLLAPSE_KEY, String(next));
      } catch {
        // ignore storage failure
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
    const activeWipBatches = wipBatches.filter(b => b.status === 'SEDANG_PRODUKSI').length;
    const completedWipBatches = wipBatches.filter(b => b.status === 'SELESAI').length;

    const totalTankKg = state.master.tanks.reduce((s, t) => s + (t.currentLevelKg || 0), 0);
    const activeRuns = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
      r => r.isRunning
    ).length;

    return [
      {
        stepNumber: '01',
        tab: 'master',
        title: 'Konfigurasi Master BOM',
        shortTitle: 'Master BOM',
        hint: 'Setup SKU, WIP, Resep, Material, Mesin & Tangki',
        statusLabel: bomConfigured ? `${skuCount} SKU · ${matCount} Mat` : 'Belum lengkap',
        isReady: bomConfigured,
        isAllowed: isAdmin,
        restrictedReason: 'Khusus Administrator',
        icon: Database
      },
      {
        stepNumber: '02',
        tab: 'weekly-planning',
        title: 'Planning Mingguan',
        shortTitle: 'Planning Mingguan',
        hint: 'Tetapkan target produksi mingguan per SKU & shift',
        statusLabel: activePlan ? `${activePlan.weekLabel} (${activePlan.items.length} item)` : 'Belum diatur',
        isReady: Boolean(activePlan && activePlan.items.length > 0),
        isAllowed: true,
        icon: CalendarRange
      },
      {
        stepNumber: '03',
        tab: 'permintaan',
        title: 'Permintaan Material',
        shortTitle: 'Permintaan',
        hint: 'Ajukan order material sesuai BOM & allowance',
        statusLabel:
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
        title: 'Penerimaan Fisik Material',
        shortTitle: 'Penerimaan Fisik',
        hint: 'Catat kedatangan, timbangan zak & lot gudang',
        statusLabel: receiptsCount > 0 ? `${receiptsCount} Kedatangan` : 'Menunggu masuk',
        isReady: receiptsCount > 0,
        isAllowed: !isManagement,
        restrictedReason: 'Mode Pantau Saja',
        icon: Truck
      },
      {
        stepNumber: '05',
        tab: 'pemakaian',
        title: 'Work Order WIP',
        shortTitle: 'Work Order WIP',
        hint: 'Jalankan batch resep mesin & potong pallet FIFO',
        statusLabel:
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
        title: 'Transfer WIP ke Storage',
        shortTitle: 'Transfer WIP',
        hint: 'Pantau level & transfer Storage Tank ke Holding Tank',
        statusLabel: `${Math.round(totalTankKg).toLocaleString('id-ID')} kg · ${state.master.tanks.length} Tangki`,
        isReady: totalTankKg > 0,
        isAllowed: true,
        icon: Cylinder
      },
      {
        stepNumber: '07',
        tab: 'dashboard',
        title: 'Manufacturing',
        shortTitle: 'Manufacturing',
        hint: 'Jalankan lini produksi karton, OEE & laporan shift',
        statusLabel: activeRuns > 0 ? `${activeRuns} Lini Jalan` : 'Siap produksi',
        isReady: activeRuns > 0 || (state.transactions.cartonProductions || []).length > 0,
        isAllowed: true,
        icon: Cpu
      }
    ];
  }, [state, isAdmin, isManagement]);

  const currentIdx = steps.findIndex(s => s.tab === state.currentTab);
  const currentStep = currentIdx >= 0 ? steps[currentIdx] : null;
  const nextAccessibleStep = useMemo(() => {
    if (currentIdx < 0) return steps.find(s => s.isAllowed) || null;
    for (let i = currentIdx + 1; i < steps.length; i++) {
      if (steps[i].isAllowed) return steps[i];
    }
    return null;
  }, [currentIdx, steps]);

  const completedCount = steps.filter(s => s.isReady).length;

  return (
    <section
      aria-label="Alur Kerja Operasional 7 Tahap"
      className="shrink-0 bg-[#080c14] border-b border-slate-800/90 z-10 no-print"
    >
      <div className="max-w-[1440px] mx-auto">
        {/* Top Bar of Stepper */}
        <div
          className={`px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 ${
            !isCollapsed ? 'border-b border-slate-800/80' : ''
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0 text-xs">
            <span className="font-bold text-white tracking-tight">
              Alur Kerja Operasional Pabrik
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="font-mono text-[11px] text-cyan-400 tabular-nums">
              {completedCount}/7 Tahap Terisi
            </span>
            {currentStep && (
              <>
                <span className="text-slate-600 hidden sm:inline" aria-hidden="true">·</span>
                <span className="text-[11px] text-slate-300 hidden sm:inline truncate">
                  Posisi saat ini: <strong className="text-white">{currentStep.stepNumber}. {currentStep.title}</strong>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {nextAccessibleStep && (
              <button
                type="button"
                onClick={() => onSwitchTab(nextAccessibleStep.tab)}
                className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95 whitespace-nowrap shrink-0"
                title={nextAccessibleStep.hint}
              >
                <span>
                  Lanjut {nextAccessibleStep.stepNumber}: {nextAccessibleStep.shortTitle}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-expanded={!isCollapsed}
              className="px-2.5 py-1 bg-[#0c121d] hover:bg-slate-800 border border-slate-700/80 text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition"
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Tampilkan 7 Tahap</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>Ringkas</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 7-Step Interactive Pipeline */}
        {!isCollapsed && (
          <div className="px-3 sm:px-5 py-2 overflow-x-auto no-scrollbar">
            <div className="grid grid-cols-7 min-w-[880px] gap-2">
              {steps.map(step => {
                const Icon = step.icon;
                const isActive = state.currentTab === step.tab;

                return (
                  <button
                    key={step.tab}
                    type="button"
                    onClick={() => onSwitchTab(step.tab)}
                    title={
                      step.isAllowed
                        ? `${step.stepNumber}. ${step.title} — ${step.hint}`
                        : `${step.title} (${step.restrictedReason || 'Terbatas'})`
                    }
                    className={`text-left px-2.5 py-2 rounded-lg border transition flex flex-col justify-between gap-1 min-h-[58px] ${
                      isActive
                        ? 'bg-cyan-600 border-cyan-500 text-white shadow-sm'
                        : !step.isAllowed
                        ? 'bg-[#0c121d]/70 border-slate-800/70 text-slate-500 opacity-75 hover:opacity-90'
                        : step.isReady
                        ? 'bg-[#0c121d] border-emerald-500/35 text-slate-200 hover:border-cyan-500/60 hover:bg-slate-800/60'
                        : 'bg-[#0c121d] border-slate-800 text-slate-300 hover:border-cyan-500/50 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 w-full">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`text-[10px] font-mono font-bold tabular-nums ${
                            isActive
                              ? 'text-cyan-100'
                              : step.isReady
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {step.stepNumber}
                        </span>
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive
                              ? 'text-white'
                              : !step.isAllowed
                              ? 'text-slate-500'
                              : step.isReady
                              ? 'text-emerald-400'
                              : 'text-cyan-400'
                          }`}
                        />
                      </div>
                      {!step.isAllowed ? (
                        <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                      ) : step.isReady ? (
                        <CheckCircle2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-white' : 'text-emerald-400'
                          }`}
                        />
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <p
                        className={`text-xs font-bold leading-tight truncate ${
                          isActive ? 'text-white' : 'text-slate-100'
                        }`}
                      >
                        {step.shortTitle}
                      </p>
                      <p
                        className={`text-[10px] font-mono tabular-nums truncate mt-0.5 ${
                          isActive
                            ? 'text-cyan-100'
                            : step.isReady
                            ? 'text-emerald-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {step.isAllowed ? step.statusLabel : step.restrictedReason}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
