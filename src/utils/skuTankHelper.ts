import { AppState, SKU, SkuWip, WIP, WipTank } from '../types';

/**
 * Mengembalikan seluruh tangki (Holding Tank & Storage Tank) yang terhubung dengan WIP tertentu,
 * baik melalui wip.targetTankId, wip.targetTankIds, maupun tank.assignedWipId.
 */
export function getAllTanksForWip(wip: WIP | undefined, tanks: WipTank[]): WipTank[] {
  if (!wip) return [];
  const targetIdSet = new Set<string>();
  if (wip.targetTankId) targetIdSet.add(wip.targetTankId);
  if (Array.isArray(wip.targetTankIds)) {
    wip.targetTankIds.forEach(id => {
      if (id) targetIdSet.add(id);
    });
  }
  return tanks.filter(t => targetIdSet.has(t.id) || t.assignedWipId === wip.id);
}

/**
 * Mengembalikan daftar Holding Tank (type === 'HOLDING_TANK') yang dikonfigurasi untuk WIP tertentu.
 */
export function getHoldingTanksForWip(wip: WIP | undefined, tanks: WipTank[]): WipTank[] {
  return getAllTanksForWip(wip, tanks).filter(t => t.type === 'HOLDING_TANK');
}

export interface MultiHoldingTankWipOption {
  skuWip: SkuWip;
  wip: WIP;
  holdingTanks: WipTank[];
  allTanks: WipTank[];
  defaultHoldingTankId: string;
}

/**
 * Memilih Holding Tank default terbaik untuk sebuah WIP (prioritaskan yang ACTIVE dan stok terbesar).
 */
export function pickDefaultHoldingTankId(holdingTanks: WipTank[]): string {
  if (holdingTanks.length === 0) return '';
  const sorted = [...holdingTanks].sort((a, b) => {
    const aActive = a.status === 'ACTIVE' ? 1 : 0;
    const bActive = b.status === 'ACTIVE' ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return b.currentLevelKg - a.currentLevelKg;
  });
  return sorted[0].id;
}

/**
 * Mengembalikan daftar komponen WIP pada BOM SKU yang dikonfigurasi memiliki >= 2 Holding Tank berbeda.
 */
export function getSkuWipsWithMultipleHoldingTanks(
  skuId: string,
  state: Pick<AppState, 'master'>
): MultiHoldingTankWipOption[] {
  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === skuId);
  const results: MultiHoldingTankWipOption[] = [];

  for (const sw of linkedWips) {
    const wip = state.master.wips.find(w => w.id === sw.wipId);
    if (!wip) continue;
    const allTanks = getAllTanksForWip(wip, state.master.tanks);
    const holdingTanks = allTanks.filter(t => t.type === 'HOLDING_TANK');

    if (holdingTanks.length >= 2) {
      results.push({
        skuWip: sw,
        wip,
        holdingTanks,
        allTanks,
        defaultHoldingTankId: pickDefaultHoldingTankId(holdingTanks)
      });
    }
  }

  return results;
}

export interface SkuHoldingTankRequirement {
  sku: SKU;
  multiHoldingWips: MultiHoldingTankWipOption[];
}

/**
 * Mengecek apakah salah satu atau lebih dari daftar SKU memiliki WIP dengan >= 2 Holding Tank.
 */
export function getSkusRequiringHoldingTankChoice(
  skuIds: string[],
  state: Pick<AppState, 'master'>
): SkuHoldingTankRequirement[] {
  const reqs: SkuHoldingTankRequirement[] = [];
  for (const skuId of skuIds) {
    const sku = state.master.skus.find(s => s.id === skuId);
    if (!sku) continue;
    const multiHoldingWips = getSkuWipsWithMultipleHoldingTanks(skuId, state);
    if (multiHoldingWips.length > 0) {
      reqs.push({ sku, multiHoldingWips });
    }
  }
  return reqs;
}

export interface RunWipTankStatus {
  wipId: string;
  wipName: string;
  kgPerCarton: number;
  selectedTank?: WipTank;
  availableKg: number;
  possibleCartons: number;
  isReady: boolean;
}

export interface RunTankAvailabilityResult {
  isReady: boolean;
  minPossibleCartons: number;
  missingDetails: string[];
  tankDetails: RunWipTankStatus[];
}

/**
 * Mengecek apakah seluruh komponen WIP pada Holding Tank (dan tangki tertaut) untuk sebuah SKU/Run
 * sudah mencukupi minimal 1 karton produksi (untuk fitur Start Produksi Kembali setelah Material Shortage).
 */
export function checkRunHoldingTankAvailability(
  skuId: string,
  state: Pick<AppState, 'master'>,
  selectedHoldingTanks?: Record<string, string>
): RunTankAvailabilityResult {
  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === skuId);
  if (linkedWips.length === 0) {
    return {
      isReady: false,
      minPossibleCartons: 0,
      missingDetails: ['Relasi BOM WIP belum dikonfigurasi'],
      tankDetails: []
    };
  }

  const missingDetails: string[] = [];
  const tankDetails: RunWipTankStatus[] = [];
  let minPossibleCartons = Infinity;

  for (const sw of linkedWips) {
    const wip = state.master.wips.find(w => w.id === sw.wipId);
    const allWipTanks = getAllTanksForWip(wip, state.master.tanks);
    const chosenHtId = wip ? selectedHoldingTanks?.[wip.id] : undefined;
    const hasValidChosenHt = Boolean(chosenHtId && allWipTanks.some(t => t.id === chosenHtId));

    const candidateTanks = hasValidChosenHt
      ? allWipTanks.filter(t => t.type !== 'HOLDING_TANK' || t.id === chosenHtId)
      : allWipTanks;

    const holdingTanks = allWipTanks.filter(t => t.type === 'HOLDING_TANK');
    const primaryTank =
      (hasValidChosenHt ? allWipTanks.find(t => t.id === chosenHtId) : undefined) ||
      holdingTanks[0] ||
      allWipTanks[0];

    const availableKg = candidateTanks.reduce((sum, t) => sum + t.currentLevelKg, 0);
    const possibleCartons =
      sw.kgWipPerCartonSku > 0 ? Math.floor(availableKg / sw.kgWipPerCartonSku) : 0;
    const isWipReady = candidateTanks.length > 0 && availableKg >= sw.kgWipPerCartonSku;

    if (!isWipReady) {
      const tankLabel = primaryTank ? primaryTank.code : 'Tangki WIP';
      missingDetails.push(
        `${wip?.name || 'WIP'} (${tankLabel}: ${availableKg.toFixed(2)} kg / butuh ${sw.kgWipPerCartonSku.toFixed(2)} kg)`
      );
    }

    minPossibleCartons = Math.min(minPossibleCartons, possibleCartons);

    tankDetails.push({
      wipId: sw.wipId,
      wipName: wip?.name || 'WIP',
      kgPerCarton: sw.kgWipPerCartonSku,
      selectedTank: primaryTank,
      availableKg,
      possibleCartons,
      isReady: isWipReady
    });
  }

  return {
    isReady: missingDetails.length === 0,
    minPossibleCartons: minPossibleCartons === Infinity ? 0 : minPossibleCartons,
    missingDetails,
    tankDetails
  };
}

