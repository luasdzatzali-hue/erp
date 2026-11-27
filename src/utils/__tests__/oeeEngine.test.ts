import { describe, it, expect } from 'vitest';
import { AppState } from '../../types';
import {
  SIX_BIG_LOSS_CATEGORIES,
  buildProductionStopLogPayload,
  calculateAvailability,
  calculatePerformance,
  calculateQuality,
  calculateCompositeOee,
  calculateLineShiftOee,
  calculateShiftAllLinesOee,
  IiotTelemetryEventDoc
} from '../oeeEngine';
import { reconcileMaterialBomVariance } from '../productionReconcile';

function makeBaseState(): AppState {
  return {
    theme: 'midnight',
    factoryName: 'PT ProdTrack Test',
    cloudWorkspaceId: 'ws-test-1',
    isAuthenticated: true,
    currentUserRole: 'ADMINISTRATOR',
    currentSession: {
      role: 'ADMINISTRATOR',
      id: 'admin-1',
      name: 'Admin Test'
    },
    registeredOperators: [],
    registeredManagement: [],
    adminPin: '1234',
    currentTab: 'dashboard',
    master: {
      materials: [
        {
          id: 'mat-flour',
          code: 'MAT-01',
          name: 'Tepung Terigu',
          type: 'bubuk',
          source: 'GDRM',
          packaging: 'Zak 25kg',
          weightKg: 25
        },
        {
          id: 'mat-sugar',
          code: 'MAT-02',
          name: 'Gula Cair',
          type: 'liquid',
          source: 'Formulasi',
          packaging: 'Drum',
          weightKg: 200
        }
      ],
      wips: [
        {
          id: 'wip-cream',
          code: 'WIP-CRM',
          name: 'Adonan Cream Coklat',
          batchWeightKg: 100,
          assignedMachineId: 'mc-mixer-1',
          assignedMachineIds: ['mc-mixer-1'],
          targetTankId: 'ht-1',
          targetTankIds: ['ht-1']
        }
      ],
      skus: [
        {
          id: 'sku-wafer-1',
          code: 'SKU-WF-01',
          name: 'Wafer Choco 250g',
          isKite: false,
          targetHour: 600,
          cartonWeightKg: 2.5
        }
      ],
      skuWips: [
        {
          id: 'sw-1',
          skuId: 'sku-wafer-1',
          wipId: 'wip-cream',
          kgWipPerCartonSku: 0.5
        }
      ],
      wipMats: [
        {
          id: 'wm-1',
          wipId: 'wip-cream',
          materialId: 'mat-flour',
          materialKgPerBatch: 60
        },
        {
          id: 'wm-2',
          wipId: 'wip-cream',
          materialId: 'mat-sugar',
          materialKgPerBatch: 40
        }
      ],
      recipes: [],
      machines: [
        {
          id: 'mc-mixer-1',
          code: 'MX-01',
          name: 'Mixer Cream A',
          line: 'Line 1',
          capacityKgPerHour: 500,
          status: 'OPERATIONAL'
        }
      ],
      tanks: [
        {
          id: 'ht-1',
          code: 'HT-01',
          name: 'Holding Tank Cream 1',
          type: 'HOLDING_TANK',
          capacityKg: 500,
          currentLevelKg: 250,
          assignedWipId: 'wip-cream',
          sourceMachineIds: ['mc-mixer-1'],
          assignedLineIds: ['line-1'],
          status: 'ACTIVE'
        }
      ],
      productionLines: [
        {
          id: 'line-1',
          code: 'L1',
          name: 'Line 1',
          isActive: true
        }
      ]
    },
    transactions: {
      requests: [],
      receipts: [],
      usages: [],
      wipBatches: [],
      cartonProductions: [],
      tankLogs: [],
      changeovers: [],
      productionStops: [],
      stockAdjustments: [],
      rejectLogs: []
    },
    activeSkuRun: null,
    activeSkuRuns: [],
    tank: {
      level: 500,
      maxCapacity: 1000,
      temp: 50,
      minTempTarget: 45,
      maxTempTarget: 55,
      isSimulationActive: false
    }
  };
}

