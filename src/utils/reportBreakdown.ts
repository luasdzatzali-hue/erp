import { AppState, ShiftNumber } from '../types';
import { calculateStockBalances } from './storage';
import {
  resolveProductionLineForItem,
  resolveProductionLinesForSkuWip
} from './lineResolver';

export interface MaterialStockBreakdownRow {
  rowKey: string;
  lineId: string;
  lineName: string;
  skuId: string;
  skuName: string;
  skuCode: string;
  isKite?: boolean;
  wipId: string;
  wipName: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  batchSizeKg: number;
  saldoAwalKg: number;
  saldoAwalBatch: number;
  pemesananKg: number;
  pemesananBatch: number;
  kedatanganKg: number;
  kedatanganBatch: number;
  totalOnhandKg: number;
  totalOnhandBatch: number;
  pemakaianKg: number;
  pemakaianBatch: number;
  saldoAkhirKg: number;
  saldoAkhirBatch: number;
  status: 'AMAN' | 'MENIPIS' | 'KOSONG';
}

export interface UsageMaterialItemSummary {
  materialId: string;
  materialCode: string;
  materialName: string;
  totalUsageKg: number;
  estimatedBatch: number;
  batchSizeKg: number;
  locations: string[];
  shifts: number[];
  operators: string[];
  usageCount: number;
}

export interface SkuWipUsageGroup {
  groupKey: string;
  skuId: string;
  skuName: string;
  skuCode: string;
  isKite?: boolean;
  wipId: string;
  wipName: string;
  totalGroupKg: number;
  totalGroupBatches: number;
  materials: UsageMaterialItemSummary[];
}

/**
 * Breakdown Saldo Stock Material Aktual Berdasarkan SKU dan WIP yang Diproduksi.
 * Sesuai format standar:
 * SKU ; Jenis WIP ; Kode ; Nama Material ; Saldo Awal (batch & kg) ; Pemesanan Material (batch & kg) ;
 * Kedatangan Material (batch & kg) ; Total Onhand Material (batch & kg) ; Pemakaian Material (batch & kg) ;
 * Saldo Akhir Shift (batch & kg) ; Status
 */
