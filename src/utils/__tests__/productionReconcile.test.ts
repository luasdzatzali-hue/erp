import { describe, it, expect } from 'vitest';
import { calculateMissedProduction } from '../productionReconcile';

describe('calculateMissedProduction', () => {
  it('computes exact missed cartons using lastDeductionTime, targetPerHour, and speedMultiplier', () => {
    const anchor = '2026-11-26T08:00:00.000Z';
    // 600 ktn/jam * 1x = 1 karton per 6 detik -> 60 detik = 10 karton
    const nowMs = new Date('2026-11-26T08:01:00.000Z').getTime();

    const res = calculateMissedProduction({
      anchorIso: anchor,
      nowMs,
      targetPerHour: 600,
      speedMultiplier: 1
    });

    expect(res.intervalSeconds).toBeCloseTo(6, 5);
    expect(res.missedCartons).toBe(10);
    expect(res.targetToProduce).toBe(10);
    expect(res.isPlanAlreadyReached).toBe(false);
  });

  it('scales accurately with speedMultiplier and caps to remaining plannedCartons', () => {
    const anchor = '2026-11-26T08:00:00.000Z';
    // 600 ktn/jam * 2x = 1200 ktn/jam -> 1 karton per 3 detik -> 30 detik = 10 karton
    const nowMs = new Date('2026-11-26T08:00:30.000Z').getTime();

    const res = calculateMissedProduction({
      anchorIso: anchor,
      nowMs,
      targetPerHour: 600,
      speedMultiplier: 2,
      plannedCartons: 100,
      cartonsProducedTotal: 96
    });

    expect(res.intervalSeconds).toBeCloseTo(3, 5);
    expect(res.missedCartons).toBe(10);
    expect(res.targetToProduce).toBe(4);
    expect(res.isPlanAlreadyReached).toBe(false);
  });

  it('flags already-completed plan cleanly and ignores negative/invalid timestamps', () => {
    const anchor = '2026-11-26T08:00:00.000Z';
    const nowMs = new Date('2026-11-26T08:05:00.000Z').getTime();

    const doneRes = calculateMissedProduction({
      anchorIso: anchor,
      nowMs,
      targetPerHour: 300,
      plannedCartons: 50,
      cartonsProducedTotal: 50
    });
    expect(doneRes.isPlanAlreadyReached).toBe(true);
    expect(doneRes.targetToProduce).toBe(0);

    const badRes = calculateMissedProduction({
      anchorIso: 'not-a-date',
      nowMs
    });
    expect(badRes.missedCartons).toBe(0);
    expect(badRes.targetToProduce).toBe(0);
  });

  it('respects minElapsedMsOverride guard to prevent duplicate catch-up before state flushes', () => {
    const anchor = '2026-11-26T08:00:00.000Z';
    const guardMs = new Date('2026-11-26T08:02:00.000Z').getTime();
    const nowMs = new Date('2026-11-26T08:02:03.000Z').getTime();

    const res = calculateMissedProduction({
      anchorIso: anchor,
      nowMs,
      targetPerHour: 600,
      minElapsedMsOverride: guardMs
    });

    expect(res.missedCartons).toBe(0);
    expect(res.targetToProduce).toBe(0);
  });
});
