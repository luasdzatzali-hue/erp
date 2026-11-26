import {
  ActiveSkuProductionRun,
  AppState,
  Material,
  MaterialRejectLog,
  ProductionMachine,
  ProductionStopLog,
  RejectCategory,
  ShiftNumber,
  StorageLocation,
  WIP,
  WipProductionBatch,
  WipTank
} from '../types';
import { getShiftFromTime } from './shifts';
import { getAllTanksForWip } from './skuTankHelper';

export interface RejectCategoryMeta {
  id: RejectCategory;
  label: string;
  description: string;
}

export const REJECT_CATEGORIES: RejectCategoryMeta[] = [
  {
    id: 'KEMASAN_RUSAK',
    label: 'Kemasan Rusak / Bocor',
    description: 'Zak, drum, jerigen, atau karton/inner sobek & bocor di area produksi'
  },
  {
    id: 'ADONAN_TERBUANG',
    label: 'Adonan / WIP Terbuang',
    description: 'Adonan tumpah, sisa pipa/hopper, atau kerak proses yang dibuang'
  },
  {
    id: 'SETTING_AWAL',
    label: 'Setting Awal Mesin',
    description: 'Material/WIP terpakai saat kalibrasi mesin atau start-up awal line'
  },
  {
    id: 'KONTAMINASI_QC',
    label: 'Kontaminasi / QC Hold',
    description: 'Material/adonan ditolak QC karena benda asing, suhu, atau warna/aroma'
  }
];

export function getRejectCategoryLabel(category: RejectCategory): string {
  return REJECT_CATEGORIES.find(c => c.id === category)?.label || category;
}

export interface BomMaterialOption {
  material: Material;
  wipId: string;
  wipName: string;
  kgPerBatch: number;
  kgPerCartonSku: number;
  defaultSourceLocation: StorageLocation;
}

function resolveDefaultLocationForMaterial(mat: Material): StorageLocation {
  if (mat.type === 'liquid' && (mat.initialStockTank || 0) > 0) {
    return 'STORAGE_TANK';
  }
  if (mat.source === 'Formulasi') {
    return 'WINEROTO';
  }
  return 'CK';
}

function resolveWipRecipeItems(
  state: AppState,
  wip: WIP,
  preferredRecipeId?: string
): { materialId: string; amountKg: number }[] {
  const wipRecipes = (state.master.recipes || []).filter(r => r.wipId === wip.id);
  const chosenRecipe =
    (preferredRecipeId ? wipRecipes.find(r => r.id === preferredRecipeId) : undefined) ||
    wipRecipes.find(r => r.isDefault) ||
    wipRecipes[0];

  if (chosenRecipe && chosenRecipe.items && chosenRecipe.items.length > 0) {
    return chosenRecipe.items.map(it => ({
      materialId: it.materialId,
      amountKg: it.amountKg > 0 ? it.amountKg : it.unit === 'gr' ? it.amount / 1000 : it.amount
    }));
  }

  const wmItems = (state.master.wipMats || []).filter(wm => wm.wipId === wip.id);
  return wmItems.map(wm => ({
    materialId: wm.materialId,
    amountKg: wm.materialKgPerBatch
  }));
}

export function getMaterialsForSkuBom(state: AppState, skuId: string): BomMaterialOption[] {
  if (!skuId) return [];
  const linkedSkuWips = (state.master.skuWips || []).filter(sw => sw.skuId === skuId);
  const byMaterial = new Map<string, BomMaterialOption>();

  for (const sw of linkedSkuWips) {
    const wip = state.master.wips.find(w => w.id === sw.wipId);
    if (!wip) continue;
    const items = resolveWipRecipeItems(state, wip);
    const sumRecipeKg = items.reduce((s, it) => s + (it.amountKg || 0), 0);
    const wipBatchKg = wip.batchWeightKg > 0 ? wip.batchWeightKg : sumRecipeKg;

    for (const item of items) {
      const mat = state.master.materials.find(m => m.id === item.materialId);
      if (!mat || item.amountKg <= 0) continue;

      const kgPerCarton =
        wipBatchKg > 0 && sw.kgWipPerCartonSku > 0
          ? (item.amountKg / wipBatchKg) * sw.kgWipPerCartonSku
          : 0;

      const existing = byMaterial.get(mat.id);
      if (!existing) {
        byMaterial.set(mat.id, {
          material: mat,
          wipId: wip.id,
          wipName: wip.name,
          kgPerBatch: item.amountKg,
          kgPerCartonSku: parseFloat(kgPerCarton.toFixed(6)),
          defaultSourceLocation: resolveDefaultLocationForMaterial(mat)
        });
      } else {
        existing.kgPerBatch = parseFloat((existing.kgPerBatch + item.amountKg).toFixed(4));
        existing.kgPerCartonSku = parseFloat((existing.kgPerCartonSku + kgPerCarton).toFixed(6));
      }
    }
  }

  return Array.from(byMaterial.values()).sort((a, b) =>
    a.material.name.localeCompare(b.material.name)
  );
}

