import React, { useState, useMemo } from 'react';
import {
  Cylinder,
  Activity,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightLeft,
  RotateCw,
  AlertTriangle,
  CheckCircle2,
  Package,
  Plus,
  Minus,
  Search,
  Filter,
  Sliders,
  Printer,
  Sparkles,
  Info,
  Thermometer,
  ShieldAlert,
  Flame,
  Check,
  Zap,
  TrendingDown,
  History,
  Play,
  Square,
  Eye,
  Lock
} from 'lucide-react';
import {
  AppState,
  WipTank,
  WipTankType,
  SKU,
  WIP,
  SkuWip,
  ShiftNumber,
  ProductionStopLog
} from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import { InterTankTransferModal } from '../InterTankTransferModal';
import { SixBigLossesModal } from '../SixBigLossesModal';
import { HoldingTankSelectionModal } from '../HoldingTankSelectionModal';
import {
  getAllTanksForWip,
  getSkusRequiringHoldingTankChoice,
  pickDefaultHoldingTankId
} from '../../utils/skuTankHelper';

interface TankMonitoringViewProps {
  state: AppState;
  onProduceCartons: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ) => { success: boolean; message: string };
  onUpdateTankItem: (tankId: string, updates: Partial<WipTank>) => void;
  onTopUpTank: (tankId: string, amountKg: number, notes?: string) => void;
  onTransferTanks?: (
    sourceTankId: string,
    destTankId: string,
    amountKg: number,
    notes?: string,
    operatorName?: string
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
  onUpdateRunHoldingTank?: (skuId: string, wipId: string, tankId: string, runId?: string) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onSetRunSpeedMultiplier?: (multiplier: number, runIdOrSkuId?: string) => void;
  showToast: (msg: string, isError?: boolean) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
}

