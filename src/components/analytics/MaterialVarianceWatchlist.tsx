import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileWarning,
  Layers,
  MessageSquarePlus,
  X
} from 'lucide-react';
import { AppState, MaterialRejectLog, RejectCategory, ShiftNumber } from '../../types';
import { getShiftFromTime } from '../../utils/shifts';
import {
  computeEquivalentCartonsLoss,
  getMaterialsForSkuBom,
  REJECT_CATEGORIES
} from '../../utils/rejectAnalytics';
import { reconcileMaterialBomVariance } from '../../utils/productionReconcile';
import { useOptionalErp } from '../../context/ErpContext';

interface MaterialVarianceWatchlistProps {
  state: AppState;
  dateStr: string;
  shiftScope: 'ALL' | ShiftNumber;
  lineScope: string;
  onJumpToPemakaian: () => void;
}

export type VarianceSeverity = 'CRITICAL' | 'WARNING' | 'SAFE';

export interface BomVarianceWatchRow {
  rowKey: string;
  lineId: string;
  lineName: string;
  skuId: string;
  skuName: string;
  skuCode: string;
  wipId: string;
  wipName: string;
  materialId: string;
  materialName: string;
  materialCode: string;
  cartonsProduced: number;
  standardBomKg: number;
  actualUsedKg: number;
  loggedRejectKg: number;
  varianceKg: number;
  variancePct: number;
  severity: VarianceSeverity;
  latestNote?: string;
}