export function getMaterialsForWipBom(
  state: AppState,
  wipId: string,
  preferredRecipeId?: string,
  skuId?: string
): BomMaterialOption[] {
  if (!wipId) return [];
  const wip = state.master.wips.find(w => w.id === wipId);
  if (!wip) return [];

  const items = resolveWipRecipeItems(state, wip, preferredRecipeId);
  const sumRecipeKg = items.reduce((s, it) => s + (it.amountKg || 0), 0);
  const wipBatchKg = wip.batchWeightKg > 0 ? wip.batchWeightKg : sumRecipeKg;

  const linkedSw =
    (skuId
      ? state.master.skuWips.find(sw => sw.skuId === skuId && sw.wipId === wipId)
      : undefined) || state.master.skuWips.find(sw => sw.wipId === wipId);

  const byMaterial = new Map<string, BomMaterialOption>();
  for (const item of items) {
    const mat = state.master.materials.find(m => m.id === item.materialId);
    if (!mat || item.amountKg <= 0) continue;

    const kgPerCarton =
      wipBatchKg > 0 && linkedSw && linkedSw.kgWipPerCartonSku > 0
        ? (item.amountKg / wipBatchKg) * linkedSw.kgWipPerCartonSku
        : 0;

    const existing = byMaterial.get(mat.id);
    if (!existing) {
      byMaterial.set(mat.id, {
        material: mat,
        wipId: wip.id,
        wipName: wip.name,
        kgPerBatch: item.amountKg,
        kgPerCartonSku: parseFloat(kgPerCarton.toFixed(6)),
        defaultSourceLocation: resolveDefaultLocationForMaterial(mat)
      });
    } else {
      existing.kgPerBatch = parseFloat((existing.kgPerBatch + item.amountKg).toFixed(4));
      existing.kgPerCartonSku = parseFloat((existing.kgPerCartonSku + kgPerCarton).toFixed(6));
    }
  }

  return Array.from(byMaterial.values()).sort((a, b) =>
    a.material.name.localeCompare(b.material.name)
  );
}

export function computeEquivalentCartonsLoss(params: {
  rejectQtyKg: number;
  materialKgPerCartonSku?: number;
  fallbackCartonWeightKg?: number;
}): number {
  const qtyKg = Math.max(0, Number(params.rejectQtyKg) || 0);
  if (qtyKg <= 0) return 0;

  if (params.materialKgPerCartonSku && params.materialKgPerCartonSku > 0) {
    return parseFloat((qtyKg / params.materialKgPerCartonSku).toFixed(2));
  }
  if (params.fallbackCartonWeightKg && params.fallbackCartonWeightKg > 0) {
    return parseFloat((qtyKg / params.fallbackCartonWeightKg).toFixed(2));
  }
  return 0;
}

export interface LineConnectedTankStatus {
  tank: WipTank;
  wipId: string;
  wipName: string;
  kgPerCarton: number;
  fillPct: number;
  possibleCartons: number;
  isLow: boolean;
}

export interface LineStationMetrics {
  activeRun: ActiveSkuProductionRun | null;
  latestRun: ActiveSkuProductionRun | null;
  targetPerHour: number;
  plannedCartons: number;
  actualCartons: number;
  progressPct: number;
  elapsedMinutes: number;
  expectedStandardCartons: number;
  actualRatePerHour: number;
  liveVarianceCartons: number;
  liveVariancePct: number;
  connectedTanks: LineConnectedTankStatus[];
  standardBomMaterialKg: number;
  totalRejectKg: number;
  actualMaterialUsedKg: number;
  materialVariancePct: number;
  rejectEquivalentCartons: number;
  availabilityLossMinutes: number;
  availabilityStopsCount: number;
  performanceLossCartons: number;
  performanceLossMinutes: number;
  qualityLossCartons: number;
  qualityLossKg: number;
  qualityLossMinutes: number;
  totalSblLossMinutes: number;
  lineRejectLogs: MaterialRejectLog[];
  lineStopLogs: ProductionStopLog[];
}

