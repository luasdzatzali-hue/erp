import { Material } from '../types';

const EPSILON = 1e-6;

/**
 * Floating-point-safe Math.ceil:
 * Prevents exact divisions like 50.000000000001 / 25 = 2.00000000000004
 * from wrongly ceiling-rounding up to 3.
 */
export function ceilSafe(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value - EPSILON);
}

/**
 * Returns true if value is positive and has a meaningful fractional part (> 1e-6).
 */
export function hasDecimalPart(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  return Math.abs(value - Math.round(value)) > EPSILON;
}

export interface MaterialPackageConfig {
  unitLabel: string; // Display label e.g. 'Zak', 'Batching', 'Jerigen', 'Drum', 'Kemasan Custom'
  shortUnit: string; // Lowercase slip SAT label e.g. 'zak', 'batching', 'jerigen', 'drum', 'kemasan'
  defaultPackSizeKg: number; // Parsed unit weight in kg (0 if unknown/bulk)
  isBulkOnly: boolean; // True when packaging is explicitly Bulk / Tangki / Curah
  isCustomPackaging: boolean; // True when non-standard size or non-Zak custom format
  hasDiscretePackaging: boolean; // True when packaging rounding applies by default
}

const KNOWN_UNIT_KEYWORDS: Array<{
  pattern: RegExp;
  unitLabel: string;
  shortUnit: string;
  isCustomFormat: boolean;
}> = [
  { pattern: /\b(batching|batch\s*pack)\b/i, unitLabel: 'Batching', shortUnit: 'batching', isCustomFormat: true },
  { pattern: /\b(jerigen|jerrycan|jrg)\b/i, unitLabel: 'Jerigen', shortUnit: 'jerigen', isCustomFormat: true },
  { pattern: /\bdrum\b/i, unitLabel: 'Drum', shortUnit: 'drum', isCustomFormat: true },
  { pattern: /\bpail\b/i, unitLabel: 'Pail', shortUnit: 'pail', isCustomFormat: true },
  { pattern: /\b(karton|carton|ctn|box|dus)\b/i, unitLabel: 'Karton', shortUnit: 'karton', isCustomFormat: true },
  { pattern: /\b(sak|zak|bag)\b/i, unitLabel: 'Zak', shortUnit: 'zak', isCustomFormat: false },
  { pattern: /\b(pack|pak|sachet|pouch)\b/i, unitLabel: 'Pack', shortUnit: 'pack', isCustomFormat: true },
  { pattern: /\b(botol|btl|kaleng|can|tin)\b/i, unitLabel: 'Botol', shortUnit: 'botol', isCustomFormat: true },
  { pattern: /\b(koli)\b/i, unitLabel: 'Koli', shortUnit: 'koli', isCustomFormat: true },
  { pattern: /\bcustom\b/i, unitLabel: 'Kemasan Custom', shortUnit: 'kemasan', isCustomFormat: true }
];

/**
 * Extracts a numeric package weight (kg) embedded inside packaging text
 * such as "Batching 4.2500 kg", "Jerigen 10 kg", or "Custom 12,5 kg".
 */
export function parsePackWeightFromString(packaging?: string): number {
  if (!packaging) return 0;
  const normalized = packaging.replace(',', '.');
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg)?/i);
  if (!match) return 0;
  const parsed = parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Inspects a Material's source, type, packaging text, and weightKg to determine
 * whether discrete/custom packaging rounding applies and what unit label & default size to use.
 */
