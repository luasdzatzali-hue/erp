import React, { useState, useMemo } from 'react';
import {
  ClipboardList,
  Calendar,
  Package,
  ShieldAlert,
  Boxes,
  Cylinder,
  Clock,
  Printer,
  RotateCcw,
  Factory,
  ArrowRight,
  Layers,
  CheckCircle2,
  MessageCircle
} from 'lucide-react';
import {
  AppState,
  ShiftNumber,
  LossCategoryType,
  StorageLocation,
  ProductionStopLog
} from '../../types';
import {
  getCurrentShift,
  getShiftFromTime,
  SHIFTS_CONFIG,
  formatIndonesianDate
} from '../../utils/shifts';
import { calculateUsageBreakdown } from '../../utils/reportBreakdown';
import { isWhatsAppEligibleSblCategory } from '../../utils/whatsappReport';
import { WhatsAppSblModal } from '../WhatsAppSblModal';

interface ShiftSummaryViewProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onOpenPdfModal?: () => void;
  showToast?: (msg: string, isError?: boolean) => void;
}

interface OutputLineSkuAgg {
  key: string;
  lineId: string;
  lineName: string;
  skuId: string;
  skuName: string;
  skuCode: string;
  isKite: boolean;
  cartonsProduced: number;
  plannedCartons: number;
  totalKgOutput: number;
  wipKgConsumed: number;
  logCount: number;
  status: 'RUNNING' | 'COMPLETED' | 'STOPPED_SBL' | 'STOPPED_SHORTAGE' | 'SHIFT_HANDOVER' | 'LOGGED';
  operators: string[];
}

interface MaterialConsumptionAgg {
  materialId: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  totalKg: number;
  totalBatches: number;
  usageEvents: number;
  locations: StorageLocation[];
  wipNames: string[];
  operators: string[];
}

interface TankConsumptionAgg {
  tankId: string;
  tankCode: string;
  tankName: string;
  tankType: string;
  wipName: string;
  totalDeductedKg: number;
  currentLevelKg: number;
}

const LOSS_TYPE_LABELS: Record<LossCategoryType, string> = {
  DOWNTIME: 'Downtime Loss',
  SPEED: 'Speed Loss',
  QUALITY: 'Quality Loss',
  PLANNED: 'Planned Loss'
};

