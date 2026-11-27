import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Droplet,
  ExternalLink,
  FilePlus,
  FileText,
  Layers,
  Monitor,
  Package,
  Printer,
  Search,
  Thermometer,
  Warehouse,
  X
} from 'lucide-react';
import { AppState, ProductionLine, StorageLocation } from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import { calculateMaterialStockBreakdown } from '../../utils/reportBreakdown';

interface PlantTelemetryAndStockPanelProps {
  state: AppState;
  isManagement: boolean;
  effectiveLines: ProductionLine[];
  focusedLineId?: string | null;
  onOpenTankModal: () => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onTransferStock: (materialId: string, from: StorageLocation, to: StorageLocation, qty: number) => void;
  onOpenPdfModal?: () => void;
  onOpenStationMonitor?: (station: { type: 'line' | 'ck'; id: string }) => void;
  onScrollToProductionConsole: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const PlantTelemetryAndStockPanel: React.FC<PlantTelemetryAndStockPanelProps> = ({
  state,
  isManagement,
  effectiveLines,
  focusedLineId,
  onOpenTankModal,
  onSwitchTab,
  onTransferStock,
  onOpenPdfModal,
  onOpenStationMonitor,
  onScrollToProductionConsole,
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
  const [stockViewLayout, setStockViewLayout] = useState<'breakdown-sku-wip' | 'by-location'>(
    'breakdown-sku-wip'
  );
  const [filterLineId, setFilterLineId] = useState<string>('all');
  const [filterSkuId, setFilterSkuId] = useState<string>('all');
  const [filterWipId, setFilterWipId] = useState<string>('all');
  const [isSkuCatalogExpanded, setIsSkuCatalogExpanded] = useState<boolean>(false);

  React.useEffect(() => {
    if (focusedLineId) {
      setFilterLineId(focusedLineId);
    }
  }, [focusedLineId]);

  const stockBalances = calculateStockBalances(state);
  const stockList = Object.values(stockBalances);

  let totalStockCk = 0;
  let totalStockWineroto = 0;
  let totalStockTank = 0;

  stockList.forEach(s => {
    totalStockCk += s.stockCk;
    totalStockWineroto += s.stockWineroto;
    totalStockTank += s.stockTank;
  });

  const grandTotal = totalStockCk + totalStockWineroto + totalStockTank;

  const activeBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  );
  const latestActiveBatch = activeBatches[0];

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredMaterials = stockList.filter(item => {
    const matchesSearch =
      !normalizedSearch ||
      item.materialName.toLowerCase().includes(normalizedSearch) ||
      (item.materialCode && item.materialCode.toLowerCase().includes(normalizedSearch)) ||
      item.source.toLowerCase().includes(normalizedSearch) ||
      item.packaging.toLowerCase().includes(normalizedSearch) ||
      item.type.toLowerCase().includes(normalizedSearch);

    const matchesType =
      typeFilter === 'all' || item.type.toLowerCase() === typeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

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

  const stockBreakdownRows = useMemo(() => calculateMaterialStockBreakdown(state), [state]);

  const breakdownLineOptions = useMemo(() => {
    const map = new Map<string, { lineId: string; lineName: string; count: number }>();
    stockBreakdownRows.forEach(r => {
      const existing = map.get(r.lineId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(r.lineId, { lineId: r.lineId, lineName: r.lineName, count: 1 });
      }
    });
    return Array.from(map.values());
  }, [stockBreakdownRows]);

  const filteredBreakdownRows = useMemo(() => {
    return stockBreakdownRows.filter(r => {
      const matchLine = filterLineId === 'all' || r.lineId === filterLineId;
      const matchSku = filterSkuId === 'all' || r.skuId === filterSkuId;
      const matchWip = filterWipId === 'all' || r.wipId === filterWipId;
      const q = (stockTableSearch || normalizedSearch).trim().toLowerCase();
      const matchSearch =
        !q ||
        r.lineName.toLowerCase().includes(q) ||
        r.skuName.toLowerCase().includes(q) ||
        r.wipName.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        r.materialCode.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q);
      return matchLine && matchSku && matchWip && matchSearch;
    });
  }, [stockBreakdownRows, filterLineId, filterSkuId, filterWipId, stockTableSearch, normalizedSearch]);

  const groupedBreakdownByLine = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        lineId: string;
        lineName: string;
        rows: typeof filteredBreakdownRows;
        totalPemesananKg: number;
        totalOnhandKg: number;
        totalPemakaianKg: number;
      }
    >();
    filteredBreakdownRows.forEach(row => {
      const existing = groupMap.get(row.lineId);
      if (existing) {
        existing.rows.push(row);
        existing.totalPemesananKg += row.pemesananKg;
        existing.totalOnhandKg += row.totalOnhandKg;
        existing.totalPemakaianKg += row.pemakaianKg;
      } else {
        groupMap.set(row.lineId, {
          lineId: row.lineId,
          lineName: row.lineName,
          rows: [row],
          totalPemesananKg: row.pemesananKg,
          totalOnhandKg: row.totalOnhandKg,
          totalPemakaianKg: row.pemakaianKg
        });
      }
    });
    return Array.from(groupMap.values());
  }, [filteredBreakdownRows]);

  const handleExportCSV = () => {
    if (stockViewLayout === 'breakdown-sku-wip') {
      if (filteredBreakdownRows.length === 0) {
        showToast('Belum ada data saldo stok material per line untuk di-export', true);
        return;
      }
      const headers = [
        'Line Produksi',
        'SKU',
        'Jenis WIP',
        'Kode Material',
        'Nama Material',
        'Saldo Awal (kg)',
        'Pemesanan Material (kg)',
        'Kedatangan Material (kg)',
        'Total Onhand (kg)',
        'Pemakaian Material (kg)',
        'Saldo Akhir Shift (kg)',
        'Status'
      ];
      const rows = filteredBreakdownRows.map(r => [
        `"${r.lineName}"`,
        `"${r.skuName}"`,
        `"${r.wipName}"`,
        r.materialCode,
        `"${r.materialName}"`,
        r.saldoAwalKg.toFixed(4),
        r.pemesananKg.toFixed(4),
        r.kedatanganKg.toFixed(4),
        r.totalOnhandKg.toFixed(4),
        r.pemakaianKg.toFixed(4),
        r.saldoAkhirKg.toFixed(4),
        r.status
      ]);
      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Laporan_Saldo_Stok_Per_Line_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Berhasil mengunduh laporan saldo stok per Line Produksi (CSV)');
      return;
    }

    if (stockList.length === 0) {
      showToast('Belum ada data stok untuk di-export', true);
      return;
    }
    const headers = [
      'Kode',
      'Nama Material',
      'Tipe',
      'Supplier',
      'Kemasan',
      'Stock CK (kg)',
      'Stock WINEROTO (kg)',
      'Stock Tangki (kg)',
      'Total Aktual (kg)',
      'Status'
    ];
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
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Opname_ProdTrack_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Berhasil mengunduh laporan stok CSV');
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

  const isTankNormal =
    state.tank.temp >= state.tank.minTempTarget && state.tank.temp <= state.tank.maxTempTarget;
  const tankPercent = Math.min(
    100,
    Math.round((state.tank.level / (state.tank.maxCapacity || 1000)) * 100)
  );

  const allLineRuns = useMemo(() => {
    return state.activeSkuRuns && state.activeSkuRuns.length > 0
      ? state.activeSkuRuns
      : state.activeSkuRun
      ? [state.activeSkuRun]
      : [];
  }, [state.activeSkuRuns, state.activeSkuRun]);

  const activeRuns = useMemo(() => allLineRuns.filter(r => r.isRunning), [allLineRuns]);

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

  const lowStockMaterialCount = useMemo(
    () => stockList.filter(s => s.isLowStock).length,
    [stockList]
  );

  const activeBatchMachineCount = useMemo(() => {
    return new Set(activeBatches.filter(b => b.targetMachineId).map(b => b.targetMachineId)).size;
  }, [activeBatches]);

  return (
    <div className="space-y-4">
      {/* 4-Card Control Room Telemetry Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 no-print">
        <div
          onClick={onScrollToProductionConsole}
          className={`bg-surface p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            activeRuns.length > 0
              ? 'border-tint-emerald-border hover:border-ink-emerald'
              : 'border-border-subtle hover:border-accent-primary/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-semibold text-ink-secondary">
                Status Line Produksi
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  activeRuns.length > 0 ? 'text-ink-emerald' : 'text-ink-secondary'
                }`}
              >
                {activeRuns.length > 0 ? 'OPERATING' : 'STANDBY'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-2xl font-extrabold font-mono text-ink-primary tabular-nums">
                  {activeRuns.length}
                </span>
                <span className="text-xs font-mono text-ink-secondary ml-1 tabular-nums">
                  / {effectiveLines.length} Line Aktif
                </span>
              </div>
              <div className="text-right font-mono tabular-nums">
                <span className="text-sm font-bold text-accent-primary block">
                  {todayCartonsTotal.toLocaleString('id-ID')}
                </span>
                <span className="text-[10px] text-ink-secondary">Karton Hari Ini</span>
              </div>
            </div>

            <div className="w-full bg-canvas border border-border-subtle h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  activeRuns.length > 0 ? 'bg-emerald-500' : 'bg-elevated'
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

          <div className="flex items-center justify-between text-[11px] text-ink-secondary mt-3 pt-2 border-t border-border-subtle font-mono tabular-nums">
            <span>{effectiveLines.length - activeRuns.length} Line Siaga</span>
            <span className="text-accent-primary font-semibold">Kontrol Line →</span>
          </div>
        </div>

        <div
          onClick={onOpenTankModal}
          className={`bg-surface p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            isTankNormal && lowWipTanksCount === 0
              ? 'border-tint-cyan-border hover:border-accent-primary'
              : 'border-tint-amber-border hover:border-ink-amber'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-[11px] font-semibold text-ink-secondary flex items-center gap-1.5">
                <Droplet className="w-3.5 h-3.5 text-accent-primary" />
                <span>Tangki Liquid Utama</span>
              </span>
              <span className="text-[11px] font-mono font-bold text-accent-primary tabular-nums">
                {tankPercent}% Cap
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2.5">
              <div>
                <span className="text-2xl font-extrabold font-mono text-ink-primary tabular-nums">
                  {state.tank.level.toFixed(1)}
                </span>
                <span className="text-xs text-ink-secondary font-mono ml-1 tabular-nums">
                  / {state.tank.maxCapacity} kg
                </span>
              </div>

              <div
                className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono font-bold tabular-nums ${
                  isTankNormal
                    ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                    : 'bg-tint-amber text-ink-amber border-tint-amber-border'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span>{state.tank.temp.toFixed(1)}°C</span>
              </div>
            </div>

            <div className="w-full bg-canvas border border-border-subtle h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-accent-primary h-full rounded-full transition-all duration-500"
                style={{ width: `${tankPercent}%` }}
              />
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] text-ink-secondary mt-3 pt-2 border-t border-border-subtle font-mono tabular-nums">
            <span>
              {state.master.tanks.length} Tangki WIP
              {lowWipTanksCount > 0 ? ` · ${lowWipTanksCount} Menipis` : ''}
            </span>
            <span className="text-accent-primary font-semibold">Kalibrasi →</span>
          </div>
        </div>

        <div
          onClick={() => onSwitchTab('pemakaian')}
          className={`bg-surface p-4 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
            latestActiveBatch
              ? 'border-tint-amber-border hover:border-ink-amber'
              : 'border-border-subtle hover:border-accent-primary/60'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-ink-secondary">
                Pipeline Batching WIP
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  latestActiveBatch
                    ? activeBatches.every(b => b.status === 'DIJEDA')
                      ? 'text-ink-sky'
                      : 'text-ink-amber'
                    : 'text-ink-emerald'
                }`}
              >
                {latestActiveBatch
                  ? activeBatches.every(b => b.status === 'DIJEDA')
                    ? `${activeBatches.length} DIJEDA`
                    : `${activeBatches.length} PROSES`
                  : 'SIAGA'}
              </span>
            </div>

            {latestActiveBatch ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                  <span className="font-bold text-ink-amber">{latestActiveBatch.batchCode}</span>
                  <span className="text-ink-secondary">
                    {activeBatchMachineCount}/{state.master.machines.length} Mesin
                  </span>
                </div>
                <h4 className="font-bold text-ink-primary text-sm truncate">
                  {latestActiveBatch.wipName}
                </h4>
                <div className="text-[11px] text-ink-secondary flex items-center justify-between font-mono tabular-nums">
                  <span>{latestActiveBatch.batchWeightKg.toFixed(1)} kg</span>
                  <span className="truncate ml-2">{latestActiveBatch.operatorName}</span>
                </div>
              </div>
            ) : (
              <div className="py-1">
                <p className="text-sm font-bold text-ink-primary">Lantai Batching Siaga</p>
                <p className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                  {state.master.machines.length} unit mesin mixer &amp; boiler siap dijadwalkan.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-secondary mt-3 pt-2 border-t border-border-subtle font-mono">
            <span>Work Order &amp; Gantt</span>
            <span className={`font-semibold ${latestActiveBatch ? 'text-ink-amber' : 'text-accent-primary'}`}>
              Buka Jadwal →
            </span>
          </div>
        </div>

        <div className="bg-surface border border-border-subtle hover:border-accent-primary/60 p-4 rounded-xl flex flex-col justify-between transition">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[11px] font-semibold text-ink-secondary flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-accent-primary" />
                <span>Saldo Stok Gudang</span>
              </span>
              <span
                className={`text-[10px] font-mono font-bold tabular-nums ${
                  lowStockMaterialCount > 0 ? 'text-ink-rose' : 'text-ink-emerald'
                }`}
              >
                {lowStockMaterialCount > 0 ? `${lowStockMaterialCount} MENIPIS` : 'STOK AMAN'}
              </span>
            </div>

            <div className="flex items-baseline justify-between mb-2">
              <span className="text-xl font-extrabold font-mono text-ink-primary tabular-nums">
                {grandTotal.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                <span className="text-xs font-normal text-ink-secondary ml-1">kg Total</span>
              </span>
              <span className="text-[10px] font-mono text-ink-secondary tabular-nums">
                {stockList.length} Material
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-canvas border border-border-subtle px-2.5 py-1.5 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-ink-cyan font-semibold">CK</span>
                  <span className="text-ink-secondary tabular-nums">
                    {grandTotal > 0 ? ((totalStockCk / grandTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="text-xs font-bold font-mono text-ink-primary tabular-nums mt-0.5">
                  {totalStockCk.toFixed(1)} kg
                </div>
              </div>

              <div className="bg-canvas border border-border-subtle px-2.5 py-1.5 rounded-lg">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-ink-emerald font-semibold">WNR</span>
                  <span className="text-ink-secondary tabular-nums">
                    {grandTotal > 0 ? ((totalStockWineroto / grandTotal) * 100).toFixed(0) : 0}%
                  </span>
                </div>
                <div className="text-xs font-bold font-mono text-ink-primary tabular-nums mt-0.5">
                  {totalStockWineroto.toFixed(1)} kg
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[11px] text-ink-secondary mt-3 pt-2 border-t border-border-subtle">
            <span className="font-mono">CK · WINEROTO</span>
            {!isManagement && (
              <button
                type="button"
                onClick={() => setShowTransferModal(true)}
                className="text-accent-primary hover:underline font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Mutasi Stok</span>
                <ArrowRightLeft className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Production Line Status Matrix */}
      <div className="bg-surface border border-border-subtle rounded-xl p-3.5 sm:p-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-ink-primary tracking-tight">
              Matriks Status Lini Produksi Real-Time
            </h2>
            <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
              · {activeRuns.length} Jalan · {effectiveLines.length - activeRuns.length} Siaga
            </span>
          </div>
          <button
            type="button"
            onClick={onScrollToProductionConsole}
            className="text-[11px] font-semibold text-accent-primary hover:underline flex items-center gap-1 self-start sm:self-auto whitespace-nowrap shrink-0"
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
                onClick={onScrollToProductionConsole}
                className={`bg-canvas border rounded-lg p-3 transition cursor-pointer flex flex-col justify-between ${
                  hasShortage
                    ? 'border-tint-rose-border'
                    : isSblStopped
                    ? 'border-tint-amber-border'
                    : run
                    ? 'border-tint-emerald-border hover:border-ink-emerald'
                    : 'border-border-subtle hover:border-accent-primary/60'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-xs font-bold text-ink-primary">{line.name}</span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        hasShortage
                          ? 'text-ink-rose'
                          : isSblStopped
                          ? 'text-ink-amber'
                          : run
                          ? 'text-ink-emerald'
                          : 'text-ink-secondary'
                      }`}
                    >
                      {hasShortage
                        ? 'SHORTAGE'
                        : isSblStopped
                        ? 'STOPPED'
                        : run
                        ? 'RUNNING'
                        : 'STANDBY'}
                    </span>
                  </div>

                  {run ? (
                    <>
                      <p className="text-xs font-semibold text-ink-cyan truncate" title={run.skuName}>
                        {run.skuName}
                      </p>
                      <div className="flex items-baseline justify-between mt-2 font-mono tabular-nums text-[11px]">
                        <span className="text-ink-primary font-bold">
                          {realized.toLocaleString('id-ID')}
                          <span className="text-ink-secondary font-normal">
                            {' '}
                            / {target.toLocaleString('id-ID')} ktn
                          </span>
                        </span>
                        <span
                          className={
                            hasShortage
                              ? 'text-ink-rose font-bold'
                              : isSblStopped
                              ? 'text-ink-amber font-bold'
                              : 'text-ink-emerald font-bold'
                          }
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="w-full bg-surface border border-border-subtle h-1.5 rounded-full overflow-hidden mt-1.5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            hasShortage
                              ? 'bg-rose-500'
                              : isSblStopped
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="pt-1.5">
                      <p className="text-[11px] text-ink-secondary truncate">
                        {line.description || 'Jalur siap menerima target SKU'}
                      </p>
                      <div className="w-full bg-elevated h-1 rounded-full mt-3" />
                    </div>
                  )}
                </div>

                {onOpenStationMonitor && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onOpenStationMonitor({ type: 'line', id: line.id });
                    }}
                    className="mt-2.5 w-full px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-subtle text-[11px] font-semibold text-ink-primary flex items-center justify-center gap-1.5 transition"
                  >
                    <Monitor className="w-3.5 h-3.5 text-brand" />
                    <span>Buka Monitor Khusus (Kiosk)</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Action Toolbar & Search Bar */}
      <div className="bg-surface border border-border-subtle p-3 sm:p-4 rounded-xl space-y-3 no-print">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Cari Material atau SKU berdasarkan nama atau kode (e.g. MAT-01, SKU-01, Tepung, Wafer)..."
              className="w-full bg-canvas border border-border-subtle rounded-lg pl-9 pr-10 py-2 text-xs text-ink-primary placeholder:text-ink-secondary focus:outline-none focus:border-accent-primary transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-secondary hover:text-ink-primary rounded hover:bg-elevated transition"
                title="Hapus pencarian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenPdfModal && (
              <button
                onClick={onOpenPdfModal}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0"
                title="Unduh Laporan Ringkasan Produksi Per Shift (PDF)"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh PDF Shift</span>
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 bg-canvas border border-border-subtle hover:bg-elevated text-ink-primary rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-accent-primary" />
              <span className="hidden sm:inline">Cetak Laporan</span>
            </button>
            {!isManagement && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-canvas border border-border-subtle hover:bg-elevated text-ink-primary rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-accent-primary" />
                <span className="hidden sm:inline">Mutasi Gudang</span>
              </button>
            )}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-canvas border border-border-subtle hover:bg-elevated text-ink-primary rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-ink-emerald" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActiveViewTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'all'
                  ? 'bg-tint-cyan text-ink-cyan border border-tint-cyan-border'
                  : 'bg-canvas text-ink-secondary hover:text-ink-primary border border-border-subtle'
              }`}
            >
              <span>Semua ({filteredMaterials.length + filteredSkus.length})</span>
            </button>
            <button
              onClick={() => setActiveViewTab('materials')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'materials'
                  ? 'bg-tint-cyan text-ink-cyan border border-tint-cyan-border'
                  : 'bg-canvas text-ink-secondary hover:text-ink-primary border border-border-subtle'
              }`}
            >
              <Boxes className="w-3.5 h-3.5 text-accent-primary" />
              <span>Material Stok ({filteredMaterials.length})</span>
            </button>
            <button
              onClick={() => {
                setActiveViewTab('skus');
                setIsSkuCatalogExpanded(true);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
                activeViewTab === 'skus'
                  ? 'bg-tint-amber text-ink-amber border border-tint-amber-border'
                  : 'bg-canvas text-ink-secondary hover:text-ink-primary border border-border-subtle'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-ink-amber" />
              <span>SKU Produk ({filteredSkus.length})</span>
            </button>
          </div>

          {(activeViewTab === 'all' || activeViewTab === 'materials') && (
            <div className="flex items-center gap-1 self-end sm:self-auto">
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
                      ? 'bg-elevated text-ink-cyan border border-accent-primary/50'
                      : 'bg-canvas text-ink-secondary hover:text-ink-primary border border-border-subtle'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible SKU Catalog */}
      {(activeViewTab === 'all' || activeViewTab === 'skus') && (
        <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden no-print">
          <div
            className={`p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 ${
              isSkuCatalogExpanded ? 'border-b border-border-subtle' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => setIsSkuCatalogExpanded(prev => !prev)}
              aria-expanded={isSkuCatalogExpanded}
              className="flex items-center gap-2.5 text-left flex-1 w-full sm:w-auto group focus:outline-none"
            >
              <div className="p-1.5 rounded-lg bg-tint-amber border border-tint-amber-border text-ink-amber">
                <Package className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm text-ink-primary group-hover:text-ink-amber transition">
                    Katalog SKU Produk ({filteredSkus.length} Item)
                  </h3>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas border border-border-subtle text-[10px] font-semibold text-ink-secondary whitespace-nowrap">
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
                <p className="text-[11px] text-ink-secondary">
                  Target kapasitas line &amp; akses cepat kebutuhan BOM
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onSwitchTab('master')}
              className="text-xs text-accent-primary hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Kelola SKU di Master</span>
              <ExternalLink className="w-3 h-3" />
            </button>
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
                        className="bg-canvas border border-border-subtle hover:border-accent-primary/50 p-3.5 rounded-lg space-y-3 transition"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-accent-primary font-bold">
                              {skuCode}
                            </span>
                            <span className="text-ink-secondary">·</span>
                            <h4 className="font-semibold text-ink-primary text-xs sm:text-sm">
                              {sku.name}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-ink-secondary font-mono tabular-nums">
                            <span
                              className={
                                sku.isKite
                                  ? 'text-ink-amber font-semibold'
                                  : 'text-ink-cyan font-semibold'
                              }
                            >
                              {sku.isKite ? 'KITE Ekspor' : 'Domestik'}
                            </span>
                            <span>·</span>
                            <span>{sku.cartonWeightKg.toFixed(4)} kg/karton</span>
                            <span>·</span>
                            <span>Target: {sku.targetHour} ktn/jam</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-ink-secondary bg-surface p-2 rounded-lg border border-border-subtle flex items-center justify-between">
                          <span>Komponen WIP:</span>
                          <span className="font-mono text-ink-primary tabular-nums">
                            {linkedWips.length > 0
                              ? `${linkedWips.length} Jenis WIP Terikat`
                              : 'Belum dihubungkan'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1 border-t border-border-subtle">
                          <button
                            onClick={() => onSwitchTab('bom-calculator')}
                            className="flex-1 py-1.5 bg-tint-indigo hover:opacity-90 border border-tint-indigo-border text-ink-indigo rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                            <span>Hitung Batch</span>
                          </button>
                          <button
                            onClick={() => onSwitchTab('permintaan')}
                            className="flex-1 py-1.5 bg-tint-cyan hover:opacity-90 border border-tint-cyan-border text-ink-cyan rounded-lg text-[11px] font-semibold transition flex items-center justify-center gap-1 whitespace-nowrap"
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
                <div className="text-center py-6 text-ink-secondary text-xs">
                  {searchTerm
                    ? `Tidak ada SKU yang cocok dengan pencarian "${searchTerm}".`
                    : 'Belum ada data SKU terdaftar di Master Data.'}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Stock Inventory Table */}
      {(activeViewTab === 'all' || activeViewTab === 'materials') && (
        <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-tint-cyan border border-tint-cyan-border text-ink-cyan">
                <Boxes className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink-primary flex items-center gap-2">
                  <span>Laporan Saldo Stock Material Aktual</span>
                  <span className="text-[11px] font-mono text-accent-primary tabular-nums">
                    ·{' '}
                    {stockViewLayout === 'breakdown-sku-wip'
                      ? `${filteredBreakdownRows.length} Entri (${groupedBreakdownByLine.length} Line)`
                      : `${displayStockMaterials.length} Item`}
                  </span>
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  {stockViewLayout === 'breakdown-sku-wip'
                    ? 'Dipisahkan per Line Produksi, SKU, dan Jenis WIP yang diproduksi'
                    : 'Pembaruan otomatis dari riwayat Penerimaan & Pemakaian (Per Lokasi Gudang)'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto no-print">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-accent-primary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={stockTableSearch}
                  onChange={e => setStockTableSearch(e.target.value)}
                  placeholder="Cari Line, SKU, WIP, kode/material..."
                  className="w-full bg-canvas border border-border-subtle rounded-lg pl-8 pr-8 py-1.5 text-xs text-ink-primary placeholder:text-ink-secondary focus:outline-none focus:border-accent-primary"
                />
                {stockTableSearch && (
                  <button
                    type="button"
                    onClick={() => setStockTableSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-ink-secondary hover:text-ink-primary rounded"
                    title="Hapus pencarian stok"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-canvas hover:bg-elevated border border-border-subtle text-ink-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-ink-emerald" />
                <span>CSV</span>
              </button>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-canvas hover:bg-elevated border border-border-subtle text-ink-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5 text-accent-primary" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-elevated/40 border-b border-border-subtle space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-canvas p-1 rounded-lg border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setStockViewLayout('breakdown-sku-wip')}
                  className={`px-2.5 py-1 rounded-md font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    stockViewLayout === 'breakdown-sku-wip'
                      ? 'bg-accent-primary text-accent-primary-foreground'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Per Line, SKU &amp; WIP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockViewLayout('by-location')}
                  className={`px-2.5 py-1 rounded-md font-bold text-xs transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    stockViewLayout === 'by-location'
                      ? 'bg-accent-primary text-accent-primary-foreground'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5" />
                  <span>Per Lokasi Gudang (CK &amp; WINEROTO)</span>
                </button>
              </div>

              {stockViewLayout === 'breakdown-sku-wip' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-ink-secondary">SKU:</span>
                    <select
                      value={filterSkuId}
                      onChange={e => setFilterSkuId(e.target.value)}
                      className="bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-[11px] text-ink-primary focus:outline-none focus:border-accent-primary font-medium"
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
                    <span className="text-[11px] text-ink-secondary">WIP:</span>
                    <select
                      value={filterWipId}
                      onChange={e => setFilterWipId(e.target.value)}
                      className="bg-canvas border border-border-subtle rounded-lg px-2 py-1 text-[11px] text-ink-primary focus:outline-none focus:border-accent-primary font-medium"
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

            {stockViewLayout === 'breakdown-sku-wip' && breakdownLineOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border-subtle">
                <span className="text-[11px] font-semibold text-ink-primary mr-1">
                  Pisah Line Produksi:
                </span>
                <button
                  type="button"
                  onClick={() => setFilterLineId('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 tabular-nums ${
                    filterLineId === 'all'
                      ? 'bg-accent-primary text-accent-primary-foreground border-accent-primary'
                      : 'bg-canvas text-ink-primary border-border-subtle hover:bg-elevated'
                  }`}
                >
                  Semua Line ({stockBreakdownRows.length})
                </button>
                {breakdownLineOptions.map(opt => (
                  <button
                    key={opt.lineId}
                    type="button"
                    onClick={() => setFilterLineId(opt.lineId)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 tabular-nums ${
                      filterLineId === opt.lineId
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-canvas text-ink-primary border-border-subtle hover:bg-elevated'
                    }`}
                  >
                    {opt.lineName} ({opt.count})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            {stockViewLayout === 'breakdown-sku-wip' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-elevated text-[11px] font-bold text-ink-primary border-b border-border-subtle whitespace-nowrap">
                    <th className="py-3 px-3">Line Produksi</th>
                    <th className="py-3 px-3">SKU</th>
                    <th className="py-3 px-3">Jenis WIP</th>
                    <th className="py-3 px-2 text-center">Kode</th>
                    <th className="py-3 px-3">Nama Material</th>
                    <th className="py-3 px-3 text-right">Saldo Awal</th>
                    <th className="py-3 px-3 text-right">Pemesanan</th>
                    <th className="py-3 px-3 text-right">Kedatangan</th>
                    <th className="py-3 px-3 text-right text-ink-cyan">Total Onhand</th>
                    <th className="py-3 px-3 text-right text-ink-rose">Pemakaian</th>
                    <th className="py-3 px-3 text-right text-ink-emerald">Saldo Akhir</th>
                    <th className="py-3 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {groupedBreakdownByLine.length > 0 ? (
                    groupedBreakdownByLine.map(lineGrp => (
                      <React.Fragment key={lineGrp.lineId}>
                        <tr className="bg-elevated/70 border-y border-border-subtle">
                          <td colSpan={12} className="py-2 px-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-ink-emerald font-mono">
                                {lineGrp.lineName} · {lineGrp.rows.length} entri material
                              </span>
                              <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums text-ink-secondary">
                                <span>
                                  Pemesanan:{' '}
                                  <strong className="text-ink-amber">
                                    {lineGrp.totalPemesananKg.toFixed(2)} kg
                                  </strong>
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  Onhand:{' '}
                                  <strong className="text-ink-cyan">
                                    {lineGrp.totalOnhandKg.toFixed(2)} kg
                                  </strong>
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  Pemakaian:{' '}
                                  <strong className="text-ink-rose">
                                    {lineGrp.totalPemakaianKg.toFixed(2)} kg
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {lineGrp.rows.map(row => (
                          <tr key={row.rowKey} className="hover:bg-elevated/45 text-xs transition">
                            <td className="py-3 px-3 font-mono font-bold text-ink-emerald whitespace-nowrap">
                              {row.lineName}
                            </td>
                            <td className="py-3 px-3 font-semibold text-ink-primary whitespace-nowrap">
                              <span className="truncate max-w-[170px] inline-block" title={row.skuName}>
                                {row.skuName}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-ink-purple whitespace-nowrap font-medium">
                              {row.wipName}
                            </td>
                            <td className="py-3 px-2 text-center font-mono font-bold text-ink-cyan whitespace-nowrap">
                              {row.materialCode}
                            </td>
                            <td className="py-3 px-3 font-medium text-ink-primary whitespace-nowrap">
                              <span>{row.materialName}</span>
                              <span className="block text-[10px] text-ink-secondary font-mono">
                                {row.batchSizeKg.toFixed(2)} kg/batch
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="text-ink-primary font-semibold">
                                {row.saldoAwalBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-secondary">
                                ({row.saldoAwalKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="text-ink-amber font-semibold">
                                {row.pemesananBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-amber/80">
                                ({row.pemesananKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              <div className="text-ink-emerald font-semibold">
                                {row.kedatanganBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-emerald/80">
                                ({row.kedatanganKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums bg-tint-cyan/35 whitespace-nowrap">
                              <div className="text-ink-cyan font-bold">
                                {row.totalOnhandBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-cyan">
                                ({row.totalOnhandKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums bg-tint-rose/35 whitespace-nowrap">
                              <div className="text-ink-rose font-bold">
                                {row.pemakaianBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-rose">
                                ({row.pemakaianKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums bg-tint-emerald/35 whitespace-nowrap">
                              <div className="text-ink-emerald font-bold">
                                {row.saldoAkhirBatch.toFixed(2)} btc
                              </div>
                              <div className="text-[10px] text-ink-emerald">
                                ({row.saldoAkhirKg.toFixed(2)} kg)
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {row.status === 'KOSONG' ? (
                                <span className="text-[10px] font-bold text-ink-secondary">KOSONG</span>
                              ) : row.status === 'MENIPIS' ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tint-rose text-ink-rose border border-tint-rose-border inline-flex items-center space-x-1">
                                  <AlertTriangle className="w-3 h-3 text-ink-rose" />
                                  <span>MENIPIS</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-tint-emerald text-ink-emerald border border-tint-emerald-border inline-flex items-center space-x-1">
                                  <CheckCircle2 className="w-3 h-3 text-ink-emerald" />
                                  <span>AMAN</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={12} className="text-center py-10 px-4 text-ink-secondary">
                        <Boxes className="w-10 h-10 text-ink-secondary/60 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-ink-primary">
                          Tidak ditemukan data breakdown stok material yang sesuai dengan filter.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-elevated text-[11px] font-semibold text-ink-primary border-b border-border-subtle">
                    <th className="py-3 px-4">Kode &amp; Nama Material</th>
                    <th className="py-3 px-3">Tipe / Kemasan</th>
                    <th className="py-3 px-3">Supplier</th>
                    <th className="py-3 px-3 text-right">Stock CK</th>
                    <th className="py-3 px-3 text-right">Stock WINEROTO</th>
                    <th className="py-3 px-3 text-right font-bold text-ink-cyan">Total Aktual</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {displayStockMaterials.length > 0 ? (
                    displayStockMaterials.map(item => (
                      <tr key={item.materialId} className="hover:bg-elevated/45 text-xs transition">
                        <td className="py-3 px-4 font-medium text-ink-primary">
                          <span className="font-mono text-[11px] text-ink-cyan font-bold mr-2">
                            {item.materialCode}
                          </span>
                          <span>{item.materialName}</span>
                        </td>
                        <td className="py-3 px-3 text-ink-primary">
                          <span className="uppercase font-semibold mr-1.5 text-[11px] text-ink-secondary">
                            {item.type}
                          </span>
                          <span className="text-[11px] text-ink-secondary">{item.packaging}</span>
                        </td>
                        <td className="py-3 px-3 text-ink-primary text-[11px]">{item.source}</td>
                        <td className="py-3 px-3 text-right font-mono text-ink-primary tabular-nums">
                          {item.stockCk.toFixed(4)} kg
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-ink-primary tabular-nums">
                          {item.stockWineroto.toFixed(4)} kg
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-ink-cyan tabular-nums">
                          {item.totalActual.toFixed(4)} kg
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.totalActual === 0 ? (
                            <span className="text-[10px] text-ink-secondary">Kosong</span>
                          ) : item.isLowStock ? (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-tint-rose text-ink-rose border border-tint-rose-border inline-flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Menipis</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-tint-emerald text-ink-emerald border border-tint-emerald-border inline-flex items-center space-x-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Aman</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="text-center py-10 px-4 text-ink-secondary">
                        <Boxes className="w-10 h-10 text-ink-secondary/60 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-ink-primary">
                          Belum ada data material sesuai pencarian.
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
          <div className="bg-surface border border-border-subtle rounded-xl w-full max-w-md p-5 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center space-x-2 text-accent-primary">
                <ArrowRightLeft className="w-4 h-4" />
                <h3 className="font-bold text-sm text-ink-primary">Mutasi / Pindah Stok Gudang</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="text-ink-secondary hover:text-ink-primary p-1 rounded-lg hover:bg-elevated transition"
                aria-label="Tutup modal mutasi stok"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleExecuteTransfer}
              className="space-y-3 text-xs bg-canvas/70 border border-border-subtle rounded-2xl p-3.5"
            >
              <div>
                <label className="block text-[11px] font-medium text-ink-primary mb-1">
                  Pilih Material
                </label>
                <select
                  value={transferMatId}
                  onChange={e => setTransferMatId(e.target.value)}
                  required
                  className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
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
                  <label className="block text-[11px] font-medium text-ink-primary mb-1">
                    Dari Lokasi
                  </label>
                  <select
                    value={transferFrom}
                    onChange={e => setTransferFrom(e.target.value as StorageLocation)}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="CK">Area CK</option>
                    <option value="WINEROTO">Area WINEROTO</option>
                    <option value="STORAGE_TANK">Tank Liquid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-primary mb-1">
                    Ke Lokasi
                  </label>
                  <select
                    value={transferTo}
                    onChange={e => setTransferTo(e.target.value as StorageLocation)}
                    className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="WINEROTO">Area WINEROTO</option>
                    <option value="CK">Area CK</option>
                    <option value="STORAGE_TANK">Tank Liquid</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-primary mb-1">
                  Jumlah Berat Dipindahkan (kg, 4 desimal)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={transferQty}
                  onChange={e => setTransferQty(e.target.value)}
                  placeholder="0.0000"
                  className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-ink-primary font-mono tabular-nums focus:outline-none focus:border-accent-primary"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="w-1/2 py-2.5 bg-elevated hover:bg-elevated/80 border border-border-subtle text-ink-primary rounded-lg font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-accent-primary hover:bg-accent-primary-hover text-accent-primary-foreground font-semibold rounded-lg transition shadow-sm"
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
