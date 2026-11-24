import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Boxes,
  Layers,
  AlertTriangle,
  CheckCircle2,
  FilePlus,
  CalendarRange,
  ChevronDown,
  ChevronUp,
  ArrowRight
} from 'lucide-react';
import { AppState, MaterialRequest, ShiftNumber } from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import {
  calculateWeeklyPlanMaterialRequirements,
  getPlannedCartonsForItem,
  WEEKLY_PLAN_DAYS
} from '../../utils/weeklyPlanningParser';
import { ceilSafe, detectMaterialPackageConfig, hasDecimalPart } from '../../utils/orderRounding';
import { resolveProductionLineForItem } from '../../utils/lineResolver';

interface BOMCalculatorViewProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onQuickGenerateRequest: (req: Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const BOMCalculatorView: React.FC<BOMCalculatorViewProps> = ({
  state,
  onSwitchTab,
  onQuickGenerateRequest,
  showToast
}) => {
  const [selectedSkuId, setSelectedSkuId] = useState(state.master.skus[0]?.id || '');
  const [cartonTarget, setCartonTarget] = useState<number>(500);
  const [roundUpOrders, setRoundUpOrders] = useState<boolean>(true);
  const [planShiftScope, setPlanShiftScope] = useState<'ALL' | ShiftNumber>('ALL');
  const [showWeeklySummary, setShowWeeklySummary] = useState<boolean>(true);
  const [showSimulatorForm, setShowSimulatorForm] = useState<boolean>(true);

  const stockBalances = calculateStockBalances(state);
  const selectedSku = state.master.skus.find(s => s.id === selectedSkuId);

  // If no master data
  if (state.master.skus.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12 px-4 bg-slate-900 border border-slate-800 rounded-2xl mt-8">
        <Calculator className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <h3 className="font-bold text-sm text-white mb-1">Belum Ada SKU Terdaftar</h3>
        <p className="text-xs text-slate-400 mb-4">
          Silakan konfigurasikan SKU dan hierarki BOM pada menu Master Data untuk menggunakan kalkulator ini.
        </p>
        <button
          onClick={() => onSwitchTab('master')}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold"
        >
          Buka Master Data & BOM
        </button>
      </div>
    );
  }

  // Linked WIPs for this SKU
  const skuWipComps = state.master.skuWips.filter(sw => sw.skuId === selectedSkuId);

  // Calculate detailed WIP breakdown and Material breakdown
  interface WipCalculation {
    wipId: string;
    wipName: string;
    kgPerCarton: number;
    totalKgNeeded: number;
    batchWeightKg: number;
    batchesNeeded: number;
    effectiveBatches: number;
  }

  interface MaterialCalculation {
    materialId: string;
    materialName: string;
    materialType: string;
    packaging: string;
    supplier: string;
    totalKgNeeded: number;
    currentStock: number;
    deficitKg: number;
    sourceWips: string[];
    wipIdForRequest: string;
    maxWipBatches: number;
  }

  const wipCalculations: WipCalculation[] = [];
  const materialTotalsMap: Record<string, MaterialCalculation> = {};

  skuWipComps.forEach(sw => {
    const wObj = state.master.wips.find(w => w.id === sw.wipId);
    if (!wObj) return;

    const totalKg = sw.kgWipPerCartonSku * cartonTarget;
    const batches = wObj.batchWeightKg > 0 ? totalKg / wObj.batchWeightKg : 0;
    const effectiveBatches =
      roundUpOrders && hasDecimalPart(batches) ? ceilSafe(batches) : batches;

    wipCalculations.push({
      wipId: wObj.id,
      wipName: wObj.name,
      kgPerCarton: sw.kgWipPerCartonSku,
      totalKgNeeded: totalKg,
      batchWeightKg: wObj.batchWeightKg,
      batchesNeeded: batches,
      effectiveBatches
    });

    // Find materials in this WIP
    const wipMatComps = state.master.wipMats.filter(wm => wm.wipId === sw.wipId);
    wipMatComps.forEach(wm => {
      const mObj = state.master.materials.find(m => m.id === wm.materialId);
      if (!mObj) return;

      const matKgForThisWip = effectiveBatches * wm.materialKgPerBatch;

      if (!materialTotalsMap[mObj.id]) {
        const bal = stockBalances[mObj.id];
        const stockActual = bal ? bal.totalActual : 0;
        materialTotalsMap[mObj.id] = {
          materialId: mObj.id,
          materialName: mObj.name,
          materialType: mObj.type,
          packaging: mObj.packaging,
          supplier: mObj.source,
          totalKgNeeded: 0,
          currentStock: stockActual,
          deficitKg: 0,
          sourceWips: [],
          wipIdForRequest: wObj.id,
          maxWipBatches: effectiveBatches
        };
      }

      materialTotalsMap[mObj.id].totalKgNeeded += matKgForThisWip;
      if (effectiveBatches > materialTotalsMap[mObj.id].maxWipBatches) {
        materialTotalsMap[mObj.id].maxWipBatches = effectiveBatches;
      }
      if (!materialTotalsMap[mObj.id].sourceWips.includes(wObj.name)) {
        materialTotalsMap[mObj.id].sourceWips.push(wObj.name);
      }
    });
  });

  // Calculate deficit
  Object.values(materialTotalsMap).forEach(m => {
    m.deficitKg = Math.max(0, m.totalKgNeeded - m.currentStock);
  });

  const materialList = Object.values(materialTotalsMap);

  const activeWeeklyPlan =
    (state.weeklyPlannings || []).find(p => p.id === state.activeWeeklyPlanId) ||
    (state.weeklyPlannings || [])[0] ||
    null;

  const matchedPlanSkus = activeWeeklyPlan
    ? activeWeeklyPlan.items.filter(it => Boolean(it.matchedSkuId) && it.totalProduksi > 0)
    : [];

  const weeklyPlanDemand = useMemo(() => {
    if (!activeWeeklyPlan) return null;
    return calculateWeeklyPlanMaterialRequirements(activeWeeklyPlan, state, {
      selectedDays: WEEKLY_PLAN_DAYS.map(d => d.key),
      selectedShifts: planShiftScope === 'ALL' ? [1, 2, 3] : [planShiftScope],
      selectedItemIds: activeWeeklyPlan.items.map(i => i.id),
      lineFilter: 'ALL',
      orderMode: 'FULL_NEED',
      batchRoundMode: roundUpOrders ? 'CEIL_BATCH' : 'EXACT',
      packagingRoundMode: roundUpOrders ? 'ROUND_UP' : 'EXACT',
      allowancePercent: 0
    });
  }, [activeWeeklyPlan, state, planShiftScope, roundUpOrders]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Consolidated Weekly Production Plan Primary Demand Source Card */}
      {activeWeeklyPlan && (
        <div className="bg-[#0c121d]/80 backdrop-blur-md border border-cyan-500/35 rounded-xl overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.3)]">
          <div className="p-4 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#080c14]/80">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shrink-0">
                <CalendarRange className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm text-white">
                    Sumber Utama: Planning Mingguan Aktif ({activeWeeklyPlan.weekLabel})
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-300 tabular-nums">
                    {(weeklyPlanDemand?.totalPlannedCartons || 0).toLocaleString('id-ID')} Karton ·{' '}
                    {(weeklyPlanDemand?.totalTheoreticalKg || 0).toFixed(2)} kg Kebutuhan
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Perhitungan kebutuhan material seluruh SKU &amp; Shift berdasarkan jadwal mingguan aktif.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <select
                value={planShiftScope}
                onChange={e =>
                  setPlanShiftScope(
                    e.target.value === 'ALL' ? 'ALL' : (Number(e.target.value) as ShiftNumber)
                  )
                }
                className="bg-[#06090f]/90 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
              >
                <option value="ALL">Semua Shift (S1–S3)</option>
                <option value={1}>Shift 1 Saja</option>
                <option value={2}>Shift 2 Saja</option>
                <option value={3}>Shift 3 Saja</option>
              </select>
              <button
                type="button"
                onClick={() => onSwitchTab('dashboard')}
                className="px-3 py-1.5 bg-[#06090f]/90 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                <span>Edit di Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowWeeklySummary(prev => !prev)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
              >
                {showWeeklySummary ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{showWeeklySummary ? 'Tutup Rekap' : 'Lihat Rekap'}</span>
              </button>
            </div>
          </div>

          {showWeeklySummary && weeklyPlanDemand && (
            <div className="p-4 space-y-3">
              {weeklyPlanDemand.materialRequirements.length > 0 ? (
                <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-900 text-[11px] text-slate-300 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Material</th>
                        <th className="py-2 px-3">WIP &amp; SKU Terkait</th>
                        <th className="py-2 px-3 text-right">Batch</th>
                        <th className="py-2 px-3 text-right">Kebutuhan (kg)</th>
                        <th className="py-2 px-3 text-right">Stok Aktual</th>
                        <th className="py-2 px-3 text-right">Defisit / Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {weeklyPlanDemand.materialRequirements.map(req => {
                        const deficit = Math.max(0, req.theoreticalQtyKg - req.currentStockKg);
                        return (
                          <tr key={req.key} className="hover:bg-slate-800/35">
                            <td className="py-2 px-3">
                              <span className="font-semibold text-white block">{req.materialName}</span>
                              <span className="text-[10px] font-mono text-cyan-400">
                                {req.materialCode || req.materialId} · {req.supplier}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className="text-emerald-300 font-mono text-[10px] font-bold block">
                                {req.lineName}
                              </span>
                              <span className="text-amber-300 font-medium block">{req.wipName}</span>
                              <span className="text-[10px] text-slate-400 block truncate max-w-[210px]">
                                {req.contributingSkusLabel}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                              {Number.isInteger(req.batchCount) ? req.batchCount : req.batchCount.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-cyan-300">
                              {req.theoreticalQtyKg.toFixed(2)} kg
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                              {req.currentStockKg.toFixed(2)} kg
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-bold">
                              {deficit > 0.0001 ? (
                                <span className="text-rose-400">-{deficit.toFixed(2)} kg</span>
                              ) : (
                                <span className="text-emerald-400">Cukup</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Belum ada material BOM terhitung pada scope shift ini. Pastikan SKU di planning sudah tertaut ke Master SKU &amp; BOM.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Target Planning Card (Single SKU Simulator) */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${showSimulatorForm ? 'border-b border-slate-800 pb-3 mb-4' : ''}`}>
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Kalkulator Kebutuhan Produksi & Formulasi BOM
              </h3>
              <p className="text-[11px] text-slate-400">
                Simulasi cepat kebutuhan WIP dan bahan baku langsung dibandingkan dengan stok aktual pabrik
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeWeeklyPlan && matchedPlanSkus.length > 0 && (
              <div className="flex items-center space-x-2 text-xs">
                <CalendarRange className="w-4 h-4 text-cyan-400 shrink-0" />
                <select
                  defaultValue=""
                  onChange={e => {
                    const chosen = matchedPlanSkus.find(it => it.id === e.target.value);
                    if (chosen && chosen.matchedSkuId) {
                      const shiftsArg: ShiftNumber[] =
                        planShiftScope === 'ALL' ? [1, 2, 3] : [planShiftScope];
                      const totalScoped = getPlannedCartonsForItem(
                        chosen,
                        WEEKLY_PLAN_DAYS.map(d => d.key),
                        shiftsArg
                      );
                      setSelectedSkuId(chosen.matchedSkuId);
                      setCartonTarget(totalScoped);
                      showToast(
                        `Target dimuat dari ${activeWeeklyPlan.weekLabel} (${
                          planShiftScope === 'ALL' ? 'Semua Shift' : `Shift ${planShiftScope}`
                        }): ${chosen.rawProductName} (${totalScoped.toLocaleString('id-ID')} ktn)`
                      );
                    }
                  }}
                  className="bg-slate-800 border border-cyan-500/40 rounded-xl px-2.5 py-1.5 text-[11px] text-cyan-300 font-semibold"
                >
                  <option value="">
                    Muat SKU dari {activeWeeklyPlan.weekLabel} (
                    {planShiftScope === 'ALL' ? 'S1–S3' : `S${planShiftScope}`})...
                  </option>
                  {matchedPlanSkus.map(it => (
                    <option key={it.id} value={it.id}>
                      {it.rawSkuCode} • {it.rawProductName} (
                      {getPlannedCartonsForItem(
                        it,
                        WEEKLY_PLAN_DAYS.map(d => d.key),
                        planShiftScope === 'ALL' ? [1, 2, 3] : [planShiftScope]
                      ).toLocaleString('id-ID')}{' '}
                      ktn)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowSimulatorForm(prev => !prev)}
              aria-expanded={showSimulatorForm}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition"
            >
              {showSimulatorForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showSimulatorForm ? 'Tutup Form' : 'Buka Form'}</span>
            </button>
          </div>
        </div>

        {showSimulatorForm && (
          <>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/40 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Pilih Rencana Produksi SKU
            </label>
            <select
              value={selectedSkuId}
              onChange={(e) => setSelectedSkuId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-indigo-500"
            >
              {state.master.skus.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isKite ? '⭐ (KITE Ekspor)' : '(Domestik)'} - {s.cartonWeightKg.toFixed(4)} kg/ktn
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-300 mb-1">
              Target Jumlah Produksi (Karton)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={cartonTarget}
              onChange={(e) => setCartonTarget(parseInt(e.target.value) || 0)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-indigo-400 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>
        </div>

        {selectedSku && (
          <div className="mt-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/60 flex flex-wrap items-center justify-between text-xs gap-2">
            <span className="text-slate-300">
              Total Berat Produk Jadi:{' '}
              <strong className="text-cyan-400 font-mono">
                {(cartonTarget * selectedSku.cartonWeightKg).toFixed(4)} kg
              </strong>
            </span>
            <span className="text-slate-300">
              Estimasi Durasi Line (Target: {selectedSku.targetHour} ktn/jam):{' '}
              <strong className="text-amber-400 font-mono">
                {selectedSku.targetHour > 0 ? (cartonTarget / selectedSku.targetHour).toFixed(1) : 0} Jam
              </strong>
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
              selectedSku.isKite ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'
            }`}>
              {selectedSku.isKite ? 'Fasilitas KITE Ekspor' : 'Pasar Domestik'}
            </span>
          </div>
        )}
          </>
        )}
      </div>

      {/* Step 1: Breakdown WIP */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl space-y-3">
        <h4 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-2">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>1. Kebutuhan Komponen WIP Terpisah (Untuk {cartonTarget} Karton)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {wipCalculations.length > 0 ? (
            wipCalculations.map(w => (
              <div
                key={w.wipId}
                className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl space-y-2 shadow-inner"
              >
                <div className="flex justify-between items-start">
                  <span className="font-semibold text-white text-xs">{w.wipName}</span>
                  <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    {w.kgPerCarton.toFixed(4)} kg/ktn
                  </span>
                </div>
                <div className="pt-1">
                  <div className="text-lg font-bold font-mono text-cyan-400">
                    {w.totalKgNeeded.toFixed(4)} <span className="text-xs text-slate-400">kg WIP</span>
                  </div>
                  <div className="text-xs font-mono text-amber-400 mt-0.5">
                    = {roundUpOrders && hasDecimalPart(w.batchesNeeded)
                      ? `${w.effectiveBatches} Batch (dari ${w.batchesNeeded.toFixed(2)})`
                      : `${w.batchesNeeded.toFixed(2)} Batch`}{' '}
                    <span className="text-[10px] text-slate-500">(@ {w.batchWeightKg.toFixed(1)} kg)</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 py-3 col-span-3">
              Belum ada komponen WIP yang dihubungkan ke SKU ini di menu Master Data.
            </p>
          )}
        </div>
      </div>

      {/* Step 2: Breakdown Material Database with Stock Comparison */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-white">
                2. Breakdown Kebutuhan Bahan Baku vs Stok Gudang Aktual
              </h4>
              <p className="text-[11px] text-slate-400">
                Pengecekan kecukupan stok otomatis untuk mencegah hambatan jalannya line
              </p>
            </div>
          </div>
          <label className="inline-flex items-center space-x-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-xl cursor-pointer select-none">
            <input
              type="checkbox"
              checked={roundUpOrders}
              onChange={e => setRoundUpOrders(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-amber-500"
            />
            <span className="font-semibold">Bulatkan Batch Desimal &amp; Kemasan Custom ke Atas</span>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                <th className="py-3 px-4">Nama Material</th>
                <th className="py-3 px-3">Supplier</th>
                <th className="py-3 px-3 text-right">Dibutuhkan (kg)</th>
                <th className="py-3 px-3 text-right">Stok Aktual (kg)</th>
                <th className="py-3 px-3 text-right font-bold">Kekurangan (kg)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Aksi Cepat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {materialList.length > 0 ? (
                materialList.map(m => {
                  const hasDeficit = m.deficitKg > 0.0001;

                  return (
                    <tr key={m.materialId} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-medium text-white">
                        <span>{m.materialName}</span>
                        <span className="text-[10px] text-slate-400 block font-normal">
                          {m.materialType.toUpperCase()} • {m.packaging}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px]">
                          {m.supplier}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-cyan-400">
                        {m.totalKgNeeded.toFixed(4)} kg
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-300">
                        {m.currentStock.toFixed(4)} kg
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {hasDeficit ? (
                          <span className="text-rose-400">-{m.deficitKg.toFixed(4)} kg</span>
                        ) : (
                          <span className="text-emerald-400">Cukup (+{(m.currentStock - m.totalKgNeeded).toFixed(2)} kg)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasDeficit ? (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium inline-flex items-center space-x-1">
                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                            <span>Kurang</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium inline-flex items-center space-x-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span>Tersedia</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {hasDeficit ? (() => {
                          const matObj = state.master.materials.find(mat => mat.id === m.materialId);
                          const pkgCfg = detectMaterialPackageConfig(matObj);
                          const usePackCeil =
                            roundUpOrders && pkgCfg.hasDiscretePackaging && pkgCfg.defaultPackSizeKg > 0;
                          const bagSize = pkgCfg.defaultPackSizeKg;
                          const bagCount = usePackCeil ? Math.max(1, ceilSafe(m.deficitKg / bagSize)) : 0;
                          const orderQty = usePackCeil
                            ? Number((bagCount * bagSize).toFixed(4))
                            : roundUpOrders && hasDecimalPart(m.deficitKg)
                            ? ceilSafe(m.deficitKg)
                            : m.deficitKg;
                          const surplusKg = Math.max(0, Number((orderQty - m.deficitKg).toFixed(4)));
                          const reqBatch =
                            roundUpOrders && hasDecimalPart(m.maxWipBatches)
                              ? ceilSafe(m.maxWipBatches)
                              : Math.max(1, Math.round(m.maxWipBatches || 1));

                          return (
                            <div className="flex flex-col items-center space-y-1">
                              <button
                                onClick={() => {
                                  const resolvedLine = resolveProductionLineForItem(state, {
                                    skuId: selectedSkuId,
                                    wipId: m.wipIdForRequest
                                  });
                                  onQuickGenerateRequest({
                                    lineId: resolvedLine.lineId,
                                    lineName: resolvedLine.lineName,
                                    skuId: selectedSkuId,
                                    wipId: m.wipIdForRequest,
                                    materialId: m.materialId,
                                    qty: orderQty,
                                    theoreticalQty: m.deficitKg,
                                    packageSizeKg: usePackCeil ? bagSize : undefined,
                                    packageCount: usePackCeil ? bagCount : undefined,
                                    surplusKg: surplusKg,
                                    batch: reqBatch,
                                    saldoAwal: m.currentStock,
                                    supplier: m.supplier as any,
                                    notes: usePackCeil
                                      ? `[${resolvedLine.lineName}] Auto-request defisit: ${m.deficitKg.toFixed(4)} kg (Dibulatkan ${bagCount} ${pkgCfg.unitLabel} @ ${bagSize} kg = ${orderQty.toFixed(4)} kg)`
                                      : surplusKg > 0
                                      ? `[${resolvedLine.lineName}] Auto-request defisit: ${m.deficitKg.toFixed(4)} kg (Dibulatkan ke atas menjadi ${orderQty} kg)`
                                      : `[${resolvedLine.lineName}] Auto-request defisit produksi ${cartonTarget} karton ${selectedSku?.name}`
                                  });
                                  showToast(
                                    usePackCeil
                                      ? `Order ${m.supplier} dibuat: ${orderQty.toFixed(4)} kg (${bagCount} ${pkgCfg.unitLabel} @ ${bagSize} kg, surplus +${surplusKg.toFixed(4)} kg)`
                                      : `Permintaan defisit ${m.materialName} (${orderQty} kg) berhasil diajukan`
                                  );
                                }}
                                className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 rounded-lg text-[10px] font-semibold transition active:scale-95 inline-flex items-center space-x-1"
                              >
                                <FilePlus className="w-3 h-3" />
                                <span>
                                  {usePackCeil
                                    ? `Order ${bagCount} ${pkgCfg.unitLabel} (${Number(orderQty.toFixed(2))} kg)`
                                    : roundUpOrders && hasDecimalPart(m.deficitKg)
                                    ? `Order ${orderQty} kg (Bulat Atas)`
                                    : 'Minta Qty Kurang'}
                                </span>
                              </button>
                              {usePackCeil && (
                                <span className="text-[9px] text-amber-400 font-mono">
                                  Bulat: @{bagSize}kg (+{surplusKg.toFixed(2)}kg)
                                </span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-[10px] text-slate-500">Stok Siap</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                    Belum ada material yang terhubung ke relasi BOM SKU ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