describe('Unified OEE Engine (src/utils/oeeEngine.ts)', () => {
  it('calculates Availability accurately with planned stops, breakdown, changeover, and WIP batch pauses', () => {
    const avail = calculateAvailability({
      scheduledShiftMinutes: 480,
      stopLogs: [
        {
          id: 'stop-planned',
          skuId: 'sku-1',
          skuName: 'Wafer',
          shift: 1,
          startedAt: '2026-11-27T11:30:00.000Z',
          stoppedAt: '2026-11-27T12:00:00.000Z',
          durationMinutes: 30,
          category: 'OTHER_PLANNED',
          categoryLabel: 'Istirahat',
          lossType: 'PLANNED',
          reasonTitle: 'Istirahat Shift'
        },
        {
          id: 'stop-breakdown',
          skuId: 'sku-1',
          skuName: 'Wafer',
          shift: 1,
          startedAt: '2026-11-27T08:00:00.000Z',
          stoppedAt: '2026-11-27T08:30:00.000Z',
          durationMinutes: 30,
          category: 'EQUIPMENT_FAILURE',
          categoryLabel: 'Breakdown',
          lossType: 'DOWNTIME',
          reasonTitle: 'Motor Trip'
        },
        {
          id: 'stop-setup',
          skuId: 'sku-1',
          skuName: 'Wafer',
          shift: 1,
          startedAt: '2026-11-27T09:00:00.000Z',
          stoppedAt: '2026-11-27T09:15:00.000Z',
          durationMinutes: 15,
          category: 'SETUP_ADJUSTMENT',
          categoryLabel: 'Setup',
          lossType: 'DOWNTIME',
          reasonTitle: 'Tooling'
        }
      ],
      changeoverRecords: [
        {
          id: 'co-1',
          machineId: 'mc-mixer-1',
          machineCode: 'MX-01',
          machineName: 'Mixer',
          timestamp: '2026-11-27T07:30:00.000Z',
          toWipId: 'wip-cream',
          toWipName: 'Cream',
          changeoverType: 'MAJOR_ALLERGEN',
          durationMinutes: 25,
          operatorName: 'Op 1',
          checklist: {
            lineClearanceDone: true,
            cleaningSanitationDone: true,
            toolingMouldSwapped: true,
            parameterConfigured: true,
            qcSwabClearanceDone: true
          },
          status: 'COMPLETED',
          startedAt: '2026-11-27T07:05:00.000Z',
          completedAt: '2026-11-27T07:30:00.000Z'
        },
        {
          id: 'co-cancelled',
          machineId: 'mc-mixer-1',
          machineCode: 'MX-01',
          machineName: 'Mixer',
          timestamp: '2026-11-27T07:45:00.000Z',
          toWipId: 'wip-cream',
          toWipName: 'Cream',
          changeoverType: 'MINOR',
          durationMinutes: 99,
          operatorName: 'Op 1',
          checklist: {
            lineClearanceDone: true,
            cleaningSanitationDone: true,
            toolingMouldSwapped: true,
            parameterConfigured: true,
            qcSwabClearanceDone: true
          },
          status: 'CANCELLED',
          startedAt: '2026-11-27T07:45:00.000Z'
        }
      ],
      wipBatchPauseLogs: [
        {
          id: 'pause-1',
          pausedAt: '2026-11-27T10:00:00.000Z',
          resumedAt: '2026-11-27T10:20:00.000Z',
          category: 'Gangguan Mekanik',
          reason: 'Seal pompa WIP bocor',
          pausedBy: 'Op 1',
          remainingMsAtPause: 600000,
          pausedDurationMs: 20 * 60000
        }
      ]
    });

    // Planned = 480 - 30 = 450
    // Breakdown = 30 + 20 = 50; Changeover = 15 + 25 = 40; Total Downtime = 90
    // Operating = 450 - 90 = 360 -> 360 / 450 = 80%
    expect(avail.plannedProductionTimeMinutes).toBe(450);
    expect(avail.breakdownMinutes).toBe(50);
    expect(avail.changeoverMinutes).toBe(40);
    expect(avail.totalDowntimeMinutes).toBe(90);
    expect(avail.operatingTimeMinutes).toBe(360);
    expect(avail.availabilityPct).toBe(80);
  });

  it('detects Reduced Speed & Idling/Minor Stops automatically from (Output * Ideal Cycle Time) / Operating Time', () => {
    const perf = calculatePerformance({
      operatingTimeMinutes: 360,
      totalOutputCartons: 2880,
      targetPerHour: 600, // Ideal cycle time = 0.1 min/ktn -> 2880 * 0.1 = 288 min
      stopLogs: [
        {
          id: 'idle-1',
          skuId: 'sku-1',
          skuName: 'Wafer',
          shift: 1,
          startedAt: '2026-11-27T09:00:00.000Z',
          stoppedAt: '2026-11-27T09:12:00.000Z',
          durationMinutes: 12,
          category: 'IDLING_MINOR_STOPS',
          categoryLabel: 'Idling',
          lossType: 'SPEED',
          reasonTitle: 'Karton nyangkut sesaat'
        }
      ],
      iiotIdleMinutes: 10
    });

    expect(perf.idealCycleTimeMinutes).toBe(0.1);
    expect(perf.idealOperatingMinutes).toBe(288);
    expect(perf.performancePct).toBe(80);
    // Total speed loss = 360 - 288 = 72m => 22m Idling + 50m Reduced Speed
    expect(perf.idlingMinorStopsMinutes).toBe(22);
    expect(perf.reducedSpeedMinutes).toBe(50);
    expect(perf.speedDeficitCartons).toBe(720);
  });

  it('reduces Quality OEE automatically from Process Defects (rejectAnalytics) AND BOM over-variance (productionReconcile)', () => {
    // Direct reconciliation test
    const variance = reconcileMaterialBomVariance({
      actualCartons: 1000,
      standardBomKgPerCarton: 0.5, // Standard = 500 kg
      loggedRejectKg: 20, // 15 kg process defect + 5 kg startup
      startupRejectKg: 5,
      actualMaterialUsedKg: 550 // 50 kg total over BOM -> 20 kg logged + 30 kg unlogged over-variance
    });

    expect(variance.standardBomMaterialKg).toBe(500);
    expect(variance.processDefectsLossKg).toBe(15);
    expect(variance.unloggedOverVarianceKg).toBe(30);
    expect(variance.reducedYieldLossKg).toBe(35);
    expect(variance.materialVariancePct).toBe(10);

    const quality = calculateQuality({
      totalOutputCartons: 1000,
      standardBomKgPerCarton: 0.5,
      targetPerHour: 600,
      actualMaterialUsedKg: 550,
      rejectLogs: [
        {
          id: 'rej-1',
          timestamp: '2026-11-27T09:00:00.000Z',
          date: '2026-11-27',
          shift: 1,
          stationType: 'LINE',
          lineId: 'line-1',
          materialId: 'mat-flour',
          materialName: 'Tepung Terigu',
          unit: 'kg',
          rejectQtyInput: 15,
          rejectQtyKg: 15,
          sourceLocation: 'CK',
          equivalentCartonsLoss: 30,
          rejectCategory: 'ADONAN_TERBUANG',
          operatorName: 'Op 1'
        },
        {
          id: 'rej-2',
          timestamp: '2026-11-27T07:15:00.000Z',
          date: '2026-11-27',
          shift: 1,
          stationType: 'LINE',
          lineId: 'line-1',
          materialId: 'mat-sugar',
          materialName: 'Gula Cair',
          unit: 'kg',
          rejectQtyInput: 5,
          rejectQtyKg: 5,
          sourceLocation: 'STORAGE_TANK',
          equivalentCartonsLoss: 10,
          rejectCategory: 'SETTING_AWAL',
          operatorName: 'Op 1'
        }
      ]
    });

    // Total loss = 15 kg (30 ktn) Process Defects + 35 kg (70 ktn) Reduced Yield = 100 ktn out of 1000 ktn
    expect(quality.processDefectsEquivalentCartons).toBe(30);
    expect(quality.reducedYieldEquivalentCartons).toBe(70);
    expect(quality.goodOutputCartons).toBe(900);
    expect(quality.qualityPct).toBe(90);
  });

  it('unifies Line & Shift OEE end-to-end across changeover, WIP pause, speed drop, rejects, and BOM over-variance', () => {
    const state = makeBaseState();
    const dateStr = '2026-11-27';

    // Line run on Line 1, Shift 1 (planned 4800 cartons @ 600/hr -> 480 mins)
    // Actual output: 3000 cartons (Standard BOM = 3000 * 0.5 kg = 1500 kg)
    state.activeSkuRuns = [
      {
        id: 'run-1',
        lineId: 'line-1',
        lineName: 'Line 1',
        skuId: 'sku-wafer-1',
        skuCode: 'SKU-WF-01',
        skuName: 'Wafer Choco 250g',
        shift: 1,
        plannedCartons: 4800,
        startedAt: '2026-11-27T07:05:00.000Z',
        isRunning: true,
        cartonsProducedTotal: 3000,
        targetPerHour: 600
      }
    ];

    // Changeover 40 min + WIP Batch Pause 20 min => Total Downtime = 60 min -> Availability = 420 / 480 = 87.5%
    state.transactions.changeovers = [
      {
        id: 'co-line1',
        machineId: 'mc-mixer-1',
        machineCode: 'MX-01',
        machineName: 'Mixer Cream A',
        timestamp: '2026-11-27T08:00:00.000Z',
        toWipId: 'wip-cream',
        toWipName: 'Adonan Cream Coklat',
        changeoverType: 'MAJOR_ALLERGEN',
        durationMinutes: 40,
        operatorName: 'Budi',
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: true,
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        status: 'COMPLETED',
        startedAt: '2026-11-27T07:20:00.000Z',
        completedAt: '2026-11-27T08:00:00.000Z'
      }
    ];

    state.transactions.wipBatches = [
      {
        id: 'batch-1',
        batchCode: 'B-001',
        wipId: 'wip-cream',
        wipName: 'Adonan Cream Coklat',
        skuId: 'sku-wafer-1',
        shift: 1,
        batchSize: 1,
        batchWeightKg: 100,
        status: 'SELESAI',
        startedAt: '2026-11-27T09:00:00.000Z',
        targetMachineId: 'mc-mixer-1',
        operatorName: 'Budi',
        materials: [],
        pauseLogs: [
          {
            id: 'wp-1',
            pausedAt: '2026-11-27T09:10:00.000Z',
            resumedAt: '2026-11-27T09:30:00.000Z',
            category: 'Kerusakan Mesin',
            reason: 'Valve transfer tersumbat',
            pausedBy: 'Budi',
            remainingMsAtPause: 600000,
            pausedDurationMs: 20 * 60000
          }
        ]
      }
    ];

    // IIoT idle pulse event (10 min idle, total operating 420m, 3000 cartons * 0.1m = 300m -> Performance = 300/420 = 71.43%)
    const iiotEvents: IiotTelemetryEventDoc[] = [
      {
        id: 'tel-1',
        workspaceId: 'ws-test-1',
        lineId: 'line-1',
        machineId: 'mc-mixer-1',
        skuCode: 'SKU-WF-01',
        status: 'IDLE',
        pulseCount: 3000,
        cycleTimeSec: 6,
        idleMinutes: 10,
        recordedAt: '2026-11-27T10:00:00.000Z'
      }
    ];

    // Rejects: 30 kg ADONAN_TERBUANG (60 equiv cartons) + Material Usage 1650 kg (vs 1500 kg std = 150 kg over BOM -> 30 kg logged + 120 kg unlogged variance)
    state.transactions.rejectLogs = [
      {
        id: 'rej-line-1',
        timestamp: '2026-11-27T11:00:00.000Z',
        date: dateStr,
        shift: 1,
        stationType: 'LINE',
        lineId: 'line-1',
        lineName: 'Line 1',
        skuId: 'sku-wafer-1',
        materialId: 'mat-flour',
        materialName: 'Tepung Terigu',
        unit: 'kg',
        rejectQtyInput: 30,
        rejectQtyKg: 30,
        sourceLocation: 'CK',
        equivalentCartonsLoss: 60,
        rejectCategory: 'ADONAN_TERBUANG',
        operatorName: 'Budi'
      }
    ];
    state.transactions.usages = [
      {
        id: 'usg-1',
        usageNumber: 'USG-001',
        date: dateStr,
        shift: 1,
        skuId: 'sku-wafer-1',
        wipId: 'wip-cream',
        materialId: 'mat-flour',
        qty: 1500,
        batch: 15,
        usageQty: 1650,
        sourceLocation: 'CK'
      }
    ];

    const res = calculateLineShiftOee({
      state,
      lineId: 'line-1',
      dateStr,
      shift: 1,
      iiotEvents
    });

    // Availability = 420 / 480 = 87.5%
    expect(res.availability).toBe(87.5);
    // Performance = 300 / 420 = 71.43%
    expect(res.performance).toBe(71.43);
    // Quality: 150 kg total scrap & variance = 300 equiv cartons out of 3000 -> good = 2700 -> 90%
    expect(res.quality).toBe(90);
    expect(res.materialVariancePct).toBe(10);
    expect(res.oeeScore).toBe(calculateCompositeOee(87.5, 71.43, 90));

    // Six Big Losses Breakdown matches Firestore ShiftOeeSnapshot shape
    expect(res.sixBigLossesBreakdown.equipmentFailure.minutes).toBe(20);
    expect(res.sixBigLossesBreakdown.setupAdjustment.minutes).toBe(40);
    expect(res.sixBigLossesBreakdown.idlingMinorStops.minutes).toBe(10);
    expect(res.sixBigLossesBreakdown.reducedSpeed.minutes).toBe(110);
    expect(res.sixBigLossesBreakdown.processDefects.lossKg).toBe(30);
    expect(res.sixBigLossesBreakdown.reducedYield.lossKg).toBe(120);

    expect(res.snapshot.shiftId).toBe('2026-11-27-S1');
    expect(res.snapshot.lineId).toBe('line-1');
    expect(res.snapshot.skuCode).toBe('SKU-WF-01');
    expect(res.snapshot.oeeScore).toBe(res.oeeScore);

    const allSummary = calculateShiftAllLinesOee(state, dateStr, 1, undefined, undefined, iiotEvents);
    expect(allSummary.oeeScore).toBe(res.oeeScore);
    expect(allSummary.lineResults).toHaveLength(1);
  });

  it('builds standardized ProductionStopLog payloads from SixBigLosses categories', () => {
    expect(SIX_BIG_LOSS_CATEGORIES.length).toBe(8);
    const payload = buildProductionStopLogPayload({
      lineId: 'line-1',
      lineName: 'Line 1',
      skuId: 'sku-wafer-1',
      skuName: 'Wafer Choco 250g',
      skuCode: 'SKU-WF-01',
      shift: 2,
      durationMinutes: 25,
      category: 'EQUIPMENT_FAILURE',
      selectedSubReason: 'Kerusakan Motor Penggerak Mixer / Pompa WIP (Overheating/Trip)',
      operatorName: 'Andi',
      cartonsProducedDuringRun: 1200
    });

    expect(payload.lossType).toBe('DOWNTIME');
    expect(payload.durationMinutes).toBe(25);
    expect(payload.reasonTitle).toContain('Kerusakan Motor');
    expect(payload.cartonsProducedDuringRun).toBe(1200);
  });
});
