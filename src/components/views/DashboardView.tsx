import React, { useState, useMemo } from 'react';
import {
  Warehouse,
  Droplet,
  Thermometer,
  Search,
  Download,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Boxes,
  ExternalLink,
  X,
  Package,
  Layers,
  Calculator,
  FilePlus,
  Printer,
  Activity,
  Cylinder,
  ArrowRight,
  FileText,
  Eye,
  ChevronDown,
  ChevronUp,
  CalendarRange,
  FileSpreadsheet
} from 'lucide-react';
import {
  AppState,
  StorageLocation,
  ProductionLine,
  ProductionStopLog,
  ChangeoverType
} from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import { calculateMaterialStockBreakdown } from '../../utils/reportBreakdown';
import { getCurrentShift, formatIndonesianDate, ShiftNumber } from '../../utils/shifts';
import { DashboardLineStatusSnapshot } from '../../utils/firebaseSync';
import { ProductionTargetPanel } from '../ProductionTargetPanel';
import { WeeklyPlanVsActualChart } from '../WeeklyPlanVsActualChart';
import { loadSheetsSyncSettings, SHEETS_SYNC_EVENT } from '../../utils/sheetsSyncStore';

interface DashboardViewProps {
  state: AppState;
  onOpenTankModal: () => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onTransferStock: (materialId: string, from: StorageLocation, to: StorageLocation, qty: number) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ) => { success: boolean; message: string };
  onStartSkuProduction?: (
    skuId: string,
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanks?: Record<string, string>,
    lineId?: string,
    plannedCartons?: number,
    shiftOverride?: ShiftNumber
  ) => void;
  onStartMultipleSkus?: (
    skuIds: string[],
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanksBySku?: Record<string, Record<string, string>>
  ) => void;
  onStartLineBatchRuns?: (
    assignments: {
      lineId: string;
      skuId: string;
      plannedCartons: number;
      shift?: ShiftNumber;
      operatorName?: string;
      speedMultiplier?: number;
      selectedHoldingTanks?: Record<string, string>;
    }[]
  ) => void;
  onCompleteLineRun?: (runIdOrLineId: string, notes?: string) => void;
  onResumeLineRun?: (runIdOrLineId: string) => void;
  onRecordMaterialShortage?: (runIdOrLineId: string, reasonMessage: string) => void;
  onUpdateRunHoldingTank?: (skuId: string, wipId: string, tankId: string, runId?: string) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onStopAllSkuProduction?: () => void;
  onTriggerShiftHandover?: () => void;
  onSetRunSpeedMultiplier?: (multiplier: number, runIdOrSkuId?: string) => void;
  onAddProductionLine?: (lineData: Omit<ProductionLine, 'id'>) => void;
  onUpdateProductionLine?: (lineId: string, updates: Partial<ProductionLine>) => void;
  onDeleteProductionLine?: (lineId: string) => void;
  onSetProductionLinesCount?: (count: number) => void;
  onOpenPdfModal?: () => void;
  onChangeSku?: (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => void;
  liveLineStatus?: DashboardLineStatusSnapshot | null;
  showToast: (msg: string, isError?: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  liveLineStatus,
  onOpenTankModal,
  onSwitchTab,
  onTransferStock,
  onProduceCartons,
  onStartSkuProduction,
  onStartMultipleSkus,
  onStartLineBatchRuns,
  onCompleteLineRun,
  onResumeLineRun,
  onRecordMaterialShortage,
  onUpdateRunHoldingTank,
  onStopSkuProduction,
  onStopAllSkuProduction,
  onTriggerShiftHandover,
  onSetRunSpeedMultiplier,
  onAddProductionLine,
  onUpdateProductionLine,
  onDeleteProductionLine,
  onSetProductionLinesCount,
  onOpenPdfModal,
  onChangeSku,
  showToast
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockTableSearch, setStockTableSearch] = useState('');
  const [activeViewTab, setActiveViewTab] = useState<'all' | 'materials' | 'skus'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferMatId, setTransferMatId] = useState('');
  const [transferFrom, setTransferFrom] = useState<StorageLocation>('CK');
  const [transferTo, setTransferTo] = useState<StorageLocation>('WINEROTO');
  const [transferQty, setTransferQty] = useState('');
  const [stockViewLayout, setStockViewLayout] = useState<'breakdown-sku-wip' | 'by-location'>('breakdown-sku-wip');
  const [filterSkuId, setFilterSkuId] = useState<string>('all');
  const [filterWipId, setFilterWipId] = useState<string>('all');
  const [isSkuCatalogExpanded, setIsSkuCatalogExpanded] = useState<boolean>(false);
  const [syncedLogIds, setSyncedLogIds] = useState<string[]>(() => loadSheetsSyncSettings().syncedProductionIds);

  React.useEffect(() => {
    const syncListener = () => {
      setSyncedLogIds(loadSheetsSyncSettings().syncedProductionIds);
    };
    window.addEventListener(SHEETS_SYNC_EVENT, syncListener);
    return () => window.removeEventListener(SHEETS_SYNC_EVENT, syncListener);
  }, []);

  const unsyncedProductionCount = useMemo(() => {
    const syncedSet = new Set(syncedLogIds);
    return (state.transactions.cartonProductions || []).filter(cp => !syncedSet.has(cp.id)).length;
  }, [state.transactions.cartonProductions, syncedLogIds]);

  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const currentLiveShift = getCurrentShift();
  const stockBalances = calculateStockBalances(state);
  const stockList = Object.values(stockBalances);

  // Compute storage totals
  let totalStockCk = 0;
  let totalStockWineroto = 0;
  let totalStockTank = 0;

  stockList.forEach(s => {
    totalStockCk += s.stockCk;
    totalStockWineroto += s.stockWineroto;
    totalStockTank += s.stockTank;
  });

  const grandTotal = totalStockCk + totalStockWineroto + totalStockTank;

  // Active production batches in the plant
  const activeBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI'
  );
  const latestActiveBatch = activeBatches[0];

  const normalizedSearch = searchTerm.trim().toLowerCase();

  // Filtered materials by search and type
  const filteredMaterials = stockList.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      item.materialName.toLowerCase().includes(normalizedSearch) ||
      (item.materialCode && item.materialCode.toLowerCase().includes(normalizedSearch)) ||
      item.source.toLowerCase().includes(normalizedSearch) ||
      item.packaging.toLowerCase().includes(normalizedSearch) ||
      item.type.toLowerCase().includes(normalizedSearch);

    const matchesType = typeFilter === 'all' || item.type.toLowerCase() === typeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  // Dedicated secondary search for Stock Material detail table
  const displayStockMaterials = filteredMaterials.filter(item => {
    if (!stockTableSearch.trim()) return true;
    const q = stockTableSearch.trim().toLowerCase();
    return (
      item.materialName.toLowerCase().includes(q) ||
      (item.materialCode && item.materialCode.toLowerCase().includes(q)) ||
      item.source.toLowerCase().includes(q) ||
      item.packaging.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  });

  // Filtered SKUs
  const filteredSkus = state.master.skus.filter(sku => {
    if (!normalizedSearch) return true;
    const skuCode = sku.code || `SKU-${sku.id.slice(-4)}`;
    const categoryName = sku.isKite ? 'kite ekspor export' : 'domestik domestic';
    return (
      sku.name.toLowerCase().includes(normalizedSearch) ||
      skuCode.toLowerCase().includes(normalizedSearch) ||
      categoryName.includes(normalizedSearch)
    );
  });

  // Stock Material breakdown by SKU and WIP
  const stockBreakdownRows = useMemo(() => {
    return calculateMaterialStockBreakdown(state);
  }, [state]);

  const filteredBreakdownRows = useMemo(() => {
    return stockBreakdownRows.filter(r => {
      const matchSku = filterSkuId === 'all' || r.skuId === filterSkuId;
      const matchWip = filterWipId === 'all' || r.wipId === filterWipId;
      const q = (stockTableSearch || normalizedSearch).trim().toLowerCase();
      const matchSearch =
        !q ||
        r.skuName.toLowerCase().includes(q) ||
        r.wipName.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        r.materialCode.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q);
      return matchSku && matchWip && matchSearch;
    });
  }, [stockBreakdownRows, filterSkuId, filterWipId, stockTableSearch, normalizedSearch]);

  const handleExportCSV = () => {
    if (stockList.length === 0) {
      showToast('Belum ada data stok untuk di-export', true);
      return;
    }
    const headers = ['Kode', 'Nama Material', 'Tipe', 'Supplier', 'Kemasan', 'Stock CK (kg)', 'Stock WINEROTO (kg)', 'Stock Tangki (kg)', 'Total Aktual (kg)', 'Status'];
    const rows = stockList.map(s => [
      s.materialCode || '',
      `"${s.materialName}"`,
      s.type,
      s.source,
      `"${s.packaging}"`,
      s.stockCk.toFixed(4),
      s.stockWineroto.toFixed(4),
      s.stockTank.toFixed(4),
      s.totalActual.toFixed(4),
      s.isLowStock ? 'Menipis' : 'Normal'
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Opname_ProdTrack_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Berhasil mengunduh laporan stok CSV');
  };

  const handlePrintReport = () => {
    window.print();
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(transferQty);
    if (!transferMatId || isNaN(qty) || qty <= 0) {
      showToast('Kuantitas transfer tidak valid', true);
      return;
    }
    if (transferFrom === transferTo) {
      showToast('Lokasi asal dan tujuan tidak boleh sama', true);
      return;
    }

    const currentBal = stockBalances[transferMatId];
    if (!currentBal) return;

    let available = 0;
    if (transferFrom === 'CK') available = currentBal.stockCk;
    if (transferFrom === 'WINEROTO') available = currentBal.stockWineroto;
    if (transferFrom === 'STORAGE_TANK') available = currentBal.stockTank;

    if (qty > available) {
      showToast(`Stok tidak mencukupi di ${transferFrom}. Tersedia: ${available.toFixed(4)} kg`, true);
      return;
    }

    onTransferStock(transferMatId, transferFrom, transferTo, qty);
    setShowTransferModal(false);
    setTransferQty('');
    showToast(`Berhasil memindahkan ${qty.toFixed(4)} kg ke ${transferTo}`);
  };

  const isTankNormal = state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;
  const tankPercent = Math.min(100, Math.round((state.tank.level / (state.tank.maxCapacity || 1000)) * 100));

  // Control Room Production & Vessel Telemetry computations
  const allLineRuns = useMemo(() => {
    return state.activeSkuRuns && state.activeSkuRuns.length > 0
      ? state.activeSkuRuns
      : state.activeSkuRun
      ? [state.activeSkuRun]
      : [];
  }, [state.activeSkuRuns, state.activeSkuRun]);

  const activeRuns = useMemo(() => {
    return allLineRuns.filter(r => r.isRunning);
  }, [allLineRuns]);

  const effectiveLines = useMemo<ProductionLine[]>(() => {
    if (state.master.productionLines && state.master.productionLines.length > 0) {
      return state.master.productionLines;
    }
    return [
      { id: 'line_a', code: 'LINE-A', name: 'Line A', description: 'Jalur Produksi Utama A', isActive: true },
      { id: 'line_b', code: 'LINE-B', name: 'Line B', description: 'Jalur Produksi B', isActive: true },
      { id: 'line_c', code: 'LINE-C', name: 'Line C', description: 'Jalur Produksi C', isActive: true },
      { id: 'line_d', code: 'LINE-D', name: 'Line D', description: 'Jalur Produksi D', isActive: true }
    ];
  }, [state.master.productionLines]);

  const todayIsoDate = new Date().toISOString().split('T')[0];
  const todayCartonsTotal = useMemo(() => {
    return (state.transactions.cartonProductions || [])
      .filter(cp => cp.timestamp && cp.timestamp.includes(todayIsoDate))
      .reduce((sum, cp) => sum + cp.cartonsProduced, 0);
  }, [state.transactions.cartonProductions, todayIsoDate]);

  const lowWipTanksCount = useMemo(() => {
    return state.master.tanks.filter(
      t => t.currentLevelKg <= (t.minAlertKg || (t.capacityKg || 1) * 0.2)
    ).length;
  }, [state.master.tanks]);

  const lowStockMaterialCount = useMemo(() => {
    return stockList.filter(s => s.isLowStock).length;
  }, [stockList]);

  const activeBatchMachineCount = useMemo(() => {
    return new Set(
      activeBatches.filter(b => b.targetMachineId).map(b => b.targetMachineId)
    ).size;
  }, [activeBatches]);

  const scrollToProductionConsole = () => {
    const el = document.getElementById('production-target-console');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto">
      {/* Printable Header Banner (Only visible in Print view) */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight">PRODTRACK MANUFACTURING EXECUTION SYSTEM</h1>
            <p className="text-sm font-semibold text-slate-800">
              Laporan Stok Opname Material Aktual &amp; Status Pabrik (24 Jam Penuh)
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">{formatIndonesianDate()}</p>
            <p>Shift Aktif: {currentLiveShift.name} ({currentLiveShift.timeRange})</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-300 text-xs">
          <div>Total Area CK: <strong>{totalStockCk.toFixed(2)} kg</strong></div>
          <div>Total WINEROTO: <strong>{totalStockWineroto.toFixed(2)} kg</strong></div>
          <div>Tangki Liquid: <strong>{state.tank.level.toFixed(2)} kg</strong> ({state.tank.temp.toFixed(1)}°C)</div>
        </div>
      </div>

      {/* Odoo MES Management Read-Only Banner */}
      {isManagement && (
        <div className="bg-[#0c121d] border border-indigo-500/40 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-lg no-print">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                Odoo MRP Portal: Mode Management (Pantau Saja)
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Memantau produksi berjalan, saldo stok material di gudang (CK &amp; WINEROTO), serta telemetri tangki WIP. Akses mutasi transaksi dibatasi.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center text-[11px] font-mono font-bold text-indigo-300 whitespace-nowrap">
            READ-ONLY VIEW
          </span>
        </div>
      )}

      {/* Control Room Header Command Bar */}
      <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 px-4 py-3.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] no-print">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(34,211,238,0.22)]">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400 tabular-nums">
              <span className="text-cyan-400 font-semibold">Manufacturing Control Room</span>
              <span aria-hidden="true">·</span>
              <span>{formatIndonesianDate()}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300 font-semibold">
                {currentLiveShift.name} ({currentLiveShift.timeRange})
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-0.5">
              Pusat Komando Produksi, Tangki WIP &amp; Saldo Material
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchTab('weekly-planning')}
            className="px-3 py-2 bg-[#06090f]/80 hover:bg-slate-800 text-emerald-300 border border-emerald-500/35 hover:border-emerald-400/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <CalendarRange className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tahap 02: Planning Mingguan</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('sheets-sync')}
            className="px-3 py-2 bg-[#06090f]/80 hover:bg-slate-800 text-emerald-300 border border-emerald-500/35 hover:border-emerald-400/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Sync Sheets{unsyncedProductionCount > 0 ? ` (${unsyncedProductionCount})` : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('tank-monitoring')}
            className="px-3 py-2 bg-[#06090f]/80 hover:bg-slate-800 text-cyan-300 border border-cyan-500/35 hover:border-cyan-400/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-[0_0_12px_rgba(34,211,238,0.12)]"
          >
            <Cylinder className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tangki WIP ({state.master.tanks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('pemakaian')}
            className="px-3 py-2 bg-[#06090f]/80 hover:bg-slate-800 text-amber-300 border border-amber-500/35 hover:border-amber-400/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Gantt &amp; Batch WIP</span>
          </button>
          {onOpenPdfModal && (
            <button
              type="button"
              onClick={onOpenPdfModal}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-[0_0_14px_rgba(6,182,212,0.28)]"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Laporan Shift PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Modular 4-Card Control Room Telemetry Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Module 01: Line Operations & Output Status */}
        <div
          onClick={scrollToProductionConsole}
          className={`bg-[#0c121d]/75 backdrop-blur-md p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between shadow-[0_8px_28px_rgba(0,0,0,0.3)] ${
            activeRuns.length > 0
              ? 'border-emerald-500/45 shadow-[0_0_18px_rgba(16,185,129,0.12)] hover:border-emerald-400/70'
              : 'border-slate-800/90 hover:border-cyan-500/45'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeRuns.length > 0
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                      : 'bg-slate-500'
                  }`}
                />
                <span>Status Line Produksi</span>
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  activeRuns.length > 0 ? 'text-emerald-400' : 'text-slate-400'
                }`}
              >
                {activeRuns.length > 0 ? 'OPERATING' : 'STANDBY'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-2xl font-extrabold font-mono text-white tabular-nums">
                  {activeRuns.length}
                </span>
                <span className="text-xs font-mono text-slate-400 ml-1 tabular-nums">
                  / {effectiveLines.length} Line Aktif
                </span>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-sm font-bold text-cyan-400 block">
                  {todayCartonsTotal.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-slate-400">Karton Hari Ini</span>
              </div>
            </div>

            <div className="w-full bg-[#06090f]/90 border border-slate-800/80 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeRuns.length > 0
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]'
                    : 'bg-slate-700'
                }`}
                style={{
                  width: `${Math.max(
                    activeRuns.length > 0 ? 12 : 4,
                    Math.round((activeRuns.length / Math.max(1, effectiveLines.length)) * 100)
                  )}%`
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80 font-mono tabular-nums">
            <span>{effectiveLines.length - activeRuns.length} Line Siaga</span>
            <span className="text-cyan-400">Kontrol Line →</span>
          </div>
        </div>

        {/* Module 02: Primary Liquid Tank & WIP Vessel Gauge */}
        <div
          onClick={onOpenTankModal}
          className={`bg-[#0c121d]/75 backdrop-blur-md p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between shadow-[0_8px_28px_rgba(0,0,0,0.3)] ${
            isTankNormal && lowWipTanksCount === 0
              ? 'border-cyan-500/35 hover:border-cyan-400/65 shadow-[0_0_18px_rgba(6,182,212,0.1)]'
              : 'border-amber-500/45 hover:border-amber-400/70 shadow-[0_0_18px_rgba(245,158,11,0.12)]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-cyan-400" />
                <span>Tangki Liquid Utama</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-cyan-400 tabular-nums">
                {tankPercent}% Cap
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-2xl font-extrabold font-mono text-white tabular-nums">
                  {state.tank.level.toFixed(1)}
                </span>
                <span className="text-xs text-slate-400 font-mono ml-1 tabular-nums">
                  / {state.tank.maxCapacity} kg
                </span>
              </div>

              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono font-bold tabular-nums ${
                  isTankNormal
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/35'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/45'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span>{state.tank.temp.toFixed(1)}°C</span>
              </div>
            </div>

            <div className="w-full bg-[#06090f]/90 border border-slate-800/80 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-cyan-400 h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(34,211,238,0.75)]"
                style={{ width: `${tankPercent}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80 font-mono tabular-nums">
            <span>
              {state.master.tanks.length} Tangki WIP
              {lowWipTanksCount > 0 ? ` · ${lowWipTanksCount} Menipis` : ''}
            </span>
            <span className="text-cyan-400">Kalibrasi →</span>
          </div>
        </div>

        {/* Module 03: Batching & WIP Pipeline */}
        <div
          onClick={() => onSwitchTab('pemakaian')}
          className={`bg-[#0c121d]/75 backdrop-blur-md p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between shadow-[0_8px_28px_rgba(0,0,0,0.3)] ${
            latestActiveBatch
              ? 'border-amber-500/50 hover:border-amber-400/80 shadow-[0_0_18px_rgba(245,158,11,0.14)]'
              : 'border-slate-800/90 hover:border-cyan-500/45'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    latestActiveBatch
                      ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                      : 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]'
                  }`}
                />
                <span>Pipeline Batching WIP</span>
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  latestActiveBatch ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {latestActiveBatch ? `${activeBatches.length} PROSES` : 'SIAGA'}
              </span>
            </div>

            {latestActiveBatch ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                  <span className="font-bold text-amber-300">{latestActiveBatch.batchCode}</span>
                  <span className="text-slate-400">
                    {activeBatchMachineCount}/{state.master.machines.length} Mesin
                  </span>
                </div>
                <h4 className="font-bold text-white text-sm truncate">
                  {latestActiveBatch.wipName}
                </h4>
                <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono tabular-nums">
                  <span>{latestActiveBatch.batchWeightKg.toFixed(1)} kg</span>
                  <span className="truncate ml-2">{latestActiveBatch.operatorName}</span>
                </div>
              </div>
            ) : (
              <div className="py-1">
                <p className="text-sm font-bold text-white">Lantai Batching Siaga</p>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {state.master.machines.length} unit mesin mixer &amp; boiler siap dijadwalkan.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80 font-mono">
            <span>Work Order &amp; Gantt</span>
            <span className={latestActiveBatch ? 'text-amber-400' : 'text-cyan-400'}>
              Buka Jadwal →
            </span>
          </div>
        </div>

        {/* Module 04: Material Stock & Warehouse Flow */}
        <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 hover:border-cyan-500/40 p-4 rounded-xl shadow-[0_8px_28px_rgba(0,0,0,0.3)] flex flex-col justify-between transition">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-cyan-400" />
                <span>Saldo Stok Gudang</span>
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  lowStockMaterialCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {lowStockMaterialCount > 0 ? `${lowStockMaterialCount} MENIPIS` : 'STOK AMAN'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xl font-extrabold font-mono text-white tabular-nums">
                {grandTotal.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-slate-400 ml-1">kg Total</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                {stockList.length} Material
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#06090f]/90 border border-slate-800/80 px-2.5 py-1.5 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-cyan-400 font-semibold">CK</span>
                  <span className="text-slate-400 tabular-nums">
                    {grandTotal > 0 ? ((totalStockCk / grandTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="text-xs font-bold font-mono text-white tabular-nums mt-0.5">
                  {totalStockCk.toFixed(1)} kg
                </div>
              </div>

              <div className="bg-[#06090f]/90 border border-slate-800/80 px-2.5 py-1.5 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-emerald-400 font-semibold">WNR</span>
                  <span className="text-slate-400 tabular-nums">
                    {grandTotal > 0 ? ((totalStockWineroto / grandTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="text-xs font-bold font-mono text-white tabular-nums mt-0.5">
                  {totalStockWineroto.toFixed(1)} kg
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/80">
            <span className="font-mono">CK · WINEROTO</span>
            {!isManagement && (
              <button
                type="button"
                onClick={() => setShowTransferModal(true)}
                className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Mutasi Stok</span>
                <ArrowRightLeft className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modular Grid: Live Production Line Status Matrix */}
      <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 rounded-xl p-3.5 sm:p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)] no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-4 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight">
              Matriks Status Lini Produksi Real-Time
            </h2>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              ({activeRuns.length} Jalan · {effectiveLines.length - activeRuns.length} Siaga)
            </span>
          </div>
          <button
            type="button"
            onClick={scrollToProductionConsole}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 self-start sm:self-auto whitespace-nowrap shrink-0"
          >
            <span>Atur &amp; Jalankan SKU di Konsol Lini</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {effectiveLines.map(line => {
            const run = allLineRuns.find(
              r =>
                r.lineId === line.id &&
                (r.isRunning ||
                  r.completionStatus === 'STOPPED_SHORTAGE' ||
                  r.completionStatus === 'STOPPED_SBL')
            );
            const hasShortage = Boolean(
              run && (run.completionStatus === 'STOPPED_SHORTAGE' || run.shortageReason)
            );
            const isSblStopped = Boolean(run && !hasShortage && run.completionStatus === 'STOPPED_SBL');
            const target = run?.plannedCartons || (run?.targetPerHour ? run.targetPerHour * 8 : 0);
            const realized = run?.cartonsProducedTotal || 0;
            const pct = target > 0 ? Math.min(100, Math.round((realized / target) * 100)) : 0;

            return (
              <div
                key={line.id}
                onClick={scrollToProductionConsole}
                className={`bg-[#06090f]/85 border rounded-lg p-3 transition cursor-pointer flex flex-col justify-between ${
                  hasShortage
                    ? 'border-rose-500/60 shadow-[0_0_14px_rgba(244,63,94,0.18)]'
                    : isSblStopped
                    ? 'border-amber-500/55 shadow-[0_0_14px_rgba(245,158,11,0.16)]'
                    : run
                    ? 'border-emerald-500/45 shadow-[0_0_14px_rgba(16,185,129,0.12)] hover:border-emerald-400/70'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-white">{line.name}</span>
                    <span
                      className={`text-[10px] font-mono font-bold flex items-center gap-1.5 ${
                        hasShortage
                          ? 'text-rose-400'
                          : isSblStopped
                          ? 'text-amber-400'
                          : run
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          hasShortage
                            ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]'
                            : isSblStopped
                            ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
                            : run
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                            : 'bg-slate-600'
                        }`}
                      />
                      <span>
                        {hasShortage
                          ? 'SHORTAGE'
                          : isSblStopped
                          ? 'STOPPED'
                          : run
                          ? 'RUNNING'
                          : 'STANDBY'}
                      </span>
                    </span>
                  </div>

                  {run ? (
                    <>
                      <p className="text-xs font-semibold text-cyan-300 truncate" title={run.skuName}>
                        {run.skuName}
                      </p>
                      <div className="flex items-baseline justify-between mt-2 font-mono tabular-nums text-[11px]">
                        <span className="text-white font-bold">
                          {realized.toLocaleString('id-ID')}
                          <span className="text-slate-400 font-normal">
                            {' '}
                            / {target.toLocaleString('id-ID')} ktn
                          </span>
                        </span>
                        <span
                          className={
                            hasShortage
                              ? 'text-rose-400 font-bold'
                              : isSblStopped
                              ? 'text-amber-400 font-bold'
                              : 'text-emerald-400 font-bold'
                          }
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 border border-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            hasShortage
                              ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                              : isSblStopped
                              ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                              : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                          }`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="pt-1.5">
                      <p className="text-[11px] text-slate-400 truncate">
                        {line.description || 'Jalur siap menerima target SKU'}
                      </p>
                      <div className="w-full bg-slate-900/70 h-1 rounded-full mt-3" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recharts Weekly Production Plan vs Actual & Per-SKU Variance Visualization */}
      <WeeklyPlanVsActualChart
        state={state}
        onScrollToWeeklyPlan={() => onSwitchTab('weekly-planning')}
        onOpenSheetsSync={() => onSwitchTab('sheets-sync')}
      />

      {/* Production Target Panel: 24 Jam Penuh (3 Shift × 8 Jam Kerja) & Line Produksi */}
      <div id="production-target-console">
        <ProductionTargetPanel
          state={state}
          liveLineStatus={liveLineStatus}
          onSwitchTab={onSwitchTab}
          onProduceCartons={onProduceCartons}
          onStartSkuProduction={onStartSkuProduction}
          onStartMultipleSkus={onStartMultipleSkus}
          onStartLineBatchRuns={onStartLineBatchRuns}
          onCompleteLineRun={onCompleteLineRun}
          onResumeLineRun={onResumeLineRun}
          onRecordMaterialShortage={onRecordMaterialShortage}
          onUpdateRunHoldingTank={onUpdateRunHoldingTank}
          onStopSkuProduction={onStopSkuProduction}
          onStopAllSkuProduction={onStopAllSkuProduction}
          onTriggerShiftHandover={onTriggerShiftHandover}
          onSetRunSpeedMultiplier={onSetRunSpeedMultiplier}
          onAddProductionLine={onAddProductionLine}
          onUpdateProductionLine={onUpdateProductionLine}
          onDeleteProductionLine={onDeleteProductionLine}
          onSetProductionLinesCount={onSetProductionLinesCount}
          onChangeSku={onChangeSku}
          showToast={showToast}
        />
      </div>

      {/* Quick Action Toolbar & Search Bar */}
      <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 p-3 sm:p-4 rounded-xl space-y-3 shadow-[0_8px_28px_rgba(0,0,0,0.3)] no-print">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Material atau SKU berdasarkan nama atau kode (e.g. MAT-01, SKU-01, Tepung, Wafer)..."
              className="w-full bg-[#06090f]/90 border border-slate-700/80 rounded-lg pl-9 pr-10 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons: PDF Report, Print, Mutasi, CSV */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenPdfModal && (
              <button
                onClick={onOpenPdfModal}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition active:scale-95 whitespace-nowrap shrink-0"
                title="Unduh Laporan Ringkasan Produksi Per Shift (PDF)"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh PDF Shift</span>
              </button>
            )}
            <button
              onClick={handlePrintReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#06090f]/90 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold transition active:scale-95 whitespace-nowrap shrink-0"
              title="Cetak Laporan Stok Printer-Friendly"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Cetak Laporan</span>
            </button>
            {!isManagement && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#06090f]/90 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium transition active:scale-95 whitespace-nowrap shrink-0"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Mutasi Gudang</span>
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#06090f]/90 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded-lg text-xs font-medium transition active:scale-95 whitespace-nowrap shrink-0"
              title="Unduh CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters and View Selectors */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActiveViewTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/45'
                  : 'bg-[#06090f]/70 text-slate-400 hover:text-white border border-slate-800/80'
              }`}
            >
              <span>Semua</span>
              <span className="text-[10px] font-mono opacity-80 tabular-nums">
                ({filteredMaterials.length + filteredSkus.length})
              </span>
            </button>
            <button
              onClick={() => setActiveViewTab('materials')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'materials'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/45'
                  : 'bg-[#06090f]/70 text-slate-400 hover:text-white border border-slate-800/80'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-cyan-400" />
              <span>Material Stok</span>
              <span className="text-[10px] font-mono opacity-80 tabular-nums">
                ({filteredMaterials.length})
              </span>
            </button>
            <button
              onClick={() => {
                setActiveViewTab('skus');
                setIsSkuCatalogExpanded(true);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'skus'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/45'
                  : 'bg-[#06090f]/70 text-slate-400 hover:text-white border border-slate-800/80'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>SKU Produk</span>
              <span className="text-[10px] font-mono opacity-80 tabular-nums">
                ({filteredSkus.length})
              </span>
            </button>
          </div>

          {(activeViewTab === 'all' || activeViewTab === 'materials') && (
            <div className="flex items-center gap-1 self-end sm:self-auto">
              <span className="text-[10px] text-slate-400 hidden sm:inline mr-1">Tipe:</span>
              {[
                { id: 'all', label: 'Semua Tipe' },
                { id: 'bubuk', label: 'Bubuk' },
                { id: 'liquid', label: 'Liquid' },
                { id: 'padat', label: 'Padat' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition whitespace-nowrap shrink-0 ${
                    typeFilter === tab.id
                      ? 'bg-slate-800 text-cyan-300 border border-cyan-500/40'
                      : 'bg-[#06090f]/70 text-slate-400 hover:text-white border border-slate-800/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SKU Catalog Section (Collapsed by default; expands on click) */}
      {(activeViewTab === 'all' || activeViewTab === 'skus') && (
        <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 rounded-xl overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.3)] no-print">
          <div
            className={`p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
              isSkuCatalogExpanded ? 'border-b border-slate-800/80' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setIsSkuCatalogExpanded(prev => !prev)}
              aria-expanded={isSkuCatalogExpanded}
              className="flex items-center gap-2.5 text-left flex-1 w-full sm:w-auto group focus:outline-none"
            >
              <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 group-hover:bg-amber-500/20 transition">
                <Package className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-white group-hover:text-amber-300 transition">
                    Katalog SKU Produk ({filteredSkus.length} Item)
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#06090f]/80 border border-slate-700 text-[10px] font-semibold text-slate-300 group-hover:border-amber-500/40 group-hover:text-amber-300 transition whitespace-nowrap">
                    {isSkuCatalogExpanded ? (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        <span>Sembunyikan</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        <span>Lihat Katalog</span>
                      </>
                    )}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Target kapasitas line &amp; akses cepat kebutuhan BOM · Klik untuk {isSkuCatalogExpanded ? 'menutup' : 'menampilkan'} daftar SKU
                </p>
              </div>
            </button>
            <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => onSwitchTab('master')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Kelola SKU di Master</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {isSkuCatalogExpanded && (
            <div className="p-4">
              {filteredSkus.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredSkus.map(sku => {
                  const skuCode = sku.code || `SKU-${sku.id.slice(-4).toUpperCase()}`;
                  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === sku.id);

                  return (
                    <div
                      key={sku.id}
                      className="bg-[#06090f]/80 border border-slate-800 hover:border-cyan-500/35 p-3.5 rounded-lg space-y-3 transition"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-cyan-400 font-bold">
                              {skuCode}
                            </span>
                            <span className="text-slate-600">·</span>
                            <h4 className="font-semibold text-white text-xs sm:text-sm">
                              {sku.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
                            <span className={sku.isKite ? 'text-amber-300 font-semibold' : 'text-cyan-300 font-semibold'}>
                              {sku.isKite ? 'KITE Ekspor' : 'Domestik'}
                            </span>
                            <span>·</span>
                            <span>{sku.cartonWeightKg.toFixed(4)} kg/karton</span>
                            <span>·</span>
                            <span>
                              Target: <strong className="text-white">{sku.targetHour}</strong> ktn/jam
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 bg-[#0c121d]/80 p-2 rounded-lg border border-slate-800/80 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span>Komponen WIP:</span>
                        </span>
                        <span className="font-mono text-slate-200 tabular-nums">
                          {linkedWips.length > 0 ? `${linkedWips.length} Jenis WIP Terikat` : 'Belum dihubungkan'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
                        <button
                          onClick={() => onSwitchTab('bom-calculator')}
                          className="flex-1 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 rounded-lg text-[11px] font-semibold transition active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Hitung Batch</span>
                        </button>
                        <button
                          onClick={() => onSwitchTab('permintaan')}
                          className="flex-1 py-1.5 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 rounded-lg text-[11px] font-semibold transition active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <FilePlus className="w-3.5 h-3.5" />
                          <span>Permintaan</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                {searchTerm ? (
                  <p>Tidak ada SKU yang cocok dengan pencarian "{searchTerm}".</p>
                ) : (
                  <p>Belum ada data SKU terdaftar di Master Data.</p>
                )}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Main Stock Inventory Table (Printer-friendly layout) */}
      {(activeViewTab === 'all' || activeViewTab === 'materials') && (
        <div className="bg-[#0c121d]/75 backdrop-blur-md border border-slate-800/90 rounded-xl overflow-hidden shadow-[0_8px_28px_rgba(0,0,0,0.3)]">
          <div className="p-4 border-b border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/25 text-cyan-400">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <span>Laporan Saldo Stock Material Aktual</span>
                  <span className="text-[11px] font-mono text-cyan-400 tabular-nums">
                    · {stockViewLayout === 'breakdown-sku-wip' ? `${filteredBreakdownRows.length} Entri BOM` : `${displayStockMaterials.length} Item`}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {stockViewLayout === 'breakdown-sku-wip'
                    ? 'Breakdown stok material berdasarkan SKU dan Jenis WIP yang diproduksi (Satuan Batch & kg)'
                    : 'Pembaruan otomatis dari riwayat Penerimaan & Pemakaian (Per Lokasi Gudang)'}
                </p>
              </div>
            </div>

            {/* Quick Searchbar & Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto no-print">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={stockTableSearch}
                  onChange={(e) => setStockTableSearch(e.target.value)}
                  placeholder="Cari SKU, WIP, kode atau material..."
                  className="w-full bg-[#06090f]/90 border border-slate-700/80 rounded-lg pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
                {stockTableSearch && (
                  <button
                    type="button"
                    onClick={() => setStockTableSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-white rounded"
                    title="Hapus pencarian stok"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={handlePrintReport}
                className="px-3 py-1.5 bg-[#06090f]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          {/* Subheader bar: View Mode Switch & Filters */}
          <div className="px-4 py-2.5 bg-[#080c14]/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* View Mode Selector */}
            <div className="flex items-center gap-1 bg-[#06090f]/90 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setStockViewLayout('breakdown-sku-wip')}
                className={`px-2.5 py-1 rounded-md font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  stockViewLayout === 'breakdown-sku-wip'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Breakdown Sesuai SKU &amp; WIP</span>
              </button>

              <button
                type="button"
                onClick={() => setStockViewLayout('by-location')}
                className={`px-2.5 py-1 rounded-md font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  stockViewLayout === 'by-location'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Warehouse className="w-3.5 h-3.5" />
                <span>Per Lokasi Gudang (CK &amp; WINEROTO)</span>
              </button>
            </div>

            {/* Dropdown Filters for SKU & WIP (when in breakdown mode) */}
            {stockViewLayout === 'breakdown-sku-wip' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400">SKU:</span>
                  <select
                    value={filterSkuId}
                    onChange={(e) => setFilterSkuId(e.target.value)}
                    className="bg-[#06090f] border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="all">Semua SKU ({state.master.skus.length})</option>
                    {state.master.skus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code || 'SKU'})
                      </option>
                    ))}
                    <option value="general">Stok Bebas / Non-BOM</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-400">WIP:</span>
                  <select
                    value={filterWipId}
                    onChange={(e) => setFilterWipId(e.target.value)}
                    className="bg-[#06090f] border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="all">Semua Jenis WIP ({state.master.wips.length})</option>
                    {state.master.wips.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            {stockViewLayout === 'breakdown-sku-wip' ? (
              /* TABEL BREAKDOWN SESUAI SKU & WIP (11 KOLOM STANDAR) */
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-800/80 text-[11px] font-bold text-slate-300 border-b border-slate-700 whitespace-nowrap">
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">Jenis WIP</th>
                    <th className="py-3 px-2 text-center">Kode</th>
                    <th className="py-3 px-3">Nama Material</th>
                    <th className="py-3 px-3 text-right">Saldo Awal<br/><span className="text-[10px] font-normal text-slate-400">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-right">Pemesanan Material<br/><span className="text-[10px] font-normal text-slate-400">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-right">Kedatangan Material<br/><span className="text-[10px] font-normal text-slate-400">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-right text-cyan-300">Total Onhand Material<br/><span className="text-[10px] font-normal text-cyan-400/80">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-right text-rose-300">Pemakaian Material<br/><span className="text-[10px] font-normal text-rose-400/80">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-right text-emerald-300">Saldo Akhir Shift<br/><span className="text-[10px] font-normal text-emerald-400/80">(batch & kg)</span></th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredBreakdownRows.length > 0 ? (
                    filteredBreakdownRows.map((row) => (
                      <tr key={row.rowKey} className="hover:bg-slate-800/40 text-xs transition">
                        {/* SKU */}
                        <td className="py-3 px-3 font-semibold text-white whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span className="truncate max-w-[170px]" title={row.skuName}>{row.skuName}</span>
                            {row.isKite && (
                              <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold shrink-0">
                                KITE
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Jenis WIP */}
                        <td className="py-3 px-3 text-slate-300 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/30 text-[11px] font-medium">
                            {row.wipName}
                          </span>
                        </td>

                        {/* Kode Material */}
                        <td className="py-3 px-2 text-center font-mono font-bold text-cyan-400 whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px]">
                            {row.materialCode}
                          </span>
                        </td>

                        {/* Nama Material */}
                        <td className="py-3 px-3 font-medium text-white whitespace-nowrap">
                          <span>{row.materialName}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            Formula: {row.batchSizeKg.toFixed(2)} kg/batch
                          </span>
                        </td>

                        {/* Saldo Awal (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                          <div className="text-slate-200 font-semibold">{row.saldoAwalBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-slate-400">({row.saldoAwalKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Pemesanan Material (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                          <div className="text-amber-300 font-semibold">{row.pemesananBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-amber-400/80">({row.pemesananKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Kedatangan Material (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                          <div className="text-emerald-300 font-semibold">{row.kedatanganBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-emerald-400/80">({row.kedatanganKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Total Onhand Material (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono bg-cyan-950/20 whitespace-nowrap">
                          <div className="text-cyan-300 font-bold">{row.totalOnhandBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-cyan-400">({row.totalOnhandKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Pemakaian Material (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono bg-rose-950/20 whitespace-nowrap">
                          <div className="text-rose-300 font-bold">{row.pemakaianBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-rose-400">({row.pemakaianKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Saldo Akhir Shift (batch & kg) */}
                        <td className="py-3 px-3 text-right font-mono bg-emerald-950/20 whitespace-nowrap">
                          <div className="text-emerald-300 font-bold">{row.saldoAkhirBatch.toFixed(2)} btc</div>
                          <div className="text-[10px] text-emerald-400">({row.saldoAkhirKg.toFixed(2)} kg)</div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {row.status === 'KOSONG' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              KOSONG
                            </span>
                          ) : row.status === 'MENIPIS' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              <span>MENIPIS</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>AMAN</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="text-center py-10 px-4 text-slate-400">
                        <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-white">
                          Tidak ditemukan data breakdown stok material yang sesuai dengan filter.
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Coba reset filter SKU / WIP atau kata kunci pencarian.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              /* TABEL PER LOKASI GUDANG (CK & WINEROTO) */
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-4">Kode & Nama Material</th>
                    <th className="py-3 px-3">Tipe / Kemasan</th>
                    <th className="py-3 px-3">Supplier</th>
                    <th className="py-3 px-3 text-right">Stock CK</th>
                    <th className="py-3 px-3 text-right">Stock WINEROTO</th>
                    <th className="py-3 px-3 text-right font-bold text-cyan-400">Total Aktual</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayStockMaterials.length > 0 ? (
                    displayStockMaterials.map((item) => (
                      <tr key={item.materialId} className="hover:bg-slate-800/40 text-xs transition">
                        <td className="py-3 px-4 font-medium text-white">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold border border-slate-700">
                              {item.materialCode}
                            </span>
                            <span>{item.materialName}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold mr-1.5 ${
                            item.type === 'liquid' ? 'bg-cyan-500/15 text-cyan-300' :
                            item.type === 'bubuk' ? 'bg-amber-500/15 text-amber-300' :
                            'bg-purple-500/15 text-purple-300'
                          }`}>
                            {item.type}
                          </span>
                          <span className="text-[11px] text-slate-400 block sm:inline">{item.packaging}</span>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                            {item.source}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          {item.stockCk.toFixed(4)} <span className="text-[10px] text-slate-500">kg</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-200">
                          {item.stockWineroto.toFixed(4)} <span className="text-[10px] text-slate-500">kg</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-cyan-400">
                          {item.totalActual.toFixed(4)} <span className="text-[10px] text-cyan-500/70">kg</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.totalActual === 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                              Kosong
                            </span>
                          ) : item.isLowStock ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center justify-center space-x-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              <span>Menipis</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center justify-center space-x-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Aman</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-10 px-4 text-slate-400">
                        <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-white">
                          {stockTableSearch
                            ? `Tidak ditemukan stok material dengan kata kunci "${stockTableSearch}"`
                            : searchTerm
                            ? `Tidak ditemukan material dengan filter global "${searchTerm}"`
                            : 'Belum ada data material dalam database'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal Mutasi / Transfer Stock Antar Gudang */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-[#0c121d]/95 backdrop-blur-md border border-slate-700/80 rounded-xl w-full max-w-md p-5 shadow-[0_16px_48px_rgba(0,0,0,0.6)] relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400">
                <ArrowRightLeft className="w-4 h-4" />
                <h3 className="font-bold text-sm text-white">Mutasi / Pindah Stok Gudang</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                aria-label="Tutup modal mutasi stok"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-3 text-xs bg-slate-950/40 border border-slate-800/90 rounded-2xl p-3.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Pilih Material
                </label>
                <select
                  value={transferMatId}
                  onChange={(e) => setTransferMatId(e.target.value)}
                  required
                  className="w-full bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Pilih Material --</option>
                  {state.master.materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Dari Lokasi
                  </label>
                  <select
                    value={transferFrom}
                    onChange={(e) => setTransferFrom(e.target.value as StorageLocation)}
                    className="w-full bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="CK">Area CK</option>
                    <option value="WINEROTO">Area WINEROTO</option>
                    <option value="STORAGE_TANK">Tank Liquid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Ke Lokasi
                  </label>
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value as StorageLocation)}
                    className="w-full bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="WINEROTO">Area WINEROTO</option>
                    <option value="CK">Area CK</option>
                    <option value="STORAGE_TANK">Tank Liquid</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Jumlah Berat Dipindahkan (kg, 4 desimal)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={transferQty}
                  onChange={(e) => setTransferQty(e.target.value)}
                  placeholder="0.0000"
                  className="w-full bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono tabular-nums focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="w-1/2 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition shadow-[0_0_14px_rgba(6,182,212,0.28)]"
                >
                  Eksekusi Mutasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
