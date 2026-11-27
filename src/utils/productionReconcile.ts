export interface MissedProductionCalculationInput {
  anchorIso?: string;
  nowMs?: number;
  targetPerHour?: number;
  speedMultiplier?: number;
  plannedCartons?: number;
  cartonsProducedTotal?: number;
  minElapsedMsOverride?: number;
}

export interface MissedProductionCalculationResult {
  missedCartons: number;
  targetToProduce: number;
  intervalSeconds: number;
  elapsedSeconds: number;
  isPlanAlreadyReached: boolean;
}

export interface MaterialBomVarianceInput {
  actualCartons: number;
  standardBomKgPerCarton: number;
  actualMaterialUsedKg?: number;
  loggedRejectKg?: number;
  startupRejectKg?: number;
  tankScrapKg?: number;
}

export interface MaterialBomVarianceResult {
  standardBomMaterialKg: number;
  totalActualMaterialKg: number;
  loggedRejectKg: number;
  tankScrapKg: number;
  processDefectsLossKg: number;
  processDefectsEquivalentCartons: number;
  unloggedOverVarianceKg: number;
  reducedYieldLossKg: number;
  reducedYieldEquivalentCartons: number;
  totalScrapAndVarianceKg: number;
  totalLossEquivalentCartons: number;
  materialVariancePct: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Menghitung jumlah karton yang tertinggal saat timer interval browser berhenti
 * (misalnya tab/window diminimize, ditutup, atau perangkat sleep).
 */
export function calculateMissedProduction(
  input: MissedProductionCalculationInput
): MissedProductionCalculationResult {
  const targetPerHour = input.targetPerHour && input.targetPerHour > 0 ? input.targetPerHour : 600;
  const speedMultiplier =
    input.speedMultiplier && input.speedMultiplier > 0 ? input.speedMultiplier : 1;
  const intervalSeconds = 3600 / (targetPerHour * speedMultiplier);

  if (!input.anchorIso) {
    return {
      missedCartons: 0,
      targetToProduce: 0,
      intervalSeconds,
      elapsedSeconds: 0,
      isPlanAlreadyReached: false
    };
  }

  const rawAnchorMs = new Date(input.anchorIso).getTime();
  if (!Number.isFinite(rawAnchorMs)) {
    return {
      missedCartons: 0,
      targetToProduce: 0,
      intervalSeconds,
      elapsedSeconds: 0,
      isPlanAlreadyReached: false
    };
  }

  const effectiveAnchorMs = Math.max(rawAnchorMs, input.minElapsedMsOverride || 0);
  const nowMs = input.nowMs ?? Date.now();
  const elapsedSeconds = Math.max(0, (nowMs - effectiveAnchorMs) / 1000);
  const missedCartons = Math.floor(elapsedSeconds / intervalSeconds);

  const hasPlan = Boolean(input.plannedCartons && input.plannedCartons > 0);
  const produced = input.cartonsProducedTotal || 0;
  const remainingPlan = hasPlan ? Math.max(0, (input.plannedCartons || 0) - produced) : missedCartons;
  const isPlanAlreadyReached = hasPlan && remainingPlan <= 0;

  const targetToProduce = isPlanAlreadyReached
    ? 0
    : hasPlan
    ? Math.min(missedCartons, remainingPlan)
    : missedCartons;

  return {
    missedCartons,
    targetToProduce,
    intervalSeconds,
    elapsedSeconds,
    isPlanAlreadyReached
  };
}

/**
 * Rekonsiliasi selisih pemakaian bahan baku aktual terhadap standar BOM output karton.
 * Memisahkan Process Defects (reject operasional) dan Reduced Yield (startup reject + over-variance BOM + scrap tangki WIP)
 * agar otomatis memengaruhi skor Quality OEE.
 */
export function reconcileMaterialBomVariance(
  input: MaterialBomVarianceInput
): MaterialBomVarianceResult {
  const actualCartons = Math.max(0, Number(input.actualCartons) || 0);
  const kgPerCarton = Math.max(0, Number(input.standardBomKgPerCarton) || 0);
  const standardBomMaterialKg = round3(actualCartons * kgPerCarton);

  const loggedRejectKg = round3(Math.max(0, Number(input.loggedRejectKg) || 0));
  const startupRejectKg = round3(
    Math.min(loggedRejectKg, Math.max(0, Number(input.startupRejectKg) || 0))
  );
  const tankScrapKg = round3(Math.max(0, Number(input.tankScrapKg) || 0));
  const processDefectsLossKg = round3(Math.max(0, loggedRejectKg - startupRejectKg));

  let totalActualMaterialKg: number;
  let unloggedOverVarianceKg = 0;

  if (typeof input.actualMaterialUsedKg === 'number' && Number.isFinite(input.actualMaterialUsedKg)) {
    const rawUsedKg = round3(Math.max(0, input.actualMaterialUsedKg));
    const totalOverBomKg = Math.max(0, rawUsedKg - standardBomMaterialKg);
    unloggedOverVarianceKg = round3(Math.max(0, totalOverBomKg - loggedRejectKg));
    totalActualMaterialKg = round3(
      Math.max(rawUsedKg, standardBomMaterialKg + loggedRejectKg + tankScrapKg)
    );
  } else {
    totalActualMaterialKg = round3(standardBomMaterialKg + loggedRejectKg + tankScrapKg);
  }

  const reducedYieldLossKg = round3(
    startupRejectKg + Math.max(unloggedOverVarianceKg, tankScrapKg)
  );
  const totalScrapAndVarianceKg = round3(processDefectsLossKg + reducedYieldLossKg);

  const processDefectsEquivalentCartons =
    kgPerCarton > 0 ? round2(processDefectsLossKg / kgPerCarton) : 0;
  const reducedYieldEquivalentCartons =
    kgPerCarton > 0 ? round2(reducedYieldLossKg / kgPerCarton) : 0;
  const totalLossEquivalentCartons = round2(
    processDefectsEquivalentCartons + reducedYieldEquivalentCartons
  );

  const varianceDeltaKg = totalActualMaterialKg - standardBomMaterialKg;
  const materialVariancePct =
    standardBomMaterialKg > 0
      ? round2((varianceDeltaKg / standardBomMaterialKg) * 100)
      : totalScrapAndVarianceKg > 0
      ? 100
      : 0;

  return {
    standardBomMaterialKg,
    totalActualMaterialKg,
    loggedRejectKg,
    tankScrapKg,
    processDefectsLossKg,
    processDefectsEquivalentCartons,
    unloggedOverVarianceKg,
    reducedYieldLossKg,
    reducedYieldEquivalentCartons,
    totalScrapAndVarianceKg,
    totalLossEquivalentCartons,
    materialVariancePct
  };
}
