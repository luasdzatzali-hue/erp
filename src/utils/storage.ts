import {
  AppState,
  Material,
  WIP,
  SKU,
  SkuWip,
  WipMaterial,
  WipRecipe,
  WipRecipeItem,
  ProductionMachine,
  WipTank,
  CartonProductionLog,
  TankTransferLog,
  ProductionStopLog,
  UserRole,
  RegisteredOperator,
  RegisteredManagement,
  CurrentUserSession,
  StorageLocation,
  PalletAllocation,
  PalletInventoryLot,
  ZakReceiptBreakdown,
  MaterialStockAdjustment
} from '../types';

export const STORAGE_KEY = 'prodtrack_state_v9';

export const SAMPLE_OPERATORS: RegisteredOperator[] = [
  {
    id: 'op_1',
    name: 'Ahmad Fauzi',
    nik: 'OPR-2024-001',
    assignedLine: 'Line 1 (Biskuit Domestik)',
    assignedShift: 1,
    status: 'ACTIVE',
    registeredAt: '2026-01-15',
    notes: 'Leader Batching & Pengoperasian Mixer MX-01'
  },
  {
    id: 'op_2',
    name: 'Budi Santoso',
    nik: 'OPR-2024-002',
    assignedLine: 'Line 1 (Biskuit Domestik)',
    assignedShift: 1,
    status: 'ACTIVE',
    registeredAt: '2026-02-01',
    notes: 'Operator Cooker & Holding Tank HT-01'
  },
  {
    id: 'op_3',
    name: 'Candra Wijaya',
    nik: 'OPR-2024-003',
    assignedLine: 'Line 2 (Wafer Ekspor KITE)',
    assignedShift: 2,
    status: 'ACTIVE',
    registeredAt: '2026-03-10',
    notes: 'Operator Enrober & Storage Tank ST-01'
  },
  {
    id: 'op_4',
    name: 'Dedi Kurniawan',
    nik: 'OPR-2024-004',
    assignedLine: 'Line 2 (Wafer Ekspor KITE)',
    assignedShift: 3,
    status: 'ACTIVE',
    registeredAt: '2026-04-05',
    notes: 'Operator Shift 3 Malam & Buffer Adonan'
  }
];

export const SAMPLE_MANAGEMENT: RegisteredManagement[] = [
  {
    id: 'mgt_1',
    name: 'Ir. Hendra Gunawan, M.M.',
    email: 'hendra.gunawan@factory.co.id',
    title: 'Factory General Manager',
    department: 'Plant Operations Management',
    hasViewAccess: true,
    registeredAt: '2026-01-10',
    notes: 'Akses penuh monitoring dashboard produksi harian'
  },
  {
    id: 'mgt_2',
    name: 'Siti Rahayu, S.T.',
    email: 'siti.rahayu@factory.co.id',
    title: 'Head of Quality Control & Assurance',
    department: 'Quality Management',
    hasViewAccess: true,
    registeredAt: '2026-01-12',
    notes: 'Monitoring status tangki & hasil uji WIP'
  },
  {
    id: 'mgt_3',
    name: 'Bambang Sudiro, S.E.',
    email: 'bambang.sudiro@factory.co.id',
    title: 'Supply Chain & Inventory Director',
    department: 'Supply Chain Management',
    hasViewAccess: true,
    registeredAt: '2026-02-20',
    notes: 'Monitoring saldo stok material CK & WINEROTO'
  },
  {
    id: 'mgt_4',
    name: 'Dewi Lestari, M.Sc.',
    email: 'dewi.lestari@factory.co.id',
    title: 'Production Planning & Control (PPIC) Manager',
    department: 'PPIC',
    hasViewAccess: false,
    registeredAt: '2026-03-01',
    notes: 'Membutuhkan persetujuan Administrator untuk akses melihat'
  }
];

export const SAMPLE_MACHINES: ProductionMachine[] = [
  {
    id: 'mach_1',
    code: 'MX-01',
    name: 'Mixer High-Shear Adonan Utama',
    line: 'Line 1 (Biskuit Domestik)',
    capacityKgPerHour: 800,
    status: 'OPERATIONAL',
    operatorAssigned: 'Ahmad Fauzi (Shift 1)',
    notes: 'Kapasitas batching hingga 500 kg per siklus adonan',
    currentWipId: 'wip_2',
    currentWipName: 'WIP Adonan Utama Biskuit',
    lastChangeoverDate: new Date(Date.now() - 3600000 * 24).toISOString(),
    changeoverHistory: [
      {
        id: 'co_sample_01',
        machineId: 'mach_1',
        machineCode: 'MX-01',
        machineName: 'Mixer High-Shear Adonan Utama',
        timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
        fromWipId: 'wip_1',
        fromWipName: 'WIP Sirup Glukosa & Karamel',
        toWipId: 'wip_2',
        toWipName: 'WIP Adonan Utama Biskuit',
        targetTankId: 'tank_ht_2',
        targetTankCode: 'HT-02',
        changeoverType: 'MAJOR_ALLERGEN',
        durationMinutes: 45,
        operatorName: 'Ahmad Fauzi (Shift 1)',
        qcInspectorName: 'Siti Rahayu (QC)',
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: true,
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        notes: 'Pembersihan basah & swab alergen susu lolos, bilas air RO 60°C',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 3600000 * 25).toISOString(),
        completedAt: new Date(Date.now() - 3600000 * 24).toISOString()
      }
    ]
  },
  {
    id: 'mach_2',
    code: 'CK-01',
    name: 'Cooker & Vacuum Tank Sirup Glukosa',
    line: 'Line 1 (Biskuit Domestik)',
    capacityKgPerHour: 500,
    status: 'OPERATIONAL',
    operatorAssigned: 'Budi Santoso (Shift 1)',
    notes: 'Jalur pipa terhubung langsung ke Holding Tank HT-01',
    currentWipId: 'wip_1',
    currentWipName: 'WIP Sirup Glukosa & Karamel',
    lastChangeoverDate: new Date(Date.now() - 3600000 * 48).toISOString(),
    changeoverHistory: [
      {
        id: 'co_sample_02',
        machineId: 'mach_2',
        machineCode: 'CK-01',
        machineName: 'Cooker & Vacuum Tank Sirup Glukosa',
        timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
        fromWipId: undefined,
        fromWipName: 'Startup Line Sirup',
        toWipId: 'wip_1',
        toWipName: 'WIP Sirup Glukosa & Karamel',
        targetTankId: 'tank_ht_1',
        targetTankCode: 'HT-01',
        changeoverType: 'FULL_CIP',
        durationMinutes: 60,
        operatorName: 'Budi Santoso (Shift 1)',
        qcInspectorName: 'Siti Rahayu (QC)',
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: false,
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        notes: 'Siklus CIP sirkulasi uap panas 85°C selama 30 menit',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 3600000 * 49).toISOString(),
        completedAt: new Date(Date.now() - 3600000 * 48).toISOString()
      }
    ]
  },
  {
    id: 'mach_3',
    code: 'ENR-01',
    name: 'Enrober Unit Coating Cokelat KITE',
    line: 'Line 2 (Wafer Ekspor KITE)',
    capacityKgPerHour: 650,
    status: 'OPERATIONAL',
    operatorAssigned: 'Candra Wijaya (Shift 2)',
    notes: 'Suhu tempering diatur presisi 31.5°C',
    currentWipId: 'wip_3',
    currentWipName: 'WIP Coating Cokelat KITE',
    lastChangeoverDate: new Date(Date.now() - 3600000 * 12).toISOString(),
    changeoverHistory: [
      {
        id: 'co_sample_03',
        machineId: 'mach_3',
        machineCode: 'ENR-01',
        machineName: 'Enrober Unit Coating Cokelat KITE',
        timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
        fromWipId: 'wip_2',
        fromWipName: 'WIP Adonan Utama Biskuit',
        toWipId: 'wip_3',
        toWipName: 'WIP Coating Cokelat KITE',
        targetTankId: 'tank_st_1',
        targetTankCode: 'ST-WIP-01',
        changeoverType: 'MINOR',
        durationMinutes: 25,
        operatorName: 'Candra Wijaya (Shift 2)',
        qcInspectorName: 'Doni Pratama (QC)',
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: true,
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        notes: 'Pergantian curtain nozzle enrober 600mm & kalibrasi belt speed',
        status: 'COMPLETED',
        startedAt: new Date(Date.now() - 3600000 * 13).toISOString(),
        completedAt: new Date(Date.now() - 3600000 * 12).toISOString()
      }
    ]
  },
  {
    id: 'mach_4',
    code: 'EXT-01',
    name: 'Twin-Screw Continuous Extruder',
    line: 'Line 2 (Wafer Ekspor KITE)',
    capacityKgPerHour: 750,
    status: 'STANDBY',
    operatorAssigned: 'Dedi Kurniawan',
    notes: 'Siap untuk jadwal produksi shift malam',
    currentWipId: 'wip_3',
    currentWipName: 'WIP Coating Cokelat KITE'
  }
];

