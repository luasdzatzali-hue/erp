import { describe, it, expect } from 'vitest';
import {
  ceilSafe,
  hasDecimalPart,
  detectMaterialPackageConfig,
  computeRoundedMaterialOrder,
  formatKgCompact,
} from '../orderRounding';

describe('orderRounding utilities', () => {
  it('avoids floating-point over-ceiling in ceilSafe', () => {
    expect(ceilSafe(2.00000000000004)).toBe(2);
    expect(ceilSafe(2.01)).toBe(3);
    expect(ceilSafe(0)).toBe(0);
    expect(ceilSafe(-5)).toBe(0);
  });

  it('detects meaningful fractional parts accurately', () => {
    expect(hasDecimalPart(5)).toBe(false);
    expect(hasDecimalPart(5.00000001)).toBe(false);
    expect(hasDecimalPart(5.25)).toBe(true);
  });

  it('detects discrete GDRM Zak and Formulasi Batching packaging configs', () => {
    const flour = detectMaterialPackageConfig({
      source: 'GDRM',
      type: 'bubuk',
      packaging: 'Zak 25 kg',
      weightKg: 25,
    });
    expect(flour.unitLabel).toBe('Zak');
    expect(flour.hasDiscretePackaging).toBe(true);
    expect(flour.defaultPackSizeKg).toBe(25);
    expect(flour.isCustomPackaging).toBe(false);

    const premix = detectMaterialPackageConfig({
      source: 'Formulasi',
      type: 'bubuk',
      packaging: 'Batching 4.25 kg',
      weightKg: 4.25,
    });
    expect(premix.unitLabel).toBe('Batching');
    expect(premix.defaultPackSizeKg).toBe(4.25);
    expect(premix.isCustomPackaging).toBe(true);
    expect(premix.hasDiscretePackaging).toBe(true);
  });

  it('computes rounded material order with fractional batch ceiling and Zak round-up', () => {
    const res = computeRoundedMaterialOrder({
      rawBatchCount: 2.3,
      unitWeightKg: 20,
      allowancePercent: 5,
      roundDecimalBatchUp: true,
      usePackagingRounding: true,
      packageSizeKg: 25,
    });

    // 2.3 batches rounded up -> 3 batches * 20kg = 60kg + 5% = 63kg -> 3 Zak @ 25kg = 75kg
    expect(res.effectiveBatchCount).toBe(3);
    expect(res.batchWasRoundedUp).toBe(true);
    expect(res.afterBatchNeedKg).toBe(60);
    expect(res.needWithAllowanceKg).toBe(63);
    expect(res.packageCount).toBe(3);
    expect(res.finalOrderQtyKg).toBe(75);
    expect(res.packageWasRoundedUp).toBe(true);
  });

  it('formats kg compactly with 2 or 4 decimals depending on sub-centigram precision', () => {
    expect(formatKgCompact(50)).toBe('50.00');
    expect(formatKgCompact(2.375)).toBe('2.375');
  });
});
