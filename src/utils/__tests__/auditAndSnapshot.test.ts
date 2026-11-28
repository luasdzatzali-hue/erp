import { describe, expect, it } from 'vitest';
import {
  buildAuditLogEntry,
  buildShiftOeeSnapshotFirestoreDoc
} from '../../services/transactionService';
import { ShiftOeeSnapshotDoc } from '../oeeEngine';

describe('Shift OEE Snapshot & Immutable Audit Builders', () => {
  it('builds Firestore-compliant Shift OEE Snapshot doc with integer cartons and fallback skuCode', () => {
    const rawSnapshot: ShiftOeeSnapshotDoc = {
      id: '2026-11-28-S1_line-1',
      workspaceId: 'ws-pabrik-a',
      shiftId: '2026-11-28-S1',
      date: '2026-11-28',
      shift: 1,
      lineId: 'line-1',
      lineName: 'Line 1 Wafer',
      skuCode: '',
      availability: 92.345,
      performance: 108.4,
      quality: 99.123,
      oeeScore: 87.654,
      sixBigLossesBreakdown: {
        equipmentFailure: { minutes: 15.666, lossKg: 12.3456 },
        setupAdjustment: { minutes: 10, lossKg: 0 },
        idlingMinorStops: { minutes: 5, lossKg: 3.2 },
        reducedSpeed: { minutes: 2, lossKg: 1.1 },
        processDefects: { minutes: 0, lossKg: 4.5 },
        reducedYield: { minutes: 0, lossKg: 2.25 }
      },
      materialVariancePct: 1.85,
      plannedProductionTimeMinutes: 480,
      operatingTimeMinutes: 443.2,
      totalOutputCartons: 1249.6,
      goodOutputCartons: 1238.4,
      standardBomMaterialKg: 500,
      actualMaterialUsedKg: 509.25
    };

    const doc = buildShiftOeeSnapshotFirestoreDoc(rawSnapshot, 'uid-admin-1');

    expect(doc.skuCode).toBe('UNASSIGNED');
    expect(doc.totalOutputCartons).toBe(1250);
    expect(Number.isInteger(doc.totalOutputCartons)).toBe(true);
    expect(doc.goodOutputCartons).toBe(1238.4);
    expect(doc.performance).toBe(100); // clamped to <= 100
    expect(doc.availability).toBe(92.35);
    expect(doc.oeeScore).toBe(87.65);
    expect(doc.updatedByUid).toBe('uid-admin-1');
  });

  it('builds sanitized AuditLogEntry with normalized email and bounded fields', () => {
    const longNote = 'A'.repeat(650);
    const entry = buildAuditLogEntry({
      workspaceId: 'ws-main',
      userId: 'uid-sup-1',
      userName: '  Budi Santoso  ',
      userEmail: ' BUDI@Pabrik.ID ',
      role: 'SUPERVISOR',
      module: 'OEE_DOWNTIME',
      action: 'UPDATE',
      targetId: 'stop-99',
      targetLabel: 'Line 1 · Equipment Failure',
      previousValue: { durationMinutes: 30 },
      newValue: { durationMinutes: 15 },
      reasonNote: longNote
    });

    expect(entry.id).toMatch(/^aud_/);
    expect(entry.userName).toBe('Budi Santoso');
    expect(entry.userEmail).toBe('budi@pabrik.id');
    expect(entry.role).toBe('SUPERVISOR');
    expect(entry.module).toBe('OEE_DOWNTIME');
    expect(entry.action).toBe('UPDATE');
    expect(entry.reasonNote?.length).toBeLessThanOrEqual(500);
  });
});
