export type MaterialType = 'liquid' | 'bubuk' | 'padat';
export type MaterialSource = 'GDRM' | 'Formulasi';
export type StorageLocation = 'CK' | 'WINEROTO' | 'STORAGE_TANK';

export interface Material {
  id: string;
  name: string;
  code?: string;
  type: MaterialType;
  source: MaterialSource;
  packaging: string;
  weightKg: number;
  minStockAlert?: number;
  initialStockCk?: number; // Saldo awal material di Gudang CK (kg)
  initialStockWineroto?: number; // Saldo awal material di Gudang WINEROTO (kg)
  initialStockTank?: number; // Saldo awal material di Storage Tank (kg)
}

export type WipTankType = 'HOLDING_TANK' | 'STORAGE_TANK';
export type WipTankStatus = 'ACTIVE' | 'STANDBY' | 'CLEANING' | 'MAINTENANCE' | 'EMPTY';

export type MachineStatus = 'OPERATIONAL' | 'STANDBY' | 'MAINTENANCE' | 'CHANGEOVER';

export type ChangeoverType = 'MINOR' | 'MAJOR_ALLERGEN' | 'FULL_CIP' | 'MOULD_TOOLING';

export interface MachineChangeoverChecklist {
  lineClearanceDone: boolean; // Sisa batch sebelumnya dikosongkan & clearance area
  cleaningSanitationDone: boolean; // Pembersihan / CIP / Flushing selesai
  toolingMouldSwapped: boolean; // Penggantian cetakan / nozzle / part formula baru
  parameterConfigured: boolean; // Setting parameter suhu, speed mixer, tekanan
  qcSwabClearanceDone: boolean; // Inspeksi visual & swab allergen / clearance QC
}

export interface MachineChangeoverRecord {
  id: string;
  machineId: string;
  machineCode: string;
  machineName: string;
  timestamp: string; // ISO string saat disubmit / diselesaikan
  fromWipId?: string;
  fromWipName?: string;
  toWipId: string;
  toWipName: string;
  targetTankId?: string;
  targetTankCode?: string;
  changeoverType: ChangeoverType;
  durationMinutes: number; // Durasi estimasi atau aktual
  operatorName: string;
  qcInspectorName?: string;
  checklist: MachineChangeoverChecklist;
  notes?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startedAt: string;
  completedAt?: string;
}

export interface ActiveMachineChangeover {
  fromWipId?: string;
  fromWipName?: string;
  toWipId: string;
  toWipName: string;
  targetTankId?: string;
  targetTankCode?: string;
  changeoverType: ChangeoverType;
  startedAt: string;
  estimatedMinutes: number;
  operatorName: string;
  qcInspectorName?: string;
  checklist: MachineChangeoverChecklist;
  notes?: string;
}

export interface ProductionMachine {
  id: string;
  code: string; // e.g. "MX-01", "ENR-01", "EXT-01"
  name: string; // e.g. "Mixer High-Shear Cream A"
  line: string; // e.g. "Line 1 - Biskuit"
  capacityKgPerHour: number;
  status: MachineStatus;
  operatorAssigned?: string;
  notes?: string;
  // Product Changeover state
  currentWipId?: string; // WIP yang sedang aktif dikerjakan di mesin ini
  currentWipName?: string;
  lastChangeoverDate?: string;
  activeChangeover?: ActiveMachineChangeover;
  changeoverHistory?: MachineChangeoverRecord[];
}

