import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCloudQuotaStatus,
  getNextFirestoreDailyQuotaResetMs,
  isCloudWritePaused,
  isQuotaExceededError,
  resetCloudWriteQuotaPause,
  subscribeCloudQuotaStatus,
  tripCloudWriteQuotaPause
} from '../firebaseSync';

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
});
