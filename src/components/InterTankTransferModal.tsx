import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRightLeft,
  ArrowRight,
  Cylinder,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { WipTank, WIP } from '../types';

interface InterTankTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  tanks: WipTank[];
  wips: WIP[];
  initialSourceTankId?: string;
  onExecuteTransfer: (
    sourceTankId: string,
    destTankId: string,
    amountKg: number,
    notes?: string,
    operatorName?: string
  ) => { success: boolean; message: string };
  showToast: (msg: string, isError?: boolean) => void;
}

export const InterTankTransferModal: React.FC<InterTankTransferModalProps> = ({
  isOpen,
  onClose,
  tanks,
  wips,
  initialSourceTankId,
  onExecuteTransfer,
  showToast
}) => {
  const [sourceTankId, setSourceTankId] = useState<string>(
    initialSourceTankId || tanks.find(t => t.currentLevelKg > 0)?.id || tanks[0]?.id || ''
  );
  const [destTankId, setDestTankId] = useState<string>('');
  const [amountKg, setAmountKg] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>('Operator Tangki WIP');
  const [notes, setNotes] = useState<string>('');

  // Synchronize source tank and clear inputs when modal opens or initialSourceTankId changes
  useEffect(() => {
    if (isOpen) {
      if (initialSourceTankId) {
        setSourceTankId(initialSourceTankId);
      } else if (!sourceTankId || !tanks.some(t => t.id === sourceTankId)) {
        const defaultSrc = tanks.find(t => t.currentLevelKg > 0)?.id || tanks[0]?.id || '';
        setSourceTankId(defaultSrc);
      }
      setAmountKg('');
      setNotes('');
    }
  }, [isOpen, initialSourceTankId, tanks]);

  const sourceTank = tanks.find(t => t.id === sourceTankId);
  const sourceWip = wips.find(w => w.id === sourceTank?.assignedWipId);

  // Available destination tanks (must be different from source)
  const availableDestTanks = tanks.filter(t => t.id !== sourceTankId);

  // Default dest tank selection if empty or invalid
  const activeDestTankId = destTankId && destTankId !== sourceTankId ? destTankId : (availableDestTanks[0]?.id || '');
  const destTank = tanks.find(t => t.id === activeDestTankId);
  const destWip = wips.find(w => w.id === destTank?.assignedWipId);

  // 1-WIP Rule Compatibility Check (Evaluated as a plain boolean without hooks)
  // Rule: Destination tank can accept WIP IF:
  // 1. It is empty (currentLevelKg <= 0.001), OR
  // 2. Its assignedWipId is identical to sourceTank's assignedWipId
  const is1WipCompatible = Boolean(
    sourceTank &&
    destTank &&
    (destTank.currentLevelKg <= 0.001 ||
      (!destTank.assignedWipId && destTank.currentLevelKg <= 0) ||
      destTank.assignedWipId === sourceTank.assignedWipId)
  );

  const sourceLevel = sourceTank ? sourceTank.currentLevelKg : 0;
  const destFreeSpace = destTank ? Math.max(0, destTank.capacityKg - destTank.currentLevelKg) : 0;
  const maxPossibleTransfer = Math.min(sourceLevel, destFreeSpace);

  // Quick preset transfer buttons
  const handleSetPreset = (fraction: number) => {
    const val = parseFloat((maxPossibleTransfer * fraction).toFixed(2));
    setAmountKg(val > 0 ? val.toString() : '');
  };

  const handleSetBatchPreset = () => {
    if (sourceWip && sourceWip.batchWeightKg > 0) {
      const val = Math.min(maxPossibleTransfer, sourceWip.batchWeightKg);
      setAmountKg(val.toFixed(2));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceTank || !destTank) {
      showToast('Harap pilih tangki sumber dan tujuan transfer', true);
      return;
    }

    const amt = parseFloat(amountKg);
    if (isNaN(amt) || amt <= 0) {
      showToast('Masukkan jumlah transfer yang valid (> 0 kg)', true);
      return;
    }

    if (amt > sourceTank.currentLevelKg) {
      showToast(
        `Isi tangki asal ${sourceTank.code} tidak mencukupi (${sourceTank.currentLevelKg.toFixed(1)} kg)`,
        true
      );
      return;
    }

    if (destTank.currentLevelKg + amt > destTank.capacityKg) {
      showToast(
        `Melebihi kapasitas sisa tangki tujuan ${destTank.code} (${destFreeSpace.toFixed(1)} kg tersisa)`,
        true
      );
      return;
    }

    if (!is1WipCompatible) {
      showToast(
        'Pelanggaran Aturan 1-WIP: Tangki tujuan memiliki WIP berbeda! Transfer dibatalkan.',
        true
      );
      return;
    }

    const defaultNote =
      sourceTank.type === 'HOLDING_TANK' && destTank.type === 'STORAGE_TANK'
        ? `[Rule Baru] Transfer WIP dari Holding Tank (${sourceTank.code}) ke Storage Tank (${destTank.code})`
        : `Transfer WIP dari ${sourceTank.code} ke ${destTank.code}`;

    const res = onExecuteTransfer(
      sourceTank.id,
      destTank.id,
      amt,
      notes.trim() || defaultNote,
      operatorName
    );

    if (res.success) {
      showToast(res.message);
      onClose();
    } else {
      showToast(res.message, true);
    }
  };

  // Determine transfer route description
  const isHoldingToStorage = sourceTank?.type === 'HOLDING_TANK' && destTank?.type === 'STORAGE_TANK';
  const isStorageToHolding = sourceTank?.type === 'STORAGE_TANK' && destTank?.type === 'HOLDING_TANK';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-4">
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950/60 p-5 sm:p-6 border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg text-white">
                  Transfer WIP Antar-Tangki (Holding ⇄ Storage)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                  Rule Baru
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Holding Tank kini dapat mentransfer massa WIP ke Storage Tank (dan sebaliknya), dengan proteksi ketat <strong>1 Jenis WIP yang Sama per Tangki</strong>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transfer Route Banner */}
        <div className="px-5 sm:px-6 pt-5">
          <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase">Jalur Transfer:</span>
              <span className="font-bold text-white font-mono">
                {sourceTank?.code || 'Asal'} ({sourceTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})
              </span>
            </div>
            <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="flex items-center space-x-2">
              <span className="font-bold text-cyan-300 font-mono">
                {destTank?.code || 'Tujuan'} ({destTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})
              </span>
              {isHoldingToStorage && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                  ★ Holding ➔ Storage
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs">
          {/* Source and Destination Tank Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Source Tank */}
            <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Cylinder className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. Tangki Sumber (Asal WIP):</span>
                </label>
                <span className="text-[10px] text-amber-400 font-mono font-bold">
                  Level: {sourceTank?.currentLevelKg.toFixed(1)} kg
                </span>
              </div>

              <select
                value={sourceTankId}
                onChange={(e) => {
                  setSourceTankId(e.target.value);
                  setAmountKg('');
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-cyan-500"
              >
                {tanks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name} ({t.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'} • {t.currentLevelKg.toFixed(1)}/{t.capacityKg} kg)
                  </option>
                ))}
              </select>

              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800 text-[11px] space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>WIP Sumber:</span>
                  <span className="text-white font-semibold truncate max-w-[150px]">
                    {sourceWip ? sourceWip.name : 'Kosong / Unallocated'}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tipe Tangki:</span>
                  <span className="font-mono text-cyan-400">
                    {sourceTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Destination Tank */}
            <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Cylinder className="w-3.5 h-3.5 text-cyan-400" />
                  <span>2. Tangki Tujuan (Penerima):</span>
                </label>
                <span className="text-[10px] text-emerald-400 font-mono font-bold">
                  Sisa Ruang: {destFreeSpace.toFixed(1)} kg
                </span>
              </div>

              <select
                value={activeDestTankId}
                onChange={(e) => {
                  setDestTankId(e.target.value);
                  setAmountKg('');
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-cyan-500"
              >
                {availableDestTanks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.code} - {t.name} ({t.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'} • Sisa {Math.max(0, t.capacityKg - t.currentLevelKg).toFixed(1)} kg)
                  </option>
                ))}
              </select>

              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800 text-[11px] space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>WIP Tujuan:</span>
                  <span className="text-white font-semibold truncate max-w-[150px]">
                    {destWip ? destWip.name : <em className="text-slate-500">Kosong (Siap Terima Formula)</em>}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tipe Tangki:</span>
                  <span className="font-mono text-indigo-400">
                    {destTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 1-WIP Rule Compatibility Verification Banner */}
          <div
            className={`p-3 rounded-2xl border flex items-center space-x-3 text-xs ${
              is1WipCompatible
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {is1WipCompatible ? (
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <div>
              <div className="font-bold">
                {is1WipCompatible
                  ? 'Kesesuaian 1-WIP Terverifikasi (Formula Sah)'
                  : 'Pelanggaran Aturan 1-WIP: Formula Tidak Kompatibel!'}
              </div>
              <p className="text-[11px] opacity-90 mt-0.5">
                {is1WipCompatible
                  ? destTank && destTank.currentLevelKg <= 0
                    ? `Tangki tujuan ${destTank.code} kosong, formula WIP "${sourceWip?.name || 'WIP'}" akan dialokasikan secara eksklusif.`
                    : `Kedua tangki dialokasikan untuk 1 formula WIP yang sama (${sourceWip?.name || 'WIP Identik'}). Transfer aman dilakukan.`
                  : `Tangki tujuan ${destTank?.code} sudah berisi WIP berbeda (${destWip?.name || 'WIP Lain'}). Campuran formula dilarang untuk menjaga kemurnian resep!`}
              </p>
            </div>
          </div>

          {/* Transfer Amount Input & Presets */}
          <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-200">
                Jumlah Bobot WIP yang Ditransfer (kg):
              </label>
              <span className="text-[10px] text-cyan-400 font-mono">
                Maksimal Transfer: <strong>{maxPossibleTransfer.toFixed(1)} kg</strong>
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.1"
                max={maxPossibleTransfer}
                value={amountKg}
                onChange={(e) => setAmountKg(e.target.value)}
                required
                placeholder={`0.00 (Maks ${maxPossibleTransfer.toFixed(1)} kg)`}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-base font-bold focus:outline-none focus:border-cyan-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                kg WIP
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-slate-400 mr-1">Preset Cepat:</span>
              <button
                type="button"
                onClick={() => handleSetPreset(0.25)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition"
              >
                25% ({((maxPossibleTransfer * 0.25)).toFixed(1)} kg)
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(0.5)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition"
              >
                50% ({((maxPossibleTransfer * 0.5)).toFixed(1)} kg)
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(0.75)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] font-mono transition"
              >
                75% ({((maxPossibleTransfer * 0.75)).toFixed(1)} kg)
              </button>
              <button
                type="button"
                onClick={() => handleSetPreset(1.0)}
                className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-lg text-[10px] font-mono font-bold transition"
              >
                100% Maks ({maxPossibleTransfer.toFixed(1)} kg)
              </button>
              {sourceWip && (
                <button
                  type="button"
                  onClick={handleSetBatchPreset}
                  className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-mono font-bold transition"
                >
                  1 Batch ({sourceWip.batchWeightKg.toFixed(1)} kg)
                </button>
              )}
            </div>
          </div>

          {/* Operator & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Operator Penanggung Jawab Transfer:
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Catatan Transfer / Work Order:
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Suplai batch malam ke storage tank"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-semibold transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!is1WipCompatible || maxPossibleTransfer <= 0}
              className={`flex-1 py-3 rounded-2xl font-bold shadow-xl transition active:scale-95 flex items-center justify-center space-x-2 ${
                !is1WipCompatible || maxPossibleTransfer <= 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-600/30'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Eksekusi Transfer Real-Time</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