export interface ProductionLine {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface WipTank {
  id: string;
  code: string; // e.g. "HT-01", "ST-WIP-01"
  name: string; // e.g. "Holding Tank Sirup Karamel"
  type: WipTankType; // 'HOLDING_TANK' | 'STORAGE_TANK'
  capacityKg: number; // e.g. 500 kg for holding tank, 3000 kg for storage tank
  currentLevelKg: number; // kg aktual saat ini
  assignedWipId?: string; // WIP yang dialokasikan (1 jenis WIP yang sama per tangki)
  assignedMachineId?: string; // Mesin tunggal (backward compatibility)
  assignedMachineIds?: string[]; // Multi-mesin pengisi asal yang terhubung
  temp?: number; // Suhu (°C)
  agitatorStatus?: 'ON' | 'OFF';
  status: WipTankStatus;
  minAlertKg?: number; // Ambang batas level rendah (kg)
  notes?: string;
}

export interface WIP {
  id: string;
  name: string;
  code: string; // 1 Nama WIP memiliki 1 Kode unik
  batchWeightKg: number;
  description?: string;
  assignedMachineId?: string; // Pilihan Mesin Produksi utama (backward compatibility)
  assignedMachineIds?: string[]; // Multi-mesin produksi yang dapat memproduksi WIP ini
  targetTankType?: WipTankType; // Tujuan transfer: HOLDING_TANK atau STORAGE_TANK
  targetTankId?: string; // ID Tangki tujuan transfer (backward compatibility)
  targetTankIds?: string[]; // Multi-tangki tujuan transfer penyimpanan (Holding Tank maupun Storage Tank)
  productionDurationMinutes?: number; // Konfigurasi lama waktu produksi batch WIP (menit)
}

// Six Big Losses TPM (Total Productive Maintenance) Standard
export type SixBigLossCategory =
  | 'EQUIPMENT_FAILURE' // 1. Kerusakan Mesin / Breakdown (Downtime Loss)
  | 'SETUP_ADJUSTMENT' // 2. Penyetelan & Changeover (Downtime Loss)
  | 'IDLING_MINOR_STOPS' // 3. Pemberhentian Singkat & Idling < 5-10 mnt (Speed Loss)
  | 'REDUCED_SPEED' // 4. Kecepatan Operasi Berkurang (Speed Loss)
  | 'PROCESS_DEFECTS' // 5. Cacat Proses & Rework (Quality Loss)
  | 'STARTUP_REJECTS' // 6. Penurunan Yield / Kerugian Startup (Quality Loss)
  | 'MATERIAL_SHORTAGE' // 7. Kekurangan / Habis Material WIP di Holding Tank (Downtime Loss)
  | 'OTHER_PLANNED'; // 8. Istirahat / Planned Maintenance Rutin (Planned Loss)

export type LossCategoryType = 'DOWNTIME' | 'SPEED' | 'QUALITY' | 'PLANNED';

export interface ProductionStopLog {
  id: string;
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  shift: ShiftNumber;
  startedAt: string; // ISO string saat produksi dimulai
  stoppedAt: string; // ISO string saat distop
  durationMinutes: number; // Durasi stop dalam menit (terupdate ke aktual saat dilanjutkan)
  estimatedRepairMinutes?: number; // Estimasi awal waktu perbaikan saat SBL dicatat (menit)
  actualRepairMinutes?: number; // Durasi aktual perbaikan sampai produksi dilanjutkan (menit)
  resumedAt?: string; // ISO string saat produksi dilanjutkan kembali
  category: SixBigLossCategory;
  categoryLabel: string;
  lossType: LossCategoryType;
  reasonTitle: string; // Alasan spesifik / sub-reason
  subReason?: string;
  actionTaken?: string; // Tindakan perbaikan yang diambil
  operatorName?: string;
  technicianName?: string;
  notes?: string;
  cartonsProducedDuringRun?: number;
}

export interface ActiveSkuProductionRun {
  id?: string;
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  shift: ShiftNumber;
  shiftPeriodKey?: string; // e.g. "2026-11-17-S1" untuk melacak pergantian shift otomatis
  plannedCartons?: number; // Target planning jumlah karton per SKU per shift
  startedAt: string; // ISO
  completedAt?: string; // ISO
  isRunning: boolean;
  completionStatus?: 'RUNNING' | 'COMPLETED' | 'STOPPED_SBL' | 'STOPPED_SHORTAGE' | 'SHIFT_HANDOVER';
  carriedOverFromShift?: ShiftNumber;
  previousShiftCartons?: number;
  handoverToShift?: ShiftNumber;
  shortageReason?: string;
  shortageStopLogId?: string;
  sblStopLogId?: string;
  sblEstimatedMinutes?: number;
  sblStoppedAt?: string;
  sblReason?: string;
  sblCategoryLabel?: string;
  cartonsProducedTotal: number;
  lastDeductionTime?: string;
  operatorName?: string;
  targetPerHour?: number;
  isAutoSimulating?: boolean;
  speedMultiplier?: number;
  selectedHoldingTanks?: Record<string, string>; // Map wipId -> selected holdingTankId
}


export interface SKU {
  id: string;
  name: string;
  code?: string;
  isKite: boolean; // Kemudahan Impor Tujuan Ekspor (KITE)
  targetHour: number; // Karton per jam
  cartonWeightKg: number; // kg per karton
}

export interface SkuWip {
  id: string;
  skuId: string;
  wipId: string;
  kgWipPerCartonSku: number; // Berapa kg WIP ini untuk 1 karton SKU
}

export interface WipMaterial {
  id: string;
  wipId: string;
  materialId: string;
  materialKgPerBatch: number; // Berapa kg Material ini untuk 1 batch WIP
  recipeId?: string; // Tautan ke ID Resep
  unit?: 'kg' | 'gr';
  amount?: number;
}

// Resep merupakan macam-macam material (dalam satuan kg, gr/batch) untuk membuat 1 jenis WIP
export interface WipRecipeItem {
  id: string;
  materialId: string;
  materialName?: string;
  materialCode?: string;
  materialType?: MaterialType; // 'padat' | 'bubuk' | 'liquid'
  amount: number; // Takaran input per batch
  unit: 'kg' | 'gr'; // Satuan takaran per batch (kg atau gr)
  amountKg: number; // Nilai normalisasi dalam kilogram per batch (jika gr, / 1000)
}

export interface WipRecipe {
  id: string;
  wipId: string;
  recipeCode: string; // e.g. "RSP-WIP01-01"
  recipeName: string; // e.g. "Resep Standar Glukosa & Karamel"
  description?: string;
  isDefault?: boolean;
  totalWeightKg: number; // Total bobot resep per 1 batch WIP
  items: WipRecipeItem[];
  createdAt?: string;
}

export interface MaterialRequest {
  id: string;
  requestNumber: string;
  date: string;
  shift?: ShiftNumber; // SOP Rule: Permintaan material hanya dapat dilakukan di Shift 1
  skuId: string;
  wipId: string;
  materialId: string;
  qty: number; // kg yang dipesan ke supplier (hasil pembulatan ke atas jika GDRM bubuk)
  theoreticalQty?: number; // kg kebutuhan teoretis batch sebelum pembulatan
  packageSizeKg?: number; // Kemasan pabrikasi (15, 20, 25, 50 kg)
  packageCount?: number; // Jumlah zak hasil pembulatan ke atas
  surplusKg?: number; // Surplus saldo yang akan masuk gudang
  batch: number; // jumlah batch
  saldoAwal: number; // kg saat diajukan
  supplier: MaterialSource;
  status: 'Pending' | 'Approved' | 'Received';
  notes?: string;
}

// Keranjang Permintaan Material (Draft / Crosscheck Basket)
export interface RequestCartItem {
  id: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  isKite?: boolean;
  wipId: string;
  wipName: string;
  materialId: string;
  materialName: string;
  materialCode?: string;
  materialType: string;
  qty: number; // Qty form order resmi yang dipesan ke supplier (kg)
  theoreticalQty: number; // Kebutuhan teoretis sebelum pembulatan
  packageSizeKg?: number; // Kemasan pabrikasi (15, 20, 25, 50 kg)
  packageCount?: number; // Jumlah zak hasil pembulatan ke atas
  surplusKg?: number; // Surplus saldo yang akan masuk gudang
  batch: number;
  saldoAwal: number;
  supplier: MaterialSource;
  shift?: ShiftNumber; // SOP Rule: Shift 1
  notes?: string;
  addedAt: string;
}

export interface ZakReceiptBreakdown {
  id: string;
  bagCount: number; // Jumlah zak dalam kelompok ini (misal 50 zak)
  subtotalKg: number; // Total berat aktual kelompok ini (misal 1240 kg)
  weightPerBagKg: number; // Berat rata-rata per zak kelompok ini (misal 24.8 kg)
  notes?: string; // Keterangan kelompok (misal "Pallet 1", "Lot A")
}

export interface PalletAllocation {
  palletId: string; // ID unik breakdown kelompok pallet atau ID receipt
  receiptId: string;
  receiptNumber: string;
  palletLabel: string; // misal "Pallet 1", "Lot A"
  date: string;
  bagsUsed: number; // Jumlah unit zak yang dialokasikan
  weightPerBagKg: number; // Berat terkunci per unit zak (kg)
  subtotalKg: number; // bagsUsed * weightPerBagKg
  location: StorageLocation;
}

export interface PalletInventoryLot {
  palletId: string;
  receiptId: string;
  receiptNumber: string;
  date: string;
  materialId: string;
  materialName: string;
  materialCode?: string;
  palletLabel: string;
  initialBags: number;
  usedBags: number;
  remainingBags: number;
  weightPerBagKg: number; // Terkunci sesuai timbangan saat penerimaan di CK
  initialKg: number;
  remainingKg: number;
  location: StorageLocation;
  batchLotNumber?: string;
}

export interface MaterialReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  shift?: ShiftNumber; // SOP Rule: Pengiriman material dilakukan di shift 1 dan 2
  requestId?: string;
  materialId: string;
  requestedQty: number;
  receivedQty: number;
  location: StorageLocation;
  batchLotNumber?: string;
  status: 'Received' | 'Discrepancy';
  notes?: string;
  isZakCorrectionActive?: boolean; // Apakah koreksi timbangan zak diaktifkan
  standardBagWeightKg?: number; // Berat kemasan standar pabrikan (misal 25 kg)
  totalBagCount?: number; // Total zak diterima (misal 100 zak)
  standardTotalKg?: number; // Total berat standar pabrikan (misal 2500 kg)
  weightVarianceKg?: number; // Selisih timbang aktual vs standar (misal -5 kg)
  zakBreakdown?: ZakReceiptBreakdown[]; // Rincian kelompok timbangan zak
}