export const SAMPLE_TANKS: WipTank[] = [
  {
    id: 'tank_ht_1',
    code: 'HT-01',
    name: 'Holding Tank Sirup Karamel #1',
    type: 'HOLDING_TANK',
    capacityKg: 600.0,
    currentLevelKg: 480.0,
    assignedWipId: 'wip_1',
    assignedMachineId: 'mach_2',
    assignedMachineIds: ['mach_2'],
    temp: 49.5,
    agitatorStatus: 'ON',
    status: 'ACTIVE',
    minAlertKg: 100.0,
    notes: 'Penampung antara sebelum dosing ke mixer adonan'
  },
  {
    id: 'tank_ht_2',
    code: 'HT-02',
    name: 'Holding Tank Buffer Adonan #2',
    type: 'HOLDING_TANK',
    capacityKg: 800.0,
    currentLevelKg: 620.0,
    assignedWipId: 'wip_2',
    assignedMachineId: 'mach_1',
    assignedMachineIds: ['mach_1', 'mach_2'], // Multi-mesin: Mixer 1 & Cooker 1
    temp: 28.2,
    agitatorStatus: 'ON',
    status: 'ACTIVE',
    minAlertKg: 150.0,
    notes: 'Buffer feeding adonan terisi dari Mixer MX-01 dan Cooker CK-01'
  },
  {
    id: 'tank_st_1',
    code: 'ST-WIP-01',
    name: 'Storage Tank WIP Coating Ekspor',
    type: 'STORAGE_TANK',
    capacityKg: 2500.0,
    currentLevelKg: 1950.0,
    assignedWipId: 'wip_3',
    assignedMachineId: 'mach_3',
    assignedMachineIds: ['mach_3', 'mach_4'], // Multi-mesin: Enrober 1 & Extruder 1
    temp: 43.0,
    agitatorStatus: 'ON',
    status: 'ACTIVE',
    minAlertKg: 400.0,
    notes: 'Tangki penyimpanan utama WIP coating bersumber dari Enrober ENR-01 & Extruder EXT-01'
  },
  {
    id: 'tank_st_2',
    code: 'ST-WIP-02',
    name: 'Storage Tank Bulk Sirup Reserve',
    type: 'STORAGE_TANK',
    capacityKg: 3000.0,
    currentLevelKg: 2400.0,
    assignedWipId: 'wip_1',
    assignedMachineId: 'mach_2',
    assignedMachineIds: ['mach_2'],
    temp: 47.0,
    agitatorStatus: 'OFF',
    status: 'ACTIVE',
    minAlertKg: 500.0,
    notes: 'Penyimpanan sirup glukosa curah kapasitas besar'
  },
  {
    id: 'tank_ht_3',
    code: 'HT-03',
    name: 'Holding Tank Fast Batch Coating #3',
    type: 'HOLDING_TANK',
    capacityKg: 500.0,
    currentLevelKg: 390.0,
    assignedWipId: 'wip_3',
    assignedMachineId: 'mach_3',
    assignedMachineIds: ['mach_3'],
    temp: 42.5,
    agitatorStatus: 'ON',
    status: 'ACTIVE',
    minAlertKg: 80.0,
    notes: 'Holding tank sirkulasi return untuk enrober line 2'
  }
];

export const DEFAULT_STATE: AppState = {
  theme: 'midnight',
  isAuthenticated: false,
  isAdmin: false,
  currentUserRole: 'OPERATOR',
  currentSession: {
    role: 'OPERATOR',
    id: 'op_1',
    name: 'Ahmad Fauzi',
    subtitle: 'Operator Line 1 · Shift 1'
  },
  registeredOperators: SAMPLE_OPERATORS,
  registeredManagement: SAMPLE_MANAGEMENT,
  adminPin: '12345678',
  adminGoogleEmails: ['luasdzatzali@gmail.com'],
  currentAdminUser: null,
  currentTab: 'admin-portal',
  master: {
    materials: [],
    wips: [],
    skus: [],
    skuWips: [],
    wipMats: [],
    machines: [],
    tanks: []
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
    stockAdjustments: []
  },
  activeSkuRun: null,
  activeSkuRuns: [],
  tank: {
    level: 750.0,
    maxCapacity: 1000.0,
    temp: 48.5,
    minTempTarget: 45.0,
    maxTempTarget: 55.0,
    isSimulationActive: true
  }
};

export const SAMPLE_MATERIALS: Material[] = [
  { id: 'mat_1', name: 'Tepung Terigu Premix', code: 'MAT-TP-01', type: 'bubuk', source: 'GDRM', packaging: 'Zak 25.0000 kg', weightKg: 25.0000, minStockAlert: 100, initialStockCk: 2500, initialStockWineroto: 500, initialStockTank: 0 },
  { id: 'mat_2', name: 'Gula Pasir Rafinasi (50 kg)', code: 'MAT-GL-01', type: 'padat', source: 'GDRM', packaging: 'Zak 50.0000 kg', weightKg: 50.0000, minStockAlert: 200, initialStockCk: 1500, initialStockWineroto: 1000, initialStockTank: 0 },
  { id: 'mat_2_15k', name: 'Gula Pasir Rafinasi (15 kg)', code: 'MAT-GL-01', type: 'padat', source: 'GDRM', packaging: 'Zak 15.0000 kg', weightKg: 15.0000, minStockAlert: 100, initialStockCk: 300, initialStockWineroto: 150, initialStockTank: 0 },
  { id: 'mat_2_form', name: 'Gula Pasir Formulasi Khusus', code: 'MAT-GL-01', type: 'padat', source: 'Formulasi', packaging: 'Zak 25.0000 kg', weightKg: 25.0000, minStockAlert: 50, initialStockCk: 50, initialStockWineroto: 250, initialStockTank: 0 },
  { id: 'mat_3', name: 'Minyak Nabati RBDPO', code: 'MAT-MY-01', type: 'liquid', source: 'GDRM', packaging: 'Drum 180.0000 kg', weightKg: 180.0000, minStockAlert: 300, initialStockCk: 0, initialStockWineroto: 0, initialStockTank: 3500 },
  { id: 'mat_4', name: 'Flavor Choco Paste', code: 'MAT-FL-02', type: 'liquid', source: 'Formulasi', packaging: 'Jerigen 10.0000 kg', weightKg: 10.0000, minStockAlert: 30, initialStockCk: 40, initialStockWineroto: 120, initialStockTank: 0 },
  { id: 'mat_5', name: 'Premix Vitamin Custom', code: 'MAT-PX-03', type: 'bubuk', source: 'Formulasi', packaging: 'Batching 4.2500 kg', weightKg: 4.2500, minStockAlert: 15, initialStockCk: 15, initialStockWineroto: 85, initialStockTank: 0 },
  { id: 'mat_6', name: 'Lecithin Emulsifier', code: 'MAT-LC-01', type: 'liquid', source: 'Formulasi', packaging: 'Batching 1.8500 kg', weightKg: 1.8500, minStockAlert: 10, initialStockCk: 10, initialStockWineroto: 50, initialStockTank: 0 },
  { id: 'mat_7', name: 'Garam Halus Industri', code: 'MAT-GR-01', type: 'padat', source: 'GDRM', packaging: 'Zak 25.0000 kg', weightKg: 25.0000, minStockAlert: 50, initialStockCk: 500, initialStockWineroto: 250, initialStockTank: 0 },
  { id: 'mat_8', name: 'Skim Milk Powder', code: 'MAT-SM-01', type: 'bubuk', source: 'GDRM', packaging: 'Zak 25.0000 kg', weightKg: 25.0000, minStockAlert: 75, initialStockCk: 750, initialStockWineroto: 250, initialStockTank: 0 },
];

