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
  MessageCircle,
  PackageX,
  Edit3,
  Trash2,
  Check,
  X,
  Lock
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
import {
  computeShiftVarianceAndSblSummary,
  getRejectCategoryLabel
} from '../../utils/rejectAnalytics';
import { useOptionalErp } from '../../context/ErpContext';
import { canMutateShiftRecord, resolveEffectiveRole } from '../../utils/roleAccess';
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

  const erp = useOptionalErp();
  const effectiveRole = erp ? erp.getEffectiveRoleForState(state) : resolveEffectiveRole(state);
  const canEditDowntime =
    Boolean(erp?.handleUpdateProductionStop && erp?.handleDeleteProductionStop) &&
    canMutateShiftRecord({
      effectiveRole,
      operation: 'EDIT_DOWNTIME',
      recordDate: selectedDate,
      recordShift: selectedShift,
      reasonNote: 'PRECHECK'
    }).allowed;

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStopMinutes, setEditStopMinutes] = useState<string>('');
  const [editStopReasonNote, setEditStopReasonNote] = useState<string>('');
  const [confirmDeleteStopId, setConfirmDeleteStopId] = useState<string | null>(null);
  const [deleteStopReasonNote, setDeleteStopReasonNote] = useState<string>('');

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

  const varianceAndSbl = useMemo(
    () => computeShiftVarianceAndSblSummary(state, selectedDate, selectedShift),
    [state, selectedDate, selectedShift]
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* 1. HEADER & SHIFT SELECTOR BAR */}
      <div className="bg-surface border border-border-subtle rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="p-2 rounded-xl bg-cyan-500/15 text-brand border border-cyan-500/30">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-bold text-ink-primary">
                  Ringkasan Produksi Shift
                </h2>
                {isViewingCurrentShift && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-ink-emerald border border-emerald-500/30 text-[11px] font-semibold">
                    Shift Aktif Saat Ini
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                Agregasi total output produksi karton, henti masalah (Six Big Losses), dan konsumsi material pada{' '}
                <strong className="text-ink-primary">{shiftMeta.name}</strong> ({shiftMeta.timeRange}).
              </p>
            </div>
          </div>
        </div>

        {/* Filter Controls: Date, Shift Switcher, PDF & Navigation */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center space-x-1.5 bg-canvas border border-border-subtle rounded-xl px-2.5 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || todayStr)}
              className="bg-transparent text-xs font-mono font-semibold text-ink-primary focus:outline-none"
            />
          </div>

          <div className="flex items-center bg-canvas border border-border-subtle rounded-xl p-0.5">
            {([1, 2, 3] as ShiftNumber[]).map(sNum => (
              <button
                key={sNum}
                type="button"
                onClick={() => setSelectedShift(sNum)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedShift === sNum
                    ? 'bg-cyan-600 text-white'
                    : 'text-ink-secondary hover:text-ink-primary'
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
              className="px-3 py-2 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
              title="Kembali ke tanggal hari ini dan shift aktif sekarang"
            >
              <RotateCcw className="w-3.5 h-3.5 text-brand" />
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
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-ink-secondary">
        <span>
          Periode ditampilkan:{' '}
          <strong className="text-ink-primary">
            {formatIndonesianDate(new Date(`${selectedDate}T12:00:00`))}
          </strong>{' '}
          · <strong className="text-brand">{shiftMeta.name} ({shiftMeta.timeRange})</strong>
        </span>
        <button
          type="button"
          onClick={() => onSwitchTab('dashboard')}
          className="text-brand hover:text-brand font-semibold flex items-center space-x-1 transition"
        >
          <span>Kembali ke Monitoring Line</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. EXECUTIVE KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* KPI 1: Total Output */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
            <span>Total Output Shift</span>
            <Package className="w-4 h-4 text-ink-emerald" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-ink-primary tabular-nums">
              {totalOutputCartons.toLocaleString()}
            </span>
            <span className="text-xs text-ink-secondary font-mono">karton</span>
          </div>
          <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${overallAttainmentPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-ink-secondary tabular-nums">
            <span>{totalOutputKg.toFixed(1)} kg produk jadi</span>
            <span className="text-ink-emerald font-semibold">
              {totalPlannedCartons > 0 ? `${overallAttainmentPct}% dr ${totalPlannedCartons.toLocaleString()}` : `${outputByLineSku.length} line`}
            </span>
          </div>
        </div>

        {/* KPI 2: Six Big Losses Stops + Quality/Speed Loss */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
            <span>Six Big Losses (3 Pilar)</span>
            <ShieldAlert className={`w-4 h-4 ${varianceAndSbl.sblThreePillar.totalLossMinutes > 0 ? 'text-ink-rose' : 'text-ink-muted'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold font-mono tabular-nums ${varianceAndSbl.sblThreePillar.totalLossMinutes > 0 ? 'text-ink-rose' : 'text-ink-primary'}`}>
              {varianceAndSbl.sblThreePillar.totalLossMinutes}
            </span>
            <span className="text-xs text-ink-secondary font-mono">menit total loss</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-secondary pt-1 font-mono tabular-nums">
            <span>Downtime: {totalDowntimeMinutes}m</span>
            <span>Speed: {varianceAndSbl.sblThreePillar.performanceLossMinutes}m</span>
            <span>Reject: {varianceAndSbl.sblThreePillar.qualityLossMinutes}m</span>
          </div>
          <p className="text-[11px] text-ink-secondary truncate">
            {varianceAndSbl.totalRejectKg > 0
              ? `Reject Material: ${varianceAndSbl.totalRejectKg.toFixed(2)} kg (-${varianceAndSbl.totalRejectEquivalentCartons.toFixed(1)} ktn)`
              : sblByCategory[0]
              ? `Dominan: ${sblByCategory[0].label} (${sblByCategory[0].minutes} mnt)`
              : 'Tidak ada gangguan SBL tercatat'}
          </p>
        </div>

        {/* KPI 3: Konsumsi Bahan Baku (Material Usage) */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
            <span>Konsumsi Material Bahan Baku</span>
            <Boxes className="w-4 h-4 text-ink-amber" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-ink-primary tabular-nums">
              {totalRawMaterialKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-ink-secondary font-mono">kg RM</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-secondary pt-1">
            <span>Jenis material terpakai:</span>
            <strong className="font-mono text-ink-amber tabular-nums">{materialConsumptionRows.length} item</strong>
          </div>
          <p className="text-[11px] text-ink-secondary">
            {shiftUsages.length} transaksi pemakaian · {shiftWipBatches.length} batch WIP
          </p>
        </div>

        {/* KPI 4: Pemotongan WIP Holding Tank */}
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-2 shadow-lg">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
            <span>Pemotongan WIP Tangki (BOM)</span>
            <Cylinder className="w-4 h-4 text-brand" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-brand tabular-nums">
              {totalWipDepletedKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-xs text-ink-secondary font-mono">kg WIP</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-secondary pt-1">
            <span>Tangki terintegrasi aktif:</span>
            <strong className="font-mono text-ink-primary tabular-nums">{tankConsumptionRows.length} tangki</strong>
          </div>
          <p className="text-[11px] text-ink-secondary">
            Terpotong otomatis dari output {totalOutputCartons.toLocaleString()} karton
          </p>
        </div>
      </div>

      {/* 3. SECTION A: OUTPUT PRODUKSI PER LINE & SKU */}
      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <Factory className="w-4 h-4 text-ink-emerald" />
            <div>
              <h3 className="text-sm font-bold text-ink-primary">
                1. Rincian Output Produksi per Line &amp; SKU ({outputByLineSku.length} Baris)
              </h3>
              <p className="text-[11px] text-ink-secondary">
                Realisasi karton vs planning per shift beserta konsumsi WIP tangki masing-masing line.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-ink-emerald tabular-nums">
            Total: {totalOutputCartons.toLocaleString()} ktn ({totalOutputKg.toFixed(1)} kg)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-[11px] font-bold text-ink-secondary uppercase border-b border-border-subtle whitespace-nowrap">
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
            <tbody className="divide-y divide-border-subtle">
              {outputByLineSku.length > 0 ? (
                outputByLineSku.map(row => {
                  const pct =
                    row.plannedCartons > 0
                      ? Math.min(100, Math.round((row.cartonsProduced / row.plannedCartons) * 100))
                      : 0;
                  return (
                    <tr key={row.key} className="hover:bg-elevated transition">
                      <td className="py-2.5 px-3 font-bold text-brand whitespace-nowrap">
                        {row.lineName}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink-primary">{row.skuName}</div>
                        <div className="text-[10px] font-mono text-ink-secondary">
                          {row.skuCode}{row.isKite ? ' · KITE' : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.status === 'RUNNING' ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-ink-emerald border border-emerald-500/30 text-[10px] font-bold">
                            Berjalan
                          </span>
                        ) : row.status === 'STOPPED_SHORTAGE' ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/15 text-ink-amber border border-amber-500/30 text-[10px] font-bold">
                            Material Shortage
                          </span>
                        ) : row.status === 'STOPPED_SBL' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-ink-rose border border-rose-500/30 text-[10px] font-bold">
                            Stop SBL
                          </span>
                        ) : row.status === 'SHIFT_HANDOVER' ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-ink-indigo border border-indigo-500/30 text-[10px] font-bold">
                            Pergantian Shift
                          </span>
                        ) : row.status === 'COMPLETED' ? (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-brand border border-cyan-500/30 text-[10px] font-bold">
                            Selesai
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-elevated text-ink-secondary border border-border-strong text-[10px] font-semibold">
                            Tercatat
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-secondary tabular-nums">
                        {row.plannedCartons.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-primary tabular-nums">
                        {row.cartonsProduced.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-emerald tabular-nums">
                        {pct}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-primary tabular-nums">
                        {row.totalKgOutput.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-brand tabular-nums">
                        {row.wipKgConsumed.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-ink-secondary text-[11px] max-w-[160px] truncate">
                        {row.operators.length > 0 ? row.operators.join(', ') : '-'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-ink-secondary text-xs">
                    Belum ada output produksi karton tercatat pada {shiftMeta.name} tanggal {selectedDate}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. SECTION B: SIX BIG LOSSES (SBL) STOPS AGGREGATION */}
      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <ShieldAlert className="w-4 h-4 text-ink-rose" />
            <div>
              <h3 className="text-sm font-bold text-ink-primary">
                2. Henti Produksi &amp; Analisa Six Big Losses ({shiftStopLogs.length} Kejadian)
              </h3>
              <p className="text-[11px] text-ink-secondary">
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
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/35 text-ink-emerald border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>
                  Kirim Rekap SBL via WA (
                  {shiftStopLogs.filter(l => isWhatsAppEligibleSblCategory(l.category)).length})
                </span>
              </button>
            )}
            <span className="text-xs font-mono font-bold text-ink-rose tabular-nums">
              Total SBL: {varianceAndSbl.sblThreePillar.totalLossMinutes} Menit
            </span>
          </div>
        </div>

        {/* 3-Pillar SBL Summary Strip */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-b border-border-subtle bg-canvas/60">
          <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1">
            <span className="text-[11px] font-bold text-ink-secondary uppercase">
              1. Downtime Loss (Availability)
            </span>
            <div className="text-lg font-bold font-mono tabular-nums text-ink-rose">
              {varianceAndSbl.sblThreePillar.availabilityLossMinutes} mnt
            </div>
            <p className="text-[11px] text-ink-secondary">
              {shiftStopLogs.filter(s => s.lossType === 'DOWNTIME').length} kejadian stop mesin/line
            </p>
          </div>
          <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1">
            <span className="text-[11px] font-bold text-ink-secondary uppercase">
              2. Speed Variance Loss (Performance)
            </span>
            <div className="text-lg font-bold font-mono tabular-nums text-ink-amber">
              {varianceAndSbl.sblThreePillar.performanceLossMinutes} mnt
            </div>
            <p className="text-[11px] text-ink-secondary font-mono tabular-nums">
              Defisit laju: {varianceAndSbl.sblThreePillar.performanceLossCartons.toLocaleString()} karton
            </p>
          </div>
          <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1">
            <span className="text-[11px] font-bold text-ink-secondary uppercase">
              3. Material / Product Reject Loss (Quality)
            </span>
            <div className="text-lg font-bold font-mono tabular-nums text-ink-purple">
              {varianceAndSbl.sblThreePillar.qualityLossMinutes} mnt
            </div>
            <p className="text-[11px] text-ink-secondary font-mono tabular-nums">
              {varianceAndSbl.sblThreePillar.qualityLossKg.toFixed(2)} kg reject (-
              {varianceAndSbl.sblThreePillar.qualityLossCartons.toFixed(1)} ktn eq)
            </p>
          </div>
        </div>

        {/* Category breakdown strip */}
        {sblByCategory.length > 0 && (
          <div className="p-4 pb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 border-b border-border-subtle bg-canvas">
            {sblByCategory.map((cat, idx) => {
              const sharePct =
                totalDowntimeMinutes > 0 ? Math.round((cat.minutes / totalDowntimeMinutes) * 100) : 0;
              return (
                <div
                  key={idx}
                  className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-ink-primary truncate">{cat.label}</span>
                    <span className="text-[10px] font-mono font-semibold text-ink-rose bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded shrink-0">
                      {LOSS_TYPE_LABELS[cat.lossType]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-ink-secondary tabular-nums">
                    <span>{cat.count} kejadian</span>
                    <span className="text-ink-primary font-bold">
                      {cat.minutes} mnt ({sharePct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
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
              <tr className="bg-canvas text-[11px] font-bold text-ink-secondary uppercase border-b border-border-subtle whitespace-nowrap">
                <th className="py-2.5 px-3">Waktu Stop</th>
                <th className="py-2.5 px-3">Line</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Kategori Six Big Losses</th>
                <th className="py-2.5 px-3">Alasan Masalah</th>
                <th className="py-2.5 px-3 text-right">Durasi</th>
                <th className="py-2.5 px-3">Tindakan / PIC</th>
                <th className="py-2.5 px-3 text-center">Laporan WA</th>
                <th className="py-2.5 px-3 text-center no-print">Koreksi OEE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {shiftStopLogs.length > 0 ? (
                shiftStopLogs
                  .slice()
                  .reverse()
                  .map(log => {
                    const canSendWa = isWhatsAppEligibleSblCategory(log.category);
                    const isEditingStop = editingStopId === log.id;
                    const isDeletingStop = confirmDeleteStopId === log.id;
                    return (
                      <tr key={log.id} className="hover:bg-elevated transition">
                        <td className="py-2.5 px-3 font-mono text-ink-secondary whitespace-nowrap tabular-nums">
                          {new Date(log.stoppedAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-brand whitespace-nowrap">
                          {log.lineName || '-'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-ink-primary">
                          {log.skuName}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-rose-500/15 text-ink-rose border border-rose-500/30 text-[10px] font-semibold">
                            {log.categoryLabel}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-ink-primary max-w-xs truncate">
                          {log.reasonTitle}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-rose tabular-nums whitespace-nowrap">
                          {isEditingStop ? (
                            <input
                              type="number"
                              min="0"
                              value={editStopMinutes}
                              onChange={e => setEditStopMinutes(e.target.value)}
                              className="w-20 bg-canvas border border-amber-500/70 rounded px-2 py-1 text-right text-xs font-mono text-ink-primary"
                            />
                          ) : (
                            <>
                              <div>{log.durationMinutes} mnt</div>
                              {log.resumedAt && log.estimatedRepairMinutes && (
                                <div className="text-[10px] font-normal text-ink-emerald">
                                  Est. {log.estimatedRepairMinutes}m → Aktual {log.actualRepairMinutes ?? log.durationMinutes}m
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-ink-secondary text-[11px]">
                          {log.actionTaken || log.operatorName || '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {canSendWa ? (
                            <button
                              type="button"
                              onClick={() => setWaModalState({ stopLog: log })}
                              className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-ink-emerald border border-emerald-500/40 rounded-lg text-[10px] font-bold inline-flex items-center space-x-1 transition"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>Kirim WA</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-600">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap no-print">
                          {!canEditDowntime ? (
                            <span
                              title="Hanya Supervisor, Unit Head, atau Administrator yang dapat mengoreksi/menghapus log downtime OEE"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-canvas border border-border-subtle text-[10px] font-mono text-ink-muted"
                            >
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>Terkunci</span>
                            </span>
                          ) : isEditingStop ? (
                            <div className="inline-flex flex-col items-end gap-1">
                              <input
                                type="text"
                                value={editStopReasonNote}
                                onChange={e => setEditStopReasonNote(e.target.value)}
                                placeholder="Alasan wajib (min 3 char)..."
                                className="w-36 bg-canvas border border-amber-500/70 rounded px-2 py-0.5 text-[10px] text-ink-primary"
                              />
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const mins = parseInt(editStopMinutes, 10);
                                    if (!Number.isFinite(mins) || mins < 0) {
                                      showToast?.('Durasi downtime harus berupa angka >= 0', true);
                                      return;
                                    }
                                    if (editStopReasonNote.trim().length < 3) {
                                      showToast?.('Catatan alasan wajib diisi (minimal 3 karakter)', true);
                                      return;
                                    }
                                    erp?.handleUpdateProductionStop(
                                      log.id,
                                      { durationMinutes: mins },
                                      editStopReasonNote.trim()
                                    );
                                    setEditingStopId(null);
                                    setEditStopReasonNote('');
                                  }}
                                  className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                                  title="Simpan Koreksi Downtime"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStopId(null);
                                    setEditStopReasonNote('');
                                  }}
                                  className="p-1 rounded bg-elevated text-ink-secondary"
                                  title="Batal"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : isDeletingStop ? (
                            <div className="inline-flex flex-col items-end gap-1">
                              <input
                                type="text"
                                value={deleteStopReasonNote}
                                onChange={e => setDeleteStopReasonNote(e.target.value)}
                                placeholder="Alasan hapus wajib..."
                                className="w-36 bg-canvas border border-rose-500/70 rounded px-2 py-0.5 text-[10px] text-ink-primary"
                              />
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (deleteStopReasonNote.trim().length < 3) {
                                      showToast?.('Catatan alasan hapus wajib diisi (minimal 3 karakter)', true);
                                      return;
                                    }
                                    erp?.handleDeleteProductionStop(log.id, deleteStopReasonNote.trim());
                                    setConfirmDeleteStopId(null);
                                    setDeleteStopReasonNote('');
                                  }}
                                  className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                                >
                                  Hapus
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDeleteStopId(null);
                                    setDeleteStopReasonNote('');
                                  }}
                                  className="px-2 py-0.5 rounded bg-elevated text-ink-secondary text-[10px]"
                                >
                                  Batal
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingStopId(log.id);
                                  setEditStopMinutes(String(log.durationMinutes));
                                  setEditStopReasonNote('');
                                  setConfirmDeleteStopId(null);
                                }}
                                className="p-1.5 rounded bg-elevated hover:bg-accent border border-border-subtle text-brand transition"
                                title="Edit Durasi Downtime OEE (Supervisor/Admin)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmDeleteStopId(log.id);
                                  setDeleteStopReasonNote('');
                                  setEditingStopId(null);
                                }}
                                className="p-1.5 rounded bg-elevated hover:bg-rose-500/20 border border-border-subtle text-ink-rose transition"
                                title="Hapus Log Downtime OEE (Supervisor/Admin)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-ink-secondary text-xs">
                    <span className="inline-flex items-center space-x-1.5 text-ink-emerald font-medium">
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
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-ink-amber" />
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  3A. Konsumsi Bahan Baku ({materialConsumptionRows.length} Material)
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  Pemakaian bahan baku aktual untuk produksi batch WIP pada shift ini.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-ink-amber tabular-nums">
              {totalRawMaterialKg.toFixed(2)} kg
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-[11px] font-bold text-ink-secondary uppercase border-b border-border-subtle whitespace-nowrap">
                  <th className="py-2.5 px-3">Material</th>
                  <th className="py-2.5 px-3">Digunakan di WIP</th>
                  <th className="py-2.5 px-3">Lokasi</th>
                  <th className="py-2.5 px-3 text-right">Batch</th>
                  <th className="py-2.5 px-3 text-right">Terpakai (Kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {materialConsumptionRows.length > 0 ? (
                  materialConsumptionRows.map(m => (
                    <tr key={m.materialId} className="hover:bg-elevated transition">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink-primary">{m.materialName}</div>
                        <div className="text-[10px] font-mono text-ink-secondary">{m.materialCode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-ink-secondary max-w-[160px] truncate">
                        {m.wipNames.length > 0 ? m.wipNames.join(', ') : '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-ink-secondary">
                        {m.locations.join(', ') || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-secondary tabular-nums">
                        {m.totalBatches}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-amber tabular-nums">
                        {m.totalKg.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ink-secondary text-xs">
                      Belum ada pemakaian bahan baku (Work Order WIP) tercatat pada shift ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {usageGroups.length > 0 && (
            <div className="p-3 bg-canvas border-t border-border-subtle text-[11px] text-ink-secondary flex flex-wrap items-center justify-between gap-2">
              <span>
                Terdapat <strong className="text-ink-primary">{usageGroups.length}</strong> kelompok formulasi SKU/WIP pada shift ini.
              </span>
              <span className="font-mono text-ink-amber tabular-nums">
                {shiftUsages.length} entri pemakaian
              </span>
            </div>
          )}
        </div>

        {/* C2. WIP Holding & Storage Tank Depletion Table */}
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 border-b border-border-subtle flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <Cylinder className="w-4 h-4 text-brand" />
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  3B. Pemakaian WIP Holding Tank ({tankConsumptionRows.length} Tangki)
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  Akumulasi pengurangan massa WIP otomatis dari produksi karton SKU.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-brand tabular-nums">
              {totalWipDepletedKg.toFixed(2)} kg
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-canvas text-[11px] font-bold text-ink-secondary uppercase border-b border-border-subtle whitespace-nowrap">
                  <th className="py-2.5 px-3">Tangki</th>
                  <th className="py-2.5 px-3">Jenis WIP</th>
                  <th className="py-2.5 px-3 text-right">Terpotong (Kg)</th>
                  <th className="py-2.5 px-3 text-right">Sisa Saat Ini (Kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {tankConsumptionRows.length > 0 ? (
                  tankConsumptionRows.map(t => (
                    <tr key={t.tankId} className="hover:bg-elevated transition">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink-primary">{t.tankCode} · {t.tankName}</div>
                        <div className="text-[10px] font-mono text-ink-secondary">
                          {t.tankType === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-ink-primary">{t.wipName}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-brand tabular-nums">
                        {t.totalDeductedKg.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-secondary tabular-nums">
                        {t.currentLevelKg.toFixed(1)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-ink-secondary text-xs">
                      Belum ada pemotongan WIP tangki tercatat pada shift ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-canvas border-t border-border-subtle text-[11px] text-ink-secondary flex items-center justify-between gap-2">
            <span>
              Batch WIP pada shift ini: <strong className="text-ink-primary">{shiftWipBatches.length} batch</strong>
            </span>
            <button
              type="button"
              onClick={() => onSwitchTab('tank-monitoring')}
              className="text-brand hover:text-brand font-semibold flex items-center space-x-1 transition"
            >
              <span>Lihat Monitoring Tangki</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* SECTION D: MATERIAL VARIANCE (BOM + REJECT) & REJECT LOGS */}
      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <PackageX className="w-4 h-4 text-ink-rose" />
            <div>
              <h3 className="text-sm font-bold text-ink-primary">
                4. Analisa Material Variance (Standar BOM + Reject Material) &amp; Quality Loss
              </h3>
              <p className="text-[11px] text-ink-secondary">
                Pemakaian Aktual = Standar BOM Output + Total Reject Material ({varianceAndSbl.shiftRejectLogs.length} entri reject tercatat).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-ink-secondary">
              Standar: <strong className="text-ink-primary">{varianceAndSbl.totalStandardBomKg.toFixed(2)} kg</strong>
            </span>
            <span className="text-ink-rose font-bold">
              Reject: +{varianceAndSbl.totalRejectKg.toFixed(2)} kg ({varianceAndSbl.overallMaterialVariancePct}%)
            </span>
            <span className="text-brand font-bold">
              Aktual: {varianceAndSbl.totalActualMaterialKg.toFixed(2)} kg
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-canvas text-[11px] font-bold text-ink-secondary uppercase border-b border-border-subtle whitespace-nowrap">
                <th className="py-2.5 px-3">Material</th>
                <th className="py-2.5 px-3 text-right">Standar BOM Output (Kg)</th>
                <th className="py-2.5 px-3 text-right">Total Reject (Kg)</th>
                <th className="py-2.5 px-3 text-right">Pemakaian Aktual (Kg)</th>
                <th className="py-2.5 px-3 text-right">Variance (%)</th>
                <th className="py-2.5 px-3 text-right">Ekuivalen Loss (Ktn)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {varianceAndSbl.materialVarianceRows.length > 0 ? (
                varianceAndSbl.materialVarianceRows.map(row => (
                  <tr key={row.materialId} className="hover:bg-elevated transition">
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-ink-primary">{row.materialName}</div>
                      <div className="text-[10px] font-mono text-ink-secondary">{row.materialCode}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-secondary tabular-nums">
                      {row.standardBomKg.toFixed(2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${row.rejectKg > 0 ? 'text-ink-rose' : 'text-ink-secondary'}`}>
                      {row.rejectKg.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-primary tabular-nums">
                      {row.actualKg.toFixed(2)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${row.variancePct > 0 ? 'text-ink-amber' : 'text-ink-emerald'}`}>
                      +{row.variancePct}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-purple tabular-nums">
                      {row.equivalentCartonsLoss.toFixed(2)} ktn
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-5 text-center text-ink-secondary text-xs">
                    Belum ada data Material Variance atau Reject Material pada shift ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {varianceAndSbl.shiftRejectLogs.length > 0 && (
          <div className="border-t border-border-subtle bg-canvas/50 p-4 space-y-2">
            <div className="text-xs font-bold text-ink-primary">
              Rincian Kejadian Reject Material ({varianceAndSbl.shiftRejectLogs.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {varianceAndSbl.shiftRejectLogs.map(rej => (
                <div
                  key={rej.id}
                  className="bg-surface border border-border-subtle rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-ink-primary truncate">
                      {rej.materialName} · <span className="text-ink-rose">{getRejectCategoryLabel(rej.rejectCategory)}</span>
                    </div>
                    <div className="text-[11px] font-mono text-ink-secondary truncate">
                      {rej.stationType === 'LINE' ? rej.lineName : rej.machineName} · {rej.operatorName} · {rej.sourceLocation}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-bold text-ink-rose">{rej.rejectQtyKg.toFixed(2)} kg</div>
                    <div className="text-[10px] text-ink-amber">-{rej.equivalentCartonsLoss.toFixed(2)} ktn</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unused icon suppression / Batch WIP Quick Summary if any active batches */}
      {shiftWipBatches.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-2.5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-ink-purple" />
              <h3 className="text-xs sm:text-sm font-bold text-ink-primary">
                Perintah Kerja Batch WIP pada {shiftMeta.name} ({shiftWipBatches.length})
              </h3>
            </div>
            <Clock className="w-4 h-4 text-ink-secondary" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
            {shiftWipBatches.map(b => (
              <div
                key={b.id}
                className="bg-canvas border border-border-subtle rounded-xl p-3 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono font-bold text-ink-purple text-[11px]">{b.batchCode}</div>
                  <div className="font-semibold text-ink-primary truncate">{b.wipName}</div>
                  <div className="text-[10px] text-ink-secondary font-mono tabular-nums">
                    {b.batchWeightKg.toFixed(1)} kg · Op: {b.operatorName}
                  </div>
                  {b.pauseLogs && b.pauseLogs.length > 0 && (
                    <div className="text-[10px] text-ink-sky truncate mt-0.5">
                      Jeda ({b.pauseLogs.length}x): {b.pauseLogs[b.pauseLogs.length - 1].reason}
                    </div>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                    b.status === 'SELESAI'
                      ? 'bg-emerald-500/15 text-ink-emerald border border-emerald-500/30'
                      : b.status === 'SEDANG_PRODUKSI'
                      ? 'bg-amber-500/15 text-ink-amber border border-amber-500/30'
                      : b.status === 'DIJEDA'
                      ? 'bg-tint-sky text-ink-sky border border-sky-700'
                      : 'bg-elevated text-ink-secondary'
                  }`}
                >
                  {b.status === 'SELESAI'
                    ? 'Selesai'
                    : b.status === 'SEDANG_PRODUKSI'
                    ? 'Proses'
                    : b.status === 'DIJEDA'
                    ? 'Dijeda'
                    : 'Batal'}
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