export interface MaterialStockAdjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  timestamp: string;
  materialId: string;
  materialName: string;
  materialCode?: string;
  location: StorageLocation | 'ALL';
  previousInitialStockKg: number;
  newInitialStockKg: number;
  deltaKg: number;
  previousStockCk?: number;
  newStockCk?: number;
  previousStockWineroto?: number;
  newStockWineroto?: number;
  previousStockTank?: number;
  newStockTank?: number;
  reason: string;
  adjustedBy: string;
  notes?: string;
}

export type ShiftNumber = 1 | 2 | 3;

export interface MaterialUsage {
  id: string;
  usageNumber: string;
  date: string;
  shift?: ShiftNumber;
  skuId: string;
  wipId: string;
  materialId: string;
  qty: number; // kg rencana
  batch: number; // batch
  usageQty: number; // kg aktual terpakai
  sourceLocation: StorageLocation;
  operatorName?: string;
  notes?: string;
  batchOrderId?: string; // Reference to WipProductionBatch if generated from batch order
  palletAllocations?: PalletAllocation[]; // Alokasi FIFO pallet terkunci yang digunakan
}

export type WipBatchStatus = 'SEDANG_PRODUKSI' | 'SELESAI' | 'DIBATALKAN';

export interface WipBatchMaterialItem {
  materialId: string;
  materialName: string;
  materialCode?: string;
  materialType: MaterialType;
  materialSource: MaterialSource;
  packaging: string;
  requiredKg: number; // Kebutuhan 1 batch WIP sesuai BOM / Resep
  actualUsedKg: number; // Aktual pemakaian
  sourceLocation: StorageLocation;
  isConsumed: boolean;
  unit?: 'kg' | 'gr'; // Satuan takaran resep
  recipeAmount?: number; // Nilai takaran input resep (e.g. 500 gr atau 25 kg)
  palletAllocations?: PalletAllocation[]; // Rincian alokasi pallet FIFO terkunci
}

