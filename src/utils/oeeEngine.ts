import {
  ActiveSkuProductionRun,
  AppState,
  LossCategoryType,
  MachineChangeoverRecord,
  MaterialRejectLog,
  ProductionStopLog,
  ShiftNumber,
  SixBigLossCategory,
  WipBatchPauseLog
} from '../types';
import { getShiftFromTime } from './shifts';
import { getMaterialsForSkuBom } from './rejectAnalytics';
import {
  reconcileMaterialBomVariance,
  MaterialBomVarianceResult
} from './productionReconcile';

export interface SixBigLossCategoryMeta {
  key: SixBigLossCategory;
  number: number;
  title: string;
  subtitle: string;
  lossType: LossCategoryType;
  lossTypeBadge: string;
  badgeClass: string;
  bgActive: string;
  borderActive: string;
  defaultSubReasons: string[];
}

export const SIX_BIG_LOSS_CATEGORIES: SixBigLossCategoryMeta[] = [
  {
    key: 'EQUIPMENT_FAILURE',
    number: 1,
    title: 'Kerusakan Mesin / Breakdowns',
    subtitle: 'Equipment Failure & Unplanned Downtime',
    lossType: 'DOWNTIME',
    lossTypeBadge: 'Downtime Loss',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    bgActive: 'bg-rose-50',
    borderActive: 'border-rose-400',
    defaultSubReasons: [
      'Kerusakan Motor Penggerak Mixer / Pompa WIP (Overheating/Trip)',
      'Patah Poros / Baut Agitator Tangki Macet',
      'Kebocoran Jalur Pipa Transfer WIP / Valve Rusak',
      'Gangguan Elektrikal, Sensor PLC, atau Power Inverter Error',
      'Kerusakan Pneumatik / Sabuk Konveyor Patah'
    ]
  },
  {
    key: 'SETUP_ADJUSTMENT',
    number: 2,
    title: 'Penyetelan & Changeover',
    subtitle: 'Setup & Adjustments / Line Clearance',
    lossType: 'DOWNTIME',
    lossTypeBadge: 'Downtime Loss',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
    bgActive: 'bg-amber-50',
    borderActive: 'border-amber-400',
    defaultSubReasons: [
      'Changeover Produk / Penggantian Formula Resep WIP Baru',
      'Pembersihan Menyeluruh & Siklus Sanitasi CIP (Cleaning-in-Place)',
      'Penggantian Cetakan, Nozzle Filling, atau Tooling Mesin',
      'Penyetelan Parameter Suhu Tangki, Tekanan, dan Speed Mixer',
      'Line Clearance & Menunggu Konfirmasi Swab Allergen QC'
    ]
  },
  {
    key: 'IDLING_MINOR_STOPS',
    number: 3,
    title: 'Pemberhentian Singkat & Idling',
    subtitle: 'Idling & Minor Stoppages (< 5-10 menit)',
    lossType: 'SPEED',
    lossTypeBadge: 'Speed Loss',
    badgeClass: 'bg-sky-100 text-sky-950 border-sky-300 font-bold',
    bgActive: 'bg-sky-50',
    borderActive: 'border-sky-400',
    defaultSubReasons: [
      'Aliran Fluida WIP dari Holding Tank Macet / Tersendat Sesaat',
      'Sensor Photoelectric Terhalang Debu / Karton Nyangkut',
      'Menunggu Pasokan Box Karton, Lakban, atau Palet Baru',
      'Pembersihan Tumpahan Ceceran Material Singkat oleh Operator',
      'Penyesuaian Posisi Sensor Otomatis / Limit Switch'
    ]
  },
  {
    key: 'REDUCED_SPEED',
    number: 4,
    title: 'Kecepatan Operasi Berkurang',
    subtitle: 'Reduced Speed / Operating Below Nameplate Capacity',
    lossType: 'SPEED',
    lossTypeBadge: 'Speed Loss',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',
    bgActive: 'bg-indigo-50',
    borderActive: 'border-indigo-400',
    defaultSubReasons: [
      'Viskositas WIP Terlalu Kental (Dibutuhkan RPM Pompa Lebih Rendah)',
      'Keausan Komponen Mekanikal / Getaran Tinggi pada Mesin',
      'Operator Sengaja Menurunkan Kecepatan untuk Menghindari Jamming',
      'Fluktuasi Suhu Pemanas Tangki Tidak Stabil (Perlu Menunggu)',
      'Toleransi Berat Karton Berfluktuasi pada Kecepatan Tinggi'
    ]
  },
  {
    key: 'PROCESS_DEFECTS',
    number: 5,
    title: 'Cacat Proses & Perbaikan',
    subtitle: 'Process Defects & Quality Rework',
    lossType: 'QUALITY',
    lossTypeBadge: 'Quality Loss',
    badgeClass: 'bg-orange-100 text-orange-950 border-orange-300 font-bold',
    bgActive: 'bg-orange-50',
    borderActive: 'border-orange-400',
    defaultSubReasons: [
      'Karton Bocor / Sealing Rekat Tidak Rapat Sempurna',
      'Bobot Netto Karton di Luar Batas Toleransi Standar QC',
      'Kontaminasi Fisik / Cacat Visual Label Kemasan',
      'Homogenitas & Kekentalan Formula WIP Drop di Bawah Standar',
      'Cacat Cetakan / Bentuk Produk Jadi Tidak Presisi'
    ]
  },
  {
    key: 'STARTUP_REJECTS',
    number: 6,
    title: 'Penurunan Yield & Startup Scrap',
    subtitle: 'Reduced Yield & Early Production Losses',
    lossType: 'QUALITY',
    lossTypeBadge: 'Quality Loss',
    badgeClass: 'bg-red-100 text-red-900 border-red-300 font-bold',
    bgActive: 'bg-red-50',
    borderActive: 'border-red-400',
    defaultSubReasons: [
      'Pembuangan Adonan / WIP Awal saat Pemanasan Mesin (Warm-up Scrap)',
      'Flushing / Pembilasan Sisa Air Saluran Pipa Line Produksi',
      'Penstabilan Parameter Berat pada 10 Menit Pertama Awal Shift',
      'Bahan Baku Awal Tidak Standar Suhu Operasional',
      'Adonan Pertama Ditolak QC Sebelum Mencapai Steady State'
    ]
  },
  {
    key: 'MATERIAL_SHORTAGE',
    number: 7,
    title: 'Material Shortage (WIP Holding Tank Habis)',
    subtitle: 'Kekurangan Material / Stok WIP di Holding Tank Kosong',
    lossType: 'DOWNTIME',
    lossTypeBadge: 'Material Shortage',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300 font-bold',
    bgActive: 'bg-rose-50',
    borderActive: 'border-rose-400',
    defaultSubReasons: [
      'WIP di Holding Tank habis / di bawah kebutuhan 1 karton SKU',
      'Menunggu transfer batch WIP baru dari Storage Tank / Mixer ke Holding Tank',
      'Keterlambatan pengiriman material bahan baku GDRM ke lini produksi',
      'Kekurangan material kemasan karton / inner wrap pada mesin packing'
    ]
  },
  {
    key: 'OTHER_PLANNED',
    number: 8,
    title: 'Downtime Terencana / Operasional',
    subtitle: 'Planned Maintenance, Break & Sanitation',
    lossType: 'PLANNED',
    lossTypeBadge: 'Planned Stop',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
    bgActive: 'bg-slate-100',
    borderActive: 'border-slate-400',
    defaultSubReasons: [
      'Waktu Istirahat Shift & Pergantian Regu Kerja',
      'Pembersihan Harian Rutin / Sanitasi Shift',
      'Briefing Operator & Tool Box Meeting K3 Pabrik',
      'Preventive Maintenance Terjadwal dari Tim Maintenance',
      'Instruksi Manajemen / Perubahan Rencana Produksi'
    ]
  }
];

export function getSixBigLossCategoryMeta(key: SixBigLossCategory): SixBigLossCategoryMeta {
  return SIX_BIG_LOSS_CATEGORIES.find(c => c.key === key) || SIX_BIG_LOSS_CATEGORIES[0];
}

export interface BuildProductionStopLogParams {
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  shift: ShiftNumber;
  startedAt?: string;
  stoppedAtIso?: string;
  durationMinutes: number;
  category: SixBigLossCategory;
  selectedSubReason?: string;
  customReason?: string;
  actionTaken?: string;
  operatorName?: string;
  technicianName?: string;
  notes?: string;
  cartonsProducedDuringRun?: number;
}

