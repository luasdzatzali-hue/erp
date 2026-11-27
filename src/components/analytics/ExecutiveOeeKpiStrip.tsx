import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Filter,
  Gauge,
  Layers,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import { ProductionLine, ShiftNumber } from '../../types';
import { ScopedOeeAnalytics } from '../../utils/oeeEngine';

interface ExecutiveOeeKpiStripProps {
  analytics: ScopedOeeAnalytics;
  currentLiveShift: ShiftNumber;
  shiftScope: 'ALL' | ShiftNumber;
  onChangeShiftScope: (scope: 'ALL' | ShiftNumber) => void;
  lineScope: string;
  onChangeLineScope: (lineId: string) => void;
  lines: ProductionLine[];
}

interface RadialMiniGaugeProps {
  valuePct: number;
  targetPct: number;
  strokeColor: string;
}

const RadialMiniGauge: React.FC<RadialMiniGaugeProps> = ({ valuePct, targetPct, strokeColor }) => {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, valuePct));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center" aria-hidden="true">
      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          className="text-elevated"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 220ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <span className="absolute text-[9px] font-mono font-bold text-ink-secondary tabular-nums">
        {Math.round(targetPct)}%
      </span>
    </div>
  );
};

interface OeeKpiCardProps {
  title: string;
  subtitle: string;
  valuePct: number;
  targetPct: number;
  footerLabel: string;
  strokeColor: string;
  barColorClass: string;
  icon: React.ReactNode;
  isAnomaly?: boolean;
  anomalyTitle?: string;
}

