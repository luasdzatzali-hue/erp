import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, ShieldAlert } from 'lucide-react';
import { ScopedOeeAnalytics, SixBigLossParetoItem } from '../../utils/oeeEngine';

interface SixBigLossesParetoProps {
  analytics: ScopedOeeAnalytics;
  isDaylightTheme: boolean;
  onLogLossAction: (topCategory?: SixBigLossParetoItem) => void;
  onOpenShiftSummary: () => void;
}

interface ParetoChartPoint extends SixBigLossParetoItem {
  shortLabel: string;
  metricValue: number;
  isVital80: boolean;
}

const SHORT_LABELS: Record<SixBigLossParetoItem['key'], string> = {
  equipmentFailure: 'Breakdown',
  setupAdjustment: 'Setup/CO',
  idlingMinorStops: 'Idling',
  reducedSpeed: 'Slow Speed',
  processDefects: 'Reject/Cacat',
  reducedYield: 'Reduced Yield'
};

export const SixBigLossesPareto: React.FC<SixBigLossesParetoProps> = ({
  analytics,
  isDaylightTheme,
  onLogLossAction,
  onOpenShiftSummary
}) => {
  const [metricMode, setMetricMode] = useState<'MINUTES' | 'KG'>('MINUTES');

  const chartData = useMemo<ParetoChartPoint[]>(() => {
    let seenExceed80 = false;
    return analytics.sixBigLossesPareto.map(item => {
      const hasLoss = item.durationMinutes > 0 || item.equivalentLossKg > 0;
      const isVital80 = hasLoss && !seenExceed80;
      if (item.cumulativePct >= 80) {
        seenExceed80 = true;
      }
      return {
        ...item,
        shortLabel: SHORT_LABELS[item.key] || item.label,
        metricValue: metricMode === 'MINUTES' ? item.durationMinutes : item.equivalentLossKg,
        isVital80
      };
    });
  }, [analytics.sixBigLossesPareto, metricMode]);

  const topBottleneck = useMemo(() => {
    return (
      analytics.sixBigLossesPareto.find(
        item => item.durationMinutes > 0 || item.equivalentLossKg > 0
      ) || null
    );
  }, [analytics.sixBigLossesPareto]);

  const totalLossMinutes = useMemo(
    () =>
      Math.round(
        analytics.sixBigLossesPareto.reduce((sum, item) => sum + item.durationMinutes, 0) * 10
      ) / 10,
    [analytics.sixBigLossesPareto]
  );
  const totalLossKg = useMemo(
    () =>
      Math.round(
        analytics.sixBigLossesPareto.reduce((sum, item) => sum + item.equivalentLossKg, 0) * 10
      ) / 10,
    [analytics.sixBigLossesPareto]
  );

  const gridStroke = isDaylightTheme ? '#cbd5e1' : '#1e293b';
  const axisColor = isDaylightTheme ? '#475569' : '#94a3b8';

  const CustomTooltip = ({
    active,
    payload
  }: {
    active?: boolean;
    payload?: Array<{ payload: ParetoChartPoint }>;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;

    return (
      <div
        className={`rounded-lg border px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[230px] ${
          isDaylightTheme
            ? 'bg-white border-slate-300 text-slate-900'
            : 'bg-surface-header border-border-strong text-ink-primary'
        }`}
      >
        <div className="border-b border-border-subtle pb-1.5">
          <p className="font-bold text-xs">
            #{row.rank} {row.label}
          </p>
          <p className="text-[11px] font-mono text-ink-secondary">
            Pilar {row.pillar} · {row.isVital80 ? 'Zona Vital Pareto (≤80%)' : 'Dampak Sekunder'}
          </p>
        </div>
        <div className="space-y-1 font-mono tabular-nums text-[11px]">
          <div className="flex justify-between gap-4">
            <span className="text-ink-secondary">Durasi Loss:</span>
            <span className="font-bold text-ink-rose">{row.durationMinutes.toFixed(1)} menit</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-ink-secondary">Ekuivalen Material:</span>
            <span className="font-bold text-ink-amber">{row.equivalentLossKg.toFixed(2)} kg</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-ink-secondary">Ekuivalen Output:</span>
            <span className="font-bold text-ink-cyan">
              {row.equivalentLossCartons.toLocaleString('id-ID')} ktn
            </span>
          </div>
          <div className="flex justify-between gap-4 pt-1 border-t border-border-subtle">
            <span className="text-ink-secondary">Kontribusi / Kumulatif:</span>
            <span className="font-bold text-ink-primary">
              {row.contributionPct.toFixed(1)}% / {row.cumulativePct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Pareto Six Big Losses"
      className="bg-surface border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 h-full no-print"
    >
      {/* Header & Metric Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-tint-rose border border-tint-rose-border text-ink-rose flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-primary">
              Analisis Pareto Six Big Losses (80/20)
            </h2>
            <p className="text-[11px] font-mono text-ink-secondary tabular-nums mt-0.5">
              Total Loss: {totalLossMinutes} mnt · {totalLossKg.toFixed(1)} kg ekuivalen ·{' '}
              {analytics.lineName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-canvas border border-border-subtle p-1 rounded-lg self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setMetricMode('MINUTES')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 ${
              metricMode === 'MINUTES'
                ? 'bg-accent-primary text-accent-primary-foreground'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Durasi (Menit)
          </button>
          <button
            type="button"
            onClick={() => setMetricMode('KG')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap shrink-0 ${
              metricMode === 'KG'
                ? 'bg-accent-primary text-accent-primary-foreground'
                : 'text-ink-secondary hover:text-ink-primary'
            }`}
          >
            Material (Kg Loss)
          </button>
        </div>
      </div>

      {/* Top Bottleneck Insight Banner */}
      {topBottleneck ? (
        <div className="bg-canvas border border-tint-amber-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-ink-amber shrink-0 mt-0.5" />
            <div className="min-w-0">
              <span className="text-[11px] font-bold text-ink-amber block">
                Top Bottleneck Insight
              </span>
              <p className="text-xs text-ink-primary leading-relaxed mt-0.5">
                Loss terbesar berasal dari <strong>{topBottleneck.label}</strong> sebesar{' '}
                <strong className="font-mono tabular-nums text-ink-rose">
                  {topBottleneck.durationMinutes.toFixed(1)} menit
                </strong>{' '}
                (
                <strong className="font-mono tabular-nums">
                  {topBottleneck.contributionPct.toFixed(1)}%
                </strong>{' '}
                dari total loss · ekuivalen{' '}
                <span className="font-mono tabular-nums">
                  {topBottleneck.equivalentLossKg.toFixed(1)} kg
                </span>{' '}
                / {topBottleneck.equivalentLossCartons.toLocaleString('id-ID')} ktn).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onLogLossAction(topBottleneck)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Input / Audit Loss</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-canvas border border-tint-emerald-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-ink-emerald shrink-0" />
            <p className="text-xs text-ink-primary">
              Belum ada kerugian Six Big Losses tercatat pada filter ini. Lini beroperasi optimal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLogLossAction()}
            className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-subtle text-ink-primary text-xs font-semibold transition whitespace-nowrap shrink-0"
          >
            Catat Stop / Loss
          </button>
        </div>
      )}

      {/* Pareto Combo Chart (Bar + Cumulative %) */}
      <div className="w-full h-[265px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 8, left: -12, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="shortLabel"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={{ stroke: gridStroke }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              unit={metricMode === 'MINUTES' ? 'm' : 'kg'}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fill: axisColor, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              unit="%"
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              yAxisId="right"
              y={80}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: '80% Pareto',
                position: 'insideTopRight',
                fill: '#f59e0b',
                fontSize: 10
              }}
            />
            <Bar
              yAxisId="left"
              dataKey="metricValue"
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              onClick={data => {
                if (data?.payload) {
                  onLogLossAction(data.payload as ParetoChartPoint);
                }
              }}
              className="cursor-pointer"
            >
              {chartData.map((entry, idx) => {
                const fill = !entry.isVital80
                  ? '#38bdf8'
                  : idx === 0
                  ? '#f43f5e'
                  : '#f59e0b';
                return <Cell key={entry.key} fill={fill} />;
              })}
            </Bar>
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativePct"
              stroke="#22d3ee"
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#22d3ee', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Legend & Shift Summary Link */}
      <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-ink-secondary">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
            <span>#1 Bottleneck</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
            <span>Kontributor Vital ≤80%</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-400 inline-block" />
            <span>Sekunder (&gt;80%)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
            <span>Garis Kumulatif %</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenShiftSummary}
          className="text-accent-primary hover:underline font-sans font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>Detail Rekap Shift</span>
        </button>
      </div>
    </section>
  );
};