export function calculateMaterialStockBreakdown(
  state: AppState,
  options?: { dateString?: string; shift?: ShiftNumber | 'ALL'; lineId?: string }
): MaterialStockBreakdownRow[] {
  const stockBalances = calculateStockBalances(state);
  const selectedDate = options?.dateString;
  const selectedShift = options?.shift;

  // Filter transactions by date/shift if specified
  const filteredReceipts = (state.transactions.receipts || []).filter(r => {
    if (r.status !== 'Received' && r.status !== 'Discrepancy') return false;
    if (selectedDate && r.date !== selectedDate) return false;
    return true;
  });

  const filteredUsages = (state.transactions.usages || []).filter(u => {
    if (selectedDate && u.date !== selectedDate) return false;
    if (selectedShift && selectedShift !== 'ALL' && u.shift !== selectedShift) return false;
    return true;
  });

  const filteredRequests = (state.transactions.requests || []).filter(req => {
    if (selectedDate && req.date !== selectedDate) return false;
    return true;
  });

  const rows: MaterialStockBreakdownRow[] = [];
  const processedMaterialIds = new Set<string>();

  // 1. Iterate through SKUs and linked WIPs from Master BOM
  state.master.skus.forEach(sku => {
    const linkedWipIds = state.master.skuWips
      .filter(sw => sw.skuId === sku.id)
      .map(sw => sw.wipId);

    const wipsForSku = linkedWipIds.length > 0
      ? state.master.wips.filter(w => linkedWipIds.includes(w.id))
      : [];

    wipsForSku.forEach(wip => {
      // Find all materials associated with this WIP via recipes, wipMats, or recorded usages
      const matIdSet = new Set<string>();

      // From recipes
      const wipRecipes = (state.master.recipes || []).filter(r => r.wipId === wip.id);
      wipRecipes.forEach(r => {
        (r.items || []).forEach(it => {
          if (it.materialId) matIdSet.add(it.materialId);
        });
      });

      // From direct wipMats
      (state.master.wipMats || []).filter(wm => wm.wipId === wip.id).forEach(wm => {
        if (wm.materialId) matIdSet.add(wm.materialId);
      });

      // From recorded usages matching this WIP & SKU
      filteredUsages.filter(u => u.wipId === wip.id && (u.skuId === sku.id || !u.skuId)).forEach(u => {
        if (u.materialId) matIdSet.add(u.materialId);
      });

      const prodLines = resolveProductionLinesForSkuWip(state, sku.id, wip.id);

      prodLines.forEach(prodLine => {
        // If no material linked yet, skip this pair
        matIdSet.forEach(matId => {
          const mat = state.master.materials.find(m => m.id === matId);
          if (!mat) return;

          processedMaterialIds.add(mat.id);

          // Calculate batch size kg for this material in this WIP formula
          let batchSizeKg = 0;
          const recipeItem = wipRecipes.flatMap(r => r.items || []).find(it => it.materialId === mat.id);
          if (recipeItem && recipeItem.amountKg > 0) {
            batchSizeKg = recipeItem.amountKg;
          } else {
            const wm = (state.master.wipMats || []).find(w => w.wipId === wip.id && w.materialId === mat.id);
            if (wm && wm.materialKgPerBatch > 0) {
              batchSizeKg = wm.materialKgPerBatch;
            } else if (mat.weightKg > 0) {
              batchSizeKg = mat.weightKg;
            } else {
              batchSizeKg = 25; // default fallback
            }
          }

          const bal = stockBalances[mat.id] || { totalActual: 0, isLowStock: false };
          const totalOnhandKg = bal.totalActual;
          const totalOnhandBatch = batchSizeKg > 0 ? totalOnhandKg / batchSizeKg : 0;

          // Kedatangan material
          const kedatanganKg = filteredReceipts
            .filter(r => r.materialId === mat.id)
            .reduce((sum, r) => sum + r.receivedQty, 0);
          const kedatanganBatch = batchSizeKg > 0 ? kedatanganKg / batchSizeKg : 0;

          // Pemesanan material (attributable to this Production Line when requests specify a line)
          const pemesananKg = filteredRequests
            .filter(r => {
              if (r.materialId !== mat.id) return false;
              if (r.lineId || r.lineName) {
                const reqLine = resolveProductionLineForItem(state, {
                  explicitLineId: r.lineId,
                  explicitLineName: r.lineName,
                  skuId: r.skuId,
                  wipId: r.wipId
                });
                return reqLine.lineId === prodLine.lineId;
              }
              return true;
            })
            .reduce((sum, r) => sum + r.qty, 0);
          const pemesananBatch = batchSizeKg > 0 ? pemesananKg / batchSizeKg : 0;

          // Pemakaian material untuk WIP, SKU, & Line Produksi ini
          const pemakaianKg = filteredUsages
            .filter(u => {
              if (u.materialId !== mat.id) return false;
              if (!(u.wipId === wip.id || u.skuId === sku.id)) return false;
              if (prodLines.length > 1) {
                const uLine = resolveProductionLineForItem(state, {
                  skuId: u.skuId || sku.id,
                  wipId: u.wipId || wip.id
                });
                return uLine.lineId === prodLine.lineId || uLine.lineId === 'line_umum';
              }
              return true;
            })
            .reduce((sum, u) => sum + u.usageQty, 0);
          const pemakaianBatch = batchSizeKg > 0 ? pemakaianKg / batchSizeKg : 0;

          // Saldo Akhir Shift
          const saldoAkhirKg = totalOnhandKg;
          const saldoAkhirBatch = totalOnhandBatch;

          // Saldo Awal = Sesuai Saldo Awal Material yang dikonfigurasi/di-adjust Admin atau rekonsiliasi akhir
          const matInitialTotal = (mat.initialStockCk ?? 0) + (mat.initialStockWineroto ?? 0) + (mat.initialStockTank ?? 0);
          const saldoAwalKg = matInitialTotal > 0
            ? matInitialTotal
            : Math.max(0, saldoAkhirKg - kedatanganKg + pemakaianKg);
          const saldoAwalBatch = batchSizeKg > 0 ? saldoAwalKg / batchSizeKg : 0;

          let status: 'AMAN' | 'MENIPIS' | 'KOSONG' = 'AMAN';
          if (totalOnhandKg === 0) {
            status = 'KOSONG';
          } else if (bal.isLowStock || totalOnhandKg <= (mat.minStockAlert || 50)) {
            status = 'MENIPIS';
          }

          rows.push({
            rowKey: `${prodLine.lineId}_${sku.id}_${wip.id}_${mat.id}`,
            lineId: prodLine.lineId,
            lineName: prodLine.lineName,
            skuId: sku.id,
            skuName: sku.name,
            skuCode: sku.code || `SKU-${sku.id.slice(-4).toUpperCase()}`,
            isKite: sku.isKite,
            wipId: wip.id,
            wipName: wip.name,
            materialId: mat.id,
            materialCode: mat.code || `MAT-${mat.id.slice(-4)}`,
            materialName: mat.name,
            batchSizeKg,
            saldoAwalKg,
            saldoAwalBatch,
            pemesananKg,
            pemesananBatch,
            kedatanganKg,
            kedatanganBatch,
            totalOnhandKg,
            totalOnhandBatch,
            pemakaianKg,
            pemakaianBatch,
            saldoAkhirKg,
            saldoAkhirBatch,
            status
          });
        });
      });
    });
  });

  // 2. Add unassigned materials (material not yet bound to an SKU/WIP BOM) so no warehouse stock is omitted
  state.master.materials.forEach(mat => {
    if (processedMaterialIds.has(mat.id)) return;

    const batchSizeKg = mat.weightKg > 0 ? mat.weightKg : 25;
    const bal = stockBalances[mat.id] || { totalActual: 0, isLowStock: false };
    const totalOnhandKg = bal.totalActual;
    const totalOnhandBatch = batchSizeKg > 0 ? totalOnhandKg / batchSizeKg : 0;

    const kedatanganKg = filteredReceipts
      .filter(r => r.materialId === mat.id)
      .reduce((sum, r) => sum + r.receivedQty, 0);
    const kedatanganBatch = batchSizeKg > 0 ? kedatanganKg / batchSizeKg : 0;

    const pemesananKg = filteredRequests
      .filter(r => r.materialId === mat.id)
      .reduce((sum, r) => sum + r.qty, 0);
    const pemesananBatch = batchSizeKg > 0 ? pemesananKg / batchSizeKg : 0;

    const pemakaianKg = filteredUsages
      .filter(u => u.materialId === mat.id)
      .reduce((sum, u) => sum + u.usageQty, 0);
    const pemakaianBatch = batchSizeKg > 0 ? pemakaianKg / batchSizeKg : 0;

    const saldoAkhirKg = totalOnhandKg;
    const saldoAkhirBatch = totalOnhandBatch;
    const saldoAwalKg = Math.max(0, saldoAkhirKg - kedatanganKg + pemakaianKg);
    const saldoAwalBatch = batchSizeKg > 0 ? saldoAwalKg / batchSizeKg : 0;

    let status: 'AMAN' | 'MENIPIS' | 'KOSONG' = 'AMAN';
    if (totalOnhandKg === 0) {
      status = 'KOSONG';
    } else if (bal.isLowStock || totalOnhandKg <= (mat.minStockAlert || 50)) {
      status = 'MENIPIS';
    }

    rows.push({
      rowKey: `general_${mat.id}`,
      lineId: 'gudang_umum',
      lineName: 'Stok Bebas / Gudang',
      skuId: 'general',
      skuName: 'Stok Bebas / Bahan Baku Gudang',
      skuCode: 'GUDANG',
      isKite: false,
      wipId: 'general_wip',
      wipName: 'Umum (Non-BOM)',
      materialId: mat.id,
      materialCode: mat.code || `MAT-${mat.id.slice(-4)}`,
      materialName: mat.name,
      batchSizeKg,
      saldoAwalKg,
      saldoAwalBatch,
      pemesananKg,
      pemesananBatch,
      kedatanganKg,
      kedatanganBatch,
      totalOnhandKg,
      totalOnhandBatch,
      pemakaianKg,
      pemakaianBatch,
      saldoAkhirKg,
      saldoAkhirBatch,
      status
    });
  });

  // Sort rows by Production Line (specific lines first, then Line Umum / Gudang), SKU, WIP, Material
  const isFallbackLine = (lineId: string) => lineId === 'gudang_umum' || lineId === 'line_umum';
  rows.sort((a, b) => {
    const aFb = isFallbackLine(a.lineId) ? 1 : 0;
    const bFb = isFallbackLine(b.lineId) ? 1 : 0;
    if (aFb !== bFb) return aFb - bFb;
    if (a.lineName !== b.lineName) return a.lineName.localeCompare(b.lineName);
    if (a.skuName !== b.skuName) return a.skuName.localeCompare(b.skuName);
    if (a.wipName !== b.wipName) return a.wipName.localeCompare(b.wipName);
    return a.materialName.localeCompare(b.materialName);
  });

  if (options?.lineId && options.lineId !== 'all') {
    return rows.filter(r => r.lineId === options.lineId);
  }

  return rows;
}