export function detectMaterialPackageConfig(
  mat?: Pick<Material, 'source' | 'type' | 'packaging' | 'weightKg'> | null
): MaterialPackageConfig {
  if (!mat) {
    return {
      unitLabel: 'Zak',
      shortUnit: 'zak',
      defaultPackSizeKg: 25,
      isBulkOnly: false,
      isCustomPackaging: false,
      hasDiscretePackaging: false
    };
  }

  const pkgRaw = (mat.packaging || '').trim();
  const isExplicitBulk = /\b(bulk|tangki|tanki|tank|curah|pipeline)\b/i.test(pkgRaw);
  const parsedWeight = parsePackWeightFromString(pkgRaw);
  const defaultPackSizeKg =
    mat.weightKg && mat.weightKg > 0 ? mat.weightKg : parsedWeight > 0 ? parsedWeight : 0;

  if (isExplicitBulk && defaultPackSizeKg <= 0) {
    return {
      unitLabel: 'Bulk',
      shortUnit: 'kg',
      defaultPackSizeKg: 0,
      isBulkOnly: true,
      isCustomPackaging: false,
      hasDiscretePackaging: false
    };
  }

  let unitLabel = 'Kemasan';
  let shortUnit = 'kemasan';
  let isCustomUnit = false;
  let matchedKnown = false;

  for (const entry of KNOWN_UNIT_KEYWORDS) {
    if (entry.pattern.test(pkgRaw)) {
      unitLabel = entry.unitLabel;
      shortUnit = entry.shortUnit;
      isCustomUnit = entry.isCustomFormat;
      matchedKnown = true;
      break;
    }
  }

  if (!matchedKnown) {
    if (mat.source === 'GDRM' && (mat.type === 'bubuk' || mat.type === 'padat')) {
      unitLabel = 'Zak';
      shortUnit = 'zak';
      isCustomUnit = false;
    } else if (pkgRaw) {
      const prefixToken = pkgRaw.replace(/\d+(?:[.,]\d+)?/g, '').replace(/\bkg\b/gi, '').trim();
      if (prefixToken.length >= 2) {
        const cleanWord = prefixToken.split(/\s+/)[0];
        unitLabel = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
        shortUnit = cleanWord.toLowerCase();
        isCustomUnit = true;
      } else {
        unitLabel = 'Kemasan Custom';
        shortUnit = 'kemasan';
        isCustomUnit = true;
      }
    } else {
      unitLabel = 'Kemasan';
      shortUnit = 'kemasan';
      isCustomUnit = mat.source === 'Formulasi';
    }
  }

  const isStandardGdrmSize =
    defaultPackSizeKg === 15 ||
    defaultPackSizeKg === 20 ||
    defaultPackSizeKg === 25 ||
    defaultPackSizeKg === 50;

  const isGdrmSolid =
    mat.source === 'GDRM' && (mat.type === 'bubuk' || mat.type === 'padat');

  const isCustomPackaging =
    isCustomUnit ||
    mat.source === 'Formulasi' ||
    (defaultPackSizeKg > 0 && !isStandardGdrmSize) ||
    !isGdrmSolid;

  // Discrete packaging applies whenever material is NOT bulk-only AND either:
  // 1) It's GDRM solid (bubuk/padat), or
  // 2) It has a discrete packaging definition / positive pack weight (e.g. Batching, Jerigen, Drum, Custom, Zak)
  const hasDiscretePackaging =
    !isExplicitBulk && (isGdrmSolid || matchedKnown || defaultPackSizeKg > 0);

  return {
    unitLabel,
    shortUnit,
    defaultPackSizeKg: defaultPackSizeKg > 0 ? defaultPackSizeKg : isGdrmSolid ? 25 : 0,
    isBulkOnly: isExplicitBulk && defaultPackSizeKg <= 0,
    isCustomPackaging,
    hasDiscretePackaging
  };
}

export interface OrderRoundingInput {
  rawBatchCount: number;
  unitWeightKg: number; // Material kg required for 1 batch WIP
  directNeedKg?: number; // Optional override when need kg is already aggregated (e.g. BOM deficit)
  allowancePercent?: number; // Optional order allowance % (e.g. 0, 3, 5, 7) added before round-up
  roundDecimalBatchUp: boolean; // If true and batchCount has decimal, ceil(batchCount)
  usePackagingRounding: boolean; // If true and packageSizeKg > 0, ceil(needKg / packageSizeKg)
  packageSizeKg: number;
  roundDecimalQtyUp?: boolean; // If true and no fixed packageSizeKg (>0) applies, ceil decimal final kg up
}

export interface OrderRoundingResult {
  rawBatchCount: number;
  effectiveBatchCount: number;
  batchWasRoundedUp: boolean;
  rawNeedKg: number;
  afterBatchNeedKg: number;
  allowancePercent: number;
  allowanceKg: number;
  needWithAllowanceKg: number;
  packageCount: number;
  finalOrderQtyKg: number;
  packageWasRoundedUp: boolean;
  qtyWasRoundedUp: boolean;
  surplusKg: number;
}

/**
 * Computes material order quantity applying:
 * 1) Decimal batch round-up (Math.ceil via ceilSafe) when batchCount is fractional
 * 2) Order allowance percentage (+3%, +5%, +7%) if selected
 * 3) Custom / factory packaging round-up (Math.ceil via ceilSafe) when packaged ordering is enabled
 * 4) Direct kg round-up (Math.ceil via ceilSafe) when no fixed packageSizeKg applies and roundDecimalQtyUp is enabled
 */