export const SAMPLE_WIPS: WIP[] = [
  {
    id: 'wip_1',
    name: 'WIP Sirup Glukosa & Karamel',
    code: 'WIP-LQD-01',
    batchWeightKg: 100.0000,
    description: 'Komponen liquid suhu hangat',
    assignedMachineId: 'mach_2',
    assignedMachineIds: ['mach_2', 'mach_1'],
    targetTankType: 'HOLDING_TANK',
    targetTankId: 'tank_ht_1',
    targetTankIds: ['tank_ht_1', 'tank_st_1'],
    productionDurationMinutes: 20
  },
  {
    id: 'wip_2',
    name: 'WIP Adonan Utama Biskuit',
    code: 'WIP-DRY-01',
    batchWeightKg: 250.0000,
    description: 'Basis tepung premix',
    assignedMachineId: 'mach_1',
    assignedMachineIds: ['mach_1', 'mach_4'],
    targetTankType: 'HOLDING_TANK',
    targetTankId: 'tank_ht_2',
    targetTankIds: ['tank_ht_2', 'tank_st_2'],
    productionDurationMinutes: 35
  },
  {
    id: 'wip_3',
    name: 'WIP Coating Cokelat KITE',
    code: 'WIP-COT-01',
    batchWeightKg: 150.0000,
    description: 'Formula coating ekspor',
    assignedMachineId: 'mach_3',
    assignedMachineIds: ['mach_3', 'mach_1'],
    targetTankType: 'STORAGE_TANK',
    targetTankId: 'tank_st_1',
    targetTankIds: ['tank_st_1', 'tank_ht_3'],
    productionDurationMinutes: 45
  }
];

export const SAMPLE_SKUS: SKU[] = [
  { id: 'sku_1', name: 'Biskuit Choco Delight (Domestik)', code: 'SKU-DOM-01', isKite: false, targetHour: 450, cartonWeightKg: 12.0000 },
  { id: 'sku_2', name: 'Wafer Choco Roll (KITE Ekspor)', code: 'SKU-EXP-02', isKite: true, targetHour: 600, cartonWeightKg: 10.5000 }
];

export const SAMPLE_SKU_WIPS: SkuWip[] = [
  // SKU 1 (Domestik) needs 7.2 kg WIP Adonan + 4.8 kg WIP Sirup per carton
  { id: 'sw_1', skuId: 'sku_1', wipId: 'wip_2', kgWipPerCartonSku: 7.2000 },
  { id: 'sw_2', skuId: 'sku_1', wipId: 'wip_1', kgWipPerCartonSku: 4.8000 },
  // SKU 2 (KITE Ekspor) needs 5.0 kg WIP Adonan + 5.5 kg WIP Coating
  { id: 'sw_3', skuId: 'sku_2', wipId: 'wip_2', kgWipPerCartonSku: 5.0000 },
  { id: 'sw_4', skuId: 'sku_2', wipId: 'wip_3', kgWipPerCartonSku: 5.5000 },
];

export const SAMPLE_WIP_MATS: WipMaterial[] = [
  // WIP 1 (100 kg) = 60 kg Minyak Nabati + 25 kg Gula + 10 kg Flavor Choco + 5 kg Lecithin
  { id: 'wm_1', wipId: 'wip_1', materialId: 'mat_3', materialKgPerBatch: 60.0000 },
  { id: 'wm_2', wipId: 'wip_1', materialId: 'mat_2', materialKgPerBatch: 25.0000 },
  { id: 'wm_3', wipId: 'wip_1', materialId: 'mat_4', materialKgPerBatch: 10.0000 },
  { id: 'wm_4', wipId: 'wip_1', materialId: 'mat_6', materialKgPerBatch: 5.0000 },

  // WIP 2 (250 kg) = 175 kg Tepung + 50 kg Gula + 15 kg Skim Milk + 5.75 kg Garam + 4.25 kg Premix
  { id: 'wm_5', wipId: 'wip_2', materialId: 'mat_1', materialKgPerBatch: 175.0000 },
  { id: 'wm_6', wipId: 'wip_2', materialId: 'mat_2', materialKgPerBatch: 50.0000 },
  { id: 'wm_7', wipId: 'wip_2', materialId: 'mat_8', materialKgPerBatch: 15.0000 },
  { id: 'wm_8', wipId: 'wip_2', materialId: 'mat_7', materialKgPerBatch: 5.7500 },
  { id: 'wm_9', wipId: 'wip_2', materialId: 'mat_5', materialKgPerBatch: 4.2500 },

  // WIP 3 (150 kg) = 80 kg Minyak + 40 kg Gula + 20 kg Flavor + 10 kg Skim Milk
  { id: 'wm_10', wipId: 'wip_3', materialId: 'mat_3', materialKgPerBatch: 80.0000 },
  { id: 'wm_11', wipId: 'wip_3', materialId: 'mat_2', materialKgPerBatch: 40.0000 },
  { id: 'wm_12', wipId: 'wip_3', materialId: 'mat_4', materialKgPerBatch: 20.0000 },
  { id: 'wm_13', wipId: 'wip_3', materialId: 'mat_8', materialKgPerBatch: 10.0000 },
];

