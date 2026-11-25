import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  Clock,
  Target,
  Package,
  TrendingUp,
  ChevronRight,
  CheckCircle2,
  Play,
  Square,
  ShieldAlert,
  Plus,
  Cylinder,
  History,
  Factory,
  Lock,
  Settings2,
  X,
  AlertTriangle,
  Check,
  RotateCcw,
  Droplets,
  ArrowRightLeft,
  MessageCircle,
  Radio,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  AppState,
  ProductionLine,
  ActiveSkuProductionRun,
  ProductionStopLog,
  ShiftNumber,
  ChangeoverType
} from '../types';
import {
  getCurrentShift,
  getShiftPeriodInfo,
  SHIFTS_CONFIG,
  formatIndonesianDate
} from '../utils/shifts';
import { SixBigLossesModal } from './SixBigLossesModal';
import { WhatsAppSblModal } from './WhatsAppSblModal';
import {
  HoldingTankSelectionModal,
  PendingLineSkuAssignment
} from './HoldingTankSelectionModal';
import { ProductionLineManagerModal } from './ProductionLineManagerModal';
import {
  getAllTanksForWip,
  getSkuWipsWithMultipleHoldingTanks,
  checkRunHoldingTankAvailability
} from '../utils/skuTankHelper';
import { isWhatsAppEligibleSblCategory } from '../utils/whatsappReport';
import { DashboardLineStatusSnapshot } from '../utils/firebaseSync';
import { resolveEffectiveRole } from '../utils/roleAccess';

interface ProductionTargetPanelProps {
  state: AppState;
  liveLineStatus?: DashboardLineStatusSnapshot | null;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ) => { success: boolean; message: string };
  onStartSkuProduction?: (
    skuId: string,
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanks?: Record<string, string>,
    lineId?: string,
    plannedCartons?: number,
    shiftOverride?: ShiftNumber
  ) => void;
  onStartMultipleSkus?: (
    skuIds: string[],
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanksBySku?: Record<string, Record<string, string>>
  ) => void;
  onStartLineBatchRuns?: (
    assignments: {
      lineId: string;
      skuId: string;
      plannedCartons: number;
      shift?: ShiftNumber;
      operatorName?: string;
      speedMultiplier?: number;
      selectedHoldingTanks?: Record<string, string>;
    }[]
  ) => void;
  onCompleteLineRun?: (runIdOrLineId: string, notes?: string) => void;
  onResumeLineRun?: (runIdOrLineId: string) => void;
  onRecordMaterialShortage?: (runIdOrLineId: string, reasonMessage: string) => void;
  onUpdateRunHoldingTank?: (skuId: string, wipId: string, tankId: string, runId?: string) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onStopAllSkuProduction?: () => void;
  onTriggerShiftHandover?: () => void;
  onSetRunSpeedMultiplier?: (multiplier: number, runIdOrSkuId?: string) => void;
  onAddProductionLine?: (lineData: Omit<ProductionLine, 'id'>) => void;
  onUpdateProductionLine?: (lineId: string, updates: Partial<ProductionLine>) => void;
  onDeleteProductionLine?: (lineId: string) => void;
  onSetProductionLinesCount?: (count: number) => void;
  onChangeSku?: (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => void;
  showToast?: (msg: string, isError?: boolean) => void;
}

interface LineDraftPlan {
  skuId: string;
  plannedCartons: string;
}

const DEFAULT_FALLBACK_LINES: ProductionLine[] = [
  { id: 'line_a', code: 'LINE-A', name: 'Line A', description: 'Jalur Produksi Utama A', isActive: true },
  { id: 'line_b', code: 'LINE-B', name: 'Line B', description: 'Jalur Produksi B', isActive: true },
  { id: 'line_c', code: 'LINE-C', name: 'Line C', description: 'Jalur Produksi C', isActive: true },
  { id: 'line_d', code: 'LINE-D', name: 'Line D', description: 'Jalur Produksi D', isActive: true }
];

