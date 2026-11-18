import React, { useState } from 'react';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Package,
  Wrench,
  ShieldCheck,
  User
} from 'lucide-react';
import { SKU, ChangeoverType, ShiftNumber } from '../types';
import { getCurrentShift } from '../utils/shifts';

interface SkuChangeoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineId: string;
  lineName: string;
  currentSkuId: string;
  currentSkuName: string;
  availableSkus: SKU[];
  onConfirmChangeover: (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

const CHANGEOVER_TYPES: Array<{ key: ChangeoverType; label: string; defaultMinutes: number; desc: string }> = [
  {
    key: 'MINOR',
    label: 'Minor / Pergantian SKU Senada',
    defaultMinutes: 20,
    desc: 'Penggantian varian produk dalam satu kategori dengan pembersihan jalur singkat.'
  },
  {
    key: 'MAJOR_ALLERGEN',
    label: 'Major / Pergantian Alergen & Varian Kontras',
    defaultMinutes: 60,
    desc: 'Pergantian formula dengan risiko kontaminasi silang atau alergen berbeda. Wajib cuci & bilas.'
  },
  {
    key: 'FULL_CIP',
    label: 'Full Sanitasi & CIP Kimiawi',
    defaultMinutes: 75,
    desc: 'Siklus pembersihan menyeluruh jalur pipa transfer dan mixing vessel.'
  },
  {
    key: 'MOULD_TOOLING',
    label: 'Pergantian Tooling / Cetakan / Nozzle',
    defaultMinutes: 45,
    desc: 'Penggantian part mekanikal / cetakan sesuai dimensi SKU produk baru.'
  }
];

export const SkuChangeoverModal: React.FC<SkuChangeoverModalProps> = ({
  isOpen,
  onClose,
  lineId,
  lineName,
  currentSkuId,
  currentSkuName,
  availableSkus,
  onConfirmChangeover,
  showToast
}) => {
  const currentShift = getCurrentShift();
  const [selectedSkuId, setSelectedSkuId] = useState<string>(
    availableSkus.find(s => s.id !== currentSkuId)?.id || availableSkus[0]?.id || ''
  );
  const [changeoverType, setChangeoverType] = useState<ChangeoverType>('MINOR');
  const [estimatedMinutes, setEstimatedMinutes] = useState<string>('20');
  const [operatorName, setOperatorName] = useState<string>('Operator Line Produksi');
  const [notes, setNotes] = useState<string>('');

  if (!isOpen) return null;

  const targetSkuObj = availableSkus.find(s => s.id === selectedSkuId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkuId) {
      showToast('Pilih SKU produk tujuan changeover terlebih dahulu', true);
      return;
    }
    if (selectedSkuId === currentSkuId) {
      showToast('SKU tujuan tidak boleh sama dengan SKU yang sedang diproduksi', true);
      return;
    }
    const mins = parseInt(estimatedMinutes, 10);
    if (isNaN(mins) || mins <= 0) {
      showToast('Masukkan durasi estimasi changeover yang valid (menit)', true);
      return;
    }

    onConfirmChangeover(lineId, selectedSkuId, {
      changeoverType,
      estimatedMinutes: mins,
      operatorName: operatorName.trim() || 'Operator Line',
      notes: notes.trim() || undefined
    });

    showToast(`Changeover SKU untuk ${lineName} berhasil dimulai (${targetSkuObj?.name || 'SKU Baru'})`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-4 text-white">
        {/* Header */}
        <div className="bg-cyan-950/60 border-b border-cyan-500/30 p-5 sm:p-6 flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <RotateCw className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Changeover SKU — {lineName}
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/40">
                  Pergantian Produk
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Mengalihkan jalur produksi dari <strong className="text-white">{currentSkuName}</strong> ke SKU baru secara bersih dan terdokumentasi.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs">
          {/* Target SKU Selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
              Pilih SKU Produk Tujuan:
            </label>
            <select
              value={selectedSkuId}
              onChange={e => setSelectedSkuId(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-medium focus:outline-none focus:border-cyan-500 shadow-xs"
            >
              {availableSkus
                .filter(s => s.id !== currentSkuId)
                .map(sku => (
                  <option key={sku.id} value={sku.id}>
                    {sku.name} ({sku.code || 'SKU'} · Target: {sku.targetHour} ktn/jam{sku.isKite ? ' ⭐ KITE' : ''})
                  </option>
                ))}
            </select>
          </div>

          {/* Changeover Type Selection */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-300">
              Klasifikasi Tipe Changeover:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CHANGEOVER_TYPES.map(type => {
                const isSelected = changeoverType === type.key;
                return (
                  <div
                    key={type.key}
                    onClick={() => {
                      setChangeoverType(type.key);
                      setEstimatedMinutes(String(type.defaultMinutes));
                    }}
                    className={`p-3 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white ring-1 ring-cyan-500/40'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-cyan-300">{type.label}</span>
                        <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
                          ~{type.defaultMinutes} mnt
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{type.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Duration, Operator, Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Estimasi Waktu Changeover (Menit):
              </label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="5"
                  step="1"
                  value={estimatedMinutes}
                  onChange={e => setEstimatedMinutes(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-mono font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Operator Penanggung Jawab:
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={operatorName}
                  onChange={e => setOperatorName(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-white font-medium focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">
              Catatan Teknis / Sanitasi Changeover:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Catatan kebersihan, flushing, atau penyesuaian parameter mesin..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-medium focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl font-semibold transition"
            >
              Batal
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold shadow-lg shadow-cyan-600/20 transition flex items-center justify-center space-x-2"
            >
              <RotateCw className="w-4 h-4" />
              <span>Eksekusi Changeover SKU</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
