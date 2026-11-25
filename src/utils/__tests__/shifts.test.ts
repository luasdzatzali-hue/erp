import { describe, it, expect } from 'vitest';
import { getCurrentShift, getShiftPeriodInfo, getNextShiftNumber, getPreviousShiftNumber } from '../shifts';

describe('shifts schedule utilities', () => {
  it('classifies Shift 1, 2, and 3 across boundary minutes', () => {
    expect(getCurrentShift(new Date(2026, 10, 25, 7, 1, 0)).shift).toBe(1);
    expect(getCurrentShift(new Date(2026, 10, 25, 15, 0, 0)).shift).toBe(1);
    expect(getCurrentShift(new Date(2026, 10, 25, 15, 1, 0)).shift).toBe(2);
    expect(getCurrentShift(new Date(2026, 10, 25, 23, 0, 0)).shift).toBe(2);
    expect(getCurrentShift(new Date(2026, 10, 25, 23, 1, 0)).shift).toBe(3);
    expect(getCurrentShift(new Date(2026, 10, 25, 3, 30, 0)).shift).toBe(3);
    expect(getCurrentShift(new Date(2026, 10, 25, 7, 0, 0)).shift).toBe(3);
  });

  it('assigns early morning Shift 3 (00:00-07:00) to the prior operational date', () => {
    const info = getShiftPeriodInfo(new Date(2026, 10, 25, 2, 15, 0));
    expect(info.shift).toBe(3);
    expect(info.operationalDate).toBe('2026-11-24');
    expect(info.shiftKey).toBe('2026-11-24-S3');
    expect(info.nextShift).toBe(1);
  });

  it('cycles next and previous shifts cleanly', () => {
    expect(getNextShiftNumber(1)).toBe(2);
    expect(getNextShiftNumber(2)).toBe(3);
    expect(getNextShiftNumber(3)).toBe(1);
    expect(getPreviousShiftNumber(1)).toBe(3);
    expect(getPreviousShiftNumber(2)).toBe(1);
    expect(getPreviousShiftNumber(3)).toBe(2);
  });
});