export const TankMonitoringView: React.FC<TankMonitoringViewProps> = ({
  state,
  onProduceCartons,
  onUpdateTankItem,
  onTopUpTank,
  onTransferTanks,
  onStartSkuProduction,
  onUpdateRunHoldingTank,
  onStopSkuProduction,
  onSetRunSpeedMultiplier,
  showToast,
  onSwitchTab
}) => {
  // Filter state
  const [tankTypeFilter, setTankTypeFilter] = useState<'ALL' | WipTankType | 'LOW_STOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Active SKU for production
  const defaultSkuId = state.activeSkuRun?.skuId || state.master.skus[0]?.id || '';
  const [selectedSkuId, setSelectedSkuId] = useState<string>(defaultSkuId);
  const [customCartons, setCustomCartons] = useState<string>('200');
  const [operatorName, setOperatorName] = useState<string>('Operator Line Produksi');

  // Modal / popover for Refill or Calibration
  const [activeRefillTank, setActiveRefillTank] = useState<WipTank | null>(null);
  const [refillAmount, setRefillAmount] = useState<string>('100');
  const [refillNotes, setRefillNotes] = useState<string>('Transfer batch dari mixer');

  const [activeCalibrateTank, setActiveCalibrateTank] = useState<WipTank | null>(null);
  const [calibratedLevel, setCalibratedLevel] = useState<string>('');

  // Inter-tank transfer modal state (Holding Tank ➔ Storage Tank / Storage ➔ Holding)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [initialTransferSourceId, setInitialTransferSourceId] = useState<string | undefined>(undefined);

  // Six Big Losses stop modal state
  const [isStopModalOpen, setIsStopModalOpen] = useState(false);

  // Per-SKU Holding Tank selection state (used when a WIP has >= 2 Holding Tanks configured)
  const [selectedHoldingTanksBySku, setSelectedHoldingTanksBySku] = useState<Record<string, Record<string, string>>>({});
  const [pendingHoldingTankSkuId, setPendingHoldingTankSkuId] = useState<string | null>(null);

  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const isAdmin = state.currentUserRole === 'ADMINISTRATOR' || state.isAdmin;
  const currentShift = getCurrentShift();

  // Active SKU object
  const activeSku = useMemo(() => {
    return state.master.skus.find(s => s.id === selectedSkuId) || state.master.skus[0];
  }, [state.master.skus, selectedSkuId]);

  const activeRunForSelectedSku = useMemo(() => {
    const runs = state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : []);
    return activeSku ? runs.find(r => r.skuId === activeSku.id) : undefined;
  }, [state.activeSkuRuns, state.activeSkuRun, activeSku]);

  // Linked WIPs for active SKU
  const activeSkuWips = useMemo(() => {
    if (!activeSku) return [];
    return state.master.skuWips.filter(sw => sw.skuId === activeSku.id);
  }, [activeSku, state.master.skuWips]);

  // Breakdown of tanks impacted per carton of active SKU
  const activeSkuTankBreakdown = useMemo(() => {
    return activeSkuWips.map(sw => {
      const wip = state.master.wips.find(w => w.id === sw.wipId);
      const allTanks = getAllTanksForWip(wip, state.master.tanks);
      const holdingTanks = allTanks.filter(t => t.type === 'HOLDING_TANK');
      const runHtId = wip ? activeRunForSelectedSku?.selectedHoldingTanks?.[wip.id] : undefined;
      const manualHtId = wip && activeSku ? selectedHoldingTanksBySku[activeSku.id]?.[wip.id] : undefined;
      const preferredHtId = (activeRunForSelectedSku?.isRunning ? runHtId : undefined) || manualHtId || runHtId;

      const tank =
        (preferredHtId ? allTanks.find(t => t.id === preferredHtId) : undefined) ||
        (holdingTanks.length > 0
          ? holdingTanks.find(t => t.id === pickDefaultHoldingTankId(holdingTanks)) || holdingTanks[0]
          : undefined) ||
        allTanks[0];

      return {
        skuWip: sw,
        wip,
        tank,
        allTanks,
        holdingTanks,
        kgPerCarton: sw.kgWipPerCartonSku
      };
    });
  }, [activeSkuWips, state.master.wips, state.master.tanks, activeRunForSelectedSku, selectedHoldingTanksBySku, activeSku]);

  // Overall Statistics
  const stats = useMemo(() => {
    const tanks = state.master.tanks;
    const totalCapacity = tanks.reduce((sum, t) => sum + t.capacityKg, 0);
    const totalCurrentLevel = tanks.reduce((sum, t) => sum + t.currentLevelKg, 0);
    const holdingTanks = tanks.filter(t => t.type === 'HOLDING_TANK');
    const storageTanks = tanks.filter(t => t.type === 'STORAGE_TANK');
    const lowStockTanks = tanks.filter(t => {
      const threshold = t.minAlertKg || t.capacityKg * 0.2;
      return t.currentLevelKg <= threshold;
    });
    const avgUtilization = totalCapacity > 0 ? (totalCurrentLevel / totalCapacity) * 100 : 0;

    return {
      totalTanks: tanks.length,
      holdingCount: holdingTanks.length,
      storageCount: storageTanks.length,
      totalCapacity,
      totalCurrentLevel,
      lowStockCount: lowStockTanks.length,
      avgUtilization
    };
  }, [state.master.tanks]);

  // Filtered tanks
  const filteredTanks = useMemo(() => {
    return state.master.tanks.filter(t => {
      // Type filter
      if (tankTypeFilter === 'HOLDING_TANK' && t.type !== 'HOLDING_TANK') return false;
      if (tankTypeFilter === 'STORAGE_TANK' && t.type !== 'STORAGE_TANK') return false;
      if (tankTypeFilter === 'LOW_STOCK') {
        const threshold = t.minAlertKg || t.capacityKg * 0.2;
        if (t.currentLevelKg > threshold) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const wip = state.master.wips.find(w => w.id === t.assignedWipId);
        const matchCode = t.code.toLowerCase().includes(q);
        const matchName = t.name.toLowerCase().includes(q);
        const matchWip = wip ? wip.name.toLowerCase().includes(q) : false;
        if (!matchCode && !matchName && !matchWip) return false;
      }

      return true;
    });
  }, [state.master.tanks, state.master.wips, tankTypeFilter, searchQuery]);

  // Quick Carton Deduction Trigger
  const handleTriggerProduction = (qty: number) => {
    if (!activeSku) {
      showToast('Harap pilih SKU yang sedang diproduksi terlebih dahulu', true);
      return;
    }
    if (qty <= 0) {
      showToast('Jumlah karton harus lebih dari 0', true);
      return;
    }

    const effectiveHtMap: Record<string, string> = {};
    activeSkuTankBreakdown.forEach(b => {
      if (b.wip && b.holdingTanks.length >= 2 && b.tank && b.tank.type === 'HOLDING_TANK') {
        effectiveHtMap[b.wip.id] = b.tank.id;
      }
    });

    const result = onProduceCartons(
      activeSku.id,
      qty,
      operatorName,
      `Output ${qty} karton via Panel Monitoring Tangki`,
      Object.keys(effectiveHtMap).length > 0 ? effectiveHtMap : undefined,
      activeRunForSelectedSku?.id,
      activeRunForSelectedSku?.lineId,
      activeRunForSelectedSku?.lineName
    );
    if (result.success) {
      showToast(result.message);
    } else {
      showToast(result.message, true);
    }
  };

  // Submit custom carton count
  const handleCustomCartonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(customCartons, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Masukkan jumlah karton valid (angka positif)', true);
      return;
    }
    handleTriggerProduction(qty);
  };

  // Refill Submit
  const handleRefillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses ditolak: Isi Batch WIP hanya dapat dilakukan di Mode Administrator.', true);
      setActiveRefillTank(null);
      return;
    }
    if (!activeRefillTank) return;
    const amount = parseFloat(refillAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast('Masukkan jumlah penambahan (kg) yang valid', true);
      return;
    }

    onTopUpTank(activeRefillTank.id, amount, refillNotes);
    showToast(`Berhasil menambahkan ${amount.toFixed(2)} kg ke ${activeRefillTank.code}`);
    setActiveRefillTank(null);
  };

  // Calibration Submit
  const handleCalibrateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses ditolak: Kalibrasi isi tangki hanya dapat dilakukan di Mode Administrator.', true);
      setActiveCalibrateTank(null);
      return;
    }
    if (!activeCalibrateTank) return;
    const newLvl = parseFloat(calibratedLevel);
    if (isNaN(newLvl) || newLvl < 0 || newLvl > activeCalibrateTank.capacityKg) {
      showToast(`Level harus antara 0 dan kapasitas maks (${activeCalibrateTank.capacityKg} kg)`, true);
      return;
    }

    const diff = newLvl - activeCalibrateTank.currentLevelKg;
    onUpdateTankItem(activeCalibrateTank.id, { currentLevelKg: newLvl });
    showToast(`Level ${activeCalibrateTank.code} berhasil dikalibrasi menjadi ${newLvl.toFixed(2)} kg (${diff >= 0 ? '+' : ''}${diff.toFixed(2)} kg)`);
    setActiveCalibrateTank(null);
  };

  // Toggle Agitator
  const handleToggleAgitator = (tank: WipTank) => {
    const newStatus = tank.agitatorStatus === 'ON' ? 'OFF' : 'ON';
    onUpdateTankItem(tank.id, { agitatorStatus: newStatus });
    showToast(`Agitator ${tank.code} diubah ke ${newStatus}`);
  };

  // Print Summary
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Title & Executive Bar */}
      <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-sky-800 text-xs font-bold uppercase tracking-wider mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dedicated Process Dashboard</span>
            <span className="text-slate-400">•</span>
            <span className="text-amber-800 font-bold">Shift {currentShift.shift} ({currentShift.timeRange})</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-slate-900 flex items-center space-x-2.5">
            <Cylinder className="w-6 h-6 text-sky-700" />
            <span>Monitoring Tangki WIP (Holding & Storage Tank)</span>
          </h2>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Pantau ketersediaan massa WIP secara real-time. Isi tangki otomatis berkurang presisi setiap 1 karton produk jadi (SKU) yang berhasil diproduksi berdasarkan formula rasio BOM WIP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isManagement && (
            <button
              onClick={() => {
                setInitialTransferSourceId(undefined);
                setIsTransferModalOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition shadow-xs active:scale-95"
              title="Transfer Antar-Tangki (Holding Tank ➔ Storage Tank atau sebaliknya)"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Transfer Antar-Tangki</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/20 text-white font-bold ml-0.5">
                Rule Baru
              </span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-medium transition shadow"
            title="Cetak Ringkasan Tangki"
          >
            <Printer className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Cetak Laporan</span>
          </button>

          {isAdmin && onSwitchTab && (
            <button
              onClick={() => onSwitchTab('master')}
              className="flex items-center space-x-2 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-medium transition"
            >
              <Sliders className="w-4 h-4" />
              <span>Kelola Master</span>
            </button>
          )}
        </div>
      </div>

      {/* Odoo MES Management Read-Only Banner */}
      {isManagement && (
        <div className="bg-indigo-950/50 border border-indigo-500/40 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center space-x-1.5">
                <span>Odoo MRP Portal: Mode Management (Pantau Saja)</span>
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Memantau telemetri seluruh {state.master.tanks.length} tangki WIP (Holding Tank & Storage Tank) secara visual dan real-time. Tidak dapat melakukan transfer atau pengisian tangki.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40 font-mono whitespace-nowrap">
            READ-ONLY
          </span>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="bg-white border border-slate-200 p-3.5 sm:p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1.5">
            <span>Total Tangki WIP</span>
            <Cylinder className="w-4 h-4 text-sky-700" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">{stats.totalTanks}</span>
            <span className="text-[11px] text-slate-500 font-medium">Unit</span>
          </div>
          <div className="flex items-center space-x-2 mt-2 text-[10px]">
            <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-950 border border-sky-300 font-bold">
              {stats.holdingCount} Holding
            </span>
            <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-950 border border-indigo-300 font-bold">
              {stats.storageCount} Storage
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border border-slate-200 p-3.5 sm:p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1.5">
            <span>Total Massa WIP Tersedia</span>
            <Layers className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono">
              {stats.totalCurrentLevel.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
            </span>
            <span className="text-[11px] text-slate-600 font-medium">/ {stats.totalCapacity.toLocaleString('id-ID')} kg</span>
          </div>
          <div className="mt-2 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats.avgUtilization)}%` }}
            />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border border-slate-200 p-3.5 sm:p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1.5">
            <span>Rata-rata Utilisasi Kapasitas</span>
            <Activity className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl sm:text-2xl font-extrabold text-amber-700 font-mono">
              {stats.avgUtilization.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Kapasitas Penuh</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 font-medium">
            Status tangki keseluruhan optimal & siap produksi
          </p>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border border-slate-200 p-3.5 sm:p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-600 text-xs font-semibold mb-1.5">
            <span>Tangki Menipis / Perlu Diisi</span>
            <ShieldAlert className={`w-4 h-4 ${stats.lowStockCount > 0 ? 'text-rose-600 animate-bounce' : 'text-slate-400'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-xl sm:text-2xl font-extrabold font-mono ${stats.lowStockCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
              {stats.lowStockCount}
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Tangki di bawah 20%</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">
            {stats.lowStockCount > 0 ? (
              <span className="text-rose-700 font-bold">Perlu segera dilakukan batch transfer</span>
            ) : (
              <span className="text-emerald-700 font-medium">Semua tangki dalam batas aman</span>
            )}
          </p>
        </div>
      </div>

      {/* SECTION: Automated Carton Production Controller & Depletion Mechanism */}
      <div className="bg-white border-2 border-sky-300 rounded-2xl p-4 sm:p-6 shadow-xs space-y-4 relative overflow-hidden text-slate-900">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-950 border border-sky-300 uppercase tracking-wider flex items-center space-x-1">
                <Zap className="w-3 h-3 text-sky-700" />
                <span>Pengurang Tangki Otomatis Per Karton</span>
              </span>
              <span className="text-xs text-slate-500 font-medium">• Real-time Depletion Logic</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center space-x-2">
              <Package className="w-5 h-5 text-sky-700" />
              <span>Simulasi & Monitoring Output Produksi Karton (SKU)</span>
            </h3>
            <p className="text-xs text-slate-600 font-medium">
              Pengurangan isi (kg) tangki holding & storage tank otomatis berjalan secara real-time berdasarkan Target Master BOM saat tombol Start ditekan.
            </p>
          </div>

          {/* Active SKU Selector & Start/Stop Controls */}
          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-wrap items-center gap-2 shrink-0">
            <span className="text-xs text-slate-700 font-bold shrink-0">SKU Aktif:</span>
            <select
              value={selectedSkuId}
              onChange={(e) => setSelectedSkuId(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-xs"
            >
              {state.master.skus.map(s => {
                const isRun = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).some(r => r.isRunning && r.skuId === s.id);
                return (
                  <option key={s.id} value={s.id}>
                    {isRun ? '● [RUNNING] ' : ''}{s.name} ({s.code || 'SKU'} {s.isKite ? '• KITE' : ''})
                  </option>
                );
              })}
            </select>

            {/* Speed selector if running */}
            {(() => {
              const currentRunForSelected = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).find(r => r.skuId === selectedSkuId);
              if (!currentRunForSelected?.isRunning) return null;
              return (
                <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-xs">
                  <span className="text-[10px] text-slate-600 font-mono font-medium">Speed:</span>
                  {[1, 2, 5].map((mult) => (
                    <button
                      key={mult}
                      type="button"
                      onClick={() => onSetRunSpeedMultiplier && onSetRunSpeedMultiplier(mult, currentRunForSelected.id || selectedSkuId)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono transition ${
                        (currentRunForSelected?.speedMultiplier || 1) === mult
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {mult}x
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* Start / Stop Production Buttons */}
            {isManagement ? (
              <div className="px-3 py-1.5 bg-indigo-950/60 border border-indigo-500/40 rounded-lg text-xs text-indigo-300 font-semibold flex items-center space-x-1.5 shadow">
                <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
                <span>Mode Management (Pantau Saja)</span>
              </div>
            ) : (() => {
              const isSelectedRunning = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).some(r => r.isRunning && r.skuId === selectedSkuId);
              if (isSelectedRunning) {
                return (
                  <button
                    type="button"
                    onClick={() => setIsStopModalOpen(true)}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-lg text-xs font-bold shadow-md shadow-rose-600/30 flex items-center space-x-1.5 transition active:scale-95 animate-pulse"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop SKU Ini (Six Big Losses)</span>
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedSkuId) {
                      const multiHtReqs = getSkusRequiringHoldingTankChoice([selectedSkuId], state);
                      if (multiHtReqs.length > 0) {
                        setPendingHoldingTankSkuId(selectedSkuId);
                        return;
                      }
                      if (onStartSkuProduction) {
                        onStartSkuProduction(selectedSkuId, operatorName);
                      }
                    }
                  }}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center space-x-1.5 transition active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Mulai SKU Ini (Start)</span>
                </button>
              );
            })()}
          </div>
        </div>

        {/* Formula breakdown card for 1 carton */}
        {activeSku && (
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-300 gap-2">
              <div className="flex items-center space-x-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="font-semibold text-white">
                  Rasio Kebutuhan BOM untuk 1 Karton [{activeSku.name}]:
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Bobot Karton: {activeSku.cartonWeightKg.toFixed(2)} kg/karton • Target: {activeSku.targetHour} karton/jam
              </span>
            </div>

            {/* Breakdown of linked WIPs and target tanks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {activeSkuTankBreakdown.map(({ skuWip, wip, tank, holdingTanks, kgPerCarton }) => {
                const isTankLow = tank ? tank.currentLevelKg < (kgPerCarton * 5) : true;
                const maxPossibleCartons = tank && kgPerCarton > 0 ? Math.floor(tank.currentLevelKg / kgPerCarton) : 0;

                return (
                  <div
                    key={skuWip.id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                      tank
                        ? 'bg-slate-900/90 border-slate-700/80'
                        : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white truncate mr-2">{wip?.name || 'WIP'}</span>
                        <span className="font-mono text-cyan-400 font-bold shrink-0">
                          {kgPerCarton.toFixed(4)} kg / ctn
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-1.5">
                        <span>Tangki Sumber:</span>
                        {tank ? (
                          <span className="font-semibold text-amber-300 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                            {tank.code} ({tank.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'})
                          </span>
                        ) : (
                          <span className="text-rose-400 font-semibold">Belum Ditautkan</span>
                        )}
                      </div>

                      {holdingTanks.length >= 2 && wip && activeSku && (
                        <div className="mt-2 pt-1.5 border-t border-slate-800 space-y-1">
                          <label className="text-[10px] font-semibold text-cyan-300 block">
                            Pilih Holding Tank ({holdingTanks.length} Opsi Tersedia):
                          </label>
                          <select
                            disabled={isManagement}
                            value={tank?.id || ''}
                            onChange={(e) => {
                              const newTankId = e.target.value;
                              setSelectedHoldingTanksBySku(prev => ({
                                ...prev,
                                [activeSku.id]: {
                                  ...(prev[activeSku.id] || {}),
                                  [wip.id]: newTankId
                                }
                              }));
                              if (activeRunForSelectedSku?.isRunning && onUpdateRunHoldingTank) {
                                onUpdateRunHoldingTank(activeSku.id, wip.id, newTankId, activeRunForSelectedSku.id);
                              }
                            }}
                            className="w-full bg-slate-950 border border-cyan-500/40 rounded-lg px-2 py-1 text-[11px] font-mono font-bold text-white focus:outline-none focus:border-cyan-400"
                          >
                            {holdingTanks.map(ht => (
                              <option key={ht.id} value={ht.id}>
                                {ht.code} - {ht.name} ({ht.currentLevelKg.toFixed(1)} kg)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {tank && (
                      <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          Isi: <strong className="text-white font-mono">{tank.currentLevelKg.toFixed(1)} kg</strong>
                        </span>
                        <span className={`font-mono font-medium ${isTankLow ? 'text-rose-400' : 'text-emerald-400'}`}>
                          Cukup {maxPossibleCartons} ktn
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Increment Depletion Buttons (Hidden for Management) */}
        {!isManagement && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600 font-bold mr-1">Aksi Cepat Pengurangan:</span>
              <button
                onClick={() => handleTriggerProduction(1)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center space-x-1.5 transition active:scale-95 border border-sky-700"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
                <span className="text-white font-bold">+1 Karton Selesai</span>
              </button>

              <button
                onClick={() => handleTriggerProduction(5)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +5 Karton
              </button>

              <button
                onClick={() => handleTriggerProduction(10)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +10 Karton
              </button>

              <button
                onClick={() => handleTriggerProduction(25)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +25 Karton
              </button>

              <button
                onClick={() => handleTriggerProduction(50)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +50 Karton
              </button>

              <button
                onClick={() => handleTriggerProduction(100)}
                className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +100 Karton
              </button>

              <button
                onClick={() => handleTriggerProduction(200)}
                className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-300 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs"
              >
                +200 Karton (cth: jam 15:30)
              </button>
            </div>

            {/* Custom Carton Input */}
            <form onSubmit={handleCustomCartonSubmit} className="flex items-center space-x-2 shrink-0">
              <div className="flex items-center bg-white rounded-xl border border-slate-300 px-2.5 py-1 shadow-xs">
                <span className="text-xs text-slate-600 font-medium mr-2">Qty Custom:</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={customCartons}
                  onChange={(e) => setCustomCartons(e.target.value)}
                  className="w-16 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs text-slate-900 font-mono font-bold text-center focus:outline-none focus:border-sky-500"
                />
                <span className="text-xs text-slate-600 font-medium ml-1">ktn</span>
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition active:scale-95 shadow-xs border border-sky-700"
              >
                Kurangi
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Tank Controls: Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        {/* Filter buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setTankTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              tankTypeFilter === 'ALL'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Semua Tangki ({state.master.tanks.length})
          </button>
          <button
            onClick={() => setTankTypeFilter('STORAGE_TANK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              tankTypeFilter === 'STORAGE_TANK'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Storage Tank ({stats.storageCount})
          </button>
          <button
            onClick={() => setTankTypeFilter('HOLDING_TANK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              tankTypeFilter === 'HOLDING_TANK'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Holding Tank ({stats.holdingCount})
          </button>
          <button
            onClick={() => setTankTypeFilter('LOW_STOCK')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
              tankTypeFilter === 'LOW_STOCK'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Menipis / Perlu Diisi ({stats.lowStockCount})
          </button>
        </div>

        {/* Search bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode/nama tangki..."
            className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 font-medium shadow-xs"
          />
        </div>
      </div>

      {/* TANKS GRID: Visual Cylinders & Detail Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTanks.map((tank) => {
          const wip = state.master.wips.find(w => w.id === tank.assignedWipId);
          const mIds = tank.assignedMachineIds && tank.assignedMachineIds.length > 0
            ? tank.assignedMachineIds
            : tank.assignedMachineId ? [tank.assignedMachineId] : [];
          const machines = state.master.machines.filter(m => mIds.includes(m.id));
          const percent = tank.capacityKg > 0 ? (tank.currentLevelKg / tank.capacityKg) * 100 : 0;
          const isLow = tank.currentLevelKg <= (tank.minAlertKg || tank.capacityKg * 0.2);

          // Calculate how many cartons of active SKU this tank can produce
          const linkedSkuWip = activeSku ? state.master.skuWips.find(sw => sw.skuId === activeSku.id && sw.wipId === wip?.id) : null;
          const kgPerCarton = linkedSkuWip?.kgWipPerCartonSku || 0;
          const estimatedCartons = kgPerCarton > 0 ? Math.floor(tank.currentLevelKg / kgPerCarton) : null;

          return (
            <div
              key={tank.id}
              className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-xs transition hover:border-sky-400 flex flex-col justify-between ${
                isLow ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-200'
              }`}
            >
              {/* Header card */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-extrabold text-sky-950 bg-sky-100 px-2.5 py-0.5 rounded-lg border border-sky-300 shadow-xs">
                        {tank.code}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          tank.type === 'STORAGE_TANK'
                            ? 'bg-indigo-100 text-indigo-950 border border-indigo-300'
                            : 'bg-amber-100 text-amber-950 border border-amber-300'
                        }`}
                      >
                        {tank.type === 'STORAGE_TANK' ? 'Storage Tank' : 'Holding Tank'}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-slate-900 mt-1.5">{tank.name}</h4>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      tank.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tank.status}
                  </span>
                </div>

                {/* Assigned WIP & Multi-Machine Info */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 my-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 text-[11px] font-medium">1 Formula WIP:</span>
                    <span className="text-slate-900 font-bold truncate max-w-[170px] text-right">
                      {wip ? wip.name : <em className="text-slate-400 font-normal">Kosong / Belum Diisi</em>}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-600 text-[11px] font-medium">Mesin Pengisi:</span>
                      <span className="text-[10px] text-sky-800 font-mono font-bold">
                        {machines.length} Mesin Sumber
                      </span>
                    </div>

                    {machines.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {machines.map(m => (
                          <span
                            key={m.id}
                            className="px-1.5 py-0.5 bg-sky-100 border border-sky-300 text-sky-950 rounded text-[10px] font-mono flex items-center space-x-1"
                            title={`${m.code} - ${m.name} (${m.line})`}
                          >
                            <span className="font-extrabold text-sky-950 bg-sky-200/80 px-1 py-0.2 rounded border border-sky-300">{m.code}</span>
                            <span className="text-slate-800 truncate max-w-[90px] font-medium">{m.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[10px] italic">
                        Belum dihubungkan ke mesin pengisi
                      </span>
                    )}
                  </div>
                </div>

                {/* VISUAL TANK CYLINDER GAUGE */}
                <div className="flex items-center space-x-4 my-4">
                  {/* Visual SVG Tank Vessel */}
                  <div className="relative w-16 h-28 bg-slate-100 rounded-2xl border-2 border-slate-300 overflow-hidden flex flex-col justify-end p-1 shadow-inner shrink-0">
                    {/* Measurement graduation markings */}
                    <div className="absolute inset-y-2 left-1.5 flex flex-col justify-between text-[8px] font-mono text-slate-500 select-none pointer-events-none z-10">
                      <span>-100%</span>
                      <span>-75%</span>
                      <span>-50%</span>
                      <span>-25%</span>
                      <span>-0%</span>
                    </div>

                    {/* Animated Liquid Level */}
                    <div
                      className={`w-full rounded-b-xl transition-all duration-700 relative overflow-hidden ${
                        percent < 20
                          ? 'bg-rose-500'
                          : percent < 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ height: `${Math.max(4, Math.min(100, percent))}%` }}
                    >
                      {/* Wave shine effect */}
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </div>
                  </div>

                  {/* Level numbers & stats */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-600 font-medium">Level Saat Ini:</span>
                      <span className="font-mono text-base font-extrabold text-slate-900">
                        {tank.currentLevelKg.toFixed(1)} <span className="text-xs font-normal text-slate-500">kg</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Kapasitas Maks:</span>
                      <span className="font-mono text-slate-800 font-semibold">
                        {tank.capacityKg.toFixed(0)} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium">Persentase:</span>
                      <span
                        className={`font-mono font-bold ${
                          percent < 20 ? 'text-rose-400' : percent < 50 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {percent.toFixed(1)}%
                      </span>
                    </div>

                    {/* Low stock warning */}
                    {isLow && (
                      <div className="flex items-center space-x-1.5 text-rose-400 text-[11px] font-bold bg-rose-500/10 px-2 py-1 rounded-lg border border-rose-500/20">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Level Kritis (&lt; 20%)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sensors: Temperature & Agitator Status */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
                  <div className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <div className="flex items-center space-x-1.5 text-slate-600 text-[11px] font-medium">
                      <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                      <span>Suhu:</span>
                    </div>
                    <span className="font-mono text-slate-900 font-extrabold text-[11px]">
                      {tank.temp !== undefined ? `${tank.temp.toFixed(1)}°C` : 'N/A'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleAgitator(tank)}
                    className={`flex items-center justify-between p-2 rounded-xl border transition ${
                      tank.agitatorStatus === 'ON'
                        ? 'bg-sky-100 border-sky-300 text-sky-950 font-bold'
                        : 'bg-slate-100 border-slate-200 text-slate-700 font-medium'
                    }`}
                    title="Klik untuk mengubah status agitator (ON/OFF)"
                  >
                    <div className="flex items-center space-x-1.5 text-[11px]">
                      <RotateCw
                        className={`w-3.5 h-3.5 ${tank.agitatorStatus === 'ON' ? 'animate-spin text-sky-700' : ''}`}
                      />
                      <span>Agitator:</span>
                    </div>
                    <span className="font-bold text-[10px]">
                      {tank.agitatorStatus || 'OFF'}
                    </span>
                  </button>
                </div>

                {/* Carton Production Capability */}
                {estimatedCartons !== null && (
                  <div className="mt-3 p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-xs flex items-center justify-between">
                    <span className="text-slate-700 text-[11px] font-medium">
                      Kemampuan Produksi [{activeSku?.code || 'SKU'}]:
                    </span>
                    <span className="font-mono text-sky-950 font-extrabold">
                      {estimatedCartons} Karton
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons footer */}
              {!isManagement ? (
                <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-200">
                  {isAdmin ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setActiveRefillTank(tank);
                          setRefillAmount(wip ? wip.batchWeightKg.toString() : '100');
                        }}
                        className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-xs"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5 text-sky-700" />
                        <span>+ Isi Batch WIP</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveCalibrateTank(tank);
                          setCalibratedLevel(tank.currentLevelKg.toString());
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-xs"
                      >
                        <Sliders className="w-3.5 h-3.5 text-slate-600" />
                        <span>Kalibrasi Level</span>
                      </button>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-medium flex items-center space-x-1.5">
                      <Lock className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>Isi Batch WIP & Kalibrasi Isi Tangki hanya tersedia di Mode Administrator</span>
                    </div>
                  )}

                  {/* Direct Inter-tank transfer button (Rule Baru: Holding Tank ➔ Storage Tank) */}
                  <button
                    type="button"
                    onClick={() => {
                      setInitialTransferSourceId(tank.id);
                      setIsTransferModalOpen(true);
                    }}
                    className={`w-full py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center justify-center space-x-1.5 active:scale-95 shadow-xs ${
                      tank.type === 'HOLDING_TANK'
                        ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border-indigo-300'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                    }`}
                    title={
                      tank.type === 'HOLDING_TANK'
                        ? 'Rule Baru: Transfer massa WIP dari Holding Tank ke Storage Tank'
                        : 'Transfer massa WIP dari Storage Tank ke Holding Tank'
                    }
                  >
                    <ArrowRightLeft className="w-3 h-3 text-current" />
                    <span>
                      {tank.type === 'HOLDING_TANK'
                        ? '➔ Transfer ke Storage Tank (Rule Baru)'
                        : '➔ Transfer ke Holding Tank'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Telemetri Tangki:</span>
                  <span className="text-emerald-400 font-semibold font-mono">
                    ● Terhubung Lini ({((tank.currentLevelKg / (tank.capacityKg || 1)) * 100).toFixed(0)}%)
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredTanks.length === 0 && (
        <div className="text-center py-12 bg-slate-900 border border-slate-800 rounded-2xl">
          <Cylinder className="w-12 h-12 text-slate-600 mx-auto mb-2" />
          <h4 className="font-bold text-white text-sm">Tidak ada tangki yang sesuai filter</h4>
          <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau kategori filter.</p>
        </div>
      )}

      {/* SECTION: Audit Trail Log Pengurangan & Transfer Tangki */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-purple-400" />
            <h3 className="font-bold text-sm text-white">
              Riwayat Otomatis Pemotongan & Pengisian Tangki
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {state.transactions.tankLogs?.length || 0} Aktivitas Tercatat
          </span>
        </div>

        {/* Table of logs */}
        <div className="overflow-x-auto no-scrollbar">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                <th className="py-2.5 px-3">Waktu</th>
                <th className="py-2.5 px-3">Tipe Aktivitas</th>
                <th className="py-2.5 px-3">Tangki Terdampak</th>
                <th className="py-2.5 px-3">WIP Terkait</th>
                <th className="py-2.5 px-3 text-right">Perubahan (kg)</th>
                <th className="py-2.5 px-3 text-right">Sisa Level (kg)</th>
                <th className="py-2.5 px-3">Keterangan / Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {state.transactions.tankLogs && state.transactions.tankLogs.length > 0 ? (
                state.transactions.tankLogs
                  .slice()
                  .reverse()
                  .slice(0, 15)
                  .map((log) => {
                    const isDepletion = log.amountKg < 0;
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isDepletion
                                ? 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}
                          >
                            {log.type === 'CARTON_DEPLETION'
                              ? 'Otomatis Output Karton'
                              : log.type === 'WIP_BATCH_INFLOW'
                              ? 'Inflow Batch WIP'
                              : 'Koreksi / Top-Up'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-medium text-white whitespace-nowrap">
                          <span className="font-mono text-cyan-400 font-bold mr-1">{log.tankCode}</span>
                          <span className="text-slate-300 text-[11px]">{log.tankName}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-300">{log.wipName || '-'}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold whitespace-nowrap">
                          <span className={isDepletion ? 'text-rose-400' : 'text-emerald-400'}>
                            {isDepletion ? '' : '+'}
                            {log.amountKg.toFixed(2)} kg
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-white font-medium whitespace-nowrap">
                          {log.newLevelKg.toFixed(1)} kg
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px] truncate max-w-xs">
                          {log.notes || (log.operatorName ? `Operator: ${log.operatorName}` : '-')}
                        </td>
                      </tr>
                    );
                  })
              ) : (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-500 text-xs">
                    Belum ada riwayat aktivitas pemotongan atau transfer tangki.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Refill / Transfer Batch WIP to Tank (Admin Only) */}
      {isAdmin && activeRefillTank && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <ArrowUpCircle className="w-5 h-5 text-cyan-400" />
                <span>Transfer / Pengisian Batch WIP ke Tangki</span>
              </h3>
              <button
                onClick={() => setActiveRefillTank(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Tutup
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
              <p className="text-slate-400">
                Tangki Tujuan: <strong className="text-white">{activeRefillTank.code} - {activeRefillTank.name}</strong>
              </p>
              <p className="text-slate-400">
                Kapasitas Maks: <strong className="text-white">{activeRefillTank.capacityKg} kg</strong> • Level Saat Ini:{' '}
                <strong className="text-cyan-400">{activeRefillTank.currentLevelKg.toFixed(1)} kg</strong>
              </p>
              <p className="text-slate-400">
                Ruang Tersisa:{' '}
                <strong className="text-emerald-400 font-mono">
                  {(activeRefillTank.capacityKg - activeRefillTank.currentLevelKg).toFixed(1)} kg
                </strong>
              </p>
            </div>

            <form onSubmit={handleRefillSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Jumlah Bobot Batch Ditransfer (kg):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max={activeRefillTank.capacityKg - activeRefillTank.currentLevelKg}
                  value={refillAmount}
                  onChange={(e) => setRefillAmount(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Catatan / No. Batch / Operator:</label>
                <input
                  type="text"
                  value={refillNotes}
                  onChange={(e) => setRefillNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveRefillTank(null)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition shadow-lg shadow-cyan-600/30"
                >
                  Konfirmasi Transfer Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Kalibrasi Level Tangki (Admin Only) */}
      {isAdmin && activeCalibrateTank && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-amber-400" />
                <span>Kalibrasi & Koreksi Fisik Level Tangki</span>
              </h3>
              <button
                onClick={() => setActiveCalibrateTank(null)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded bg-slate-800"
              >
                Tutup
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Gunakan fitur ini setelah administrator melakukan pengukuran fisik (dipstick / level transmitter) pada tangki{' '}
              <strong className="text-white">{activeCalibrateTank.code}</strong>.
            </p>

            <form onSubmit={handleCalibrateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Level Aktual Terukur (kg, maks {activeCalibrateTank.capacityKg} kg):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={activeCalibrateTank.capacityKg}
                  value={calibratedLevel}
                  onChange={(e) => setCalibratedLevel(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveCalibrateTank(null)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition shadow-lg shadow-amber-600/30"
                >
                  Simpan Kalibrasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inter-Tank Transfer Modal (Holding Tank ➔ Storage Tank / Storage ➔ Holding) */}
      {isTransferModalOpen && (
        <InterTankTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => {
            setIsTransferModalOpen(false);
            setInitialTransferSourceId(undefined);
          }}
          tanks={state.master.tanks}
          wips={state.master.wips}
          initialSourceTankId={initialTransferSourceId}
          onExecuteTransfer={(srcId, dstId, amt, nts, op) => {
            if (onTransferTanks) {
              return onTransferTanks(srcId, dstId, amt, nts, op);
            }
            return { success: false, message: 'Fungsi transfer antar-tangki belum tersedia' };
          }}
          showToast={showToast}
        />
      )}

      {/* Holding Tank Selection Modal when starting SKU with multi-Holding-Tank WIP */}
      <HoldingTankSelectionModal
        isOpen={Boolean(pendingHoldingTankSkuId)}
        onClose={() => setPendingHoldingTankSkuId(null)}
        state={state}
        pendingSkuIds={pendingHoldingTankSkuId ? [pendingHoldingTankSkuId] : []}
        initialSelectionsBySku={selectedHoldingTanksBySku}
        onConfirmStart={(selectionsBySku) => {
          if (pendingHoldingTankSkuId && onStartSkuProduction) {
            const htMap = selectionsBySku[pendingHoldingTankSkuId];
            setSelectedHoldingTanksBySku(prev => ({
              ...prev,
              [pendingHoldingTankSkuId]: htMap || {}
            }));
            onStartSkuProduction(pendingHoldingTankSkuId, operatorName, 1, htMap);
          }
          setPendingHoldingTankSkuId(null);
        }}
      />

      {/* Six Big Losses Stop Reason Modal */}
      {isStopModalOpen && activeSku && (
        <SixBigLossesModal
          isOpen={isStopModalOpen}
          onClose={() => setIsStopModalOpen(false)}
          skuId={activeSku.id}
          skuName={activeSku.name}
          skuCode={activeSku.code}
          startedAt={
            (state.activeSkuRuns || []).find(r => r.skuId === activeSku.id)?.startedAt ||
            state.activeSkuRun?.startedAt
          }
          cartonsProducedDuringRun={
            (state.activeSkuRuns || []).find(r => r.skuId === activeSku.id)?.cartonsProducedTotal ||
            state.activeSkuRun?.cartonsProducedTotal || 0
          }
          onConfirmStop={(stopData) => {
            if (onStopSkuProduction) {
              onStopSkuProduction(stopData);
            }
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};
