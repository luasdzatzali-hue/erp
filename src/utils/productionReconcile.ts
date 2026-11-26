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
