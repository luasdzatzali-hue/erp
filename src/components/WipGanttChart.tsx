import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  PauseCircle,
  Play,
  Search,
  Sparkles,
  X
} from 'lucide-react';
import {
  AppState,
  ProductionMachine,
  ShiftNumber,
  WIP,
  WipProductionBatch,
  WipTank
} from '../types';
import { getCurrentShift, SHIFTS_CONFIG } from '../utils/shifts';

export interface WipGanttChartProps {
  state: AppState;
  currentTime: number;
  compact?: boolean;
  onExpandFullView?: () => void;
  onPauseWipBatch?: (batch: WipProductionBatch) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onCompleteWipBatch?: (batchId: string) => void;
  onCancelWipBatch?: (batchId: string) => void;
  onQuickSelectLane?: (params: { machineId?: string; wipId?: string }) => void;
}

type HorizonMode = 'live-5h' | 'shift-8h' | 'day-24h';
type LaneGroupMode = 'machine' | 'wip';

interface GanttItem {
  id: string;
  kind: 'batch' | 'changeover' | 'projected';
  laneId: string;
  title: string;
  subtitle: string;
  startMs: number;
  endMs: number;
  status: 'SEDANG_PRODUKSI' | 'DIJEDA' | 'SELESAI' | 'DIBATALKAN' | 'CHANGEOVER' | 'PROJECTED';
  shift: ShiftNumber;
  batch?: WipProductionBatch;
  tankCode?: string;
  machineCode?: string;
  machineName?: string;
  wipCode?: string;
  weightKg?: number;
  progressPct?: number;
  durationMinutes: number;
  operatorName?: string;
}

interface GanttLane {
  id: string;
  code: string;
  name: string;
  meta: string;
  statusTag: string;
  isRunning: boolean;
  isPaused?: boolean;
  isMaintenance: boolean;
  items: GanttItem[];
  machineId?: string;
  wipId?: string;
}

/**
 * Parses timestamps stored in either ISO-8601 ("2026-11-23T08:30:00.000Z")
 * or Indonesian local format ("2026-11-23 08.30" / "2026-11-23 08:30").
 */
export function parseWipTimestamp(raw?: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1) Try native ISO or standard format first if it contains 'T' or 'Z'
  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const t = Date.parse(trimmed);
    if (Number.isFinite(t)) return t;
  }

  // 2) Match "YYYY-MM-DD HH.mm(:ss)?" or "YYYY-MM-DD HH:mm(:ss)?"
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[\sT](\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] ? Number(match[6]) : 0;
    const dt = new Date(year, month, day, hour, minute, second, 0);
    if (Number.isFinite(dt.getTime())) return dt.getTime();
  }

  // 3) Fallback native Date.parse with dot->colon normalization on time
  const normalized = trimmed.replace(/(\d{2})\.(\d{2})/, '$1:$2');
  const fallback = Date.parse(normalized);
  return Number.isFinite(fallback) ? fallback : null;
}

