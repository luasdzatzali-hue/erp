import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cylinder,
  Layers,
  Monitor,
  PauseCircle,
  Play,
  Printer,
  Search,
  ShieldCheck
} from 'lucide-react';
import { WipProductionBatch } from '../../../types';
import { useErp } from '../../../context/ErpContext';
import { formatIndonesianDate, SHIFTS_CONFIG, ShiftNumber } from '../../../utils/shifts';
import { parseWipTimestamp } from '../../WipGanttChart';
import { formatPauseDurationMs } from './utils';

interface WipConsumptionPanelProps {
  section: 'active-pipeline' | 'batch-history';
  currentTime: number;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filterShift: 'all' | '1' | '2' | '3';
  setFilterShift: (val: 'all' | '1' | '2' | '3') => void;
  onOpenPauseModal: (batch: WipProductionBatch) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onCompleteWipBatch: (batchId: string) => void;
  onOpenStationMonitor?: (station: { type: 'line' | 'ck'; id: string }) => void;
}

export const WipConsumptionPanel: React.FC<WipConsumptionPanelProps> = ({
  section,
  currentTime,
  searchTerm,
  setSearchTerm,
  filterShift,
  setFilterShift,
  onOpenPauseModal,
  onResumeWipBatch,
  onCompleteWipBatch,
  onOpenStationMonitor
}) => {
  const { state, handleTransferBetweenTanks, handleTopUpTank, showToast } = useErp();

  const [expandedAuditBatchIds, setExpandedAuditBatchIds] = useState<Record<string, boolean>>({});

  // Tank transfer & consumption states
  const [sourceTankId, setSourceTankId] = useState<string>('');
  const [destTankId, setDestTankId] = useState<string>('');
  const [transferAmountKg, setTransferAmountKg] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');

  const [consumeTankId, setConsumeTankId] = useState<string>('');
  const [consumeDeltaKg, setConsumeDeltaKg] = useState<string>('');
  const [consumeMode, setConsumeMode] = useState<'CONSUME' | 'TOPUP'>('CONSUME');
  const [consumeNotes, setConsumeNotes] = useState<string>('');

  const wipBatchesList = state.transactions.wipBatches || [];
  const allActiveBatches = useMemo(
    () => wipBatchesList.filter(b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'),
    [wipBatchesList]
  );
  const pausedBatchesCount = allActiveBatches.filter(b => b.status === 'DIJEDA').length;
  const runningBatchesCount = allActiveBatches.filter(b => b.status === 'SEDANG_PRODUKSI').length;

  const filteredBatches = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return wipBatchesList.filter(b => {
      const matchShift = filterShift === 'all' || String(b.shift || 1) === filterShift;
      const matchQuery =
        b.batchCode.toLowerCase().includes(query) ||
        b.wipName.toLowerCase().includes(query) ||
        (b.skuName && b.skuName.toLowerCase().includes(query)) ||
        b.operatorName.toLowerCase().includes(query) ||
        b.status.toLowerCase().includes(query);
      return matchShift && matchQuery;
    });
  }, [wipBatchesList, searchTerm, filterShift]);

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(transferAmountKg);
    if (!sourceTankId || !destTankId || sourceTankId === destTankId) {
      showToast('Pilih tangki asal dan tangki tujuan yang berbeda', true);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Masukkan jumlah transfer WIP (kg) lebih dari 0', true);
      return;
    }
    const actor = state.currentAdminUser?.displayName || state.currentSession?.name || 'Operator';
    const res = handleTransferBetweenTanks(
      sourceTankId,
      destTankId,
      qty,
      transferNotes || 'Transfer WIP dari modul Pemakaian',
      actor
    );
    if (res.success) {
      showToast(`Transfer WIP ${qty.toFixed(2)} kg antar-tangki berhasil`);
      setTransferAmountKg('');
      setTransferNotes('');
    } else {
      showToast(res.message, true);
    }
  };

  const handleTankAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(consumeDeltaKg);
    if (!consumeTankId) {
      showToast('Pilih tangki WIP terlebih dahulu', true);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Masukkan berat WIP (kg) lebih dari 0', true);
      return;
    }
    const tankObj = state.master.tanks.find(t => t.id === consumeTankId);
    if (!tankObj) return;
    if (consumeMode === 'CONSUME' && qty > tankObj.currentLevelKg) {
      showToast(
        `Konsumsi (${qty.toFixed(2)} kg) melebihi level tangki ${tankObj.code} (${tankObj.currentLevelKg.toFixed(2)} kg)`,
        true
      );
      return;
    }
    const signedDelta = consumeMode === 'CONSUME' ? -qty : qty;
    handleTopUpTank(
      consumeTankId,
      signedDelta,
      consumeNotes || (consumeMode === 'CONSUME' ? 'Konsumsi WIP dari tangki' : 'Top-Up WIP ke tangki')
    );
    setConsumeDeltaKg('');
    setConsumeNotes('');
  };

  if (section === 'active-pipeline') {
    if (allActiveBatches.length === 0) return null;
    return (
      <div className="bg-surface border border-amber-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-ink-amber shrink-0" />
            <h4 className="font-bold text-xs sm:text-sm text-ink-primary">
              Aliran Batch Aktif di Lantai Produksi ({runningBatchesCount} Berjalan
              {pausedBatchesCount > 0 ? ` · ${pausedBatchesCount} Dijeda` : ''})
            </h4>
          </div>
          <span className="text-[11px] font-mono text-ink-amber">
            Aturan Disiplin · 1 Batch Aktif / Mesin
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {allActiveBatches.map(batch => {
            const bMach = state.master.machines.find(m => m.id === batch.targetMachineId);
            const wipObj = state.master.wips.find(w => w.id === batch.wipId);
            const tId = batch.targetTankId || wipObj?.targetTankId || wipObj?.targetTankIds?.[0];
            const bTank = state.master.tanks.find(t => t.id === tId);
            const isPaused = batch.status === 'DIJEDA';
            const durMins = batch.durationMinutes || wipObj?.productionDurationMinutes || 30;
            const plannedMs = Math.max(1, durMins * 60_000);
            const startMs = parseWipTimestamp(batch.startedAt) || currentTime;
            const estMs = parseWipTimestamp(batch.estimatedCompletionTime) || startMs + plannedMs;

            const remMs = isPaused
              ? typeof batch.remainingMsAtPause === 'number'
                ? batch.remainingMsAtPause
                : plannedMs
              : estMs - currentTime;
            const pct = isPaused
              ? Math.min(100, Math.max(0, ((plannedMs - remMs) / plannedMs) * 100))
              : Math.min(100, Math.max(0, ((currentTime - startMs) / Math.max(1, estMs - startMs)) * 100));
            const remMins = Math.floor(Math.abs(remMs) / 60_000);
            const remSecs = Math.floor((Math.abs(remMs) % 60_000) / 1000);

            return (
              <div
                key={batch.id}
                className={`bg-canvas border p-3 rounded-lg space-y-2 transition ${
                  isPaused ? 'border-sky-500/50' : 'border-border-subtle hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono">
                      <span className={`font-bold ${isPaused ? 'text-ink-sky' : 'text-ink-amber'}`}>
                        {batch.batchCode}
                      </span>
                      {isPaused && <span className="text-[10px] font-bold text-ink-sky">· DIJEDA</span>}
                      {batch.recipeCode && <span className="text-ink-secondary">· {batch.recipeCode}</span>}
                    </div>
                    <p className="font-semibold text-xs text-ink-primary truncate mt-0.5">{batch.wipName}</p>
                    <p className="text-[10px] font-mono text-ink-secondary mt-0.5 truncate">
                      {bMach ? bMach.code : 'Mesin'} ➔ {bTank ? bTank.code : 'Tangki'} ·{' '}
                      {batch.batchWeightKg.toFixed(1)} kg · {batch.operatorName}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {onOpenStationMonitor && batch.targetMachineId && (
                      <button
                        type="button"
                        onClick={() =>
                          batch.targetMachineId &&
                          onOpenStationMonitor({ type: 'ck', id: batch.targetMachineId })
                        }
                        className="px-2 py-1 bg-elevated hover:bg-accent border border-border-strong text-brand font-semibold rounded-lg text-[10px] transition flex items-center gap-1 whitespace-nowrap"
                        title="Buka Monitor Khusus Mesin CK (Kiosk Mode)"
                      >
                        <Monitor className="w-3 h-3" />
                        <span>Kiosk</span>
                      </button>
                    )}
                    {isPaused ? (
                      onResumeWipBatch && (
                        <button
                          type="button"
                          onClick={() => onResumeWipBatch(batch.id)}
                          className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                          title="Lanjutkan penghitungan waktu batch WIP"
                        >
                          <Play className="w-3 h-3" />
                          <span>Lanjut</span>
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenPauseModal(batch)}
                        className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                        title="Pause sementara batch dan catat alasan"
                      >
                        <PauseCircle className="w-3 h-3" />
                        <span>Pause</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onCompleteWipBatch(batch.id)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Selesai</span>
                    </button>
                  </div>
                </div>

                {isPaused && batch.pauseReason && (
                  <div
                    className="px-2 py-1 rounded bg-tint-sky border border-sky-700/60 text-[10px] text-ink-sky truncate"
                    title={batch.pauseReason}
                  >
                    Alasan jeda: <strong>{batch.pauseReason}</strong>
                  </div>
                )}

                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isPaused ? 'bg-sky-400' : remMs <= 0 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                    <span className="text-ink-secondary">
                      Progres {pct.toFixed(0)}%{isPaused ? ' (Berhenti)' : ''}
                    </span>
                    <span
                      className={
                        isPaused
                          ? 'text-ink-sky font-semibold'
                          : remMs <= 0
                          ? 'text-ink-emerald font-bold'
                          : 'text-ink-amber font-semibold'
                      }
                    >
                      {isPaused
                        ? `Dijeda · Sisa ${remMins}m ${String(remSecs).padStart(2, '0')}s`
                        : remMs <= 0
                        ? 'Siap Transfer Tangki'
                        : `Sisa ${remMins}m ${String(remSecs).padStart(2, '0')}s`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Panel Khusus Konsumsi WIP dari Tangki & Transfer Antar-Tangki */}
      {state.master.tanks.length > 0 && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 space-y-4 shadow-xl no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border-subtle">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-brand">
                <Cylinder className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-ink-primary">
                  Panel Konsumsi WIP Tangki (Adonan / Krim) &amp; Transfer Antar-Tangki
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  Pantau volume tangki WIP aktif, catat pemakaian/top-up tangki, dan transfer antar-tangki dengan aturan 1-WIP
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono text-brand tabular-nums">
              {state.master.tanks.length} Tangki Terdaftar
            </span>
          </div>

          {/* Live Tank Status Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {state.master.tanks.map(tank => {
              const fillPct = tank.capacityKg > 0 ? Math.min(100, (tank.currentLevelKg / tank.capacityKg) * 100) : 0;
              const assignedWip = state.master.wips.find(w => w.id === tank.assignedWipId);
              return (
                <div
                  key={tank.id}
                  className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-brand">{tank.code}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-elevated border border-border-strong text-ink-secondary">
                      {tank.type === 'HOLDING_TANK' ? 'HOLDING' : 'STORAGE'}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-ink-primary truncate">{tank.name}</div>
                    <div className="text-[10px] text-ink-secondary truncate">
                      WIP: <strong className="text-ink-amber">{assignedWip?.name || 'Kosong / Siaga'}</strong>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-500 transition-all" style={{ width: `${fillPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] font-mono tabular-nums text-ink-secondary">
                      <span className="font-bold text-ink-primary">{tank.currentLevelKg.toFixed(1)} kg</span>
                      <span>
                        / {tank.capacityKg.toFixed(0)} kg ({fillPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Inter-Tank Transfer + Tank WIP Consumption Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
            {/* Transfer Antar-Tangki */}
            <form
              onSubmit={handleTransferSubmit}
              className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2.5 text-xs"
            >
              <div className="flex items-center gap-1.5 font-bold text-ink-primary text-xs">
                <ArrowRightLeft className="w-3.5 h-3.5 text-brand" />
                <span>Transfer WIP Antar-Tangki</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={sourceTankId}
                  onChange={e => setSourceTankId(e.target.value)}
                  className="bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs text-ink-primary"
                  required
                >
                  <option value="">-- Dari Tangki --</option>
                  {state.master.tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.code} ({t.currentLevelKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
                <select
                  value={destTankId}
                  onChange={e => setDestTankId(e.target.value)}
                  className="bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs text-ink-primary"
                  required
                >
                  <option value="">-- Ke Tangki --</option>
                  {state.master.tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.code} (Sisa {(t.capacityKg - t.currentLevelKg).toFixed(0)} kg)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={transferAmountKg}
                  onChange={e => setTransferAmountKg(e.target.value)}
                  placeholder="Berat (kg)"
                  required
                  className="bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs font-mono text-ink-primary"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="Catatan transfer (opsional)"
                  className="flex-1 bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold whitespace-nowrap transition"
                >
                  Transfer WIP
                </button>
              </div>
            </form>

            {/* Konsumsi / Top-Up WIP Tangki */}
            <form
              onSubmit={handleTankAdjustSubmit}
              className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink-primary text-xs">Catat Konsumsi / Top-Up Tangki WIP</span>
                <div className="flex items-center bg-surface p-0.5 rounded-lg border border-border-subtle text-[10px]">
                  <button
                    type="button"
                    onClick={() => setConsumeMode('CONSUME')}
                    className={`px-2 py-0.5 rounded font-bold transition ${
                      consumeMode === 'CONSUME' ? 'bg-rose-600 text-white' : 'text-ink-secondary'
                    }`}
                  >
                    Konsumsi (-)
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsumeMode('TOPUP')}
                    className={`px-2 py-0.5 rounded font-bold transition ${
                      consumeMode === 'TOPUP' ? 'bg-emerald-600 text-white' : 'text-ink-secondary'
                    }`}
                  >
                    Top-Up (+)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={consumeTankId}
                  onChange={e => setConsumeTankId(e.target.value)}
                  className="bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs text-ink-primary"
                  required
                >
                  <option value="">-- Pilih Tangki WIP --</option>
                  {state.master.tanks.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.code} - {t.name} ({t.currentLevelKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={consumeDeltaKg}
                  onChange={e => setConsumeDeltaKg(e.target.value)}
                  placeholder="Jumlah (kg)"
                  required
                  className="bg-elevated border border-border-strong rounded-lg px-2 py-1.5 text-xs font-mono text-ink-primary"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={consumeNotes}
                  onChange={e => setConsumeNotes(e.target.value)}
                  placeholder="Catatan konsumsi / top-up WIP..."
                  className="flex-1 bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                />
                <button
                  type="submit"
                  className={`px-3 py-1.5 rounded-lg text-white text-xs font-bold whitespace-nowrap transition ${
                    consumeMode === 'CONSUME' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {consumeMode === 'CONSUME' ? 'Catat Konsumsi' : 'Catat Top-Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Daftar Status Perintah Kerja Batch WIP */}
      <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-xl space-y-0">
        <div className="print-only p-4 border-b-2 border-slate-900 mb-2">
          <h1 className="text-lg font-bold">PRODTRACK - LAPORAN STATUS PERINTAH KERJA BATCH WIP</h1>
          <p className="text-xs text-slate-700">
            Dicetak pada: {formatIndonesianDate()} | Filter:{' '}
            {filterShift === 'all' ? 'Semua Shift' : `Shift ${filterShift}`} | Total Batch:{' '}
            {filteredBatches.length}
          </p>
        </div>

        <div className="p-4 border-b border-border-subtle flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 no-print">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-ink-amber">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-ink-primary">Daftar Perintah Kerja Produksi Batch WIP</h3>
              <p className="text-[11px] text-ink-secondary">
                Pelacakan siklus batch 1-per-periode per jenis WIP
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center space-x-1 bg-canvas p-1 rounded-xl border border-border-subtle">
              {(['all', '1', '2', '3'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterShift(tab)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                    filterShift === tab
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari kode PK / nama WIP..."
                className="w-full bg-elevated border border-border-strong rounded-xl pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted"
              />
            </div>

            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-elevated hover:bg-accent border border-border-strong text-ink-primary rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
              title="Cetak Laporan Perintah Kerja Batch"
            >
              <Printer className="w-3.5 h-3.5 text-ink-amber" />
              <span className="hidden sm:inline">Cetak</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                <th className="py-2.5 px-3">No. Perintah Kerja</th>
                <th className="py-2.5 px-3">Shift</th>
                <th className="py-2.5 px-3">Jenis WIP</th>
                <th className="py-2.5 px-3">Mesin Produksi</th>
                <th className="py-2.5 px-3">Target SKU</th>
                <th className="py-2.5 px-3 text-right">Bobot 1 Batch</th>
                <th className="py-2.5 px-3">Waktu Mulai / Selesai</th>
                <th className="py-2.5 px-3">Operator</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {filteredBatches.length > 0 ? (
                filteredBatches.map(batch => {
                  const pauseLogsCount = batch.pauseLogs?.length || 0;
                  const isAuditExpanded = Boolean(expandedAuditBatchIds[batch.id]);
                  const isPaused = batch.status === 'DIJEDA';
                  const frozenRemMs =
                    typeof batch.remainingMsAtPause === 'number'
                      ? batch.remainingMsAtPause
                      : (batch.durationMinutes || 30) * 60_000;
                  const frozenM = Math.floor(Math.abs(frozenRemMs) / 60_000);
                  const frozenS = Math.floor((Math.abs(frozenRemMs) % 60_000) / 1000);

                  return (
                    <React.Fragment key={batch.id}>
                      <tr className="hover:bg-elevated transition">
                        <td className="py-3 px-3 font-mono font-bold text-ink-primary">
                          <span>{batch.batchCode}</span>
                          <span className="block text-[10px] text-ink-muted font-normal">
                            {batch.materials.length} komponen bahan
                          </span>
                          {batch.materials.some(m => m.palletAllocations && m.palletAllocations.length > 0) && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-ink-amber border border-amber-500/30 text-[9px] font-mono">
                              FIFO Pallet
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {(() => {
                            const sNum = (batch.shift || 1) as ShiftNumber;
                            const sInfo = SHIFTS_CONFIG[sNum] || SHIFTS_CONFIG[1];
                            return (
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}
                              >
                                {sInfo.shortLabel}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-medium text-ink-primary block">{batch.wipName}</span>
                          {batch.recipeCode && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-ink-amber border border-amber-500/20 text-[10px] font-mono">
                              {batch.recipeCode} {batch.recipeName ? `(${batch.recipeName})` : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {(() => {
                            const mach = state.master.machines.find(m => m.id === batch.targetMachineId);
                            if (!mach) return <span className="text-ink-muted font-mono text-[11px]">-</span>;
                            return (
                              <div>
                                <span className="font-mono text-brand font-semibold block text-[11px]">
                                  {mach.code}
                                </span>
                                <span className="text-[10px] text-ink-secondary block">{mach.name}</span>
                                <span className="text-[9px] text-ink-muted font-mono">{mach.line}</span>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-3 text-ink-secondary">{batch.skuName || '-'}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-brand">
                          {batch.batchWeightKg.toFixed(4)} kg
                        </td>
                        <td className="py-3 px-3 text-ink-secondary text-[11px] space-y-0.5">
                          <div>Mulai: {batch.startedAt}</div>
                          {batch.durationMinutes && (
                            <div className="text-[10px] text-ink-amber font-mono tabular-nums">
                              Durasi target: {batch.durationMinutes} menit
                            </div>
                          )}
                          {batch.completedAt && (
                            <div className="text-ink-emerald text-[10px] font-semibold">
                              Selesai: {batch.completedAt}
                            </div>
                          )}
                          {batch.status === 'SEDANG_PRODUKSI' &&
                            batch.estimatedCompletionTime &&
                            (() => {
                              const rem = new Date(batch.estimatedCompletionTime).getTime() - currentTime;
                              const isDone = rem <= 0;
                              const m = Math.floor(Math.abs(rem) / 60000);
                              const s = Math.floor((Math.abs(rem) % 60000) / 1000);
                              return (
                                <div
                                  className={`text-[10px] font-mono tabular-nums font-bold ${
                                    isDone ? 'text-ink-emerald animate-pulse' : 'text-ink-amber'
                                  }`}
                                >
                                  {isDone ? 'Selesai (Alarm)' : `Sisa: ${m}m ${String(s).padStart(2, '0')}s`}
                                </div>
                              );
                            })()}
                          {isPaused && (
                            <div className="text-[10px] font-mono tabular-nums font-bold text-ink-sky">
                              Dijeda · Sisa Berhenti: {frozenM}m {String(frozenS).padStart(2, '0')}s
                            </div>
                          )}
                          {typeof batch.totalPausedMs === 'number' && batch.totalPausedMs > 0 && (
                            <div className="text-[10px] font-mono tabular-nums text-ink-sky">
                              Total Jeda: {formatPauseDurationMs(batch.totalPausedMs)}
                            </div>
                          )}
                          {pauseLogsCount > 0 && (
                            <button
                              type="button"
                              aria-expanded={isAuditExpanded}
                              onClick={() =>
                                setExpandedAuditBatchIds(prev => ({ ...prev, [batch.id]: !prev[batch.id] }))
                              }
                              className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-tint-sky hover:bg-tint-sky border border-sky-700 text-ink-sky text-[10px] font-semibold transition"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Audit Jeda ({pauseLogsCount})</span>
                              {isAuditExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-3 text-ink-secondary">{batch.operatorName}</td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${
                              batch.status === 'SEDANG_PRODUKSI'
                                ? 'bg-amber-500/20 text-ink-amber border-amber-500/40 animate-pulse'
                                : isPaused
                                ? 'bg-tint-sky text-ink-sky border-sky-700'
                                : batch.status === 'SELESAI'
                                ? 'bg-emerald-500/20 text-ink-emerald border-emerald-500/30'
                                : 'bg-elevated text-ink-secondary border-border-strong'
                            }`}
                          >
                            {batch.status === 'SEDANG_PRODUKSI'
                              ? 'Sedang Produksi'
                              : isPaused
                              ? 'Dijeda'
                              : batch.status === 'SELESAI'
                              ? 'Selesai'
                              : 'Dibatalkan'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {batch.status === 'SEDANG_PRODUKSI' ? (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onOpenPauseModal(batch)}
                                className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center gap-1 whitespace-nowrap"
                                title="Pause sementara batch dan catat alasan audit trail"
                              >
                                <PauseCircle className="w-3 h-3" />
                                <span>Pause</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onCompleteWipBatch(batch.id)}
                                className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center space-x-1 whitespace-nowrap"
                                title="Selesaikan batch seketika dan bunyikan alarm peringatan"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Selesai</span>
                              </button>
                            </div>
                          ) : isPaused ? (
                            <div className="inline-flex items-center justify-center gap-1.5">
                              {onResumeWipBatch && (
                                <button
                                  type="button"
                                  onClick={() => onResumeWipBatch(batch.id)}
                                  className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center gap-1 whitespace-nowrap"
                                  title="Lanjutkan kembali timer batch WIP"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Lanjut</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onCompleteWipBatch(batch.id)}
                                className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center space-x-1 whitespace-nowrap"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Selesai</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-ink-muted flex items-center justify-center space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{batch.status === 'DIBATALKAN' ? 'Dibatalkan' : 'Tuntas'}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                      {isAuditExpanded && batch.pauseLogs && batch.pauseLogs.length > 0 && (
                        <tr className="bg-canvas">
                          <td colSpan={10} className="px-4 py-3 border-b border-border-subtle">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-ink-sky flex items-center gap-1.5">
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>Audit Trail Penghentian Sementara ({batch.batchCode})</span>
                                </span>
                                <span className="font-mono tabular-nums text-ink-secondary">
                                  Total Kejadian: {batch.pauseLogs.length} · Akumulasi Jeda:{' '}
                                  {formatPauseDurationMs(batch.totalPausedMs)}
                                </span>
                              </div>
                              <div className="overflow-x-auto border border-border-subtle rounded-xl">
                                <table className="w-full text-left border-collapse text-[11px]">
                                  <thead>
                                    <tr className="bg-surface text-ink-secondary border-b border-border-subtle">
                                      <th className="py-1.5 px-2.5">No</th>
                                      <th className="py-1.5 px-2.5">Kategori</th>
                                      <th className="py-1.5 px-2.5">Alasan Penghentian Sementara</th>
                                      <th className="py-1.5 px-2.5">Waktu Pause</th>
                                      <th className="py-1.5 px-2.5">Waktu Lanjut</th>
                                      <th className="py-1.5 px-2.5 text-right">Durasi Jeda</th>
                                      <th className="py-1.5 px-2.5">Petugas Audit</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border-subtle">
                                    {batch.pauseLogs.map((log, lIdx) => (
                                      <tr key={log.id}>
                                        <td className="py-1.5 px-2.5 font-mono tabular-nums text-ink-secondary">
                                          {lIdx + 1}
                                        </td>
                                        <td className="py-1.5 px-2.5 font-semibold text-ink-sky whitespace-nowrap">
                                          {log.category}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-ink-primary">{log.reason}</td>
                                        <td className="py-1.5 px-2.5 font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                                          {new Date(log.pausedAt).toLocaleString('id-ID', {
                                            day: '2-digit',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit'
                                          })}
                                        </td>
                                        <td className="py-1.5 px-2.5 font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                                          {log.resumedAt
                                            ? new Date(log.resumedAt).toLocaleString('id-ID', {
                                                day: '2-digit',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                              })
                                            : 'Masih Dijeda'}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-ink-amber whitespace-nowrap">
                                          {log.pausedDurationMs !== undefined
                                            ? formatPauseDurationMs(log.pausedDurationMs)
                                            : formatPauseDurationMs(
                                                Math.max(0, currentTime - new Date(log.pausedAt).getTime())
                                              )}
                                        </td>
                                        <td className="py-1.5 px-2.5 text-ink-secondary whitespace-nowrap">
                                          Pause: <strong>{log.pausedBy}</strong>
                                          {log.resumedBy ? ` · Lanjut: ${log.resumedBy}` : ''}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-ink-muted text-xs">
                    Belum ada perintah kerja batch WIP yang cocok dengan filter pencarian / shift.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
