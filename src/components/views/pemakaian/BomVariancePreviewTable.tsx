import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  PackageCheck,
  QrCode,
  RefreshCw,
  Scale
} from 'lucide-react';
import { StorageLocation, WIP, WipBatchMaterialItem, WipRecipe } from '../../../types';
import { useErp } from '../../../context/ErpContext';
import { calculateStockBalances, getMaterialPalletInventory } from '../../../utils/storage';
import { reconcileMaterialBomVariance } from '../../../utils/productionReconcile';
import { detectMaterialPackageConfig } from '../../../utils/orderRounding';

interface BomVariancePreviewTableProps {
  selectedWipObj?: WIP;
  activeRecipeObj: WipRecipe | null;
  configuredMaterials: WipBatchMaterialItem[];
  stockBalances: ReturnType<typeof calculateStockBalances>;
  verifiedMaterialsMap: Record<string, { verifiedAt: string; scannedLot?: string }>;
  expandedPalletMatId: string | null;
  setExpandedPalletMatId: (id: string | null) => void;
  onOpenQrScanner: () => void;
  onLocationChange: (materialId: string, newLocation: StorageLocation) => void;
  onUpdateMaterialRow: (materialId: string, updates: Partial<WipBatchMaterialItem>) => void;
  onAdjustPalletBags: (materialId: string, palletId: string, targetBags: number) => void;
  onResetFifo: (materialId: string) => void;
}