export const ProductionTargetPanel: React.FC<ProductionTargetPanelProps> = ({
  state,
  liveLineStatus,
  onSwitchTab,
  onProduceCartons,
  onStartSkuProduction,
  onStartLineBatchRuns,
  onCompleteLineRun,
  onResumeLineRun,
  onRecordMaterialShortage,
  onUpdateRunHoldingTank,
  onStopSkuProduction,
  onStopAllSkuProduction,
  onTriggerShiftHandover,
  onSetRunSpeedMultiplier,
  onAddProductionLine,
  onUpdateProductionLine,
  onDeleteProductionLine,
  onSetProductionLinesCount,
  showToast
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isManagement = effectiveRole.isManagement;
  const isAdmin = effectiveRole.isAdmin;
  const defaultOperator = state.currentSession?.name || 'Operator Line Produksi';

  // Live clock ticking every second (Kalender + Jam Aktual + Shift Produk)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const todayDateString = now.toISOString().slice(0, 10);
  const currentLiveShift = getCurrentShift(now);
  const shiftPeriod = getShiftPeriodInfo(now);
  const shiftRemHrs = Math.floor(shiftPeriod.remainingSeconds / 3600);
  const shiftRemMins = Math.floor((shiftPeriod.remainingSeconds % 3600) / 60);
  const shiftRemSecs = shiftPeriod.remainingSeconds % 60;
  const shiftCountdownLabel = `${String(shiftRemHrs).padStart(2, '0')}j ${String(shiftRemMins).padStart(2, '0')}m ${String(shiftRemSecs).padStart(2, '0')}d`;
  const liveClockFormatted = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const liveDateFormatted = formatIndonesianDate(now);

  // Registered production lines synchronized in real time across devices
  const productionLines: ProductionLine[] = useMemo(() => {
    const liveLines = liveLineStatus?.productionLines;
    if (liveLines && liveLines.length > 0) return liveLines;
    const lines = state.master.productionLines;
    return lines && lines.length > 0 ? lines : DEFAULT_FALLBACK_LINES;
  }, [liveLineStatus?.productionLines, state.master.productionLines]);

  // Active production runs synchronized in real time across devices
  const activeRuns: ActiveSkuProductionRun[] = useMemo(() => {
    if (liveLineStatus && Array.isArray(liveLineStatus.activeSkuRuns)) {
      return liveLineStatus.activeSkuRuns;
    }
    if (state.activeSkuRuns && state.activeSkuRuns.length > 0) {
      return state.activeSkuRuns;
    }
    if (state.activeSkuRun) {
      return [state.activeSkuRun];
    }
    return [];
  }, [liveLineStatus, state.activeSkuRuns, state.activeSkuRun]);

  const runningRuns = useMemo(() => activeRuns.filter(r => r.isRunning), [activeRuns]);

  const liveLineSyncTimeLabel = useMemo(() => {
    if (!liveLineStatus?.lastUpdatedAtIso) return null;
    const parsed = new Date(liveLineStatus.lastUpdatedAtIso);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }, [liveLineStatus?.lastUpdatedAtIso]);

  // Map lineId -> active running run (guarantees 1 line = max 1 active SKU)
  const runningByLineId = useMemo(() => {
    const map: Record<string, ActiveSkuProductionRun> = {};
    runningRuns.forEach((run, index) => {
      const key = run.lineId || productionLines[index]?.id || 'line_a';
      if (!map[key]) {
        map[key] = run;
      }
    });
    return map;
  }, [runningRuns, productionLines]);

  // Last completed/stopped run per line for standby context
  const lastFinishedByLineId = useMemo(() => {
    const map: Record<string, ActiveSkuProductionRun> = {};
    activeRuns
      .filter(r => !r.isRunning && r.lineId)
      .forEach(r => {
        if (r.lineId && !map[r.lineId]) {
          map[r.lineId] = r;
        }
      });
    return map;
  }, [activeRuns]);

  // Guided Flow Composer State (1. Pilih Line -> 2. Pilih SKU -> 3. Planning Karton/Shift -> 4. Start)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [draftPlansByLine, setDraftPlansByLine] = useState<Record<string, LineDraftPlan>>({});
  const [operatorInput, setOperatorInput] = useState<string>(defaultOperator);
  const [customCartonsInputByRun, setCustomCartonsInputByRun] = useState<Record<string, string>>({});
  const [isFlowComposerOpen, setIsFlowComposerOpen] = useState(true);

  // Modals State
  const [isLineManagerOpen, setIsLineManagerOpen] = useState(false);
  const [showStopHistory, setShowStopHistory] = useState(false);

  // Pending Holding Tank choices before batch start
  const [pendingTankModalAssignments, setPendingTankModalAssignments] = useState<
    | {
        assignments: {
          lineId: string;
          lineName: string;
          skuId: string;
          plannedCartons: number;
          shift: ShiftNumber;
        }[];
      }
    | null
  >(null);

  // Stop/Completion Decision modal (Normal Selesai vs Problem Six Big Losses)
  const [stopChoiceRun, setStopChoiceRun] = useState<ActiveSkuProductionRun | null>(null);
  const [normalFinishNotes, setNormalFinishNotes] = useState<string>('');

  // Six Big Losses Modal target
  const [sblModalTarget, setSblModalTarget] = useState<{
    skuId: string;
    skuName: string;
    skuCode?: string;
    lineId?: string;
    lineName?: string;
    startedAt?: string;
    cartonsProducedTotal?: number;
  } | null>(null);

  // WhatsApp SBL Report Modal target
  const [waModalTarget, setWaModalTarget] = useState<{
    stopLog: Omit<ProductionStopLog, 'id'> | ProductionStopLog;
    initialPhone?: string;
  } | null>(null);

  // Metrics Filter: 'ALL', or lineId / skuId
  const [metricScope, setMetricScope] = useState<string>('ALL');

  // Auto-prune selectedLineIds if a line started running or was deleted
  useEffect(() => {
    setSelectedLineIds(prev =>
      prev.filter(
        id =>
          productionLines.some(l => l.id === id) &&
          !runningByLineId[id]
      )
    );
  }, [productionLines, runningByLineId]);

  // Helper to get default planning carton count (8 jam shift) for an SKU
  const getDefaultShiftPlanForSku = (skuId: string): number => {
    const sku = state.master.skus.find(s => s.id === skuId);
    return (sku?.targetHour || 500) * 8;
  };

  // Toggle line selection in Guided Flow Step 1
  const handleToggleLineSelection = (lineId: string) => {
    if (isManagement) return;
    if (runningByLineId[lineId]) {
      const activeRun = runningByLineId[lineId];
      showToast?.(
        `Line sedang aktif memproduksi "${activeRun.skuName}". Tunggu selesai atau hentikan dahulu sebelum mengganti SKU.`,
        true
      );
      return;
    }

    setSelectedLineIds(prev => {
      if (prev.includes(lineId)) {
        return prev.filter(id => id !== lineId);
      }
      // Ensure draft plan exists for this line
      const fallbackSku = state.master.skus[0];
      if (fallbackSku && !draftPlansByLine[lineId]) {
        setDraftPlansByLine(dp => ({
          ...dp,
          [lineId]: {
            skuId: fallbackSku.id,
            plannedCartons: String(getDefaultShiftPlanForSku(fallbackSku.id))
          }
        }));
      }
      return [...prev, lineId];
    });
  };

  const standbyLines = useMemo(
    () => productionLines.filter(l => l.isActive && !runningByLineId[l.id]),
    [productionLines, runningByLineId]
  );

  const handleSelectAllStandbyLines = () => {
    if (standbyLines.length === 0) return;
    if (selectedLineIds.length === standbyLines.length) {
      setSelectedLineIds([]);
      return;
    }
    const fallbackSku = state.master.skus[0];
    if (fallbackSku) {
      setDraftPlansByLine(prev => {
        const next = { ...prev };
        standbyLines.forEach(line => {
          if (!next[line.id]) {
            next[line.id] = {
              skuId: fallbackSku.id,
              plannedCartons: String(getDefaultShiftPlanForSku(fallbackSku.id))
            };
          }
        });
        return next;
      });
    }
    setSelectedLineIds(standbyLines.map(l => l.id));
  };

  const handleUpdateDraftSku = (lineId: string, skuId: string) => {
    setDraftPlansByLine(prev => ({
      ...prev,
      [lineId]: {
        skuId,
        plannedCartons: String(getDefaultShiftPlanForSku(skuId))
      }
    }));
  };

  const handleUpdateDraftPlannedCartons = (lineId: string, value: string) => {
    setDraftPlansByLine(prev => ({
      ...prev,
      [lineId]: {
        skuId: prev[lineId]?.skuId || state.master.skus[0]?.id || '',
        plannedCartons: value
      }
    }));
  };

  // Copy first selected line's SKU & Planning to all other selected lines (convenient for parallel same-SKU runs)
  const handleApplyFirstPlanToAllSelected = () => {
    if (selectedLineIds.length < 2) return;
    const firstPlan = draftPlansByLine[selectedLineIds[0]];
    if (!firstPlan) return;
    setDraftPlansByLine(prev => {
      const next = { ...prev };
      selectedLineIds.forEach(lineId => {
        next[lineId] = { ...firstPlan };
      });
      return next;
    });
    showToast?.('SKU dan Planning Karton diterapkan ke semua line terpilih.');
  };

  // Start flow Step 4: validate, prompt Holding Tank selection if any BOM WIP has >=2 Holding Tanks, else execute
  const handleInitiateBatchStart = () => {
    if (selectedLineIds.length === 0) {
      showToast?.('Pilih minimal 1 Line Produksi terlebih dahulu.', true);
      return;
    }
    if (state.master.skus.length === 0) {
      showToast?.('Belum ada SKU di Master BOM. Tambahkan SKU terlebih dahulu.', true);
      return;
    }

    const builtAssignments: {
      lineId: string;
      lineName: string;
      skuId: string;
      plannedCartons: number;
      shift: ShiftNumber;
    }[] = [];

    for (const lineId of selectedLineIds) {
      const lineObj = productionLines.find(l => l.id === lineId);
      const draft = draftPlansByLine[lineId];
      const skuId = draft?.skuId || state.master.skus[0]?.id || '';
      const skuObj = state.master.skus.find(s => s.id === skuId);
      const plannedCartons = parseInt(draft?.plannedCartons || '0', 10);

      if (!lineObj || !skuObj) {
        showToast?.(`Pastikan SKU untuk ${lineObj?.name || 'Line'} sudah dipilih.`, true);
        return;
      }
      const linkedWips = state.master.skuWips.filter(sw => sw.skuId === skuObj.id);
      if (linkedWips.length === 0) {
        showToast?.(
          `SKU "${skuObj.name}" (${lineObj.name}) belum memiliki relasi WIP di Master BOM.`,
          true
        );
        return;
      }
      if (isNaN(plannedCartons) || plannedCartons <= 0) {
        showToast?.(
          `Masukkan jumlah planning karton yang valid untuk ${lineObj.name}.`,
          true
        );
        return;
      }

      builtAssignments.push({
        lineId: lineObj.id,
        lineName: lineObj.name,
        skuId: skuObj.id,
        plannedCartons,
        shift: currentLiveShift.shift
      });
    }

    // Check if any assignment requires choosing among >= 2 Holding Tanks
    const needsTankChoice = builtAssignments.some(
      a => getSkuWipsWithMultipleHoldingTanks(a.skuId, state).length > 0
    );

    if (needsTankChoice) {
      setPendingTankModalAssignments({ assignments: builtAssignments });
      return;
    }

    executeBatchStart(builtAssignments, {});
  };

  const executeBatchStart = (
    assignments: {
      lineId: string;
      lineName: string;
      skuId: string;
      plannedCartons: number;
      shift: ShiftNumber;
    }[],
    holdingTankSelectionsByLineId: Record<string, Record<string, string>>
  ) => {
    if (onStartLineBatchRuns) {
      onStartLineBatchRuns(
        assignments.map(a => ({
          lineId: a.lineId,
          skuId: a.skuId,
          plannedCartons: a.plannedCartons,
          shift: a.shift,
          operatorName: operatorInput,
          speedMultiplier: 1,
          selectedHoldingTanks: holdingTankSelectionsByLineId[a.lineId]
        }))
      );
    } else if (onStartSkuProduction) {
      assignments.forEach(a =>
        onStartSkuProduction(
          a.skuId,
          operatorInput,
          1,
          holdingTankSelectionsByLineId[a.lineId],
          a.lineId,
          a.plannedCartons,
          a.shift
        )
      );
    }

    setSelectedLineIds([]);
  };

  // Linked WIPs + Holding & Storage tanks per SKU
  const getLinkedWipBreakdown = (skuId: string) => {
    const sws = state.master.skuWips.filter(sw => sw.skuId === skuId);
    return sws.map(sw => {
      const wip = state.master.wips.find(w => w.id === sw.wipId);
      const integratedTanks = getAllTanksForWip(wip, state.master.tanks);
      return {
        skuWip: sw,
        wip,
        integratedTanks,
        kgPerCarton: sw.kgWipPerCartonSku
      };
    });
  };

  // Manual Carton Output Deduction scoped to exact Line Run
  const handleManualCartonDeduction = (run: ActiveSkuProductionRun, qty: number) => {
    if (!onProduceCartons || qty <= 0) return;
    const sku = state.master.skus.find(s => s.id === run.skuId);
    if (!sku) return;

    const res = onProduceCartons(
      sku.id,
      qty,
      operatorInput,
      `Output manual +${qty} ktn [${run.lineName || 'Line'} · ${sku.name}] (Shift ${run.shift || currentLiveShift.shift})`,
      run.selectedHoldingTanks,
      run.id,
      run.lineId,
      run.lineName
    );
    if (!res.success && onRecordMaterialShortage) {
      const availability = checkRunHoldingTankAvailability(run.skuId, state, run.selectedHoldingTanks);
      if (!availability.isReady) {
        onRecordMaterialShortage(run.id || run.lineId || run.skuId, res.message);
        return;
      }
    }
    showToast?.(res.message, !res.success);
  };

  // Pending assignments structured for HoldingTankSelectionModal
  const modalPendingAssignments: PendingLineSkuAssignment[] = useMemo(() => {
    if (!pendingTankModalAssignments) return [];
    return pendingTankModalAssignments.assignments.map(a => ({
      key: a.lineId,
      lineId: a.lineId,
      lineName: a.lineName,
      skuId: a.skuId,
      plannedCartons: a.plannedCartons
    }));
  }, [pendingTankModalAssignments]);

  // Daily stop logs (TPM SBL)
  const stopLogsToday = (state.transactions.productionStops || []).filter(s =>
    s.stoppedAt.includes(todayDateString)
  );
  const totalDowntimeMinutes = stopLogsToday.reduce((sum, s) => sum + s.durationMinutes, 0);

  // Metrics Scope Calculations
  const metricLineObj = productionLines.find(l => l.id === metricScope);
  const actualCartonLogsToday = useMemo(() => {
    return (state.transactions.cartonProductions || []).filter(cp => {
      if (!cp.timestamp.includes(todayDateString)) return false;
      if (metricScope === 'ALL') return true;
      if (metricLineObj) return cp.lineId === metricLineObj.id;
      return cp.skuId === metricScope;
    });
  }, [state.transactions.cartonProductions, todayDateString, metricScope, metricLineObj]);

  const finalCartonsToday = actualCartonLogsToday.reduce((sum, cp) => sum + cp.cartonsProduced, 0);

  const shiftCartons: Record<ShiftNumber, number> = {
    1: actualCartonLogsToday.filter(c => c.shift === 1).reduce((s, c) => s + c.cartonsProduced, 0),
    2: actualCartonLogsToday.filter(c => c.shift === 2).reduce((s, c) => s + c.cartonsProduced, 0),
    3: actualCartonLogsToday.filter(c => c.shift === 3).reduce((s, c) => s + c.cartonsProduced, 0)
  };

  // Daily target based on planned shift targets of active runs or active lines capacity
  const scopedRunningRuns = useMemo(() => {
    if (metricScope === 'ALL') return runningRuns;
    if (metricLineObj) return runningRuns.filter(r => r.lineId === metricLineObj.id);
    return runningRuns.filter(r => r.skuId === metricScope);
  }, [runningRuns, metricScope, metricLineObj]);

  const totalActiveShiftPlanned = scopedRunningRuns.reduce(
    (sum, r) => sum + (r.plannedCartons || (r.targetPerHour || 500) * 8),
    0
  );
  const totalActiveRealized = scopedRunningRuns.reduce(
    (sum, r) => sum + (r.cartonsProducedTotal || 0),
    0
  );

  const aggregateDailyTargetCartons = useMemo(() => {
    if (metricLineObj) {
      const lineRun = runningByLineId[metricLineObj.id];
      const sku = lineRun ? state.master.skus.find(s => s.id === lineRun.skuId) : state.master.skus[0];
      return (sku?.targetHour || 500) * 8 * 3;
    }
    if (scopedRunningRuns.length > 0) {
      return scopedRunningRuns.reduce((sum, r) => sum + (r.targetPerHour || 500) * 8 * 3, 0);
    }
    const avgHourly =
      state.master.skus.length > 0
        ? state.master.skus.reduce((s, x) => s + (x.targetHour || 500), 0) / state.master.skus.length
        : 500;
    return Math.round(avgHourly * 8 * 3 * productionLines.length);
  }, [metricLineObj, runningByLineId, scopedRunningRuns, state.master.skus, productionLines.length]);

  const aggregateTargetPerShift = Math.round(aggregateDailyTargetCartons / 3);
  const overallProgressPercent =
    totalActiveShiftPlanned > 0
      ? Math.min(100, Math.round((totalActiveRealized / totalActiveShiftPlanned) * 100))
      : Math.min(100, Math.round((finalCartonsToday / (aggregateDailyTargetCartons || 1)) * 100));

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl p-4 sm:p-5 space-y-5 shadow-xl no-print">
      {/* 1. COCKPIT HEADER: Kalender, Jam Aktual, Shift Produk & Line Produksi */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-border-subtle pb-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-ink-primary flex items-center space-x-2">
              <Factory className="w-5 h-5 text-brand shrink-0" />
              <span>Kontrol Produksi SKU Per Line</span>
            </h2>
            <span className="text-[11px] font-mono font-semibold text-brand bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-lg">
              {runningRuns.length} / {productionLines.length} Line Aktif · {standbyLines.length} Standby
            </span>
            <span
              className="text-[11px] font-mono font-semibold text-ink-emerald bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg inline-flex items-center space-x-1.5"
              title="Status ketersediaan line dan progres SKU disinkronkan real-time ke seluruh perangkat"
            >
              <Radio className="w-3 h-3 text-ink-emerald animate-pulse" />
              <span>
                Live Sync{liveLineSyncTimeLabel ? ` · ${liveLineSyncTimeLabel}` : ''}
              </span>
            </span>
          </div>
          <p className="text-xs text-ink-secondary">
            1 Line hanya menjalankan 1 SKU hingga selesai/stop. Line berbeda dapat menjalankan SKU yang sama atau berbeda secara bersamaan dengan pemotongan Holding Tank real-time.
          </p>
        </div>

        {/* Live Telemetry Strip: Kalender, Jam Aktual, Shift Produk, Atur Line */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-stretch gap-2">
          {/* Kalender */}
          <div className="bg-canvas border border-border-subtle rounded-xl px-3 py-2 flex items-center space-x-2.5">
            <CalendarDays className="w-4 h-4 text-brand shrink-0" />
            <div>
              <span className="text-[10px] text-ink-secondary block leading-none">Kalender</span>
              <span className="text-xs font-semibold text-ink-primary whitespace-nowrap">{liveDateFormatted}</span>
            </div>
          </div>

          {/* Jam Aktual Live */}
          <div className="bg-canvas border border-border-subtle rounded-xl px-3 py-2 flex items-center space-x-2.5">
            <Clock className="w-4 h-4 text-ink-emerald shrink-0" />
            <div>
              <span className="text-[10px] text-ink-secondary block leading-none">Jam Aktual</span>
              <span className="text-xs sm:text-sm font-mono font-bold text-ink-emerald tabular-nums">
                {liveClockFormatted}
              </span>
            </div>
          </div>

          {/* Shift Produk & Hitung Mundur Pergantian Shift */}
          <div className="bg-canvas border border-border-subtle rounded-xl px-3 py-2 flex items-center space-x-2">
            <div>
              <span className="text-[10px] text-ink-secondary block leading-none">
                Shift Aktif · Auto Handover ke Shift {shiftPeriod.nextShift} dlm{' '}
                <strong className="text-brand font-mono tabular-nums">{shiftCountdownLabel}</strong>
              </span>
              <span className="text-xs font-bold text-ink-amber font-mono whitespace-nowrap">
                {currentLiveShift.name} · {currentLiveShift.timeRange}
              </span>
            </div>
          </div>

          {/* Customize Line Produksi Button (Administrator Only) */}
          {isAdmin && onAddProductionLine && onUpdateProductionLine && onDeleteProductionLine && onSetProductionLinesCount && (
            <button
              type="button"
              onClick={() => setIsLineManagerOpen(true)}
              className="px-3.5 py-2 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition active:scale-95"
            >
              <Settings2 className="w-4 h-4 text-brand" />
              <span>Atur Line ({productionLines.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. GUIDED PRODUCTION FLOW COMPOSER (Alur 1 -> 2 -> 3 -> 4) */}
      {!isManagement && (
        <div className="bg-canvas border border-border-subtle rounded-2xl p-4 space-y-4">
          {/* Flow Step Header */}
          <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${isFlowComposerOpen ? 'border-b border-border-subtle pb-3' : ''}`}>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-ink-primary flex items-center space-x-2">
                <span>Alur Mulai Produksi</span>
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-secondary mt-1">
                <span className={selectedLineIds.length > 0 ? 'text-brand font-semibold' : 'text-ink-secondary font-medium'}>
                  1. Pilih Line Produksi
                </span>
                <span>→</span>
                <span className={selectedLineIds.length > 0 ? 'text-brand font-semibold' : 'text-ink-secondary'}>
                  2. Tentukan SKU (bisa sama/berbeda)
                </span>
                <span>→</span>
                <span className={selectedLineIds.length > 0 ? 'text-brand font-semibold' : 'text-ink-secondary'}>
                  3. Planning Karton/Shift
                </span>
                <span>→</span>
                <span className={selectedLineIds.length > 0 ? 'text-ink-emerald font-semibold' : 'text-ink-secondary'}>
                  4. Start Produksi
                </span>
              </div>
            </div>

            {/* Active Shift Badge (Auto synced to live shift clock) & Operator Field */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center space-x-1.5 bg-surface border border-border-subtle rounded-xl px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                <span className="text-[11px] text-ink-secondary">Shift Otomatis:</span>
                <span className="text-xs font-bold text-ink-amber font-mono">
                  {currentLiveShift.shortLabel} ({currentLiveShift.timeRange})
                </span>
              </div>

              {isFlowComposerOpen && (
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  placeholder="Nama Operator..."
                  className="bg-surface border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary w-44"
                />
              )}

              <button
                type="button"
                onClick={() => setIsFlowComposerOpen(prev => !prev)}
                aria-expanded={isFlowComposerOpen}
                className="px-2.5 py-1.5 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 transition"
              >
                {isFlowComposerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>{isFlowComposerOpen ? 'Tutup Form' : 'Buka Form'}</span>
              </button>
            </div>
          </div>

          {isFlowComposerOpen && (
            <>

          {/* Step 1: Select Production Lines */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink-secondary">
                Langkah 1 — Pilih Line Produksi ({standbyLines.length} Standby dari {productionLines.length} Line):
              </span>
              {standbyLines.length > 1 && (
                <button
                  type="button"
                  onClick={handleSelectAllStandbyLines}
                  className="text-[11px] font-semibold text-brand hover:text-brand transition"
                >
                  {selectedLineIds.length === standbyLines.length
                    ? 'Batalkan Semua Pilihan'
                    : `Pilih Semua Line Standby (${standbyLines.length})`}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {productionLines.map(line => {
                const activeRun = runningByLineId[line.id];
                const isBusy = Boolean(activeRun);
                const isSelected = selectedLineIds.includes(line.id);

                return (
                  <button
                    key={line.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleLineSelection(line.id)}
                    className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between min-h-[68px] ${
                      isBusy
                        ? 'bg-surface border-emerald-500/30 opacity-75 cursor-not-allowed'
                        : isSelected
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-sm'
                        : 'bg-surface border-border-subtle hover:border-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="font-bold text-xs text-ink-primary truncate">{line.name}</span>
                      {isBusy ? (
                        <Lock className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
                      ) : isSelected ? (
                        <span className="w-4 h-4 rounded bg-cyan-500 text-slate-950 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded border border-border-strong shrink-0" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] mt-1 truncate w-full ${
                        isBusy
                          ? 'text-ink-emerald font-medium'
                          : isSelected
                          ? 'text-brand font-medium'
                          : 'text-ink-secondary'
                      }`}
                    >
                      {isBusy ? `Aktif: ${activeRun.skuName}` : 'Standby · Klik pilih'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2 & 3: Assign SKU & Planning per Selected Line */}
          {selectedLineIds.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border-subtle">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-secondary">
                  Langkah 2 &amp; 3 — Tentukan SKU &amp; Planning Karton per Shift ({selectedLineIds.length} Line Terpilih):
                </span>
                {selectedLineIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={handleApplyFirstPlanToAllSelected}
                    className="text-[11px] font-semibold text-brand hover:text-brand transition"
                  >
                    Samakan SKU &amp; Planning ke Semua Line Terpilih
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {selectedLineIds.map(lineId => {
                  const lineObj = productionLines.find(l => l.id === lineId);
                  if (!lineObj) return null;
                  const draft = draftPlansByLine[lineId] || {
                    skuId: state.master.skus[0]?.id || '',
                    plannedCartons: String(getDefaultShiftPlanForSku(state.master.skus[0]?.id || ''))
                  };
                  const chosenSku = state.master.skus.find(s => s.id === draft.skuId);
                  const wips = chosenSku ? getLinkedWipBreakdown(chosenSku.id) : [];
                  const multiHtCount = chosenSku ? getSkuWipsWithMultipleHoldingTanks(chosenSku.id, state).length : 0;
                  const fullShiftQty = (chosenSku?.targetHour || 500) * 8;
                  const halfShiftQty = Math.round(fullShiftQty / 2);

                  return (
                    <div
                      key={lineId}
                      className="bg-surface border border-border-subtle rounded-xl p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center"
                    >
                      {/* Line Label */}
                      <div className="lg:col-span-2 flex items-center justify-between lg:justify-start gap-2">
                        <div>
                          <span className="text-xs font-bold text-ink-primary block">{lineObj.name}</span>
                          <span className="text-[10px] font-mono text-ink-secondary">{lineObj.code}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleLineSelection(lineId)}
                          className="lg:hidden text-ink-secondary hover:text-ink-rose p-1"
                          title="Batalkan pilih line"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* SKU Selector (Same SKU across multiple lines IS supported) */}
                      <div className="lg:col-span-4 space-y-1">
                        <label className="text-[10px] text-ink-secondary block">SKU yang Diproduksi</label>
                        <select
                          value={draft.skuId}
                          onChange={(e) => handleUpdateDraftSku(lineId, e.target.value)}
                          className="w-full bg-canvas border border-border-strong rounded-lg px-2.5 py-2 text-xs font-semibold text-ink-primary focus:outline-none focus:border-accent-primary"
                        >
                          {state.master.skus.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.code || 'SKU'}) · {s.targetHour} ktn/jam
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Planning Karton / Shift */}
                      <div className="lg:col-span-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] text-ink-secondary">Planning (Ktn / Shift)</label>
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateDraftPlannedCartons(lineId, String(halfShiftQty))}
                              className="text-[10px] text-brand hover:text-brand font-mono px-1"
                              title="Setengah Shift (4 Jam)"
                            >
                              ½ Shift
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateDraftPlannedCartons(lineId, String(fullShiftQty))}
                              className="text-[10px] text-brand hover:text-brand font-mono px-1"
                              title="1 Shift Penuh (8 Jam)"
                            >
                              1 Shift
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.plannedCartons}
                            onChange={(e) => handleUpdateDraftPlannedCartons(lineId, e.target.value)}
                            className="w-full bg-canvas border border-border-strong rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-ink-primary tabular-nums focus:outline-none focus:border-accent-primary"
                          />
                          <span className="text-[11px] text-ink-secondary font-mono">ktn</span>
                        </div>
                      </div>

                      {/* BOM & Holding Tank Preview + Remove */}
                      <div className="lg:col-span-3 flex items-center justify-between gap-2">
                        <div className="text-[11px] min-w-0">
                          {wips.length === 0 ? (
                            <span className="text-ink-rose font-semibold flex items-center space-x-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">BOM WIP belum diset</span>
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-ink-secondary block truncate">
                                {wips.length} WIP BOM ({wips.map(w => w.wip?.code || 'WIP').join(', ')})
                              </span>
                              {multiHtCount > 0 ? (
                                <span className="text-ink-amber text-[10px] block truncate">
                                  {multiHtCount} WIP punya 2+ Holding Tank (dipilih saat Start)
                                </span>
                              ) : (
                                <span className="text-ink-emerald text-[10px] block truncate">
                                  Holding Tank otomatis siap
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleLineSelection(lineId)}
                          className="hidden lg:inline-flex p-1.5 text-ink-secondary hover:text-ink-rose rounded-lg hover:bg-elevated transition shrink-0"
                          title="Hapus dari rencana start"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Step 4: Start CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <span className="text-xs text-ink-secondary">
                  Total Planning:{' '}
                  <strong className="text-ink-primary font-mono tabular-nums">
                    {selectedLineIds
                      .reduce((sum, id) => sum + (parseInt(draftPlansByLine[id]?.plannedCartons || '0', 10) || 0), 0)
                      .toLocaleString()}{' '}
                    karton
                  </strong>{' '}
                  pada Shift {currentLiveShift.shift} ({selectedLineIds.length} Line)
                </span>

                <button
                  type="button"
                  onClick={handleInitiateBatchStart}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center space-x-2 transition active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    Start Produksi ({selectedLineIds.length} Line)
                  </span>
                </button>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* 3. LIVE PRODUCTION LINES GRID (Active Running & Standby Line Cards) */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink-primary">
              Monitoring Line Produksi ({productionLines.length} Line)
            </h3>
            <p className="text-[11px] text-ink-secondary">
              Setiap line beroperasi paralel &amp; memotong Holding Tank sesuai formula BOM SKU yang berjalan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isManagement && runningRuns.length > 0 && onTriggerShiftHandover && (
              <button
                type="button"
                onClick={onTriggerShiftHandover}
                className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-ink-indigo border border-indigo-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition active:scale-95"
                title="Hentikan run shift saat ini & lanjutkan otomatis ke shift berikutnya"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Pergantian Shift ({runningRuns.length})</span>
              </button>
            )}

            {!isManagement && runningRuns.length > 1 && onStopAllSkuProduction && (
              <button
                type="button"
                onClick={onStopAllSkuProduction}
                className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-ink-rose border border-rose-500/40 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Hentikan Semua ({runningRuns.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowStopHistory(!showStopHistory)}
              className="px-3 py-1.5 bg-elevated hover:bg-accent text-ink-primary border border-border-strong rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition"
            >
              <History className="w-3.5 h-3.5 text-ink-amber" />
              <span>Log SBL Hari Ini ({stopLogsToday.length})</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {productionLines.map(line => {
            const run = runningByLineId[line.id];
            const lastFinished = !run ? lastFinishedByLineId[line.id] : undefined;

            if (!run) {
              // STANDBY LINE CARD (including Interrupted by Material Shortage OR SBL Stop with Resume option)
              const isShortageStop = lastFinished?.completionStatus === 'STOPPED_SHORTAGE';
              const isSblStop = lastFinished?.completionStatus === 'STOPPED_SBL';
              const canShowResumeCard = isShortageStop || isSblStop;

              const linkedSblLog =
                isSblStop && lastFinished?.sblStopLogId
                  ? (state.transactions.productionStops || []).find(
                      s => s.id === lastFinished.sblStopLogId
                    )
                  : undefined;

              const sblEstMinutes = isSblStop
                ? lastFinished?.sblEstimatedMinutes ??
                  linkedSblLog?.estimatedRepairMinutes ??
                  linkedSblLog?.durationMinutes ??
                  20
                : 0;
              const sblStoppedIso =
                lastFinished?.sblStoppedAt || linkedSblLog?.stoppedAt || lastFinished?.completedAt;
              const sblStoppedMs = sblStoppedIso ? new Date(sblStoppedIso).getTime() : now.getTime();
              const sblElapsedSec = Math.max(0, Math.floor((now.getTime() - sblStoppedMs) / 1000));
              const sblEstSec = Math.max(60, sblEstMinutes * 60);
              const sblRemainingSec = Math.max(0, sblEstSec - sblElapsedSec);
              const sblWithinEstimate = sblElapsedSec < sblEstSec;
              const sblTimerPct = Math.min(100, Math.round((sblElapsedSec / sblEstSec) * 100));

              const formatMmSs = (secs: number) => {
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
              };

              const resumeAvailability =
                canShowResumeCard && lastFinished
                  ? checkRunHoldingTankAvailability(
                      lastFinished.skuId,
                      state,
                      lastFinished.selectedHoldingTanks
                    )
                  : null;
              const shortageWipBreakdown =
                isShortageStop && lastFinished ? getLinkedWipBreakdown(lastFinished.skuId) : [];
              const pausedPlanned =
                lastFinished?.plannedCartons || (lastFinished?.targetPerHour || 500) * 8;
              const pausedProduced = lastFinished?.cartonsProducedTotal || 0;
              const pausedRemaining = Math.max(0, pausedPlanned - pausedProduced);

              return (
                <div
                  key={line.id}
                  className={`rounded-2xl p-4 flex flex-col justify-between gap-3 border ${
                    isShortageStop
                      ? 'bg-canvas border-amber-500/50 shadow-lg'
                      : isSblStop
                      ? 'bg-canvas border-rose-500/45 shadow-lg'
                      : 'bg-canvas border-border-subtle'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-ink-primary">{line.name}</span>
                        <span className="text-[10px] font-mono text-ink-secondary bg-elevated px-1.5 py-0.5 rounded">
                          {line.code}
                        </span>
                      </div>
                      {line.description && (
                        <p className="text-[11px] text-ink-secondary mt-0.5">{line.description}</p>
                      )}
                    </div>
                    {isShortageStop ? (
                      <span className="text-[11px] font-semibold text-ink-amber bg-amber-500/15 px-2.5 py-1 rounded-lg border border-amber-500/40 shrink-0">
                        Stop · Material Shortage
                      </span>
                    ) : isSblStop ? (
                      <span className="text-[11px] font-semibold text-ink-rose bg-rose-500/15 px-2.5 py-1 rounded-lg border border-rose-500/40 shrink-0">
                        Stop · SBL (Est. {sblEstMinutes} mnt)
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-ink-secondary bg-elevated px-2.5 py-1 rounded-lg border border-border-strong">
                        Standby
                      </span>
                    )}
                  </div>

                  {isShortageStop && lastFinished ? (
                    <div className="space-y-2.5">
                      {/* Interrupted Run & Shortage Reason Box */}
                      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start space-x-2 min-w-0">
                            <AlertTriangle className="w-4 h-4 text-ink-amber shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-ink-primary truncate">
                                {lastFinished.skuName} ({lastFinished.skuCode || 'SKU'})
                              </p>
                              <p className="text-[11px] text-ink-amber mt-0.5">
                                Penyebab Stop: {lastFinished.shortageReason || 'WIP di Holding Tank habis / di bawah kebutuhan 1 karton'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-500/20 text-[10px] font-mono tabular-nums text-ink-secondary">
                          <span>
                            Tercapai: <strong className="text-ink-primary">{pausedProduced.toLocaleString()}</strong> / {pausedPlanned.toLocaleString()} ktn
                          </span>
                          <span>
                            Sisa Target: <strong className="text-ink-amber">{pausedRemaining.toLocaleString()} ktn</strong>
                          </span>
                        </div>
                      </div>

                      {/* WIP Holding Tank Status & Alternate Tank Switcher */}
                      {shortageWipBreakdown.length > 0 && (
                        <div className="bg-surface border border-border-subtle rounded-xl p-2.5 space-y-2">
                          <span className="text-[10px] font-semibold text-ink-secondary block">
                            Cek Ketersediaan WIP Holding Tank:
                          </span>
                          <div className="space-y-1.5">
                            {shortageWipBreakdown.map((item, idx) => {
                              const holdingTanks = item.integratedTanks.filter(t => t.type === 'HOLDING_TANK');
                              const chosenHtId = item.wip ? lastFinished.selectedHoldingTanks?.[item.wip.id] : undefined;
                              const activeTank =
                                (chosenHtId ? item.integratedTanks.find(t => t.id === chosenHtId) : undefined) ||
                                holdingTanks[0] ||
                                item.integratedTanks[0];
                              const tankAvailKg = activeTank ? activeTank.currentLevelKg : 0;
                              const isEnough = item.kgPerCarton > 0 ? tankAvailKg >= item.kgPerCarton : tankAvailKg > 0;
                              const canCartons = item.kgPerCarton > 0 ? Math.floor(tankAvailKg / item.kgPerCarton) : 0;

                              return (
                                <div key={item.skuWip.id || idx} className="flex flex-col gap-1 text-[11px]">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-ink-primary font-medium truncate">
                                      {item.wip?.name || 'WIP'}
                                    </span>
                                    <span className={`font-mono font-bold tabular-nums shrink-0 ${isEnough ? 'text-ink-emerald' : 'text-ink-rose'}`}>
                                      {activeTank ? `${activeTank.code}: ${tankAvailKg.toFixed(1)} kg (${canCartons} ktn)` : 'Belum ada tangki'}
                                    </span>
                                  </div>
                                  {!isManagement && holdingTanks.length >= 2 && item.wip && (
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[10px] text-ink-secondary shrink-0">Pindah Tank:</span>
                                      <select
                                        value={activeTank?.id || ''}
                                        onChange={(e) =>
                                          onUpdateRunHoldingTank &&
                                          item.wip &&
                                          onUpdateRunHoldingTank(lastFinished.skuId, item.wip.id, e.target.value, lastFinished.id)
                                        }
                                        className="flex-1 min-w-0 bg-canvas border border-border-strong rounded-lg px-2 py-1 text-[10px] font-mono text-ink-primary focus:outline-none focus:border-accent-primary"
                                      >
                                        {holdingTanks.map(ht => (
                                          <option key={ht.id} value={ht.id}>
                                            {ht.code} ({ht.currentLevelKg.toFixed(1)} kg)
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Readiness Banner */}
                      {resumeAvailability?.isReady ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-2.5 flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 text-[11px] text-ink-emerald">
                            <CheckCircle2 className="w-4 h-4 text-ink-emerald shrink-0" />
                            <span>
                              WIP sudah tersedia kembali (±<strong>{resumeAvailability.minPossibleCartons.toLocaleString()}</strong> ktn siap)
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] text-ink-rose">
                            Menunggu pengisian WIP ke Holding Tank ({resumeAvailability?.missingDetails.join(' · ') || 'Stok kosong'})
                          </span>
                          {onSwitchTab && (
                            <button
                              type="button"
                              onClick={() => onSwitchTab('tank-monitoring')}
                              className="px-2.5 py-1 bg-elevated hover:bg-accent text-brand border border-border-strong rounded-lg text-[10px] font-semibold flex items-center space-x-1 transition shrink-0"
                            >
                              <Droplets className="w-3 h-3" />
                              <span>Isi / Transfer Tangki</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isSblStop && lastFinished ? (
                    <div className="space-y-2.5">
                      {/* Interrupted Run & SBL Repair Estimation Box */}
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-start space-x-2 min-w-0">
                          <ShieldAlert className="w-4 h-4 text-ink-rose shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                              <p className="text-xs font-bold text-ink-primary truncate">
                                {lastFinished.skuName} ({lastFinished.skuCode || 'SKU'})
                              </p>
                              <span className="text-[10px] font-mono text-ink-rose">
                                {lastFinished.sblCategoryLabel || linkedSblLog?.categoryLabel || 'Six Big Losses'}
                              </span>
                            </div>
                            <p className="text-[11px] text-ink-rose mt-0.5">
                              Kendala: {lastFinished.sblReason || linkedSblLog?.reasonTitle || 'Masalah proses / perbaikan teknis'}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-rose-500/20 text-[10px] font-mono tabular-nums text-ink-secondary">
                          <span>
                            Tercapai: <strong className="text-ink-primary">{pausedProduced.toLocaleString()}</strong> / {pausedPlanned.toLocaleString()} ktn
                          </span>
                          <span>
                            Sisa Target: <strong className="text-brand">{pausedRemaining.toLocaleString()} ktn</strong>
                          </span>
                        </div>
                      </div>

                      {/* Live Repair Time Countdown vs Estimate */}
                      <div
                        className={`rounded-xl p-2.5 border space-y-1.5 ${
                          sblWithinEstimate
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-amber-500/10 border-amber-500/30'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                          <span
                            className={`font-bold flex items-center space-x-1.5 ${
                              sblWithinEstimate ? 'text-ink-emerald' : 'text-ink-amber'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {sblWithinEstimate
                                ? `Dalam Estimasi (< ${sblEstMinutes} menit)`
                                : `Melewati Estimasi (${sblEstMinutes} menit)`}
                            </span>
                          </span>
                          <span className="font-mono font-bold text-ink-primary tabular-nums">
                            {formatMmSs(sblElapsedSec)} / {formatMmSs(sblEstSec)}
                          </span>
                        </div>

                        <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              sblWithinEstimate ? 'bg-emerald-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${sblTimerPct}%` }}
                          />
                        </div>

                        <p className="text-[10px] text-ink-secondary tabular-nums">
                          {sblWithinEstimate
                            ? `Sisa waktu estimasi ${formatMmSs(sblRemainingSec)}. Jika perbaikan sudah selesai kurang dari ${sblEstMinutes} menit, klik Start Produksi Kembali untuk melanjutkan target.`
                            : `Waktu perbaikan telah berjalan ${Math.ceil(sblElapsedSec / 60)} mnt. Jika sudah selesai, klik Start Produksi Kembali untuk melanjutkan.`}
                        </p>
                      </div>

                      {!resumeAvailability?.isReady && (
                        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2 text-[11px] text-ink-rose flex flex-wrap items-center justify-between gap-2">
                          <span>
                            Stok WIP Holding Tank belum cukup untuk melanjutkan ({resumeAvailability?.missingDetails.join(' · ') || 'Kosong'})
                          </span>
                          {onSwitchTab && (
                            <button
                              type="button"
                              onClick={() => onSwitchTab('tank-monitoring')}
                              className="px-2 py-1 bg-elevated hover:bg-accent text-brand border border-border-strong rounded-lg text-[10px] font-semibold"
                            >
                              Isi Tangki
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : lastFinished ? (
                    <div className="bg-surface border border-border-subtle rounded-xl p-2.5 text-[11px] flex items-center justify-between gap-2">
                      <span className="text-ink-secondary truncate">
                        Terakhir: <strong className="text-ink-primary">{lastFinished.skuName}</strong> ({(lastFinished.cartonsProducedTotal || 0).toLocaleString()} ktn)
                      </span>
                      <span
                        className={`font-semibold shrink-0 ${
                          lastFinished.completionStatus === 'SHIFT_HANDOVER'
                            ? 'text-ink-indigo'
                            : 'text-ink-emerald'
                        }`}
                      >
                        {lastFinished.completionStatus === 'SHIFT_HANDOVER'
                          ? `Handover → Shift ${lastFinished.handoverToShift || shiftPeriod.nextShift}`
                          : 'Selesai Normal'}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-ink-muted">
                      Line tersedia. Pilih line ini pada Alur Mulai Produksi untuk menentukan SKU dan planning karton.
                    </p>
                  )}

                  {!isManagement && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {canShowResumeCard && lastFinished && onResumeLineRun && (
                        <button
                          type="button"
                          disabled={!resumeAvailability?.isReady}
                          onClick={() =>
                            onResumeLineRun(lastFinished.id || lastFinished.lineId || line.id)
                          }
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                            !resumeAvailability?.isReady
                              ? 'bg-elevated text-ink-muted border border-border-strong cursor-not-allowed'
                              : isSblStop && !sblWithinEstimate
                              ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 active:scale-95'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:scale-95'
                          }`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>
                            {!resumeAvailability?.isReady
                              ? 'Start Produksi Kembali (WIP Kosong)'
                              : isSblStop && sblWithinEstimate
                              ? `Start Produksi Kembali (< ${sblEstMinutes} mnt)`
                              : 'Start Produksi Kembali'}
                          </span>
                        </button>
                      )}

                      {isSblStop && linkedSblLog && isWhatsAppEligibleSblCategory(linkedSblLog.category) && (
                        <button
                          type="button"
                          onClick={() => setWaModalTarget({ stopLog: linkedSblLog })}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-ink-emerald border border-emerald-500/40 transition flex items-center space-x-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Kirim WA</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleToggleLineSelection(line.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 ${
                          selectedLineIds.includes(line.id)
                            ? 'bg-cyan-600 text-white'
                            : 'bg-elevated hover:bg-accent text-ink-primary border border-border-strong'
                        }`}
                      >
                        {selectedLineIds.includes(line.id) ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Terpilih di Planner</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 text-brand" />
                            <span>{canShowResumeCard ? `Ganti SKU (${line.name})` : `Pilih ${line.name}`}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // RUNNING LINE CARD
            const sku = state.master.skus.find(s => s.id === run.skuId);
            const targetPerHour = sku?.targetHour || run.targetPerHour || 500;
            const speedMult = run.speedMultiplier || 1;
            const plannedCartons = run.plannedCartons || targetPerHour * 8;
            const produced = run.cartonsProducedTotal || 0;
            const pct = plannedCartons > 0 ? Math.min(100, Math.round((produced / plannedCartons) * 100)) : 0;
            const remaining = Math.max(0, plannedCartons - produced);
            const linkedWips = sku ? getLinkedWipBreakdown(sku.id) : [];
            const customQtyVal = customCartonsInputByRun[run.id || line.id] || '200';

            return (
              <div
                key={line.id}
                className="bg-canvas border border-emerald-500/40 rounded-2xl p-4 space-y-3.5 shadow-lg"
              >
                {/* Card Header: Line Name, Running SKU, Speed & Stop/Selesai */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 border-b border-border-subtle pb-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold">
                        {run.lineName || line.name}
                      </span>
                      <span className="text-[11px] font-mono text-ink-emerald font-semibold flex items-center space-x-1">
                        <Lock className="w-3 h-3" />
                        <span>1 SKU Aktif · Shift {run.shift || currentLiveShift.shift}</span>
                      </span>
                      {run.carriedOverFromShift && (
                        <span className="text-[10px] font-mono font-semibold text-ink-indigo bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                          Lanjutan Shift {run.carriedOverFromShift} ({(run.previousShiftCartons || 0).toLocaleString()} ktn)
                        </span>
                      )}
                      {sku?.isKite && (
                        <span className="text-[10px] font-mono font-bold text-ink-amber bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                          KITE
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 mt-1.5">
                      <Package className="w-4 h-4 text-brand shrink-0" />
                      <h4 className="text-sm sm:text-base font-bold text-ink-primary truncate">
                        {sku?.name || run.skuName}
                      </h4>
                      <span className="text-[10px] font-mono text-brand bg-elevated border border-border-strong px-1.5 py-0.5 rounded shrink-0">
                        {sku?.code || run.skuCode || 'SKU'}
                      </span>
                    </div>
                  </div>

                  {/* Speed & Stop Action */}
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <div className="flex items-center space-x-1 bg-surface border border-border-subtle rounded-lg p-0.5">
                      {[1, 2, 5].map(mult => (
                        <button
                          key={mult}
                          type="button"
                          disabled={isManagement}
                          onClick={() => onSetRunSpeedMultiplier && onSetRunSpeedMultiplier(mult, run.id || line.id)}
                          className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition ${
                            speedMult === mult
                              ? 'bg-cyan-600 text-white'
                              : 'text-ink-secondary hover:text-ink-primary'
                          }`}
                        >
                          {mult}x
                        </button>
                      ))}
                    </div>

                    {!isManagement && (
                      <button
                        type="button"
                        onClick={() => {
                          setNormalFinishNotes('');
                          setStopChoiceRun(run);
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition active:scale-95"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Selesai / Stop</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Realisasi vs Planning Progress */}
                <div className="bg-surface border border-border-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <span className="text-[10px] text-ink-secondary block">Realisasi vs Planning Shift</span>
                      <div className="flex items-baseline space-x-1.5">
                        <span className="text-xl font-bold font-mono text-ink-primary tabular-nums">
                          {produced.toLocaleString()}
                        </span>
                        <span className="text-xs font-mono text-ink-secondary tabular-nums">
                          / {plannedCartons.toLocaleString()} ktn
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono font-bold text-ink-emerald tabular-nums">{pct}%</span>
                      <span className="text-[10px] text-ink-secondary font-mono block tabular-nums">
                        Sisa: {remaining.toLocaleString()} ktn
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-ink-secondary pt-0.5 tabular-nums">
                    <span>Laju: {((targetPerHour * speedMult) / 3600).toFixed(2)} ktn/dtk ({targetPerHour * speedMult} ktn/j)</span>
                    <span>Op: {run.operatorName}</span>
                  </div>
                </div>

                {/* Holding Tank WIP BOM Depletion Strip */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-ink-secondary flex items-center space-x-1.5">
                      <Cylinder className="w-3.5 h-3.5 text-brand" />
                      <span>Pengurangan WIP Holding Tank (BOM)</span>
                    </span>
                    <span className="text-[10px] font-mono text-ink-secondary">
                      {linkedWips.length} Komponen WIP
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {linkedWips.map((item, idx) => {
                      const holdingTanks = item.integratedTanks.filter(t => t.type === 'HOLDING_TANK');
                      const chosenHtId = item.wip ? run.selectedHoldingTanks?.[item.wip.id] : undefined;
                      const primaryTank =
                        (chosenHtId ? item.integratedTanks.find(t => t.id === chosenHtId) : undefined) ||
                        holdingTanks[0] ||
                        item.integratedTanks[0];
                      const remainingKg = primaryTank ? primaryTank.currentLevelKg : 0;
                      const maxCartons = item.kgPerCarton > 0 ? Math.floor(remainingKg / item.kgPerCarton) : 0;
                      const isCrit =
                        primaryTank &&
                        primaryTank.currentLevelKg <= (primaryTank.minAlertKg || primaryTank.capacityKg * 0.2);

                      return (
                        <div
                          key={item.skuWip.id || idx}
                          className="bg-surface border border-border-subtle rounded-xl p-2.5 text-xs space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-ink-primary block truncate">
                                {item.wip?.name || 'WIP'}
                              </span>
                              <span className="text-[10px] font-mono text-ink-secondary tabular-nums">
                                {item.kgPerCarton.toFixed(4)} kg/ktn · Terpotong {(produced * item.kgPerCarton).toFixed(1)} kg
                              </span>
                            </div>
                            <div className="text-right shrink-0 font-mono tabular-nums">
                              {primaryTank ? (
                                <>
                                  <span className="text-[11px] font-bold text-brand block">
                                    {primaryTank.code}: {primaryTank.currentLevelKg.toFixed(1)} kg
                                  </span>
                                  <span className={`text-[10px] font-semibold ${isCrit ? 'text-ink-rose' : 'text-ink-emerald'}`}>
                                    Cukup {maxCartons.toLocaleString()} ktn
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] text-ink-rose">Belum ada tangki</span>
                              )}
                            </div>
                          </div>

                          {holdingTanks.length >= 2 && item.wip && (
                            <div className="pt-1.5 border-t border-border-subtle flex items-center justify-between gap-2">
                              <span className="text-[10px] text-ink-secondary shrink-0">Holding Tank:</span>
                              <select
                                disabled={isManagement}
                                value={primaryTank?.id || ''}
                                onChange={(e) =>
                                  onUpdateRunHoldingTank &&
                                  item.wip &&
                                  onUpdateRunHoldingTank(run.skuId, item.wip.id, e.target.value, run.id)
                                }
                                className="flex-1 min-w-0 bg-canvas border border-border-strong rounded-lg px-2 py-1 text-[10px] font-mono text-ink-primary focus:outline-none focus:border-accent-primary"
                              >
                                {holdingTanks.map(ht => (
                                  <option key={ht.id} value={ht.id}>
                                    {ht.code} ({ht.currentLevelKg.toFixed(1)} kg)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Manual Output / Quick Deduction Row */}
                {!isManagement && (
                  <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-ink-secondary mr-1">Catat Output:</span>
                      {[1, 10, 50, 200].map(q => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => handleManualCartonDeduction(run, q)}
                          className="px-2 py-1 bg-surface hover:bg-elevated text-ink-primary border border-border-strong rounded-lg text-[10px] font-mono font-bold transition active:scale-95"
                        >
                          +{q}
                        </button>
                      ))}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const qty = parseInt(customQtyVal, 10);
                        if (!isNaN(qty) && qty > 0) {
                          handleManualCartonDeduction(run, qty);
                        } else {
                          showToast?.('Masukkan angka karton valid.', true);
                        }
                      }}
                      className="flex items-center space-x-1"
                    >
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={customQtyVal}
                        onChange={(e) =>
                          setCustomCartonsInputByRun(prev => ({
                            ...prev,
                            [run.id || line.id]: e.target.value
                          }))
                        }
                        className="w-16 bg-surface border border-border-strong rounded-lg px-2 py-1 text-[11px] font-mono text-ink-primary text-center tabular-nums focus:outline-none focus:border-accent-primary"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[10px] font-bold transition"
                      >
                        +Ktn
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. COLLAPSIBLE SIX BIG LOSSES HISTORY TABLE */}
      {showStopHistory && (
        <div className="bg-canvas border border-border-subtle rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-ink-rose" />
              <h4 className="font-bold text-xs sm:text-sm text-ink-primary">
                Riwayat Stop Masalah Produksi Hari Ini (TPM Six Big Losses)
              </h4>
            </div>
            <div className="text-xs font-mono tabular-nums text-ink-rose">
              Total Downtime: <strong>{totalDowntimeMinutes} Menit</strong>
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface text-ink-secondary text-[10px] font-bold uppercase border-b border-border-subtle">
                  <th className="py-2 px-2.5">Waktu Stop</th>
                  <th className="py-2 px-2.5">Line</th>
                  <th className="py-2 px-2.5">SKU</th>
                  <th className="py-2 px-2.5">Shift</th>
                  <th className="py-2 px-2.5">Kategori SBL</th>
                  <th className="py-2 px-2.5">Alasan Masalah</th>
                  <th className="py-2 px-2.5 text-right">Durasi</th>
                  <th className="py-2 px-2.5">Tindakan / PIC</th>
                  <th className="py-2 px-2.5 text-center">Laporan WA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {stopLogsToday.length > 0 ? (
                  stopLogsToday
                    .slice()
                    .reverse()
                    .map(log => {
                      const canSendWa = isWhatsAppEligibleSblCategory(log.category);
                      return (
                        <tr key={log.id} className="hover:bg-elevated transition">
                          <td className="py-2 px-2.5 font-mono text-[11px] text-ink-secondary whitespace-nowrap tabular-nums">
                            {new Date(log.stoppedAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-brand whitespace-nowrap">
                            {log.lineName || '-'}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-ink-primary">
                            {log.skuName || '-'}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-ink-secondary">
                            Shift {log.shift}
                          </td>
                          <td className="py-2 px-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                log.category === 'MATERIAL_SHORTAGE'
                                  ? 'bg-amber-500/15 text-ink-amber border-amber-500/30'
                                  : 'bg-rose-500/15 text-ink-rose border-rose-500/30'
                              }`}
                            >
                              {log.categoryLabel}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-ink-primary max-w-xs truncate">
                            {log.reasonTitle}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-ink-rose tabular-nums whitespace-nowrap">
                            <div>{log.durationMinutes} mnt</div>
                            {log.resumedAt && log.estimatedRepairMinutes && (
                              <div className="text-[10px] font-normal text-ink-emerald">
                                Est. {log.estimatedRepairMinutes} mnt → Aktual {log.actualRepairMinutes ?? log.durationMinutes} mnt
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-ink-secondary text-[11px]">
                            {log.actionTaken || log.operatorName || '-'}
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            {canSendWa ? (
                              <button
                                type="button"
                                onClick={() => setWaModalTarget({ stopLog: log })}
                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/35 text-ink-emerald border border-emerald-500/40 rounded-lg text-[10px] font-bold inline-flex items-center space-x-1 transition"
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
                    <td colSpan={9} className="py-4 text-center text-ink-secondary text-xs">
                      Belum ada kejadian stop masalah (SBL) yang tercatat hari ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. METRICS SUMMARY (Scoped by All Lines or Specific Line) */}
      <div className="space-y-3 pt-1 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <span className="text-[11px] font-semibold text-ink-secondary mr-1 shrink-0">Ringkasan Metrik:</span>
          <button
            type="button"
            onClick={() => setMetricScope('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
              metricScope === 'ALL'
                ? 'bg-cyan-600 text-white'
                : 'bg-elevated text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Semua Line
          </button>
          {productionLines.map(line => (
            <button
              key={line.id}
              type="button"
              onClick={() => setMetricScope(line.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                metricScope === line.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-elevated text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {line.name}{runningByLineId[line.id] ? ` (${runningByLineId[line.id].skuCode || 'Aktif'})` : ''}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* KPI 1: Realisasi vs Planning */}
          <div className="bg-canvas border border-border-subtle p-4 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-brand" />
                <span>
                  {totalActiveShiftPlanned > 0 ? 'Realisasi Planning Shift' : 'Realisasi Harian'}
                </span>
              </span>
              <span className="text-xs font-mono font-bold text-brand tabular-nums">
                {overallProgressPercent}%
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold font-mono text-ink-primary tabular-nums">
                  {(totalActiveShiftPlanned > 0 ? totalActiveRealized : finalCartonsToday).toLocaleString()}
                </span>
                <span className="text-xs text-ink-secondary font-mono ml-1.5 tabular-nums">
                  / {(totalActiveShiftPlanned > 0 ? totalActiveShiftPlanned : aggregateDailyTargetCartons).toLocaleString()} ktn
                </span>
              </div>
              <span className="text-[10px] font-mono text-ink-secondary bg-elevated px-2 py-0.5 rounded">
                {scopedRunningRuns.length} Line Jalan
              </span>
            </div>

            <div className="w-full bg-elevated h-2 rounded-full overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${overallProgressPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-ink-secondary font-mono tabular-nums">
              <span>
                Sisa Planning:{' '}
                {Math.max(
                  0,
                  (totalActiveShiftPlanned > 0 ? totalActiveShiftPlanned : aggregateDailyTargetCartons) -
                    (totalActiveShiftPlanned > 0 ? totalActiveRealized : finalCartonsToday)
                ).toLocaleString()}{' '}
                ktn
              </span>
              <span>Total Hari Ini: {finalCartonsToday.toLocaleString()} ktn</span>
            </div>
          </div>

          {/* KPI 2: Breakdown Shift 1 / 2 / 3 */}
          <div className="bg-canvas border border-border-subtle p-4 rounded-2xl space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-amber" />
                <span>Output Per Shift</span>
              </span>
              <span className="text-[10px] font-mono text-ink-secondary tabular-nums">
                Est: {aggregateTargetPerShift.toLocaleString()} ktn/shift
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
                    className={`p-2 rounded-xl text-xs flex items-center justify-between border ${
                      isCurrent
                        ? 'bg-surface border-cyan-500/40'
                        : 'bg-surface border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        isCurrent ? 'bg-cyan-600 text-white' : 'bg-elevated text-ink-secondary'
                      }`}>
                        {sInfo.shortLabel}
                      </span>
                      <span className="text-[10px] text-ink-secondary font-mono">{sInfo.timeRange}</span>
                    </div>

                    <div className="flex items-center space-x-2 font-mono tabular-nums">
                      <span className="font-bold text-ink-primary">{shiftRealized.toLocaleString()} ktn</span>
                      <span className="text-[10px] text-ink-secondary min-w-[32px] text-right">{shiftPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* KPI 3: Kapasitas 24 Jam & Downtime */}
          <div className="bg-canvas border border-border-subtle p-4 rounded-2xl flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-ink-secondary uppercase tracking-wider flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-ink-emerald" />
                  <span>Kapasitas 24 Jam</span>
                </span>
                <span className="text-[10px] font-mono text-ink-secondary">
                  {productionLines.length} Line
                </span>
              </div>

              <div className="mt-1.5">
                <span className="text-2xl font-bold font-mono text-ink-primary tabular-nums">
                  {aggregateDailyTargetCartons.toLocaleString()}
                </span>
                <span className="text-xs text-ink-secondary font-mono ml-1.5">ktn / 24 jam</span>
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-2.5 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Line Beroperasi:</span>
                <span className="font-mono font-bold text-ink-primary tabular-nums">
                  {runningRuns.length} / {productionLines.length} Line
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Total Downtime SBL:</span>
                <span className={`font-mono font-bold tabular-nums ${totalDowntimeMinutes > 0 ? 'text-ink-rose' : 'text-ink-emerald'}`}>
                  {totalDowntimeMinutes} Menit
                </span>
              </div>
            </div>

            {onSwitchTab && (
              <button
                type="button"
                onClick={() => onSwitchTab('bom-calculator')}
                className="w-full py-2 bg-elevated hover:bg-accent text-ink-primary rounded-xl text-[11px] font-semibold transition flex items-center justify-center space-x-1 border border-border-strong"
              >
                <span>Kalkulator Kebutuhan Bahan (BOM)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal 1: Production Line Customizer (Administrator Only) */}
      {isAdmin && onAddProductionLine && onUpdateProductionLine && onDeleteProductionLine && onSetProductionLinesCount && (
        <ProductionLineManagerModal
          isOpen={isLineManagerOpen}
          onClose={() => setIsLineManagerOpen(false)}
          productionLines={productionLines}
          runningRuns={runningRuns}
          onAddLine={onAddProductionLine}
          onUpdateLine={onUpdateProductionLine}
          onDeleteLine={onDeleteProductionLine}
          onSetLineCount={onSetProductionLinesCount}
          showToast={showToast}
        />
      )}

      {/* Modal 2: Per-Line Holding Tank Selection Modal */}
      <HoldingTankSelectionModal
        isOpen={Boolean(pendingTankModalAssignments)}
        onClose={() => setPendingTankModalAssignments(null)}
        state={state}
        pendingAssignments={modalPendingAssignments}
        onConfirmAssignments={(selectionsByLineId) => {
          if (pendingTankModalAssignments) {
            executeBatchStart(pendingTankModalAssignments.assignments, selectionsByLineId);
          }
          setPendingTankModalAssignments(null);
        }}
      />

      {/* Modal 3: Stop / Selesai Produksi Decision Modal (Alur #5) */}
      {stopChoiceRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm">
          <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-ink-primary">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-canvas">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-ink-primary">
                  Hentikan / Selesaikan Produksi
                </h3>
                <p className="text-[11px] text-ink-secondary mt-0.5">
                  {stopChoiceRun.lineName || 'Line'} · {stopChoiceRun.skuName} ({(stopChoiceRun.cartonsProducedTotal || 0).toLocaleString()} ktn)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStopChoiceRun(null)}
                className="p-1.5 rounded-lg bg-elevated hover:bg-accent text-ink-secondary hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              {/* Path A: Selesai Produksi Normal */}
              <div className="bg-canvas border border-emerald-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start space-x-2.5">
                  <CheckCircle2 className="w-5 h-5 text-ink-emerald shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-ink-primary">1. Produksi Selesai (Normal)</p>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Target batch/planning sudah selesai tanpa kendala. Line kembali berstatus Standby dan siap memilih SKU baru.
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  value={normalFinishNotes}
                  onChange={(e) => setNormalFinishNotes(e.target.value)}
                  placeholder="Catatan penyelesaian (opsional)..."
                  className="w-full bg-surface border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    onCompleteLineRun?.(stopChoiceRun.id || stopChoiceRun.lineId || stopChoiceRun.skuId, normalFinishNotes.trim() || undefined);
                    setStopChoiceRun(null);
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition"
                >
                  Selesaikan Produksi (Normal)
                </button>
              </div>

              {/* Path B: Stop Karena Material Shortage (WIP Habis) */}
              {onRecordMaterialShortage && (
                <div className="bg-canvas border border-amber-500/30 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-start space-x-2.5">
                    <AlertTriangle className="w-5 h-5 text-ink-amber shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-ink-primary">2. Stop Karena Material Shortage (WIP Habis)</p>
                      <p className="text-[11px] text-ink-secondary mt-0.5">
                        Material WIP di Holding Tank habis atau tidak mencukupi. Mencatat penyebab Material Shortage &amp; membuka tombol Start Produksi Kembali saat WIP tersedia lagi.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const target = stopChoiceRun;
                      setStopChoiceRun(null);
                      onRecordMaterialShortage(
                        target.id || target.lineId || target.skuId,
                        'Material Shortage: WIP di Holding Tank habis / tidak mencukupi untuk melanjutkan produksi'
                      );
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition"
                  >
                    Catat Material Shortage &amp; Pause Line
                  </button>
                </div>
              )}

              {/* Path C: Stop Karena Masalah (Six Big Losses) */}
              <div className="bg-canvas border border-rose-500/30 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-start space-x-2.5">
                  <ShieldAlert className="w-5 h-5 text-ink-rose shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-ink-primary">3. Stop Karena Masalah (Six Big Losses / SBL)</p>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Terjadi kerusakan mesin, setup, atau kendala proses. Mencatat downtime ke Log Six Big Losses sebelum menghentikan line.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const target = stopChoiceRun;
                    setStopChoiceRun(null);
                    setSblModalTarget({
                      skuId: target.skuId,
                      skuName: target.skuName,
                      skuCode: target.skuCode,
                      lineId: target.lineId,
                      lineName: target.lineName,
                      startedAt: target.startedAt,
                      cartonsProducedTotal: target.cartonsProducedTotal
                    });
                  }}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition"
                >
                  Catat Masalah (Six Big Losses) &amp; Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Six Big Losses Modal (when Stop Karena Masalah selected) */}
      {sblModalTarget && (
        <SixBigLossesModal
          isOpen={Boolean(sblModalTarget)}
          onClose={() => setSblModalTarget(null)}
          skuId={sblModalTarget.skuId}
          skuName={sblModalTarget.skuName}
          skuCode={sblModalTarget.skuCode}
          lineId={sblModalTarget.lineId}
          lineName={sblModalTarget.lineName}
          startedAt={sblModalTarget.startedAt}
          cartonsProducedDuringRun={sblModalTarget.cartonsProducedTotal || 0}
          onConfirmStop={(stopData, options) => {
            onStopSkuProduction?.(stopData);
            setSblModalTarget(null);
            if (options?.sendWhatsApp && isWhatsAppEligibleSblCategory(stopData.category)) {
              setWaModalTarget({
                stopLog: stopData,
                initialPhone: options.whatsappPhone
              });
            }
          }}
          showToast={showToast || (() => {})}
        />
      )}

      {/* Modal 5: WhatsApp SBL Report Modal */}
      {waModalTarget && (
        <WhatsAppSblModal
          isOpen={Boolean(waModalTarget)}
          onClose={() => setWaModalTarget(null)}
          stopLog={waModalTarget.stopLog}
          initialPhone={waModalTarget.initialPhone}
          showToast={showToast || (() => {})}
        />
      )}
    </div>
  );
};
