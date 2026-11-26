import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Cpu,
  Cylinder,
  Moon,
  PackageX,
  Pause,
  Play,
  Sun
} from 'lucide-react';
import { AppState, MaterialRejectLog, WipProductionBatch } from '../../types';
import { formatIndonesianDate, getShiftPeriodInfo, SHIFTS_CONFIG } from '../../utils/shifts';
import { resolveEffectiveRole } from '../../utils/roleAccess';
import { computeCkStationMetrics, getRejectCategoryLabel } from '../../utils/rejectAnalytics';
import { MaterialRejectDrawer } from '../MaterialRejectDrawer';
import { WipBatchPauseModal } from '../WipBatchPauseModal';

interface CkStationMonitorViewProps {
  state: AppState;
  machineId: string;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  onExitMonitor: () => void;
  onRecordMaterialReject: (log: MaterialRejectLog) => void;
  onCompleteWipBatch?: (batchId: string) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onPauseWipBatch?: (batchId: string, reason: string, category?: string) => void;
}

function formatDurationMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const CkStationMonitorView: React.FC<CkStationMonitorViewProps> = ({
  state,
  machineId,
  theme,
  onToggleTheme,
  onExitMonitor,
  onRecordMaterialReject,
  onCompleteWipBatch,
  onResumeWipBatch,
  onPauseWipBatch
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isRejectDrawerOpen, setIsRejectDrawerOpen] = useState(false);
  const [pauseModalBatch, setPauseModalBatch] = useState<WipProductionBatch | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveRole = resolveEffectiveRole(state);
  const isManagement = effectiveRole.isManagement;
  const isDaylight = theme === 'daylight' || theme === 'light';

  const shiftPeriod = useMemo(() => getShiftPeriodInfo(new Date(nowMs)), [nowMs]);
  const shiftMeta = SHIFTS_CONFIG[shiftPeriod.shift];

  const metrics = useMemo(
    () =>
      computeCkStationMetrics({
        state,
        machineId,
        dateStr: shiftPeriod.operationalDate,
        shift: shiftPeriod.shift,
        nowMs
      }),
    [state, machineId, shiftPeriod.operationalDate, shiftPeriod.shift, nowMs]
  );

  const machine = metrics.machine;
  const machineCode = machine?.code || machineId.toUpperCase();
  const machineName = machine?.name || `Mesin CK (${machineId})`;
  const batch = metrics.activeBatch;

  return (
    <div className="min-h-screen bg-canvas text-ink-primary flex flex-col">
      {/* Kiosk Top Bar */}
      <header className="h-14 bg-surface-header border-b border-border-subtle px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onExitMonitor}
            className="px-3 py-1.5 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-primary text-xs font-bold flex items-center gap-1.5 transition shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-brand" />
            <span className="hidden sm:inline">Keluar Mode Monitor / Kembali ke Control Room</span>
            <span className="sm:hidden">Control Room</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-mono text-xs font-bold shrink-0">
                {machineCode}
              </span>
              <h1 className="text-sm sm:text-base font-bold text-ink-primary truncate">
                {machineName}
              </h1>
            </div>
            <p className="text-[11px] text-ink-secondary font-mono truncate">
              Central Kitchen · {formatIndonesianDate(new Date(nowMs))} · {shiftMeta.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isManagement && (
            <button
              type="button"
              onClick={() => setIsRejectDrawerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition active:scale-95"
            >
              <PackageX className="w-4 h-4" />
              <span>Input Reject Material</span>
            </button>
          )}

          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              title={isDaylight ? 'Mode Midnight' : 'Mode Daylight'}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-surface hover:bg-elevated border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
            >
              {isDaylight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-ink-amber" />}
            </button>
          )}
        </div>
      </header>

      {/* Main HMI Canvas */}
      <main className="flex-1 p-4 sm:p-6 max-w-[1600px] w-full mx-auto space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Active Work Order & Giant Timer Card (7 cols) */}
          <div
            className={`lg:col-span-7 bg-surface rounded-2xl p-5 border shadow-lg flex flex-col justify-between gap-4 ${
              batch
                ? metrics.isPaused
                  ? 'border-amber-500/50'
                  : metrics.isOverdue
                  ? 'border-emerald-500/60'
                  : 'border-cyan-500/45'
                : 'border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-ink-secondary font-medium">
                  <Cpu className="w-4 h-4 text-ink-purple shrink-0" />
                  <span>Work Order Batch WIP · {machine?.line || 'Central Kitchen'}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink-primary mt-1 leading-tight">
                  {batch?.wipName || metrics.activeWip?.name || 'Mesin Standby — Belum Ada Batch Aktif'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs font-mono text-ink-secondary">
                  {batch ? (
                    <>
                      <span className="text-brand font-bold">{batch.batchCode}</span>
                      <span>·</span>
                      <span>{batch.batchWeightKg.toFixed(1)} kg/batch</span>
                      {batch.recipeName && (
                        <>
                          <span>·</span>
                          <span>{batch.recipeName}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>Op: {batch.operatorName}</span>
                    </>
                  ) : (
                    <span>
                      Kapasitas Mesin: {machine?.capacityKgPerHour || 0} kg/jam · Batch selesai shift ini:{' '}
                      {metrics.completedBatchesCount} ({metrics.completedBatchWeightKg.toFixed(1)} kg)
                    </span>
                  )}
                </div>
              </div>

              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center gap-1.5 ${
                  batch
                    ? metrics.isPaused
                      ? 'bg-amber-500/15 text-ink-amber border-amber-500/40'
                      : metrics.isOverdue
                      ? 'bg-emerald-500/15 text-ink-emerald border-emerald-500/40'
                      : 'bg-cyan-500/15 text-brand border-cyan-500/40'
                    : 'bg-elevated text-ink-secondary border-border-strong'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {batch
                    ? metrics.isPaused
                      ? 'DIJEDA'
                      : metrics.isOverdue
                      ? 'SIAP TRANSFER KE TANGKI'
                      : 'SEDANG PROSES'
                    : 'STANDBY'}
                </span>
              </span>
            </div>

            {/* Giant Timer Display */}
            <div className="bg-canvas border border-border-subtle rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <span className="text-xs text-ink-secondary flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-brand" />
                    <span>
                      {batch
                        ? metrics.isOverdue
                          ? 'Target Waktu Tercapai — Siap Diselesaikan'
                          : metrics.isPaused
                          ? 'Sisa Waktu (Dibekukan)'
                          : 'Sisa Waktu Siklus Batch'
                        : 'Durasi Standar Siklus WIP'}
                    </span>
                  </span>
                  <div
                    className={`text-4xl sm:text-6xl font-bold font-mono tabular-nums tracking-tight mt-1 ${
                      metrics.isOverdue
                        ? 'text-ink-emerald'
                        : metrics.isPaused
                        ? 'text-ink-amber'
                        : 'text-ink-primary'
                    }`}
                  >
                    {batch
                      ? metrics.isOverdue
                        ? '00:00'
                        : formatDurationMmSs(metrics.remainingMs)
                      : `${metrics.durationMinutes}:00`}
                  </div>
                </div>

                <div className="text-right font-mono tabular-nums">
                  <div className="text-2xl sm:text-3xl font-bold text-brand">
                    {batch ? `${metrics.progressPct}%` : '0%'}
                  </div>
                  <div className="text-xs text-ink-secondary">
                    Berjalan: {formatDurationMmSs(metrics.elapsedMs)} / {metrics.durationMinutes} mnt
                  </div>
                </div>
              </div>

              <div className="w-full h-3 bg-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    metrics.isOverdue
                      ? 'bg-emerald-500'
                      : metrics.isPaused
                      ? 'bg-amber-500'
                      : 'bg-cyan-500'
                  }`}
                  style={{ width: `${batch ? metrics.progressPct : 0}%` }}
                />
              </div>

              {!isManagement && batch && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border-subtle">
                  {metrics.isPaused && onResumeWipBatch && (
                    <button
                      type="button"
                      onClick={() => onResumeWipBatch(batch.id)}
                      className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Lanjutkan Batch</span>
                    </button>
                  )}
                  {!metrics.isPaused && onPauseWipBatch && (
                    <button
                      type="button"
                      onClick={() => setPauseModalBatch(batch)}
                      className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Jeda Batch</span>
                    </button>
                  )}
                  {onCompleteWipBatch && (
                    <button
                      type="button"
                      onClick={() => onCompleteWipBatch(batch.id)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Selesaikan &amp; Transfer ke Tangki</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Target Tank Gauge + Material Variance (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Target Tank */}
            <div className="bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cylinder className="w-5 h-5 text-brand" />
                  <span className="text-xs font-bold text-ink-secondary uppercase tracking-wider">
                    Tangki Tujuan Transfer
                  </span>
                </div>
                {metrics.targetTank && (
                  <span className="px-2 py-0.5 rounded bg-elevated border border-border-strong font-mono text-xs font-bold text-brand">
                    {metrics.targetTank.code}
                  </span>
                )}
              </div>

              {metrics.targetTank ? (
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold text-ink-primary truncate">
                      {metrics.targetTank.name}
                    </span>
                    <span className="text-xl font-bold font-mono tabular-nums text-ink-primary">
                      {metrics.targetTank.currentLevelKg.toFixed(1)}{' '}
                      <span className="text-xs font-normal text-ink-secondary">
                        / {metrics.targetTank.capacityKg.toFixed(0)} kg
                      </span>
                    </span>
                  </div>

                  <div className="w-full h-3 bg-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        metrics.targetTankFillPct >= 90
                          ? 'bg-amber-500'
                          : 'bg-cyan-500'
                      }`}
                      style={{ width: `${metrics.targetTankFillPct}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono tabular-nums text-ink-secondary">
                    <span>Terisi: {metrics.targetTankFillPct}%</span>
                    <span>Ruang Kosong: {metrics.targetTankHeadroomKg.toFixed(1)} kg</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-secondary py-3">
                  Belum ada tangki tujuan yang tertaut pada mesin/WIP ini.
                </div>
              )}
            </div>

            {/* Machine Material Variance */}
            <div className="bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg space-y-2.5 flex-1 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-secondary uppercase tracking-wider">
                  Material Variance &amp; Reject CK
                </span>
                <PackageX className="w-5 h-5 text-ink-rose" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold font-mono tabular-nums text-ink-primary">
                  {metrics.actualMaterialUsedKg.toFixed(2)} kg
                </span>
                <span className="text-xs font-mono font-bold text-ink-rose tabular-nums">
                  Reject: {metrics.totalRejectKg.toFixed(2)} kg ({metrics.materialVariancePct}%)
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums bg-canvas border border-border-subtle rounded-xl p-2.5">
                <div>
                  <span className="text-ink-secondary block">Standar Batch</span>
                  <strong className="text-ink-primary">{metrics.standardBomMaterialKg.toFixed(1)} kg</strong>
                </div>
                <div>
                  <span className="text-ink-secondary block">Batch Selesai</span>
                  <strong className="text-ink-emerald">{metrics.completedBatchesCount} batch</strong>
                </div>
                <div>
                  <span className="text-ink-secondary block">Loss Eq.</span>
                  <strong className="text-ink-amber">{metrics.rejectEquivalentCartons.toFixed(1)} ktn</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Active BOM Ingredients + Machine Reject Log */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Active BOM Ingredients */}
          <div className="lg:col-span-6 bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-primary">
                Komposisi Material BOM ({batch ? 'Batch Aktif' : metrics.activeWip?.name || 'WIP'})
              </h3>
              <span className="text-xs font-mono text-ink-secondary tabular-nums">
                {batch ? batch.materials.length : metrics.bomMaterials.length} item
              </span>
            </div>

            <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto">
              {batch ? (
                batch.materials.map((m, idx) => (
                  <div
                    key={`${m.materialId}_${idx}`}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-primary truncate">{m.materialName}</div>
                      <div className="text-[11px] font-mono text-ink-secondary">
                        {m.materialCode || m.materialId} · {m.sourceLocation}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-brand">
                        {(m.actualUsedKg || m.requiredKg).toFixed(2)} kg
                      </div>
                      <div className="text-[10px] text-ink-secondary">
                        Target: {m.requiredKg.toFixed(2)} kg
                      </div>
                    </div>
                  </div>
                ))
              ) : metrics.bomMaterials.length > 0 ? (
                metrics.bomMaterials.map(opt => (
                  <div
                    key={opt.material.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-primary truncate">{opt.material.name}</div>
                      <div className="text-[11px] font-mono text-ink-secondary">
                        {opt.material.code || opt.material.id} · {opt.defaultSourceLocation}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0 font-bold text-ink-primary">
                      {opt.kgPerBatch.toFixed(2)} kg/batch
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-ink-secondary">
                  Pilih atau jalankan Work Order WIP pada mesin ini untuk menampilkan rincian bahan BOM.
                </div>
              )}
            </div>
          </div>

          {/* Machine Reject History */}
          <div className="lg:col-span-6 bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-lg">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-primary">
                Riwayat Reject Material Mesin ({metrics.machineRejectLogs.length})
              </h3>
              <span className="text-xs font-mono font-bold text-ink-rose tabular-nums">
                {metrics.totalRejectKg.toFixed(2)} kg
              </span>
            </div>

            {metrics.machineRejectLogs.length > 0 ? (
              <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto">
                {metrics.machineRejectLogs.map(rej => (
                  <div
                    key={rej.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-primary truncate">
                        {rej.materialName} ·{' '}
                        <span className="text-ink-rose font-normal">
                          {getRejectCategoryLabel(rej.rejectCategory)}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-secondary font-mono truncate">
                        {new Date(rej.timestamp).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}{' '}
                        · {rej.operatorName} · {rej.sourceLocation}
                        {rej.notes ? ` · ${rej.notes}` : ''}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-ink-rose">{rej.rejectQtyKg.toFixed(2)} kg</div>
                      <div className="text-[10px] text-ink-amber">
                        -{rej.equivalentCartonsLoss.toFixed(2)} ktn
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-ink-secondary">
                Belum ada reject material tercatat pada mesin {machineCode} shift ini.
              </div>
            )}
          </div>
        </div>
      </main>

      <MaterialRejectDrawer
        open={isRejectDrawerOpen}
        onOpenChange={setIsRejectDrawerOpen}
        state={state}
        stationType="CENTRAL_KITCHEN"
        shift={shiftPeriod.shift}
        dateStr={shiftPeriod.operationalDate}
        machineId={machineId}
        machineName={machineName}
        skuId={batch?.skuId}
        skuName={batch?.skuName}
        wipId={batch?.wipId || metrics.activeWip?.id}
        wipName={batch?.wipName || metrics.activeWip?.name}
        recipeId={batch?.recipeId}
        onSubmitReject={onRecordMaterialReject}
      />

      {onPauseWipBatch && (
        <WipBatchPauseModal
          isOpen={Boolean(pauseModalBatch)}
          batch={pauseModalBatch}
          machineLabel={`${machineCode} · ${machineName}`}
          currentTime={nowMs}
          actorName={state.currentSession?.name || 'Operator'}
          onClose={() => setPauseModalBatch(null)}
          onConfirmPause={(bId, reason, category) => {
            onPauseWipBatch(bId, reason, category);
            setPauseModalBatch(null);
          }}
        />
      )}
    </div>
  );
};