export const ShiftSummaryView: React.FC<ShiftSummaryViewProps> = ({
  state,
  onSwitchTab,
  onOpenPdfModal,
  showToast
}) => {
  const liveShiftInfo = getCurrentShift();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedShift, setSelectedShift] = useState<ShiftNumber>(liveShiftInfo.shift);
  const [waModalState, setWaModalState] = useState<{
    stopLog?: ProductionStopLog;
    recapLogs?: ProductionStopLog[];
  } | null>(null);

  const shiftMeta = SHIFTS_CONFIG[selectedShift];
  const isViewingCurrentShift = selectedDate === todayStr && selectedShift === liveShiftInfo.shift;

  // 1. Filter Carton Production Logs for selected Date & Shift
  const shiftCartonLogs = useMemo(() => {
    return (state.transactions.cartonProductions || []).filter(cp => {
      const logDate = cp.timestamp.slice(0, 10);
      if (logDate !== selectedDate) return false;
      const logShift = cp.shift || getShiftFromTime(cp.timestamp).shift;
      return logShift === selectedShift;
    });
  }, [state.transactions.cartonProductions, selectedDate, selectedShift]);

  // 2. Filter SBL Stop Logs for selected Date & Shift
  const shiftStopLogs = useMemo(() => {
    return (state.transactions.productionStops || []).filter(stop => {
      const stopDate = stop.stoppedAt.slice(0, 10);
      if (stopDate !== selectedDate) return false;
      const stopShift = stop.shift || getShiftFromTime(stop.stoppedAt).shift;
      return stopShift === selectedShift;
    });
  }, [state.transactions.productionStops, selectedDate, selectedShift]);

  // 3. Filter Material Usages for selected Date & Shift
  const shiftUsages = useMemo(() => {
    return (state.transactions.usages || []).filter(u => {
      if (u.date !== selectedDate) return false;
      const uShift = u.shift || liveShiftInfo.shift;
      return uShift === selectedShift;
    });
  }, [state.transactions.usages, selectedDate, selectedShift, liveShiftInfo.shift]);

  // 4. Filter WIP Production Batches for selected Date & Shift
  const shiftWipBatches = useMemo(() => {
    return (state.transactions.wipBatches || []).filter(b => {
      const bDate = b.startedAt.slice(0, 10);
      if (bDate !== selectedDate) return false;
      const bShift = b.shift || getShiftFromTime(b.startedAt).shift;
      return bShift === selectedShift;
    });
  }, [state.transactions.wipBatches, selectedDate, selectedShift]);

  // 5. Aggregate Output by Line + SKU (combining carton logs + today's active/finished line runs for planning context)
  const outputByLineSku = useMemo<OutputLineSkuAgg[]>(() => {
    const map = new Map<string, OutputLineSkuAgg>();
    const activeRuns = state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : []);

    // Seed with active/recent runs on the selected date & shift
    activeRuns.forEach(run => {
      const runDate = run.startedAt.slice(0, 10);
      if (runDate !== selectedDate || run.shift !== selectedShift) return;
      const sku = state.master.skus.find(s => s.id === run.skuId);
      const lineId = run.lineId || 'unassigned';
      const lineName = run.lineName || 'Line Umum';
      const key = `${lineId}__${run.skuId}`;

      map.set(key, {
        key,
        lineId,
        lineName,
        skuId: run.skuId,
        skuName: sku?.name || run.skuName,
        skuCode: sku?.code || run.skuCode || 'SKU',
        isKite: Boolean(sku?.isKite),
        cartonsProduced: 0,
        plannedCartons: run.plannedCartons || (sku?.targetHour || 500) * 8,
        totalKgOutput: 0,
        wipKgConsumed: 0,
        logCount: 0,
        status: run.completionStatus || (run.isRunning ? 'RUNNING' : 'COMPLETED'),
        operators: run.operatorName ? [run.operatorName] : []
      });
    });

    // Add logged carton production records
    shiftCartonLogs.forEach(cp => {
      const sku = state.master.skus.find(s => s.id === cp.skuId);
      const lineId = cp.lineId || 'unassigned';
      const lineName = cp.lineName || 'Line Produksi';
      const key = `${lineId}__${cp.skuId}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          lineId,
          lineName,
          skuId: cp.skuId,
          skuName: sku?.name || cp.skuName,
          skuCode: sku?.code || cp.skuCode || 'SKU',
          isKite: Boolean(sku?.isKite),
          cartonsProduced: 0,
          plannedCartons: (sku?.targetHour || 500) * 8,
          totalKgOutput: 0,
          wipKgConsumed: 0,
          logCount: 0,
          status: 'LOGGED',
          operators: []
        });
      }

      const entry = map.get(key)!;
      entry.cartonsProduced += cp.cartonsProduced;
      entry.totalKgOutput += cp.cartonsProduced * (sku?.cartonWeightKg || 12);
      entry.wipKgConsumed += (cp.tankDeductions || []).reduce((s, d) => s + d.kgDeducted, 0);
      entry.logCount += 1;
      if (cp.operatorName && !entry.operators.includes(cp.operatorName)) {
        entry.operators.push(cp.operatorName);
      }
    });

    // If a seeded run had 0 logs yet, reflect its cartonsProducedTotal as fallback
    activeRuns.forEach(run => {
      const runDate = run.startedAt.slice(0, 10);
      if (runDate !== selectedDate || run.shift !== selectedShift) return;
      const key = `${run.lineId || 'unassigned'}__${run.skuId}`;
      const entry = map.get(key);
      if (entry && entry.cartonsProduced === 0 && (run.cartonsProducedTotal || 0) > 0) {
        const sku = state.master.skus.find(s => s.id === run.skuId);
        entry.cartonsProduced = run.cartonsProducedTotal;
        entry.totalKgOutput = run.cartonsProducedTotal * (sku?.cartonWeightKg || 12);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.lineName.localeCompare(b.lineName));
  }, [state.activeSkuRuns, state.activeSkuRun, state.master.skus, shiftCartonLogs, selectedDate, selectedShift]);

  // Output totals
  const totalOutputCartons = outputByLineSku.reduce((s, r) => s + r.cartonsProduced, 0);
  const totalPlannedCartons = outputByLineSku.reduce((s, r) => s + r.plannedCartons, 0);
  const totalOutputKg = outputByLineSku.reduce((s, r) => s + r.totalKgOutput, 0);
  const overallAttainmentPct =
    totalPlannedCartons > 0 ? Math.min(100, Math.round((totalOutputCartons / totalPlannedCartons) * 100)) : 0;

  // 6. Aggregate SBL Stop Metrics
  const totalDowntimeMinutes = shiftStopLogs.reduce((s, l) => s + l.durationMinutes, 0);
  const sblByCategory = useMemo(() => {
    const map = new Map<string, { label: string; lossType: LossCategoryType; count: number; minutes: number }>();
    shiftStopLogs.forEach(log => {
      const existing = map.get(log.category);
      if (existing) {
        existing.count += 1;
        existing.minutes += log.durationMinutes;
      } else {
        map.set(log.category, {
          label: log.categoryLabel,
          lossType: log.lossType,
          count: 1,
          minutes: log.durationMinutes
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
  }, [shiftStopLogs]);

  // 7. Aggregate Material Consumption (Raw Materials from Usages + Formula Breakdown)
  const materialConsumptionRows = useMemo<MaterialConsumptionAgg[]>(() => {
    const map = new Map<string, MaterialConsumptionAgg>();
    shiftUsages.forEach(u => {
      const mat = state.master.materials.find(m => m.id === u.materialId);
      const wip = state.master.wips.find(w => w.id === u.wipId);
      const existing = map.get(u.materialId);

      if (!existing) {
        map.set(u.materialId, {
          materialId: u.materialId,
          materialCode: mat?.code || `MAT-${u.materialId.slice(-4)}`,
          materialName: mat?.name || 'Material Tidak Dikenal',
          materialType: mat?.type || 'bubuk',
          totalKg: u.usageQty,
          totalBatches: u.batch || 0,
          usageEvents: 1,
          locations: u.sourceLocation ? [u.sourceLocation] : [],
          wipNames: wip ? [wip.name] : [],
          operators: u.operatorName ? [u.operatorName] : []
        });
      } else {
        existing.totalKg += u.usageQty;
        existing.totalBatches += u.batch || 0;
        existing.usageEvents += 1;
        if (u.sourceLocation && !existing.locations.includes(u.sourceLocation)) {
          existing.locations.push(u.sourceLocation);
        }
        if (wip && !existing.wipNames.includes(wip.name)) {
          existing.wipNames.push(wip.name);
        }
        if (u.operatorName && !existing.operators.includes(u.operatorName)) {
          existing.operators.push(u.operatorName);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [shiftUsages, state.master.materials, state.master.wips]);

  const usageGroups = useMemo(
    () => calculateUsageBreakdown(state, { dateString: selectedDate, shift: selectedShift }),
    [state, selectedDate, selectedShift]
  );

  const totalRawMaterialKg = materialConsumptionRows.reduce((s, m) => s + m.totalKg, 0);

  // 8. Aggregate WIP Holding/Storage Tank Depletion from Carton Output
  const tankConsumptionRows = useMemo<TankConsumptionAgg[]>(() => {
    const map = new Map<string, TankConsumptionAgg>();
    shiftCartonLogs.forEach(cp => {
      (cp.tankDeductions || []).forEach(ded => {
        const tankObj = state.master.tanks.find(t => t.id === ded.tankId);
        const existing = map.get(ded.tankId);
        if (!existing) {
          map.set(ded.tankId, {
            tankId: ded.tankId,
            tankCode: ded.tankCode,
            tankName: ded.tankName,
            tankType: ded.tankType,
            wipName: ded.wipName || 'WIP',
            totalDeductedKg: ded.kgDeducted,
            currentLevelKg: tankObj?.currentLevelKg ?? ded.remainingLevelKg
          });
        } else {
          existing.totalDeductedKg += ded.kgDeducted;
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.totalDeductedKg - a.totalDeductedKg);
  }, [shiftCartonLogs, state.master.tanks]);

  const totalWipDepletedKg = tankConsumptionRows.reduce((s, t) => s + t.totalDeductedKg, 0);

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* 1. HEADER & SHIFT SELECTOR BAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-bold text-white">
                  Ringkasan Produksi Shift
                </h2>
                {isViewingCurrentShift && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                    Shift Aktif Saat Ini
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Agregasi total output produksi karton, henti masalah (Six Big Losses), dan konsumsi material pada{' '}
                <strong className="text-slate-200">{shiftMeta.name}</strong> ({shiftMeta.timeRange}).
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls: Date, Shift Switcher, PDF & Navigation */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center space-x-1.5 bg-slate-950/70 border border-slate-800 rounded-xl px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayStr)}
              className="bg-transparent text-xs font-mono font-semibold text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center bg-slate-950/70 border border-slate-800 rounded-xl p-0.5">
            {([1, 2, 3] as ShiftNumber[]).map(sNum => (
              <button
                key={sNum}
                type="button"
                onClick={() => setSelectedShift(sNum)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedShift === sNum
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Shift {sNum}
              </button>
            ))}
          </div>

          {!isViewingCurrentShift && (
            <button
              type="button"
              onClick={() => {
                setSelectedDate(todayStr);
                setSelectedShift(liveShiftInfo.shift);
              }}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
              title="Kembali ke tanggal hari ini dan shift aktif sekarang"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span>Shift Kini</span>
            </button>
          )}

          {onOpenPdfModal && (
            <button
              type="button"
              onClick={onOpenPdfModal}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Selected Date Caption */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-400">
        <span>
          Periode ditampilkan:{' '}
          <strong className="text-white">
            {formatIndonesianDate(new Date(`${selectedDate}T12:00:00`))}
          </strong>{' '}
          · <strong className="text-cyan-300">{shiftMeta.name} ({shiftMeta.timeRange})</strong>
        </span>
        <button
          type="button"
          onClick={() => onSwitchTab('dashboard')}
          className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1 transition"
        >
          <span>Kembali ke Monitoring Line</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. EXECUTIVE KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Output */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Total Output Shift</span>
            <Package className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {totalOutputCartons.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 font-mono">karton</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${overallAttainmentPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
            <span>{totalOutputKg.toFixed(1)} kg produk jadi</span>
            <span className="text-emerald-400 font-semibold">
              {totalPlannedCartons > 0 ? `${overallAttainmentPct}% dr ${totalPlannedCartons.toLocaleString()}` : `${outputByLineSku.length} line`}
            </span>
          </div>
        </div>

        {/* KPI 2: Six Big Losses Stops */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Henti Masalah (Six Big Losses)</span>
            <ShieldAlert className={`w-4 h-4 ${shiftStopLogs.length > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${totalDowntimeMinutes > 0 ? 'text-rose-400' : 'text-white'}`}>
              {totalDowntimeMinutes}
            </span>
            <span className="text-xs text-slate-400 font-mono">menit downtime</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Jumlah kejadian stop:</span>
            <strong className="font-mono text-white tabular-nums">{shiftStopLogs.length} kejadian</strong>
          </div>
          <p className="text-[11px] text-slate-400 truncate">
            {sblByCategory[0]
              ? `Dominan: ${sblByCategory[0].label} (${sblByCategory[0].minutes} mnt)`
              : 'Tidak ada gangguan SBL tercatat'}
          </p>
        </div>

        {/* KPI 3: Konsumsi Bahan Baku (Material Usage) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Konsumsi Material Bahan Baku</span>
            <Boxes className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {totalRawMaterialKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-mono">kg RM</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Jenis material terpakai:</span>
            <strong className="font-mono text-amber-300 tabular-nums">{materialConsumptionRows.length} item</strong>
          </div>
          <p className="text-[11px] text-slate-400">
            {shiftUsages.length} transaksi pemakaian · {shiftWipBatches.length} batch WIP
          </p>
        </div>

        {/* KPI 4: Pemotongan WIP Holding Tank */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Pemotongan WIP Tangki (BOM)</span>
            <Cylinder className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-cyan-300 tabular-nums">
              {totalWipDepletedKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-slate-400 font-mono">kg WIP</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Tangki terintegrasi aktif:</span>
            <strong className="font-mono text-white tabular-nums">{tankConsumptionRows.length} tangki</strong>
          </div>
          <p className="text-[11px] text-slate-400">
            Terpotong otomatis dari output {totalOutputCartons.toLocaleString()} karton
          </p>
        </div>
      </div>

      {/* 3. SECTION A: OUTPUT PRODUKSI PER LINE & SKU */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <Factory className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                1. Rincian Output Produksi per Line &amp; SKU ({outputByLineSku.length} Baris)
              </h3>
              <p className="text-[11px] text-slate-400">
                Realisasi karton vs planning per shift beserta konsumsi WIP tangki masing-masing line.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
            Total: {totalOutputCartons.toLocaleString()} ktn ({totalOutputKg.toFixed(1)} kg)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-800 whitespace-nowrap">
                <th className="py-2.5 px-3">Line Produksi</th>
                <th className="py-2.5 px-3">SKU Produk</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Planning (Ktn)</th>
                <th className="py-2.5 px-3 text-right">Realisasi (Ktn)</th>
                <th className="py-2.5 px-3 text-right">Capaian</th>
                <th className="py-2.5 px-3 text-right">Bobot Output (Kg)</th>
                <th className="py-2.5 px-3 text-right">WIP Tangki (Kg)</th>
                <th className="py-2.5 px-3">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {outputByLineSku.length > 0 ? (
                outputByLineSku.map(row => {
                  const pct =
                    row.plannedCartons > 0
                      ? Math.min(100, Math.round((row.cartonsProduced / row.plannedCartons) * 100))
                      : 0;
                  return (
                    <tr key={row.key} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 font-bold text-cyan-300 whitespace-nowrap">
                        {row.lineName}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{row.skuName}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {row.skuCode}{row.isKite ? ' · KITE' : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.status === 'RUNNING' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            Berjalan
                          </span>
                        ) : row.status === 'STOPPED_SHORTAGE' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                            Material Shortage
                          </span>
                        ) : row.status === 'STOPPED_SBL' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                            Stop SBL
                          </span>
                        ) : row.status === 'SHIFT_HANDOVER' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                            Pergantian Shift
                          </span>
                        ) : row.status === 'COMPLETED' ? (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold">
                            Selesai
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold">
                            Tercatat
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                        {row.plannedCartons.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-white tabular-nums">
                        {row.cartonsProduced.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400 tabular-nums">
                        {pct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-200 tabular-nums">
                        {row.totalKgOutput.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-cyan-300 tabular-nums">
                        {row.wipKgConsumed.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] max-w-[160px] truncate">
                        {row.operators.length > 0 ? row.operators.join(', ') : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400 text-xs">
                    Belum ada output produksi karton tercatat pada {shiftMeta.name} tanggal {selectedDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. SECTION B: SIX BIG LOSSES (SBL) STOPS AGGREGATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                2. Henti Produksi &amp; Analisa Six Big Losses ({shiftStopLogs.length} Kejadian)
              </h3>
              <p className="text-[11px] text-slate-400">
                Rekap downtime dan klasifikasi kerugian OEE TPM pada shift terpilih.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {shiftStopLogs.some(l => isWhatsAppEligibleSblCategory(l.category)) && (
              <button
                type="button"
                onClick={() =>
                  setWaModalState({
                    recapLogs: shiftStopLogs.filter(l => isWhatsAppEligibleSblCategory(l.category))
                  })
                }
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>
                  Kirim Rekap SBL via WA (
                  {shiftStopLogs.filter(l => isWhatsAppEligibleSblCategory(l.category)).length})
                </span>
              </button>
            )}
            <span className="text-xs font-mono font-bold text-rose-300 tabular-nums">
              Total Downtime: {totalDowntimeMinutes} Menit
            </span>
          </div>
        </div>

        {/* Category breakdown strip */}
        {sblByCategory.length > 0 && (
          <div className="p-4 pb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 border-b border-slate-800/70 bg-slate-950/30">
            {sblByCategory.map((cat, idx) => {
              const sharePct =
                totalDowntimeMinutes > 0 ? Math.round((cat.minutes / totalDowntimeMinutes) * 100) : 0;
              return (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{cat.label}</span>
                    <span className="text-[10px] font-mono font-semibold text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded shrink-0">
                      {LOSS_TYPE_LABELS[cat.lossType]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>{cat.count} kejadian</span>
                    <span className="text-white font-bold">
                      {cat.minutes} mnt ({sharePct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full" style={{ width: `${sharePct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-800 whitespace-nowrap">
                <th className="py-2.5 px-3">Waktu Stop</th>
                <th className="py-2.5 px-3">Line</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Kategori Six Big Losses</th>
                <th className="py-2.5 px-3">Alasan Masalah</th>
                <th className="py-2.5 px-3 text-right">Durasi</th>
                <th className="py-2.5 px-3">Tindakan / PIC</th>
                <th className="py-2.5 px-3 text-center">Laporan WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {shiftStopLogs.length > 0 ? (
                shiftStopLogs
                  .slice()
                  .reverse()
                  .map(log => {
                    const canSendWa = isWhatsAppEligibleSblCategory(log.category);
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap tabular-nums">
                          {new Date(log.stoppedAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-cyan-300 whitespace-nowrap">
                          {log.lineName || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-white">
                          {log.skuName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                            {log.categoryLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-200 max-w-xs truncate">
                          {log.reasonTitle}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-300 tabular-nums whitespace-nowrap">
                          <div>{log.durationMinutes} mnt</div>
                          {log.resumedAt && log.estimatedRepairMinutes && (
                            <div className="text-[10px] font-normal text-emerald-400">
                              Est. {log.estimatedRepairMinutes}m → Aktual {log.actualRepairMinutes ?? log.durationMinutes}m
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {log.actionTaken || log.operatorName || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {canSendWa ? (
                            <button
                              type="button"
                              onClick={() => setWaModalState({ stopLog: log })}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg text-[10px] font-bold inline-flex items-center space-x-1 transition"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Kirim WA</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                    <span className="inline-flex items-center space-x-1.5 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Tidak ada kejadian stop masalah (SBL) pada {shiftMeta.name} tanggal {selectedDate}.</span>
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. SECTION C: MATERIAL CONSUMPTION & HOLDING TANK WIP DEPLETION */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* C1. Raw Material Consumption Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-amber-400" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  3A. Konsumsi Bahan Baku ({materialConsumptionRows.length} Material)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Pemakaian bahan baku aktual untuk produksi batch WIP pada shift ini.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-amber-300 tabular-nums">
              {totalRawMaterialKg.toFixed(2)} kg
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-800 whitespace-nowrap">
                  <th className="py-2.5 px-3">Material</th>
                  <th className="py-2.5 px-3">Digunakan di WIP</th>
                  <th className="py-2.5 px-3">Lokasi</th>
                  <th className="py-2.5 px-3 text-right">Batch</th>
                  <th className="py-2.5 px-3 text-right">Terpakai (Kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {materialConsumptionRows.length > 0 ? (
                  materialConsumptionRows.map(m => (
                    <tr key={m.materialId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{m.materialName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{m.materialCode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-[160px] truncate">
                        {m.wipNames.length > 0 ? m.wipNames.join(', ') : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-300">
                        {m.locations.join(', ') || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                        {m.totalBatches}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300 tabular-nums">
                        {m.totalKg.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 text-xs">
                      Belum ada pemakaian bahan baku (Work Order WIP) tercatat pada shift ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {usageGroups.length > 0 && (
            <div className="p-3 bg-slate-950/50 border-t border-slate-800 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span>
                Terdapat <strong className="text-white">{usageGroups.length}</strong> kelompok formulasi SKU/WIP pada shift ini.
              </span>
              <span className="font-mono text-amber-300 tabular-nums">
                {shiftUsages.length} entri pemakaian
              </span>
            </div>
          )}
        </div>

        {/* C2. WIP Holding & Storage Tank Depletion Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Cylinder className="w-4 h-4 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold text-white">
                  3B. Pemakaian WIP Holding Tank ({tankConsumptionRows.length} Tangki)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Akumulasi pengurangan massa WIP otomatis dari produksi karton SKU.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-cyan-300 tabular-nums">
              {totalWipDepletedKg.toFixed(2)} kg
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/70 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-800 whitespace-nowrap">
                  <th className="py-2.5 px-3">Tangki</th>
                  <th className="py-2.5 px-3">Jenis WIP</th>
                  <th className="py-2.5 px-3 text-right">Terpotong (Kg)</th>
                  <th className="py-2.5 px-3 text-right">Sisa Saat Ini (Kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {tankConsumptionRows.length > 0 ? (
                  tankConsumptionRows.map(t => (
                    <tr key={t.tankId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-white">{t.tankCode} · {t.tankName}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {t.tankType === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">{t.wipName}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-300 tabular-nums">
                        {t.totalDeductedKg.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                        {t.currentLevelKg.toFixed(1)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400 text-xs">
                      Belum ada pemotongan WIP tangki tercatat pada shift ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-950/50 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2">
            <span>
              Batch WIP pada shift ini: <strong className="text-white">{shiftWipBatches.length} batch</strong>
            </span>
            <button
              type="button"
              onClick={() => onSwitchTab('tank-monitoring')}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1 transition"
            >
              <span>Lihat Monitoring Tangki</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Unused icon suppression / Batch WIP Quick Summary if any active batches */}
      {shiftWipBatches.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs sm:text-sm font-bold text-white">
                Perintah Kerja Batch WIP pada {shiftMeta.name} ({shiftWipBatches.length})
              </h3>
            </div>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {shiftWipBatches.map(b => (
              <div
                key={b.id}
                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono font-bold text-purple-300 text-[11px]">{b.batchCode}</div>
                  <div className="font-semibold text-white truncate">{b.wipName}</div>
                  <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                    {b.batchWeightKg.toFixed(1)} kg · Op: {b.operatorName}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    b.status === 'SELESAI'
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : b.status === 'SEDANG_PRODUKSI'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {b.status === 'SELESAI' ? 'Selesai' : b.status === 'SEDANG_PRODUKSI' ? 'Proses' : 'Batal'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp SBL Report Modal */}
      {waModalState && (
        <WhatsAppSblModal
          isOpen={Boolean(waModalState)}
          onClose={() => setWaModalState(null)}
          stopLog={waModalState.stopLog}
          recapLogs={waModalState.recapLogs}
          recapDate={selectedDate}
          recapShift={selectedShift}
          showToast={showToast || (() => {})}
        />
      )}
    </div>
  );
};