export const SAMPLE_RECIPES: WipRecipe[] = [
  {
    id: 'rcp_1',
    wipId: 'wip_1',
    recipeCode: 'RSP-WIP01-A',
    recipeName: 'Resep Standar Sirup Glukosa & Karamel',
    description: 'Resep dasar komponen sirup dengan pemanasan vacuum',
    isDefault: true,
    totalWeightKg: 100.0,
    items: [
      { id: 'ri_1', materialId: 'mat_3', materialName: 'Minyak Nabati RBDPO', materialCode: 'MAT-MY-01', materialType: 'liquid', amount: 60, unit: 'kg', amountKg: 60.0 },
      { id: 'ri_2', materialId: 'mat_2', materialName: 'Gula Pasir Rafinasi', materialCode: 'MAT-GL-01', materialType: 'padat', amount: 25, unit: 'kg', amountKg: 25.0 },
      { id: 'ri_3', materialId: 'mat_4', materialName: 'Flavor Choco Paste', materialCode: 'MAT-FL-02', materialType: 'liquid', amount: 10, unit: 'kg', amountKg: 10.0 },
      { id: 'ri_4', materialId: 'mat_6', materialName: 'Lecithin Emulsifier', materialCode: 'MAT-LC-01', materialType: 'liquid', amount: 5, unit: 'kg', amountKg: 5.0 }
    ],
    createdAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'rcp_2',
    wipId: 'wip_2',
    recipeCode: 'RSP-WIP02-A',
    recipeName: 'Resep Adonan Biskuit Crispy Gurih',
    description: 'Resep utama adonan biskuit homogenitas tinggi',
    isDefault: true,
    totalWeightKg: 250.0,
    items: [
      { id: 'ri_5', materialId: 'mat_1', materialName: 'Tepung Terigu Premix', materialCode: 'MAT-TP-01', materialType: 'bubuk', amount: 175, unit: 'kg', amountKg: 175.0 },
      { id: 'ri_6', materialId: 'mat_2', materialName: 'Gula Pasir Rafinasi', materialCode: 'MAT-GL-01', materialType: 'padat', amount: 50, unit: 'kg', amountKg: 50.0 },
      { id: 'ri_7', materialId: 'mat_8', materialName: 'Skim Milk Powder', materialCode: 'MAT-SM-01', materialType: 'bubuk', amount: 15, unit: 'kg', amountKg: 15.0 },
      { id: 'ri_8', materialId: 'mat_7', materialName: 'Garam Halus Industri', materialCode: 'MAT-GR-01', materialType: 'padat', amount: 5750, unit: 'gr', amountKg: 5.75 },
      { id: 'ri_9', materialId: 'mat_5', materialName: 'Premix Vitamin Custom', materialCode: 'MAT-PX-03', materialType: 'bubuk', amount: 4250, unit: 'gr', amountKg: 4.25 }
    ],
    createdAt: '2026-01-10T00:00:00.000Z'
  },
  {
    id: 'rcp_3',
    wipId: 'wip_3',
    recipeCode: 'RSP-WIP03-A',
    recipeName: 'Resep Coating Cokelat KITE Ekspor',
    description: 'Resep cokelat coating standar ekspor bersertifikat ISO',
    isDefault: true,
    totalWeightKg: 150.0,
    items: [
      { id: 'ri_10', materialId: 'mat_3', materialName: 'Minyak Nabati RBDPO', materialCode: 'MAT-MY-01', materialType: 'liquid', amount: 80, unit: 'kg', amountKg: 80.0 },
      { id: 'ri_11', materialId: 'mat_2', materialName: 'Gula Pasir Rafinasi', materialCode: 'MAT-GL-01', materialType: 'padat', amount: 40, unit: 'kg', amountKg: 40.0 },
      { id: 'ri_12', materialId: 'mat_4', materialName: 'Flavor Choco Paste', materialCode: 'MAT-FL-02', materialType: 'liquid', amount: 20, unit: 'kg', amountKg: 20.0 },
      { id: 'ri_13', materialId: 'mat_8', materialName: 'Skim Milk Powder', materialCode: 'MAT-SM-01', materialType: 'bubuk', amount: 10, unit: 'kg', amountKg: 10.0 }
    ],
    createdAt: '2026-01-10T00:00:00.000Z'
  }
];