export const BomVariancePreviewTable: React.FC<BomVariancePreviewTableProps> = ({
  selectedWipObj,
  activeRecipeObj,
  configuredMaterials,
  stockBalances,
  verifiedMaterialsMap,
  expandedPalletMatId,
  setExpandedPalletMatId,
  onOpenQrScanner,
  onLocationChange,
  onUpdateMaterialRow,
  onAdjustPalletBags,
  onResetFifo
}) => {
  const { state } = useErp();

  const verifiedCountInBom = configuredMaterials.filter(m =>
    Boolean(verifiedMaterialsMap[m.materialId])
  ).length;

  const totalRequiredBOMKg = useMemo(
    () => configuredMaterials.reduce((acc, curr) => acc + curr.requiredKg, 0),
    [configuredMaterials]
  );

  const totalActualBOMKg = useMemo(
    () => configuredMaterials.reduce((acc, curr) => acc + curr.actualUsedKg, 0),
    [configuredMaterials]
  );

  const batchReconcile = useMemo(
    () =>
      reconcileMaterialBomVariance({
        actualCartons: 1,
        standardBomKgPerCarton: totalRequiredBOMKg,
        actualMaterialUsedKg: totalActualBOMKg
      }),
    [totalRequiredBOMKg, totalActualBOMKg]
  );

  const BOM_VARIANCE_TOLERANCE_PCT = 2.0;
  const totalVarianceKg = totalActualBOMKg - totalRequiredBOMKg;
  const totalVariancePct =
    totalRequiredBOMKg > 0 ? (totalVarianceKg / totalRequiredBOMKg) * 100 : 0;
  const outOfToleranceItems = configuredMaterials.filter(item => {
    const pct =
      item.requiredKg > 0 ? Math.abs(((item.actualUsedKg - item.requiredKg) / item.requiredKg) * 100) : 0;
    return pct > BOM_VARIANCE_TOLERANCE_PCT;
  });
  const isBatchOverTolerance =
    Math.abs(totalVariancePct) > BOM_VARIANCE_TOLERANCE_PCT || outOfToleranceItems.length > 0;

  if (!selectedWipObj) return null;

  return (
    <div className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3 shadow-inner">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-border-subtle gap-2">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-lg bg-amber-500/10 text-ink-amber">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-ink-primary">
              Formulasi {activeRecipeObj ? `Resep [${activeRecipeObj.recipeCode}]` : 'BOM Terpisah'} untuk 1 Batch:{' '}
              {selectedWipObj.name}
            </h4>
            <p className="text-[10px] text-ink-secondary">
              {activeRecipeObj
                ? `Komposisi bahan baku ditentukan dari Resep Formulasi: ${activeRecipeObj.recipeName} (${activeRecipeObj.items.length} bahan: Padat, Bubuk, Liquid)`
                : 'Material terpakai langsung ditentukan otomatis dari database BOM terhubung'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {configuredMaterials.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
                Verifikasi QR:{' '}
                <strong className={verifiedCountInBom === configuredMaterials.length ? 'text-ink-emerald' : 'text-brand'}>
                  {verifiedCountInBom}/{configuredMaterials.length}
                </strong>
              </span>
              <button
                type="button"
                onClick={onOpenQrScanner}
                className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-brand border border-cyan-500/40 text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3 h-3" />
                <span>Scan Verifikasi</span>
              </button>
            </div>
          )}
          <div className="text-right">
            <span className="text-[11px] text-ink-secondary">Bobot Formulasi: </span>
            <span className="font-mono font-bold text-brand text-xs sm:text-sm tabular-nums">
              {totalActualBOMKg.toFixed(4)} kg
            </span>
            <span className="text-[10px] text-ink-muted ml-1 font-mono tabular-nums">
              / Target: {selectedWipObj.batchWeightKg.toFixed(4)} kg
            </span>
          </div>
        </div>
      </div>

      {configuredMaterials.length > 0 ? (
        <>
          {/* Real-Time Variance Reconciliation Summary Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-surface border border-border-subtle rounded-xl p-2.5 text-[11px]">
            <div>
              <span className="text-ink-secondary block text-[10px]">Standar Resep BOM (1 Batch)</span>
              <span className="font-mono font-bold text-ink-primary tabular-nums">
                {totalRequiredBOMKg.toFixed(4)} kg
              </span>
            </div>
            <div>
              <span className="text-ink-secondary block text-[10px]">Aktual Dialokasikan / Dipakai</span>
              <span className="font-mono font-bold text-brand tabular-nums">
                {totalActualBOMKg.toFixed(4)} kg
              </span>
            </div>
            <div>
              <span className="text-ink-secondary block text-[10px]">Selisih (Variance kg)</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  Math.abs(totalVarianceKg) <= 0.001
                    ? 'text-ink-emerald'
                    : totalVarianceKg > 0
                    ? 'text-ink-rose'
                    : 'text-ink-amber'
                }`}
              >
                {totalVarianceKg > 0 ? '+' : ''}
                {totalVarianceKg.toFixed(4)} kg
              </span>
            </div>
            <div>
              <span className="text-ink-secondary block text-[10px]">Variance % (Toleransi ±{BOM_VARIANCE_TOLERANCE_PCT}%)</span>
              <span
                className={`font-mono font-bold tabular-nums flex items-center gap-1 ${
                  Math.abs(totalVariancePct) <= 0.1
                    ? 'text-ink-emerald'
                    : Math.abs(totalVariancePct) > BOM_VARIANCE_TOLERANCE_PCT
                    ? 'text-ink-rose'
                    : 'text-ink-amber'
                }`}
              >
                <Scale className="w-3 h-3 shrink-0" />
                <span>
                  {totalVariancePct > 0 ? '+' : ''}
                  {totalVariancePct.toFixed(2)}%
                  {batchReconcile.unloggedOverVarianceKg > 0
                    ? ` (+${batchReconcile.unloggedOverVarianceKg.toFixed(3)} kg)`
                    : ''}
                </span>
              </span>
            </div>
          </div>

          {isBatchOverTolerance && (
            <div className="px-3 py-2 rounded-xl bg-tint-rose border border-rose-500/45 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-ink-rose font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  Peringatan Toleransi BOM (&gt; ±{BOM_VARIANCE_TOLERANCE_PCT}%): Selisih batch saat ini{' '}
                  <strong className="font-mono">
                    {totalVariancePct > 0 ? '+' : ''}
                    {totalVariancePct.toFixed(2)}%
                  </strong>
                  {outOfToleranceItems.length > 0
                    ? ` · ${outOfToleranceItems.length} material melewati batas toleransi`
                    : ''}
                </span>
              </div>
              <span className="text-[10px] font-mono text-ink-secondary">
                Periksa timbangan aktual / alokasi zak FIFO sebelum memulai batch
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-surface text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                  <th className="py-2.5 px-3">Bahan Baku (Database)</th>
                  <th className="py-2.5 px-3">Tipe &amp; Kemasan</th>
                  <th className="py-2.5 px-3">Takaran Resep</th>
                  <th className="py-2.5 px-3">Lokasi Ambil</th>
                  <th className="py-2.5 px-3 text-right">Stok Tersedia</th>
                  <th className="py-2.5 px-3 text-right">Standar Resep (kg)</th>
                  <th className="py-2.5 px-3 text-right font-bold text-ink-purple">Aktual Dipakai (kg)</th>
                  <th className="py-2.5 px-3 text-right">Variance (kg / %)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {configuredMaterials.map(item => {
                  const bal = stockBalances[item.materialId];
                  const matMaster = state.master.materials.find(m => m.id === item.materialId);
                  const pkgConfig = detectMaterialPackageConfig(matMaster);
                  let available = 0;
                  if (bal) {
                    if (item.sourceLocation === 'CK') available = bal.stockCk;
                    else if (item.sourceLocation === 'WINEROTO') available = bal.stockWineroto;
                    else if (item.sourceLocation === 'STORAGE_TANK') available = bal.stockTank;
                  }
                  const isInsufficient = item.actualUsedKg > available;

                  const typeBadgeColor =
                    item.materialType === 'padat'
                      ? 'bg-amber-500/20 text-ink-amber border-amber-500/30'
                      : item.materialType === 'liquid'
                      ? 'bg-blue-500/20 text-ink-blue border-blue-500/30'
                      : 'bg-emerald-500/20 text-ink-emerald border-emerald-500/30';

                  const availablePallets = getMaterialPalletInventory(state, item.materialId, item.sourceLocation);
                  const hasPallets = availablePallets.length > 0;
                  const isExpanded = expandedPalletMatId === item.materialId;
                  const totalAllocatedBags = (item.palletAllocations || []).reduce((sum, a) => sum + a.bagsUsed, 0);
                  const qrVerification = verifiedMaterialsMap[item.materialId];

                  const rowVarianceKg = item.actualUsedKg - item.requiredKg;
                  const rowVariancePct = item.requiredKg > 0 ? (rowVarianceKg / item.requiredKg) * 100 : 0;
                  const isRowOverTolerance = Math.abs(rowVariancePct) > BOM_VARIANCE_TOLERANCE_PCT;

                  return (
                    <React.Fragment key={item.materialId}>
                      <tr
                        className={`hover:bg-surface transition ${
                          isExpanded
                            ? 'bg-surface'
                            : isRowOverTolerance
                            ? 'bg-rose-500/5'
                            : qrVerification
                            ? 'bg-tint-emerald'
                            : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-medium text-ink-primary">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-elevated text-brand border border-border-strong">
                              {item.materialCode}
                            </span>
                            <span>{item.materialName}</span>
                            {qrVerification && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-emerald">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>
                                  QR Terverifikasi{qrVerification.scannedLot ? ` · Lot ${qrVerification.scannedLot}` : ''}
                                </span>
                              </span>
                            )}
                          </div>
                          {hasPallets && (
                            <div className="mt-1 flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => setExpandedPalletMatId(isExpanded ? null : item.materialId)}
                                className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition border ${
                                  isExpanded
                                    ? 'bg-tint-purple text-ink-purple border-purple-500/60 shadow-sm'
                                    : 'bg-elevated text-ink-amber border-amber-500/30 hover:bg-accent'
                                }`}
                                title="Klik untuk membuka rincian alokasi kelompok/pallet FIFO terkunci"
                              >
                                <Lock className="w-2.5 h-2.5 text-ink-amber" />
                                <span>
                                  Pallet FIFO ({totalAllocatedBags} {pkgConfig.unitLabel})
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3 text-ink-purple" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 text-ink-amber" />
                                )}
                              </button>
                              <span className="text-[9px] text-ink-secondary font-mono">
                                ({availablePallets.length} pallet tersedia)
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-ink-secondary">
                          <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] uppercase font-bold border mr-1 ${typeBadgeColor}`}>
                            {item.materialType}
                          </span>
                          <span className="text-[10px]">{item.packaging}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-ink-amber">
                          <div className="flex flex-col">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold w-fit">
                              {item.recipeAmount !== undefined
                                ? `${item.recipeAmount} ${item.unit || 'kg'}`
                                : `${item.requiredKg.toFixed(4)} kg`}
                            </span>
                            {item.palletAllocations &&
                              item.palletAllocations.length > 0 &&
                              Math.abs(rowVarianceKg) > 0.001 && (
                                <span
                                  className="text-[9px] text-brand font-mono mt-0.5"
                                  title="Disesuaikan berat kemasan FIFO tanpa mengambil zak tambahan dari lot selanjutnya"
                                >
                                  ➔ Pas FIFO: {item.actualUsedKg.toFixed(2)} kg
                                </span>
                              )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={item.sourceLocation}
                            onChange={e => onLocationChange(item.materialId, e.target.value as StorageLocation)}
                            className="bg-elevated border border-border-strong rounded-lg px-2 py-1 text-[11px] text-ink-primary"
                          >
                            <option value="CK">Area CK</option>
                            <option value="WINEROTO">Area WINEROTO</option>
                            <option value="STORAGE_TANK">Tank Liquid (1.000 kg)</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-secondary">
                          <span className={isInsufficient ? 'text-ink-rose font-bold' : 'text-ink-secondary'}>
                            {available.toFixed(4)} kg
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink-secondary">
                          {item.requiredKg.toFixed(4)} kg
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {hasPallets ? (
                            <div className="flex flex-col items-end">
                              <div className="relative">
                                <input
                                  type="number"
                                  step="0.0001"
                                  required
                                  readOnly
                                  value={item.actualUsedKg}
                                  onClick={() => setExpandedPalletMatId(isExpanded ? null : item.materialId)}
                                  title="Bobot aktual terkunci otomatis dari timbangan unit kelompok/pallet FIFO. Klik untuk atur zak per pallet."
                                  className="w-24 bg-canvas border border-amber-500/60 rounded-lg px-2 py-1 text-right text-ink-amber font-mono font-bold cursor-pointer hover:border-amber-400"
                                />
                                <Lock className="w-2.5 h-2.5 text-ink-amber absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              </div>
                              <span className="text-[9px] text-ink-amber font-mono mt-0.5">
                                🔒 Pas FIFO ({totalAllocatedBags} {pkgConfig.unitLabel})
                              </span>
                              {item.palletAllocations &&
                                item.palletAllocations.length > 0 &&
                                Math.abs(rowVarianceKg) > 0.001 && (
                                  <span className="text-[8px] text-ink-secondary font-mono">(Tanpa ambil zak lain)</span>
                                )}
                            </div>
                          ) : (
                            <input
                              type="number"
                              step="0.0001"
                              required
                              value={item.actualUsedKg}
                              onChange={e =>
                                onUpdateMaterialRow(item.materialId, {
                                  actualUsedKg: parseFloat(e.target.value) || 0
                                })
                              }
                              className="w-24 bg-surface border border-purple-500/50 rounded-lg px-2 py-1 text-right text-ink-purple font-mono font-bold focus:outline-none focus:border-purple-400"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`font-bold block text-[11px] ${
                              Math.abs(rowVarianceKg) <= 0.001
                                ? 'text-ink-emerald'
                                : rowVarianceKg > 0
                                ? 'text-ink-rose'
                                : 'text-ink-amber'
                            }`}
                          >
                            {rowVarianceKg > 0 ? '+' : ''}
                            {rowVarianceKg.toFixed(4)} kg
                          </span>
                          <span className="text-[10px] text-ink-secondary">
                            ({rowVariancePct > 0 ? '+' : ''}
                            {rowVariancePct.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center space-y-1">
                          {isInsufficient ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-ink-rose border border-rose-500/30 block">
                              Stok Kurang
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-ink-emerald border border-emerald-500/30 block">
                              Cukup
                            </span>
                          )}
                          {isRowOverTolerance && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-500/20 text-ink-amber border border-amber-500/40 font-bold block whitespace-nowrap">
                              &gt; Toleransi (±{BOM_VARIANCE_TOLERANCE_PCT}%)
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* EXPANDED FIFO PALLET ALLOCATION DRAWER */}
                      {isExpanded && hasPallets && (
                        <tr className="bg-canvas border-b border-purple-500/30">
                          <td colSpan={9} className="p-3">
                            <div className="bg-surface border border-purple-500/40 rounded-xl p-3.5 space-y-3 shadow-xl">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-border-subtle gap-2">
                                <div className="flex items-center space-x-2">
                                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-ink-amber">
                                    <PackageCheck className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <h5 className="font-bold text-xs text-ink-primary flex items-center space-x-1.5">
                                      <span>Alokasi Unit Kelompok / Pallet FIFO: {item.materialName}</span>
                                      <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-tint-purple border border-purple-500/40 text-ink-purple">
                                        Lokasi {item.sourceLocation}
                                      </span>
                                    </h5>
                                    <p className="text-[10px] text-ink-secondary">
                                      Penyimpanan dikunci per pallet dengan berat per zak dari penerimaan GDRM. Alokasi otomatis urut FIFO (terlama didahulukan).
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => onResetFifo(item.materialId)}
                                    className="px-2.5 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-brand text-[10px] font-semibold flex items-center space-x-1 transition"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>⚡ Reset ke FIFO Otomatis</span>
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-canvas p-2.5 rounded-xl border border-border-subtle text-[11px] font-mono">
                                <div>
                                  <span className="text-ink-secondary block text-[10px]">Target Kebutuhan Resep:</span>
                                  <span className="text-ink-primary font-bold">{item.requiredKg.toFixed(4)} kg</span>
                                </div>
                                <div>
                                  <span className="text-ink-secondary block text-[10px]">Total Aktual Dialokasikan:</span>
                                  <span className="text-brand font-bold">
                                    {item.actualUsedKg.toFixed(4)} kg ({totalAllocatedBags} {pkgConfig.unitLabel})
                                  </span>
                                </div>
                                <div>
                                  <span className="text-ink-secondary block text-[10px]">Selisih dari Resep:</span>
                                  <span className={rowVarianceKg >= 0 ? 'text-ink-emerald font-bold' : 'text-ink-amber font-bold'}>
                                    {rowVarianceKg > 0 ? '+' : ''}
                                    {rowVarianceKg.toFixed(4)} kg ({rowVariancePct > 0 ? '+' : ''}
                                    {rowVariancePct.toFixed(2)}%)
                                  </span>
                                </div>
                                <div>
                                  <span className="text-ink-secondary block text-[10px]">Status Kunci Bobot:</span>
                                  <span className="text-ink-amber font-bold flex items-center space-x-1">
                                    <Lock className="w-3 h-3 text-ink-amber" />
                                    <span>Terkunci Unit Pallet</span>
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-ink-secondary px-1 font-semibold">
                                  <span>Daftar Pallet Gudang (Urutan FIFO: Tanggal Kedatangan Terlama ➔ Terbaru)</span>
                                  <span>Jumlah Zak Dialokasikan ke Batch</span>
                                </div>

                                <div className="grid grid-cols-1 gap-2">
                                  {availablePallets.map((lot, pIdx) => {
                                    const currentAlloc = (item.palletAllocations || []).find(
                                      a => a.palletId === lot.palletId
                                    );
                                    const bagsUsed = currentAlloc ? currentAlloc.bagsUsed : 0;
                                    const subtotalKg = currentAlloc ? currentAlloc.subtotalKg : 0;
                                    const isAllocated = bagsUsed > 0;
                                    const isOldestFifo = pIdx === 0;

                                    return (
                                      <div
                                        key={lot.palletId}
                                        className={`p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                          isAllocated
                                            ? 'bg-tint-purple border-purple-500/50 shadow-md shadow-purple-950/20'
                                            : 'bg-canvas border-border-subtle opacity-80 hover:opacity-100'
                                        }`}
                                      >
                                        <div className="space-y-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span
                                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                                isOldestFifo
                                                  ? 'bg-tint-amber text-ink-amber border-amber-600/50'
                                                  : 'bg-elevated text-ink-secondary border-border-strong'
                                              }`}
                                            >
                                              FIFO #{pIdx + 1} {isOldestFifo ? '⭐ Tertua / Prioritas' : ''}
                                            </span>
                                            <span className="font-bold text-ink-primary text-xs">{lot.palletLabel}</span>
                                            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-elevated text-ink-secondary border border-border-strong">
                                              {lot.receiptNumber}
                                            </span>
                                            {lot.batchLotNumber && (
                                              <span className="text-[10px] text-ink-secondary font-mono">
                                                (Lot: {lot.batchLotNumber})
                                              </span>
                                            )}
                                            <span className="text-[10px] text-ink-muted">Masuk: {lot.date}</span>
                                          </div>

                                          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-ink-secondary">
                                            <span>
                                              Sisa Gudang:{' '}
                                              <strong className="text-ink-primary">{lot.remainingBags} Zak</strong> (
                                              {lot.remainingKg.toFixed(2)} kg)
                                            </span>
                                            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-ink-amber border border-amber-500/20 font-bold inline-flex items-center space-x-1">
                                              <Lock className="w-2.5 h-2.5 text-ink-amber" />
                                              <span>Terkunci: {lot.weightPerBagKg.toFixed(2)} kg/zak</span>
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center space-x-3 shrink-0 self-end md:self-center">
                                          <div className="flex items-center space-x-1 bg-surface p-1 rounded-xl border border-border-strong">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onAdjustPalletBags(item.materialId, lot.palletId, bagsUsed - 1)
                                              }
                                              disabled={bagsUsed <= 0}
                                              className="w-7 h-7 rounded-lg bg-elevated hover:bg-accent text-ink-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-sm"
                                            >
                                              -
                                            </button>
                                            <input
                                              type="number"
                                              min="0"
                                              max={lot.remainingBags}
                                              value={bagsUsed}
                                              onChange={e =>
                                                onAdjustPalletBags(
                                                  item.materialId,
                                                  lot.palletId,
                                                  parseInt(e.target.value) || 0
                                                )
                                              }
                                              className="w-14 text-center bg-transparent text-ink-primary font-mono font-bold text-xs focus:outline-none"
                                            />
                                            <button
                                              type="button"
                                              onClick={() =>
                                                onAdjustPalletBags(item.materialId, lot.palletId, bagsUsed + 1)
                                              }
                                              disabled={bagsUsed >= lot.remainingBags}
                                              className="w-7 h-7 rounded-lg bg-elevated hover:bg-accent text-ink-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-sm"
                                            >
                                              +
                                            </button>
                                          </div>

                                          <div className="text-right font-mono min-w-[90px]">
                                            <span className="text-[10px] text-ink-secondary block">Bobot Terpakai:</span>
                                            <span className={`text-xs font-bold ${isAllocated ? 'text-brand' : 'text-ink-muted'}`}>
                                              {subtotalKg.toFixed(2)} kg
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center py-6 text-ink-muted text-xs">
          <p className="font-medium text-ink-secondary">
            WIP ini belum memiliki bahan baku di hierarki BOM Master.
          </p>
          <p className="text-[11px] text-ink-muted mt-1">
            Silakan hubungkan bahan baku ke WIP ini pada modul Master Data &amp; BOM Hierarki.
          </p>
        </div>
      )}
    </div>
  );
};
