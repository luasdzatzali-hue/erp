import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Cylinder,
  Gauge,
  Moon,
  Package,
  PackageX,
  Plus,
  ShieldAlert,
  Sun,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { AppState, MaterialRejectLog } from '../../types';
import { formatIndonesianDate, getShiftPeriodInfo, SHIFTS_CONFIG } from '../../utils/shifts';
import { resolveEffectiveRole } from '../../utils/roleAccess';
import { computeLineVarianceAndSbl, getRejectCategoryLabel } from '../../utils/rejectAnalytics';
import { MaterialRejectDrawer } from '../MaterialRejectDrawer';

interface LineStationMonitorViewProps {
  state: AppState;
  lineId: string;
  theme?: 'midnight' | 'daylight' | 'light' | 'dark';
  onToggleTheme?: () => void;
  onExitMonitor: () => void;
  onRecordMaterialReject: (log: MaterialRejectLog) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ) => void;
}

export const LineStationMonitorView: React.FC<LineStationMonitorViewProps> = ({
  state,
  lineId,
  theme,
  onToggleTheme,
  onExitMonitor,
  onRecordMaterialReject,
  onProduceCartons
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isRejectDrawerOpen, setIsRejectDrawerOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveRole = resolveEffectiveRole(state);
  const isManagement = effectiveRole.isManagement;
  const isDaylight = theme === 'daylight' || theme === 'light';

  const shiftPeriod = useMemo(() => getShiftPeriodInfo(new Date(nowMs)), [nowMs]);
  const shiftMeta = SHIFTS_CONFIG[shiftPeriod.shift];
  const line = (state.master.productionLines || []).find(l => l.id === lineId);
  const lineName = line?.name || lineId;
  const lineCode = line?.code || lineId.toUpperCase();

  const metrics = useMemo(
    () =>
      computeLineVarianceAndSbl({
        state,
        lineId,
        dateStr: shiftPeriod.operationalDate,
        shift: shiftPeriod.shift,
        nowMs
      }),
    [state, lineId, shiftPeriod.operationalDate, shiftPeriod.shift, nowMs]
  );

  const activeRun = metrics.activeRun;
  const latestRun = metrics.latestRun;
  const activeSku = latestRun ? state.master.skus.find(s => s.id === latestRun.skuId) : undefined;
  const isBehind = metrics.liveVarianceCartons < 0;
  const isStoppedShortage = !activeRun && latestRun?.completionStatus === 'STOPPED_SHORTAGE';
  const isStoppedSbl = !activeRun && latestRun?.completionStatus === 'STOPPED_SBL';

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
              <span className="px-2 py-0.5 rounded-md bg-cyan-600 text-white font-mono text-xs font-bold shrink-0">
                {lineCode}
              </span>
              <h1 className="text-sm sm:text-base font-bold text-ink-primary truncate">
                {lineName}
              </h1>
            </div>
            <p className="text-[11px] text-ink-secondary font-mono truncate">
              {formatIndonesianDate(new Date(nowMs))} · {shiftMeta.name} ({shiftMeta.timeRange})
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
        {/* Top Row: Active SKU Hero + Live Production Variance + Material Variance */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Active SKU & Output Progress (6 cols) */}
          <div
            className={`lg:col-span-6 bg-surface rounded-2xl p-5 border shadow-lg flex flex-col justify-between gap-4 ${
              activeRun
                ? 'border-emerald-500/45'
                : isStoppedSbl
                ? 'border-rose-500/50'
                : isStoppedShortage
                ? 'border-amber-500/50'
                : 'border-border-subtle'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-ink-secondary font-medium">
                  <Package className="w-4 h-4 text-brand shrink-0" />
                  <span>SKU Produksi Aktif · {shiftMeta.shortLabel}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-ink-primary mt-1 leading-tight">
                  {activeSku?.name || latestRun?.skuName || 'Belum Ada SKU Aktif'}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs font-mono text-ink-secondary">
                  <span>{activeSku?.code || latestRun?.skuCode || 'STANDBY'}</span>
                  {activeSku?.isKite && (
                    <>
                      <span>·</span>
                      <span className="text-ink-amber font-bold">KITE EKSPOR</span>
                    </>
                  )}
                  {latestRun?.operatorName && (
                    <>
                      <span>·</span>
                      <span>Op: {latestRun.operatorName}</span>
                    </>
                  )}
                </div>
              </div>

              <span
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border shrink-0 flex items-center gap-1.5 ${
                  activeRun
                    ? 'bg-emerald-500/15 text-ink-emerald border-emerald-500/40'
                    : isStoppedSbl
                    ? 'bg-rose-500/15 text-ink-rose border-rose-500/40'
                    : isStoppedShortage
                    ? 'bg-amber-500/15 text-ink-amber border-amber-500/40'
                    : 'bg-elevated text-ink-secondary border-border-strong'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>
                  {activeRun
                    ? `BERJALAN (${activeRun.speedMultiplier || 1}x)`
                    : isStoppedSbl
                    ? 'STOP · SIX BIG LOSSES'
                    : isStoppedShortage
                    ? 'STOP · MATERIAL SHORTAGE'
                    : 'STANDBY'}
                </span>
              </span>
            </div>

            {/* Big HMI Output Numbers */}
            <div className="bg-canvas border border-border-subtle rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="text-xs text-ink-secondary block">Output Karton Aktual</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-4xl sm:text-5xl font-bold font-mono tabular-nums text-ink-primary tracking-tight">
                      {metrics.actualCartons.toLocaleString()}
                    </span>
                    <span className="text-sm sm:text-base font-mono text-ink-secondary tabular-nums">
                      / {metrics.plannedCartons.toLocaleString()} ktn
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-ink-emerald">
                    {metrics.progressPct}%
                  </span>
                  <span className="text-xs font-mono text-ink-secondary block tabular-nums">
                    Sisa: {Math.max(0, metrics.plannedCartons - metrics.actualCartons).toLocaleString()} ktn
                  </span>
                </div>
              </div>

              <div className="w-full h-3 bg-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    activeRun ? 'bg-emerald-500' : isStoppedSbl ? 'bg-rose-500' : 'bg-cyan-500'
                  }`}
                  style={{ width: `${metrics.progressPct}%` }}
                />
              </div>

              {!isManagement && activeRun && onProduceCartons && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border-subtle">
                  <span className="text-[11px] text-ink-secondary">
                    Catat output manual cepat:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {[10, 50, 100].map(qty => (
                      <button
                        key={qty}
                        type="button"
                        onClick={() =>
                          onProduceCartons(
                            activeRun.skuId,
                            qty,
                            state.currentSession?.name,
                            `Input cepat Kiosk ${lineName}`,
                            undefined,
                            activeRun.id,
                            lineId,
                            lineName
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-xs font-mono font-bold text-ink-primary flex items-center gap-1 transition"
                      >
                        <Plus className="w-3 h-3 text-ink-emerald" />
                        <span>{qty} ktn</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Production Variance Card (3 cols) */}
          <div className="lg:col-span-3 bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-secondary uppercase tracking-wider">
                Live Production Variance
              </span>
              <Gauge className={`w-5 h-5 ${isBehind ? 'text-ink-rose' : 'text-ink-emerald'}`} />
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                {isBehind ? (
                  <TrendingDown className="w-6 h-6 text-ink-rose shrink-0" />
                ) : (
                  <TrendingUp className="w-6 h-6 text-ink-emerald shrink-0" />
                )}
                <span
                  className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${
                    isBehind ? 'text-ink-rose' : 'text-ink-emerald'
                  }`}
                >
                  {metrics.liveVarianceCartons >= 0 ? '+' : ''}
                  {metrics.liveVarianceCartons.toLocaleString()}
                </span>
                <span className="text-xs font-mono text-ink-secondary">ktn</span>
              </div>
              <div
                className={`text-lg font-bold font-mono tabular-nums ${
                  isBehind ? 'text-ink-rose' : 'text-ink-emerald'
                }`}
              >
                {metrics.liveVariancePct >= 0 ? '+' : ''}
                {metrics.liveVariancePct}% vs Target Jam
              </div>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Standar Kecepatan:</span>
                <strong className="text-ink-primary">{metrics.targetPerHour} ktn/jam</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Laju Aktual:</span>
                <strong className={isBehind ? 'text-ink-rose' : 'text-ink-emerald'}>
                  {metrics.actualRatePerHour} ktn/jam
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Target Berjalan ({metrics.elapsedMinutes}m):</span>
                <strong className="text-ink-primary">{metrics.expectedStandardCartons.toLocaleString()} ktn</strong>
              </div>
            </div>
          </div>

          {/* Material Variance Card (3 cols) */}
          <div className="lg:col-span-3 bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-secondary uppercase tracking-wider">
                Material Variance
              </span>
              <PackageX className={`w-5 h-5 ${metrics.totalRejectKg > 0 ? 'text-ink-amber' : 'text-brand'}`} />
            </div>

            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-ink-primary">
                  {metrics.actualMaterialUsedKg.toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                </span>
                <span className="text-xs font-mono text-ink-secondary">kg aktual</span>
              </div>
              <div className="text-sm font-mono font-bold tabular-nums text-ink-amber">
                +{metrics.totalRejectKg.toFixed(2)} kg Reject ({metrics.materialVariancePct}%)
              </div>
            </div>

            <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1.5 text-xs font-mono tabular-nums">
              <div className="flex justify-between">
                <span className="text-ink-secondary">Standar BOM Output:</span>
                <strong className="text-ink-primary">{metrics.standardBomMaterialKg.toFixed(2)} kg</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-secondary">Total Reject Material:</span>
                <strong className="text-ink-rose">{metrics.totalRejectKg.toFixed(2)} kg</strong>
              </div>
              <div className="flex justify-between border-t border-border-subtle pt-1">
                <span className="text-ink-secondary">Ekuivalen Loss:</span>
                <strong className="text-ink-amber">{metrics.rejectEquivalentCartons.toFixed(2)} ktn</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Row: Connected WIP Holding Tanks + Six Big Losses (3 Pillars) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Holding Tanks Connected to Line (5 cols) */}
          <div className="lg:col-span-5 bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cylinder className="w-5 h-5 text-brand" />
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">
                    Level Holding Tank WIP Terhubung
                  </h3>
                  <p className="text-[11px] text-ink-secondary">
                    Suplai WIP untuk {activeSku?.name || 'SKU Line ini'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-ink-secondary tabular-nums">
                {metrics.connectedTanks.length} tangki
              </span>
            </div>

            {metrics.connectedTanks.length > 0 ? (
              <div className="space-y-3">
                {metrics.connectedTanks.map(ct => (
                  <div
                    key={ct.tank.id}
                    className={`bg-canvas rounded-xl p-3.5 border space-y-2 ${
                      ct.isLow ? 'border-rose-500/50' : 'border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-brand">
                            {ct.tank.code}
                          </span>
                          <span className="text-xs font-bold text-ink-primary truncate">
                            {ct.tank.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-secondary truncate mt-0.5">
                          {ct.wipName} · {ct.kgPerCarton.toFixed(2)} kg/ktn
                        </p>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className={`text-base font-bold ${ct.isLow ? 'text-ink-rose' : 'text-ink-emerald'}`}>
                          {ct.tank.currentLevelKg.toFixed(1)} kg
                        </div>
                        <div className="text-[10px] text-ink-secondary">
                          {ct.fillPct}% · ~{ct.possibleCartons.toLocaleString()} ktn
                        </div>
                      </div>
                    </div>

                    <div className="w-full h-2.5 bg-elevated rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          ct.isLow ? 'bg-rose-500' : ct.fillPct < 30 ? 'bg-amber-500' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${ct.fillPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-canvas border border-border-subtle rounded-xl p-6 text-center text-xs text-ink-secondary">
                Belum ada Holding Tank WIP terhubung dengan SKU aktif pada line ini.
              </div>
            )}
          </div>

          {/* Six Big Losses 3-Pillar Breakdown (7 cols) */}
          <div className="lg:col-span-7 bg-surface border border-border-subtle rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-ink-rose" />
                <div>
                  <h3 className="text-sm font-bold text-ink-primary">
                    Six Big Losses (SBL) Stasiun · {shiftMeta.shortLabel}
                  </h3>
                  <p className="text-[11px] text-ink-secondary">
                    Akumulasi 3 pilar rugi produksi: Availability, Performance &amp; Quality Loss
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-ink-rose tabular-nums">
                Total Loss: {metrics.totalSblLossMinutes} mnt
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Pillar 1: Availability Loss */}
              <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold text-ink-secondary uppercase">
                  1. Availability Loss
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-ink-rose">
                  {metrics.availabilityLossMinutes} <span className="text-xs font-normal">mnt</span>
                </div>
                <p className="text-[11px] text-ink-secondary">
                  Downtime stop &amp; breakdown ({metrics.availabilityStopsCount} kejadian)
                </p>
              </div>

              {/* Pillar 2: Performance Loss */}
              <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold text-ink-secondary uppercase">
                  2. Performance Loss
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-ink-amber">
                  {metrics.performanceLossCartons.toLocaleString()} <span className="text-xs font-normal">ktn</span>
                </div>
                <p className="text-[11px] text-ink-secondary font-mono tabular-nums">
                  Speed variance (~{metrics.performanceLossMinutes} mnt)
                </p>
              </div>

              {/* Pillar 3: Quality Loss */}
              <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 space-y-1.5">
                <span className="text-[11px] font-bold text-ink-secondary uppercase">
                  3. Quality Loss (Reject)
                </span>
                <div className="text-2xl font-bold font-mono tabular-nums text-ink-purple">
                  {metrics.qualityLossCartons.toFixed(1)} <span className="text-xs font-normal">ktn eq</span>
                </div>
                <p className="text-[11px] text-ink-secondary font-mono tabular-nums">
                  {metrics.qualityLossKg.toFixed(2)} kg reject (~{metrics.qualityLossMinutes} mnt)
                </p>
              </div>
            </div>

            {/* Recent Reject Logs on this Line */}
            <div className="bg-canvas border border-border-subtle rounded-xl overflow-hidden">
              <div className="px-3.5 py-2.5 border-b border-border-subtle flex items-center justify-between text-xs">
                <span className="font-bold text-ink-primary">
                  Log Reject Material Line Ini ({metrics.lineRejectLogs.length})
                </span>
                {metrics.lineStopLogs.length > 0 && (
                  <span className="text-[11px] font-mono text-ink-rose flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {metrics.lineStopLogs.length} henti line
                  </span>
                )}
              </div>
              {metrics.lineRejectLogs.length > 0 ? (
                <div className="divide-y divide-border-subtle max-h-56 overflow-y-auto">
                  {metrics.lineRejectLogs.map(rej => (
                    <div
                      key={rej.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
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
                          · {rej.operatorName} · Potong {rej.sourceLocation}
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
                <div className="p-4 text-center text-xs text-ink-secondary">
                  Belum ada reject material tercatat pada {lineName} shift ini.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <MaterialRejectDrawer
        open={isRejectDrawerOpen}
        onOpenChange={setIsRejectDrawerOpen}
        state={state}
        stationType="LINE"
        shift={shiftPeriod.shift}
        dateStr={shiftPeriod.operationalDate}
        lineId={lineId}
        lineName={lineName}
        skuId={latestRun?.skuId}
        skuName={activeSku?.name || latestRun?.skuName}
        skuCode={activeSku?.code || latestRun?.skuCode}
        onSubmitReject={onRecordMaterialReject}
      />
    </div>
  );
};