export function computeRoundedMaterialOrder(input: OrderRoundingInput): OrderRoundingResult {
  const safeRawBatch = Number.isFinite(input.rawBatchCount) && input.rawBatchCount > 0 ? input.rawBatchCount : 0;
  const safeUnitWeight = Number.isFinite(input.unitWeightKg) && input.unitWeightKg > 0 ? input.unitWeightKg : 0;

  const batchHasDecimal = hasDecimalPart(safeRawBatch);
  const effectiveBatchCount =
    input.roundDecimalBatchUp && batchHasDecimal ? ceilSafe(safeRawBatch) : safeRawBatch;
  const batchWasRoundedUp =
    input.roundDecimalBatchUp && batchHasDecimal && effectiveBatchCount > safeRawBatch + EPSILON;

  const rawNeedKg =
    input.directNeedKg !== undefined
      ? Math.max(0, input.directNeedKg)
      : safeUnitWeight * safeRawBatch;

  const afterBatchNeedKg =
    input.directNeedKg !== undefined
      ? Math.max(0, input.directNeedKg)
      : safeUnitWeight * effectiveBatchCount;

  const safeAllowancePercent =
    Number.isFinite(input.allowancePercent) && (input.allowancePercent || 0) > 0
      ? Number(input.allowancePercent)
      : 0;
  const allowanceMultiplier = 1 + safeAllowancePercent / 100;
  const rawNeedWithAllowanceKg = Number((rawNeedKg * allowanceMultiplier).toFixed(4));
  const needWithAllowanceKg = Number((afterBatchNeedKg * allowanceMultiplier).toFixed(4));
  const allowanceKg = Math.max(0, Number((needWithAllowanceKg - afterBatchNeedKg).toFixed(4)));

  const safePackSize =
    input.usePackagingRounding && Number.isFinite(input.packageSizeKg) && input.packageSizeKg > 0
      ? input.packageSizeKg
      : 0;

  if (safePackSize > 0 && needWithAllowanceKg > 0) {
    const exactPacks = needWithAllowanceKg / safePackSize;
    const packageCount = Math.max(1, ceilSafe(exactPacks));
    const finalOrderQtyKg = Number((packageCount * safePackSize).toFixed(4));
    const packageWasRoundedUp =
      hasDecimalPart(exactPacks) && finalOrderQtyKg > needWithAllowanceKg + EPSILON;
    const surplusKg = Math.max(0, Number((finalOrderQtyKg - rawNeedWithAllowanceKg).toFixed(4)));

    return {
      rawBatchCount: safeRawBatch,
      effectiveBatchCount,
      batchWasRoundedUp,
      rawNeedKg,
      afterBatchNeedKg,
      allowancePercent: safeAllowancePercent,
      allowanceKg,
      needWithAllowanceKg,
      packageCount,
      finalOrderQtyKg,
      packageWasRoundedUp,
      qtyWasRoundedUp: packageWasRoundedUp,
      surplusKg
    };
  }

  const shouldRoundQtyKg =
    Boolean(input.roundDecimalQtyUp) &&
    needWithAllowanceKg > 0 &&
    hasDecimalPart(needWithAllowanceKg);
  const finalOrderQtyKg = shouldRoundQtyKg ? ceilSafe(needWithAllowanceKg) : needWithAllowanceKg;
  const qtyWasRoundedUp = shouldRoundQtyKg && finalOrderQtyKg > needWithAllowanceKg + EPSILON;

  return {
    rawBatchCount: safeRawBatch,
    effectiveBatchCount,
    batchWasRoundedUp,
    rawNeedKg,
    afterBatchNeedKg,
    allowancePercent: safeAllowancePercent,
    allowanceKg,
    needWithAllowanceKg,
    packageCount: 0,
    finalOrderQtyKg,
    packageWasRoundedUp: false,
    qtyWasRoundedUp,
    surplusKg: Math.max(0, Number((finalOrderQtyKg - rawNeedWithAllowanceKg).toFixed(4)))
  };
}

export interface RoundingAppliedInfo {
  actualKg: number;
  roundedKg: number;
  deltaKg: number;
  hasRounding: boolean;
  summaryBadge: string;
  comparisonNote: string;
  reasonTag: string;
  detailNote: string;
}

