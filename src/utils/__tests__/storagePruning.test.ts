import { describe, expect, it } from 'vitest';
import {
  getCleanBlankState,
  parseLocalLogTimestampMs,
  pruneOldLocalTransactions
} from '../storage';

describe('30-day local transaction log auto-pruning', () => {
  const nowMs = Date.parse('2026-11-26T12:00:00.000Z');
  const recentIso = '2026-11-20T10:00:00.000Z'; // 6 days old
  const staleIso = '2026-10-15T10:00:00.000Z'; // 42 days old
  const recentDate = '2026-11-20';
  const staleDate = '2026-10-15';

  it('parses ISO, YYYY-MM-DD, and locale YYYY-MM-DD HH.mm timestamps accurately', () => {
    expect(parseLocalLogTimestampMs('2026-11-26T10:00:00.000Z')).toBe(
      Date.parse('2026-11-26T10:00:00.000Z')
    );
    expect(parseLocalLogTimestampMs('2026-10-15')).toBe(
      Date.parse('2026-10-15T00:00:00.000Z')
    );
    expect(parseLocalLogTimestampMs('2026-10-15 14.35')).toBe(
      Date.parse('2026-10-15T00:00:00.000Z')
    );
    expect(parseLocalLogTimestampMs('invalid-date')).toBeNull();
  });

  it('prunes logs older than 30 days while preserving active and recent entries', () => {
    const base = getCleanBlankState();
    base.activeSkuRuns = [
      {
        id: 'run_running_old',
        lineId: 'line_a',
        skuId: 'sku_1',
        skuName: 'SKU 1',
        shift: 1,
        startedAt: staleIso,
        isRunning: true,
        cartonsProducedTotal: 100
      },
      {
        id: 'run_archived_old',
        lineId: 'line_b',
        skuId: 'sku_1',
        skuName: 'SKU 1',
        shift: 1,
        startedAt: staleIso,
        completedAt: staleIso,
        isRunning: false,
        completionStatus: 'COMPLETED',
        cartonsProducedTotal: 500
      },
      {
        id: 'run_archived_recent',
        lineId: 'line_c',
        skuId: 'sku_1',
        skuName: 'SKU 1',
        shift: 2,
        startedAt: recentIso,
        completedAt: recentIso,
        isRunning: false,
        completionStatus: 'COMPLETED',
        cartonsProducedTotal: 200
      }
    ];

    base.transactions = {
      requests: [
        {
          id: 'req_old_received',
          requestNumber: 'REQ-001',
          date: staleDate,
          skuId: 'sku_1',
          wipId: 'wip_1',
          materialId: 'mat_1',
          qty: 50,
          batch: 1,
          saldoAwal: 100,
          supplier: 'GDRM',
          status: 'Received'
        },
        {
          id: 'req_old_pending',
          requestNumber: 'REQ-002',
          date: staleDate,
          skuId: 'sku_1',
          wipId: 'wip_1',
          materialId: 'mat_1',
          qty: 50,
          batch: 1,
          saldoAwal: 100,
          supplier: 'GDRM',
          status: 'Pending'
        },
        {
          id: 'req_recent',
          requestNumber: 'REQ-003',
          date: recentDate,
          skuId: 'sku_1',
          wipId: 'wip_1',
          materialId: 'mat_1',
          qty: 50,
          batch: 1,
          saldoAwal: 100,
          supplier: 'GDRM',
          status: 'Received'
        }
      ],
      receipts: [
        {
          id: 'rec_old',
          receiptNumber: 'RCV-001',
          date: staleDate,
          materialId: 'mat_1',
          requestedQty: 50,
          receivedQty: 50,
          location: 'CK',
          status: 'Received'
        },
        {
          id: 'rec_recent',
          receiptNumber: 'RCV-002',
          date: recentDate,
          materialId: 'mat_1',
          requestedQty: 50,
          receivedQty: 50,
          location: 'CK',
          status: 'Received'
        }
      ],
      usages: [
        {
          id: 'use_old',
          usageNumber: 'USG-001',
          date: staleDate,
          skuId: 'sku_1',
          wipId: 'wip_1',
          materialId: 'mat_1',
          qty: 25,
          batch: 1,
          usageQty: 25,
          sourceLocation: 'CK'
        },
        {
          id: 'use_recent',
          usageNumber: 'USG-002',
          date: recentDate,
          skuId: 'sku_1',
          wipId: 'wip_1',
          materialId: 'mat_1',
          qty: 25,
          batch: 1,
          usageQty: 25,
          sourceLocation: 'CK'
        }
      ],
      wipBatches: [
        {
          id: 'wpb_old_done',
          batchCode: 'PK-WIP-001',
          wipId: 'wip_1',
          wipName: 'WIP 1',
          batchSize: 1,
          batchWeightKg: 100,
          status: 'SELESAI',
          startedAt: `${staleDate} 08.00`,
          operatorName: 'Op',
          materials: []
        },
        {
          id: 'wpb_old_active',
          batchCode: 'PK-WIP-002',
          wipId: 'wip_1',
          wipName: 'WIP 1',
          batchSize: 1,
          batchWeightKg: 100,
          status: 'SEDANG_PRODUKSI',
          startedAt: `${staleDate} 08.00`,
          operatorName: 'Op',
          materials: []
        }
      ],
      cartonProductions: [
        {
          id: 'cp_old',
          timestamp: staleIso,
          skuId: 'sku_1',
          skuName: 'SKU 1',
          cartonsProduced: 10,
          tankDeductions: []
        },
        {
          id: 'cp_recent',
          timestamp: recentIso,
          skuId: 'sku_1',
          skuName: 'SKU 1',
          cartonsProduced: 15,
          tankDeductions: []
        }
      ],
      tankLogs: [
        {
          id: 'tl_old',
          timestamp: staleIso,
          tankId: 't1',
          tankCode: 'HT-01',
          tankName: 'HT',
          type: 'CARTON_DEPLETION',
          amountKg: -10,
          previousLevelKg: 100,
          newLevelKg: 90
        },
        {
          id: 'tl_recent',
          timestamp: recentIso,
          tankId: 't1',
          tankCode: 'HT-01',
          tankName: 'HT',
          type: 'MANUAL_TOPUP',
          amountKg: 50,
          previousLevelKg: 90,
          newLevelKg: 140
        }
      ],
      changeovers: [],
      productionStops: [],
      stockAdjustments: [],
      rejectLogs: []
    };

    const { state: pruned, prunedCount } = pruneOldLocalTransactions(base, 30, nowMs);

    expect(prunedCount).toBe(7);
    expect(pruned.activeSkuRuns?.map(r => r.id)).toEqual([
      'run_running_old',
      'run_archived_recent'
    ]);
    expect(pruned.transactions.requests.map(r => r.id)).toEqual([
      'req_old_pending',
      'req_recent'
    ]);
    expect(pruned.transactions.receipts.map(r => r.id)).toEqual(['rec_recent']);
    expect(pruned.transactions.usages.map(r => r.id)).toEqual(['use_recent']);
    expect(pruned.transactions.wipBatches?.map(b => b.id)).toEqual(['wpb_old_active']);
    expect(pruned.transactions.cartonProductions?.map(c => c.id)).toEqual(['cp_recent']);
    expect(pruned.transactions.tankLogs?.map(t => t.id)).toEqual(['tl_recent']);
  });
});