export function getSampleState(): AppState {
  const sampleCartonLogs: CartonProductionLog[] = [
    {
      id: 'cp_001',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      skuId: 'sku_1',
      skuName: 'Biskuit Choco Delight (Domestik)',
      skuCode: 'SKU-DOM-01',
      cartonsProduced: 50,
      shift: 1,
      operatorName: 'Ahmad Fauzi',
      tankDeductions: [
        {
          tankId: 'tank_ht_2',
          tankCode: 'HT-02',
          tankName: 'Holding Tank Buffer Adonan #2',
          tankType: 'HOLDING_TANK',
          wipId: 'wip_2',
          wipName: 'WIP Adonan Utama Biskuit',
          kgPerCarton: 7.2,
          kgDeducted: 360.0,
          remainingLevelKg: 620.0
        },
        {
          tankId: 'tank_ht_1',
          tankCode: 'HT-01',
          tankName: 'Holding Tank Sirup Karamel #1',
          tankType: 'HOLDING_TANK',
          wipId: 'wip_1',
          wipName: 'WIP Sirup Glukosa & Karamel',
          kgPerCarton: 4.8,
          kgDeducted: 240.0,
          remainingLevelKg: 480.0
        }
      ],
      notes: 'Penyelesaian packaging run pagi shift 1'
    }
  ];

  const sampleTankLogs: TankTransferLog[] = [
    {
      id: 'tl_001',
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
      tankId: 'tank_ht_2',
      tankCode: 'HT-02',
      tankName: 'Holding Tank Buffer Adonan #2',
      type: 'WIP_BATCH_INFLOW',
      amountKg: 500.0,
      previousLevelKg: 480.0,
      newLevelKg: 980.0,
      wipId: 'wip_2',
      wipName: 'WIP Adonan Utama Biskuit',
      batchCode: 'PK-WIP-202610-001',
      operatorName: 'Ahmad Fauzi',
      notes: 'Transfer 2 batch adonan dari Mixer MX-01'
    },
    {
      id: 'tl_002',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      tankId: 'tank_ht_2',
      tankCode: 'HT-02',
      tankName: 'Holding Tank Buffer Adonan #2',
      type: 'CARTON_DEPLETION',
      amountKg: -360.0,
      previousLevelKg: 980.0,
      newLevelKg: 620.0,
      wipId: 'wip_2',
      wipName: 'WIP Adonan Utama Biskuit',
      skuName: 'Biskuit Choco Delight (Domestik)',
      cartonsCount: 50,
      operatorName: 'Ahmad Fauzi',
      notes: 'Otomatis terpotong untuk 50 karton SKU-DOM-01'
    },
    {
      id: 'tl_003',
      timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
      tankId: 'tank_ht_1',
      tankCode: 'HT-01',
      tankName: 'Holding Tank Sirup Karamel #1',
      type: 'CARTON_DEPLETION',
      amountKg: -240.0,
      previousLevelKg: 720.0,
      newLevelKg: 480.0,
      wipId: 'wip_1',
      wipName: 'WIP Sirup Glukosa & Karamel',
      skuName: 'Biskuit Choco Delight (Domestik)',
      cartonsCount: 50,
      operatorName: 'Budi Santoso',
      notes: 'Otomatis terpotong untuk 50 karton SKU-DOM-01'
    }
  ];

  return {
    theme: 'midnight',
    isAuthenticated: true,
    isAdmin: true,
    currentUserRole: 'ADMINISTRATOR' as UserRole,
    currentSession: {
      role: 'ADMINISTRATOR' as UserRole,
      id: 'admin_root',
      name: 'Administrator MES & BOM',
      email: 'luasdzatzali@gmail.com',
      subtitle: 'Kewenangan Penuh: Master BOM, Mesin, Tangki & User Access'
    },
    registeredOperators: SAMPLE_OPERATORS,
    registeredManagement: SAMPLE_MANAGEMENT,
    adminPin: '12345678',
    adminGoogleEmails: ['luasdzatzali@gmail.com'],
    currentAdminUser: null,
    currentTab: 'dashboard',
    master: {
      materials: SAMPLE_MATERIALS,
      wips: SAMPLE_WIPS,
      skus: SAMPLE_SKUS,
      skuWips: SAMPLE_SKU_WIPS,
      wipMats: SAMPLE_WIP_MATS,
      recipes: SAMPLE_RECIPES,
      machines: SAMPLE_MACHINES,
      tanks: SAMPLE_TANKS
    },
    transactions: {
      requests: [
        {
          id: 'req_101',
          requestNumber: 'REQ-202610-001',
          date: '2026-10-23',
          skuId: 'sku_1',
          wipId: 'wip_2',
          materialId: 'mat_1',
          qty: 350.0000,
          batch: 2.0000,
          saldoAwal: 420.5000,
          supplier: 'GDRM',
          status: 'Received',
          notes: 'Batch awal produksi shift 1'
        },
        {
          id: 'req_102',
          requestNumber: 'REQ-202610-002',
          date: '2026-10-24',
          skuId: 'sku_2',
          wipId: 'wip_3',
          materialId: 'mat_4',
          qty: 40.0000,
          batch: 2.0000,
          saldoAwal: 85.0000,
          supplier: 'Formulasi',
          status: 'Pending',
          notes: 'Permintaan flavor cokelat ekspor'
        }
      ],
      receipts: [
        {
          id: 'rec_201',
          receiptNumber: 'RCV-202610-001',
          date: '2026-10-23',
          requestId: 'req_101',
          materialId: 'mat_1',
          requestedQty: 350.0000,
          receivedQty: 350.0000,
          location: 'CK',
          batchLotNumber: 'LOT-TP-9921',
          status: 'Received',
          notes: 'Diterima dalam kondisi zak utuh 14 zak'
        },
        {
          id: 'rec_202',
          receiptNumber: 'RCV-202610-002',
          date: '2026-10-23',
          materialId: 'mat_2',
          requestedQty: 500.0000,
          receivedQty: 500.0000,
          location: 'WINEROTO',
          batchLotNumber: 'LOT-GL-3481',
          status: 'Received',
          notes: 'Gula rafinasi 10 zak'
        },
        {
          id: 'rec_203',
          receiptNumber: 'RCV-202610-003',
          date: '2026-10-24',
          materialId: 'mat_3',
          requestedQty: 400.0000,
          receivedQty: 400.0000,
          location: 'STORAGE_TANK',
          batchLotNumber: 'LOT-LQD-0912',
          status: 'Received',
          notes: 'Pengisian pipa transfer ke Storage Tank liquid'
        },
        {
          id: 'rec_204',
          receiptNumber: 'RCV-202610-004',
          date: '2026-10-24',
          materialId: 'mat_1',
          requestedQty: 2500.0000,
          receivedQty: 2495.0000,
          location: 'CK',
          batchLotNumber: 'LOT-TP-1002',
          status: 'Discrepancy',
          notes: '[Koreksi Zak GDRM -> CK: 100 zak = 2495.00 kg | 50 zak @ 24.80 kg (1240.0 kg - Pallet 1 (Area CK-01)) + 50 zak @ 25.10 kg (1255.0 kg - Pallet 2 (Area CK-02)) (Selisih dari std 2500.0 kg: -5.00 kg)] Kedatangan 2 pallet bubuk terigu premix',
          isZakCorrectionActive: true,
          standardBagWeightKg: 25.0,
          totalBagCount: 100,
          standardTotalKg: 2500.0,
          weightVarianceKg: -5.0,
          zakBreakdown: [
            {
              id: 'zg_sample_pal_1',
              bagCount: 50,
              weightPerBagKg: 24.8,
              subtotalKg: 1240.0,
              notes: 'Pallet 1 (Area CK-01)'
            },
            {
              id: 'zg_sample_pal_2',
              bagCount: 50,
              weightPerBagKg: 25.1,
              subtotalKg: 1255.0,
              notes: 'Pallet 2 (Area CK-02)'
            }
          ]
        }
      ],
      usages: [
        {
          id: 'use_301',
          usageNumber: 'USG-202610-001',
          date: '2026-10-24',
          skuId: 'sku_1',
          wipId: 'wip_2',
          materialId: 'mat_1',
          qty: 175.0000,
          batch: 1.0000,
          usageQty: 175.0000,
          sourceLocation: 'CK',
          operatorName: 'Bambang S.',
          notes: 'Produksi 1 batch adonan biskuit'
        }
      ],
      wipBatches: [],
      cartonProductions: sampleCartonLogs,
      tankLogs: sampleTankLogs,
      changeovers: [
        {
          id: 'co_sample_01',
          machineId: 'mach_1',
          machineCode: 'MX-01',
          machineName: 'Mixer High-Shear Adonan Utama',
          timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
          fromWipId: 'wip_1',
          fromWipName: 'WIP Sirup Glukosa & Karamel',
          toWipId: 'wip_2',
          toWipName: 'WIP Adonan Utama Biskuit',
          targetTankId: 'tank_ht_2',
          targetTankCode: 'HT-02',
          changeoverType: 'MAJOR_ALLERGEN',
          durationMinutes: 45,
          operatorName: 'Ahmad Fauzi (Shift 1)',
          qcInspectorName: 'Siti Rahayu (QC)',
          checklist: {
            lineClearanceDone: true,
            cleaningSanitationDone: true,
            toolingMouldSwapped: true,
            parameterConfigured: true,
            qcSwabClearanceDone: true
          },
          notes: 'Pembersihan basah & swab alergen susu lolos, bilas air RO 60°C',
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 3600000 * 25).toISOString(),
          completedAt: new Date(Date.now() - 3600000 * 24).toISOString()
        },
        {
          id: 'co_sample_02',
          machineId: 'mach_2',
          machineCode: 'CK-01',
          machineName: 'Cooker & Vacuum Tank Sirup Glukosa',
          timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
          fromWipId: undefined,
          fromWipName: 'Startup Line Sirup',
          toWipId: 'wip_1',
          toWipName: 'WIP Sirup Glukosa & Karamel',
          targetTankId: 'tank_ht_1',
          targetTankCode: 'HT-01',
          changeoverType: 'FULL_CIP',
          durationMinutes: 60,
          operatorName: 'Budi Santoso (Shift 1)',
          qcInspectorName: 'Siti Rahayu (QC)',
          checklist: {
            lineClearanceDone: true,
            cleaningSanitationDone: true,
            toolingMouldSwapped: false,
            parameterConfigured: true,
            qcSwabClearanceDone: true
          },
          notes: 'Siklus CIP sirkulasi uap panas 85°C selama 30 menit',
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 3600000 * 49).toISOString(),
          completedAt: new Date(Date.now() - 3600000 * 48).toISOString()
        },
        {
          id: 'co_sample_03',
          machineId: 'mach_3',
          machineCode: 'ENR-01',
          machineName: 'Enrober Unit Coating Cokelat KITE',
          timestamp: new Date(Date.now() - 3600000 * 12).toISOString(),
          fromWipId: 'wip_2',
          fromWipName: 'WIP Adonan Utama Biskuit',
          toWipId: 'wip_3',
          toWipName: 'WIP Coating Cokelat KITE',
          targetTankId: 'tank_st_1',
          targetTankCode: 'ST-WIP-01',
          changeoverType: 'MINOR',
          durationMinutes: 25,
          operatorName: 'Candra Wijaya (Shift 2)',
          qcInspectorName: 'Doni Pratama (QC)',
          checklist: {
            lineClearanceDone: true,
            cleaningSanitationDone: true,
            toolingMouldSwapped: true,
            parameterConfigured: true,
            qcSwabClearanceDone: true
          },
          notes: 'Pergantian curtain nozzle enrober 600mm & kalibrasi belt speed',
          status: 'COMPLETED',
          startedAt: new Date(Date.now() - 3600000 * 13).toISOString(),
          completedAt: new Date(Date.now() - 3600000 * 12).toISOString()
        }
      ],
      productionStops: [
        {
          id: 'stop_sample_01',
          skuId: 'sku_1',
          skuName: 'Biskuit Choco Delight (Domestik)',
          skuCode: 'SKU-DOM-01',
          shift: 1,
          startedAt: new Date(Date.now() - 3600000 * 5 - 18 * 60000).toISOString(),
          stoppedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
          durationMinutes: 18,
          category: 'EQUIPMENT_FAILURE',
          categoryLabel: 'Kerusakan Mesin / Breakdown',
          lossType: 'DOWNTIME',
          reasonTitle: 'Sensor Suhu / Overheating Motor',
          subReason: 'Sensor thermocouple pada hopper drift +4°C',
          actionTaken: 'Kalibrasi ulang probe sensor dan re-start line',
          operatorName: 'Ahmad Fauzi',
          technicianName: 'Sugiarto (Maintenance)',
          notes: 'Line berhenti sementara 18 menit, tidak ada scrap produk',
          cartonsProducedDuringRun: 45
        },
        {
          id: 'stop_sample_02',
          skuId: 'sku_2',
          skuName: 'Wafer Choco Roll (KITE Ekspor)',
          skuCode: 'SKU-EXP-02',
          shift: 2,
          startedAt: new Date(Date.now() - 3600000 * 24 - 25 * 60000).toISOString(),
          stoppedAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          durationMinutes: 25,
          category: 'SETUP_ADJUSTMENT',
          categoryLabel: 'Penyetelan & Changeover',
          lossType: 'DOWNTIME',
          reasonTitle: 'Changeover Formula / Rasa Produk',
          subReason: 'Pergantian formula wafer cokelat KITE ekspor dan swap nozzle',
          actionTaken: 'Sanitasi nozzle, uji swab alergen, dan trial run 5 karton',
          operatorName: 'Candra Wijaya',
          technicianName: 'Budi Santoso',
          notes: 'Clearance QC disetujui Doni Pratama',
          cartonsProducedDuringRun: 60
        }
      ],
      stockAdjustments: []
    },
    activeSkuRun: null,
    activeSkuRuns: [],
    tank: {
      level: 750.0,
      maxCapacity: 1000.0,
      temp: 48.5,
      minTempTarget: 45.0,
      maxTempTarget: 55.0,
      isSimulationActive: true
    }
  };
}