/**
 * Formats kg values with 2 decimals for whole/centi-gram numbers and up to 4 decimals
 * when sub-0.01 precision exists (e.g. 50 -> "50.00", 2.375 -> "2.375").
 */
export function formatKgCompact(value: number): string {
  if (!Number.isFinite(value)) return '0.00';
  const rounded4 = Number(value.toFixed(4));
  const rounded2 = Number(value.toFixed(2));
  if (Math.abs(rounded4 - rounded2) > EPSILON) {
    return rounded4.toString();
  }
  return rounded2.toFixed(2);
}

/**
 * Computes the 'Rounding Applied' breakdown for a MaterialRequest record,
 * showing the difference between the actual calculated need (theoreticalQty)
 * and the rounded-up order quantity (qty).
 */
export function getRoundingAppliedInfo(
  req: {
    qty: number;
    theoreticalQty?: number;
    surplusKg?: number;
    packageCount?: number;
    packageSizeKg?: number;
    batch?: number;
    notes?: string;
  },
  mat?: Pick<Material, 'source' | 'type' | 'packaging' | 'weightKg'> | null
): RoundingAppliedInfo {
  const roundedKg = Number.isFinite(req.qty) && req.qty > 0 ? Number(req.qty.toFixed(4)) : 0;

  let actualKg = roundedKg;
  let deltaKg = 0;

  if (typeof req.theoreticalQty === 'number' && Number.isFinite(req.theoreticalQty) && req.theoreticalQty >= 0) {
    actualKg = Number(req.theoreticalQty.toFixed(4));
    const computedDiff = Math.max(0, Number((roundedKg - actualKg).toFixed(4)));
    if (computedDiff > EPSILON) {
      deltaKg = computedDiff;
    } else if (typeof req.surplusKg === 'number' && Number.isFinite(req.surplusKg) && req.surplusKg > EPSILON) {
      deltaKg = Number(req.surplusKg.toFixed(4));
      actualKg = Math.max(0, Number((roundedKg - deltaKg).toFixed(4)));
    }
  } else if (typeof req.surplusKg === 'number' && Number.isFinite(req.surplusKg) && req.surplusKg > EPSILON) {
    deltaKg = Number(req.surplusKg.toFixed(4));
    actualKg = Math.max(0, Number((roundedKg - deltaKg).toFixed(4)));
  }

  const hasRounding = deltaKg > EPSILON;
  const pkgCfg = detectMaterialPackageConfig(mat);
  const unitLabel = pkgCfg.unitLabel || 'Kemasan';

  const hasPackInfo = Boolean(req.packageCount && req.packageSizeKg);
  const packInfoStr = hasPackInfo
    ? `${req.packageCount} ${unitLabel} @ ${formatKgCompact(req.packageSizeKg!)} kg`
    : '';

  const batchArrowMatch = req.notes?.match(/Batch\s+[\d.,]+\s*(?:→|->)\s*[\d.,]+/i);

  let reasonTag = 'Eksak (0 selisih)';
  if (hasRounding) {
    if (hasPackInfo) {
      reasonTag = batchArrowMatch
        ? `${batchArrowMatch[0]} • ${packInfoStr}`
        : `Kemasan ${packInfoStr}`;
    } else if (batchArrowMatch) {
      reasonTag = `Pembulatan ${batchArrowMatch[0]}`;
    } else if (req.notes && /kemasan|zak|batch|bulat/i.test(req.notes)) {
      reasonTag = 'Pembulatan ke atas';
    } else {
      reasonTag = 'Pembulatan atas';
    }
  } else if (hasPackInfo) {
    reasonTag = `Pas (${packInfoStr})`;
  }

  const actualStr = formatKgCompact(actualKg);
  const roundedStr = formatKgCompact(roundedKg);
  const deltaStr = formatKgCompact(deltaKg);

  const summaryBadge = hasRounding ? `+${deltaStr} kg` : 'Tidak ada (0.00 kg)';
  const comparisonNote = hasRounding
    ? `Aktual: ${actualStr} kg → Bulat: ${roundedStr} kg`
    : `Aktual: ${actualStr} kg = Order: ${roundedStr} kg`;
  const detailNote = hasRounding
    ? `${summaryBadge} (${comparisonNote}${reasonTag ? ` • ${reasonTag}` : ''})`
    : `${summaryBadge} (${comparisonNote})`;

  return {
    actualKg,
    roundedKg,
    deltaKg,
    hasRounding,
    summaryBadge,
    comparisonNote,
    reasonTag,
    detailNote
  };
}
