import React, { useState, useMemo } from 'react';
import {
  Cylinder,
  Activity,
  Layers,
  ArrowUpCircle,
  ArrowRightLeft,
  RotateCw,
  AlertTriangle,
  Search,
  Sliders,
  Printer,
  Thermometer,
  ShieldAlert,
  History,
  Eye,
  Lock,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import {
  AppState,
  WipTank,
  WipTankType
} from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import { InterTankTransferModal } from '../InterTankTransferModal';

interface TankMonitoringViewProps {
  state: AppState;
  onUpdateTankItem: (tankId: string, updates: Partial<WipTank>) => void;
  onTopUpTank: (tankId: string, amountKg: number, notes?: string) => void;
  onTransferTanks?: (
    sourceTankId: string,
    destTankId: string,
    amountKg: number,
    notes?: string,
    operatorName?: string
  ) => { success: boolean; message: string };
  showToast: (msg: string, isError?: boolean) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
}

export const TankMonitoringView: React.FC<TankMonitoringViewProps> = ({
  state,
  onUpdateTankItem,
  onTopUpTank,
  onTransferTanks,
  showToast,
  onSwitchTab
}) => {
  // Filter state
  const [tankTypeFilter, setTankTypeFilter] = useState<'ALL' | WipTankType | 'LOW_STOCK'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / popover for Refill or Calibration
  const [activeRefillTank, setActiveRefillTank] = useState<WipTank | null>(null);
  const [refillAmount, setRefillAmount] = useState<string>('100');
  const [refillNotes, setRefillNotes] = useState<string>('Transfer batch dari mixer');

  const [activeCalibrateTank, setActiveCalibrateTank] = useState<WipTank | null>(null);
  const [calibratedLevel, setCalibratedLevel] = useState<string>('');

  // Inter-tank transfer modal state (Holding Tank ➔ Storage Tank / Storage ➔ Holding)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [initialTransferSourceId, setInitialTransferSourceId] = useState<string | undefined>(undefined);

  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const isAdmin = state.currentUserRole === 'ADMINISTRATOR' || state.isAdmin;
  const currentShift = getCurrentShift();

  // Read-only view of currently running SKUs in Stage 07 (Manufacturing)
  const activeRuns = useMemo(() => {
    const runs = state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : []);
    return runs.filter(r => r.isRunning);
  }, [state.activeSkuRuns, state.activeSkuRun]);

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
    <div className="max-w-[1440px] mx-auto space-y-5 pb-12">
      {/* Title & Executive Bar */}
      <div className="bg-[#0c121d] border border-slate-800 p-4 sm:p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-cyan-400 text-[11px] font-mono font-semibold uppercase tracking-wider mb-1">
            <span>Process Tank Telemetry</span>
            <span className="text-slate-600">·</span>
            <span className="text-amber-400">Shift {currentShift.shift} ({currentShift.timeRange})</span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2.5 tracking-tight">
            <Cylinder className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>Monitoring Tangki WIP (Holding &amp; Storage Tank)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
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
              className="flex items-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95"
              title="Transfer Antar-Tangki (Holding Tank ➔ Storage Tank atau sebaliknya)"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Transfer Antar-Tangki</span>
            </button>
          )}

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0"
            title="Cetak Ringkasan Tangki"
          >
            <Printer className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Cetak Laporan</span>
          </button>

          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('dashboard')}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 active:scale-95"
            >
              <span>Lanjut Tahap 07: Manufacturing</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {isAdmin && onSwitchTab && (
            <button
              onClick={() => onSwitchTab('master')}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-semibold transition whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Kelola Master</span>
            </button>
          )}
        </div>
      </div>

      {/* Odoo MES Management Read-Only Banner */}
      {isManagement && (
        <div className="bg-indigo-950/40 border border-indigo-500/40 p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Portal Monitoring: Mode Management (Pantau Saja)</span>
              </p>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Memantau telemetri seluruh {state.master.tanks.length} tangki WIP (Holding Tank &amp; Storage Tank) secara visual dan real-time. Tidak dapat melakukan transfer atau pengisian tangki.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center px-2.5 py-1 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/40 font-mono whitespace-nowrap">
            READ-ONLY
          </span>
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1 */}
        <div className="bg-[#0c121d] border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider mb-1.5">
            <span>Total Tangki WIP</span>
            <Cylinder className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-extrabold text-white font-mono tabular-nums">{stats.totalTanks}</span>
            <span className="text-[11px] text-slate-400 font-medium">Unit</span>
          </div>
          <div className="flex items-center gap-2 mt-2 text-[10px] font-mono">
            <span className="text-amber-400 font-semibold">
              {stats.holdingCount} Holding
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-indigo-300 font-semibold">
              {stats.storageCount} Storage
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-[#0c121d] border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider mb-1.5">
            <span>Massa WIP Tersedia</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono tabular-nums">
              {stats.totalCurrentLevel.toLocaleString('id-ID', { maximumFractionDigits: 1 })}
            </span>
            <span className="text-[11px] text-slate-400 font-mono tabular-nums">/ {stats.totalCapacity.toLocaleString('id-ID')} kg</span>
          </div>
          <div className="mt-2.5 w-full bg-[#06090f] border border-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats.avgUtilization)}%` }}
            />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#0c121d] border border-slate-800 p-3.5 sm:p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider mb-1.5">
            <span>Utilisasi Kapasitas</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-extrabold text-amber-400 font-mono tabular-nums">
              {stats.avgUtilization.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Terisi</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">
            Kapasitas operasional tangki terpantau
          </p>
        </div>

        {/* Metric 4 */}
        <div className={`bg-[#0c121d] border p-3.5 sm:p-4 rounded-xl ${stats.lowStockCount > 0 ? 'border-rose-500/50' : 'border-slate-800'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono uppercase tracking-wider mb-1.5">
            <span>Tangki Menipis</span>
            <ShieldAlert className={`w-4 h-4 ${stats.lowStockCount > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums ${stats.lowStockCount > 0 ? 'text-rose-400' : 'text-white'}`}>
              {stats.lowStockCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">Tangki &lt; 20%</span>
          </div>
          <p className="text-[10px] mt-2">
            {stats.lowStockCount > 0 ? (
              <span className="text-rose-400 font-semibold">Perlu segera batch transfer / isi</span>
            ) : (
              <span className="text-emerald-400 font-medium">Semua tangki dalam batas aman</span>
            )}
          </p>
        </div>
      </div>

      {/* Read-Only Line Readiness & Workflow Bridge to Stage 05 / Stage 07 */}
      <div className="bg-[#0c121d] border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white">Kesiapan Suplai ke Lini Manufacturing (Tahap 07):</span>
            {activeRuns.length > 0 ? (
              <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                {activeRuns.length} Lini Aktif Berjalan
              </span>
            ) : (
              <span className="font-mono text-slate-400">
                Belum ada SKU aktif berjalan di Lini Manufacturing
              </span>
            )}
          </div>
          {activeRuns.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300 tabular-nums">
              {activeRuns.map((run, i) => (
                <span key={run.id || run.skuId} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-600" aria-hidden="true">·</span>}
                  <span className="text-cyan-400 font-semibold">{run.lineName || 'Line'}</span>
                  <span>{run.skuName}</span>
                  <span className="text-emerald-400">({run.cartonsProducedTotal} ktn)</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-400">
              Pastikan massa WIP di Storage &amp; Holding Tank mencukupi, lalu jalankan SKU dan catat output karton di Tahap 07 (Manufacturing).
            </p>
          )}
        </div>

        {onSwitchTab && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSwitchTab('pemakaian')}
              className="px-3 py-2 bg-[#06090f] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Tahap 05: Work Order WIP</span>
            </button>
            <button
              type="button"
              onClick={() => onSwitchTab('dashboard')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition active:scale-95"
            >
              <span>Lanjut Tahap 07: Manufacturing</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Tank Controls: Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0c121d] p-3 rounded-xl border border-slate-800">
        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setTankTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
              tankTypeFilter === 'ALL'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-300 bg-[#080c14] hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Semua Tangki ({state.master.tanks.length})
          </button>
          <button
            onClick={() => setTankTypeFilter('STORAGE_TANK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
              tankTypeFilter === 'STORAGE_TANK'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-300 bg-[#080c14] hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Storage Tank ({stats.storageCount})
          </button>
          <button
            onClick={() => setTankTypeFilter('HOLDING_TANK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
              tankTypeFilter === 'HOLDING_TANK'
                ? 'bg-amber-600 text-white'
                : 'text-slate-300 bg-[#080c14] hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Holding Tank ({stats.holdingCount})
          </button>
          <button
            onClick={() => setTankTypeFilter('LOW_STOCK')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 ${
              tankTypeFilter === 'LOW_STOCK'
                ? 'bg-rose-600 text-white'
                : 'text-slate-300 bg-[#080c14] hover:bg-slate-800 border border-slate-800'
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
            className="w-full bg-[#06090f] border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-medium"
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

          // Read-only estimated cartons for currently active running SKU (if linked to this tank's WIP)
          const matchingActiveRun = wip
            ? activeRuns.find(r => state.master.skuWips.some(sw => sw.skuId === r.skuId && sw.wipId === wip.id))
            : undefined;
          const targetSkuForEstimate = matchingActiveRun
            ? state.master.skus.find(s => s.id === matchingActiveRun.skuId)
            : undefined;
          const linkedSkuWip = targetSkuForEstimate && wip
            ? state.master.skuWips.find(sw => sw.skuId === targetSkuForEstimate.id && sw.wipId === wip.id)
            : null;
          const kgPerCarton = linkedSkuWip?.kgWipPerCartonSku || 0;
          const estimatedCartons = kgPerCarton > 0 ? Math.floor(tank.currentLevelKg / kgPerCarton) : null;

          return (
            <div
              key={tank.id}
              className={`bg-[#0c121d] border rounded-xl p-4 sm:p-5 transition hover:border-cyan-500/40 flex flex-col justify-between ${
                isLow ? 'border-rose-500/60' : 'border-slate-800'
              }`}
            >
              {/* Header card */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-cyan-300 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-500/30">
                        {tank.code}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold uppercase tracking-wider ${
                          tank.type === 'STORAGE_TANK'
                            ? 'text-indigo-300'
                            : 'text-amber-400'
                        }`}
                      >
                        {tank.type === 'STORAGE_TANK' ? 'Storage Tank' : 'Holding Tank'}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white mt-1.5">{tank.name}</h4>
                  </div>

                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      tank.status === 'ACTIVE'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {tank.status}
                  </span>
                </div>

                {/* Assigned WIP & Multi-Machine Info */}
                <div className="bg-[#06090f] rounded-lg p-2.5 border border-slate-800 my-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-[11px] font-medium">1 Formula WIP:</span>
                    <span className="text-slate-100 font-bold truncate max-w-[170px] text-right">
                      {wip ? wip.name : <em className="text-slate-500 font-normal">Kosong / Belum Diisi</em>}
                    </span>
                  </div>

                  <div className="pt-1 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-400 text-[11px] font-medium">Mesin Pengisi:</span>
                      <span className="text-[10px] text-cyan-400 font-mono font-bold">
                        {machines.length} Mesin Sumber
                      </span>
                    </div>

                    {machines.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {machines.map(m => (
                          <span
                            key={m.id}
                            className="px-1.5 py-0.5 bg-[#0c121d] border border-slate-700 text-slate-200 rounded text-[10px] font-mono flex items-center gap-1"
                            title={`${m.code} - ${m.name} (${m.line})`}
                          >
                            <span className="font-bold text-cyan-400">{m.code}</span>
                            <span className="text-slate-300 truncate max-w-[90px]">{m.name}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-[10px] italic">
                        Belum dihubungkan ke mesin pengisi
                      </span>
                    )}
                  </div>
                </div>

                {/* VISUAL TANK CYLINDER GAUGE */}
                <div className="flex items-center space-x-4 my-4">
                  {/* Visual SVG Tank Vessel */}
                  <div className="relative w-16 h-28 bg-[#06090f] rounded-xl border-2 border-slate-700 overflow-hidden flex flex-col justify-end p-1 shadow-inner shrink-0">
                    {/* Measurement graduation markings */}
                    <div className="absolute inset-y-2 left-1.5 flex flex-col justify-between text-[8px] font-mono text-slate-400 select-none pointer-events-none z-10">
                      <span>-100%</span>
                      <span>-75%</span>
                      <span>-50%</span>
                      <span>-25%</span>
                      <span>-0%</span>
                    </div>

                    {/* Liquid Level */}
                    <div
                      className={`w-full rounded-b-lg transition-all duration-700 relative overflow-hidden ${
                        percent < 20
                          ? 'bg-rose-500'
                          : percent < 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ height: `${Math.max(4, Math.min(100, percent))}%` }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-white/30" />
                    </div>
                  </div>

                  {/* Level numbers & stats */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400 font-medium">Level Saat Ini:</span>
                      <span className="font-mono text-base font-extrabold text-white tabular-nums">
                        {tank.currentLevelKg.toFixed(1)} <span className="text-xs font-normal text-slate-400">kg</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Kapasitas Maks:</span>
                      <span className="font-mono text-slate-300 font-semibold tabular-nums">
                        {tank.capacityKg.toFixed(0)} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 font-medium">Persentase:</span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          percent < 20 ? 'text-rose-400' : percent < 50 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {percent.toFixed(1)}%
                      </span>
                    </div>

                    {/* Low stock warning */}
                    {isLow && (
                      <div className="flex items-center gap-1.5 text-rose-400 text-[11px] font-bold bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Level Kritis (&lt; 20%)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sensors: Temperature & Agitator Status */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center justify-between bg-[#06090f] p-2 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                      <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                      <span>Suhu:</span>
                    </div>
                    <span className="font-mono text-white font-bold text-[11px] tabular-nums">
                      {tank.temp !== undefined ? `${tank.temp.toFixed(1)}°C` : 'N/A'}
                    </span>
                  </div>

                  <button
                    onClick={() => handleToggleAgitator(tank)}
                    className={`flex items-center justify-between p-2 rounded-lg border transition ${
                      tank.agitatorStatus === 'ON'
                        ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300 font-bold'
                        : 'bg-[#06090f] border-slate-800 text-slate-400 font-medium'
                    }`}
                    title="Klik untuk mengubah status agitator (ON/OFF)"
                  >
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <RotateCw
                        className={`w-3.5 h-3.5 ${tank.agitatorStatus === 'ON' ? 'animate-spin text-cyan-400' : ''}`}
                      />
                      <span>Agitator:</span>
                    </div>
                    <span className="font-mono font-bold text-[10px]">
                      {tank.agitatorStatus || 'OFF'}
                    </span>
                  </button>
                </div>

                {/* Carton Production Capability for running SKU */}
                {estimatedCartons !== null && targetSkuForEstimate && (
                  <div className="mt-3 p-2.5 rounded-lg bg-[#06090f] border border-cyan-500/20 text-xs flex items-center justify-between">
                    <span className="text-slate-300 text-[11px] font-medium truncate mr-2">
                      Estimasi Lini [{targetSkuForEstimate.code || targetSkuForEstimate.name}]:
                    </span>
                    <span className="font-mono text-cyan-400 font-extrabold tabular-nums shrink-0">
                      {estimatedCartons} Karton
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons footer */}
              {!isManagement ? (
                <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-800">
                  {isAdmin ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setActiveRefillTank(tank);
                          setRefillAmount(wip ? wip.batchWeightKg.toString() : '100');
                        }}
                        className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5 text-cyan-400" />
                        <span>+ Isi Batch WIP</span>
                      </button>

                      <button
                        onClick={() => {
                          setActiveCalibrateTank(tank);
                          setCalibratedLevel(tank.currentLevelKg.toString());
                        }}
                        className="px-2.5 py-1.5 bg-[#080c14] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
                      >
                        <Sliders className="w-3.5 h-3.5 text-slate-400" />
                        <span>Kalibrasi Level</span>
                      </button>
                    </div>
                  ) : (
                    <div className="px-2.5 py-1.5 rounded-lg bg-[#080c14] border border-slate-800 text-slate-400 text-[10px] font-medium flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                      <span>Isi Batch WIP &amp; Kalibrasi Isi Tangki hanya tersedia di Mode Administrator</span>
                    </div>
                  )}

                  {/* Direct Inter-tank transfer button (Rule Baru: Holding Tank ➔ Storage Tank) */}
                  <button
                    type="button"
                    onClick={() => {
                      setInitialTransferSourceId(tank.id);
                      setIsTransferModalOpen(true);
                    }}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-bold border transition flex items-center justify-center gap-1.5 active:scale-95 ${
                      tank.type === 'HOLDING_TANK'
                        ? 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/30'
                        : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
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
                        ? '➔ Transfer ke Storage Tank'
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
        <div className="text-center py-12 bg-[#0c121d] border border-slate-800 rounded-xl">
          <Cylinder className="w-12 h-12 text-slate-600 mx-auto mb-2" />
          <h4 className="font-bold text-white text-sm">Tidak ada tangki yang sesuai filter</h4>
          <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau kategori filter.</p>
        </div>
      )}

      {/* SECTION: Audit Trail Log Pengurangan & Transfer Tangki */}
      <div className="bg-[#0c121d] border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3">
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
    </div>
  );
};
