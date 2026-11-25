import React, { useState, useEffect, useMemo } from 'react';
import {
  Cylinder,
  ArrowUpCircle,
  ArrowRightLeft,
  Sliders,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Droplets,
  Cpu,
  GitBranch,
  History,
  CheckCircle2,
  Trash2,
  Lock,
  Thermometer,
  Wrench,
} from 'lucide-react';
import {
  AppState,
  WipTank,
  WipTankStatus,
} from '../../types';
import { SlideOverDrawer } from '../ui/SlideOverDrawer';

type DrawerTab = 'OPERATIONAL' | 'STATUS_CIP' | 'ROUTING' | 'LOGS';

interface TankControlDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tank: WipTank | null;
  state: AppState;
  isAdmin: boolean;
  isManagement: boolean;
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
}

export const TankControlDrawer: React.FC<TankControlDrawerProps> = ({
  open,
  onOpenChange,
  tank,
  state,
  isAdmin,
  isManagement,
  onUpdateTankItem,
  onTopUpTank,
  onTransferTanks,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('OPERATIONAL');

  // Operational: Refill
  const [refillAmount, setRefillAmount] = useState<string>('');
  const [refillNotes, setRefillNotes] = useState<string>('Pengisian batch WIP dari mesin proses');

  // Operational: Inter-Tank Transfer
  const [destTankId, setDestTankId] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  // Operational: Adjustment / Drain
  const [adjustLevel, setAdjustLevel] = useState<string>('');

  // Status & Sanitasi
  const [selectedWipId, setSelectedWipId] = useState<string>('');
  const [tempInput, setTempInput] = useState<string>('');
  const [minAlertInput, setMinAlertInput] = useState<string>('');

  // Routing BOM
  const [routeMachines, setRouteMachines] = useState<string[]>([]);
  const [routeLines, setRouteLines] = useState<string[]>([]);

  // Synchronize form states when tank changes or drawer opens
  useEffect(() => {
    if (tank && open) {
      const assignedWip = state.master.wips.find(w => w.id === tank.assignedWipId);
      setRefillAmount(assignedWip ? String(assignedWip.batchWeightKg) : '100');
      setAdjustLevel(String(tank.currentLevelKg));
      setSelectedWipId(tank.assignedWipId || '');
      setTempInput(tank.temp !== undefined ? String(tank.temp) : '45.0');
      setMinAlertInput(tank.minAlertKg !== undefined ? String(tank.minAlertKg) : String(Math.round(tank.capacityKg * 0.2)));

      const mIds = (tank.sourceMachineIds && tank.sourceMachineIds.length > 0)
        ? tank.sourceMachineIds
        : (tank.assignedMachineIds && tank.assignedMachineIds.length > 0)
          ? tank.assignedMachineIds
          : tank.assignedMachineId ? [tank.assignedMachineId] : [];
      setRouteMachines(mIds);
      setRouteLines(tank.assignedLineIds || []);

      const otherTanks = state.master.tanks.filter(t => t.id !== tank.id);
      setDestTankId(otherTanks[0]?.id || '');
      setTransferAmount('');
      setTransferNotes('');
    }
  }, [tank, open, state.master.wips, state.master.tanks]);

  // Tank-specific logs
  const tankSpecificLogs = useMemo(() => {
    if (!tank) return [];
    const logs = state.transactions?.tankLogs || [];
    return logs
      .filter(l => l.tankId === tank.id)
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
  }, [tank, state.transactions?.tankLogs]);

  if (!tank) return null;

  const assignedWip = state.master.wips.find(w => w.id === tank.assignedWipId);
  const percent = tank.capacityKg > 0 ? Math.min(100, (tank.currentLevelKg / tank.capacityKg) * 100) : 0;

  // Transfer destination & 1-WIP Rule validation
  const availableDestTanks = state.master.tanks.filter(t => t.id !== tank.id);
  const destTank = availableDestTanks.find(t => t.id === destTankId);
  const destWip = destTank ? state.master.wips.find(w => w.id === destTank.assignedWipId) : undefined;
  const is1WipCompatible = Boolean(
    destTank &&
    (destTank.currentLevelKg <= 0.001 ||
      (!destTank.assignedWipId && destTank.currentLevelKg <= 0) ||
      destTank.assignedWipId === tank.assignedWipId)
  );
  const destFreeSpace = destTank ? Math.max(0, destTank.capacityKg - destTank.currentLevelKg) : 0;
  const maxTransferKg = Math.min(tank.currentLevelKg, destFreeSpace);

  // Handlers
  const handleFillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses ditolak: Pengisian Batch WIP memerlukan mode Administrator.', true);
      return;
    }
    const amt = parseFloat(refillAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Masukkan jumlah pengisian (kg) yang valid.', true);
      return;
    }
    onTopUpTank(tank.id, amt, refillNotes);
    showToast(`Berhasil mengisi +${amt.toFixed(1)} kg ke tangki ${tank.code}`);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isManagement) {
      showToast('Akses dibatasi: Mode Management bersifat Read-Only.', true);
      return;
    }
    if (!onTransferTanks || !destTank) {
      showToast('Pilih tangki tujuan transfer.', true);
      return;
    }
    if (!is1WipCompatible) {
      showToast('Aturan 1-WIP: Tangki tujuan berisi formula WIP berbeda!', true);
      return;
    }
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Masukkan jumlah transfer yang valid.', true);
      return;
    }
    const res = onTransferTanks(
      tank.id,
      destTank.id,
      amt,
      transferNotes || `Transfer SCADA ${tank.code} ➔ ${destTank.code}`,
      state.currentSession?.name || 'Operator SCADA'
    );
    showToast(res.message, !res.success);
    if (res.success) {
      setTransferAmount('');
    }
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses ditolak: Penyesuaian stok/kalibrasi memerlukan mode Administrator.', true);
      return;
    }
    const newLvl = parseFloat(adjustLevel);
    if (isNaN(newLvl) || newLvl < 0 || newLvl > tank.capacityKg) {
      showToast(`Level harus berada antara 0 dan ${tank.capacityKg} kg.`, true);
      return;
    }
    onUpdateTankItem(tank.id, {
      currentLevelKg: newLvl,
      status: newLvl <= 0.05 ? 'EMPTY' : tank.status === 'EMPTY' ? 'ACTIVE' : tank.status,
    });
    showToast(`Level tangki ${tank.code} disesuaikan menjadi ${newLvl.toFixed(1)} kg`);
  };

  const handleDrainTank = () => {
    if (!isAdmin) {
      showToast('Akses ditolak: Pengurasan tangki memerlukan mode Administrator.', true);
      return;
    }
    onUpdateTankItem(tank.id, { currentLevelKg: 0, status: 'EMPTY' });
    setAdjustLevel('0');
    showToast(`Tangki ${tank.code} dikuras habis (0 kg · EMPTY)`);
  };

  const handleStatusChange = (newStatus: WipTankStatus) => {
    if (isManagement) {
      showToast('Akses dibatasi: Mode Management bersifat Read-Only.', true);
      return;
    }
    onUpdateTankItem(tank.id, { status: newStatus });
    showToast(`Status tangki ${tank.code} diubah menjadi ${newStatus}`);
  };

  const handleSaveWipAndParams = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses ditolak: Perubahan parameter master tangki memerlukan Administrator.', true);
      return;
    }
    onUpdateTankItem(tank.id, {
      assignedWipId: selectedWipId || undefined,
      temp: parseFloat(tempInput) || 45.0,
      minAlertKg: parseFloat(minAlertInput) || tank.capacityKg * 0.2,
    });
    showToast(`Parameter & alokasi WIP tangki ${tank.code} diperbarui`);
  };

  const handleResetWipAllocation = () => {
    if (!isAdmin) {
      showToast('Akses ditolak: Reset WIP memerlukan mode Administrator.', true);
      return;
    }
    if (tank.currentLevelKg > 0.1) {
      showToast('Kosongkan/kuras isi tangki terlebih dahulu sebelum melepas formula WIP.', true);
      return;
    }
    setSelectedWipId('');
    onUpdateTankItem(tank.id, { assignedWipId: undefined, status: 'EMPTY' });
    showToast(`Alokasi WIP pada ${tank.code} telah direset`);
  };

  const handleSaveRouting = () => {
    if (!isAdmin) {
      showToast('Akses ditolak: Perubahan routing pipa BOM memerlukan mode Administrator.', true);
      return;
    }
    onUpdateTankItem(tank.id, {
      sourceMachineIds: routeMachines,
      assignedMachineIds: routeMachines,
      assignedMachineId: routeMachines[0] || undefined,
      assignedLineIds: routeLines,
    });
    showToast(`Routing BOM tangki ${tank.code} disimpan (${routeMachines.length} mesin, ${routeLines.length} lini)`);
  };

  return (
    <SlideOverDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      modal={false}
      icon={<Cylinder className="w-5 h-5" />}
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-brand bg-tint-cyan px-2 py-0.5 rounded border border-cyan-500/30 text-xs">
            {tank.code}
          </span>
          <span>{tank.name}</span>
        </div>
      }
      description={`${tank.type === 'STORAGE_TANK' ? 'Storage Tank' : 'Holding Tank'} · Kapasitas ${tank.capacityKg.toLocaleString('id-ID')} kg · ${assignedWip ? assignedWip.name : 'Belum ada WIP'}`}
      bodyClassName="space-y-4"
      footer={
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-full py-2.5 px-4 bg-elevated hover:bg-accent text-ink-primary border border-border-strong font-semibold rounded-xl text-xs transition"
        >
          Tutup Panel Kontrol
        </button>
      }
    >
      {/* Live Mini Status Banner */}
      <div className="bg-canvas border border-border-subtle rounded-xl p-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase text-ink-secondary">Isi Aktual</div>
          <div className="font-mono text-base font-extrabold text-ink-primary tabular-nums">
            {tank.currentLevelKg.toFixed(1)} <span className="text-xs font-normal text-ink-secondary">/ {tank.capacityKg} kg ({percent.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold border ${
              tank.status === 'ACTIVE'
                ? 'bg-tint-emerald text-ink-emerald border-emerald-500/30'
                : tank.status === 'CIP' || tank.status === 'CLEANING'
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : tank.status === 'MAINTENANCE'
                ? 'bg-amber-500/15 text-ink-amber border-amber-500/30'
                : 'bg-elevated text-ink-secondary border-border-strong'
            }`}
          >
            {tank.status}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="grid grid-cols-4 gap-1 bg-canvas p-1 rounded-xl border border-border-subtle">
        <button
          type="button"
          onClick={() => setActiveTab('OPERATIONAL')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            activeTab === 'OPERATIONAL'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Operasional</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('STATUS_CIP')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            activeTab === 'STATUS_CIP'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}
        >
          <Droplets className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Status &amp; CIP</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ROUTING')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            activeTab === 'ROUTING'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}
        >
          <GitBranch className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Routing BOM</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('LOGS')}
          className={`py-2 px-2 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 ${
            activeTab === 'LOGS'
              ? 'bg-cyan-600 text-white shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
          }`}
        >
          <History className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Log Tangki</span>
        </button>
      </div>

      {/* TAB 1: OPERATIONAL */}
      {activeTab === 'OPERATIONAL' && (
        <div className="space-y-4">
          {isManagement && (
            <div className="p-3 bg-tint-indigo border border-indigo-500/30 rounded-xl text-xs text-ink-indigo flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Mode Management bersifat Read-Only. Kontrol operasional dinonaktifkan.</span>
            </div>
          )}

          {/* Agitator Quick Toggle */}
          <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <RotateCw className={`w-4 h-4 ${tank.agitatorStatus === 'ON' ? 'animate-spin text-brand' : 'text-ink-muted'}`} />
              <div>
                <div className="text-xs font-bold text-ink-primary">Motor Agitator (Pengaduk)</div>
                <div className="text-[11px] text-ink-secondary">Status saat ini: {tank.agitatorStatus || 'OFF'}</div>
              </div>
            </div>
            <button
              type="button"
              disabled={isManagement}
              onClick={() => {
                const next = tank.agitatorStatus === 'ON' ? 'OFF' : 'ON';
                onUpdateTankItem(tank.id, { agitatorStatus: next });
                showToast(`Agitator ${tank.code} diubah ke ${next}`);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                tank.agitatorStatus === 'ON'
                  ? 'bg-tint-cyan border-cyan-500/40 text-brand'
                  : 'bg-elevated border-border-strong text-ink-secondary'
              } disabled:opacity-50`}
            >
              {tank.agitatorStatus === 'ON' ? 'Matikan (OFF)' : 'Nyalakan (ON)'}
            </button>
          </div>

          {/* 1. Receive / Fill WIP */}
          <form onSubmit={handleFillSubmit} className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                <ArrowUpCircle className="w-4 h-4 text-brand" />
                <span>Pengisian WIP (Receive / Fill)</span>
              </h5>
              {assignedWip && (
                <button
                  type="button"
                  onClick={() => setRefillAmount(String(assignedWip.batchWeightKg))}
                  className="text-[10px] font-mono text-brand hover:underline"
                >
                  Preset 1 Batch ({assignedWip.batchWeightKg} kg)
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-ink-secondary mb-1">Jumlah Pengisian (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={refillAmount}
                  onChange={e => setRefillAmount(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-secondary mb-1">Catatan</label>
                <input
                  type="text"
                  value={refillNotes}
                  onChange={e => setRefillNotes(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={!isAdmin}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-40"
            >
              + Tambah Massa WIP ke Tangki
            </button>
          </form>

          {/* 2. Inter-Tank Transfer (1-WIP Rule) */}
          <form onSubmit={handleTransferSubmit} className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-ink-indigo" />
                <span>Transfer Antar Tangki (1-WIP Rule)</span>
              </h5>
              <span className="text-[10px] font-mono text-ink-secondary">
                Maks: {maxTransferKg.toFixed(1)} kg
              </span>
            </div>

            <div>
              <label className="block text-[11px] text-ink-secondary mb-1">Tangki Tujuan</label>
              <select
                value={destTankId}
                onChange={e => setDestTankId(e.target.value)}
                disabled={isManagement}
                className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
              >
                {availableDestTanks.map(t => {
                  const tWip = state.master.wips.find(w => w.id === t.assignedWipId);
                  return (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.name} ({t.currentLevelKg.toFixed(0)}/{t.capacityKg} kg · {tWip ? tWip.name : 'Kosong'})
                    </option>
                  );
                })}
              </select>
            </div>

            {destTank && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${
                  is1WipCompatible
                    ? 'bg-tint-emerald border-emerald-500/30 text-ink-emerald'
                    : 'bg-rose-500/10 border-rose-500/30 text-ink-rose'
                }`}
              >
                {is1WipCompatible ? (
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>
                  {is1WipCompatible
                    ? `Valid (1-WIP Rule): ${destWip ? destWip.name : 'Tangki tujuan kosong, aman menerima WIP ini'}.`
                    : `Dilarang! ${destTank.code} berisi ${destWip?.name}, tidak boleh dicampur dengan ${assignedWip?.name || 'WIP lain'}.`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] text-ink-secondary mb-1">Jumlah Transfer (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max={maxTransferKg > 0 ? maxTransferKg : undefined}
                  value={transferAmount}
                  onChange={e => setTransferAmount(e.target.value)}
                  disabled={isManagement || !is1WipCompatible || maxTransferKg <= 0}
                  placeholder="0.0"
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-secondary mb-1">Keterangan Transfer</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  disabled={isManagement}
                  placeholder="Opsional..."
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isManagement || !is1WipCompatible || maxTransferKg <= 0}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-40"
            >
              Eksekusi Transfer Antar Tangki
            </button>
          </form>

          {/* 3. Stock Adjustment & Drain */}
          <form onSubmit={handleAdjustSubmit} className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3">
            <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
              <Sliders className="w-4 h-4 text-ink-amber" />
              <span>Kalibrasi &amp; Pengurasan Stok</span>
            </h5>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-[11px] text-ink-secondary mb-1">Set Level Aktual (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={tank.capacityKg}
                  value={adjustLevel}
                  onChange={e => setAdjustLevel(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs font-mono text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                disabled={!isAdmin}
                className="px-4 py-2 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-lg text-xs font-bold transition disabled:opacity-40"
              >
                Kalibrasi
              </button>
              <button
                type="button"
                disabled={!isAdmin || tank.currentLevelKg <= 0}
                onClick={handleDrainTank}
                className="px-3 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-ink-rose rounded-lg text-xs font-bold transition disabled:opacity-40"
                title="Kuras tangki hingga 0 kg"
              >
                Kuras (0 kg)
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: STATUS & SANITASI (CIP) */}
      {activeTab === 'STATUS_CIP' && (
        <div className="space-y-4">
          <div className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3">
            <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-brand" />
              <span>Status Operasional Tangki</span>
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(['ACTIVE', 'EMPTY', 'CIP', 'STANDBY', 'MAINTENANCE'] as WipTankStatus[]).map(st => {
                const isActive = tank.status === st || (st === 'CIP' && tank.status === 'CLEANING');
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={isManagement}
                    onClick={() => handleStatusChange(st)}
                    className={`py-2 px-3 rounded-xl border text-xs font-mono font-bold transition ${
                      isActive
                        ? st === 'CIP'
                          ? 'bg-blue-600 text-white border-blue-400'
                          : st === 'ACTIVE'
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : st === 'MAINTENANCE'
                          ? 'bg-amber-600 text-white border-amber-400'
                          : 'bg-cyan-600 text-white border-cyan-400'
                        : 'bg-surface border-border-subtle text-ink-secondary hover:border-border-strong'
                    } disabled:opacity-50`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSaveWipAndParams} className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-ink-primary">Formula WIP Aktif &amp; Parameter Sensor</h5>
              {tank.assignedWipId && isAdmin && (
                <button
                  type="button"
                  onClick={handleResetWipAllocation}
                  className="text-[11px] text-ink-rose hover:underline flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Reset WIP</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-ink-secondary mb-1">Alokasi 1 Formula WIP</label>
              <select
                value={selectedWipId}
                onChange={e => setSelectedWipId(e.target.value)}
                disabled={!isAdmin}
                className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs text-ink-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
              >
                <option value="">-- Kosong / Belum Dialokasikan --</option>
                {state.master.wips.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.batchWeightKg} kg/batch)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-ink-secondary mb-1 flex items-center gap-1">
                  <Thermometer className="w-3 h-3 text-ink-amber" />
                  <span>Suhu Aktual (°C)</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={tempInput}
                  onChange={e => setTempInput(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs font-mono text-ink-primary disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-secondary mb-1">Ambang Alert Rendah (kg)</label>
                <input
                  type="number"
                  step="1"
                  value={minAlertInput}
                  onChange={e => setMinAlertInput(e.target.value)}
                  disabled={!isAdmin}
                  className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-2 text-xs font-mono text-ink-primary disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!isAdmin}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-40"
            >
              Simpan Pengaturan Status &amp; WIP
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: ROUTING BOM */}
      {activeTab === 'ROUTING' && (
        <div className="space-y-4">
          <div className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-brand" />
                <span>Mesin Pengisi Sumber ({routeMachines.length} Terhubung)</span>
              </h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto no-scrollbar">
              {state.master.machines.map(m => {
                const isSel = routeMachines.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() =>
                      setRouteMachines(prev =>
                        isSel ? prev.filter(id => id !== m.id) : [...prev, m.id]
                      )
                    }
                    className={`p-2 rounded-lg border text-left flex items-center justify-between transition ${
                      isSel
                        ? 'bg-tint-cyan border-cyan-500/60 text-ink-primary'
                        : 'bg-surface border-border-subtle text-ink-secondary hover:border-border-strong'
                    } disabled:opacity-60`}
                  >
                    <div className="min-w-0 mr-2">
                      <div className="font-mono text-[11px] font-bold text-brand truncate">{m.code}</div>
                      <div className="text-[11px] truncate">{m.name}</div>
                    </div>
                    {isSel && <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-canvas border border-border-subtle rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                <GitBranch className="w-4 h-4 text-ink-emerald" />
                <span>Lini Produksi Tujuan ({routeLines.length} Terhubung)</span>
              </h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto no-scrollbar">
              {(state.master.productionLines || []).map(l => {
                const isSel = routeLines.includes(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() =>
                      setRouteLines(prev =>
                        isSel ? prev.filter(id => id !== l.id) : [...prev, l.id]
                      )
                    }
                    className={`p-2 rounded-lg border text-left flex items-center justify-between transition ${
                      isSel
                        ? 'bg-tint-emerald border-emerald-500/60 text-ink-primary'
                        : 'bg-surface border-border-subtle text-ink-secondary hover:border-border-strong'
                    } disabled:opacity-60`}
                  >
                    <div className="min-w-0 mr-2">
                      <div className="font-mono text-[11px] font-bold text-ink-emerald truncate">{l.code}</div>
                      <div className="text-[11px] truncate">{l.name}</div>
                    </div>
                    {isSel && <CheckCircle2 className="w-4 h-4 text-ink-emerald shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveRouting}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition shadow-md"
            >
              Simpan Perubahan Routing Pipa BOM
            </button>
          )}
        </div>
      )}

      {/* TAB 4: TANK LOGS */}
      {activeTab === 'LOGS' && (
        <div className="space-y-2.5">
          {tankSpecificLogs.length === 0 ? (
            <div className="text-center py-8 bg-canvas border border-border-subtle rounded-xl text-xs text-ink-secondary">
              Belum ada riwayat keluar-masuk cairan untuk tangki {tank.code}.
            </div>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {tankSpecificLogs.map(log => {
                const isPositive = log.amountKg >= 0;
                return (
                  <div
                    key={log.id}
                    className="bg-canvas border border-border-subtle rounded-xl p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-surface border border-border-subtle text-ink-primary">
                        {log.type}
                      </span>
                      <span
                        className={`font-mono font-extrabold tabular-nums ${
                          isPositive ? 'text-ink-emerald' : 'text-ink-rose'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {log.amountKg.toFixed(2)} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-ink-secondary">
                      <span className="truncate">{log.wipName || log.skuName || log.notes || '-'}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {log.previousLevelKg.toFixed(1)} ➔ {log.newLevelKg.toFixed(1)} kg
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-ink-muted font-mono">
                      <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                      <span>{log.operatorName || 'System'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </SlideOverDrawer>
  );
};