export function loadStoredState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.master && parsed.transactions) {
        // Migration safeguard: Ensure machines and tanks exist
        const rawMachines = (parsed.master.machines && parsed.master.machines.length > 0)
          ? parsed.master.machines
          : SAMPLE_MACHINES;

        const rawTanks: WipTank[] = (parsed.master.tanks && parsed.master.tanks.length > 0)
          ? parsed.master.tanks
          : SAMPLE_TANKS;

        const tanks: WipTank[] = rawTanks.map((t: any) => {
          const mIds = Array.isArray(t.assignedMachineIds) && t.assignedMachineIds.length > 0
            ? t.assignedMachineIds
            : t.assignedMachineId ? [t.assignedMachineId] : [];
          return {
            ...t,
            assignedMachineIds: mIds,
            assignedMachineId: mIds[0] || t.assignedMachineId
          };
        });

        // Ensure WIPs have default links, unique code, multi-machine, and multi-tank targetTankIds
        const wips: WIP[] = (parsed.master.wips || []).map((w: any, idx: number) => {
          const mIds = Array.isArray(w.assignedMachineIds) && w.assignedMachineIds.length > 0
            ? w.assignedMachineIds
            : (w.assignedMachineId ? [w.assignedMachineId] : []);

          const tIds = Array.isArray(w.targetTankIds) && w.targetTankIds.length > 0
            ? w.targetTankIds
            : (w.targetTankId ? [w.targetTankId] : []);

          const sampleDef = SAMPLE_WIPS[idx % SAMPLE_WIPS.length];
          const resolvedCode = w.code || sampleDef?.code || `WIP-${String(idx + 1).padStart(3, '0')}`;
          const fallbackMachine = rawMachines[idx % rawMachines.length]?.id;
          const fallbackTank = tanks[idx % tanks.length];

          const finalTankId = w.targetTankId || tIds[0] || fallbackTank?.id;
          const finalTankIds = tIds.length > 0 ? tIds : (finalTankId ? [finalTankId] : []);

          return {
            ...w,
            code: resolvedCode,
            assignedMachineId: w.assignedMachineId || mIds[0] || fallbackMachine,
            assignedMachineIds: mIds.length > 0 ? mIds : (fallbackMachine ? [fallbackMachine] : []),
            targetTankType: w.targetTankType || fallbackTank?.type || 'HOLDING_TANK',
            targetTankId: finalTankId,
            targetTankIds: finalTankIds,
            productionDurationMinutes: w.productionDurationMinutes || sampleDef?.productionDurationMinutes || 30
          };
        });

        // Migrate machines to populate currentWipId and changeoverHistory
        const machines: ProductionMachine[] = rawMachines.map((m: any) => {
          const linkedWip = wips.find(w => (w.assignedMachineIds && w.assignedMachineIds.includes(m.id)) || w.assignedMachineId === m.id);
          return {
            ...m,
            status: m.status || 'OPERATIONAL',
            currentWipId: m.currentWipId || linkedWip?.id,
            currentWipName: m.currentWipName || linkedWip?.name,
            changeoverHistory: Array.isArray(m.changeoverHistory) ? m.changeoverHistory : []
          };
        });

        // Ensure adminGoogleEmails is preserved and includes default super admin
        const rawAdminEmails: string[] = Array.isArray(parsed.adminGoogleEmails)
          ? parsed.adminGoogleEmails
          : ['luasdzatzali@gmail.com'];
        if (!rawAdminEmails.includes('luasdzatzali@gmail.com')) {
          rawAdminEmails.unshift('luasdzatzali@gmail.com');
        }

        const currentUserRole: UserRole = parsed.currentUserRole || (parsed.isAdmin ? 'ADMINISTRATOR' : 'OPERATOR');
        const currentSession: CurrentUserSession = parsed.currentSession || {
          role: currentUserRole,
          id: currentUserRole === 'ADMINISTRATOR' ? 'admin_root' : 'opr_1',
          name: currentUserRole === 'ADMINISTRATOR' ? 'Administrator MES & BOM' : 'Ahmad Fauzi (Operator)',
          subtitle: currentUserRole === 'ADMINISTRATOR' ? 'Kewenangan Penuh: Master BOM, Mesin, Tangki' : 'Leader Line 1 - Shift 1'
        };

        // Sanitize and guarantee unique IDs for all transactions and master entities to prevent React duplicate key collisions
        const sanitizeUniqueIds = <T extends { id?: string }>(items: T[] | undefined, prefix: string): T[] => {
          if (!Array.isArray(items)) return [];
          const seen = new Set<string>();
          return items.map((item, idx) => {
            const rawId = item?.id;
            if (!rawId || seen.has(rawId)) {
              const uniqueId = `${rawId || prefix}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
              return { ...item, id: uniqueId };
            }
            seen.add(rawId);
            return item;
          });
        };

        const registeredOperators: RegisteredOperator[] = sanitizeUniqueIds(
          Array.isArray(parsed.registeredOperators) && parsed.registeredOperators.length > 0
            ? parsed.registeredOperators
            : SAMPLE_OPERATORS,
          'op'
        );

        const registeredManagement: RegisteredManagement[] = sanitizeUniqueIds(
          Array.isArray(parsed.registeredManagement) && parsed.registeredManagement.length > 0
            ? parsed.registeredManagement
            : SAMPLE_MANAGEMENT,
          'mgt'
        );

        const rawRecipes: WipRecipe[] = (parsed.master?.recipes && Array.isArray(parsed.master.recipes) && parsed.master.recipes.length > 0)
          ? parsed.master.recipes
          : SAMPLE_RECIPES;

        return {
          ...DEFAULT_STATE,
          ...parsed,
          theme: (parsed.theme === 'daylight' || parsed.theme === 'light') ? 'daylight' : 'midnight',
          isAuthenticated: typeof parsed.isAuthenticated === 'boolean' ? parsed.isAuthenticated : false,
          isAdmin: currentUserRole === 'ADMINISTRATOR',
          currentUserRole,
          currentSession,
          registeredOperators,
          registeredManagement,
          adminGoogleEmails: rawAdminEmails,
          currentAdminUser: parsed.currentAdminUser || null,
          master: {
            ...DEFAULT_STATE.master,
            ...parsed.master,
            materials: sanitizeUniqueIds(
              (parsed.master?.materials || DEFAULT_STATE.master.materials).map((m: any) => {
                const sample = SAMPLE_MATERIALS.find(sm => sm.id === m.id || sm.name === m.name);
                return {
                  ...m,
                  initialStockCk: typeof m.initialStockCk === 'number' ? m.initialStockCk : (sample?.initialStockCk ?? 0),
                  initialStockWineroto: typeof m.initialStockWineroto === 'number' ? m.initialStockWineroto : (sample?.initialStockWineroto ?? 0),
                  initialStockTank: typeof m.initialStockTank === 'number' ? m.initialStockTank : (sample?.initialStockTank ?? 0)
                };
              }),
              'mat'
            ),
            wips: sanitizeUniqueIds(wips.length > 0 ? wips : SAMPLE_WIPS, 'wip'),
            skus: sanitizeUniqueIds(parsed.master?.skus || DEFAULT_STATE.master.skus, 'sku'),
            skuWips: sanitizeUniqueIds(parsed.master?.skuWips || DEFAULT_STATE.master.skuWips, 'sw'),
            wipMats: sanitizeUniqueIds(parsed.master?.wipMats || DEFAULT_STATE.master.wipMats, 'wm'),
            recipes: sanitizeUniqueIds(rawRecipes, 'rcp'),
            machines: sanitizeUniqueIds(machines, 'mach'),
            tanks: sanitizeUniqueIds(tanks, 'tank')
          },
          transactions: {
            ...DEFAULT_STATE.transactions,
            ...parsed.transactions,
            requests: sanitizeUniqueIds(parsed.transactions?.requests, 'req'),
            receipts: sanitizeUniqueIds(parsed.transactions?.receipts, 'rec'),
            usages: sanitizeUniqueIds(parsed.transactions?.usages, 'use'),
            wipBatches: sanitizeUniqueIds(parsed.transactions?.wipBatches || [], 'wpb'),
            cartonProductions: sanitizeUniqueIds(parsed.transactions?.cartonProductions || [], 'cp'),
            tankLogs: sanitizeUniqueIds(parsed.transactions?.tankLogs || [], 'tl'),
            changeovers: sanitizeUniqueIds(parsed.transactions?.changeovers || [], 'co'),
            productionStops: sanitizeUniqueIds(parsed.transactions?.productionStops || [], 'stop'),
            stockAdjustments: sanitizeUniqueIds(parsed.transactions?.stockAdjustments || [], 'adj')
          },
          activeSkuRun: parsed.activeSkuRun || (Array.isArray(parsed.activeSkuRuns) ? parsed.activeSkuRuns.find((r: any) => r && r.isRunning) || null : null),
          activeSkuRuns: Array.isArray(parsed.activeSkuRuns)
            ? parsed.activeSkuRuns
            : (parsed.activeSkuRun ? [parsed.activeSkuRun] : []),
          tank: {
            ...DEFAULT_STATE.tank,
            ...parsed.tank
          }
        };
      }
    }
  } catch (err) {
    console.error('Failed to load state from localStorage:', err);
  }
  return getSampleState();
}

export function saveStateToStorage(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

export interface MaterialStockBalance {
  materialId: string;
  materialName: string;
  materialCode?: string;
  type: string;
  source: string;
  packaging: string;
  standardWeightKg: number;
  initialStockCk: number;
  initialStockWineroto: number;
  initialStockTank: number;
  initialStockTotal: number;
  stockCk: number;
  stockWineroto: number;
  stockTank: number;
  totalActual: number;
  minAlert: number;
  isLowStock: boolean;
}

export function calculateStockBalances(state: AppState): Record<string, MaterialStockBalance> {
  const stockMap: Record<string, MaterialStockBalance> = {};

  // Initialize from master materials with initial stock (Saldo Awal)
  state.master.materials.forEach(m => {
    const initCk = Number(m.initialStockCk ?? 0);
    const initWineroto = Number(m.initialStockWineroto ?? 0);
    const initTank = Number(m.initialStockTank ?? 0);
    const initTotal = initCk + initWineroto + initTank;

    stockMap[m.id] = {
      materialId: m.id,
      materialName: m.name,
      materialCode: m.code || `MAT-${m.id.slice(-4)}`,
      type: m.type,
      source: m.source,
      packaging: m.packaging,
      standardWeightKg: m.weightKg,
      initialStockCk: initCk,
      initialStockWineroto: initWineroto,
      initialStockTank: initTank,
      initialStockTotal: initTotal,
      stockCk: initCk,
      stockWineroto: initWineroto,
      stockTank: initTank,
      totalActual: initTotal,
      minAlert: m.minStockAlert || 50,
      isLowStock: false
    };
  });

  // Add receipts
  state.transactions.receipts.forEach(r => {
    if (r.status === 'Received' || r.status === 'Discrepancy') {
      const target = stockMap[r.materialId];
      if (target) {
        if (r.location === 'CK') target.stockCk += r.receivedQty;
        else if (r.location === 'WINEROTO') target.stockWineroto += r.receivedQty;
        else if (r.location === 'STORAGE_TANK') target.stockTank += r.receivedQty;
        target.totalActual += r.receivedQty;
      }
    }
  });

  // Subtract usages
  state.transactions.usages.forEach(u => {
    const target = stockMap[u.materialId];
    if (target) {
      let rem = u.usageQty;
      if (u.sourceLocation === 'STORAGE_TANK') {
        target.stockTank = Math.max(0, target.stockTank - rem);
      } else if (u.sourceLocation === 'CK') {
        if (target.stockCk >= rem) {
          target.stockCk -= rem;
        } else {
          rem -= target.stockCk;
          target.stockCk = 0;
          target.stockWineroto = Math.max(0, target.stockWineroto - rem);
        }
      } else if (u.sourceLocation === 'WINEROTO') {
        if (target.stockWineroto >= rem) {
          target.stockWineroto -= rem;
        } else {
          rem -= target.stockWineroto;
          target.stockWineroto = 0;
          target.stockCk = Math.max(0, target.stockCk - rem);
        }
      } else {
        // Fallback deduction
        if (target.stockCk >= rem) {
          target.stockCk -= rem;
        } else {
          rem -= target.stockCk;
          target.stockCk = 0;
          target.stockWineroto = Math.max(0, target.stockWineroto - rem);
        }
      }
      target.totalActual = target.stockCk + target.stockWineroto + target.stockTank;
    }
  });

  // Evaluate low stock
  Object.values(stockMap).forEach(item => {
    item.isLowStock = item.totalActual < item.minAlert;
  });

  return stockMap;
}

/**
 * Mengambil daftar kelompok / pallet penyimpanan untuk material tertentu di lokasi (default: CK).
 * Diurutkan berdasarkan FIFO (First In First Out) sesuai tanggal kedatangan / receipt terlama.
 * Tiap pallet mengunci bobot per zak (weightPerBagKg) dari hasil penimbangan saat penerimaan.
 */
export function getMaterialPalletInventory(
  state: AppState,
  materialId: string,
  location: StorageLocation = 'CK'
): PalletInventoryLot[] {
  const targetMaterial = state.master.materials.find(m => m.id === materialId);
  const matName = targetMaterial?.name || 'Material';
  const matCode = targetMaterial?.code || '';

  // 1. Kumpulkan pemakaian yang sudah tercatat per palletId
  const usedBagsMap: Record<string, number> = {};
  let unallocatedUsedKg = 0;

  (state.transactions.usages || []).forEach(u => {
    if (u.materialId === materialId && (!location || u.sourceLocation === location)) {
      if (u.palletAllocations && u.palletAllocations.length > 0) {
        u.palletAllocations.forEach(alloc => {
          usedBagsMap[alloc.palletId] = (usedBagsMap[alloc.palletId] || 0) + (alloc.bagsUsed || 0);
        });
      } else {
        // Pemakaian legacy atau manual tanpa alokasi pallet
        unallocatedUsedKg += u.usageQty;
      }
    }
  });

  // 2. Ambil seluruh tanda terima (receipts) untuk material ini, urutkan FIFO (terlama dahulu)
  const candidateReceipts = (state.transactions.receipts || [])
    .filter(r => r.materialId === materialId && (r.status === 'Received' || r.status === 'Discrepancy') && (!location || r.location === location))
    .slice()
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    });

  const availableLots: PalletInventoryLot[] = [];

  candidateReceipts.forEach(r => {
    if (r.zakBreakdown && r.zakBreakdown.length > 0) {
      r.zakBreakdown.forEach((group, gIdx) => {
        const palletId = group.id || `${r.id}_pal_${gIdx}`;
        const initialBags = group.bagCount;
        const weightPerBagKg = group.weightPerBagKg > 0 ? group.weightPerBagKg : (group.subtotalKg / (group.bagCount || 1));
        const initialKg = group.subtotalKg || (initialBags * weightPerBagKg);
        const usedBagsDirect = usedBagsMap[palletId] || 0;

        let remainingBags = Math.max(0, initialBags - usedBagsDirect);

        // Potong pemakaian legacy secara FIFO jika ada
        if (unallocatedUsedKg > 0 && remainingBags > 0) {
          const bagsCanCover = Math.min(remainingBags, Math.floor(unallocatedUsedKg / weightPerBagKg));
          remainingBags -= bagsCanCover;
          unallocatedUsedKg = Math.max(0, unallocatedUsedKg - (bagsCanCover * weightPerBagKg));
        }

        const remainingKg = remainingBags * weightPerBagKg;

        availableLots.push({
          palletId,
          receiptId: r.id,
          receiptNumber: r.receiptNumber,
          date: r.date,
          materialId,
          materialName: matName,
          materialCode: matCode,
          palletLabel: group.notes || `Pallet #${gIdx + 1}`,
          initialBags,
          usedBags: initialBags - remainingBags,
          remainingBags,
          weightPerBagKg: parseFloat(weightPerBagKg.toFixed(4)),
          initialKg: parseFloat(initialKg.toFixed(4)),
          remainingKg: parseFloat(remainingKg.toFixed(4)),
          location: r.location,
          batchLotNumber: r.batchLotNumber
        });
      });
    } else {
      // Tanda terima reguler (tanpa rincian grup multi-pallet)
      const stdBagWeight = r.standardBagWeightKg || targetMaterial?.weightKg || 25;
      const initialBags = r.totalBagCount || Math.max(1, Math.round(r.receivedQty / stdBagWeight));
      const weightPerBagKg = initialBags > 0 ? (r.receivedQty / initialBags) : stdBagWeight;
      const usedBagsDirect = usedBagsMap[r.id] || 0;
      let remainingBags = Math.max(0, initialBags - usedBagsDirect);

      if (unallocatedUsedKg > 0 && remainingBags > 0) {
        const bagsCanCover = Math.min(remainingBags, Math.floor(unallocatedUsedKg / weightPerBagKg));
        remainingBags -= bagsCanCover;
        unallocatedUsedKg = Math.max(0, unallocatedUsedKg - (bagsCanCover * weightPerBagKg));
      }

      const remainingKg = remainingBags * weightPerBagKg;

      availableLots.push({
        palletId: r.id,
        receiptId: r.id,
        receiptNumber: r.receiptNumber,
        date: r.date,
        materialId,
        materialName: matName,
        materialCode: matCode,
        palletLabel: r.batchLotNumber ? `Lot ${r.batchLotNumber}` : `Penerimaan ${r.receiptNumber}`,
        initialBags,
        usedBags: initialBags - remainingBags,
        remainingBags,
        weightPerBagKg: parseFloat(weightPerBagKg.toFixed(4)),
        initialKg: parseFloat(r.receivedQty.toFixed(4)),
        remainingKg: parseFloat(remainingKg.toFixed(4)),
        location: r.location,
        batchLotNumber: r.batchLotNumber
      });
    }
  });

  return availableLots;
}