export const MaterialVarianceWatchlist: React.FC<MaterialVarianceWatchlistProps> = ({
  state,
  dateStr,
  shiftScope,
  lineScope,
  onJumpToPemakaian
}) => {
  const erp = useOptionalErp();
  const [rootCauseRow, setRootCauseRow] = useState<BomVarianceWatchRow | null>(null);
  const [rcCategory, setRcCategory] = useState<RejectCategory>('ADONAN_TERBUANG');
  const [rcScrapKg, setRcScrapKg] = useState<string>('0');
  const [rcNotes, setRcNotes] = useState<string>('');
  const [localNotesByRow, setLocalNotesByRow] = useState<Record<string, string>>({});

  const watchlistRows = useMemo<BomVarianceWatchRow[]>(() => {
    const runs =
      state.activeSkuRuns && state.activeSkuRuns.length > 0
        ? state.activeSkuRuns
        : state.activeSkuRun
        ? [state.activeSkuRun]
        : [];
    const lines = state.master.productionLines || [];
    const matchesShift = (s?: ShiftNumber) => shiftScope === 'ALL' || !s || s === shiftScope;

    // Group active/shift SKU output per line+SKU
    const skuRunMap = new Map<
      string,
      { lineId: string; lineName: string; skuId: string; cartons: number }
    >();

    for (const r of runs) {
      if (r.startedAt.slice(0, 10) !== dateStr) continue;
      if (!matchesShift(r.shift)) continue;
      const lId = r.lineId || 'unassigned';
      if (lineScope !== 'ALL' && lId !== lineScope) continue;
      const key = `${lId}__${r.skuId}`;
      const existing = skuRunMap.get(key);
      const cartons = r.cartonsProducedTotal || 0;
      if (!existing) {
        skuRunMap.set(key, {
          lineId: lId,
          lineName: r.lineName || lines.find(l => l.id === lId)?.name || 'Line Umum',
          skuId: r.skuId,
          cartons
        });
      } else {
        existing.cartons = Math.max(existing.cartons, cartons);
      }
    }

    for (const cp of state.transactions.cartonProductions || []) {
      if (cp.timestamp.slice(0, 10) !== dateStr) continue;
      const cpShift = cp.shift || getShiftFromTime(cp.timestamp).shift;
      if (!matchesShift(cpShift)) continue;
      const lId = cp.lineId || 'unassigned';
      if (lineScope !== 'ALL' && lId !== lineScope) continue;
      const key = `${lId}__${cp.skuId}`;
      const existing = skuRunMap.get(key);
      if (!existing) {
        skuRunMap.set(key, {
          lineId: lId,
          lineName: cp.lineName || lines.find(l => l.id === lId)?.name || 'Line Umum',
          skuId: cp.skuId,
          cartons: cp.cartonsProduced || 0
        });
      } else {
        existing.cartons += cp.cartonsProduced || 0;
      }
    }

    // Also include SKUs that have material usages or rejects today even if 0 cartons yet
    for (const u of state.transactions.usages || []) {
      if (u.date !== dateStr || !matchesShift(u.shift) || !u.skuId) continue;
      if (lineScope !== 'ALL') {
        const hasLineMatch = Array.from(skuRunMap.values()).some(
          v => v.skuId === u.skuId && v.lineId === lineScope
        );
        if (!hasLineMatch) continue;
      }
      const alreadyTracked = Array.from(skuRunMap.values()).some(v => v.skuId === u.skuId);
      if (!alreadyTracked) {
        const defaultLine =
          lineScope !== 'ALL'
            ? lines.find(l => l.id === lineScope)
            : lines[0];
        const lId = defaultLine?.id || 'unassigned';
        skuRunMap.set(`${lId}__${u.skuId}`, {
          lineId: lId,
          lineName: defaultLine?.name || 'Line Umum',
          skuId: u.skuId,
          cartons: 0
        });
      }
    }

    const rows: BomVarianceWatchRow[] = [];

    for (const entry of skuRunMap.values()) {
      const sku = state.master.skus.find(s => s.id === entry.skuId);
      if (!sku) continue;
      const bomMats = getMaterialsForSkuBom(state, sku.id);
      if (bomMats.length === 0) continue;

      for (const bm of bomMats) {
        const matchingUsages = (state.transactions.usages || []).filter(
          u =>
            u.date === dateStr &&
            matchesShift(u.shift) &&
            u.skuId === sku.id &&
            u.materialId === bm.material.id
        );
        const explicitUsageKg = matchingUsages.reduce((s, u) => s + (u.usageQty || 0), 0);

        const matchingRejects = (state.transactions.rejectLogs || []).filter(rej => {
          if (rej.date !== dateStr || !matchesShift(rej.shift)) return false;
          if (rej.materialId !== bm.material.id) return false;
          if (rej.skuId && rej.skuId !== sku.id) return false;
          if (lineScope !== 'ALL' && rej.stationType === 'LINE' && rej.lineId && rej.lineId !== lineScope) {
            return false;
          }
          return true;
        });

        const loggedRejectKg = matchingRejects.reduce((s, r) => s + (r.rejectQtyKg || 0), 0);
        const startupRejectKg = matchingRejects
          .filter(r => r.rejectCategory === 'SETTING_AWAL')
          .reduce((s, r) => s + (r.rejectQtyKg || 0), 0);

        const reconciled = reconcileMaterialBomVariance({
          actualCartons: entry.cartons,
          standardBomKgPerCarton: bm.kgPerCartonSku,
          actualMaterialUsedKg: matchingUsages.length > 0 ? explicitUsageKg : undefined,
          loggedRejectKg,
          startupRejectKg
        });

        // Skip entries that have zero activity across both output and consumption/rejects
        if (
          reconciled.standardBomMaterialKg <= 0 &&
          reconciled.totalActualMaterialKg <= 0 &&
          reconciled.loggedRejectKg <= 0
        ) {
          continue;
        }

        const varianceKg =
          Math.round((reconciled.totalActualMaterialKg - reconciled.standardBomMaterialKg) * 1000) /
          1000;
        const variancePct = reconciled.materialVariancePct;
        const absPct = Math.abs(variancePct);
        const severity: VarianceSeverity =
          variancePct > 2 || absPct > 2
            ? 'CRITICAL'
            : variancePct > 1 || absPct > 1
            ? 'WARNING'
            : 'SAFE';

        const rowKey = `${entry.lineId}__${sku.id}__${bm.material.id}`;
        const latestNote =
          localNotesByRow[rowKey] ||
          matchingRejects[0]?.notes ||
          matchingUsages[0]?.notes;

        rows.push({
          rowKey,
          lineId: entry.lineId,
          lineName: entry.lineName,
          skuId: sku.id,
          skuName: sku.name,
          skuCode: sku.code || `SKU-${sku.id.slice(-4)}`,
          wipId: bm.wipId,
          wipName: bm.wipName,
          materialId: bm.material.id,
          materialName: bm.material.name,
          materialCode: bm.material.code || `MAT-${bm.material.id.slice(-4)}`,
          cartonsProduced: entry.cartons,
          standardBomKg: reconciled.standardBomMaterialKg,
          actualUsedKg: reconciled.totalActualMaterialKg,
          loggedRejectKg,
          varianceKg,
          variancePct,
          severity,
          latestNote
        });
      }
    }

    const rankWeight: Record<VarianceSeverity, number> = {
      CRITICAL: 3,
      WARNING: 2,
      SAFE: 1
    };

    return rows.sort(
      (a, b) =>
        rankWeight[b.severity] - rankWeight[a.severity] ||
        Math.abs(b.variancePct) - Math.abs(a.variancePct) ||
        Math.abs(b.varianceKg) - Math.abs(a.varianceKg)
    );
  }, [
    state,
    dateStr,
    shiftScope,
    lineScope,
    localNotesByRow
  ]);

  const criticalCount = watchlistRows.filter(r => r.severity === 'CRITICAL').length;
  const warningCount = watchlistRows.filter(r => r.severity === 'WARNING').length;

  const handleOpenRootCause = (row: BomVarianceWatchRow) => {
    setRootCauseRow(row);
    setRcCategory('ADONAN_TERBUANG');
    setRcScrapKg(row.varianceKg > 0 ? row.varianceKg.toFixed(2) : '0');
    setRcNotes(row.latestNote || '');
  };

  const handleSaveRootCause = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootCauseRow) return;
    const trimmedNote = rcNotes.trim();
    if (!trimmedNote) {
      erp?.showToast('Harap isi deskripsi root cause penyimpangan bahan baku.', true);
      return;
    }

    const scrapVal = Math.max(0, parseFloat(rcScrapKg) || 0);
    if (scrapVal > 0 && erp?.handleRecordMaterialReject) {
      const mat = state.master.materials.find(m => m.id === rootCauseRow.materialId);
      const sku = state.master.skus.find(s => s.id === rootCauseRow.skuId);
      const bomMat = getMaterialsForSkuBom(state, rootCauseRow.skuId).find(
        b => b.material.id === rootCauseRow.materialId
      );
      const eqCartons = computeEquivalentCartonsLoss({
        rejectQtyKg: scrapVal,
        materialKgPerCartonSku: bomMat?.kgPerCartonSku,
        fallbackCartonWeightKg: sku?.cartonWeightKg
      });
      const activeShift: ShiftNumber = shiftScope === 'ALL' ? 1 : shiftScope;
      const log: MaterialRejectLog = {
        id: `rej_var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        date: dateStr,
        shift: activeShift,
        stationType: 'LINE',
        lineId: rootCauseRow.lineId !== 'unassigned' ? rootCauseRow.lineId : undefined,
        lineName: rootCauseRow.lineName,
        skuId: rootCauseRow.skuId,
        skuName: rootCauseRow.skuName,
        skuCode: rootCauseRow.skuCode,
        wipId: rootCauseRow.wipId,
        wipName: rootCauseRow.wipName,
        materialId: rootCauseRow.materialId,
        materialCode: rootCauseRow.materialCode,
        materialName: rootCauseRow.materialName,
        unit: 'kg',
        rejectQtyInput: scrapVal,
        rejectQtyKg: scrapVal,
        sourceLocation: bomMat?.defaultSourceLocation || (mat?.source === 'Formulasi' ? 'WINEROTO' : 'CK'),
        equivalentCartonsLoss: eqCartons,
        rejectCategory: rcCategory,
        operatorName: state.currentSession?.name || 'Supervisor Produksi',
        notes: `[Root Cause Variance] ${trimmedNote}`
      };
      erp.handleRecordMaterialReject(log);
    } else {
      const matchingUsage = (state.transactions.usages || []).find(
        u =>
          u.date === dateStr &&
          u.skuId === rootCauseRow.skuId &&
          u.materialId === rootCauseRow.materialId
      );
      if (matchingUsage && erp?.handleUpdateUsage) {
        erp.handleUpdateUsage(matchingUsage.id, {
          notes: `[Root Cause] ${trimmedNote}`,
          reasonNote: trimmedNote
        });
      } else {
        erp?.showToast(`Catatan root cause untuk ${rootCauseRow.materialName} tersimpan.`);
      }
    }

    setLocalNotesByRow(prev => ({
      ...prev,
      [rootCauseRow.rowKey]: trimmedNote
    }));
    setRootCauseRow(null);
  };

  return (
    <section
      aria-label="Real-Time Material Variance and Yield Watchlist"
      className="bg-surface border border-border-subtle rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 h-full no-print"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
        <div className="flex items-start gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
              criticalCount > 0
                ? 'bg-tint-rose border-tint-rose-border text-ink-rose'
                : 'bg-tint-cyan border-tint-cyan-border text-ink-cyan'
            }`}
          >
            <FileWarning className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink-primary">
              Watchlist Varians BOM &amp; Yield
            </h2>
            <p className="text-[11px] font-mono text-ink-secondary tabular-nums mt-0.5">
              {criticalCount} Kritis (&gt;2%) · {warningCount} Waspada (1–2%) ·{' '}
              {watchlistRows.length} Item Terpantau
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onJumpToPemakaian}
          className="px-3 py-1.5 rounded-lg bg-canvas hover:bg-elevated border border-border-subtle text-xs font-semibold text-ink-cyan flex items-center gap-1.5 self-start sm:self-auto whitespace-nowrap shrink-0 transition"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Input Pemakaian</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Watchlist Table / Cards */}
      <div className="flex-1 overflow-x-auto max-h-[340px] overflow-y-auto">
        {watchlistRows.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-surface z-10">
              <tr className="border-b border-border-subtle text-[11px] font-bold text-ink-secondary whitespace-nowrap">
                <th className="py-2 pr-2">Material &amp; SKU</th>
                <th className="py-2 px-2 text-right">Std BOM</th>
                <th className="py-2 px-2 text-right">Aktual</th>
                <th className="py-2 px-2 text-right">Selisih</th>
                <th className="py-2 px-2 text-center">Status</th>
                <th className="py-2 pl-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {watchlistRows.map(row => {
                const isCritical = row.severity === 'CRITICAL';
                const isWarning = row.severity === 'WARNING';

                return (
                  <tr key={row.rowKey} className="hover:bg-elevated/40 transition">
                    <td className="py-2.5 pr-2 align-top">
                      <div className="font-semibold text-ink-primary truncate max-w-[175px]" title={row.materialName}>
                        {row.materialName}
                      </div>
                      <div className="text-[10px] font-mono text-ink-secondary truncate max-w-[175px] tabular-nums">
                        {row.lineName} · {row.skuCode}
                      </div>
                      {row.latestNote && (
                        <div className="text-[10px] text-ink-amber truncate max-w-[175px] mt-0.5" title={row.latestNote}>
                          Catatan: {row.latestNote}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-ink-secondary whitespace-nowrap align-top">
                      {row.standardBomKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-ink-primary whitespace-nowrap align-top">
                      {row.actualUsedKg.toFixed(1)} kg
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap align-top">
                      <span
                        className={`font-bold ${
                          isCritical
                            ? 'text-ink-rose'
                            : isWarning
                            ? 'text-ink-amber'
                            : 'text-ink-emerald'
                        }`}
                      >
                        {row.variancePct > 0
                          ? `+${row.variancePct.toFixed(1)}%`
                          : `${row.variancePct.toFixed(1)}%`}
                      </span>
                      <span className="block text-[10px] text-ink-secondary">
                        {row.varianceKg > 0
                          ? `+${row.varianceKg.toFixed(2)}`
                          : row.varianceKg.toFixed(2)}{' '}
                        kg
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center whitespace-nowrap align-top">
                      {isCritical ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tint-rose border border-tint-rose-border text-ink-rose text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3 animate-pulse motion-reduce:animate-none" />
                          <span>Kritis</span>
                        </span>
                      ) : isWarning ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-bold">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Waspada</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tint-emerald border border-tint-emerald-border text-ink-emerald text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Aman</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 text-right whitespace-nowrap align-top">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenRootCause(row)}
                          className="px-2 py-1 rounded bg-canvas hover:bg-elevated border border-border-subtle text-[10px] font-semibold text-ink-primary transition"
                          title="Catat Root Cause & Scrap"
                        >
                          <MessageSquarePlus className="w-3 h-3 inline mr-0.5 text-ink-amber" />
                          <span>Root Cause</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center px-4 py-8">
            <Layers className="w-9 h-9 text-ink-secondary/60 mb-2" />
            <p className="text-xs font-semibold text-ink-primary">
              Belum ada transaksi produksi atau pemakaian bahan baku pada shift &amp; line ini.
            </p>
            <p className="text-[11px] text-ink-secondary mt-1 max-w-xs">
              Jalankan produksi SKU atau catat pemakaian material untuk memantau deviasi BOM secara real-time.
            </p>
            <button
              type="button"
              onClick={onJumpToPemakaian}
              className="mt-3 px-3 py-1.5 rounded-lg bg-accent-primary text-accent-primary-foreground text-xs font-semibold transition"
            >
              Catat Pemakaian Bahan Baku
            </button>
          </div>
        )}
      </div>

      {/* Inline Threshold Legend */}
      <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-ink-secondary">
        <span>Ambang Batas Varians BOM:</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-ink-emerald font-semibold">Aman ≤ 1%</span>
          <span className="text-ink-amber font-semibold">Waspada 1–2%</span>
          <span className="text-ink-rose font-semibold">Kritis &gt; 2%</span>
        </div>
      </div>

      {/* Root Cause Capture Modal */}
      {rootCauseRow && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border-subtle rounded-xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-border-subtle">
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  Catat Root Cause Varians Material
                </h3>
                <p className="text-[11px] font-mono text-ink-secondary mt-0.5">
                  {rootCauseRow.materialName} · {rootCauseRow.skuName} ({rootCauseRow.lineName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRootCauseRow(null)}
                className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated"
                aria-label="Tutup modal root cause"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRootCause} className="space-y-3 text-xs">
              <div className="bg-canvas border border-border-subtle rounded-lg p-3 flex items-center justify-between font-mono tabular-nums">
                <div>
                  <span className="text-[10px] text-ink-secondary block">Std BOM / Aktual</span>
                  <span className="font-bold text-ink-primary">
                    {rootCauseRow.standardBomKg.toFixed(1)} kg / {rootCauseRow.actualUsedKg.toFixed(1)} kg
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-ink-secondary block">Deviasi</span>
                  <span className="font-bold text-ink-rose">
                    {rootCauseRow.variancePct > 0
                      ? `+${rootCauseRow.variancePct.toFixed(1)}%`
                      : `${rootCauseRow.variancePct.toFixed(1)}%`}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-primary mb-1">
                  Kategori Penyebab
                </label>
                <select
                  value={rcCategory}
                  onChange={e => setRcCategory(e.target.value as RejectCategory)}
                  className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                >
                  {REJECT_CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-primary mb-1">
                  Tambahan Scrap/Reject Terukur (kg — isi 0 jika hanya catatan investigasi)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={rcScrapKg}
                  onChange={e => setRcScrapKg(e.target.value)}
                  className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink-primary font-mono tabular-nums focus:outline-none focus:border-accent-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-primary mb-1">
                  Deskripsi Root Cause &amp; Tindakan Korektif
                </label>
                <textarea
                  rows={3}
                  required
                  value={rcNotes}
                  onChange={e => setRcNotes(e.target.value)}
                  placeholder="Misal: Over-dosage manual saat penimbangan, kalibrasi ulang hopper atau pipa bocor..."
                  className="w-full bg-canvas border border-border-subtle rounded-lg px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRootCauseRow(null)}
                  className="flex-1 py-2 rounded-lg bg-elevated hover:bg-accent border border-border-subtle text-ink-primary font-semibold transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary-hover text-accent-primary-foreground font-bold transition"
                >
                  Simpan Root Cause
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
