import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  ArrowRight,
  Cylinder,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { WipTank, WIP } from '../types';
import { SlideOverDrawer } from './ui/SlideOverDrawer';

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

  // Synchronize source tank and clear inputs when drawer opens or initialSourceTankId changes
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

  const availableDestTanks = tanks.filter(t => t.id !== sourceTankId);
  const activeDestTankId =
    destTankId && destTankId !== sourceTankId ? destTankId : availableDestTanks[0]?.id || '';
  const destTank = tanks.find(t => t.id === activeDestTankId);
  const destWip = wips.find(w => w.id === destTank?.assignedWipId);

  // 1-WIP Rule Compatibility Check
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
        ? `[Rule 1-WIP] Transfer WIP dari Holding Tank (${sourceTank.code}) ke Storage Tank (${destTank.code})`
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

  const isHoldingToStorage =
    sourceTank?.type === 'HOLDING_TANK' && destTank?.type === 'STORAGE_TANK';

  return (
    <SlideOverDrawer
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      size="lg"
      icon={<ArrowRightLeft className="w-5 h-5" />}
      title="Transfer WIP Antar-Tangki (Holding ⇄ Storage)"
      description="Panel geser kanan agar status dan level tangki di latar belakang tetap terpantau real-time. Proteksi ketat 1 jenis WIP per tangki."
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-muted hover:bg-accent text-foreground border border-border rounded-xl text-xs font-semibold transition whitespace-nowrap"
          >
            Batal
          </button>
          <button
            type="submit"
            form="inter-tank-transfer-form"
            disabled={!is1WipCompatible || maxPossibleTransfer <= 0}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 whitespace-nowrap ${
              !is1WipCompatible || maxPossibleTransfer <= 0
                ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/20'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <span>Eksekusi Transfer Real-Time</span>
          </button>
        </div>
      }
    >
      <form id="inter-tank-transfer-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Transfer Route Summary */}
        <div className="bg-background border border-border p-3 rounded-xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-medium text-muted-foreground">Jalur:</span>
            <span className="font-bold text-foreground font-mono tabular-nums">
              {sourceTank?.code || 'Asal'} ({sourceTank?.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'})
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-brand shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-brand font-mono tabular-nums">
              {destTank?.code || 'Tujuan'} ({destTank?.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'})
            </span>
            {isHoldingToStorage && (
              <span className="text-[10px] text-ink-emerald font-semibold">
                · Holding ➔ Storage
              </span>
            )}
          </div>
        </div>

        {/* Source and Destination Tank Selectors */}
        <div className="grid grid-cols-1 gap-3.5">
          {/* 1. Source Tank */}
          <div className="bg-background border border-border p-3.5 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Cylinder className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                <span>1. Tangki Sumber (Asal WIP)</span>
              </label>
              <span className="text-[11px] text-ink-amber font-mono font-bold tabular-nums">
                Level: {sourceTank?.currentLevelKg.toFixed(1) ?? '0.0'} kg
              </span>
            </div>

            <select
              value={sourceTankId}
              onChange={e => {
                setSourceTankId(e.target.value);
                setAmountKg('');
              }}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground font-medium focus:outline-none focus:border-accent-primary"
            >
              {tanks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.code} - {t.name} ({t.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'} · {t.currentLevelKg.toFixed(1)}/{t.capacityKg} kg)
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground border-t border-border/70">
              <span>
                WIP Sumber:{' '}
                <strong className="text-foreground">
                  {sourceWip ? sourceWip.name : 'Kosong / Unallocated'}
                </strong>
              </span>
              <span className="font-mono text-brand">
                {sourceTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
              </span>
            </div>
          </div>

          {/* 2. Destination Tank */}
          <div className="bg-background border border-border p-3.5 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Cylinder className="w-3.5 h-3.5 text-brand shrink-0" />
                <span>2. Tangki Tujuan (Penerima)</span>
              </label>
              <span className="text-[11px] text-ink-emerald font-mono font-bold tabular-nums">
                Sisa Ruang: {destFreeSpace.toFixed(1)} kg
              </span>
            </div>

            <select
              value={activeDestTankId}
              onChange={e => {
                setDestTankId(e.target.value);
                setAmountKg('');
              }}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground font-medium focus:outline-none focus:border-accent-primary"
            >
              {availableDestTanks.map(t => (
                <option key={t.id} value={t.id}>
                  {t.code} - {t.name} ({t.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'} · Sisa {Math.max(0, t.capacityKg - t.currentLevelKg).toFixed(1)} kg)
                </option>
              ))}
            </select>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-muted-foreground border-t border-border/70">
              <span>
                WIP Tujuan:{' '}
                <strong className="text-foreground">
                  {destWip ? destWip.name : 'Kosong (Siap Terima Formula)'}
                </strong>
              </span>
              <span className="font-mono text-ink-indigo">
                {destTank?.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}
              </span>
            </div>
          </div>
        </div>

        {/* 1-WIP Rule Verification Banner */}
        <div
          className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
            is1WipCompatible
              ? 'bg-emerald-500/10 border-emerald-500/30 text-ink-emerald'
              : 'bg-rose-500/10 border-rose-500/30 text-ink-rose'
          }`}
        >
          {is1WipCompatible ? (
            <ShieldCheck className="w-4 h-4 text-ink-emerald shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-ink-rose shrink-0 mt-0.5" />
          )}
          <div>
            <div className="font-bold">
              {is1WipCompatible
                ? 'Kesesuaian 1-WIP Terverifikasi (Formula Sah)'
                : 'Pelanggaran Aturan 1-WIP: Formula Tidak Kompatibel'}
            </div>
            <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
              {is1WipCompatible
                ? destTank && destTank.currentLevelKg <= 0
                  ? `Tangki tujuan ${destTank.code} kosong, formula WIP "${sourceWip?.name || 'WIP'}" akan dialokasikan eksklusif.`
                  : `Kedua tangki dialokasikan untuk formula WIP yang sama (${sourceWip?.name || 'WIP Identik'}). Transfer aman dilakukan.`
                : `Tangki tujuan ${destTank?.code} berisi WIP berbeda (${destWip?.name || 'WIP Lain'}). Campuran formula dilarang.`}
            </p>
          </div>
        </div>

        {/* Transfer Amount Input & Presets */}
        <div className="bg-background border border-border p-3.5 rounded-xl space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-foreground">
              Jumlah Bobot WIP yang Ditransfer (kg)
            </label>
            <span className="text-[11px] text-brand font-mono tabular-nums">
              Maks: <strong>{maxPossibleTransfer.toFixed(1)} kg</strong>
            </span>
          </div>

          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.1"
              max={maxPossibleTransfer}
              value={amountKg}
              onChange={e => setAmountKg(e.target.value)}
              required
              placeholder={`0.00 (Maks ${maxPossibleTransfer.toFixed(1)} kg)`}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 pr-16 text-foreground font-mono tabular-nums text-base font-bold focus:outline-none focus:border-accent-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground">
              kg WIP
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground mr-1">Preset:</span>
            {[0.25, 0.5, 0.75].map(frac => (
              <button
                key={frac}
                type="button"
                onClick={() => handleSetPreset(frac)}
                className="px-2 py-1 bg-muted hover:bg-accent text-foreground border border-border rounded-md text-[10px] font-mono tabular-nums transition whitespace-nowrap"
              >
                {frac * 100}% ({(maxPossibleTransfer * frac).toFixed(1)} kg)
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleSetPreset(1.0)}
              className="px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-brand border border-cyan-500/30 rounded-md text-[10px] font-mono tabular-nums font-bold transition whitespace-nowrap"
            >
              100% Maks ({maxPossibleTransfer.toFixed(1)} kg)
            </button>
            {sourceWip && (
              <button
                type="button"
                onClick={handleSetBatchPreset}
                className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-ink-amber border border-amber-500/30 rounded-md text-[10px] font-mono tabular-nums font-bold transition whitespace-nowrap"
              >
                1 Batch ({sourceWip.batchWeightKg.toFixed(1)} kg)
              </button>
            )}
          </div>
        </div>

        {/* Operator & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              Operator Penanggung Jawab
            </label>
            <input
              type="text"
              value={operatorName}
              onChange={e => setOperatorName(e.target.value)}
              required
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-foreground mb-1">
              Catatan Transfer / Work Order
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Suplai batch malam ke storage tank"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>
      </form>
    </SlideOverDrawer>
  );
};