function getAllRuns(state: AppState): ActiveSkuProductionRun[] {
  if (state.activeSkuRuns && state.activeSkuRuns.length > 0) {
    return state.activeSkuRuns;
  }
  return state.activeSkuRun ? [state.activeSkuRun] : [];
}

function matchesLine(
  targetLineId: string,
  targetLineName: string | undefined,
  candidateLineId?: string,
  candidateLineName?: string
): boolean {
  if (candidateLineId && candidateLineId === targetLineId) return true;
  if (
    targetLineName &&
    candidateLineName &&
    candidateLineName.trim().toLowerCase() === targetLineName.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

export function computeLineVarianceAndSbl(params: {
  state: AppState;
  lineId: string;
  dateStr: string;
  shift: ShiftNumber;
  nowMs?: number;
}): LineStationMetrics {
  const { state, lineId, dateStr, shift } = params;
  const nowMs = params.nowMs ?? Date.now();
  const line = (state.master.productionLines || []).find(l => l.id === lineId);
  const runs = getAllRuns(state);

  const activeRun =
    runs.find(r => r.isRunning && matchesLine(lineId, line?.name, r.lineId, r.lineName)) || null;

  const lineShiftRuns = runs
    .filter(
      r =>
        matchesLine(lineId, line?.name, r.lineId, r.lineName) &&
        r.startedAt.slice(0, 10) === dateStr &&
        r.shift === shift
    )
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const latestRun = activeRun || lineShiftRuns[0] || runs.find(r => matchesLine(lineId, line?.name, r.lineId, r.lineName)) || null;
  const sku = latestRun ? state.master.skus.find(s => s.id === latestRun.skuId) : undefined;
  const targetPerHour = latestRun?.targetPerHour || sku?.targetHour || 500;
  const plannedCartons = latestRun?.plannedCartons || targetPerHour * 8;

  // Carton logs on this line for selected shift/date
  const lineCartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    if (cp.timestamp.slice(0, 10) !== dateStr) return false;
    const cpShift = cp.shift || getShiftFromTime(cp.timestamp).shift;
    if (cpShift !== shift) return false;
    if (cp.lineId || cp.lineName) {
      return matchesLine(lineId, line?.name, cp.lineId, cp.lineName);
    }
    return Boolean(latestRun && cp.skuId === latestRun.skuId);
  });

  const loggedCartons = lineCartonLogs.reduce((s, cp) => s + (cp.cartonsProduced || 0), 0);
  const actualCartons =
    activeRun && activeRun.shift === shift && activeRun.startedAt.slice(0, 10) === dateStr
      ? Math.max(activeRun.cartonsProducedTotal || 0, loggedCartons)
      : Math.max(loggedCartons, latestRun && latestRun.shift === shift && latestRun.startedAt.slice(0, 10) === dateStr ? (latestRun.cartonsProducedTotal || 0) : 0);

  const progressPct = plannedCartons > 0 ? Math.min(100, Math.round((actualCartons / plannedCartons) * 100)) : 0;

  // Live speed variance
  let elapsedMinutes = 0;
  let expectedStandardCartons = 0;
  let actualRatePerHour = 0;

  if (latestRun && latestRun.startedAt.slice(0, 10) === dateStr && latestRun.shift === shift) {
    const startMs = Date.parse(latestRun.startedAt);
    const endMs = latestRun.isRunning
      ? nowMs
      : latestRun.completedAt
      ? Date.parse(latestRun.completedAt)
      : nowMs;
    const rawElapsedMs = Math.max(0, endMs - startMs);
    elapsedMinutes = Math.round(rawElapsedMs / 60000);
    const elapsedHours = rawElapsedMs / 3600000;
    expectedStandardCartons = Math.round(targetPerHour * elapsedHours);
    actualRatePerHour = elapsedHours >= 1 / 60 ? Math.round(actualCartons / elapsedHours) : targetPerHour;
  }

  const liveVarianceCartons = actualCartons - expectedStandardCartons;
  const liveVariancePct =
    expectedStandardCartons > 0
      ? parseFloat(((liveVarianceCartons / expectedStandardCartons) * 100).toFixed(1))
      : 0;

  // Connected Holding Tanks for active/latest SKU
  const connectedTanks: LineConnectedTankStatus[] = [];
  if (latestRun) {
    const linkedWips = (state.master.skuWips || []).filter(sw => sw.skuId === latestRun.skuId);
    for (const sw of linkedWips) {
      const wip = state.master.wips.find(w => w.id === sw.wipId);
      if (!wip) continue;
      const allTanks = getAllTanksForWip(wip, state.master.tanks);
      const holdingTanks = allTanks.filter(t => t.type === 'HOLDING_TANK');
      const selectedId = latestRun.selectedHoldingTanks?.[wip.id];
      const primaryTank =
        (selectedId ? allTanks.find(t => t.id === selectedId) : undefined) ||
        holdingTanks[0] ||
        allTanks[0];
      if (primaryTank) {
        const fillPct =
          primaryTank.capacityKg > 0
            ? Math.min(100, Math.round((primaryTank.currentLevelKg / primaryTank.capacityKg) * 100))
            : 0;
        const possibleCartons =
          sw.kgWipPerCartonSku > 0 ? Math.floor(primaryTank.currentLevelKg / sw.kgWipPerCartonSku) : 0;
        const isLow =
          primaryTank.currentLevelKg <= (primaryTank.minAlertKg ?? 50) ||
          (sw.kgWipPerCartonSku > 0 && primaryTank.currentLevelKg < sw.kgWipPerCartonSku);

        connectedTanks.push({
          tank: primaryTank,
          wipId: wip.id,
          wipName: wip.name,
          kgPerCarton: sw.kgWipPerCartonSku,
          fillPct,
          possibleCartons,
          isLow
        });
      }
    }
  }

  // Stop logs on this line for date & shift
  const lineStopLogs = (state.transactions.productionStops || [])
    .filter(stop => {
      if (stop.stoppedAt.slice(0, 10) !== dateStr) return false;
      const sShift = stop.shift || getShiftFromTime(stop.stoppedAt).shift;
      if (sShift !== shift) return false;
      if (stop.lineId || stop.lineName) {
        return matchesLine(lineId, line?.name, stop.lineId, stop.lineName);
      }
      return Boolean(latestRun && stop.skuId === latestRun.skuId);
    })
    .sort((a, b) => Date.parse(b.stoppedAt) - Date.parse(a.stoppedAt));

  // Reject logs on this line for date & shift
  const lineRejectLogs = (state.transactions.rejectLogs || [])
    .filter(rej => {
      if (rej.date !== dateStr || rej.shift !== shift) return false;
      if (rej.stationType !== 'LINE') return false;
      return matchesLine(lineId, line?.name, rej.lineId, rej.lineName);
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  // Material Variance: Actual = Standard BOM Output + Total Reject Material
  const skuBomMaterials = latestRun ? getMaterialsForSkuBom(state, latestRun.skuId) : [];
  const totalBomKgPerCarton = skuBomMaterials.reduce((s, m) => s + m.kgPerCartonSku, 0);
  const standardBomMaterialKg =
    totalBomKgPerCarton > 0
      ? parseFloat((actualCartons * totalBomKgPerCarton).toFixed(2))
      : parseFloat((actualCartons * (sku?.cartonWeightKg || 0)).toFixed(2));
  const totalRejectKg = parseFloat(
    lineRejectLogs.reduce((s, r) => s + (r.rejectQtyKg || 0), 0).toFixed(3)
  );
  const actualMaterialUsedKg = parseFloat((standardBomMaterialKg + totalRejectKg).toFixed(3));
  const materialVariancePct =
    standardBomMaterialKg > 0
      ? parseFloat(((totalRejectKg / standardBomMaterialKg) * 100).toFixed(2))
      : totalRejectKg > 0
      ? 100
      : 0;

  // Six Big Losses (3 Pillars)
  const availabilityStops = lineStopLogs.filter(s => s.lossType === 'DOWNTIME');
  const availabilityLossMinutes = availabilityStops.reduce((s, l) => s + (l.durationMinutes || 0), 0);

  const speedStopMinutes = lineStopLogs
    .filter(s => s.lossType === 'SPEED')
    .reduce((s, l) => s + (l.durationMinutes || 0), 0);
  const speedDeficitCartons = liveVarianceCartons < 0 ? Math.abs(liveVarianceCartons) : 0;
  const performanceLossMinutes =
    speedStopMinutes + (targetPerHour > 0 ? Math.round((speedDeficitCartons / targetPerHour) * 60) : 0);

  const qualityStopMinutes = lineStopLogs
    .filter(s => s.lossType === 'QUALITY')
    .reduce((s, l) => s + (l.durationMinutes || 0), 0);
  const rejectEquivalentCartons = parseFloat(
    lineRejectLogs.reduce((s, r) => s + (r.equivalentCartonsLoss || 0), 0).toFixed(2)
  );
  const qualityLossMinutes =
    qualityStopMinutes +
    (targetPerHour > 0 ? Math.round((rejectEquivalentCartons / targetPerHour) * 60) : 0);

  return {
    activeRun,
    latestRun,
    targetPerHour,
    plannedCartons,
    actualCartons,
    progressPct,
    elapsedMinutes,
    expectedStandardCartons,
    actualRatePerHour,
    liveVarianceCartons,
    liveVariancePct,
    connectedTanks,
    standardBomMaterialKg,
    totalRejectKg,
    actualMaterialUsedKg,
    materialVariancePct,
    rejectEquivalentCartons,
    availabilityLossMinutes,
    availabilityStopsCount: availabilityStops.length,
    performanceLossCartons: speedDeficitCartons,
    performanceLossMinutes,
    qualityLossCartons: rejectEquivalentCartons,
    qualityLossKg: totalRejectKg,
    qualityLossMinutes,
    totalSblLossMinutes: availabilityLossMinutes + performanceLossMinutes + qualityLossMinutes,
    lineRejectLogs,
    lineStopLogs
  };
}

export interface CkStationMetrics {
  machine: ProductionMachine | null;
  activeBatch: WipProductionBatch | null;
  activeWip: WIP | null;
  targetTank: WipTank | null;
  targetTankFillPct: number;
  targetTankHeadroomKg: number;
  durationMinutes: number;
  elapsedMs: number;
  remainingMs: number;
  progressPct: number;
  isPaused: boolean;
  isOverdue: boolean;
  bomMaterials: BomMaterialOption[];
  completedBatchesCount: number;
  completedBatchWeightKg: number;
  machineRejectLogs: MaterialRejectLog[];
  totalRejectKg: number;
  rejectEquivalentCartons: number;
  standardBomMaterialKg: number;
  actualMaterialUsedKg: number;
  materialVariancePct: number;
}

export function computeCkStationMetrics(params: {
  state: AppState;
  machineId: string;
  dateStr: string;
  shift: ShiftNumber;
  nowMs?: number;
}): CkStationMetrics {
  const { state, machineId, dateStr, shift } = params;
  const nowMs = params.nowMs ?? Date.now();
  const machine = (state.master.machines || []).find(m => m.id === machineId) || null;
  const batches = state.transactions.wipBatches || [];

  const activeBatch =
    batches.find(
      b => b.targetMachineId === machineId && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
    ) || null;

  const activeWipId = activeBatch?.wipId || machine?.currentWipId;
  const activeWip = activeWipId ? state.master.wips.find(w => w.id === activeWipId) || null : null;

  const targetTankId = activeBatch?.targetTankId || activeWip?.targetTankId;
  const targetTank = targetTankId
    ? state.master.tanks.find(t => t.id === targetTankId) || null
    : activeWip
    ? getAllTanksForWip(activeWip, state.master.tanks)[0] || null
    : null;

  const targetTankFillPct =
    targetTank && targetTank.capacityKg > 0
      ? Math.min(100, Math.round((targetTank.currentLevelKg / targetTank.capacityKg) * 100))
      : 0;
  const targetTankHeadroomKg = targetTank
    ? Math.max(0, parseFloat((targetTank.capacityKg - targetTank.currentLevelKg).toFixed(1)))
    : 0;

  let durationMinutes = activeBatch?.durationMinutes || activeWip?.productionDurationMinutes || 30;
  let elapsedMs = 0;
  let remainingMs = durationMinutes * 60_000;
  let progressPct = 0;
  let isPaused = false;
  let isOverdue = false;

  if (activeBatch) {
    isPaused = activeBatch.status === 'DIJEDA';
    const totalMs = Math.max(60_000, durationMinutes * 60_000);
    if (isPaused) {
      remainingMs =
        typeof activeBatch.remainingMsAtPause === 'number'
          ? Math.max(0, activeBatch.remainingMsAtPause)
          : totalMs;
      elapsedMs = Math.max(0, totalMs - remainingMs);
    } else if (activeBatch.estimatedCompletionTime) {
      const estMs = Date.parse(activeBatch.estimatedCompletionTime);
      const rawRem = estMs - nowMs;
      isOverdue = rawRem <= 0;
      remainingMs = Math.max(0, rawRem);
      elapsedMs = Math.max(0, totalMs - rawRem);
    } else {
      const startMs = Date.parse(activeBatch.startedAt);
      elapsedMs = Math.max(0, nowMs - startMs - (activeBatch.totalPausedMs || 0));
      remainingMs = Math.max(0, totalMs - elapsedMs);
      isOverdue = elapsedMs >= totalMs;
    }
    progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));
  }

  const bomMaterials = activeWip
    ? getMaterialsForWipBom(state, activeWip.id, activeBatch?.recipeId, activeBatch?.skuId)
    : [];

  const shiftMachineBatches = batches.filter(b => {
    if (b.targetMachineId !== machineId) return false;
    if (b.startedAt.slice(0, 10) !== dateStr) return false;
    const bShift = b.shift || getShiftFromTime(b.startedAt).shift;
    return bShift === shift;
  });

  const completedBatches = shiftMachineBatches.filter(b => b.status === 'SELESAI');
  const completedBatchesCount = completedBatches.length;
  const completedBatchWeightKg = parseFloat(
    completedBatches.reduce((s, b) => s + (b.batchWeightKg || 0), 0).toFixed(2)
  );

  // Also include active batch BOM weight in standard consumption benchmark if any
  const activeOrCompletedBatches = shiftMachineBatches.filter(b => b.status !== 'DIBATALKAN');
  const standardBomMaterialKg = parseFloat(
    activeOrCompletedBatches
      .reduce(
        (s, b) =>
          s +
          (b.materials || []).reduce((ms, m) => ms + (m.actualUsedKg || m.requiredKg || 0), 0),
        0
      )
      .toFixed(2)
  );

  const machineRejectLogs = (state.transactions.rejectLogs || [])
    .filter(rej => {
      if (rej.date !== dateStr || rej.shift !== shift) return false;
      if (rej.stationType !== 'CENTRAL_KITCHEN') return false;
      return rej.machineId === machineId;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const totalRejectKg = parseFloat(
    machineRejectLogs.reduce((s, r) => s + (r.rejectQtyKg || 0), 0).toFixed(3)
  );
  const rejectEquivalentCartons = parseFloat(
    machineRejectLogs.reduce((s, r) => s + (r.equivalentCartonsLoss || 0), 0).toFixed(2)
  );
  const actualMaterialUsedKg = parseFloat((standardBomMaterialKg + totalRejectKg).toFixed(3));
  const materialVariancePct =
    standardBomMaterialKg > 0
      ? parseFloat(((totalRejectKg / standardBomMaterialKg) * 100).toFixed(2))
      : totalRejectKg > 0
      ? 100
      : 0;

  return {
    machine,
    activeBatch,
    activeWip,
    targetTank,
    targetTankFillPct,
    targetTankHeadroomKg,
    durationMinutes,
    elapsedMs,
    remainingMs,
    progressPct,
    isPaused,
    isOverdue,
    bomMaterials,
    completedBatchesCount,
    completedBatchWeightKg,
    machineRejectLogs,
    totalRejectKg,
    rejectEquivalentCartons,
    standardBomMaterialKg,
    actualMaterialUsedKg,
    materialVariancePct
  };
}

export interface MaterialVarianceSummaryRow {
  materialId: string;
  materialCode: string;
  materialName: string;
  standardBomKg: number;
  rejectKg: number;
  actualKg: number; // Standar BOM Output + Total Reject Material
  variancePct: number;
  equivalentCartonsLoss: number;
  rejectCount: number;
}

export interface ShiftSblThreePillarSummary {
  availabilityLossMinutes: number;
  performanceLossMinutes: number;
  performanceLossCartons: number;
  qualityLossMinutes: number;
  qualityLossCartons: number;
  qualityLossKg: number;
  totalLossMinutes: number;
}

export interface ShiftVarianceAndSblSummary {
  shiftRejectLogs: MaterialRejectLog[];
  totalStandardBomKg: number;
  totalRejectKg: number;
  totalActualMaterialKg: number;
  overallMaterialVariancePct: number;
  totalRejectEquivalentCartons: number;
  materialVarianceRows: MaterialVarianceSummaryRow[];
  sblThreePillar: ShiftSblThreePillarSummary;
}

export function computeShiftVarianceAndSblSummary(
  state: AppState,
  selectedDate: string,
  selectedShift: ShiftNumber,
  nowMs = Date.now()
): ShiftVarianceAndSblSummary {
  const shiftRejectLogs = (state.transactions.rejectLogs || [])
    .filter(rej => rej.date === selectedDate && rej.shift === selectedShift)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const shiftCartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    if (cp.timestamp.slice(0, 10) !== selectedDate) return false;
    const s = cp.shift || getShiftFromTime(cp.timestamp).shift;
    return s === selectedShift;
  });

  const shiftStopLogs = (state.transactions.productionStops || []).filter(stop => {
    if (stop.stoppedAt.slice(0, 10) !== selectedDate) return false;
    const s = stop.shift || getShiftFromTime(stop.stoppedAt).shift;
    return s === selectedShift;
  });

  const matMap = new Map<string, MaterialVarianceSummaryRow>();

  const ensureRow = (materialId: string, fallbackName?: string, fallbackCode?: string) => {
    let existing = matMap.get(materialId);
    if (!existing) {
      const mat = state.master.materials.find(m => m.id === materialId);
      existing = {
        materialId,
        materialCode: mat?.code || fallbackCode || `MAT-${materialId.slice(-4)}`,
        materialName: mat?.name || fallbackName || 'Material',
        standardBomKg: 0,
        rejectKg: 0,
        actualKg: 0,
        variancePct: 0,
        equivalentCartonsLoss: 0,
        rejectCount: 0
      };
      matMap.set(materialId, existing);
    }
    return existing;
  };

  // Accumulate Standard BOM consumption from Carton Output
  // Track cartons by SKU so we don't double-count if activeRun also tracks same shift
  const cartonsBySku = new Map<string, number>();
  for (const cp of shiftCartonLogs) {
    cartonsBySku.set(cp.skuId, (cartonsBySku.get(cp.skuId) || 0) + (cp.cartonsProduced || 0));
  }
  for (const run of getAllRuns(state)) {
    if (run.startedAt.slice(0, 10) === selectedDate && run.shift === selectedShift) {
      const logged = cartonsBySku.get(run.skuId) || 0;
      if (run.cartonsProducedTotal > logged) {
        cartonsBySku.set(run.skuId, run.cartonsProducedTotal);
      }
    }
  }

  for (const [skuId, cartons] of cartonsBySku.entries()) {
    if (cartons <= 0) continue;
    const bomMats = getMaterialsForSkuBom(state, skuId);
    for (const bm of bomMats) {
      const row = ensureRow(bm.material.id, bm.material.name, bm.material.code);
      row.standardBomKg += cartons * bm.kgPerCartonSku;
    }
  }

  // Fallback to actual shift usages when no carton output was produced yet (e.g. pure CK batching)
  if (cartonsBySku.size === 0) {
    const shiftUsages = (state.transactions.usages || []).filter(
      u => u.date === selectedDate && (u.shift || selectedShift) === selectedShift
    );
    for (const u of shiftUsages) {
      const row = ensureRow(u.materialId);
      row.standardBomKg += u.usageQty || 0;
    }
  }

  // Accumulate Rejects
  for (const rej of shiftRejectLogs) {
    const row = ensureRow(rej.materialId, rej.materialName, rej.materialCode);
    row.rejectKg += rej.rejectQtyKg || 0;
    row.equivalentCartonsLoss += rej.equivalentCartonsLoss || 0;
    row.rejectCount += 1;
  }

  const materialVarianceRows: MaterialVarianceSummaryRow[] = [];
  for (const row of matMap.values()) {
    row.standardBomKg = parseFloat(row.standardBomKg.toFixed(3));
    row.rejectKg = parseFloat(row.rejectKg.toFixed(3));
    row.actualKg = parseFloat((row.standardBomKg + row.rejectKg).toFixed(3));
    row.equivalentCartonsLoss = parseFloat(row.equivalentCartonsLoss.toFixed(2));
    row.variancePct =
      row.standardBomKg > 0
        ? parseFloat(((row.rejectKg / row.standardBomKg) * 100).toFixed(2))
        : row.rejectKg > 0
        ? 100
        : 0;
    if (row.standardBomKg > 0 || row.rejectKg > 0) {
      materialVarianceRows.push(row);
    }
  }

  materialVarianceRows.sort((a, b) => b.rejectKg - a.rejectKg || b.actualKg - a.actualKg);

  const totalStandardBomKg = parseFloat(
    materialVarianceRows.reduce((s, r) => s + r.standardBomKg, 0).toFixed(2)
  );
  const totalRejectKg = parseFloat(
    shiftRejectLogs.reduce((s, r) => s + (r.rejectQtyKg || 0), 0).toFixed(3)
  );
  const totalActualMaterialKg = parseFloat((totalStandardBomKg + totalRejectKg).toFixed(2));
  const overallMaterialVariancePct =
    totalStandardBomKg > 0
      ? parseFloat(((totalRejectKg / totalStandardBomKg) * 100).toFixed(2))
      : totalRejectKg > 0
      ? 100
      : 0;
  const totalRejectEquivalentCartons = parseFloat(
    shiftRejectLogs.reduce((s, r) => s + (r.equivalentCartonsLoss || 0), 0).toFixed(2)
  );

  // 3-Pillar SBL across all lines + rejects
  const availabilityLossMinutes = shiftStopLogs
    .filter(s => s.lossType === 'DOWNTIME')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  const speedStopMinutes = shiftStopLogs
    .filter(s => s.lossType === 'SPEED')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  let performanceLossCartons = 0;
  let speedVarianceMinutes = 0;
  const lines = state.master.productionLines || [];
  const runs = getAllRuns(state).filter(
    r => r.startedAt.slice(0, 10) === selectedDate && r.shift === selectedShift
  );

  const seenLineIds = new Set<string>();
  for (const l of lines) {
    seenLineIds.add(l.id);
    const m = computeLineVarianceAndSbl({
      state,
      lineId: l.id,
      dateStr: selectedDate,
      shift: selectedShift,
      nowMs
    });
    performanceLossCartons += m.performanceLossCartons;
    const lineSpeedStopMins = m.lineStopLogs
      .filter(s => s.lossType === 'SPEED')
      .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    speedVarianceMinutes += Math.max(0, m.performanceLossMinutes - lineSpeedStopMins);
  }
  // Include any run on an ad-hoc line not in master.productionLines
  for (const r of runs) {
    if (r.lineId && !seenLineIds.has(r.lineId)) {
      seenLineIds.add(r.lineId);
      const sku = state.master.skus.find(s => s.id === r.skuId);
      const targetPerHour = r.targetPerHour || sku?.targetHour || 500;
      const endMs = r.isRunning ? nowMs : r.completedAt ? Date.parse(r.completedAt) : nowMs;
      const elapsedHrs = Math.max(0, endMs - Date.parse(r.startedAt)) / 3600000;
      const expected = Math.round(targetPerHour * elapsedHrs);
      const deficit = Math.max(0, expected - (r.cartonsProducedTotal || 0));
      performanceLossCartons += deficit;
      if (targetPerHour > 0) {
        speedVarianceMinutes += Math.round((deficit / targetPerHour) * 60);
      }
    }
  }

  const performanceLossMinutes = speedStopMinutes + speedVarianceMinutes;

  const qualityStopMinutes = shiftStopLogs
    .filter(s => s.lossType === 'QUALITY')
    .reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

  // Convert reject equivalent cartons to minutes using average targetHour across shift runs (fallback 500)
  const avgTargetHour =
    runs.length > 0
      ? runs.reduce((s, r) => s + (r.targetPerHour || 500), 0) / runs.length
      : state.master.skus[0]?.targetHour || 500;
  const rejectMinutes =
    avgTargetHour > 0 ? Math.round((totalRejectEquivalentCartons / avgTargetHour) * 60) : 0;
  const qualityLossMinutes = qualityStopMinutes + rejectMinutes;

  return {
    shiftRejectLogs,
    totalStandardBomKg,
    totalRejectKg,
    totalActualMaterialKg,
    overallMaterialVariancePct,
    totalRejectEquivalentCartons,
    materialVarianceRows,
    sblThreePillar: {
      availabilityLossMinutes,
      performanceLossMinutes,
      performanceLossCartons,
      qualityLossMinutes,
      qualityLossCartons: totalRejectEquivalentCartons,
      qualityLossKg: totalRejectKg,
      totalLossMinutes: availabilityLossMinutes + performanceLossMinutes + qualityLossMinutes
    }
  };
}
