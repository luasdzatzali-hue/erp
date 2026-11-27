import React from 'react';
import { ArrowRight, Cpu, Monitor } from 'lucide-react';
import { AppState, WipProductionBatch } from '../../../types';
import { ShiftInfo, ShiftNumber } from '../../../utils/shifts';

interface PemakaianTelemetryStripProps {
  state: AppState;
  currentTime: number;
  currentLiveShift: ShiftInfo;
  allActiveBatches: WipProductionBatch[];
  runningBatchesCount: number;
  pausedBatchesCount: number;
  activeBatchTotalKg: number;
  operationalMachinesCount: number;
  busyMachineIds: Set<string>;
  currentShiftStats: { totalKg: number; count: number; batchesCount: number; operators: string[] };
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  onOpenStationMonitor?: (station: { type: 'line' | 'ck'; id: string }) => void;
}

export const PemakaianTelemetryStrip: React.FC<PemakaianTelemetryStripProps> = ({
  state,
  currentTime,
  currentLiveShift,
  allActiveBatches,
  runningBatchesCount,
  pausedBatchesCount,
  activeBatchTotalKg,
  operationalMachinesCount,
  busyMachineIds,
  currentShiftStats,
  onSwitchTab,
  onOpenStationMonitor
}) => {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-border-subtle bg-surface-header flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-brand flex items-center justify-center shrink-0">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-sm text-ink-primary tracking-tight">
                Pusat Kendali Produksi WIP &amp; Penyaluran Batch
              </h2>
              <span className={`text-[11px] font-mono font-semibold ${currentLiveShift.colorClass}`}>
                · {currentLiveShift.name} ({currentLiveShift.timeRange})
              </span>
            </div>
            <p className="text-[11px] text-ink-secondary">
              Pemantauan mesin batching, penjadwalan Gantt, pemotongan FIFO pallet, dan transfer otomatis ke tangki holding/storage.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
            Jam Pabrik:{' '}
            <strong className="text-ink-primary">
              {new Date(currentTime).toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              })}
            </strong>
          </span>
          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('tank-monitoring')}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition active:scale-95"
            >
              <span>Lanjut Tahap 06: Transfer WIP</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Control Room Readouts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-border-subtle">
        <div className="p-3.5">
          <span className="text-[11px] text-ink-secondary block">Shift Operasional Aktif</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className={`text-lg font-bold font-mono tabular-nums ${currentLiveShift.colorClass}`}>
              Shift {currentLiveShift.shift}
            </span>
            <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
              {currentLiveShift.timeRange}
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">Sinkronisasi otomatis jam kerja 24 jam</p>
        </div>

        <div className="p-3.5">
          <span className="text-[11px] text-ink-secondary block">Batch WIP Sedang Jalan</span>
          <div className="flex items-baseline justify-between mt-1">
            <span
              className={`text-lg font-bold font-mono tabular-nums ${
                allActiveBatches.length > 0 ? 'text-ink-amber' : 'text-ink-emerald'
              }`}
            >
              {allActiveBatches.length} Batch
            </span>
            <span className="text-[11px] font-mono text-brand tabular-nums">
              {activeBatchTotalKg.toFixed(1)} kg
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            {pausedBatchesCount > 0
              ? `${runningBatchesCount} jalan · ${pausedBatchesCount} dijeda (maks 1/mesin)`
              : 'Kapasitas terkunci: maks 1 batch / mesin'}
          </p>
        </div>

        <div className="p-3.5">
          <span className="text-[11px] text-ink-secondary block">Utilisasi Mesin Batching</span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold font-mono tabular-nums text-ink-primary">
              {busyMachineIds.size} / {state.master.machines.length}
            </span>
            <span className="text-[11px] font-mono text-ink-emerald tabular-nums">
              {operationalMachinesCount} Operasional
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            {Math.max(0, operationalMachinesCount - busyMachineIds.size)} unit mesin siaga menerima dispatch
          </p>
        </div>

        <div className="p-3.5">
          <span className="text-[11px] text-ink-secondary block">
            Konsumsi Material Shift {currentLiveShift.shift as ShiftNumber}
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-lg font-bold font-mono tabular-nums text-brand">
              {currentShiftStats.totalKg.toFixed(1)} kg
            </span>
            <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
              {currentShiftStats.batchesCount} Batch
            </span>
          </div>
          <p className="text-[10px] text-ink-muted mt-1">
            {currentShiftStats.count} transaksi pemotongan stok BOM
          </p>
        </div>
      </div>

      {/* Dedicated Central Kitchen Machine Kiosk Monitor Strip */}
      {onOpenStationMonitor && state.master.machines.length > 0 && (
        <div className="border-t border-border-subtle px-4 py-3 bg-canvas/70 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5 text-brand" />
              <span>Monitor Khusus Mesin Central Kitchen (Kiosk Mode)</span>
            </span>
            <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
              {state.master.machines.length} unit mesin
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {state.master.machines.map(mach => {
              const runningBatch = allActiveBatches.find(b => b.targetMachineId === mach.id);
              return (
                <div
                  key={mach.id}
                  className={`bg-surface border rounded-xl p-2.5 flex items-center justify-between gap-2 ${
                    runningBatch
                      ? runningBatch.status === 'DIJEDA'
                        ? 'border-sky-500/45'
                        : 'border-amber-500/45'
                      : 'border-border-subtle'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-brand bg-elevated px-1.5 py-0.5 rounded">
                        {mach.code}
                      </span>
                      <span className="text-xs font-bold text-ink-primary truncate">{mach.name}</span>
                    </div>
                    <p className="text-[10px] text-ink-secondary truncate mt-0.5 font-mono">
                      {runningBatch
                        ? `${runningBatch.batchCode} · ${runningBatch.wipName}`
                        : `Standby · ${mach.capacityKgPerHour} kg/j`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenStationMonitor({ type: 'ck', id: mach.id })}
                    className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-[11px] font-semibold text-brand flex items-center gap-1 shrink-0 transition"
                    title={`Buka Monitor Khusus ${mach.name}`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                    <span>Kiosk</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