function formatTimeShort(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDateShort(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

function formatDurationLabel(mins: number): string {
  const rounded = Math.max(1, Math.round(mins));
  if (rounded < 60) return `${rounded}m`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

/**
 * Returns the factory operational day start (07:00 local time of the current factory day).
 * If current hour < 7, the factory operational day started yesterday at 07:00.
 */
function getFactoryDayStartMs(refMs: number, dayOffset: number): number {
  const d = new Date(refMs);
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1);
  }
  d.setDate(d.getDate() + dayOffset);
  d.setHours(7, 0, 0, 0);
  return d.getTime();
}

function getShiftWindowMs(refMs: number, shift: ShiftNumber, dayOffset: number): { startMs: number; endMs: number } {
  const dayStart = getFactoryDayStartMs(refMs, dayOffset);
  if (shift === 1) {
    return { startMs: dayStart, endMs: dayStart + 8 * 3600_000 }; // 07:00 - 15:00
  }
  if (shift === 2) {
    return { startMs: dayStart + 8 * 3600_000, endMs: dayStart + 16 * 3600_000 }; // 15:00 - 23:00
  }
  return { startMs: dayStart + 16 * 3600_000, endMs: dayStart + 24 * 3600_000 }; // 23:00 - 07:00
}

export const WipGanttChart: React.FC<WipGanttChartProps> = ({
  state,
  currentTime,
  compact = false,
  onExpandFullView,
  onPauseWipBatch,
  onResumeWipBatch,
  onCompleteWipBatch,
  onCancelWipBatch,
  onQuickSelectLane
}) => {
  const liveShift = getCurrentShift(new Date(currentTime));

  const [horizon, setHorizon] = useState<HorizonMode>(compact ? 'live-5h' : 'day-24h');
  const [groupBy, setGroupBy] = useState<LaneGroupMode>('machine');
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [focusShift, setFocusShift] = useState<ShiftNumber>(liveShift.shift);
  const [showCancelled, setShowCancelled] = useState<boolean>(false);
  const [showProjectedNext, setShowProjectedNext] = useState<boolean>(false);
  const [laneSearch, setLaneSearch] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Sync window boundaries [windowStartMs, windowEndMs]
  const { windowStartMs, windowEndMs, tickIntervalMinutes } = useMemo(() => {
    if (horizon === 'live-5h') {
      // Snap to 30-minute boundary around currentTime: -2.5h to +2.5h (5 hours total)
      const anchor = Math.floor(currentTime / (30 * 60_000)) * (30 * 60_000);
      return {
        windowStartMs: anchor - 150 * 60_000,
        windowEndMs: anchor + 150 * 60_000,
        tickIntervalMinutes: 30
      };
    }
    if (horizon === 'shift-8h') {
      const { startMs, endMs } = getShiftWindowMs(currentTime, focusShift, dayOffset);
      return {
        windowStartMs: startMs,
        windowEndMs: endMs,
        tickIntervalMinutes: 60
      };
    }
    // 24-hour full 3-shift window (07:00 -> next day 07:00)
    const startMs = getFactoryDayStartMs(currentTime, dayOffset);
    return {
      windowStartMs: startMs,
      windowEndMs: startMs + 24 * 3600_000,
      tickIntervalMinutes: 120
    };
  }, [horizon, currentTime, focusShift, dayOffset]);

  const windowSpanMs = Math.max(1, windowEndMs - windowStartMs);

  // Build lookup maps
  const machineMap = useMemo(() => {
    const map = new Map<string, ProductionMachine>();
    state.master.machines.forEach(m => map.set(m.id, m));
    return map;
  }, [state.master.machines]);

  const wipMap = useMemo(() => {
    const map = new Map<string, WIP>();
    state.master.wips.forEach(w => map.set(w.id, w));
    return map;
  }, [state.master.wips]);

  const tankMap = useMemo(() => {
    const map = new Map<string, WipTank>();
    state.master.tanks.forEach(t => map.set(t.id, t));
    return map;
  }, [state.master.tanks]);

  // Build all Gantt items from real transactions + changeover logs
  const allItems = useMemo<GanttItem[]>(() => {
    const items: GanttItem[] = [];
    const batches = state.transactions.wipBatches || [];

    batches.forEach(b => {
      if (!showCancelled && b.status === 'DIBATALKAN') return;

      const wipObj = wipMap.get(b.wipId);
      const machObj = b.targetMachineId ? machineMap.get(b.targetMachineId) : undefined;
      const tankId =
        b.targetTankId ||
        wipObj?.targetTankId ||
        (wipObj?.targetTankIds && wipObj.targetTankIds[0]) ||
        state.master.tanks.find(t => t.assignedWipId === b.wipId)?.id;
      const tankObj = tankId ? tankMap.get(tankId) : undefined;

      const durMins = b.durationMinutes || wipObj?.productionDurationMinutes || 30;
      const estEndParsed = parseWipTimestamp(b.estimatedCompletionTime);
      const completedParsed = parseWipTimestamp(b.completedAt);
      let startMs = parseWipTimestamp(b.startedAt);

      if (startMs === null && estEndParsed !== null) {
        startMs = estEndParsed - durMins * 60_000;
      }
      if (startMs === null) return;

      let endMs = startMs + durMins * 60_000;
      if (b.status === 'SELESAI' || b.status === 'DIBATALKAN') {
        if (completedParsed !== null && completedParsed > startMs) {
          endMs = completedParsed;
        } else if (estEndParsed !== null && estEndParsed > startMs) {
          endMs = estEndParsed;
        }
      } else if (b.status === 'SEDANG_PRODUKSI') {
        if (estEndParsed !== null && estEndParsed > startMs) {
          endMs = estEndParsed;
        }
      } else if (b.status === 'DIJEDA') {
        const remMs = typeof b.remainingMsAtPause === 'number' ? b.remainingMsAtPause : durMins * 60_000;
        endMs = Math.max(startMs + durMins * 60_000, currentTime + remMs);
      }

      // Ensure minimum visible duration of 5 minutes for bar rendering
      const safeEndMs = Math.max(endMs, startMs + 5 * 60_000);
      const actualDurMins = Math.max(1, (safeEndMs - startMs) / 60_000);

      let progressPct: number | undefined;
      if (b.status === 'SEDANG_PRODUKSI') {
        const total = Math.max(1, safeEndMs - startMs);
        progressPct = Math.min(100, Math.max(0, ((currentTime - startMs) / total) * 100));
      } else if (b.status === 'DIJEDA') {
        const plannedMs = Math.max(1, durMins * 60_000);
        const remMs = typeof b.remainingMsAtPause === 'number' ? b.remainingMsAtPause : plannedMs;
        progressPct = Math.min(100, Math.max(0, ((plannedMs - remMs) / plannedMs) * 100));
      } else if (b.status === 'SELESAI') {
        progressPct = 100;
      }

      const laneId =
        groupBy === 'machine'
          ? b.targetMachineId || '__UNASSIGNED_MACHINE__'
          : b.wipId || '__UNASSIGNED_WIP__';

      items.push({
        id: b.id,
        kind: 'batch',
        laneId,
        title: b.batchCode,
        subtitle: groupBy === 'machine' ? b.wipName : machObj?.code || b.targetMachineName || 'Mesin',
        startMs,
        endMs: safeEndMs,
        status: b.status,
        shift: (b.shift || 1) as ShiftNumber,
        batch: b,
        tankCode: tankObj?.code,
        machineCode: machObj?.code,
        machineName: machObj?.name || b.targetMachineName,
        wipCode: wipObj?.code,
        weightKg: b.batchWeightKg,
        progressPct,
        durationMinutes: actualDurMins,
        operatorName: b.operatorName
      });
    });

    // Include machine changeover / CIP events when grouping by machine
    if (groupBy === 'machine') {
      state.master.machines.forEach(mach => {
        if (mach.activeChangeover) {
          const co = mach.activeChangeover;
          const sMs = parseWipTimestamp(co.startedAt);
          if (sMs !== null) {
            const dur = Math.max(10, co.estimatedMinutes || 30);
            items.push({
              id: `co_active_${mach.id}`,
              kind: 'changeover',
              laneId: mach.id,
              title: `Changeover (${co.changeoverType})`,
              subtitle: `➔ ${co.toWipName}`,
              startMs: sMs,
              endMs: sMs + dur * 60_000,
              status: 'CHANGEOVER',
              shift: getCurrentShift(new Date(sMs)).shift,
              machineCode: mach.code,
              machineName: mach.name,
              durationMinutes: dur,
              operatorName: co.operatorName
            });
          }
        }
        (mach.changeoverHistory || []).slice(0, 20).forEach(co => {
          if (co.status === 'CANCELLED') return;
          const sMs = parseWipTimestamp(co.startedAt);
          const eMs = parseWipTimestamp(co.completedAt);
          if (sMs !== null) {
            const dur = Math.max(10, co.durationMinutes || 25);
            const endMs = eMs && eMs > sMs ? eMs : sMs + dur * 60_000;
            items.push({
              id: `co_hist_${co.id}`,
              kind: 'changeover',
              laneId: mach.id,
              title: `CIP / Changeover`,
              subtitle: `${co.toWipName}`,
              startMs: sMs,
              endMs,
              status: 'CHANGEOVER',
              shift: getCurrentShift(new Date(sMs)).shift,
              machineCode: mach.code,
              machineName: mach.name,
              durationMinutes: Math.max(1, (endMs - sMs) / 60_000),
              operatorName: co.operatorName
            });
          }
        });
      });
    }

    // Optional Projected Next Batch Queue for running batches (planning projection)
    if (showProjectedNext) {
      batches
        .filter(b => b.status === 'SEDANG_PRODUKSI')
        .forEach(b => {
          const wipObj = wipMap.get(b.wipId);
          const machObj = b.targetMachineId ? machineMap.get(b.targetMachineId) : undefined;
          const tankId =
            b.targetTankId ||
            wipObj?.targetTankId ||
            (wipObj?.targetTankIds && wipObj.targetTankIds[0]);
          const tankObj = tankId ? tankMap.get(tankId) : undefined;
          const durMins = b.durationMinutes || wipObj?.productionDurationMinutes || 30;
          const estEnd =
            parseWipTimestamp(b.estimatedCompletionTime) ||
            (parseWipTimestamp(b.startedAt) || currentTime) + durMins * 60_000;
          const projStart = Math.max(estEnd, currentTime) + 5 * 60_000; // 5m buffer turnaround
          const projEnd = projStart + durMins * 60_000;
          const laneId =
            groupBy === 'machine'
              ? b.targetMachineId || '__UNASSIGNED_MACHINE__'
              : b.wipId;

          items.push({
            id: `proj_${b.id}`,
            kind: 'projected',
            laneId,
            title: `Est. Antrean +1`,
            subtitle: b.wipName,
            startMs: projStart,
            endMs: projEnd,
            status: 'PROJECTED',
            shift: getCurrentShift(new Date(projStart)).shift,
            tankCode: tankObj?.code,
            machineCode: machObj?.code,
            machineName: machObj?.name,
            wipCode: wipObj?.code,
            weightKg: b.batchWeightKg,
            durationMinutes: durMins
          });
        });
    }

    return items;
  }, [
    state.transactions.wipBatches,
    state.master.machines,
    state.master.tanks,
    wipMap,
    machineMap,
    tankMap,
    showCancelled,
    showProjectedNext,
    groupBy,
    currentTime
  ]);

  // Filter items intersecting current time window
  const visibleItems = useMemo(() => {
    return allItems.filter(item => item.endMs >= windowStartMs && item.startMs <= windowEndMs);
  }, [allItems, windowStartMs, windowEndMs]);

  // Build Lanes (Y-axis rows)
  const lanes = useMemo(() => {
    const q = laneSearch.trim().toLowerCase();

    if (groupBy === 'machine') {
      const result: GanttLane[] = state.master.machines.map(mach => {
        const laneItems = visibleItems.filter(it => it.laneId === mach.id);
        const activeBatch = (state.transactions.wipBatches || []).find(
          b => b.targetMachineId === mach.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
        );
        const isPaused = activeBatch?.status === 'DIJEDA';
        return {
          id: mach.id,
          code: mach.code,
          name: mach.name,
          meta: `${mach.line} · ${mach.capacityKgPerHour} kg/j`,
          statusTag: activeBatch
            ? isPaused
              ? 'DIJEDA'
              : 'PROSES'
            : mach.status === 'OPERATIONAL'
            ? 'SIAGA'
            : mach.status === 'MAINTENANCE'
            ? 'MAINT'
            : mach.status,
          isRunning: Boolean(activeBatch),
          isPaused,
          isMaintenance: mach.status === 'MAINTENANCE',
          items: laneItems,
          machineId: mach.id,
          wipId: activeBatch?.wipId || mach.currentWipId
        };
      });

      const unassignedItems = visibleItems.filter(it => it.laneId === '__UNASSIGNED_MACHINE__');
      if (unassignedItems.length > 0) {
        result.push({
          id: '__UNASSIGNED_MACHINE__',
          code: 'GENERAL',
          name: 'Mesin Belum Ditentukan',
          meta: 'Riwayat batch tanpa ID mesin',
          statusTag: 'LOG',
          isRunning: false,
          isPaused: false,
          isMaintenance: false,
          items: unassignedItems,
          machineId: undefined,
          wipId: undefined
        });
      }

      if (!q) return result;
      return result.filter(
        l =>
          l.code.toLowerCase().includes(q) ||
          l.name.toLowerCase().includes(q) ||
          l.meta.toLowerCase().includes(q) ||
          l.items.some(
            it =>
              it.title.toLowerCase().includes(q) ||
              it.subtitle.toLowerCase().includes(q) ||
              (it.operatorName && it.operatorName.toLowerCase().includes(q))
          )
      );
    }

    // Group by WIP & Target Tank
    const wipLanes: GanttLane[] = state.master.wips.map(w => {
      const tankId =
        w.targetTankId ||
        (w.targetTankIds && w.targetTankIds[0]) ||
        state.master.tanks.find(t => t.assignedWipId === w.id)?.id;
      const tank = tankId ? tankMap.get(tankId) : undefined;
      const laneItems = visibleItems.filter(it => it.laneId === w.id);
      const runningBatch = (state.transactions.wipBatches || []).find(
        b => b.wipId === w.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
      );
      const isRunning = Boolean(runningBatch);
      const isPaused = runningBatch?.status === 'DIJEDA';

      return {
        id: w.id,
        code: w.code,
        name: w.name,
        meta: `${w.batchWeightKg.toFixed(1)} kg/btc${tank ? ` · ➔ ${tank.code}` : ''}`,
        statusTag: isPaused ? 'DIJEDA' : isRunning ? 'PROSES' : 'SIAGA',
        isRunning,
        isPaused,
        isMaintenance: false,
        items: laneItems,
        machineId: w.assignedMachineId || w.assignedMachineIds?.[0],
        wipId: w.id
      };
    });

    if (!q) return wipLanes;
    return wipLanes.filter(
      l =>
        l.code.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.meta.toLowerCase().includes(q) ||
        l.items.some(
          it =>
            it.title.toLowerCase().includes(q) ||
            it.subtitle.toLowerCase().includes(q)
        )
    );
  }, [
    groupBy,
    state.master.machines,
    state.master.wips,
    state.master.tanks,
    state.transactions.wipBatches,
    visibleItems,
    tankMap,
    laneSearch
  ]);

  // Generate X-axis timeline ticks
  const ticks = useMemo(() => {
    const result: Array<{ ms: number; leftPct: number; label: string; isHour: boolean }> = [];
    const stepMs = tickIntervalMinutes * 60_000;
    const firstTick = Math.ceil(windowStartMs / stepMs) * stepMs;
    for (let t = firstTick; t <= windowEndMs; t += stepMs) {
      const leftPct = ((t - windowStartMs) / windowSpanMs) * 100;
      const d = new Date(t);
      result.push({
        ms: t,
        leftPct,
        label: formatTimeShort(t),
        isHour: d.getMinutes() === 0
      });
    }
    return result;
  }, [windowStartMs, windowEndMs, windowSpanMs, tickIntervalMinutes]);

  // Shift zone overlay bands (shown in 24h view)
  const shiftBands = useMemo(() => {
    if (horizon !== 'day-24h') return [];
    const s1 = getShiftWindowMs(currentTime, 1, dayOffset);
    const s2 = getShiftWindowMs(currentTime, 2, dayOffset);
    const s3 = getShiftWindowMs(currentTime, 3, dayOffset);
    return [
      { shift: 1 as ShiftNumber, label: 'Shift 1 (07:00–15:00)', leftPct: 0, widthPct: 33.3333, startMs: s1.startMs, endMs: s1.endMs },
      { shift: 2 as ShiftNumber, label: 'Shift 2 (15:00–23:00)', leftPct: 33.3333, widthPct: 33.3333, startMs: s2.startMs, endMs: s2.endMs },
      { shift: 3 as ShiftNumber, label: 'Shift 3 (23:00–07:00)', leftPct: 66.6666, widthPct: 33.3334, startMs: s3.startMs, endMs: s3.endMs }
    ];
  }, [horizon, currentTime, dayOffset]);

  // Real-time NOW playhead position
  const nowPct = useMemo(() => {
    if (currentTime < windowStartMs || currentTime > windowEndMs) return null;
    return ((currentTime - windowStartMs) / windowSpanMs) * 100;
  }, [currentTime, windowStartMs, windowEndMs, windowSpanMs]);

  // KPI summary calculated strictly from visible batches
  const ganttStats = useMemo(() => {
    const batchItems = visibleItems.filter(it => it.kind === 'batch');
    const activeCount = batchItems.filter(it => it.status === 'SEDANG_PRODUKSI' || it.status === 'DIJEDA').length;
    const completedCount = batchItems.filter(it => it.status === 'SELESAI').length;
    const totalKg = batchItems
      .filter(it => it.status !== 'DIBATALKAN')
      .reduce((sum, it) => sum + (it.weightKg || 0), 0);
    const avgDurationMins =
      batchItems.length > 0
        ? batchItems.reduce((sum, it) => sum + it.durationMinutes, 0) / batchItems.length
        : 0;
    const activeMachineCount = new Set(
      (state.transactions.wipBatches || [])
        .filter(b => (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA') && b.targetMachineId)
        .map(b => b.targetMachineId)
    ).size;

    return {
      totalBatches: batchItems.length,
      activeCount,
      completedCount,
      totalKg,
      avgDurationMins,
      activeMachineCount,
      totalMachines: state.master.machines.length
    };
  }, [visibleItems, state.transactions.wipBatches, state.master.machines.length]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allItems.find(it => it.id === selectedItemId) || null;
  }, [allItems, selectedItemId]);

  const displayedLanes = compact ? lanes.slice(0, 6) : lanes;
  const hiddenLanesCount = compact ? Math.max(0, lanes.length - 6) : 0;

  return (
    <section
      aria-label="Gantt Chart Jadwal Produksi WIP"
      className="bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-lg"
    >
      {/* Top Control Room Header */}
      <div className="px-4 py-3 border-b border-border-subtle bg-surface-header flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-brand flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-ink-primary tracking-tight">
                Gantt Chart Produksi &amp; Penjadwalan WIP
              </h3>
              <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
                {formatDateShort(windowStartMs)} {formatTimeShort(windowStartMs)} — {formatTimeShort(windowEndMs)}
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary mt-0.5">
              Pantau alokasi mesin batching, durasi siklus resep, changeover CIP, serta aliran transfer ke tangki WIP secara kronologis.
            </p>
          </div>
        </div>

        {/* Control Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Group By Switch */}
          <div className="inline-flex items-center p-0.5 bg-canvas border border-border-subtle rounded-lg">
            <button
              type="button"
              onClick={() => setGroupBy('machine')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                groupBy === 'machine'
                  ? 'bg-cyan-600 text-white'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>Per Mesin</span>
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('wip')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                groupBy === 'wip'
                  ? 'bg-cyan-600 text-white'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Per WIP &amp; Tangki</span>
            </button>
          </div>

          {/* Time Horizon Switch */}
          <div className="inline-flex items-center p-0.5 bg-canvas border border-border-subtle rounded-lg">
            {(
              [
                { id: 'live-5h', label: '5 Jam Live' },
                { id: 'shift-8h', label: 'Shift (8J)' },
                { id: 'day-24h', label: '24 Jam' }
              ] as const
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setHorizon(opt.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 ${
                  horizon === opt.id
                    ? 'bg-elevated text-brand border border-cyan-500/40'
                    : 'text-ink-secondary hover:text-ink-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Shift Picker when Shift-8h active */}
          {horizon === 'shift-8h' && (
            <div className="inline-flex items-center p-0.5 bg-canvas border border-border-subtle rounded-lg">
              {([1, 2, 3] as ShiftNumber[]).map(sNum => (
                <button
                  key={sNum}
                  type="button"
                  onClick={() => setFocusShift(sNum)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono font-semibold transition whitespace-nowrap shrink-0 ${
                    focusShift === sNum
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  S{sNum}
                </button>
              ))}
            </div>
          )}

          {/* Day Offset Navigation (for Shift-8h or Day-24h) */}
          {horizon !== 'live-5h' && (
            <div className="inline-flex items-center bg-canvas border border-border-subtle rounded-lg">
              <button
                type="button"
                onClick={() => setDayOffset(d => d - 1)}
                className="p-1.5 text-ink-secondary hover:text-ink-primary transition"
                title="Hari operasional sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDayOffset(0);
                  setFocusShift(liveShift.shift);
                }}
                className="px-2 py-1 text-[11px] font-mono font-semibold text-ink-secondary hover:text-brand whitespace-nowrap shrink-0"
                title="Kembali ke hari ini"
              >
                {dayOffset === 0 ? 'Hari Ini' : dayOffset > 0 ? `+${dayOffset}h` : `${dayOffset}h`}
              </button>
              <button
                type="button"
                onClick={() => setDayOffset(d => d + 1)}
                className="p-1.5 text-ink-secondary hover:text-ink-primary transition"
                title="Hari operasional berikutnya"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {compact && onExpandFullView && (
            <button
              type="button"
              onClick={onExpandFullView}
              className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-brand text-[11px] font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Buka Gantt Penuh</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Bar: Telemetry KPI Strip + Filter Tools */}
      <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        {/* KPI Counters */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-muted">Batch Jendela:</span>
            <span className="font-bold text-ink-primary">{ganttStats.totalBatches}</span>
            <span className="text-slate-600">·</span>
            <span className="text-ink-amber font-semibold">{ganttStats.activeCount} Aktif</span>
            <span className="text-slate-600">/</span>
            <span className="text-ink-emerald font-semibold">{ganttStats.completedCount} Selesai</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-muted">Volume WIP:</span>
            <span className="font-bold text-brand">{ganttStats.totalKg.toFixed(1)} kg</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-ink-muted">Mesin Aktif:</span>
            <span className="font-bold text-ink-primary">
              {ganttStats.activeMachineCount}/{ganttStats.totalMachines}
            </span>
          </div>
          <div className="hidden xl:flex items-center gap-1.5">
            <span className="text-ink-muted">Rata-rata Siklus:</span>
            <span className="font-bold text-ink-primary">
              {ganttStats.avgDurationMins > 0 ? `${ganttStats.avgDurationMins.toFixed(0)} mnt` : '-'}
            </span>
          </div>
        </div>

        {/* Search & Overlay Toggles */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-44 sm:w-52">
            <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={laneSearch}
              onChange={(e) => setLaneSearch(e.target.value)}
              placeholder="Filter mesin, WIP, batch..."
              className="w-full bg-surface border border-border-subtle rounded-lg pl-8 pr-6 py-1 text-[11px] text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
            />
            {laneSearch && (
              <button
                type="button"
                onClick={() => setLaneSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary"
                aria-label="Hapus filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowProjectedNext(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              showProjectedNext
                ? 'bg-cyan-500/15 border-cyan-500/40 text-brand'
                : 'bg-surface border-border-subtle text-ink-secondary hover:text-ink-primary'
            }`}
            title="Proyeksikan estimasi jadwal batch berikutnya setelah batch aktif selesai"
          >
            <Sparkles className="w-3 h-3" />
            <span>Est. Antrean +1</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCancelled(v => !v)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              showCancelled
                ? 'bg-rose-500/15 border-rose-500/40 text-ink-rose'
                : 'bg-surface border-border-subtle text-ink-secondary hover:text-ink-primary'
            }`}
          >
            {showCancelled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Dibatalkan</span>
          </button>
        </div>
      </div>

      {/* Main Gantt Scrollable Matrix */}
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Shift Bands Row (24h view) */}
          {horizon === 'day-24h' && (
            <div className="flex border-b border-border-subtle bg-surface-header">
              <div className="w-56 shrink-0 px-3 py-1.5 border-r border-border-subtle text-[10px] font-mono text-ink-secondary uppercase tracking-wider flex items-center justify-between">
                <span>Zona Shift</span>
                <span>24 Jam</span>
              </div>
              <div className="flex-1 relative h-6">
                {shiftBands.map(band => {
                  const isCurrentBand = liveShift.shift === band.shift && dayOffset === 0;
                  return (
                    <div
                      key={band.shift}
                      style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                      className={`absolute top-0 bottom-0 border-r border-border-subtle px-2 flex items-center justify-between text-[10px] font-mono ${
                        isCurrentBand ? 'bg-cyan-500/10 text-brand font-bold' : 'text-ink-secondary'
                      }`}
                    >
                      <span className="truncate">{band.label}</span>
                      {isCurrentBand && <span className="text-[9px] text-brand shrink-0">AKTIF</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time Axis Header */}
          <div className="flex border-b border-border-subtle bg-surface-header">
            <div className="w-56 shrink-0 px-3 py-2 border-r border-border-subtle flex items-center justify-between text-[11px] font-semibold text-ink-secondary">
              <span>{groupBy === 'machine' ? 'Mesin Produksi' : 'Jenis WIP & Tangki'}</span>
              <span className="font-mono text-[10px] text-ink-muted">{displayedLanes.length} jalur</span>
            </div>
            <div className="flex-1 relative h-8 select-none">
              {ticks.map(tick => (
                <div
                  key={tick.ms}
                  style={{ left: `${tick.leftPct}%` }}
                  className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none"
                >
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      tick.isHour ? 'text-ink-secondary font-semibold' : 'text-ink-muted'
                    }`}
                  >
                    {tick.label}
                  </span>
                  <span className="w-px h-1.5 bg-elevated mt-0.5" />
                </div>
              ))}

              {/* NOW indicator badge on axis */}
              {nowPct !== null && (
                <div
                  style={{ left: `${nowPct}%` }}
                  className="absolute top-0 bottom-0 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
                >
                  <span className="px-1.5 py-0.5 rounded-b bg-cyan-500 text-[#04080e] font-mono text-[9px] font-bold leading-none tabular-nums shadow">
                    {formatTimeShort(currentTime)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Resource Lanes */}
          <div className="divide-y divide-border-subtle scada-grid-surface relative">
            {displayedLanes.length > 0 ? (
              displayedLanes.map(lane => (
                <div
                  key={lane.id}
                  className="flex items-stretch min-h-[54px] hover:bg-surface transition-colors group"
                >
                  {/* Left Fixed Resource Cell */}
                  <div className="w-56 shrink-0 px-3 py-2 border-r border-border-subtle bg-surface flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-brand">
                          {lane.code}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            lane.isPaused
                              ? 'text-ink-sky'
                              : lane.isRunning
                              ? 'text-ink-amber'
                              : lane.isMaintenance
                              ? 'text-ink-rose'
                              : 'text-ink-emerald'
                          }`}
                        >
                          · {lane.statusTag}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-ink-primary truncate" title={lane.name}>
                        {lane.name}
                      </p>
                      <p className="text-[10px] text-ink-muted font-mono truncate">{lane.meta}</p>
                    </div>

                    {onQuickSelectLane && !lane.isRunning && !lane.isMaintenance && lane.id !== '__UNASSIGNED_MACHINE__' && (
                      <button
                        type="button"
                        onClick={() =>
                          onQuickSelectLane({
                            machineId: lane.machineId,
                            wipId: lane.wipId
                          })
                        }
                        title={
                          groupBy === 'machine'
                            ? `Siapkan batch baru pada mesin ${lane.code}`
                            : `Pilih WIP ${lane.name} di formulir perintah kerja`
                        }
                        className="p-1.5 rounded-lg bg-elevated hover:bg-cyan-600 text-ink-secondary hover:text-white border border-border-strong hover:border-cyan-500 transition shrink-0 opacity-80 group-hover:opacity-100"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Timeline Track */}
                  <div className="flex-1 relative py-2 px-0 overflow-hidden">
                    {/* Vertical Gridlines */}
                    {ticks.map(tick => (
                      <div
                        key={tick.ms}
                        style={{ left: `${tick.leftPct}%` }}
                        className={`absolute top-0 bottom-0 w-px pointer-events-none ${
                          tick.isHour ? 'bg-elevated' : 'bg-elevated'
                        }`}
                      />
                    ))}

                    {/* Vertical NOW Cursor */}
                    {nowPct !== null && (
                      <div
                        style={{ left: `${nowPct}%` }}
                        className="absolute top-0 bottom-0 w-[1.5px] bg-cyan-400/90 z-10 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                      />
                    )}

                    {/* Plotted Bars */}
                    {lane.items.length === 0 ? (
                      <div className="h-full flex items-center px-3">
                        <span className="text-[10px] font-mono text-slate-600">
                          Standby — belum ada batch dalam jendela waktu
                        </span>
                      </div>
                    ) : (
                      lane.items.map(item => {
                        const clampedStart = Math.max(item.startMs, windowStartMs);
                        const clampedEnd = Math.min(item.endMs, windowEndMs);
                        const leftPct = ((clampedStart - windowStartMs) / windowSpanMs) * 100;
                        const rawWidthPct = ((clampedEnd - clampedStart) / windowSpanMs) * 100;
                        const widthPct = Math.max(rawWidthPct, 2.2); // min readable width
                        const isSelected = selectedItemId === item.id;

                        const barStyles =
                          item.status === 'SEDANG_PRODUKSI'
                            ? 'gantt-bar-active bg-tint-amber border-amber-500/80 text-amber-100 hover:border-amber-400'
                            : item.status === 'DIJEDA'
                            ? 'gantt-bar-pause bg-tint-sky border-sky-500/80 border-dashed text-sky-100 hover:border-sky-400'
                            : item.status === 'SELESAI'
                            ? 'gantt-bar-done bg-tint-emerald border-emerald-500/60 text-emerald-100 hover:border-emerald-400'
                            : item.status === 'CHANGEOVER'
                            ? 'gantt-bar-co bg-tint-indigo border-indigo-400/60 text-indigo-100 hover:border-indigo-300'
                            : item.status === 'PROJECTED'
                            ? 'gantt-bar-proj bg-tint-cyan border-cyan-500/50 border-dashed text-brand hover:border-cyan-400'
                            : 'gantt-bar-cancel bg-tint-rose border-rose-500/50 border-dashed text-ink-rose hover:border-rose-400';

                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItemId(isSelected ? null : item.id)}
                            style={{
                              left: `${leftPct}%`,
                              width: `${Math.min(widthPct, 100 - leftPct)}%`
                            }}
                            title={`${item.title} · ${item.subtitle}${item.status === 'DIJEDA' ? ' [DIJEDA]' : ''} (${formatTimeShort(item.startMs)}–${formatTimeShort(item.endMs)} · ${formatDurationLabel(item.durationMinutes)})`}
                            className={`absolute top-1.5 bottom-1.5 rounded-md border px-2 text-left overflow-hidden transition-all z-10 flex flex-col justify-center ${barStyles} ${
                              isSelected ? 'ring-2 ring-cyan-400 z-20' : ''
                            }`}
                          >
                            {/* Progress fill inside active / paused batch bar */}
                            {(item.status === 'SEDANG_PRODUKSI' || item.status === 'DIJEDA') && typeof item.progressPct === 'number' && (
                              <div
                                className={`absolute inset-y-0 left-0 pointer-events-none ${
                                  item.status === 'DIJEDA' ? 'bg-sky-500/25' : 'bg-amber-500/25'
                                }`}
                                style={{ width: `${item.progressPct}%` }}
                              />
                            )}

                            <div className="relative z-10 flex items-center justify-between gap-1.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold truncate">
                                {item.title}
                              </span>
                              <span className="font-mono text-[9px] opacity-80 shrink-0 tabular-nums">
                                {formatDurationLabel(item.durationMinutes)}
                              </span>
                            </div>
                            <div className="relative z-10 flex items-center justify-between gap-1 text-[9px] opacity-90 truncate">
                              <span className="truncate">{item.subtitle}</span>
                              {item.tankCode && (
                                <span className="font-mono shrink-0 text-brand">➔ {item.tankCode}</span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-xs text-ink-muted">
                Tidak ada mesin atau WIP yang cocok dengan filter pencarian.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compact mode notice if more lanes exist */}
      {compact && hiddenLanesCount > 0 && onExpandFullView && (
        <div className="px-4 py-2 border-t border-border-subtle bg-surface-header flex items-center justify-between text-[11px]">
          <span className="text-ink-secondary font-mono">
            Menampilkan 6 dari {lanes.length} jalur ({hiddenLanesCount} jalur lainnya tersedia)
          </span>
          <button
            type="button"
            onClick={onExpandFullView}
            className="text-brand hover:text-brand font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>Lihat Semua Jalur di Gantt Penuh</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Legend Bar */}
      <div className="px-4 py-2 border-t border-border-subtle bg-surface-header flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-4 text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-tint-amber border border-amber-500" />
            <span>Sedang Produksi (Live)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-tint-sky border border-dashed border-sky-500" />
            <span>Dijeda / Pause</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-tint-emerald border border-emerald-500" />
            <span>Selesai &amp; Transfer Tangki</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-sm bg-tint-indigo border border-indigo-400" />
            <span>CIP / Changeover Mesin</span>
          </span>
          {showProjectedNext && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm bg-tint-cyan border border-dashed border-cyan-500" />
              <span>Proyeksi Antrean +1</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 font-mono text-brand">
            <span className="w-0.5 h-3 bg-cyan-400" />
            <span>Garis Waktu Aktual ({formatTimeShort(currentTime)})</span>
          </span>
        </div>

        <span className="text-[10px] font-mono text-ink-muted">
          Klik bar jadwal untuk inspeksi detail batch &amp; aksi cepat
        </span>
      </div>

      {/* Interactive Batch / Event Inspector Drawer */}
      {selectedItem && (
        <div className="p-4 border-t border-cyan-500/30 bg-canvas space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border-subtle">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-brand">
                {selectedItem.title}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-sm font-bold text-ink-primary">
                {selectedItem.batch ? selectedItem.batch.wipName : selectedItem.subtitle}
              </span>
              <span className="text-slate-600">·</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  selectedItem.status === 'SEDANG_PRODUKSI'
                    ? 'text-ink-amber'
                    : selectedItem.status === 'DIJEDA'
                    ? 'text-ink-sky'
                    : selectedItem.status === 'SELESAI'
                    ? 'text-ink-emerald'
                    : selectedItem.status === 'CHANGEOVER'
                    ? 'text-ink-indigo'
                    : selectedItem.status === 'PROJECTED'
                    ? 'text-brand'
                    : 'text-ink-rose'
                }`}
              >
                {selectedItem.status === 'SEDANG_PRODUKSI'
                  ? 'Sedang Diproses'
                  : selectedItem.status === 'DIJEDA'
                  ? 'Dijeda (Timer Berhenti)'
                  : selectedItem.status === 'SELESAI'
                  ? 'Selesai Ditransfer'
                  : selectedItem.status === 'CHANGEOVER'
                  ? 'Changeover / Sanitasi'
                  : selectedItem.status === 'PROJECTED'
                  ? 'Estimasi Proyeksi'
                  : 'Dibatalkan'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedItem.batch && (selectedItem.status === 'SEDANG_PRODUKSI' || selectedItem.status === 'DIJEDA') && (
                <>
                  {onCancelWipBatch && (
                    <button
                      type="button"
                      onClick={() => {
                        onCancelWipBatch(selectedItem.batch!.id);
                        setSelectedItemId(null);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-elevated hover:bg-tint-rose border border-border-strong hover:border-rose-500/40 text-ink-rose text-[11px] font-semibold transition whitespace-nowrap shrink-0"
                    >
                      Batalkan Batch
                    </button>
                  )}
                  {selectedItem.status === 'SEDANG_PRODUKSI' && onPauseWipBatch && (
                    <button
                      type="button"
                      onClick={() => onPauseWipBatch(selectedItem.batch!)}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 transition whitespace-nowrap shrink-0"
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>Pause Sementara</span>
                    </button>
                  )}
                  {selectedItem.status === 'DIJEDA' && onResumeWipBatch && (
                    <button
                      type="button"
                      onClick={() => onResumeWipBatch(selectedItem.batch!.id)}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 transition whitespace-nowrap shrink-0"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Lanjutkan Batch</span>
                    </button>
                  )}
                  {onCompleteWipBatch && (
                    <button
                      type="button"
                      onClick={() => {
                        onCompleteWipBatch(selectedItem.batch!.id);
                        setSelectedItemId(null);
                      }}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Selesai &amp; Transfer Tangki</span>
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedItemId(null)}
                className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated"
                aria-label="Tutup inspektor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono tabular-nums">
            <div>
              <span className="text-[10px] text-ink-muted block">Jalur Mesin</span>
              <span className="text-ink-primary font-semibold">
                {selectedItem.machineCode ? `${selectedItem.machineCode} (${selectedItem.machineName})` : selectedItem.machineName || '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-ink-muted block">Tangki Tujuan</span>
              <span className="text-brand font-semibold">
                {selectedItem.tankCode || '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-ink-muted block">Waktu Mulai — Akhir</span>
              <span className="text-ink-primary font-semibold">
                {formatTimeShort(selectedItem.startMs)} — {formatTimeShort(selectedItem.endMs)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-ink-muted block">Durasi / Progres</span>
              <span className="text-ink-amber font-semibold">
                {formatDurationLabel(selectedItem.durationMinutes)}
                {typeof selectedItem.progressPct === 'number' ? ` (${selectedItem.progressPct.toFixed(0)}%)` : ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-ink-muted block">Bobot 1 Batch</span>
              <span className="text-ink-emerald font-bold">
                {selectedItem.weightKg !== undefined ? `${selectedItem.weightKg.toFixed(2)} kg` : '-'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-ink-muted block">Shift &amp; Operator</span>
              <span className="text-ink-primary truncate block">
                S{selectedItem.shift} · {selectedItem.operatorName || '-'}
              </span>
            </div>
          </div>

          {selectedItem.batch && selectedItem.batch.pauseLogs && selectedItem.batch.pauseLogs.length > 0 && (
            <div className="pt-2 border-t border-border-subtle space-y-1.5 text-[11px]">
              <span className="text-ink-sky font-semibold block">
                Audit Trail Penghentian Sementara ({selectedItem.batch.pauseLogs.length} Kejadian):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedItem.batch.pauseLogs.map(log => (
                  <span
                    key={log.id}
                    className="text-[10px] px-2 py-1 rounded bg-tint-sky border border-sky-700/60 text-ink-primary"
                  >
                    <strong className="text-ink-sky">{log.category}</strong>: {log.reason} · Oleh {log.pausedBy}
                    {log.pausedDurationMs !== undefined
                      ? ` (${Math.max(1, Math.round(log.pausedDurationMs / 60000))} mnt)`
                      : ' (Masih Dijeda)'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedItem.batch && selectedItem.batch.materials.length > 0 && (
            <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-ink-secondary font-semibold">
                Resep {selectedItem.batch.recipeCode ? `[${selectedItem.batch.recipeCode}]` : 'BOM'} ({selectedItem.batch.materials.length} Bahan):
              </span>
              {selectedItem.batch.materials.map(m => (
                <span
                  key={m.materialId}
                  className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface border border-border-subtle text-ink-secondary"
                >
                  {m.materialName}: <strong className="text-brand">{m.actualUsedKg.toFixed(2)} kg</strong> ({m.sourceLocation})
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
