import React, { useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react';
import { Cpu, Factory, Activity, Play } from 'lucide-react';
import {
  AppState,
  WipTank,
  ProductionMachine,
  ProductionLine,
  ActiveSkuProductionRun,
} from '../../types';
import { MinimalTankNode } from './MinimalTankNode';

interface WipPipingCanvasProps {
  state: AppState;
  tanks: WipTank[];
  activeRuns: ActiveSkuProductionRun[];
  selectedTankId?: string | null;
  onSelectTankSettings: (tank: WipTank) => void;
}

interface PipeConnection {
  id: string;
  d: string;
  isActive: boolean;
  direction: 'INLET' | 'OUTLET';
  color: string;
}

export const WipPipingCanvas: React.FC<WipPipingCanvasProps> = ({
  state,
  tanks,
  activeRuns,
  selectedTankId,
  onSelectTankSettings,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const machinePortRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tankInletRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const tankOutletRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const linePortRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [pipes, setPipes] = useState<PipeConnection[]>([]);

  // Collect machines that are linked to at least one displayed tank (or all machines if none linked yet)
  const relevantMachines = useMemo(() => {
    const linkedIds = new Set<string>();
    tanks.forEach(t => {
      const ids = (t.sourceMachineIds && t.sourceMachineIds.length > 0)
        ? t.sourceMachineIds
        : (t.assignedMachineIds && t.assignedMachineIds.length > 0)
          ? t.assignedMachineIds
          : t.assignedMachineId ? [t.assignedMachineId] : [];
      ids.forEach(id => linkedIds.add(id));
    });

    const machines = state.master.machines || [];
    if (linkedIds.size === 0) return machines.slice(0, 6);
    return machines.filter(m => linkedIds.has(m.id));
  }, [tanks, state.master.machines]);

  // Collect production lines (from master.productionLines)
  const relevantLines = useMemo(() => {
    const lines = state.master.productionLines || [];
    const linkedIds = new Set<string>();
    tanks.forEach(t => {
      (t.assignedLineIds || []).forEach(id => linkedIds.add(id));
    });

    if (linkedIds.size === 0) return lines;
    // Show linked lines + any lines currently running an active SKU
    const activeLineIds = new Set(activeRuns.map(r => r.lineId).filter(Boolean));
    return lines.filter(l => linkedIds.has(l.id) || activeLineIds.has(l.id));
  }, [tanks, state.master.productionLines, activeRuns]);

  // Helper to check if a machine is actively producing/feeding
  const isMachineActive = useCallback(
    (machine: ProductionMachine) => {
      return machine.status === 'OPERATIONAL';
    },
    []
  );

  // Helper to check if a line is actively running an SKU that consumes a given WIP
  const getLineActiveRunForWip = useCallback(
    (line: ProductionLine, wipId?: string): ActiveSkuProductionRun | undefined => {
      const lineRuns = activeRuns.filter(
        r => r.lineId === line.id || r.lineName === line.name
      );
      if (lineRuns.length === 0) return undefined;
      if (!wipId) return undefined;
      return lineRuns.find(r =>
        state.master.skuWips.some(sw => sw.skuId === r.skuId && sw.wipId === wipId)
      );
    },
    [activeRuns, state.master.skuWips]
  );

  // Determine per-tank flowing states for port LEDs
  const tankFlowStates = useMemo(() => {
    const inMap: Record<string, boolean> = {};
    const outMap: Record<string, boolean> = {};

    tanks.forEach(tank => {
      const mIds = (tank.sourceMachineIds && tank.sourceMachineIds.length > 0)
        ? tank.sourceMachineIds
        : (tank.assignedMachineIds && tank.assignedMachineIds.length > 0)
          ? tank.assignedMachineIds
          : tank.assignedMachineId ? [tank.assignedMachineId] : [];
      inMap[tank.id] = mIds.some(mId => {
        const m = state.master.machines.find(mm => mm.id === mId);
        return m ? isMachineActive(m) : false;
      });

      const lIds = tank.assignedLineIds || [];
      outMap[tank.id] = lIds.some(lId => {
        const line = (state.master.productionLines || []).find(ll => ll.id === lId);
        return line ? Boolean(getLineActiveRunForWip(line, tank.assignedWipId)) : false;
      });
    });

    return { inMap, outMap };
  }, [tanks, state.master.machines, state.master.productionLines, isMachineActive, getLineActiveRunForWip]);

  // Compute SVG Cubic Bezier pipe coordinates
  const calculatePipes = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const nextPipes: PipeConnection[] = [];

    const getRelCenter = (el: HTMLDivElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - containerRect.left + r.width / 2,
        y: r.top - containerRect.top + r.height / 2,
      };
    };

    const buildCubicBezier = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
      const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
      return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
    };

    tanks.forEach(tank => {
      const inletCenter = getRelCenter(tankInletRefs.current[tank.id]);
      const outletCenter = getRelCenter(tankOutletRefs.current[tank.id]);

      // 1. Machine -> Tank pipes
      const mIds = (tank.sourceMachineIds && tank.sourceMachineIds.length > 0)
        ? tank.sourceMachineIds
        : (tank.assignedMachineIds && tank.assignedMachineIds.length > 0)
          ? tank.assignedMachineIds
          : tank.assignedMachineId ? [tank.assignedMachineId] : [];

      if (inletCenter) {
        mIds.forEach(mId => {
          const mCenter = getRelCenter(machinePortRefs.current[mId]);
          if (mCenter) {
            const machine = state.master.machines.find(mm => mm.id === mId);
            const active = machine ? isMachineActive(machine) : false;
            nextPipes.push({
              id: `in-${mId}-${tank.id}`,
              d: buildCubicBezier(mCenter, inletCenter),
              isActive: active,
              direction: 'INLET',
              color: active ? '#06b6d4' : '#475569',
            });
          }
        });
      }

      // 2. Tank -> Line pipes
      const lIds = tank.assignedLineIds || [];
      if (outletCenter) {
        lIds.forEach(lId => {
          const lCenter = getRelCenter(linePortRefs.current[lId]);
          if (lCenter) {
            const line = (state.master.productionLines || []).find(ll => ll.id === lId);
            const activeRun = line ? getLineActiveRunForWip(line, tank.assignedWipId) : undefined;
            const active = Boolean(activeRun) && tank.currentLevelKg > 0.05 && tank.status !== 'CIP';
            nextPipes.push({
              id: `out-${tank.id}-${lId}`,
              d: buildCubicBezier(outletCenter, lCenter),
              isActive: active,
              direction: 'OUTLET',
              color: active ? '#10b981' : '#475569',
            });
          }
        });
      }
    });

    setPipes(nextPipes);
  }, [tanks, state.master.machines, state.master.productionLines, isMachineActive, getLineActiveRunForWip]);

  // Observe layout & resizes
  useLayoutEffect(() => {
    calculatePipes();
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(calculatePipes);
    });
    observer.observe(container);
    window.addEventListener('resize', calculatePipes);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', calculatePipes);
    };
  }, [calculatePipes]);

  return (
    <div className="bg-surface border border-border-subtle rounded-2xl p-4 sm:p-5 shadow-sm">
      {/* SCADA Legend & Status Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-xs font-bold text-ink-primary">
          <Activity className="w-4 h-4 text-brand" />
          <span>SCADA P&amp;ID Diagram Aliran WIP (Master BOM Driven)</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-ink-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-1 rounded-full bg-cyan-500 inline-block animate-pulse" />
            <span>Aliran Pengisian Aktif</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-1 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <span>Suplai Lini Aktif</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 rounded-full bg-slate-500/50 inline-block" />
            <span>Pipa Idle / Standby</span>
          </span>
        </div>
      </div>

      {/* Horizontal scroll wrapper for mobile/tablet */}
      <div className="overflow-x-auto pb-2">
        <div
          ref={containerRef}
          className="relative min-w-[920px] grid grid-cols-[240px_1fr_240px] gap-10 lg:gap-14 items-start py-2"
        >
          {/* SVG Overlay Layer */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
            aria-hidden="true"
          >
            <defs>
              <style>{`
                @keyframes scadaFlowAnim {
                  from { stroke-dashoffset: 24; }
                  to { stroke-dashoffset: 0; }
                }
                .scada-pipe-active {
                  stroke-dasharray: 8 4;
                  animation: scadaFlowAnim 0.75s linear infinite;
                }
              `}</style>
            </defs>

            {pipes.map(pipe => (
              <g key={pipe.id}>
                {/* Base Pipe Casing */}
                <path
                  d={pipe.d}
                  fill="none"
                  stroke={pipe.isActive ? pipe.color : 'currentColor'}
                  strokeOpacity={pipe.isActive ? 0.28 : 0.22}
                  className={pipe.isActive ? '' : 'text-ink-muted'}
                  strokeWidth={pipe.isActive ? 6 : 3.5}
                  strokeLinecap="round"
                />
                {/* Animated Flow Core */}
                {pipe.isActive && (
                  <path
                    d={pipe.d}
                    fill="none"
                    stroke={pipe.color}
                    strokeWidth={3}
                    strokeLinecap="round"
                    className="scada-pipe-active"
                  />
                )}
              </g>
            ))}
          </svg>

          {/* COLUMN 1: SOURCE / FEEDER MACHINES */}
          <div className="relative z-10 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-secondary px-1 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-brand" />
              <span>Mesin Pengisi ({relevantMachines.length})</span>
            </div>

            {relevantMachines.length === 0 ? (
              <div className="p-4 rounded-xl bg-canvas border border-border-subtle text-xs text-ink-muted text-center">
                Belum ada mesin terhubung
              </div>
            ) : (
              relevantMachines.map(machine => {
                const active = isMachineActive(machine);
                return (
                  <div
                    key={machine.id}
                    className={`relative bg-canvas border rounded-xl p-3 transition ${
                      active
                        ? 'border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
                        : 'border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] font-extrabold text-brand bg-tint-cyan px-1.5 py-0.5 rounded border border-cyan-500/30">
                        {machine.code}
                      </span>
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                          active
                            ? 'bg-tint-emerald text-ink-emerald border-emerald-500/30'
                            : 'bg-elevated text-ink-secondary border-border-strong'
                        }`}
                      >
                        {machine.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-ink-primary truncate" title={machine.name}>
                      {machine.name}
                    </div>
                    <div className="text-[10px] text-ink-secondary truncate mt-0.5">
                      {machine.currentWipName || machine.line}
                    </div>

                    {/* Right Output Port */}
                    <div
                      ref={el => {
                        machinePortRefs.current[machine.id] = el;
                      }}
                      aria-hidden="true"
                      className={`absolute -right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 z-20 ${
                        active
                          ? 'bg-cyan-500 border-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
                          : 'bg-elevated border-border-strong'
                      }`}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* COLUMN 2: WIP VESSELS (MINIMAL TANK NODES) */}
          <div className="relative z-10 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-secondary px-1 text-center">
              Bejana Tangki WIP ({tanks.length})
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {tanks.map(tank => {
                const wip = state.master.wips.find(w => w.id === tank.assignedWipId);
                return (
                  <MinimalTankNode
                    key={tank.id}
                    tank={tank}
                    wip={wip}
                    isSelected={selectedTankId === tank.id}
                    isFlowingIn={tankFlowStates.inMap[tank.id]}
                    isFlowingOut={tankFlowStates.outMap[tank.id]}
                    onOpenSettings={onSelectTankSettings}
                    inletPortRef={el => {
                      tankInletRefs.current[tank.id] = el;
                    }}
                    outletPortRef={el => {
                      tankOutletRefs.current[tank.id] = el;
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* COLUMN 3: TARGET PRODUCTION LINES */}
          <div className="relative z-10 space-y-3">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-ink-secondary px-1 flex items-center justify-end gap-1.5">
              <span>Lini Produksi Tujuan ({relevantLines.length})</span>
              <Factory className="w-3.5 h-3.5 text-ink-emerald" />
            </div>

            {relevantLines.length === 0 ? (
              <div className="p-4 rounded-xl bg-canvas border border-border-subtle text-xs text-ink-muted text-center">
                Belum ada lini terhubung
              </div>
            ) : (
              relevantLines.map(line => {
                const lineRuns = activeRuns.filter(
                  r => r.lineId === line.id || r.lineName === line.name
                );
                const isRunning = lineRuns.length > 0;
                const primaryRun = lineRuns[0];

                return (
                  <div
                    key={line.id}
                    className={`relative bg-canvas border rounded-xl p-3 transition ${
                      isRunning
                        ? 'border-emerald-500/60 shadow-[0_0_12px_rgba(16,185,129,0.14)]'
                        : 'border-border-subtle'
                    }`}
                  >
                    {/* Left Input Port */}
                    <div
                      ref={el => {
                        linePortRefs.current[line.id] = el;
                      }}
                      aria-hidden="true"
                      className={`absolute -left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 z-20 ${
                        isRunning
                          ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                          : 'bg-elevated border-border-strong'
                      }`}
                    />

                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[11px] font-extrabold text-ink-emerald bg-tint-emerald px-1.5 py-0.5 rounded border border-emerald-500/30">
                        {line.code}
                      </span>
                      {isRunning ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-ink-emerald border border-emerald-500/40">
                          <Play className="w-2.5 h-2.5 fill-current" />
                          RUNNING
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-elevated text-ink-muted border border-border-strong">
                          IDLE
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-ink-primary truncate" title={line.name}>
                      {line.name}
                    </div>

                    {primaryRun ? (
                      <div className="mt-1.5 p-1.5 rounded-lg bg-surface border border-emerald-500/20 text-[10px]">
                        <div className="font-semibold text-ink-primary truncate" title={primaryRun.skuName}>
                          {primaryRun.skuName}
                        </div>
                        <div className="font-mono text-ink-emerald font-bold tabular-nums mt-0.5">
                          Output: {primaryRun.cartonsProducedTotal} Karton
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-ink-muted italic mt-1">
                        Tidak ada SKU aktif berjalan
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