const OeeKpiCard: React.FC<OeeKpiCardProps> = ({
  title,
  subtitle,
  valuePct,
  targetPct,
  footerLabel,
  strokeColor,
  barColorClass,
  icon,
  isAnomaly,
  anomalyTitle
}) => {
  const delta = Math.round((valuePct - targetPct) * 10) / 10;
  const isPositive = delta >= 0;

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
            {icon}
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-baseline gap-2 mt-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-ink-primary tabular-nums tracking-tight">
              {valuePct.toFixed(1)}%
            </span>
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold tabular-nums whitespace-nowrap shrink-0 ${
                isPositive ? 'text-ink-emerald' : 'text-ink-rose'
              }`}
              title={`Selisih terhadap target shift ${targetPct}%`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5" />
              )}
              <span>
                {isPositive ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
              </span>
            </span>
          </div>
        </div>

        <RadialMiniGauge valuePct={valuePct} targetPct={targetPct} strokeColor={strokeColor} />
      </div>

      <div className="space-y-1.5">
        <div className="relative w-full h-1.5 bg-canvas border border-border-subtle rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${barColorClass}`}
            style={{
              width: `${Math.max(2, Math.min(100, valuePct))}%`,
              transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-ink-primary/70"
            style={{ left: `${Math.min(99, targetPct)}%` }}
            title={`Target standar shift: ${targetPct}%`}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-ink-secondary tabular-nums">
          <span className="truncate">{subtitle}</span>
          <span className="shrink-0">Target {targetPct}%</span>
        </div>

        <div className="pt-1.5 border-t border-border-subtle flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
          <span className="text-ink-secondary truncate">{footerLabel}</span>
          {isAnomaly ? (
            <span
              className="inline-flex items-center gap-1 text-ink-amber font-bold shrink-0"
              title={anomalyTitle}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Cek Cycle Time</span>
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-1 font-semibold shrink-0 ${
                isPositive ? 'text-ink-emerald' : 'text-ink-amber'
              }`}
            >
              {isPositive ? (
                <>
                  <CheckCircle2 className="w-3 h-3" />
                  <span>On Target</span>
                </>
              ) : (
                <span>Di Bawah Target</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const ExecutiveOeeKpiStrip: React.FC<ExecutiveOeeKpiStripProps> = ({
  analytics,
  currentLiveShift,
  shiftScope,
  onChangeShiftScope,
  lineScope,
  onChangeLineScope,
  lines
}) => {
  const shiftButtons: { id: 'ALL' | ShiftNumber; label: string }[] = [
    { id: currentLiveShift, label: `Shift Aktif (S${currentLiveShift})` },
    { id: 'ALL', label: 'Semua Shift (24j)' },
    ...([1, 2, 3] as ShiftNumber[])
      .filter(s => s !== currentLiveShift)
      .map(s => ({ id: s, label: `Shift ${s}` }))
  ];

  const oeeStroke =
    analytics.oeeScore >= analytics.targetOeePct
      ? '#10b981'
      : analytics.oeeScore >= 65
      ? '#f59e0b'
      : '#f43f5e';
  const availStroke =
    analytics.availability >= analytics.availabilityTargetPct ? '#10b981' : '#06b6d4';
  const perfStroke =
    analytics.performance >= analytics.performanceTargetPct ? '#10b981' : '#f59e0b';
  const qualStroke = analytics.quality >= analytics.qualityTargetPct ? '#10b981' : '#a855f7';

  return (
    <section aria-label="Executive OEE KPI Strip" className="space-y-3 no-print">
      {/* Quick Filter Toolbar */}
      <div className="bg-surface border border-border-subtle rounded-xl px-3.5 py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-ink-primary flex items-center gap-1.5 whitespace-nowrap">
            <Gauge className="w-4 h-4 text-accent-primary shrink-0" />
            <span>Indikator OEE Eksekutif</span>
          </span>
          <span className="text-ink-secondary hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
            {analytics.lineName} ·{' '}
            {shiftScope === 'ALL'
              ? `Agregasi ${analytics.activeShiftCount} Shift Aktif`
              : `Shift ${shiftScope}`}{' '}
            · {analytics.totalOutputCartons.toLocaleString('id-ID')} ktn total
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Shift Filter Segmented Bar */}
          <div
            className="flex items-center gap-1 bg-canvas border border-border-subtle p-1 rounded-lg overflow-x-auto no-scrollbar"
            role="group"
            aria-label="Filter Shift OEE"
          >
            {shiftButtons.map(btn => {
              const isActive = shiftScope === btn.id;
              return (
                <button
                  key={String(btn.id)}
                  type="button"
                  onClick={() => onChangeShiftScope(btn.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-accent-primary text-accent-primary-foreground shadow-xs'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>

          {/* Line Filter Selector */}
          <div className="flex items-center gap-1.5 bg-canvas border border-border-subtle rounded-lg px-2.5 py-1">
            <Filter className="w-3.5 h-3.5 text-accent-primary shrink-0" />
            <label htmlFor="oee-line-scope-select" className="sr-only">
              Pilih Line Produksi
            </label>
            <select
              id="oee-line-scope-select"
              value={lineScope}
              onChange={e => onChangeLineScope(e.target.value)}
              className="bg-transparent text-xs font-semibold text-ink-primary focus:outline-none pr-1"
            >
              <option value="ALL" className="bg-surface text-ink-primary">
                Semua Line ({lines.length})
              </option>
              {lines.map(line => (
                <option key={line.id} value={line.id} className="bg-surface text-ink-primary">
                  {line.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        <OeeKpiCard
          title="Overall OEE"
          subtitle="A × P × Q Komposit"
          valuePct={analytics.oeeScore}
          targetPct={analytics.targetOeePct}
          footerLabel={`${analytics.goodOutputCartons.toLocaleString('id-ID')} ktn baik`}
          strokeColor={oeeStroke}
          barColorClass={
            analytics.oeeScore >= analytics.targetOeePct
              ? 'bg-emerald-500'
              : analytics.oeeScore >= 65
              ? 'bg-amber-500'
              : 'bg-rose-500'
          }
          icon={<Gauge className="w-3.5 h-3.5 text-accent-primary shrink-0" />}
        />

        <OeeKpiCard
          title="Availability Rate"
          subtitle="Waktu Operasi / Terencana"
          valuePct={analytics.availability}
          targetPct={analytics.availabilityTargetPct}
          footerLabel={`${analytics.operatingTimeMinutes.toFixed(0)} / ${analytics.plannedProductionTimeMinutes.toFixed(0)} mnt`}
          strokeColor={availStroke}
          barColorClass={
            analytics.availability >= analytics.availabilityTargetPct
              ? 'bg-emerald-500'
              : 'bg-cyan-500'
          }
          icon={<Activity className="w-3.5 h-3.5 text-ink-cyan shrink-0" />}
        />

        <OeeKpiCard
          title="Performance Rate"
          subtitle="Output Aktual vs Cycle Time"
          valuePct={analytics.performance}
          targetPct={analytics.performanceTargetPct}
          footerLabel={`${analytics.totalOutputCartons.toLocaleString('id-ID')} ktn aktual`}
          strokeColor={perfStroke}
          barColorClass={
            analytics.performance >= analytics.performanceTargetPct
              ? 'bg-emerald-500'
              : 'bg-amber-500'
          }
          icon={<TrendingUp className="w-3.5 h-3.5 text-ink-amber shrink-0" />}
          isAnomaly={analytics.hasCycleTimeAnomaly}
          anomalyTitle={analytics.anomalyReason}
        />

        <OeeKpiCard
          title="Quality Rate"
          subtitle="Good Output vs Scrap & BOM"
          valuePct={analytics.quality}
          targetPct={analytics.qualityTargetPct}
          footerLabel={`Var BOM: ${
            analytics.materialVariancePct > 0
              ? `+${analytics.materialVariancePct.toFixed(1)}%`
              : `${analytics.materialVariancePct.toFixed(1)}%`
          }`}
          strokeColor={qualStroke}
          barColorClass={
            analytics.quality >= analytics.qualityTargetPct ? 'bg-emerald-500' : 'bg-purple-500'
          }
          icon={<ShieldCheck className="w-3.5 h-3.5 text-ink-purple shrink-0" />}
        />
      </div>
    </section>
  );
};
