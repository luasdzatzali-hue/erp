import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  BarChart3,
  CalendarRange,
  FileSpreadsheet,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2
} from 'lucide-react';
import { AppState, ShiftNumber } from '../types';
import {
  buildSkuPlanVsActualSummary,
  SkuPlanVsActualRow
} from '../utils/weeklyPlanComparison';

interface WeeklyPlanVsActualChartProps {
  state: AppState;
  onScrollToWeeklyPlan?: () => void;
  onOpenSheetsSync?: () => void;
}

export const WeeklyPlanVsActualChart: React.FC<WeeklyPlanVsActualChartProps> = ({
  state,
  onScrollToWeeklyPlan,
  onOpenSheetsSync
}) => {
  const [shiftScope, setShiftScope] = useState<'ALL' | ShiftNumber>('ALL');
  const [actualWindow, setActualWindow] = useState<'ALL_LOGS' | 'TODAY'>('ALL_LOGS');
  const [chartMode, setChartMode] = useState<'COMPARE' | 'VARIANCE'>('COMPARE');
  const [showVarianceTable, setShowVarianceTable] = useState<boolean>(true);

  const isDaylight = state.theme === 'daylight' || state.theme === 'light';

  const summary = useMemo(
    () =>
      buildSkuPlanVsActualSummary(state, {
        shiftScope,
        dayScope: 'ALL',
        actualWindow
      }),
    [state, shiftScope, actualWindow]
  );

  const gridStroke = isDaylight ? '#cbd5e1' : '#1e293b';
  const axisTickColor = isDaylight ? '#475569' : '#94a3b8';

  const CustomTooltip = ({
    active,
    payload
  }: {
    active?: boolean;
    payload?: Array<{ payload: SkuPlanVsActualRow }>;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0].payload;
    const isSurplus = row.varianceCartons >= 0;

    return (
      <div
        className={`rounded-lg border px-3.5 py-2.5 shadow-xl text-xs space-y-1.5 min-w-[230px] ${
          isDaylight
            ? 'bg-white border-slate-300 text-slate-900'
            : 'bg-[#080c14]/95 border-slate-700 text-slate-100 backdrop-blur-md'
        }`}
      >
        <div className="border-b border-slate-700/40 pb-1.5">
          <p className="font-bold text-xs leading-snug">{row.skuName}</p>
          <p className="text-[11px] font-mono text-slate-400">
            {row.skuCode} · Line {row.lines}
          </p>
        </div>
        <div className="space-y-1 font-mono tabular-nums text-[11px]">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sky-400">Target Weekly Plan:</span>
            <span className="font-bold">{row.plannedCartons.toLocaleString('id-ID')} ktn</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-400">Realisasi Aktual:</span>
            <span className="font-bold">{row.actualCartons.toLocaleString('id-ID')} ktn</span>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-700/30">
            <span className={isSurplus ? 'text-emerald-400' : 'text-rose-400'}>
              Varians (Aktual - Plan):
            </span>
            <span className={`font-bold ${isSurplus ? 'text-emerald-400' : 'text-rose-400'}`}>
              {row.varianceCartons > 0 ? `+${row.varianceCartons.toLocaleString('id-ID')}` : row.varianceCartons.toLocaleString('id-ID')} ktn
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Capaian:</span>
            <span className="font-bold text-amber-400">{row.achievementPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      aria-label="Visualisasi Progres Planning Mingguan vs Aktual Produksi"
      className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] space-y-4 no-print"
    >
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/35 text-cyan-400 flex items-center justify-center shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Progres Planning Mingguan vs Aktual Produksi (Varians per SKU)
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
              {summary.plan ? (
                <>
                  <span className="text-cyan-400 font-semibold">{summary.plan.weekLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {summary.plan.periodStart} – {summary.plan.periodEnd}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{summary.rows.length} SKU</span>
                </>
              ) : (
                <span>Belum ada Weekly Production Plan aktif</span>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Chart Mode Segmented Buttons */}
          <div className="flex items-center p-0.5 bg-[#06090f]/90 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setChartMode('COMPARE')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                chartMode === 'COMPARE'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Plan vs Aktual
            </button>
            <button
              type="button"
              onClick={() => setChartMode('VARIANCE')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                chartMode === 'VARIANCE'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Varians (+/-)
            </button>
          </div>

          {/* Shift Filter */}
          <div className="flex items-center p-0.5 bg-[#06090f]/90 border border-slate-800 rounded-lg">
            {(['ALL', 1, 2, 3] as const).map(sh => (
              <button
                key={String(sh)}
                type="button"
                onClick={() => setShiftScope(sh)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-mono font-semibold transition whitespace-nowrap shrink-0 ${
                  shiftScope === sh
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sh === 'ALL' ? 'Semua Shift' : `S${sh}`}
              </button>
            ))}
          </div>

          {/* Actual Period Filter */}
          <div className="flex items-center p-0.5 bg-[#06090f]/90 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setActualWindow('ALL_LOGS')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                actualWindow === 'ALL_LOGS'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Akumulasi Log
            </button>
            <button
              type="button"
              onClick={() => setActualWindow('TODAY')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                actualWindow === 'TODAY'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hari Ini
            </button>
          </div>

          {onOpenSheetsSync && (
            <button
              type="button"
              onClick={onOpenSheetsSync}
              className="px-3 py-1.5 bg-[#06090f]/90 hover:bg-slate-800 border border-emerald-500/40 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sync Sheets</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty State when neither plan nor actual logs exist */}
      {!summary.plan && summary.rows.length === 0 ? (
        <div className="py-10 px-4 text-center bg-[#06090f]/75 border border-slate-800/80 rounded-xl space-y-3">
          <CalendarRange className="w-9 h-9 text-cyan-400 mx-auto opacity-80" />
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-white">
              Belum Ada Planning Mingguan Aktif untuk Divisualisasikan
            </h3>
            <p className="text-xs text-slate-400">
              Input mandiri atau unggah jadwal Weekly Production Plan terlebih dahulu untuk melihat grafik progres target vs realisasi produksi dan varians per SKU.
            </p>
          </div>
          {onScrollToWeeklyPlan && (
            <button
              type="button"
              onClick={onScrollToWeeklyPlan}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0"
            >
              <span>Input Planning Mingguan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 4-Column Quantitative Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <p className="text-[11px] text-slate-400">Total Target Plan</p>
              <p className="text-lg font-extrabold font-mono text-sky-400 tabular-nums mt-0.5">
                {summary.totalPlanned.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-400">ktn</span>
              </p>
            </div>

            <div className="bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <p className="text-[11px] text-slate-400">Realisasi Produksi Aktual</p>
              <p className="text-lg font-extrabold font-mono text-emerald-400 tabular-nums mt-0.5">
                {summary.totalActual.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-400">ktn</span>
              </p>
            </div>

            <div className="bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Varians Bersih</span>
                <span
                  className={`font-mono text-[10px] font-bold flex items-center gap-1 ${
                    summary.netVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {summary.netVariance >= 0 ? (
                    <>
                      <TrendingUp className="w-3 h-3" />
                      <span>Surplus</span>
                    </>
                  ) : (
                    <>
                      <TrendingDown className="w-3 h-3" />
                      <span>Defisit</span>
                    </>
                  )}
                </span>
              </p>
              <p
                className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${
                  summary.netVariance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {summary.netVariance > 0
                  ? `+${summary.netVariance.toLocaleString('id-ID')}`
                  : summary.netVariance.toLocaleString('id-ID')}{' '}
                <span className="text-xs font-normal text-slate-400">ktn</span>
              </p>
            </div>

            <div className="bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <p className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Capaian Keseluruhan</span>
                <span className="font-mono text-[10px] text-cyan-400 tabular-nums">
                  {summary.completedSkuCount}/{summary.totalActiveSkuCount} SKU Selesai
                </span>
              </p>
              <p className="text-lg font-extrabold font-mono text-white tabular-nums mt-0.5">
                {summary.overallPct.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Recharts Canvas */}
          <div className="bg-[#06090f]/75 border border-slate-800/80 rounded-xl p-3 sm:p-4">
            <div className="w-full h-[290px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'COMPARE' ? (
                  <BarChart
                    data={summary.rows}
                    margin={{ top: 12, right: 16, left: 4, bottom: 18 }}
                    barGap={6}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                      interval={0}
                      angle={summary.rows.length > 5 ? -15 : 0}
                      textAnchor={summary.rows.length > 5 ? 'end' : 'middle'}
                      height={summary.rows.length > 5 ? 52 : 32}
                    />
                    <YAxis
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val: number) => val.toLocaleString('id-ID')}
                    />
                    <Tooltip
                      cursor={{ fill: isDaylight ? 'rgba(15,23,42,0.05)' : 'rgba(148,163,184,0.08)' }}
                      content={<CustomTooltip />}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }}
                    />
                    <Bar
                      dataKey="plannedCartons"
                      name="Target Weekly Plan (Ktn)"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                    />
                    <Bar
                      dataKey="actualCartons"
                      name="Aktual Produksi (Ktn)"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={44}
                    />
                  </BarChart>
                ) : (
                  <BarChart
                    data={summary.rows}
                    margin={{ top: 12, right: 16, left: 4, bottom: 18 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                      interval={0}
                      angle={summary.rows.length > 5 ? -15 : 0}
                      textAnchor={summary.rows.length > 5 ? 'end' : 'middle'}
                      height={summary.rows.length > 5 ? 52 : 32}
                    />
                    <YAxis
                      tick={{ fill: axisTickColor, fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val: number) =>
                        val > 0 ? `+${val.toLocaleString('id-ID')}` : val.toLocaleString('id-ID')
                      }
                    />
                    <ReferenceLine y={0} stroke={isDaylight ? '#64748b' : '#475569'} strokeWidth={1.5} />
                    <Tooltip
                      cursor={{ fill: isDaylight ? 'rgba(15,23,42,0.05)' : 'rgba(148,163,184,0.08)' }}
                      content={<CustomTooltip />}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                    <Bar
                      dataKey="varianceCartons"
                      name="Varians Aktual vs Plan (Ktn)"
                      radius={[4, 4, 4, 4]}
                      maxBarSize={48}
                    >
                      {summary.rows.map(entry => (
                        <Cell
                          key={entry.key}
                          fill={entry.varianceCartons >= 0 ? '#10b981' : '#f43f5e'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Per-SKU Variance Ledger Table Toggle */}
          <div className="border-t border-slate-800/80 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">
                Rincian Varians per SKU ({summary.rows.length} Item)
              </span>
              <div className="flex items-center gap-2">
                {onScrollToWeeklyPlan && (
                  <button
                    type="button"
                    onClick={onScrollToWeeklyPlan}
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 whitespace-nowrap shrink-0"
                  >
                    Ubah Target Plan →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowVarianceTable(prev => !prev)}
                  className="px-2.5 py-1 bg-[#06090f]/80 hover:bg-slate-800 border border-slate-700/80 rounded-md text-[11px] font-semibold text-slate-300 whitespace-nowrap shrink-0"
                >
                  {showVarianceTable ? 'Sembunyikan Tabel' : 'Tampilkan Tabel'}
                </button>
              </div>
            </div>

            {showVarianceTable && (
              <div className="overflow-x-auto border border-slate-800/90 rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900/90 text-[11px] text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Kode &amp; Nama SKU</th>
                      <th className="py-2 px-3">Line</th>
                      <th className="py-2 px-3 text-right">Target Plan (Ktn)</th>
                      <th className="py-2 px-3 text-right">Aktual (Ktn)</th>
                      <th className="py-2 px-3 text-right">Varians (Ktn)</th>
                      <th className="py-2 px-3 text-right">Capaian</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {summary.rows.map(row => {
                      const isPositive = row.varianceCartons >= 0;
                      return (
                        <tr key={row.key} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2 px-3">
                            <div className="font-semibold text-white">{row.skuName}</div>
                            <div className="text-[10px] font-mono text-slate-400">{row.skuCode}</div>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-300">{row.lines}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-400 font-semibold">
                            {row.plannedCartons.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                            {row.actualCartons.toLocaleString('id-ID')}
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {row.varianceCartons > 0
                              ? `+${row.varianceCartons.toLocaleString('id-ID')}`
                              : row.varianceCartons.toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200 font-semibold">
                            {row.achievementPct.toFixed(1)}%
                          </td>
                          <td className="py-2 px-3 text-[11px] font-semibold">
                            {row.status === 'TERCAPAI' ? (
                              <span className="text-emerald-400 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Tercapai</span>
                              </span>
                            ) : row.status === 'PROSES' ? (
                              <span className="text-amber-400">Berjalan</span>
                            ) : row.status === 'UNPLANNED' ? (
                              <span className="text-cyan-400">Di Luar Plan</span>
                            ) : (
                              <span className="text-slate-400">Belum Mulai</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