export function buildProductionStopLogPayload(
  params: BuildProductionStopLogParams
): Omit<ProductionStopLog, 'id'> {
  const categoryMeta = getSixBigLossCategoryMeta(params.category);
  const dur = Math.max(0, Math.round(Number(params.durationMinutes) || 0));
  const stoppedAt = params.stoppedAtIso || new Date().toISOString();
  const startedAt =
    params.startedAt || new Date(Date.parse(stoppedAt) - dur * 60000).toISOString();
  const finalReason =
    params.customReason && params.customReason.trim()
      ? params.customReason.trim()
      : params.selectedSubReason && params.selectedSubReason !== 'CUSTOM'
      ? params.selectedSubReason
      : categoryMeta.title;

  return {
    lineId: params.lineId,
    lineName: params.lineName,
    skuId: params.skuId,
    skuName: params.skuName,
    skuCode: params.skuCode,
    shift: params.shift,
    startedAt,
    stoppedAt,
    durationMinutes: dur,
    estimatedRepairMinutes: dur,
    category: categoryMeta.key,
    categoryLabel: categoryMeta.title,
    lossType: categoryMeta.lossType,
    reasonTitle: finalReason,
    subReason:
      params.selectedSubReason && params.selectedSubReason !== 'CUSTOM'
        ? params.selectedSubReason
        : undefined,
    actionTaken: params.actionTaken?.trim() || undefined,
    operatorName: params.operatorName?.trim() || undefined,
    technicianName: params.technicianName?.trim() || undefined,
    notes: params.notes?.trim() || undefined,
    cartonsProducedDuringRun: params.cartonsProducedDuringRun ?? 0
  };
}

export const DEFAULT_TARGET_OEE_PCT = 85;

export interface SixBigLossBucket {
  minutes: number;
  lossKg: number;
}

export interface SixBigLossesBreakdown {
  equipmentFailure: SixBigLossBucket;
  setupAdjustment: SixBigLossBucket;
  idlingMinorStops: SixBigLossBucket;
  reducedSpeed: SixBigLossBucket;
  processDefects: SixBigLossBucket;
  reducedYield: SixBigLossBucket;
}

export type SixBigLossParetoKey = keyof SixBigLossesBreakdown;

export interface SixBigLossParetoItem {
  rank: number;
  tpmNumber: number;
  key: SixBigLossParetoKey;
  category: SixBigLossCategory;
  label: string;
  pillar: 'AVAILABILITY' | 'PERFORMANCE' | 'QUALITY';
  durationMinutes: number;
  equivalentLossKg: number;
  equivalentLossCartons: number;
  contributionPct: number;
  cumulativePct: number;
}

export type IiotTelemetryStatus = 'RUNNING' | 'STOP' | 'IDLE' | 'FAULT';

export interface IiotTelemetryEventDoc {
  id: string;
  workspaceId: string;
  lineId: string;
  machineId?: string;
  skuCode?: string;
  status: IiotTelemetryStatus;
  pulseCount: number;
  cycleTimeSec: number;
  idleMinutes?: number;
  recordedAt: string;
  receivedAt?: string;
  sourceUid?: string;
}

export interface ShiftOeeSnapshotDoc {
  id: string;
  workspaceId: string;
  shiftId: string;
  date: string;
  shift: ShiftNumber;
  lineId: string;
  lineName: string;
  skuCode: string;
  availability: number;
  performance: number;
  quality: number;
  oeeScore: number;
  sixBigLossesBreakdown: SixBigLossesBreakdown;
  materialVariancePct: number;
  plannedProductionTimeMinutes: number;
  operatingTimeMinutes: number;
  totalOutputCartons: number;
  goodOutputCartons: number;
  standardBomMaterialKg: number;
  actualMaterialUsedKg: number;
  updatedAt?: string;
  updatedByUid?: string;
}

export interface AvailabilityInput {
  scheduledShiftMinutes?: number;
  stopLogs?: ProductionStopLog[];
  changeoverRecords?: MachineChangeoverRecord[];
  wipBatchPauseLogs?: WipBatchPauseLog[];
  iiotFaultStopMinutes?: number;
}

export interface AvailabilityResult {
  scheduledShiftMinutes: number;
  plannedStopMinutes: number;
  plannedProductionTimeMinutes: number;
  breakdownMinutes: number;
  changeoverMinutes: number;
  totalDowntimeMinutes: number;
  operatingTimeMinutes: number;
  availabilityPct: number;
}

export interface PerformanceInput {
  operatingTimeMinutes: number;
  totalOutputCartons: number;
  targetPerHour: number;
  idealCycleTimeMinutesOverride?: number;
  stopLogs?: ProductionStopLog[];
  iiotIdleMinutes?: number;
}

export interface PerformanceResult {
  idealCycleTimeMinutes: number;
  idealOperatingMinutes: number;
  operatingTimeMinutes: number;
  idlingMinorStopsMinutes: number;
  reducedSpeedMinutes: number;
  speedDeficitCartons: number;
  rawPerformancePct: number;
  performancePct: number;
  isCycleTimeAnomaly: boolean;
  anomalyReason?: string;
}

export interface QualityInput {
  totalOutputCartons: number;
  standardBomKgPerCarton: number;
  targetPerHour: number;
  rejectLogs?: MaterialRejectLog[];
  stopLogs?: ProductionStopLog[];
  actualMaterialUsedKg?: number;
  tankScrapKg?: number;
}

export interface QualityResult {
  goodOutputCartons: number;
  processDefectsMinutes: number;
  processDefectsLossKg: number;
  processDefectsEquivalentCartons: number;
  reducedYieldMinutes: number;
  reducedYieldLossKg: number;
  reducedYieldEquivalentCartons: number;
  materialVariance: MaterialBomVarianceResult;
  qualityPct: number;
}

export interface LineShiftOeeResult {
  lineId: string;
  lineName: string;
  shiftId: string;
  date: string;
  shift: ShiftNumber;
  skuId: string;
  skuCode: string;
  skuName: string;
  targetPerHour: number;
  standardBomKgPerCarton: number;
  totalOutputCartons: number;
  goodOutputCartons: number;
  availability: number;
  performance: number;
  quality: number;
  oeeScore: number;
  targetOeePct: number;
  oeeTargetVariancePct: number;
  materialVariancePct: number;
  availabilityDetail: AvailabilityResult;
  performanceDetail: PerformanceResult;
  qualityDetail: QualityResult;
  sixBigLossesBreakdown: SixBigLossesBreakdown;
  sixBigLossesPareto: SixBigLossParetoItem[];
  snapshot: ShiftOeeSnapshotDoc;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return round2(Math.min(100, Math.max(0, n)));
}

function isChangeoverOrSetupPause(pause: WipBatchPauseLog): boolean {
  const cat = `${pause.category || ''} ${pause.reason || ''}`.toLowerCase();
  return (
    cat.includes('changeover') ||
    cat.includes('setup') ||
    cat.includes('cip') ||
    cat.includes('cleaning') ||
    cat.includes('sanitasi') ||
    cat.includes('qc') ||
    cat.includes('clearance')
  );
}

function isPlannedPause(pause: WipBatchPauseLog): boolean {
  const cat = `${pause.category || ''} ${pause.reason || ''}`.toLowerCase();
  return cat.includes('istirahat') || cat.includes('planned') || cat.includes('briefing');
}

function resolvePauseMinutes(pause: WipBatchPauseLog, nowMs = Date.now()): number {
  if (typeof pause.pausedDurationMs === 'number' && pause.pausedDurationMs >= 0) {
    return round2(pause.pausedDurationMs / 60000);
  }
  const pausedMs = Date.parse(pause.pausedAt);
  if (!Number.isFinite(pausedMs)) return 0;
  const resumedMs = pause.resumedAt ? Date.parse(pause.resumedAt) : nowMs;
  if (!Number.isFinite(resumedMs)) return 0;
  return round2(Math.max(0, resumedMs - pausedMs) / 60000);
}

/**
 * Pilar 1 OEE: Availability
 * Planned Production Time = Scheduled Shift Time - Planned Stops (OTHER_PLANNED / Istirahat)
 * Operating Time = Planned Production Time - (Breakdown + Material Shortage + Changeover/Setup + WIP Batch Pauses)
 */