/**
 * Memisahkan dan mengelompokkan laporan pemakaian bahan baku
 * sesuai dengan SKU dan WIP yang diproduksi.
 */
export function calculateUsageBreakdown(
  state: AppState,
  options?: { dateString?: string; shift?: ShiftNumber | 'ALL' }
): SkuWipUsageGroup[] {
  const selectedDate = options?.dateString;
  const selectedShift = options?.shift;

  const usages = (state.transactions.usages || []).filter(u => {
    if (selectedDate && u.date !== selectedDate) return false;
    if (selectedShift && selectedShift !== 'ALL' && u.shift !== selectedShift) return false;
    return true;
  });

  const groupMap = new Map<string, SkuWipUsageGroup>();

  usages.forEach(u => {
    const sku = state.master.skus.find(s => s.id === u.skuId);
    const wip = state.master.wips.find(w => w.id === u.wipId);
    const mat = state.master.materials.find(m => m.id === u.materialId);

    const skuId = sku ? sku.id : 'UNLINKED_SKU';
    const skuName = sku ? sku.name : 'Produksi WIP Langsung';
    const skuCode = sku ? (sku.code || `SKU-${sku.id.slice(-4)}`) : 'WIP-DIRECT';
    const isKite = sku?.isKite;

    const wipId = wip ? wip.id : (u.wipId || 'UNLINKED_WIP');
    const wipName = wip ? wip.name : 'Formula WIP Campuran';

    const groupKey = `${skuId}__${wipId}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        skuId,
        skuName,
        skuCode,
        isKite,
        wipId,
        wipName,
        totalGroupKg: 0,
        totalGroupBatches: 0,
        materials: []
      });
    }

    const group = groupMap.get(groupKey)!;
    group.totalGroupKg += u.usageQty;

    // Find batch size kg from recipe or wipMat
    let batchSizeKg = 25;
    const wipRecipe = (state.master.recipes || []).find(r => r.wipId === wipId);
    const recipeItem = wipRecipe?.items?.find(it => it.materialId === u.materialId);
    if (recipeItem && recipeItem.amountKg > 0) {
      batchSizeKg = recipeItem.amountKg;
    } else {
      const wm = (state.master.wipMats || []).find(w => w.wipId === wipId && w.materialId === u.materialId);
      if (wm && wm.materialKgPerBatch > 0) {
        batchSizeKg = wm.materialKgPerBatch;
      } else if (mat?.weightKg && mat.weightKg > 0) {
        batchSizeKg = mat.weightKg;
      }
    }

    const matId = u.materialId;
    let matSummary = group.materials.find(m => m.materialId === matId);
    if (!matSummary) {
      matSummary = {
        materialId: matId,
        materialCode: mat?.code || `MAT-${matId.slice(-4)}`,
        materialName: mat?.name || 'Material',
        totalUsageKg: 0,
        estimatedBatch: 0,
        batchSizeKg,
        locations: [],
        shifts: [],
        operators: [],
        usageCount: 0
      };
      group.materials.push(matSummary);
    }

    matSummary.totalUsageKg += u.usageQty;
    matSummary.usageCount += 1;
    if (u.sourceLocation && !matSummary.locations.includes(u.sourceLocation)) {
      matSummary.locations.push(u.sourceLocation);
    }
    if (u.shift && !matSummary.shifts.includes(u.shift)) {
      matSummary.shifts.push(u.shift);
    }
    if (u.operatorName && !matSummary.operators.includes(u.operatorName)) {
      matSummary.operators.push(u.operatorName);
    }
  });

  // Calculate batch numbers and sort
  const result = Array.from(groupMap.values());
  result.forEach(g => {
    g.materials.forEach(m => {
      m.estimatedBatch = m.batchSizeKg > 0 ? parseFloat((m.totalUsageKg / m.batchSizeKg).toFixed(2)) : 0;
    });
    // Group batch is max or average of batches of its component materials
    if (g.materials.length > 0) {
      const maxBatch = Math.max(...g.materials.map(m => m.estimatedBatch));
      g.totalGroupBatches = maxBatch;
    }
    // Sort materials alphabetically by name
    g.materials.sort((a, b) => a.materialName.localeCompare(b.materialName));
  });

  // Sort groups: SKUs with names first
  result.sort((a, b) => a.skuName.localeCompare(b.skuName));

  return result;
}