export interface WipProductionBatch {
  id: string;
  batchCode: string; // e.g. "PK-WIP-202610-001"
  wipId: string;
  wipName: string;
  recipeId?: string; // ID Resep yang dipilih
  recipeCode?: string; // Kode Resep (e.g. "RSP-WIP01-01")
  recipeName?: string; // Nama Resep (e.g. "Resep Standar Glukosa & Karamel")
  skuId?: string;
  skuName?: string;
  shift?: ShiftNumber;
  batchSize: number; // Selalu 1 batch
  batchWeightKg: number; // Bobot 1 batch WIP
  status: WipBatchStatus;
  startedAt: string; // Tanggal & waktu mulai
  completedAt?: string;
  durationMinutes?: number; // Konfigurasi durasi pembuatan (menit)
  estimatedCompletionTime?: string; // Target waktu selesai otomatis (ISO)
  targetTankId?: string; // Tangki tujuan transfer saat selesai
  targetMachineId?: string; // Mesin yang memproses batch
  targetMachineName?: string; // Nama mesin produksi terpilih dari master mesin
  alarmTriggered?: boolean; // Apakah alarm selesai sudah dibunyikan
  operatorName: string;
  notes?: string;
  materials: WipBatchMaterialItem[];
}

export interface CartonProductionLog {
  id: string;
  timestamp: string;
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  cartonsProduced: number; // Jumlah karton berhasil diproduksi
  shift?: ShiftNumber;
  operatorName?: string;
  tankDeductions: {
    tankId: string;
    tankCode: string;
    tankName: string;
    tankType: WipTankType;
    wipId: string;
    wipName: string;
    kgPerCarton: number;
    kgDeducted: number;
    remainingLevelKg: number;
  }[];
  notes?: string;
}