export function calculateAvailability(
  input: AvailabilityInput,
  nowMs = Date.now()
): AvailabilityResult {
  const scheduledShiftMinutes = Math.max(0, Number(input.scheduledShiftMinutes ?? 480) || 0);
  const stopLogs = input.stopLogs || [];
  const changeovers = (input.changeoverRecords || []).filter(c => c.status !== 'CANCELLED');
  const pauseLogs = input.wipBatchPauseLogs || [];

  let plannedStopMinutes = 0;
  let breakdownMinutes = Math.max(0, Number(input.iiotFaultStopMinutes) || 0);
  let changeoverMinutes = 0;

  for (const stop of stopLogs) {
    const dur = Math.max(
      0,
      Number(stop.actualRepairMinutes ?? stop.durationMinutes) || 0
    );
    if (stop.category === 'OTHER_PLANNED' || stop.lossType === 'PLANNED') {
      plannedStopMinutes += dur;
    } else if (stop.category === 'SETUP_ADJUSTMENT') {
      changeoverMinutes += dur;
    } else if (
      stop.category === 'EQUIPMENT_FAILURE' ||
      stop.category === 'MATERIAL_SHORTAGE' ||
      stop.lossType === 'DOWNTIME'
    ) {
      breakdownMinutes += dur;
    }
  }

  for (const co of changeovers) {
    const dur = Math.max(0, Number(co.durationMinutes) || 0);
    changeoverMinutes += dur;
  }

  for (const pause of pauseLogs) {
    const dur = resolvePauseMinutes(pause, nowMs);
    if (isPlannedPause(pause)) {
      plannedStopMinutes += dur;
    } else if (isChangeoverOrSetupPause(pause)) {
      changeoverMinutes += dur;
    } else {
      breakdownMinutes += dur;
    }
  }

  plannedStopMinutes = round2(Math.min(scheduledShiftMinutes, plannedStopMinutes));
  const plannedProductionTimeMinutes = round2(
    Math.max(0, scheduledShiftMinutes - plannedStopMinutes)
  );

  breakdownMinutes = round2(breakdownMinutes);
  changeoverMinutes = round2(changeoverMinutes);
  const rawDowntime = round2(breakdownMinutes + changeoverMinutes);
  const totalDowntimeMinutes = round2(Math.min(plannedProductionTimeMinutes, rawDowntime));
  const operatingTimeMinutes = round2(
    Math.max(0, plannedProductionTimeMinutes - totalDowntimeMinutes)
  );

  const availabilityPct =
    plannedProductionTimeMinutes > 0
      ? clampPct((operatingTimeMinutes / plannedProductionTimeMinutes) * 100)
      : 0;

  return {
    scheduledShiftMinutes: round2(scheduledShiftMinutes),
    plannedStopMinutes,
    plannedProductionTimeMinutes,
    breakdownMinutes,
    changeoverMinutes,
    totalDowntimeMinutes,
    operatingTimeMinutes,
    availabilityPct
  };
}

/**
 * Pilar 2 OEE: Performance
 * Performance = (Total Output * Ideal Cycle Time SKU) / Operating Time
 * Memecah selisih kecepatan aktual vs standar SKU ke Idling/Minor Stops & Reduced Speed.
 */
export function calculatePerformance(input: PerformanceInput): PerformanceResult {
  const operatingTimeMinutes = Math.max(0, Number(input.operatingTimeMinutes) || 0);
  const totalOutputCartons = Math.max(0, Number(input.totalOutputCartons) || 0);
  const targetPerHour = Math.max(0, Number(input.targetPerHour) || 0);
  const idealCycleTimeMinutes =
    typeof input.idealCycleTimeMinutesOverride === 'number' &&
    input.idealCycleTimeMinutesOverride > 0
      ? input.idealCycleTimeMinutesOverride
      : targetPerHour > 0
      ? 60 / targetPerHour
      : 0;

  const idealOperatingMinutes = round2(totalOutputCartons * idealCycleTimeMinutes);
  const rawPerformancePct =
    operatingTimeMinutes > 0 && idealCycleTimeMinutes > 0
      ? round2((idealOperatingMinutes / operatingTimeMinutes) * 100)
      : 0;
  const isCycleTimeAnomaly = rawPerformancePct > 100;
  const performancePct = clampPct(rawPerformancePct);
  const anomalyReason = isCycleTimeAnomaly
    ? `Performance mentah ${rawPerformancePct.toFixed(1)}% (>100%). Periksa Ideal Cycle Time / Target per Jam SKU atau pencatatan waktu operasi.`
    : undefined;

  const stopLogs = input.stopLogs || [];
  const loggedIdlingMinutes = stopLogs
    .filter(s => s.category === 'IDLING_MINOR_STOPS')
    .reduce((sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0), 0);
  const iiotIdleMinutes = Math.max(0, Number(input.iiotIdleMinutes) || 0);
  const explicitIdlingTotal = round2(loggedIdlingMinutes + iiotIdleMinutes);

  const totalSpeedGapMinutes = round2(Math.max(0, operatingTimeMinutes - idealOperatingMinutes));
  const idlingMinorStopsMinutes = round2(Math.min(totalSpeedGapMinutes, explicitIdlingTotal));
  const reducedSpeedMinutes = round2(Math.max(0, totalSpeedGapMinutes - idlingMinorStopsMinutes));

  const expectedStandardCartons =
    idealCycleTimeMinutes > 0 ? operatingTimeMinutes / idealCycleTimeMinutes : 0;
  const speedDeficitCartons = round1(Math.max(0, expectedStandardCartons - totalOutputCartons));

  return {
    idealCycleTimeMinutes: round3(idealCycleTimeMinutes),
    idealOperatingMinutes,
    operatingTimeMinutes: round2(operatingTimeMinutes),
    idlingMinorStopsMinutes,
    reducedSpeedMinutes,
    speedDeficitCartons,
    rawPerformancePct,
    performancePct,
    isCycleTimeAnomaly,
    anomalyReason
  };
}

/**
 * Pilar 3 OEE: Quality
 * Menghubungkan Reject Logs (rejectAnalytics) & Material Variance vs Standar BOM (productionReconcile)
 * sehingga Process Defects (cacat proses) dan Reduced Yield (startup reject + over-variance bahan)
 * otomatis mengurangi skor Quality OEE.
 */
export function calculateQuality(input: QualityInput): QualityResult {
  const totalOutputCartons = Math.max(0, Number(input.totalOutputCartons) || 0);
  const kgPerCarton = Math.max(0, Number(input.standardBomKgPerCarton) || 0);
  const targetPerHour = Math.max(0, Number(input.targetPerHour) || 0);
  const idealCycleTimeMinutes = targetPerHour > 0 ? 60 / targetPerHour : 0;
  const rejectLogs = input.rejectLogs || [];
  const stopLogs = input.stopLogs || [];

  let loggedRejectKg = 0;
  let startupRejectKg = 0;

  for (const rej of rejectLogs) {
    const qtyKg = Math.max(0, Number(rej.rejectQtyKg) || 0);
    loggedRejectKg += qtyKg;
    if (rej.rejectCategory === 'SETTING_AWAL') {
      startupRejectKg += qtyKg;
    }
  }

  const materialVariance = reconcileMaterialBomVariance({
    actualCartons: totalOutputCartons,
    standardBomKgPerCarton: kgPerCarton,
    actualMaterialUsedKg: input.actualMaterialUsedKg,
    loggedRejectKg,
    startupRejectKg,
    tankScrapKg: input.tankScrapKg
  });

  const loggedProcessDefectStopMinutes = stopLogs
    .filter(s => s.category === 'PROCESS_DEFECTS')
    .reduce((sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0), 0);
  const loggedStartupStopMinutes = stopLogs
    .filter(s => s.category === 'STARTUP_REJECTS')
    .reduce((sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0), 0);

  const processDefectsMinutes = round2(
    loggedProcessDefectStopMinutes +
      materialVariance.processDefectsEquivalentCartons * idealCycleTimeMinutes
  );
  const reducedYieldMinutes = round2(
    loggedStartupStopMinutes +
      materialVariance.reducedYieldEquivalentCartons * idealCycleTimeMinutes
  );

  let goodOutputCartons = 0;
  let qualityPct = 100;

  if (totalOutputCartons > 0) {
    goodOutputCartons = round2(
      Math.max(0, totalOutputCartons - materialVariance.totalLossEquivalentCartons)
    );
    qualityPct = clampPct((goodOutputCartons / totalOutputCartons) * 100);
  } else if (
    materialVariance.totalScrapAndVarianceKg > 0 ||
    loggedProcessDefectStopMinutes > 0 ||
    loggedStartupStopMinutes > 0
  ) {
    goodOutputCartons = 0;
    qualityPct = 0;
  } else {
    goodOutputCartons = 0;
    qualityPct = 100;
  }

  return {
    goodOutputCartons,
    processDefectsMinutes,
    processDefectsLossKg: materialVariance.processDefectsLossKg,
    processDefectsEquivalentCartons: materialVariance.processDefectsEquivalentCartons,
    reducedYieldMinutes,
    reducedYieldLossKg: materialVariance.reducedYieldLossKg,
    reducedYieldEquivalentCartons: materialVariance.reducedYieldEquivalentCartons,
    materialVariance,
    qualityPct
  };
}

