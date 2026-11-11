import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  Target,
  Package,
  TrendingUp,
  Layers,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  ShieldAlert,
  Plus,
  Cylinder,
  RotateCw,
  History,
  Activity,
  Flame,
  Check,
  Zap,
  Info,
  X,
  Boxes,
  CheckSquare,
  Square as SquareIcon
} from 'lucide-react';
import {
  AppState,
  SKU,
  ActiveSkuProductionRun,
  ProductionStopLog,
  SixBigLossCategory,
  ShiftNumber
} from '../types';
import {
  getCurrentShift,
  SHIFTS_CONFIG,
  formatIndonesianDate
} from '../utils/shifts';
import { SixBigLossesModal } from './SixBigLossesModal';

interface ProductionTargetPanelProps {
  state: AppState;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string
  ) => { success: boolean; message: string };
  onStartSkuProduction?: (skuId: string, operatorName?: string, speedMultiplier?: number) => void;
  onStartMultipleSkus?: (skuIds: string[], operatorName?: string, speedMultiplier?: number) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onStopAllSkuProduction?: () => void;
  onSetRunSpeedMultiplier?: (multiplier: number, skuId?: string) => void;
  showToast?: (msg: string, isError?: boolean) => void;
}

export const ProductionTargetPanel: React.FC<ProductionTargetPanelProps> = ({
  state,
  onSwitchTab,
  onProduceCartons,
  onStartSkuProduction,
  onStartMultipleSkus,
  onStopSkuProduction,
  onStopAllSkuProduction,
  onSetRunSpeedMultiplier,
  showToast
}) => {
  const todayDateString = new Date().toISOString().slice(0, 10);
  const currentLiveShift = getCurrentShift();
  const isManagement = state.currentUserRole === 'MANAGEMENT';

  // Multi-SKU active runs from state
  const activeRuns: ActiveSkuProductionRun[] = useMemo(() => {
    if (state.activeSkuRuns && state.activeSkuRuns.length > 0) {
      return state.activeSkuRuns;
    }
    if (state.activeSkuRun) {
      return [state.activeSkuRun];
    }
    return [];
  }, [state.activeSkuRuns, state.activeSkuRun]);

  const runningRuns = useMemo(() => {
    return activeRuns.filter(r => r.isRunning);
  }, [activeRuns]);

  const isAnyRunning = runningRuns.length > 0;

  // Single SKU selector for standby or quick start
  const defaultSkuId = useMemo(() => {
    if (runningRuns[0]?.skuId) return runningRuns[0].skuId;
    return state.master.skus[0]?.id || '';
  }, [runningRuns, state.master.skus]);

  const [selectedSkuId, setSelectedSkuId] = useState<string>(defaultSkuId);
  const [operatorInput, setOperatorInput] = useState<string>('Operator Line Produksi');

  // Multi-SKU checkboxes selection state
  const [selectedMultiSkuIds, setSelectedMultiSkuIds] = useState<string[]>([]);
  const [showMultiSelectModal, setShowMultiSelectModal] = useState<boolean>(false);
  const [additionalSkuId, setAdditionalSkuId] = useState<string>('');

  // Ad-hoc carton input state per SKU: map of skuId -> string qty
  const [adHocQtys, setAdHocQtys] = useState<Record<string, string>>({});

  // Stop SKU modal state
  const [isStopModalOpen, setIsStopModalOpen] = useState<boolean>(false);
  const [stoppingSku, setStoppingSku] = useState<{
    id: string;
    name: string;
    code?: string;
    startedAt?: string;
    cartonsProducedTotal?: number;
  } | null>(null);

  // Stop History collapsible drawer
  const [showStopHistory, setShowStopHistory] = useState<boolean>(false);

  // View tab for Section 4 Target Metrics: 'ALL' or a specific skuId
  const [metricViewSkuId, setMetricViewSkuId] = useState<string>('ALL');

  // Six Big Losses records today
  const stopLogsToday = (state.transactions.productionStops || []).filter(
    s => s.stoppedAt.includes(todayDateString)
  );
  const totalDowntimeMinutes = stopLogsToday.reduce((sum, s) => sum + s.durationMinutes, 0);

  // Helper: toggle SKU selection in multi-select checklist
  const toggleSkuSelection = (skuId: string) => {
    setSelectedMultiSkuIds(prev =>
      prev.includes(skuId) ? prev.filter(id => id !== skuId) : [...prev, skuId]
    );
  };

  const handleSelectAllSkus = () => {
    if (selectedMultiSkuIds.length === state.master.skus.length) {
      setSelectedMultiSkuIds([]);
    } else {
      setSelectedMultiSkuIds(state.master.skus.map(s => s.id));
    }
  };

  // Launch single SKU
  const handleStartSingleSku = (skuId: string) => {
    if (!skuId) return;
    const sku = state.master.skus.find(s => s.id === skuId);
    if (!sku) return;
    if (onStartSkuProduction) {
      onStartSkuProduction(skuId, operatorInput, 1);
    }
  };

  // Launch multiple selected SKUs
  const handleStartMultipleSelected = () => {
    if (selectedMultiSkuIds.length === 0) {
      if (showToast) showToast('Pilih minimal satu SKU untuk dijalankan', true);
      return;
    }
    if (onStartMultipleSkus) {
      onStartMultipleSkus(selectedMultiSkuIds, operatorInput, 1);
    } else if (onStartSkuProduction) {
      selectedMultiSkuIds.forEach(id => onStartSkuProduction(id, operatorInput, 1));
    }
    setSelectedMultiSkuIds([]);
    setShowMultiSelectModal(false);
  };

  // Open stop modal for a specific running SKU
  const handleOpenStopForSku = (skuId: string) => {
    const sku = state.master.skus.find(s => s.id === skuId);
    const run = runningRuns.find(r => r.skuId === skuId);
    if (!sku) return;
    setStoppingSku({
      id: sku.id,
      name: sku.name,
      code: sku.code,
      startedAt: run?.startedAt,
      cartonsProducedTotal: run?.cartonsProducedTotal || 0
    });
    setIsStopModalOpen(true);
  };

  // Confirm stop from SixBigLossesModal
  const handleConfirmStop = (stopData: Omit<ProductionStopLog, 'id'>) => {
    if (onStopSkuProduction) {
      onStopSkuProduction(stopData);
    }
  };

  // Execute manual carton production & instant tank reduction for a specific SKU
  const handleExecuteProductionDeductionForSku = (skuId: string, qty: number, notesText?: string) => {
    const sku = state.master.skus.find(s => s.id === skuId);
    if (!sku || !onProduceCartons) return;

    const res = onProduceCartons(
      sku.id,
      qty,
      operatorInput,
      notesText || `Output ad-hoc ${qty} karton ${sku.name} (Shift ${currentLiveShift.shift}) - Isi Tangki Terpotong Real-Time`
    );

    if (showToast) {
      showToast(res.message, !res.success);
    }
  };

  // Get connected WIPs and integrated Holding & Storage tanks for an SKU
  const getLinkedWipBreakdown = (skuId: string) => {
    const sws = state.master.skuWips.filter(sw => sw.skuId === skuId);
    return sws.map(sw => {
      const wip = state.master.wips.find(w => w.id === sw.wipId);
      const integratedTanks = state.master.tanks.filter(
        t => t.assignedWipId === sw.wipId || t.id === wip?.targetTankId
      );
      return {
        skuWip: sw,
        wip,
        integratedTanks,
        kgPerCarton: sw.kgWipPerCartonSku
      };
    });
  };

  // Aggregate metrics for Section 4
  const targetSkuForMetrics = metricViewSkuId === 'ALL'
    ? null
    : state.master.skus.find(s => s.id === metricViewSkuId);

  // Daily target cartons & kg
  const activeSkusForMetrics = targetSkuForMetrics
    ? [targetSkuForMetrics]
    : (runningRuns.length > 0
        ? state.master.skus.filter(s => runningRuns.some(r => r.skuId === s.id))
        : state.master.skus);

  const aggregateDailyTargetCartons = activeSkusForMetrics.reduce(
    (sum, s) => sum + (s.targetHour || 500) * 8 * 3,
    0
  );
  const aggregateTargetPerShift = Math.round(aggregateDailyTargetCartons / 3);

  // Carton logs today
  const actualCartonLogsToday = (state.transactions.cartonProductions || []).filter(cp =>
    cp.timestamp.includes(todayDateString) &&
    (targetSkuForMetrics ? cp.skuId === targetSkuForMetrics.id : true)
  );

  const finalCartonsToday = actualCartonLogsToday.reduce((sum, cp) => sum + cp.cartonsProduced, 0);

  // Shift breakdown
  const shiftCartons: Record<ShiftNumber, number> = {
    1: actualCartonLogsToday.filter(c => c.shift === 1).reduce((s, c) => s + c.cartonsProduced, 0),
    2: actualCartonLogsToday.filter(c => c.shift === 2).reduce((s, c) => s + c.cartonsProduced, 0),
    3: actualCartonLogsToday.filter(c => c.shift === 3).reduce((s, c) => s + c.cartonsProduced, 0)
  };

  const progressPercent = Math.min(
    100,
    Math.round((finalCartonsToday / (aggregateDailyTargetCartons || 1)) * 100)
  );

  // Non-running SKUs available to start
  const availableToStartSkus = state.master.skus.filter(
    s => !runningRuns.some(r => r.skuId === s.id)
  );

  return (
    <div className="bg-white border-2 border-black rounded-3xl p-4 sm:p-6 shadow-xs space-y-5 text-black">
      {/* 1. Calendar, Shift & Live Operational Cockpit Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b-2 border-black pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-black text-white border border-black shadow-xs">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-sm sm:text-base text-black">
                Target & Jadwal Produksi Harian Real-Time
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-black text-white font-mono font-bold border border-black">
                Sistem 24 Jam (3 Shift)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-600 text-white font-mono font-bold border border-black">
                Multi-SKU Ready
              </span>
            </div>
            <p className="text-xs text-black flex items-center space-x-1.5 mt-0.5">
              <span className="font-bold text-black">{formatIndonesianDate()}</span>
              <span>•</span>
              <span className="text-black font-bold">Shift {currentLiveShift.shift} ({currentLiveShift.timeRange})</span>
              <span>•</span>
              <span className="text-black">Pengurangan Isi Tangki Otomatis Real-Time</span>
            </p>
          </div>
        </div>

        {/* Live Running Multi-SKU Status Badge */}
        <div className="flex items-center space-x-2 bg-white px-3.5 py-2 rounded-2xl border-2 border-black shadow-xs">
          <span className="relative flex h-3 w-3">
            {isAnyRunning ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </>
            ) : (
              <span className="relative inline-flex rounded-full h-3 w-3 bg-zinc-400" />
            )}
          </span>
          <div className="text-left">
            <span className="text-[10px] text-black block leading-none font-bold">Status Lini Produksi:</span>
            <span
              className={`text-xs font-black leading-tight ${
                isAnyRunning ? 'text-black underline' : 'text-zinc-600'
              }`}
            >
              {isAnyRunning
                ? `● ${runningRuns.length} SKU SEDANG BERJALAN AKTIF`
                : '● STANDBY / SIAP RUN'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. KOLOM SKU SEDANG DIPROSES (MULTI-SKU REAL-TIME COCKPIT) */}
      <div className="bg-white border-2 border-black p-4 sm:p-5 rounded-2xl space-y-4 shadow-xs">
        {/* Section Header with Multi-SKU Controls */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b-2 border-black pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center font-bold text-xs border border-black">
                <Boxes className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-black flex items-center space-x-2">
                  <span>Kolom SKU Sedang Diproses</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-black text-white font-bold">
                    {runningRuns.length} SKU Aktif
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-600 font-medium">
                  Setiap SKU berjalan secara independen dan memotong holding & storage tank sesuai formula resep BOM masing-masing.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar on Header: Multi-select button & Stop All */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {!isManagement && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMultiSelectModal(!showMultiSelectModal)}
                  className="px-3 py-1.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1.5 transition active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                  <span>Jalankan Multi-SKU (Pilih Sekaligus)</span>
                </button>

                {runningRuns.length > 1 && onStopAllSkuProduction && (
                  <button
                    type="button"
                    onClick={onStopAllSkuProduction}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1.5 transition active:scale-95"
                    title="Hentikan semua SKU yang sedang diproses"
                  >
                    <Square className="w-3.5 h-3.5 fill-current text-white" />
                    <span>Hentikan Semua SKU ({runningRuns.length})</span>
                  </button>
                )}
              </>
            )}

            {/* Riwayat Stop Modal Trigger */}
            <button
              type="button"
              onClick={() => setShowStopHistory(!showStopHistory)}
              className="px-3 py-1.5 bg-white hover:bg-zinc-100 text-black rounded-xl text-xs font-bold border-2 border-black flex items-center space-x-1.5 transition shadow-xs"
              title="Lihat Log Stop Produksi Six Big Losses"
            >
              <History className="w-3.5 h-3.5 text-black" />
              <span>Log Stop ({stopLogsToday.length})</span>
            </button>
          </div>
        </div>

        {/* Multi-SKU Quick Selection Drawer / Modal */}
        {showMultiSelectModal && !isManagement && (
          <div className="bg-zinc-50 border-2 border-black p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-300 pb-2">
              <div className="flex items-center space-x-2">
                <CheckSquare className="w-4 h-4 text-black" />
                <h4 className="font-extrabold text-xs sm:text-sm text-black">
                  Pilih SKU untuk Dijalankan Bersamaan di Lini Produksi
                </h4>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleSelectAllSkus}
                  className="px-2 py-1 bg-white hover:bg-zinc-100 text-black border border-black rounded text-[11px] font-bold"
                >
                  {selectedMultiSkuIds.length === state.master.skus.length ? 'Batal Semua' : 'Pilih Semua SKU'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowMultiSelectModal(false)}
                  className="p-1 text-zinc-500 hover:text-black rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Checklist of All Master SKUs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {state.master.skus.map(sku => {
                const isSelected = selectedMultiSkuIds.includes(sku.id);
                const isCurrentlyRunning = runningRuns.some(r => r.skuId === sku.id);
                const linkedWips = state.master.skuWips.filter(sw => sw.skuId === sku.id);

                return (
                  <div
                    key={sku.id}
                    onClick={() => {
                      if (!isCurrentlyRunning) toggleSkuSelection(sku.id);
                    }}
                    className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-start space-x-2.5 ${
                      isCurrentlyRunning
                        ? 'bg-zinc-100 border-zinc-400 opacity-60 cursor-not-allowed'
                        : isSelected
                        ? 'bg-black text-white border-black shadow-xs'
                        : 'bg-white text-black border-black hover:bg-zinc-100'
                    }`}
                  >
                    <div className="mt-0.5">
                      {isCurrentlyRunning ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : isSelected ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : (
                        <SquareIcon className="w-4 h-4 text-black" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-extrabold text-xs truncate">
                          {sku.name}
                        </span>
                        {sku.isKite && (
                          <span className={`px-1 py-0.2 rounded text-[9px] font-bold border ${
                            isSelected ? 'bg-white text-black border-white' : 'bg-black text-white border-black'
                          }`}>
                            KITE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5 text-[10px] font-mono opacity-80">
                        <span>{sku.code || `SKU-${sku.id.slice(-4)}`}</span>
                        <span>•</span>
                        <span>{sku.targetHour} ktn/jam</span>
                      </div>
                      <span className="text-[10px] block mt-1 opacity-70">
                        {isCurrentlyRunning
                          ? '● Sedang Berjalan'
                          : `${linkedWips.length} Komponen WIP Terhubung`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Bottom Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-300">
              <span className="text-xs font-bold text-black">
                {selectedMultiSkuIds.length} SKU Terpilih untuk Dijalankan
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowMultiSelectModal(false)}
                  className="px-3 py-1.5 bg-white text-black border border-black rounded-xl text-xs font-bold hover:bg-zinc-100"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleStartMultipleSelected}
                  disabled={selectedMultiSkuIds.length === 0}
                  className="px-4 py-1.5 bg-black hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-white" />
                  <span>Jalankan {selectedMultiSkuIds.length} SKU Sekaligus</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2A. ACTIVE RUNNING SKUs LIST (KOLOM SKU SEDANG DIPROSES) */}
        {runningRuns.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              {runningRuns.map(run => {
                const sku = state.master.skus.find(s => s.id === run.skuId);
                const targetPerHour = sku?.targetHour || run.targetPerHour || 500;
                const speedMult = run.speedMultiplier || 1;
                const linkedWips = sku ? getLinkedWipBreakdown(sku.id) : [];
                const adHocQty = adHocQtys[run.skuId] || '200';

                return (
                  <div
                    key={run.skuId}
                    className="bg-white border-2 border-black rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm relative overflow-hidden"
                  >
                    {/* Top Row: SKU Badge, Speed Multiplier & Stop Button */}
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-b-2 border-black pb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 rounded-2xl bg-black text-white flex items-center justify-center shrink-0 border-2 border-black shadow-xs">
                          <Package className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-bold text-black uppercase tracking-wider">
                              SKU Sedang Diproses:
                            </span>
                            {sku?.isKite && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] bg-black text-white font-bold border border-black">
                                ⭐ KITE Ekspor
                              </span>
                            )}
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-400 text-[10px] font-extrabold">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              <span>RUNNING REAL-TIME</span>
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <h4 className="font-black text-black text-base sm:text-lg">
                              {sku?.name || run.skuName}
                            </h4>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white text-black font-extrabold border-2 border-black">
                              {sku?.code || run.skuCode || `SKU-${run.skuId.slice(-4).toUpperCase()}`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Speed Multiplier & Individual Stop Button */}
                      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                        {/* Speed Multiplier */}
                        <div className="flex items-center space-x-1 bg-white p-1 rounded-xl border-2 border-black shadow-xs">
                          <span className="text-[10px] text-black px-1 font-mono font-bold">Laju:</span>
                          {[
                            { mult: 1, label: '1x' },
                            { mult: 2, label: '2x' },
                            { mult: 5, label: '5x' }
                          ].map(({ mult, label }) => (
                            <button
                              key={mult}
                              type="button"
                              onClick={() => onSetRunSpeedMultiplier && onSetRunSpeedMultiplier(mult, run.skuId)}
                              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono transition border ${
                                speedMult === mult
                                  ? 'bg-black text-white border-black shadow-xs'
                                  : 'bg-white text-black border-black hover:bg-zinc-100'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {/* STOP BUTTON (SIX BIG LOSSES) */}
                        {!isManagement ? (
                          <button
                            type="button"
                            onClick={() => handleOpenStopForSku(run.skuId)}
                            className="px-4 py-2 bg-white hover:bg-zinc-100 text-black rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1.5 transition active:scale-95"
                          >
                            <Square className="w-4 h-4 fill-current text-black" />
                            <span>Hentikan SKU Ini (Stop)</span>
                          </button>
                        ) : (
                          <div className="px-3 py-1.5 bg-zinc-100 border-2 border-black rounded-xl text-xs text-black font-extrabold flex items-center space-x-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-black" />
                            <span>Pantau</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Real-time Telemetry Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="bg-white p-3 rounded-xl border-2 border-black shadow-xs">
                        <span className="text-[10px] text-black block font-mono font-bold">Karton Terproduksi Real-Time:</span>
                        <div className="flex items-baseline space-x-1.5 mt-0.5">
                          <span className="text-2xl font-black font-mono text-black">
                            {(run.cartonsProducedTotal || 0).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-black font-mono font-bold">karton</span>
                          <span className="text-[10px] text-zinc-600 font-mono">
                            ({((run.cartonsProducedTotal || 0) * (sku?.cartonWeightKg || 12)).toFixed(1)} kg)
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border-2 border-black shadow-xs">
                        <span className="text-[10px] text-black block font-mono font-bold">Laju Konsumsi Tangki:</span>
                        <div className="flex items-baseline space-x-1 mt-0.5">
                          <span className="text-xl font-black font-mono text-black">
                            {((targetPerHour * speedMult) / 3600).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-black font-mono font-bold">ktn/dtk</span>
                          <span className="text-[10px] text-black font-mono">
                            ({(3600 / (targetPerHour * speedMult)).toFixed(1)}s/ktn • {targetPerHour * speedMult} ktn/j)
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-xl border-2 border-black shadow-xs">
                        <span className="text-[10px] text-black block font-mono font-bold">WIP Terpotong Otomatis:</span>
                        <div className="text-[11px] font-mono text-black font-extrabold mt-0.5 truncate">
                          {linkedWips.length > 0 ? (
                            linkedWips.map((b, idx) => (
                              <span key={b.skuWip.id}>
                                {idx > 0 && ' • '}
                                {b.wip?.code || 'WIP'}: {((run.cartonsProducedTotal || 0) * b.kgPerCarton).toFixed(1)} kg
                              </span>
                            ))
                          ) : (
                            <span className="text-black font-normal">Formula BOM aktif</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Integrated Tanks Strip connected to this SKU */}
                    <div className="pt-2 border-t-2 border-black">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-extrabold text-black flex items-center space-x-1.5">
                          <Cylinder className="w-3.5 h-3.5 text-black" />
                          <span>Tangki Terintegrasi SKU [{sku?.name || run.skuName}] (Berkurang Real-Time):</span>
                        </span>
                        <span className="text-[10px] text-black font-mono font-bold">
                          {linkedWips.length} Komponen WIP Terikat
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {linkedWips.map((item, idx) => {
                          const primaryTank = item.integratedTanks[0];
                          const remainingKg = primaryTank ? primaryTank.currentLevelKg : 0;
                          const kgPerCarton = item.kgPerCarton;
                          const maxCartons = kgPerCarton > 0 ? Math.floor(remainingKg / kgPerCarton) : 0;
                          const isCrit = primaryTank && primaryTank.currentLevelKg <= (primaryTank.minAlertKg || primaryTank.capacityKg * 0.2);

                          return (
                            <div
                              key={idx}
                              className="bg-white border-2 border-black p-2.5 rounded-xl flex items-center justify-between text-xs shadow-xs"
                            >
                              <div className="truncate mr-2">
                                <span className="font-extrabold text-black block truncate">
                                  {item.wip?.name || 'WIP Komponen'}
                                </span>
                                <span className="text-[10px] text-zinc-600 font-mono font-bold block">
                                  {kgPerCarton.toFixed(4)} kg / karton
                                </span>
                              </div>

                              <div className="text-right shrink-0">
                                {primaryTank ? (
                                  <div>
                                    <span className="font-mono text-black font-extrabold block text-[11px] bg-white px-1.5 py-0.5 rounded border border-black">
                                      {primaryTank.code} ({primaryTank.type === 'HOLDING_TANK' ? 'HT' : 'ST'}): {primaryTank.currentLevelKg.toFixed(1)} kg
                                    </span>
                                    <span className={`text-[10px] font-mono block mt-0.5 font-extrabold ${isCrit ? 'text-rose-600 underline' : 'text-black'}`}>
                                      Sisa: {maxCartons} ktn
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-zinc-500 italic">
                                    Belum ada tangki
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Bottom Row: Optional Manual Ad-hoc Input for this SKU */}
                    {!isManagement && (
                      <div className="pt-2 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-zinc-700 flex items-center space-x-1">
                          <Plus className="w-3 h-3 text-black" />
                          <span>Input Tambahan Manual / Ad-hoc:</span>
                        </span>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleExecuteProductionDeductionForSku(run.skuId, 1)}
                            className="px-2 py-0.5 bg-white hover:bg-zinc-100 text-black border border-black rounded text-[10px] font-bold shadow-xs"
                          >
                            +1 ktn
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteProductionDeductionForSku(run.skuId, 10)}
                            className="px-2 py-0.5 bg-white hover:bg-zinc-100 text-black border border-black rounded text-[10px] font-bold shadow-xs"
                          >
                            +10 ktn
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteProductionDeductionForSku(run.skuId, 50)}
                            className="px-2 py-0.5 bg-white hover:bg-zinc-100 text-black border border-black rounded text-[10px] font-bold shadow-xs"
                          >
                            +50 ktn
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExecuteProductionDeductionForSku(run.skuId, 200)}
                            className="px-2.5 py-0.5 bg-black text-white hover:bg-zinc-800 border border-black rounded text-[10px] font-bold shadow-xs"
                          >
                            +200 ktn
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Add Another Non-Running SKU Toolbar */}
            {!isManagement && availableToStartSkus.length > 0 && (
              <div className="bg-zinc-50 border-2 border-black p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center font-bold text-xs">
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <span className="font-extrabold text-xs text-black block">
                      Jalankan SKU Tambahan Bersamaan:
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      Tersedia {availableToStartSkus.length} SKU lainnya untuk dijalankan secara paralel di lini produksi.
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <select
                    value={additionalSkuId}
                    onChange={(e) => setAdditionalSkuId(e.target.value)}
                    className="bg-white border-2 border-black rounded-xl px-3 py-1.5 text-xs text-black font-extrabold focus:outline-none shadow-xs"
                  >
                    <option value="">-- Pilih SKU Tambahan --</option>
                    {availableToStartSkus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code || 'SKU'}) - {s.targetHour} ktn/jam
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      if (additionalSkuId) {
                        handleStartSingleSku(additionalSkuId);
                        setAdditionalSkuId('');
                      }
                    }}
                    disabled={!additionalSkuId}
                    className="px-3.5 py-1.5 bg-black hover:bg-zinc-800 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1 transition active:scale-95 shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current text-white" />
                    <span>Mulai SKU Ini</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 2B. STANDBY STATE (0 SKU RUNNING): Interactive Multi-SKU Checklist & Single Selector */
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-zinc-50 border-2 border-black rounded-2xl">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-black text-white border border-black shadow-xs">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h5 className="text-xs sm:text-sm font-extrabold text-black">
                    Lini Produksi Siap Dijalankan (Standby Mode)
                  </h5>
                  <p className="text-[11px] text-zinc-600 mt-0.5">
                    Pilih satu atau beberapa SKU di bawah ini untuk dijalankan bersamaan. Sistem otomatis memproses pemotongan tangki holding & storage secara real-time.
                  </p>
                </div>
              </div>

              {/* Single SKU Quick Start */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedSkuId}
                  onChange={(e) => setSelectedSkuId(e.target.value)}
                  className="bg-white border-2 border-black rounded-xl px-3 py-2 text-xs text-black font-extrabold focus:outline-none shadow-xs"
                >
                  {state.master.skus.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || 'SKU'}) - {s.targetHour} ktn/jam
                    </option>
                  ))}
                </select>

                {!isManagement && (
                  <button
                    type="button"
                    onClick={() => handleStartSingleSku(selectedSkuId)}
                    className="px-4 py-2 bg-black hover:bg-zinc-800 text-white rounded-xl text-xs font-extrabold border-2 border-black shadow-xs flex items-center space-x-1.5 transition active:scale-95"
                  >
                    <Play className="w-4 h-4 fill-current text-white" />
                    <span>Mulai Produksi (Start)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Multi-SKU Selection Grid */}
            {!isManagement && state.master.skus.length > 1 && (
              <div className="border-2 border-black rounded-2xl p-4 space-y-3 bg-white">
                <div className="flex items-center justify-between border-b-2 border-black pb-2">
                  <span className="font-extrabold text-xs text-black flex items-center space-x-1.5">
                    <CheckSquare className="w-4 h-4 text-black" />
                    <span>Centang Multiple SKU untuk Dijalankan Bersamaan ({selectedMultiSkuIds.length} Terpilih):</span>
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleSelectAllSkus}
                      className="px-2.5 py-1 bg-white hover:bg-zinc-100 text-black border border-black rounded-lg text-[10px] font-bold transition"
                    >
                      {selectedMultiSkuIds.length === state.master.skus.length ? 'Batal Semua' : 'Pilih Semua'}
                    </button>
                    <button
                      type="button"
                      onClick={handleStartMultipleSelected}
                      disabled={selectedMultiSkuIds.length === 0}
                      className="px-3.5 py-1 bg-black hover:bg-zinc-800 disabled:opacity-40 text-white border-2 border-black rounded-xl text-xs font-extrabold transition shadow-xs flex items-center space-x-1"
                    >
                      <Play className="w-3 h-3 fill-current text-white" />
                      <span>Jalankan {selectedMultiSkuIds.length} SKU Bersamaan</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {state.master.skus.map(s => {
                    const isSelected = selectedMultiSkuIds.includes(s.id);
                    const linkedWips = state.master.skuWips.filter(sw => sw.skuId === s.id);

                    return (
                      <div
                        key={s.id}
                        onClick={() => toggleSkuSelection(s.id)}
                        className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-start space-x-2.5 ${
                          isSelected
                            ? 'bg-black text-white border-black shadow-xs'
                            : 'bg-white text-black border-black hover:bg-zinc-100'
                        }`}
                      >
                        <div className="mt-0.5">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-white" />
                          ) : (
                            <SquareIcon className="w-4 h-4 text-black" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-extrabold text-xs block truncate">
                            {s.name}
                          </span>
                          <div className="flex items-center space-x-1.5 text-[10px] font-mono opacity-80 mt-0.5">
                            <span>{s.code || 'SKU'}</span>
                            <span>•</span>
                            <span>{s.targetHour} ktn/jam</span>
                            <span>•</span>
                            <span>{linkedWips.length} WIP</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Six Big Losses Stoppage Log Drawer (Collapsible) */}
      {showStopHistory && (
        <div className="bg-white border-2 border-black rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-black" />
              <h4 className="font-extrabold text-xs sm:text-sm text-black">
                Riwayat Stop Produksi Hari Ini (Standar TPM Six Big Losses)
              </h4>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="text-black font-bold">Total Downtime:</span>
              <span className="font-mono font-extrabold text-white bg-black px-2 py-0.5 rounded border border-black">
                {totalDowntimeMinutes} Menit
              </span>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border border-black">
              <thead>
                <tr className="bg-black text-white text-[10px] font-bold uppercase">
                  <th className="py-2 px-2.5">Waktu Stop</th>
                  <th className="py-2 px-2.5">SKU Terkena</th>
                  <th className="py-2 px-2.5">Shift</th>
                  <th className="py-2 px-2.5">Kategori Six Big Losses</th>
                  <th className="py-2 px-2.5">Alasan Terhenti</th>
                  <th className="py-2 px-2.5 text-right">Durasi</th>
                  <th className="py-2 px-2.5">Tindakan / PIC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black bg-white text-black">
                {stopLogsToday.length > 0 ? (
                  stopLogsToday
                    .slice()
                    .reverse()
                    .map(log => (
                      <tr key={log.id} className="hover:bg-zinc-100 transition">
                        <td className="py-2 px-2.5 font-mono text-[11px] text-black whitespace-nowrap font-bold">
                          {new Date(log.stoppedAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-2 px-2.5 font-bold text-black">
                          {log.skuName || '-'}
                        </td>
                        <td className="py-2 px-2.5 font-mono font-bold text-black">
                          Shift {log.shift}
                        </td>
                        <td className="py-2 px-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-black bg-white text-black">
                            {log.categoryLabel}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-black font-bold max-w-xs truncate">
                          {log.reasonTitle}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-black text-black">
                          {log.durationMinutes} mnt
                        </td>
                        <td className="py-2 px-2.5 text-black text-[11px] font-medium">
                          {log.actionTaken || log.operatorName || '-'}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-black text-xs font-bold">
                      Belum ada kejadian stop produksi yang tercatat hari ini. Operasional berjalan lancar!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Target Metrics Grid: Per Karton, Per Shift, Per Hari (With SKU Filter Tabs) */}
      <div className="space-y-3">
        {/* Metric Switcher Tabs */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar pb-1">
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-bold text-black mr-1">Tinjauan Metrik:</span>
            <button
              type="button"
              onClick={() => setMetricViewSkuId('ALL')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition border ${
                metricViewSkuId === 'ALL'
                  ? 'bg-black text-white border-black shadow-xs'
                  : 'bg-white text-black border-black hover:bg-zinc-100'
              }`}
            >
              📊 Semua SKU Tergabung
            </button>
            {state.master.skus.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => setMetricViewSkuId(s.id)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition border whitespace-nowrap ${
                  metricViewSkuId === s.id
                    ? 'bg-black text-white border-black shadow-xs'
                    : 'bg-white text-black border-black hover:bg-zinc-100'
                }`}
              >
                {runningRuns.some(r => r.skuId === s.id) ? '● ' : ''}{s.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Metric 1: Target Per Karton (Realisasi vs Target Harian) */}
          <div className="bg-white border-2 border-black p-4 rounded-2xl space-y-2.5 shadow-xs text-black">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-black uppercase tracking-wider flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-black" />
                <span>Target Per Karton ({metricViewSkuId === 'ALL' ? 'Semua SKU' : targetSkuForMetrics?.name})</span>
              </span>
              <span className="text-xs font-mono font-extrabold text-black">
                {progressPercent}%
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-black font-mono text-black">
                  {finalCartonsToday.toLocaleString()}
                </span>
                <span className="text-xs text-black font-mono ml-1.5 font-bold">
                  / {aggregateDailyTargetCartons.toLocaleString()} ktn
                </span>
              </div>
              <span className="text-[10px] text-white font-bold bg-black px-2 py-0.5 rounded border border-black">
                {targetSkuForMetrics ? `${targetSkuForMetrics.targetHour} ktn/jam` : `${activeSkusForMetrics.reduce((s, x) => s + x.targetHour, 0)} ktn/jam total`}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-zinc-200 h-2.5 rounded-full overflow-hidden border border-black">
              <div
                className="bg-black h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-black font-mono font-bold">
              <span>Sisa Kuota: {Math.max(0, aggregateDailyTargetCartons - finalCartonsToday).toLocaleString()} ktn</span>
              <span>
                {targetSkuForMetrics
                  ? `Bobot: ${targetSkuForMetrics.cartonWeightKg.toFixed(2)} kg/ktn`
                  : `${activeSkusForMetrics.length} SKU`}
              </span>
            </div>
          </div>

          {/* Metric 2: Target Per Shift (3 Shift Breakdown) */}
          <div className="bg-white border-2 border-black p-4 rounded-2xl space-y-2 shadow-xs text-black">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-black uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-black" />
                <span>Target Per Shift ({aggregateTargetPerShift.toLocaleString()} ktn/shift)</span>
              </span>
            </div>

            <div className="space-y-1.5">
              {([1, 2, 3] as ShiftNumber[]).map(sNum => {
                const sInfo = SHIFTS_CONFIG[sNum];
                const isCurrent = currentLiveShift.shift === sNum;
                const shiftRealized = shiftCartons[sNum];
                const shiftPct = Math.min(100, Math.round((shiftRealized / (aggregateTargetPerShift || 1)) * 100));

                return (
                  <div
                    key={sNum}
                    className={`p-2 rounded-xl text-xs flex items-center justify-between border-2 transition ${
                      isCurrent
                        ? 'bg-zinc-100 border-black'
                        : 'bg-white border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-black text-white border border-black">
                        {sInfo.shortLabel}
                      </span>
                      <span className="text-[10px] text-black font-mono font-bold">{sInfo.timeRange}</span>
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="text-right">
                        <span className="font-mono font-black text-black">
                          {shiftRealized.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-zinc-600 font-mono"> ktn</span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-black bg-white px-1.5 py-0.5 rounded border border-black min-w-[36px] text-center">
                        {shiftPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metric 3: Target Harian 24 Jam Penuh */}
          <div className="bg-white border-2 border-black p-4 rounded-2xl flex flex-col justify-between space-y-3 shadow-xs text-black">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-black uppercase tracking-wider flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-black" />
                  <span>Kapasitas Lini 24 Jam</span>
                </span>
                <span className="text-[10px] font-mono text-black font-bold">
                  Full Plant Capacity
                </span>
              </div>

              <div className="mt-2">
                <span className="text-3xl font-black font-mono text-black">
                  {aggregateDailyTargetCartons.toLocaleString()}
                </span>
                <span className="text-xs text-black font-mono ml-1 font-bold">
                  Karton / 24 Jam
                </span>
              </div>
            </div>

            <div className="bg-zinc-50 border-2 border-black rounded-xl p-2.5 space-y-1 divide-y divide-black">
              <div className="flex justify-between text-xs py-1">
                <span className="text-black font-bold">SKU yang Sedang Berjalan:</span>
                <span className="font-mono font-extrabold text-black">
                  {runningRuns.length} dari {state.master.skus.length} SKU
                </span>
              </div>
              <div className="flex justify-between text-xs py-1">
                <span className="text-black font-bold">Jam Efektif Produksi:</span>
                <span className="font-mono font-black text-black">
                  24 Jam Penuh (3 Shift × 8 Jam)
                </span>
              </div>
            </div>

            {onSwitchTab && (
              <button
                onClick={() => onSwitchTab('bom-calculator')}
                className="w-full py-1.5 bg-black hover:bg-zinc-800 text-white rounded-xl text-[11px] font-extrabold transition flex items-center justify-center space-x-1 border-2 border-black shadow-xs"
              >
                <span className="text-white">Hitung Kebutuhan Bahan di Kalkulator BOM</span>
                <ChevronRight className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Six Big Losses Modal (Targeting specific SKU being stopped) */}
      {isStopModalOpen && stoppingSku && (
        <SixBigLossesModal
          isOpen={isStopModalOpen}
          onClose={() => {
            setIsStopModalOpen(false);
            setStoppingSku(null);
          }}
          skuId={stoppingSku.id}
          skuName={stoppingSku.name}
          skuCode={stoppingSku.code}
          startedAt={stoppingSku.startedAt}
          cartonsProducedDuringRun={stoppingSku.cartonsProducedTotal || 0}
          onConfirmStop={(stopData) => {
            handleConfirmStop(stopData);
            setIsStopModalOpen(false);
            setStoppingSku(null);
          }}
          showToast={showToast || (() => {})}
        />
      )}
    </div>
  );
};