export interface TankTransferLog {
  id: string;
  timestamp: string;
  tankId: string;
  tankCode: string;
  tankName: string;
  type: 'WIP_BATCH_INFLOW' | 'MANUAL_TOPUP' | 'CARTON_DEPLETION' | 'CALIBRATION';
  amountKg: number; // positif untuk penambahan, negatif untuk pengurangan
  previousLevelKg: number;
  newLevelKg: number;
  wipId?: string;
  wipName?: string;
  batchCode?: string;
  skuName?: string;
  cartonsCount?: number;
  operatorName?: string;
  notes?: string;
}

export interface TankState {
  level: number; // kg aktual
  maxCapacity: number; // 1000 kg
  temp: number; // Celcius
  minTempTarget: number; // 45.0
  maxTempTarget: number; // 55.0
  isSimulationActive: boolean;
}

export interface AdminGoogleUser {
  email: string;
  displayName?: string;
  photoURL?: string;
  registeredAt?: string;
  role?: 'SUPER_ADMIN' | 'ADMIN';
}

// 3 Jenis Pengguna (Role-Based Access Control)
export type UserRole = 'ADMINISTRATOR' | 'OPERATOR' | 'MANAGEMENT';

export interface RegisteredOperator {
  id: string;
  name: string;
  nik: string; // Nomor Induk Karyawan
  email?: string; // Opsional: Email Google operator untuk akses lintas perangkat
  assignedLine: string;
  assignedShift: 1 | 2 | 3;
  status: 'ACTIVE' | 'INACTIVE';
  registeredAt: string;
  notes?: string;
}

export interface RegisteredManagement {
  id: string;
  name: string;
  email: string;
  title: string; // e.g. Factory Manager, Direktur Operasional, VP Supply Chain
  department: string;
  hasViewAccess: boolean; // Memberikan akses melihat kepada management yang terdaftar
  registeredAt: string;
  notes?: string;
}

export interface CurrentUserSession {
  role: UserRole;
  id: string;
  name: string;
  email?: string;
  subtitle?: string;
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'SIGNUP_ADMIN' | 'REGISTER_OPERATOR' | 'PASSWORD_CHANGE' | 'BOM_CONFIG_UPDATE';
  userEmail: string;
  role: UserRole;
  ipOrDevice?: string;
  notes?: string;
}

export type WeeklyPlanDayKey = 'senin' | 'selasa' | 'rabu' | 'kamis' | 'jumat' | 'sabtu' | 'minggu';