export function calculateCompositeOee(
  availabilityPct: number,
  performancePct: number,
  qualityPct: number
): number {
  const a = clampPct(availabilityPct) / 100;
  const p = clampPct(performancePct) / 100;
  const q = clampPct(qualityPct) / 100;
  return clampPct(a * p * q * 100);
}

const PARETO_META: {
  key: SixBigLossParetoKey;
  tpmNumber: number;
  category: SixBigLossCategory;
  label: string;
  pillar: 'AVAILABILITY' | 'PERFORMANCE' | 'QUALITY';
}[] = [
  {
    key: 'equipmentFailure',
    tpmNumber: 1,
    category: 'EQUIPMENT_FAILURE',
    label: 'Equipment Failure (Breakdown)',
    pillar: 'AVAILABILITY'
  },
  {
    key: 'setupAdjustment',
    tpmNumber: 2,
    category: 'SETUP_ADJUSTMENT',
    label: 'Setup & Changeover',
    pillar: 'AVAILABILITY'
  },
  {
    key: 'idlingMinorStops',
    tpmNumber: 3,
    category: 'IDLING_MINOR_STOPS',
    label: 'Idling & Minor Stops',
    pillar: 'PERFORMANCE'
  },
  {
    key: 'reducedSpeed',
    tpmNumber: 4,
    category: 'REDUCED_SPEED',
    label: 'Reduced Speed',
    pillar: 'PERFORMANCE'
  },
  {
    key: 'processDefects',
    tpmNumber: 5,
    category: 'PROCESS_DEFECTS',
    label: 'Process Defects (Reject)',
    pillar: 'QUALITY'
  },
  {
    key: 'reducedYield',
    tpmNumber: 6,
    category: 'STARTUP_REJECTS',
    label: 'Reduced Yield (Startup & Variance)',
    pillar: 'QUALITY'
  }
];

function finalizeParetoList(
  rawItems: Omit<SixBigLossParetoItem, 'rank' | 'contributionPct' | 'cumulativePct'>[]
): SixBigLossParetoItem[] {
  const sorted = [...rawItems].sort(
    (a, b) =>
      b.durationMinutes - a.durationMinutes ||
      b.equivalentLossKg - a.equivalentLossKg ||
      b.equivalentLossCartons - a.equivalentLossCartons ||
      a.tpmNumber - b.tpmNumber
  );

  const totalMinutes = sorted.reduce((s, i) => s + i.durationMinutes, 0);
  const totalKg = sorted.reduce((s, i) => s + i.equivalentLossKg, 0);
  const totalCartons = sorted.reduce((s, i) => s + i.equivalentLossCartons, 0);

  let runningPct = 0;
  return sorted.map((item, idx) => {
    const contributionPct =
      totalMinutes > 0
        ? round2((item.durationMinutes / totalMinutes) * 100)
        : totalKg > 0
        ? round2((item.equivalentLossKg / totalKg) * 100)
        : totalCartons > 0
        ? round2((item.equivalentLossCartons / totalCartons) * 100)
        : 0;
    runningPct = Math.min(100, round2(runningPct + contributionPct));
    return {
      ...item,
      rank: idx + 1,
      contributionPct,
      cumulativePct: runningPct
    };
  });
}

/**
 * Menyusun Six Big Losses Breakdown menjadi Pareto terurut menurun
 * lengkap dengan durasi (menit), ekuivalen kehilangan output (kg & karton), dan % kontribusi.
 */
export function buildSixBigLossesPareto(
  breakdown: SixBigLossesBreakdown,
  options?: { targetPerHour?: number; standardBomKgPerCarton?: number }
): SixBigLossParetoItem[] {
  const targetPerHour = Math.max(0, Number(options?.targetPerHour) || 0);
  const kgPerCarton = Math.max(0, Number(options?.standardBomKgPerCarton) || 0);

  const items = PARETO_META.map(meta => {
    const bucket = breakdown[meta.key];
    const durationMinutes = round2(Math.max(0, Number(bucket?.minutes) || 0));
    const equivalentLossKg = round3(Math.max(0, Number(bucket?.lossKg) || 0));

    let equivalentLossCartons = 0;
    if (meta.pillar === 'QUALITY') {
      equivalentLossCartons =
        kgPerCarton > 0
          ? round2(equivalentLossKg / kgPerCarton)
          : targetPerHour > 0
          ? round2((durationMinutes / 60) * targetPerHour)
          : 0;
    } else {
      equivalentLossCartons =
        targetPerHour > 0
          ? round2((durationMinutes / 60) * targetPerHour)
          : kgPerCarton > 0
          ? round2(equivalentLossKg / kgPerCarton)
          : 0;
    }

    return {
      tpmNumber: meta.tpmNumber,
      key: meta.key,
      category: meta.category,
      label: meta.label,
      pillar: meta.pillar,
      durationMinutes,
      equivalentLossKg,
      equivalentLossCartons
    };
  });

  return finalizeParetoList(items);
}

function getAllRuns(state: AppState): ActiveSkuProductionRun[] {
  if (state.activeSkuRuns && state.activeSkuRuns.length > 0) {
    return state.activeSkuRuns;
  }
  return state.activeSkuRun ? [state.activeSkuRun] : [];
}

