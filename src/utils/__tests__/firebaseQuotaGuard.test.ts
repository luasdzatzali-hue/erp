import { describe, expect, it, beforeEach } from 'vitest';
import {
  buildCriticalOperationsFingerprint,
  buildOperationsFingerprint,
  getCloudQuotaStatus,
  getNextFirestoreDailyQuotaResetMs,
  isCloudWritePaused,
  isQuotaExceededError,
  resetCloudWriteQuotaPause,
  subscribeCloudQuotaStatus,
  testConnection,
  tripCloudWriteQuotaPause
} from '../firebaseSync';
import { getSampleState } from '../storage';

describe('Firestore write quota circuit breaker', () => {
  beforeEach(() => {
    resetCloudWriteQuotaPause();
  });

  it('detects Firebase resource-exhausted and daily write quota messages', () => {
    expect(isQuotaExceededError({ code: 'resource-exhausted', message: 'Quota limit exceeded' })).toBe(true);
    expect(
      isQuotaExceededError(
        new Error(
          "FirebaseError: [code=resource-exhausted]: Quota limit exceeded. Cause - Quota exceeded for quota metric 'Free daily write units per project (free tier database)'"
        )
      )
    ).toBe(true);
    expect(isQuotaExceededError(new Error('permission-denied'))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });

  it('schedules quota pause until next Pacific midnight reset (>= 1 hour ahead)', () => {
    // 2026-11-26T18:55:18.258Z is 10:55:18 AM PST (-08:00), ~13h05m before PT midnight
    const sampleNowMs = Date.parse('2026-11-26T18:55:18.258Z');
    const resetMs = getNextFirestoreDailyQuotaResetMs(sampleNowMs);
    const diffHours = (resetMs - sampleNowMs) / (60 * 60 * 1000);

    expect(diffHours).toBeGreaterThan(12);
    expect(diffHours).toBeLessThanOrEqual(24.2);

    // Even just before PT midnight (23:58 PST = 07:58Z next day), enforce at least 1 hour buffer
    const nearMidnightMs = Date.parse('2026-11-27T07:58:00.000Z');
    const nearMidnightResetMs = getNextFirestoreDailyQuotaResetMs(nearMidnightMs);
    expect(nearMidnightResetMs - nearMidnightMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it('pauses cloud writes when tripped and clears cleanly on reset', () => {
    expect(isCloudWritePaused()).toBe(false);

    const observedStates: boolean[] = [];
    const unsub = subscribeCloudQuotaStatus(status => {
      observedStates.push(status.isQuotaExceeded);
    });

    tripCloudWriteQuotaPause('Kuota habis uji coba');
    expect(isCloudWritePaused()).toBe(true);
    const status = getCloudQuotaStatus();
    expect(status.isQuotaExceeded).toBe(true);
    expect(status.message).toBe('Kuota habis uji coba');
    expect(status.pausedUntilMs).not.toBeNull();
    expect((status.pausedUntilMs || 0) - Date.now()).toBeGreaterThanOrEqual(55 * 60 * 1000);

    resetCloudWriteQuotaPause();
    expect(isCloudWritePaused()).toBe(false);
    expect(getCloudQuotaStatus().isQuotaExceeded).toBe(false);

    unsub();
    expect(observedStates).toEqual([false, true, false]);
  });

  it('keeps buildOperationsFingerprint stable across Auto [ ticks and tank temperature simulation', () => {
    const base = getSampleState();
    const tankId = base.master.tanks[0]?.id || 'tank_1';
    const runningState = {
      ...base,
      tank: {
        ...base.tank,
        isSimulationActive: true,
        temp: 48.2
      },
      activeSkuRuns: [
        {
          id: 'run_line_a_1',
          lineId: 'line_a',
          lineName: 'Line A',
          skuId: base.master.skus[0]?.id || 'sku_1',
          skuName: base.master.skus[0]?.name || 'SKU Test',
          shift: 1 as const,
          startedAt: '2026-11-26T07:00:00.000Z',
          isRunning: true,
          completionStatus: 'RUNNING' as const,
          cartonsProducedTotal: 10,
          lastDeductionTime: '2026-11-26T07:01:00.000Z'
        }
      ]
    };

    const fpStart = buildOperationsFingerprint(runningState, 1);

    // Simulate multiple Auto [ ticks: cartonsProducedTotal, lastDeductionTime, tank currentLevelKg, and simulated temp change
    const afterAutoTicks = {
      ...runningState,
      tank: {
        ...runningState.tank,
        temp: 52.9
      },
      master: {
        ...runningState.master,
        tanks: runningState.master.tanks.map((t, idx) =>
          idx === 0 || t.id === tankId
            ? { ...t, currentLevelKg: Math.max(0, t.currentLevelKg - 125.5) }
            : t
        )
      },
      activeSkuRuns: runningState.activeSkuRuns.map(r => ({
        ...r,
        cartonsProducedTotal: 250,
        lastDeductionTime: '2026-11-26T07:30:00.000Z'
      }))
    };

    expect(buildOperationsFingerprint(afterAutoTicks, 1)).toBe(fpStart);
    expect(buildCriticalOperationsFingerprint(afterAutoTicks, 1)).toBe(
      buildCriticalOperationsFingerprint(runningState, 1)
    );

    // Discrete status change (e.g., Complete Line / Stop / Pause) MUST change the fingerprint
    const completedState = {
      ...afterAutoTicks,
      activeSkuRuns: afterAutoTicks.activeSkuRuns.map(r => ({
        ...r,
        isRunning: false,
        completionStatus: 'COMPLETED' as const,
        completedAt: '2026-11-26T07:31:00.000Z'
      }))
    };
    expect(buildOperationsFingerprint(completedState, 2)).not.toBe(fpStart);

    // Explicit tank top-up / transfer (bumping explicitOpsVersion) MUST change the fingerprint
    expect(buildOperationsFingerprint(afterAutoTicks, 2)).not.toBe(fpStart);
  });

  it('runs testConnection cleanly without throwing even while cloud write quota is paused', async () => {
    tripCloudWriteQuotaPause('Quota pause check');
    const result = await testConnection();
    expect(result).toHaveProperty('ok');
    expect(result.quotaPaused).toBe(true);
  });
});