export interface WeeklyPlanShiftRow {
  shift: ShiftNumber; // 1 | 2 | 3
  dailyCartons: Record<WeeklyPlanDayKey, number>;
  totalOutput: number;
}

export interface WeeklyPlanSkuItem {
  id: string;
  plantUnit?: string; // e.g. "UB1"
  line: string; // e.g. "1", "2", "3", "3A"
  rawSkuCode: string; // e.g. "421185"
  rawProductName: string; // e.g. "SUPERSTAR TWIN DB 12X12X25G TH"
  matchedSkuId?: string; // Linked SKU.id in state.master.skus
  targetPerHour?: number; // Car / Jam
  statusNote?: string; // e.g. "OFF PRODUKSI", "MENYELESAIKAN QUOTATION"
  isOffProduction?: boolean;
  shifts: WeeklyPlanShiftRow[]; // Shift 1, 2, 3
  totalProduksi: number;
}

export interface WeeklyProductionPlan {
  id: string;
  title: string; // e.g. "RENCANA PRODUKSI MINGGUAN - WEEK 41"
  weekLabel: string; // e.g. "WEEK 41"
  periodStart: string; // e.g. "05/Okt" or "2026-10-05"
  periodEnd: string; // e.g. "11/Okt" or "2026-10-11"
  department?: string; // e.g. "DEPARTEMEN PPIC"
  companyHeader?: string; // e.g. "PT. MAYORA INDAH DIV. WAFER"
  dayDates?: Partial<Record<WeeklyPlanDayKey, string>>; // e.g. { senin: '05-Oct', ... }
  uploadedAt: string; // ISO
  uploadedBy?: string;
  sourceFileName?: string;
  items: WeeklyPlanSkuItem[];
}

export interface AppState {
  theme?: 'midnight' | 'daylight' | 'light' | 'dark'; // 'midnight' (Gelap Industrial) or 'daylight' (Putih/Cerah Terang Pabrik)
  factoryName?: string; // Nama pabrik yang didaftarkan oleh Administrator pertama
  cloudWorkspaceId?: string; // ID Workspace Firestore terisolasi per pabrik/user
  cloudOwnerUid?: string; // UID Administrator utama pemilik workspace di Firestore
  isAuthenticated: boolean; // false initially so users land on the Sign In page
  isAdmin: boolean;
  currentUserRole: UserRole; // 'ADMINISTRATOR' | 'OPERATOR' | 'MANAGEMENT'
  currentSession: CurrentUserSession;
  registeredOperators: RegisteredOperator[];
  registeredManagement: RegisteredManagement[];
  adminPin: string;
  adminGoogleEmails?: string[]; // Daftar email Google yang didaftarkan sebagai Administrator
  currentAdminUser?: AdminGoogleUser | null;
  currentTab: 'admin-portal' | 'dashboard' | 'tank-monitoring' | 'shift-summary' | 'permintaan' | 'penerimaan' | 'pemakaian' | 'master' | 'bom-calculator' | 'reports';
  master: {
    materials: Material[];
    wips: WIP[];
    skus: SKU[];
    skuWips: SkuWip[];
    wipMats: WipMaterial[];
    recipes?: WipRecipe[];
    machines: ProductionMachine[];
    tanks: WipTank[];
    productionLines?: ProductionLine[];
  };
  transactions: {
    requests: MaterialRequest[];
    receipts: MaterialReceipt[];
    usages: MaterialUsage[];
    wipBatches?: WipProductionBatch[];
    cartonProductions?: CartonProductionLog[];
    tankLogs?: TankTransferLog[];
    changeovers?: MachineChangeoverRecord[];
    productionStops?: ProductionStopLog[];
    stockAdjustments?: MaterialStockAdjustment[];
  };
  weeklyPlannings?: WeeklyProductionPlan[];
  activeWeeklyPlanId?: string | null;
  activeSkuRun?: ActiveSkuProductionRun | null;
  activeSkuRuns?: ActiveSkuProductionRun[];
  lastShiftHandover?: {
    fromShift: ShiftNumber;
    toShift: ShiftNumber;
    timestamp: string;
    handedOverCount: number;
  } | null;
  tank: TankState;
  securityLogs?: SecurityAuditLog[];
}