function matchesLine(
  targetLineId: string,
  targetLineName: string | undefined,
  candidateLineId?: string,
  candidateLineName?: string
): boolean {
  if (candidateLineId && candidateLineId === targetLineId) return true;
  if (
    targetLineName &&
    candidateLineName &&
    candidateLineName.trim().toLowerCase() === targetLineName.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

function collectRelatedMachineIdsForLine(
  state: AppState,
  lineId: string,
  lineName: string | undefined,
  skuId: string | undefined
): Set<string> {
  const machineIds = new Set<string>();
  const normalizedLineName = (lineName || '').trim().toLowerCase();

  for (const m of state.master.machines || []) {
    const mLine = (m.line || '').trim().toLowerCase();
    if (m.line === lineId || (normalizedLineName && mLine === normalizedLineName)) {
      machineIds.add(m.id);
    }
  }

  for (const t of state.master.tanks || []) {
    if ((t.assignedLineIds || []).includes(lineId)) {
      for (const sm of t.sourceMachineIds || []) machineIds.add(sm);
      for (const am of t.assignedMachineIds || []) machineIds.add(am);
      if (t.assignedMachineId) machineIds.add(t.assignedMachineId);
    }
  }

  if (skuId) {
    const wipIds = new Set(
      (state.master.skuWips || []).filter(sw => sw.skuId === skuId).map(sw => sw.wipId)
    );
    for (const w of state.master.wips || []) {
      if (wipIds.has(w.id)) {
        if (w.assignedMachineId) machineIds.add(w.assignedMachineId);
        for (const am of w.assignedMachineIds || []) machineIds.add(am);
      }
    }
  }

  return machineIds;
}

export function calculateLineShiftOee(params: {
  state: AppState;
  lineId: string;
  dateStr: string;
  shift: ShiftNumber;
  skuId?: string;
  nowMs?: number;
  plannedShiftMinutes?: number;
  targetOeePct?: number;
  iiotEvents?: IiotTelemetryEventDoc[];
}): LineShiftOeeResult {
  const { state, lineId, dateStr, shift } = params;
  const nowMs = params.nowMs ?? Date.now();
  const targetOeePct = clampPct(params.targetOeePct ?? DEFAULT_TARGET_OEE_PCT);
  const line = (state.master.productionLines || []).find(l => l.id === lineId);
  const lineName = line?.name || lineId;
  const shiftId = `${dateStr}-S${shift}`;

  const runs = getAllRuns(state);
  const matchesSkuFilter = (candidateSkuId?: string) =>
    !params.skuId || candidateSkuId === params.skuId;

  const activeRun =
    runs.find(
      r =>
        r.isRunning &&
        r.startedAt.slice(0, 10) === dateStr &&
        r.shift === shift &&
        matchesSkuFilter(r.skuId) &&
        matchesLine(lineId, line?.name, r.lineId, r.lineName)
    ) || null;

  const lineShiftRuns = runs
    .filter(
      r =>
        r.startedAt.slice(0, 10) === dateStr &&
        r.shift === shift &&
        matchesSkuFilter(r.skuId) &&
        matchesLine(lineId, line?.name, r.lineId, r.lineName)
    )
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));

  const latestRun =
    activeRun ||
    lineShiftRuns[0] ||
    runs.find(
      r => matchesSkuFilter(r.skuId) && matchesLine(lineId, line?.name, r.lineId, r.lineName)
    ) ||
    null;

  const lineCartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    if (cp.timestamp.slice(0, 10) !== dateStr) return false;
    const cpShift = cp.shift || getShiftFromTime(cp.timestamp).shift;
    if (cpShift !== shift) return false;
    if (!matchesSkuFilter(cp.skuId)) return false;
    if (cp.lineId || cp.lineName) {
      return matchesLine(lineId, line?.name, cp.lineId, cp.lineName);
    }
    return Boolean(latestRun && cp.skuId === latestRun.skuId);
  });

  const resolvedSkuId = params.skuId || latestRun?.skuId || lineCartonLogs[0]?.skuId || '';
  const sku = state.master.skus.find(s => s.id === resolvedSkuId);
  const skuCode =
    (latestRun?.skuId === resolvedSkuId ? latestRun?.skuCode : undefined) ||
    sku?.code ||
    lineCartonLogs[0]?.skuCode ||
    '-';
  const skuName =
    (latestRun?.skuId === resolvedSkuId ? latestRun?.skuName : undefined) ||
    sku?.name ||
    lineCartonLogs[0]?.skuName ||
    '-';
  const targetPerHour =
    (latestRun?.skuId === resolvedSkuId ? latestRun?.targetPerHour : undefined) ||
    sku?.targetHour ||
    500;

  const loggedCartons = lineCartonLogs.reduce((s, cp) => s + (cp.cartonsProduced || 0), 0);
  const runCartons =
    latestRun &&
    latestRun.skuId === resolvedSkuId &&
    latestRun.startedAt.slice(0, 10) === dateStr &&
    latestRun.shift === shift
      ? latestRun.cartonsProducedTotal || 0
      : 0;
  const totalOutputCartons = Math.max(loggedCartons, runCartons);

  const lineStopLogs = (state.transactions.productionStops || []).filter(stop => {
    if (stop.stoppedAt.slice(0, 10) !== dateStr) return false;
    const sShift = stop.shift || getShiftFromTime(stop.stoppedAt).shift;
    if (sShift !== shift) return false;
    if (params.skuId && stop.skuId !== params.skuId) return false;
    if (stop.lineId || stop.lineName) {
      return matchesLine(lineId, line?.name, stop.lineId, stop.lineName);
    }
    return Boolean(resolvedSkuId && stop.skuId === resolvedSkuId);
  });

  const relatedMachineIds = collectRelatedMachineIdsForLine(
    state,
    lineId,
    line?.name,
    resolvedSkuId || undefined
  );

  const lineChangeovers = (state.transactions.changeovers || []).filter(co => {
    const coTime = co.completedAt || co.timestamp || co.startedAt;
    if (!coTime || coTime.slice(0, 10) !== dateStr) return false;
    const coShift = getShiftFromTime(coTime).shift;
    if (coShift !== shift) return false;
    return relatedMachineIds.has(co.machineId);
  });

  const linkedWipIds = new Set(
    resolvedSkuId
      ? (state.master.skuWips || []).filter(sw => sw.skuId === resolvedSkuId).map(sw => sw.wipId)
      : []
  );

  const lineWipPauseLogs: WipBatchPauseLog[] = [];
  for (const batch of state.transactions.wipBatches || []) {
    const matchesTarget =
      (resolvedSkuId && batch.skuId === resolvedSkuId) ||
      linkedWipIds.has(batch.wipId) ||
      (batch.targetMachineId ? relatedMachineIds.has(batch.targetMachineId) : false);
    if (!matchesTarget) continue;

    for (const p of batch.pauseLogs || []) {
      const pTime = p.resumedAt || p.pausedAt;
      if (!pTime || pTime.slice(0, 10) !== dateStr) continue;
      const pShift = getShiftFromTime(pTime).shift;
      if (pShift !== shift) continue;
      lineWipPauseLogs.push(p);
    }
  }

  const lineIiotEvents = (params.iiotEvents || []).filter(ev => {
    if (ev.recordedAt.slice(0, 10) !== dateStr) return false;
    if (getShiftFromTime(ev.recordedAt).shift !== shift) return false;
    return ev.lineId === lineId || (ev.machineId ? relatedMachineIds.has(ev.machineId) : false);
  });

  const iiotIdleMinutes = lineIiotEvents.reduce(
    (s, ev) => s + (ev.status === 'IDLE' ? Math.max(0, ev.idleMinutes || 0) : 0),
    0
  );
  const iiotFaultStopMinutes = lineIiotEvents.reduce(
    (s, ev) =>
      s + (ev.status === 'FAULT' || ev.status === 'STOP' ? Math.max(0, ev.idleMinutes || 0) : 0),
    0
  );
  const iiotPulseOutput = lineIiotEvents.reduce(
    (s, ev) => s + Math.max(0, Number(ev.pulseCount) || 0),
    0
  );
  const effectiveOutputCartons = Math.max(totalOutputCartons, iiotPulseOutput);

  const scheduledShiftMinutes =
    params.plannedShiftMinutes ??
    (latestRun?.plannedCartons && targetPerHour > 0
      ? Math.max(60, round2((latestRun.plannedCartons / targetPerHour) * 60))
      : 480);

  const availabilityDetail = calculateAvailability(
    {
      scheduledShiftMinutes,
      stopLogs: lineStopLogs,
      changeoverRecords: lineChangeovers,
      wipBatchPauseLogs: lineWipPauseLogs,
      iiotFaultStopMinutes
    },
    nowMs
  );

  const performanceDetail = calculatePerformance({
    operatingTimeMinutes: availabilityDetail.operatingTimeMinutes,
    totalOutputCartons: effectiveOutputCartons,
    targetPerHour,
    stopLogs: lineStopLogs,
    iiotIdleMinutes
  });

  const skuBomMaterials = resolvedSkuId ? getMaterialsForSkuBom(state, resolvedSkuId) : [];
  const totalBomKgPerCarton = skuBomMaterials.reduce((s, m) => s + m.kgPerCartonSku, 0);
  const standardBomKgPerCarton =
    totalBomKgPerCarton > 0 ? totalBomKgPerCarton : sku?.cartonWeightKg || 0;

  const lineRejectLogs = (state.transactions.rejectLogs || []).filter(rej => {
    if (rej.date !== dateStr || rej.shift !== shift) return false;
    if (rej.stationType === 'LINE') {
      return matchesLine(lineId, line?.name, rej.lineId, rej.lineName);
    }
    return Boolean(rej.machineId && relatedMachineIds.has(rej.machineId) && (!rej.skuId || rej.skuId === resolvedSkuId));
  });

  // Check explicit material usages & tank WIP scrap recorded for this SKU/shift
  const shiftSkuUsages = (state.transactions.usages || []).filter(u => {
    if (u.date !== dateStr) return false;
    if ((u.shift || shift) !== shift) return false;
    return Boolean(resolvedSkuId && u.skuId === resolvedSkuId);
  });
  const actualUsageKg = shiftSkuUsages.reduce((s, u) => s + (u.usageQty || 0), 0);

  const linkedTankIds = new Set(
    (state.master.tanks || [])
      .filter(
        t =>
          (t.assignedLineIds || []).includes(lineId) ||
          (t.assignedWipId ? linkedWipIds.has(t.assignedWipId) : false)
      )
      .map(t => t.id)
  );
  const tankScrapKg = (state.transactions.tankLogs || [])
    .filter(tl => {
      if (tl.type !== 'CALIBRATION' || (tl.amountKg || 0) >= 0) return false;
      if (tl.timestamp.slice(0, 10) !== dateStr) return false;
      if (getShiftFromTime(tl.timestamp).shift !== shift) return false;
      return linkedTankIds.has(tl.tankId) || (tl.wipId ? linkedWipIds.has(tl.wipId) : false);
    })
    .reduce((sum, tl) => sum + Math.abs(tl.amountKg || 0), 0);

  const qualityDetail = calculateQuality({
    totalOutputCartons: effectiveOutputCartons,
    standardBomKgPerCarton,
    targetPerHour,
    rejectLogs: lineRejectLogs,
    stopLogs: lineStopLogs,
    actualMaterialUsedKg: shiftSkuUsages.length > 0 ? actualUsageKg : undefined,
    tankScrapKg
  });

  const oeeScore = calculateCompositeOee(
    availabilityDetail.availabilityPct,
    performanceDetail.performancePct,
    qualityDetail.qualityPct
  );
  const oeeTargetVariancePct = round2(oeeScore - targetOeePct);

  const shortageStopMinutes = lineStopLogs
    .filter(s => s.category === 'MATERIAL_SHORTAGE')
    .reduce((sum, s) => sum + Math.max(0, Number(s.durationMinutes) || 0), 0);

  const equipmentFailureMinutes = round2(
    Math.max(0, availabilityDetail.breakdownMinutes - shortageStopMinutes) + shortageStopMinutes
  );

  const sixBigLossesBreakdown: SixBigLossesBreakdown = {
    equipmentFailure: {
      minutes: equipmentFailureMinutes,
      lossKg: round3(
        targetPerHour > 0 && standardBomKgPerCarton > 0
          ? (equipmentFailureMinutes / 60) * targetPerHour * standardBomKgPerCarton
          : 0
      )
    },
    setupAdjustment: {
      minutes: availabilityDetail.changeoverMinutes,
      lossKg: round3(
        targetPerHour > 0 && standardBomKgPerCarton > 0
          ? (availabilityDetail.changeoverMinutes / 60) * targetPerHour * standardBomKgPerCarton
          : 0
      )
    },
    idlingMinorStops: {
      minutes: performanceDetail.idlingMinorStopsMinutes,
      lossKg: round3(
        targetPerHour > 0 && standardBomKgPerCarton > 0
          ? (performanceDetail.idlingMinorStopsMinutes / 60) * targetPerHour * standardBomKgPerCarton
          : 0
      )
    },
    reducedSpeed: {
      minutes: performanceDetail.reducedSpeedMinutes,
      lossKg: round3(
        targetPerHour > 0 && standardBomKgPerCarton > 0
          ? (performanceDetail.reducedSpeedMinutes / 60) * targetPerHour * standardBomKgPerCarton
          : 0
      )
    },
    processDefects: {
      minutes: qualityDetail.processDefectsMinutes,
      lossKg: qualityDetail.processDefectsLossKg
    },
    reducedYield: {
      minutes: qualityDetail.reducedYieldMinutes,
      lossKg: qualityDetail.reducedYieldLossKg
    }
  };

  const sixBigLossesPareto = buildSixBigLossesPareto(sixBigLossesBreakdown, {
    targetPerHour,
    standardBomKgPerCarton
  });

  const snapshotId = `${shiftId}_${lineId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  const snapshot: ShiftOeeSnapshotDoc = {
    id: snapshotId,
    workspaceId: state.cloudWorkspaceId || 'main',
    shiftId,
    date: dateStr,
    shift,
    lineId,
    lineName,
    skuCode,
    availability: availabilityDetail.availabilityPct,
    performance: performanceDetail.performancePct,
    quality: qualityDetail.qualityPct,
    oeeScore,
    sixBigLossesBreakdown,
    materialVariancePct: qualityDetail.materialVariance.materialVariancePct,
    plannedProductionTimeMinutes: availabilityDetail.plannedProductionTimeMinutes,
    operatingTimeMinutes: availabilityDetail.operatingTimeMinutes,
    totalOutputCartons: effectiveOutputCartons,
    goodOutputCartons: qualityDetail.goodOutputCartons,
    standardBomMaterialKg: qualityDetail.materialVariance.standardBomMaterialKg,
    actualMaterialUsedKg: qualityDetail.materialVariance.totalActualMaterialKg
  };

  return {
    lineId,
    lineName,
    shiftId,
    date: dateStr,
    shift,
    skuId: resolvedSkuId,
    skuCode,
    skuName,
    targetPerHour,
    standardBomKgPerCarton: round3(standardBomKgPerCarton),
    totalOutputCartons: effectiveOutputCartons,
    goodOutputCartons: qualityDetail.goodOutputCartons,
    availability: availabilityDetail.availabilityPct,
    performance: performanceDetail.performancePct,
    quality: qualityDetail.qualityPct,
    oeeScore,
    targetOeePct,
    oeeTargetVariancePct,
    materialVariancePct: qualityDetail.materialVariance.materialVariancePct,
    availabilityDetail,
    performanceDetail,
    qualityDetail,
    sixBigLossesBreakdown,
    sixBigLossesPareto,
    snapshot
  };
}

export interface ShiftAllLinesOeeSummary {
  shiftId: string;
  date: string;
  shift: ShiftNumber;
  lineResults: LineShiftOeeResult[];
  availability: number;
  performance: number;
  quality: number;
  oeeScore: number;
  targetOeePct: number;
  oeeTargetVariancePct: number;
  materialVariancePct: number;
  totalOutputCartons: number;
  goodOutputCartons: number;
  hasCycleTimeAnomaly: boolean;
  sixBigLossesBreakdown: SixBigLossesBreakdown;
  sixBigLossesPareto: SixBigLossParetoItem[];
}

export function calculateShiftAllLinesOee(
  state: AppState,
  dateStr: string,
  shift: ShiftNumber,
  nowMs = Date.now(),
  plannedShiftMinutes?: number,
  iiotEvents?: IiotTelemetryEventDoc[],
  targetOeePct = DEFAULT_TARGET_OEE_PCT
): ShiftAllLinesOeeSummary {
  const effectiveTargetOee = clampPct(targetOeePct);
  const lines = (state.master.productionLines || []).filter(l => l.isActive !== false);
  const lineResults = lines.map(l =>
    calculateLineShiftOee({
      state,
      lineId: l.id,
      dateStr,
      shift,
      nowMs,
      plannedShiftMinutes,
      targetOeePct: effectiveTargetOee,
      iiotEvents
    })
  );

  const sumPlanned = lineResults.reduce(
    (s, r) => s + r.availabilityDetail.plannedProductionTimeMinutes,
    0
  );
  const sumOperating = lineResults.reduce(
    (s, r) => s + r.availabilityDetail.operatingTimeMinutes,
    0
  );
  const sumIdealOperating = lineResults.reduce(
    (s, r) => s + r.performanceDetail.idealOperatingMinutes,
    0
  );
  const totalOutputCartons = lineResults.reduce((s, r) => s + r.totalOutputCartons, 0);
  const goodOutputCartons = round2(lineResults.reduce((s, r) => s + r.goodOutputCartons, 0));

  const availability = sumPlanned > 0 ? clampPct((sumOperating / sumPlanned) * 100) : 0;
  const performance = sumOperating > 0 ? clampPct((sumIdealOperating / sumOperating) * 100) : 0;
  const quality =
    totalOutputCartons > 0
      ? clampPct((goodOutputCartons / totalOutputCartons) * 100)
      : lineResults.some(r => r.quality < 100)
      ? 0
      : 100;
  const oeeScore = calculateCompositeOee(availability, performance, quality);
  const oeeTargetVariancePct = round2(oeeScore - effectiveTargetOee);
  const hasCycleTimeAnomaly = lineResults.some(r => r.performanceDetail.isCycleTimeAnomaly);

  const sumStdBom = lineResults.reduce(
    (s, r) => s + r.qualityDetail.materialVariance.standardBomMaterialKg,
    0
  );
  const sumActualBom = lineResults.reduce(
    (s, r) => s + r.qualityDetail.materialVariance.totalActualMaterialKg,
    0
  );
  const materialVariancePct =
    sumStdBom > 0
      ? round2(((sumActualBom - sumStdBom) / sumStdBom) * 100)
      : sumActualBom > 0
      ? 100
      : 0;

  const emptyBucket = (): SixBigLossBucket => ({ minutes: 0, lossKg: 0 });
  const sixBigLossesBreakdown: SixBigLossesBreakdown = {
    equipmentFailure: emptyBucket(),
    setupAdjustment: emptyBucket(),
    idlingMinorStops: emptyBucket(),
    reducedSpeed: emptyBucket(),
    processDefects: emptyBucket(),
    reducedYield: emptyBucket()
  };

  const cartonLossByKey: Record<SixBigLossParetoKey, number> = {
    equipmentFailure: 0,
    setupAdjustment: 0,
    idlingMinorStops: 0,
    reducedSpeed: 0,
    processDefects: 0,
    reducedYield: 0
  };

  for (const r of lineResults) {
    (Object.keys(sixBigLossesBreakdown) as SixBigLossParetoKey[]).forEach(key => {
      sixBigLossesBreakdown[key].minutes = round2(
        sixBigLossesBreakdown[key].minutes + r.sixBigLossesBreakdown[key].minutes
      );
      sixBigLossesBreakdown[key].lossKg = round3(
        sixBigLossesBreakdown[key].lossKg + r.sixBigLossesBreakdown[key].lossKg
      );
    });
    for (const pItem of r.sixBigLossesPareto) {
      cartonLossByKey[pItem.key] = round2(cartonLossByKey[pItem.key] + pItem.equivalentLossCartons);
    }
  }

  const sixBigLossesPareto = finalizeParetoList(
    PARETO_META.map(meta => ({
      tpmNumber: meta.tpmNumber,
      key: meta.key,
      category: meta.category,
      label: meta.label,
      pillar: meta.pillar,
      durationMinutes: sixBigLossesBreakdown[meta.key].minutes,
      equivalentLossKg: sixBigLossesBreakdown[meta.key].lossKg,
      equivalentLossCartons: cartonLossByKey[meta.key]
    }))
  );

  return {
    shiftId: `${dateStr}-S${shift}`,
    date: dateStr,
    shift,
    lineResults,
    availability,
    performance,
    quality,
    oeeScore,
    targetOeePct: effectiveTargetOee,
    oeeTargetVariancePct,
    materialVariancePct,
    totalOutputCartons,
    goodOutputCartons,
    hasCycleTimeAnomaly,
    sixBigLossesBreakdown,
    sixBigLossesPareto
  };
}

/**
 * Menghitung OEE spesifik per SKU pada Shift tertentu (baik pada 1 line tertentu maupun agregasi line terkait).
 */
export function calculateSkuShiftOee(params: {
  state: AppState;
  skuId: string;
  dateStr: string;
  shift: ShiftNumber;
  lineId?: string;
  nowMs?: number;
  plannedShiftMinutes?: number;
  targetOeePct?: number;
  iiotEvents?: IiotTelemetryEventDoc[];
}): LineShiftOeeResult | null {
  const { state, skuId, dateStr, shift } = params;
  const targetLineId =
    params.lineId ||
    getAllRuns(state).find(
      r => r.skuId === skuId && r.startedAt.slice(0, 10) === dateStr && r.shift === shift
    )?.lineId ||
    (state.transactions.cartonProductions || []).find(
      cp =>
        cp.skuId === skuId &&
        cp.timestamp.slice(0, 10) === dateStr &&
        (cp.shift || getShiftFromTime(cp.timestamp).shift) === shift
    )?.lineId ||
    (state.master.productionLines || []).find(l => l.isActive !== false)?.id;

  if (!targetLineId) return null;

  return calculateLineShiftOee({
    state,
    lineId: targetLineId,
    skuId,
    dateStr,
    shift,
    nowMs: params.nowMs,
    plannedShiftMinutes: params.plannedShiftMinutes,
    targetOeePct: params.targetOeePct,
    iiotEvents: params.iiotEvents
  });
}

export interface ScopedOeeAnalytics {
  dateStr: string;
  shiftScope: 'ALL' | ShiftNumber;
  lineId: string;
  lineName: string;
  availability: number;
  performance: number;
  quality: number;
  oeeScore: number;
  targetOeePct: number;
  oeeTargetVariancePct: number;
  availabilityTargetPct: number;
  performanceTargetPct: number;
  qualityTargetPct: number;
  materialVariancePct: number;
  totalOutputCartons: number;
  goodOutputCartons: number;
  plannedProductionTimeMinutes: number;
  operatingTimeMinutes: number;
  hasCycleTimeAnomaly: boolean;
  anomalyReason?: string;
  sixBigLossesBreakdown: SixBigLossesBreakdown;
  sixBigLossesPareto: SixBigLossParetoItem[];
  lineResults: LineShiftOeeResult[];
  activeShiftCount: number;
}

export const DEFAULT_TARGET_AVAILABILITY_PCT = 90;
export const DEFAULT_TARGET_PERFORMANCE_PCT = 95;
export const DEFAULT_TARGET_QUALITY_PCT = 99;

function hasShiftActivity(state: AppState, dateStr: string, shift: ShiftNumber, lineId?: string): boolean {
  const runs = getAllRuns(state);
  const matchLine = (rLineId?: string, rLineName?: string) => {
    if (!lineId || lineId === 'ALL') return true;
    const lineObj = (state.master.productionLines || []).find(l => l.id === lineId);
    return matchesLine(lineId, lineObj?.name, rLineId, rLineName);
  };

  if (
    runs.some(
      r =>
        r.startedAt.slice(0, 10) === dateStr &&
        r.shift === shift &&
        matchLine(r.lineId, r.lineName)
    )
  ) {
    return true;
  }

  if (
    (state.transactions.cartonProductions || []).some(
      cp =>
        cp.timestamp.slice(0, 10) === dateStr &&
        (cp.shift || getShiftFromTime(cp.timestamp).shift) === shift &&
        (!cp.lineId || matchLine(cp.lineId, cp.lineName))
    )
  ) {
    return true;
  }

  if (
    (state.transactions.productionStops || []).some(
      s =>
        s.stoppedAt.slice(0, 10) === dateStr &&
        (s.shift || getShiftFromTime(s.stoppedAt).shift) === shift &&
        (!s.lineId || matchLine(s.lineId, s.lineName))
    )
  ) {
    return true;
  }

  if (
    (state.transactions.rejectLogs || []).some(
      rej =>
        rej.date === dateStr &&
        rej.shift === shift &&
        (rej.stationType !== 'LINE' || matchLine(rej.lineId, rej.lineName))
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Mengagregasi analitik OEE & Six Big Losses untuk cakupan Shift tertentu atau Semua Shift (24 Jam),
 * serta Semua Line atau 1 Line Produksi spesifik.
 */
export function calculateMultiShiftOee(params: {
  state: AppState;
  dateStr: string;
  shiftScope: 'ALL' | ShiftNumber;
  activeShiftFallback?: ShiftNumber;
  lineId?: string; // 'ALL' atau ID line spesifik
  nowMs?: number;
  targetOeePct?: number;
  iiotEvents?: IiotTelemetryEventDoc[];
}): ScopedOeeAnalytics {
  const { state, dateStr, shiftScope } = params;
  const lineId = params.lineId || 'ALL';
  const nowMs = params.nowMs ?? Date.now();
  const effectiveTargetOee = clampPct(params.targetOeePct ?? DEFAULT_TARGET_OEE_PCT);
  const lineObj =
    lineId !== 'ALL'
      ? (state.master.productionLines || []).find(l => l.id === lineId)
      : undefined;
  const lineName = lineObj?.name || (lineId === 'ALL' ? 'Semua Line Produksi' : lineId);

  const shiftsToAggregate: ShiftNumber[] =
    shiftScope === 'ALL'
      ? (() => {
          const active = ([1, 2, 3] as ShiftNumber[]).filter(s =>
            hasShiftActivity(state, dateStr, s, lineId)
          );
          if (active.length > 0) return active;
          return [params.activeShiftFallback ?? 1];
        })()
      : [shiftScope];

  if (shiftsToAggregate.length === 1) {
    const singleShift = shiftsToAggregate[0];
    if (lineId !== 'ALL') {
      const res = calculateLineShiftOee({
        state,
        lineId,
        dateStr,
        shift: singleShift,
        nowMs,
        targetOeePct: effectiveTargetOee,
        iiotEvents: params.iiotEvents
      });
      return {
        dateStr,
        shiftScope,
        lineId,
        lineName: res.lineName,
        availability: res.availability,
        performance: res.performance,
        quality: res.quality,
        oeeScore: res.oeeScore,
        targetOeePct: res.targetOeePct,
        oeeTargetVariancePct: res.oeeTargetVariancePct,
        availabilityTargetPct: DEFAULT_TARGET_AVAILABILITY_PCT,
        performanceTargetPct: DEFAULT_TARGET_PERFORMANCE_PCT,
        qualityTargetPct: DEFAULT_TARGET_QUALITY_PCT,
        materialVariancePct: res.materialVariancePct,
        totalOutputCartons: res.totalOutputCartons,
        goodOutputCartons: res.goodOutputCartons,
        plannedProductionTimeMinutes: res.availabilityDetail.plannedProductionTimeMinutes,
        operatingTimeMinutes: res.availabilityDetail.operatingTimeMinutes,
        hasCycleTimeAnomaly: res.performanceDetail.isCycleTimeAnomaly,
        anomalyReason: res.performanceDetail.anomalyReason,
        sixBigLossesBreakdown: res.sixBigLossesBreakdown,
        sixBigLossesPareto: res.sixBigLossesPareto,
        lineResults: [res],
        activeShiftCount: 1
      };
    }

    const summary = calculateShiftAllLinesOee(
      state,
      dateStr,
      singleShift,
      nowMs,
      undefined,
      params.iiotEvents,
      effectiveTargetOee
    );
    const sumPlanned = summary.lineResults.reduce(
      (s, r) => s + r.availabilityDetail.plannedProductionTimeMinutes,
      0
    );
    const sumOperating = summary.lineResults.reduce(
      (s, r) => s + r.availabilityDetail.operatingTimeMinutes,
      0
    );
    const anomalyLine = summary.lineResults.find(r => r.performanceDetail.isCycleTimeAnomaly);

    return {
      dateStr,
      shiftScope,
      lineId: 'ALL',
      lineName: 'Semua Line Produksi',
      availability: summary.availability,
      performance: summary.performance,
      quality: summary.quality,
      oeeScore: summary.oeeScore,
      targetOeePct: summary.targetOeePct,
      oeeTargetVariancePct: summary.oeeTargetVariancePct,
      availabilityTargetPct: DEFAULT_TARGET_AVAILABILITY_PCT,
      performanceTargetPct: DEFAULT_TARGET_PERFORMANCE_PCT,
      qualityTargetPct: DEFAULT_TARGET_QUALITY_PCT,
      materialVariancePct: summary.materialVariancePct,
      totalOutputCartons: summary.totalOutputCartons,
      goodOutputCartons: summary.goodOutputCartons,
      plannedProductionTimeMinutes: round2(sumPlanned),
      operatingTimeMinutes: round2(sumOperating),
      hasCycleTimeAnomaly: summary.hasCycleTimeAnomaly,
      anomalyReason: anomalyLine?.performanceDetail.anomalyReason,
      sixBigLossesBreakdown: summary.sixBigLossesBreakdown,
      sixBigLossesPareto: summary.sixBigLossesPareto,
      lineResults: summary.lineResults,
      activeShiftCount: 1
    };
  }

  // Multi-shift aggregation (Semua Shift / 24 Jam)
  const collectedLineResults: LineShiftOeeResult[] = [];
  for (const sNum of shiftsToAggregate) {
    if (lineId !== 'ALL') {
      collectedLineResults.push(
        calculateLineShiftOee({
          state,
          lineId,
          dateStr,
          shift: sNum,
          nowMs,
          targetOeePct: effectiveTargetOee,
          iiotEvents: params.iiotEvents
        })
      );
    } else {
      const sSummary = calculateShiftAllLinesOee(
        state,
        dateStr,
        sNum,
        nowMs,
        undefined,
        params.iiotEvents,
        effectiveTargetOee
      );
      collectedLineResults.push(...sSummary.lineResults);
    }
  }

  const sumPlanned = collectedLineResults.reduce(
    (s, r) => s + r.availabilityDetail.plannedProductionTimeMinutes,
    0
  );
  const sumOperating = collectedLineResults.reduce(
    (s, r) => s + r.availabilityDetail.operatingTimeMinutes,
    0
  );
  const sumIdealOperating = collectedLineResults.reduce(
    (s, r) => s + r.performanceDetail.idealOperatingMinutes,
    0
  );
  const totalOutputCartons = collectedLineResults.reduce((s, r) => s + r.totalOutputCartons, 0);
  const goodOutputCartons = round2(collectedLineResults.reduce((s, r) => s + r.goodOutputCartons, 0));

  const availability = sumPlanned > 0 ? clampPct((sumOperating / sumPlanned) * 100) : 0;
  const performance = sumOperating > 0 ? clampPct((sumIdealOperating / sumOperating) * 100) : 0;
  const quality =
    totalOutputCartons > 0
      ? clampPct((goodOutputCartons / totalOutputCartons) * 100)
      : collectedLineResults.some(r => r.quality < 100)
      ? 0
      : 100;
  const oeeScore = calculateCompositeOee(availability, performance, quality);
  const oeeTargetVariancePct = round2(oeeScore - effectiveTargetOee);
  const anomalyLine = collectedLineResults.find(r => r.performanceDetail.isCycleTimeAnomaly);

  const sumStdBom = collectedLineResults.reduce(
    (s, r) => s + r.qualityDetail.materialVariance.standardBomMaterialKg,
    0
  );
  const sumActualBom = collectedLineResults.reduce(
    (s, r) => s + r.qualityDetail.materialVariance.totalActualMaterialKg,
    0
  );
  const materialVariancePct =
    sumStdBom > 0
      ? round2(((sumActualBom - sumStdBom) / sumStdBom) * 100)
      : sumActualBom > 0
      ? 100
      : 0;

  const emptyBucket = (): SixBigLossBucket => ({ minutes: 0, lossKg: 0 });
  const sixBigLossesBreakdown: SixBigLossesBreakdown = {
    equipmentFailure: emptyBucket(),
    setupAdjustment: emptyBucket(),
    idlingMinorStops: emptyBucket(),
    reducedSpeed: emptyBucket(),
    processDefects: emptyBucket(),
    reducedYield: emptyBucket()
  };

  const cartonLossByKey: Record<SixBigLossParetoKey, number> = {
    equipmentFailure: 0,
    setupAdjustment: 0,
    idlingMinorStops: 0,
    reducedSpeed: 0,
    processDefects: 0,
    reducedYield: 0
  };

  for (const r of collectedLineResults) {
    (Object.keys(sixBigLossesBreakdown) as SixBigLossParetoKey[]).forEach(key => {
      sixBigLossesBreakdown[key].minutes = round2(
        sixBigLossesBreakdown[key].minutes + r.sixBigLossesBreakdown[key].minutes
      );
      sixBigLossesBreakdown[key].lossKg = round3(
        sixBigLossesBreakdown[key].lossKg + r.sixBigLossesBreakdown[key].lossKg
      );
    });
    for (const pItem of r.sixBigLossesPareto) {
      cartonLossByKey[pItem.key] = round2(cartonLossByKey[pItem.key] + pItem.equivalentLossCartons);
    }
  }

  const sixBigLossesPareto = finalizeParetoList(
    PARETO_META.map(meta => ({
      tpmNumber: meta.tpmNumber,
      key: meta.key,
      category: meta.category,
      label: meta.label,
      pillar: meta.pillar,
      durationMinutes: sixBigLossesBreakdown[meta.key].minutes,
      equivalentLossKg: sixBigLossesBreakdown[meta.key].lossKg,
      equivalentLossCartons: cartonLossByKey[meta.key]
    }))
  );

  return {
    dateStr,
    shiftScope,
    lineId,
    lineName,
    availability,
    performance,
    quality,
    oeeScore,
    targetOeePct: effectiveTargetOee,
    oeeTargetVariancePct,
    availabilityTargetPct: DEFAULT_TARGET_AVAILABILITY_PCT,
    performanceTargetPct: DEFAULT_TARGET_PERFORMANCE_PCT,
    qualityTargetPct: DEFAULT_TARGET_QUALITY_PCT,
    materialVariancePct,
    totalOutputCartons,
    goodOutputCartons,
    plannedProductionTimeMinutes: round2(sumPlanned),
    operatingTimeMinutes: round2(sumOperating),
    hasCycleTimeAnomaly: Boolean(anomalyLine),
    anomalyReason: anomalyLine?.performanceDetail.anomalyReason,
    sixBigLossesBreakdown,
    sixBigLossesPareto,
    lineResults: collectedLineResults,
    activeShiftCount: shiftsToAggregate.length
  };
}
