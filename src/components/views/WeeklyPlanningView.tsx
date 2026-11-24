import React from 'react';
import { ArrowLeft, ArrowRight, CalendarRange, Calculator, CheckCircle2 } from 'lucide-react';
import { AppState, RequestCartItem, WeeklyProductionPlan } from '../../types';
import { WeeklyPlanningSection } from '../WeeklyPlanningSection';
import { WeeklyPlanVsActualChart } from '../WeeklyPlanVsActualChart';
import { getActiveWeeklyPlan } from '../../utils/weeklyPlanComparison';

interface WeeklyPlanningViewProps {
  state: AppState;
  onSaveWeeklyPlan: (plan: WeeklyProductionPlan) => void;
  onSelectWeeklyPlan: (planId: string) => void;
  onDeleteWeeklyPlan: (planId: string) => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const WeeklyPlanningView: React.FC<WeeklyPlanningViewProps> = ({
  state,
  onSaveWeeklyPlan,
  onSelectWeeklyPlan,
  onDeleteWeeklyPlan,
  onSwitchTab,
  showToast
}) => {
  const isAdmin = state.currentUserRole === 'ADMINISTRATOR';
  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const activePlan = getActiveWeeklyPlan(state);

  const handleAddWeeklyItemsToRequestCart = (
    newItems: RequestCartItem[],
    mode: 'append' | 'replace'
  ) => {
    try {
      const storageKey = 'prodtrack_request_cart_v1';
      const existingRaw = localStorage.getItem(storageKey);
      const existing: RequestCartItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      const nextCart = mode === 'replace' ? newItems : [...newItems, ...existing];
      localStorage.setItem(storageKey, JSON.stringify(nextCart));
    } catch {
      // ignore storage quota errors
    }
    onSwitchTab('permintaan');
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      {/* Header Banner: Tahap 2 Penentuan Planning Mingguan */}
      <div className="bg-[#0c121d] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="text-emerald-400 font-semibold">Tahap 02 dari 07</span>
              <span aria-hidden="true">·</span>
              <span>Acuan Utama Kebutuhan Material &amp; Lini</span>
              {activePlan && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-cyan-400 font-semibold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {activePlan.weekLabel} ({activePlan.items.length} SKU)
                  </span>
                </>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-0.5">
              Penentuan Planning Produksi Mingguan
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Input manual atau unggah jadwal mingguan (SKU, Shift 1–3, target karton) untuk menjadi dasar pengajuan Permintaan Material pada tahap berikutnya.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {isAdmin && (
            <button
              type="button"
              onClick={() => onSwitchTab('master')}
              className="px-3 py-2 bg-[#06090f] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tahap 01: Master BOM</span>
            </button>
          )}
          {!isManagement && (
            <button
              type="button"
              onClick={() => onSwitchTab('bom-calculator')}
              className="px-3 py-2 bg-[#06090f] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <Calculator className="w-3.5 h-3.5 text-cyan-400" />
              <span>Kalkulator BOM</span>
            </button>
          )}
          {!isManagement && (
            <button
              type="button"
              onClick={() => onSwitchTab('permintaan')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition active:scale-95"
            >
              <span>Lanjut Tahap 03: Permintaan Material</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Weekly Planning Editor & Importer (Expanded by Default) */}
      <WeeklyPlanningSection
        state={state}
        onSaveWeeklyPlan={onSaveWeeklyPlan}
        onSelectWeeklyPlan={onSelectWeeklyPlan}
        onDeleteWeeklyPlan={onDeleteWeeklyPlan}
        onAddItemsToCart={handleAddWeeklyItemsToRequestCart}
        defaultExpanded={true}
        readOnly={isManagement}
        cartButtonLabel="Kirim Kebutuhan ke Tahap 03: Permintaan Material"
        showToast={showToast}
      />

      {/* Live Plan vs Actual Progress Visualization */}
      <WeeklyPlanVsActualChart
        state={state}
        onOpenSheetsSync={() => onSwitchTab('sheets-sync')}
      />
    </div>
  );
};
