import React, { useState, useMemo } from 'react';
import {
  Warehouse,
  Building2,
  Droplet,
  Thermometer,
  Search,
  Filter,
  Download,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Boxes,
  PlusCircle,
  ExternalLink,
  X,
  Package,
  Layers,
  Calculator,
  FilePlus,
  Tag,
  Printer,
  Activity,
  TrendingUp,
  Clock,
  PlayCircle,
  Sparkles,
  Cylinder,
  ArrowRight,
  FileText,
  Eye,
  Shield
} from 'lucide-react';
import { AppState, StorageLocation, WipProductionBatch, ProductionStopLog } from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import { calculateMaterialStockBreakdown } from '../../utils/reportBreakdown';
import { getCurrentShift, formatIndonesianDate, ShiftNumber } from '../../utils/shifts';
import { ProductionTargetPanel } from '../ProductionTargetPanel';

interface DashboardViewProps {
  state: AppState;
  onOpenTankModal: () => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onTransferStock: (materialId: string, from: StorageLocation, to: StorageLocation, qty: number) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string
  ) => { success: boolean; message: string };
  onStartSkuProduction?: (skuId: string, operatorName?: string, speedMultiplier?: number) => void;
  onStartMultipleSkus?: (skuIds: string[], operatorName?: string, speedMultiplier?: number) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onStopAllSkuProduction?: () => void;
  onSetRunSpeedMultiplier?: (multiplier: number, skuId?: string) => void;
  onOpenPdfModal?: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  onOpenTankModal,
  onSwitchTab,
  onTransferStock,
  onProduceCartons,
  onStartSkuProduction,
  onStartMultipleSkus,
  onStopSkuProduction,
  onStopAllSkuProduction,
  onSetRunSpeedMultiplier,
  onOpenPdfModal,
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

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Printable Header Banner (Only visible in Print view) */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight">PRODTRACK MANUFACTURING EXECUTION SYSTEM</h1>
            <p className="text-sm font-semibold text-slate-800">
              Laporan Stok Opname Material Aktual & Status Pabrik (24 Jam Penuh)
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
        <div className="bg-indigo-950/50 border border-indigo-500/40 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xl no-print">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>Odoo MRP Portal: Mode Management (Pantau Saja)</span>
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Memantau produksi berjalan, saldo stok material di gudang (CK & WINEROTO), serta telemetri tangki WIP. Akses mutasi transaksi dibatasi.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40 font-mono whitespace-nowrap">
            READ-ONLY VIEW
          </span>
        </div>
      )}

      {/* Top Tablet-Optimized Operational Cockpit Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Card 1: Storage Tank Liquid Telemetry (1.000 kg) */}
        <div
          onClick={onOpenTankModal}
          className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/30 hover:border-cyan-500/60 p-4 rounded-2xl relative overflow-hidden shadow-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Droplet className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tangki Liquid (1.000 kg)</span>
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-mono font-bold border border-cyan-500/20 group-hover:bg-cyan-500/20 transition">
              {tankPercent}% Penuh
            </span>
          </div>

          <div className="flex items-baseline justify-between mb-2">
            <div>
              <span className="text-2xl sm:text-3xl font-bold font-mono text-white">
                {state.tank.level.toFixed(1)}
              </span>
              <span className="text-xs text-slate-400 font-mono ml-1">
                / {state.tank.maxCapacity} kg
              </span>
            </div>

            <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-lg border text-xs font-mono font-semibold ${
              isTankNormal
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
            }`}>
              <Thermometer className="w-3.5 h-3.5" />
              <span>{state.tank.temp.toFixed(1)}°C</span>
            </div>
          </div>

          {/* Progress fill bar */}
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 h-full rounded-full transition-all duration-700"
              style={{ width: `${tankPercent}%` }}
            />
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 font-mono">
            <span>Target: 45.0 - 55.0°C</span>
            <span className="text-cyan-400 group-hover:underline">Buka Kalibrasi →</span>
          </div>
        </div>

        {/* Card 2: Warehouse Balances (CK & WINEROTO) */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Warehouse className="w-3.5 h-3.5 text-indigo-400" />
              <span>Stok Gudang Material</span>
            </span>
            <span className="text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
              Total: {grandTotal.toFixed(0)} kg
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 my-1">
            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <div className="flex items-center space-x-1.5 text-cyan-400 text-[10px] font-semibold mb-0.5">
                <Warehouse className="w-3 h-3" />
                <span>Area CK</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {totalStockCk.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">kg</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono">
                {grandTotal > 0 ? ((totalStockCk / grandTotal) * 100).toFixed(0) : 0}% Distribusi
              </span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl">
              <div className="flex items-center space-x-1.5 text-emerald-400 text-[10px] font-semibold mb-0.5">
                <Building2 className="w-3 h-3" />
                <span>WINEROTO</span>
              </div>
              <div className="text-lg font-bold font-mono text-white">
                {totalStockWineroto.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">kg</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono">
                {grandTotal > 0 ? ((totalStockWineroto / grandTotal) * 100).toFixed(0) : 0}% Distribusi
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
            <span>Bubuk GDRM, Formulasi & Drum</span>
            <button
              onClick={() => setShowTransferModal(true)}
              className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1"
            >
              <span>Mutasi Gudang</span>
              <ArrowRightLeft className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 3: Active Production Batch Details / Plant Status */}
        <div className={`p-4 rounded-2xl border shadow-xl flex flex-col justify-between ${
          latestActiveBatch
            ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border-amber-500/30'
            : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <span>Aktivitas Produksi WIP</span>
            </span>
            {latestActiveBatch ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 animate-pulse flex items-center space-x-1">
                <span>● Sedang Jalan</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Siap Beroperasi
              </span>
            )}
          </div>

          {latestActiveBatch ? (
            <div className="space-y-1.5 my-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-amber-400">
                  {latestActiveBatch.batchCode}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Shift {latestActiveBatch.shift || 1}
                </span>
              </div>
              <h4 className="font-bold text-white text-sm truncate">
                {latestActiveBatch.wipName}
              </h4>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>Bobot: {latestActiveBatch.batchWeightKg.toFixed(2)} kg</span>
                <span>Op: {latestActiveBatch.operatorName}</span>
              </div>
            </div>
          ) : (
            <div className="my-2 text-center py-1">
              <p className="text-xs font-semibold text-white">Lantai Batching Siap</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Tidak ada perintah kerja WIP tertunda</p>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            {latestActiveBatch ? (
              <button
                onClick={() => onSwitchTab('pemakaian')}
                className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center justify-center space-x-1.5"
              >
                <span>Kelola Batch di Pemakaian</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={() => onSwitchTab('pemakaian')}
                className="w-full py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center justify-center space-x-1.5"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Mulai Perintah Kerja WIP Baru</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Access Banner to Dedicated WIP Tank Monitoring Dashboard */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-slate-900 to-indigo-950/40 border border-cyan-500/30 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xl no-print">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 shrink-0">
            <Cylinder className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-white font-bold text-xs sm:text-sm">
                Dashboard Terpisah: Monitoring Tangki WIP (Holding & Storage Tank)
              </span>
              <span className="px-2 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30">
                Fitur Baru
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Pantau {state.master.tanks.length} tangki penampung & penyimpanan secara visual. Isi otomatis terpotong presisi setiap 1 karton SKU diproduksi.
            </p>
          </div>
        </div>
        <button
          onClick={() => onSwitchTab('tank-monitoring')}
          className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-600/20 flex items-center space-x-1.5 shrink-0 active:scale-95"
        >
          <span>Buka Dashboard Tangki WIP</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Production Target Panel: 24 Jam Penuh (3 Shift × 8 Jam Kerja) & SKU Aktif */}
      <ProductionTargetPanel
        state={state}
        onSwitchTab={onSwitchTab}
        onProduceCartons={onProduceCartons}
        onStartSkuProduction={onStartSkuProduction}
        onStartMultipleSkus={onStartMultipleSkus}
        onStopSkuProduction={onStopSkuProduction}
        onStopAllSkuProduction={onStopAllSkuProduction}
        onSetRunSpeedMultiplier={onSetRunSpeedMultiplier}
        showToast={showToast}
      />

      {/* Quick Action Toolbar & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3 sm:p-4 rounded-2xl space-y-3 shadow-lg no-print">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Material atau SKU berdasarkan nama atau kode (e.g. MAT-01, SKU-01, Tepung, Wafer)..."
              className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Action buttons: PDF Report, Print, Mutasi, CSV */}
          <div className="flex items-center space-x-2 shrink-0">
            {onOpenPdfModal && (
              <button
                onClick={onOpenPdfModal}
                className="flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-md shadow-rose-950/40 border border-rose-400/40"
                title="Unduh Laporan Ringkasan Produksi Per Shift (PDF)"
              >
                <FileText className="w-3.5 h-3.5 text-rose-200" />
                <span>Unduh PDF Shift</span>
              </button>
            )}
            <button
              onClick={handlePrintReport}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition active:scale-95 shadow"
              title="Cetak Laporan Stok Printer-Friendly"
            >
              <Printer className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Cetak Laporan</span>
            </button>
            {!isManagement && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition active:scale-95"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Mutasi Gudang</span>
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition active:scale-95"
              title="Unduh CSV"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filters and View Selectors */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActiveViewTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center space-x-1.5 ${
                activeViewTab === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <span>Semua</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900/60 text-[10px] font-mono">
                {filteredMaterials.length + filteredSkus.length}
              </span>
            </button>
            <button
              onClick={() => setActiveViewTab('materials')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center space-x-1.5 ${
                activeViewTab === 'materials'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-cyan-400" />
              <span>Material Stok</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900/60 text-[10px] font-mono">
                {filteredMaterials.length}
              </span>
            </button>
            <button
              onClick={() => setActiveViewTab('skus')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition flex items-center space-x-1.5 ${
                activeViewTab === 'skus'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'bg-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-amber-400" />
              <span>SKU Produk</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-900/60 text-[10px] font-mono">
                {filteredSkus.length}
              </span>
            </button>
          </div>

          {(activeViewTab === 'all' || activeViewTab === 'materials') && (
            <div className="flex items-center space-x-1 self-end sm:self-auto">
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
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                    typeFilter === tab.id
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-slate-800/50 text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SKU Catalog Section (Visible in 'all' or 'skus' view tab) */}
      {(activeViewTab === 'all' || activeViewTab === 'skus') && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl no-print">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Katalog SKU Produk ({filteredSkus.length} Item)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Target kapasitas line & akses cepat kebutuhan BOM
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onSwitchTab('master')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center space-x-1"
              >
                <span>Kelola SKU di Master</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="p-4">
            {filteredSkus.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredSkus.map(sku => {
                  const skuCode = sku.code || `SKU-${sku.id.slice(-4).toUpperCase()}`;
                  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === sku.id);

                  return (
                    <div
                      key={sku.id}
                      className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 p-3.5 rounded-xl space-y-3 transition group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-bold border border-slate-700">
                              {skuCode}
                            </span>
                            <h4 className="font-semibold text-white text-xs sm:text-sm">
                              {sku.name}
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              sku.isKite
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            }`}>
                              {sku.isKite ? '⭐ KITE Ekspor' : 'Domestik'}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {sku.cartonWeightKg.toFixed(4)} kg/karton
                            </span>
                            <span className="text-[11px] text-slate-400">
                              • Target: <strong className="text-white font-mono">{sku.targetHour}</strong> ktn/jam
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                        <span className="flex items-center space-x-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span>Komponen WIP:</span>
                        </span>
                        <span className="font-mono text-slate-200">
                          {linkedWips.length > 0 ? `${linkedWips.length} Jenis WIP Terikat` : 'Belum dihubungkan'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 pt-1 border-t border-slate-800/80">
                        <button
                          onClick={() => onSwitchTab('bom-calculator')}
                          className="flex-1 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-lg text-[11px] font-semibold transition active:scale-95 flex items-center justify-center space-x-1"
                        >
                          <Calculator className="w-3.5 h-3.5" />
                          <span>Hitung Batch</span>
                        </button>
                        <button
                          onClick={() => onSwitchTab('permintaan')}
                          className="flex-1 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-300 rounded-lg text-[11px] font-semibold transition active:scale-95 flex items-center justify-center space-x-1"
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
        </div>
      )}

      {/* Main Stock Inventory Table (Printer-friendly layout) */}
      {(activeViewTab === 'all' || activeViewTab === 'materials') && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                  <span>Laporan Saldo Stock Material Aktual</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded font-mono">
                    {stockViewLayout === 'breakdown-sku-wip' ? `${filteredBreakdownRows.length} Entri BOM` : `${displayStockMaterials.length} Item`}
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
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30"
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
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          {/* Subheader bar: View Mode Switch & Filters */}
          <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            {/* View Mode Pills */}
            <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setStockViewLayout('breakdown-sku-wip')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  stockViewLayout === 'breakdown-sku-wip'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Breakdown Sesuai SKU & WIP</span>
              </button>

              <button
                type="button"
                onClick={() => setStockViewLayout('by-location')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  stockViewLayout === 'by-location'
                    ? 'bg-cyan-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Warehouse className="w-3.5 h-3.5" />
                <span>Per Lokasi Gudang (CK & WINEROTO)</span>
              </button>
            </div>

            {/* Dropdown Filters for SKU & WIP (when in breakdown mode) */}
            {stockViewLayout === 'breakdown-sku-wip' && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-slate-400">SKU:</span>
                  <select
                    value={filterSkuId}
                    onChange={(e) => setFilterSkuId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-medium"
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

                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-slate-400">WIP:</span>
                  <select
                    value={filterWipId}
                    onChange={(e) => setFilterWipId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-cyan-500 font-medium"
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-cyan-400">
                <ArrowRightLeft className="w-4 h-4" />
                <h3 className="font-bold text-sm text-white">Mutasi / Pindah Stok Gudang</h3>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Pilih Material
                </label>
                <select
                  value={transferMatId}
                  onChange={(e) => setTransferMatId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
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
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="w-1/2 py-2.5 bg-slate-800 text-slate-300 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl"
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
