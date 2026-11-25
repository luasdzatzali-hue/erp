import React, { useState, useEffect } from 'react';
import { PauseCircle, Clock, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { WipProductionBatch } from '../types';

interface WipBatchPauseModalProps {
  isOpen: boolean;
  batch: WipProductionBatch | null;
  machineLabel?: string;
  currentTime: number;
  actorName: string;
  onClose: () => void;
  onConfirmPause: (batchId: string, reason: string, category: string) => void;
}

const PAUSE_CATEGORIES = [
  'Mesin / Mekanik',
  'Menunggu Bahan Baku',
  'Inspeksi QC / Lab',
  'Utilitas / Listrik / Uap',
  'Pergantian Shift',
  'Lainnya'
] as const;

const QUICK_REASON_TEMPLATES = [
  'Kalibrasi ulang timbangan / sensor mesin',
  'Menunggu suplai bahan baku tambahan dari gudang',
  'Pengecekan viskositas / sampel oleh tim QC',
  'Kendala suplai listrik / tekanan uap sementara',
  'Serah terima operasional antar shift operator'
];

export const WipBatchPauseModal: React.FC<WipBatchPauseModalProps> = ({
  isOpen,
  batch,
  machineLabel,
  currentTime,
  actorName,
  onClose,
  onConfirmPause
}) => {
  const [category, setCategory] = useState<string>(PAUSE_CATEGORIES[0]);
  const [reason, setReason] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen && batch) {
      setCategory(PAUSE_CATEGORIES[0]);
      setReason('');
      setErrorMsg('');
    }
  }, [isOpen, batch?.id]);

  if (!isOpen || !batch) return null;

  const estMs = batch.estimatedCompletionTime
    ? new Date(batch.estimatedCompletionTime).getTime()
    : null;
  const remainingMs = estMs !== null ? Math.max(0, estMs - currentTime) : (batch.durationMinutes || 30) * 60_000;
  const remMins = Math.floor(remainingMs / 60_000);
  const remSecs = Math.floor((remainingMs % 60_000) / 1000);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setErrorMsg('Tuliskan alasan penghentian sementara minimal 5 karakter untuk catatan audit trail.');
      return;
    }
    onConfirmPause(batch.id, trimmed, category);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-batch-modal-title"
    >
      <div className="bg-surface border border-border-strong rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle bg-canvas flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-tint-sky border border-sky-700 text-ink-sky shrink-0">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="pause-batch-modal-title" className="text-sm font-bold text-ink-primary truncate">
                Pause Sementara Perintah Kerja WIP
              </h3>
              <p className="text-[11px] text-ink-secondary truncate">
                Timer estimasi akan dihentikan dan alasan dicatat di audit trail
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-elevated transition shrink-0"
            aria-label="Tutup modal pause"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Batch Summary & Frozen Timer Preview */}
          <div className="p-3.5 rounded-xl bg-canvas border border-border-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="font-bold text-brand">{batch.batchCode}</span>
                {batch.recipeCode && <span className="text-ink-secondary">· {batch.recipeCode}</span>}
              </div>
              <p className="font-bold text-ink-primary text-sm truncate">{batch.wipName}</p>
              <p className="text-[11px] text-ink-secondary truncate">
                {machineLabel || batch.targetMachineName || 'Mesin Produksi'} · {batch.batchWeightKg.toFixed(1)} kg
              </p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-tint-sky border border-sky-700 text-right shrink-0">
              <span className="text-[10px] text-ink-sky block font-medium">
                Sisa Waktu Dibekukan
              </span>
              <span className="font-mono tabular-nums text-sm font-extrabold text-ink-primary inline-flex items-center gap-1 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-ink-sky" />
                <span>{remMins}m {String(remSecs).padStart(2, '0')}s</span>
              </span>
            </div>
          </div>

          {/* Downtime Category Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Kategori Penghentian Sementara
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {PAUSE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border text-left truncate transition ${
                    category === cat
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : 'bg-elevated hover:bg-accent border-border-strong text-ink-secondary'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Reason Templates */}
          <div>
            <span className="block text-[11px] font-medium text-ink-secondary mb-1.5">
              Template Alasan Cepat (Klik untuk mengisi):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASON_TEMPLATES.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => {
                    setReason(tpl);
                    setErrorMsg('');
                  }}
                  className="px-2 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-[10px] text-ink-secondary transition text-left"
                >
                  {tpl}
                </button>
              ))}
            </div>
          </div>

          {/* Mandatory Reason Input */}
          <div>
            <label htmlFor="wip-pause-reason" className="block text-[11px] font-semibold text-ink-primary mb-1">
              Alasan Penghentian Sementara (Wajib untuk Audit Trail) *
            </label>
            <textarea
              id="wip-pause-reason"
              rows={3}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              placeholder="Jelaskan secara spesifik alasan penghentian sementara batch WIP ini..."
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-sky-500 resize-none"
            />
            {errorMsg && (
              <p className="mt-1.5 text-[11px] text-ink-rose flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMsg}</span>
              </p>
            )}
          </div>

          {/* Audit Accountability Footer */}
          <div className="px-3 py-2 rounded-xl bg-canvas border border-border-subtle flex items-center justify-between gap-2 text-[11px] text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-ink-emerald shrink-0" />
              <span>Dicatat oleh: <strong className="text-ink-primary">{actorName}</strong></span>
            </span>
            <span className="font-mono tabular-nums">
              {new Date(currentTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold flex items-center gap-1.5 shadow-md transition active:scale-95"
            >
              <PauseCircle className="w-4 h-4" />
              <span>Konfirmasi Pause &amp; Catat Log</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
