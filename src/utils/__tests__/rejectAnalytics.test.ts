import { describe, expect, it } from 'vitest';
import { AppState, MaterialRejectLog } from '../../types';
import { calculateStockBalances, getSampleState } from '../storage';
import {
  computeCkStationMetrics,
  computeEquivalentCartonsLoss,
  computeLineVarianceAndSbl,
  computeShiftVarianceAndSblSummary,
  getMaterialsForSkuBom,
  getMaterialsForWipBom
} from '../rejectAnalytics';

describe('rejectAnalytics & stock integration', () => {
  const buildState = (): AppState => {
    const base = getSampleState();
    return {
      ...base,
      transactions: {
        ...base.transactions,
        usages: [],
        receipts: [],
        cartonProductions: [],
        productionStops: [],
        rejectLogs: []
      }
    };
  };

  it('filters BOM materials by SKU and computes kgPerCartonSku accurately', () => {
    const state = buildState();
    const skuMats = getMaterialsForSkuBom(state, 'sku_1');
    expect(skuMats.length).toBeGreaterThan(0);

    // Verify conversion from reject kg to equivalent cartons
    const first = skuMats[0];
    expect(first.kgPerCartonSku).toBeGreaterThan(0);
    const eqCartons = computeEquivalentCartonsLoss({
      rejectQtyKg: first.kgPerCartonSku * 5,
      materialKgPerCartonSku: first.kgPerCartonSku
    });
    expect(eqCartons).toBeCloseTo(5, 1);
  });

  it('filters BOM materials by WIP for Central Kitchen stations', () => {
    const state = buildState();
    const wipMats = getMaterialsForWipBom(state, 'wip_1');
    expect(wipMats.length).toBeGreaterThan(0);
    expect(wipMats.every(m => m.wipId === 'wip_1')).toBe(true);
  });

  it('deducts recorded MaterialRejectLog rejectQtyKg from calculateStockBalances for Stock Opname', () => {
    const state = buildState();
    const before = calculateStockBalances(state);
    const initialMat1Ck = before['mat_1'].stockCk;
    const initialMat1Total = before['mat_1'].totalActual;

    const rejectLog: MaterialRejectLog = {
      id: 'rej_test_1',
      timestamp: '2026-10-24T10:00:00.000Z',
      date: '2026-10-24',
      shift: 1,
      stationType: 'LINE',
      lineId: 'line_1',
      lineName: 'Line 1',
      skuId: 'sku_1',
      skuName: 'Biskuit Choco Delight',
      materialId: 'mat_1',
      materialCode: 'MAT-TP-01',
      materialName: 'Tepung Terigu Premix',
      unit: 'kg',
      rejectQtyInput: 12.5,
      rejectQtyKg: 12.5,
      sourceLocation: 'CK',
      equivalentCartonsLoss: 3.1,
      rejectCategory: 'KEMASAN_RUSAK',
      operatorName: 'Ahmad Fauzi'
    };

    const nextState: AppState = {
      ...state,
      transactions: {
        ...state.transactions,
        rejectLogs: [rejectLog]
      }
    };

    const after = calculateStockBalances(nextState);
    expect(after['mat_1'].stockCk).toBeCloseTo(initialMat1Ck - 12.5, 4);
    expect(after['mat_1'].totalActual).toBeCloseTo(initialMat1Total - 12.5, 4);
  });

  it('computes Live Production Variance, Material Variance (BOM + Reject), and 3-pillar SBL per Line', () => {
    const state = buildState();
    const startMs = Date.parse('2026-10-24T08:00:00.000Z');
    const nowMs = startMs + 2 * 3600_000; // 2 hours elapsed -> standard target 500/hr * 2 = 1000 cartons

    const bomMats = getMaterialsForSkuBom(state, 'sku_1');
    const sampleMat = bomMats[0];

    const populatedState: AppState = {
      ...state,
      activeSkuRuns: [
        {
          id: 'run_line1',
          lineId: 'line_1',
          lineName: 'Line 1 (Biskuit Domestik)',
          skuId: 'sku_1',
          skuName: 'Biskuit Choco Delight (Domestik)',
          skuCode: 'SKU-DOM-01',
          shift: 1,
          plannedCartons: 4000,
          startedAt: new Date(startMs).toISOString(),
          isRunning: true,
          cartonsProducedTotal: 850, // 150 cartons behind standard speed target of 1000
          targetPerHour: 500
        }
      ],
      transactions: {
        ...state.transactions,
        productionStops: [
          {
            id: 'stop_1',
            lineId: 'line_1',
            lineName: 'Line 1 (Biskuit Domestik)',
            skuId: 'sku_1',
            skuName: 'Biskuit Choco Delight (Domestik)',
            shift: 1,
            startedAt: new Date(startMs).toISOString(),
            stoppedAt: new Date(startMs + 3600_000).toISOString(),
            durationMinutes: 15,
            category: 'EQUIPMENT_FAILURE',
            categoryLabel: 'Kerusakan Mesin',
            lossType: 'DOWNTIME',
            reasonTitle: 'Sensor Error'
          }
        ],
        rejectLogs: [
          {
            id: 'rej_line1',
            timestamp: new Date(startMs + 5000_000).toISOString(),
            date: '2026-10-24',
            shift: 1,
            stationType: 'LINE',
            lineId: 'line_1',
            lineName: 'Line 1 (Biskuit Domestik)',
            skuId: 'sku_1',
            materialId: sampleMat.material.id,
            materialName: sampleMat.material.name,
            unit: 'kg',
            rejectQtyInput: 10,
            rejectQtyKg: 10,
            sourceLocation: 'CK',
            equivalentCartonsLoss: 5,
            rejectCategory: 'ADONAN_TERBUANG',
            operatorName: 'Ahmad Fauzi'
          }
        ]
      }
    };

    const metrics = computeLineVarianceAndSbl({
      state: populatedState,
      lineId: 'line_1',
      dateStr: '2026-10-24',
      shift: 1,
      nowMs
    });

    expect(metrics.expectedStandardCartons).toBe(1000);
    expect(metrics.actualCartons).toBe(850);
    expect(metrics.liveVarianceCartons).toBe(-150);
    expect(metrics.liveVariancePct).toBeCloseTo(-15, 1);

    // Material Variance: Actual = Standard BOM + Reject
    expect(metrics.totalRejectKg).toBe(10);
    expect(metrics.actualMaterialUsedKg).toBeCloseTo(metrics.standardBomMaterialKg + 10, 2);

    // 3-pillar SBL
    expect(metrics.availabilityLossMinutes).toBe(15);
    expect(metrics.performanceLossCartons).toBe(150);
    expect(metrics.performanceLossMinutes).toBeGreaterThan(0);
    expect(metrics.qualityLossCartons).toBe(5);
    expect(metrics.qualityLossKg).toBe(10);
  });

  it('computes Central Kitchen machine timer, target tank status, and Shift SBL summary', () => {
    const state = buildState();
    const startMs = Date.parse('2026-10-24T08:00:00.000Z');
    const nowMs = startMs + 10 * 60_000;

    const ckState: AppState = {
      ...state,
      transactions: {
        ...state.transactions,
        wipBatches: [
          {
            id: 'wpb_1',
            batchCode: 'PK-WIP-001',
            wipId: 'wip_1',
            wipName: 'WIP Sirup Glukosa & Karamel',
            shift: 1,
            batchSize: 1,
            batchWeightKg: 100,
            status: 'SEDANG_PRODUKSI',
            startedAt: new Date(startMs).toISOString(),
            durationMinutes: 30,
            estimatedCompletionTime: new Date(startMs + 30 * 60_000).toISOString(),
            targetTankId: 'tank_ht_1',
            targetMachineId: 'mach_2',
            targetMachineName: 'Cooker CK-01',
            operatorName: 'Budi',
            materials: [
              {
                materialId: 'mat_2',
                materialName: 'Gula Pasir Rafinasi',
                materialType: 'padat',
                materialSource: 'GDRM',
                packaging: 'Zak 50 kg',
                requiredKg: 50,
                actualUsedKg: 50,
                sourceLocation: 'CK',
                isConsumed: true
              }
            ]
          }
        ],
        rejectLogs: [
          {
            id: 'rej_ck1',
            timestamp: new Date(startMs + 5 * 60_000).toISOString(),
            date: '2026-10-24',
            shift: 1,
            stationType: 'CENTRAL_KITCHEN',
            machineId: 'mach_2',
            machineName: 'Cooker CK-01',
            wipId: 'wip_1',
            wipName: 'WIP Sirup Glukosa & Karamel',
            materialId: 'mat_2',
            materialName: 'Gula Pasir Rafinasi',
            unit: 'kg',
            rejectQtyInput: 2.5,
            rejectQtyKg: 2.5,
            sourceLocation: 'CK',
            equivalentCartonsLoss: 1.25,
            rejectCategory: 'SETTING_AWAL',
            operatorName: 'Budi'
          }
        ]
      }
    };

    const ck = computeCkStationMetrics({
      state: ckState,
      machineId: 'mach_2',
      dateStr: '2026-10-24',
      shift: 1,
      nowMs
    });

    expect(ck.activeBatch?.batchCode).toBe('PK-WIP-001');
    expect(ck.progressPct).toBe(33);
    expect(ck.totalRejectKg).toBe(2.5);
    expect(ck.actualMaterialUsedKg).toBeCloseTo(52.5, 2);

    const shiftSummary = computeShiftVarianceAndSblSummary(ckState, '2026-10-24', 1, nowMs);
    expect(shiftSummary.totalRejectKg).toBe(2.5);
    expect(shiftSummary.sblThreePillar.qualityLossKg).toBe(2.5);
    expect(shiftSummary.sblThreePillar.qualityLossCartons).toBe(1.25);
  });
});