export interface FifoAllocationResult {
  allocations: PalletAllocation[];
  totalAllocatedKg: number;
  totalBagsUsed: number;
  requiredKg: number;
  isFullyAllocated: boolean;
  varianceFromTargetKg: number;
}

/**
 * Menghitung alokasi zak & bobot aktual sesuai FIFO dari kelompok / pallet yang tersedia.
 * Aturan Ketat Kemasan FIFO:
 * Penentuan material sesuai takaran resep, namun disesuaikan dengan berat kemasan aktual pada data FIFO.
 * Jika pada FIFO 1 berat kemasan terigu adalah 24.9 kg sementara resep meminta 25 kg (1 kemasan),
 * JANGAN tambah terigu dari kemasan selanjutnya! Biarkan takaran resep yang diinput & dikonsumsi
 * persis sesuai berat material per kemasan pada FIFO yang sedang digunakan (misal 1 zak = 24.90 kg).
 */
export function calculateFifoPalletAllocation(
  availableLots: PalletInventoryLot[],
  requiredKg: number
): FifoAllocationResult {
  // Hanya ambil lot dengan sisa unit zak > 0, urut FIFO (terlama di depan)
  const activeLots = availableLots.filter(l => l.remainingBags > 0);
  const allocations: PalletAllocation[] = [];
  let totalAllocatedKg = 0;
  let totalBagsUsed = 0;

  if (activeLots.length === 0 || requiredKg <= 0) {
    return {
      allocations: [],
      totalAllocatedKg: 0,
      totalBagsUsed: 0,
      requiredKg,
      isFullyAllocated: false,
      varianceFromTargetKg: -requiredKg
    };
  }

  // Tentukan bobot acuan 1 kemasan (nominal) dari lot FIFO terdepan
  const firstLotWeight = activeLots[0].weightPerBagKg > 0 ? activeLots[0].weightPerBagKg : 25;
  // Hitung berapa kemasan utuh yang ditargetkan resep (misal: 25 kg -> 1 zak, 50 kg -> 2 zak, dst)
  const targetBagsNeeded = Math.max(1, Math.round(requiredKg / firstLotWeight));

  let bagsStillNeeded = targetBagsNeeded;

  for (const lot of activeLots) {
    if (bagsStillNeeded <= 0) break;

    const bagsToTake = Math.min(lot.remainingBags, bagsStillNeeded);
    if (bagsToTake > 0) {
      const subtotalKg = parseFloat((bagsToTake * lot.weightPerBagKg).toFixed(4));
      allocations.push({
        palletId: lot.palletId,
        receiptId: lot.receiptId,
        receiptNumber: lot.receiptNumber,
        palletLabel: lot.palletLabel,
        date: lot.date,
        bagsUsed: bagsToTake,
        weightPerBagKg: lot.weightPerBagKg,
        subtotalKg,
        location: lot.location
      });

      totalAllocatedKg += subtotalKg;
      totalBagsUsed += bagsToTake;
      bagsStillNeeded -= bagsToTake;
    }
  }

  const isFullyAllocated = totalBagsUsed >= targetBagsNeeded;
  return {
    allocations,
    totalAllocatedKg: parseFloat(totalAllocatedKg.toFixed(4)),
    totalBagsUsed,
    requiredKg,
    isFullyAllocated,
    varianceFromTargetKg: parseFloat((totalAllocatedKg - requiredKg).toFixed(4))
  };
}

