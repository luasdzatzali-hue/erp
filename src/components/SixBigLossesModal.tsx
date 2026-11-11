import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Clock,
  Wrench,
  Gauge,
  Sliders,
  CheckCircle2,
  FileText,
  User,
  ShieldAlert,
  Flame,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import {
  SixBigLossCategory,
  LossCategoryType,
  ProductionStopLog,
  ShiftNumber
} from '../types';
import { getCurrentShift } from '../utils/shifts';

interface SixBigLossesModalProps {
  isOpen: boolean;
  onClose: () => void;
  skuId: string;
  skuName: string;
  skuCode?: string;
  startedAt?: string;
  cartonsProducedDuringRun?: number;
  onConfirmStop: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

interface LossCategoryMeta {
  key: SixBigLossCategory;
  number: number;
  title: string;
  subtitle: string;
  lossType: LossCategoryType;
  lossTypeBadge: string;
  badgeClass: string;
  bgActive: string;
  borderActive: string;
  defaultSubReasons: string[];
}

const LOSS_CATEGORIES: LossCategoryMeta[] = [
  {
    key: 'EQUIPMENT_FAILURE',
    number: 1,
    title: 'Kerusakan Mesin / Breakdowns',
    subtitle: 'Equipment Failure & Unplanned Downtime',
    lossType: 'DOWNTIME',
    lossTypeBadge: 'Downtime Loss',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    bgActive: 'bg-rose-50',
    borderActive: 'border-rose-400',
    defaultSubReasons: [
      'Kerusakan Motor Penggerak Mixer / Pompa WIP (Overheating/Trip)',
      'Patah Poros / Baut Agitator Tangki Macet',
      'Kebocoran Jalur Pipa Transfer WIP / Valve Rusak',
      'Gangguan Elektrikal, Sensor PLC, atau Power Inverter Error',
      'Kerusakan Pneumatik / Sabuk Konveyor Patah'
    ]
  },
  {
    key: 'SETUP_ADJUSTMENT',
    number: 2,
    title: 'Penyetelan & Changeover',
    subtitle: 'Setup & Adjustments / Line Clearance',
    lossType: 'DOWNTIME',
    lossTypeBadge: 'Downtime Loss',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
    bgActive: 'bg-amber-50',
    borderActive: 'border-amber-400',
    defaultSubReasons: [
      'Changeover Produk / Penggantian Formula Resep WIP Baru',
      'Pembersihan Menyeluruh & Siklus Sanitasi CIP (Cleaning-in-Place)',
      'Penggantian Cetakan, Nozzle Filling, atau Tooling Mesin',
      'Penyetelan Parameter Suhu Tangki, Tekanan, dan Speed Mixer',
      'Line Clearance & Menunggu Konfirmasi Swab Allergen QC'
    ]
  },
  {
    key: 'IDLING_MINOR_STOPS',
    number: 3,
    title: 'Pemberhentian Singkat & Idling',
    subtitle: 'Idling & Minor Stoppages (< 5-10 menit)',
    lossType: 'SPEED',
    lossTypeBadge: 'Speed Loss',
    badgeClass: 'bg-sky-100 text-sky-950 border-sky-300 font-bold',
    bgActive: 'bg-sky-50',
    borderActive: 'border-sky-400',
    defaultSubReasons: [
      'Aliran Fluida WIP dari Holding Tank Macet / Tersendat Sesaat',
      'Sensor Photoelectric Terhalang Debu / Karton Nyangkut',
      'Menunggu Pasokan Box Karton, Lakban, atau Palet Baru',
      'Pembersihan Tumpahan Ceceran Material Singkat oleh Operator',
      'Penyesuaian Posisi Sensor Otomatis / Limit Switch'
    ]
  },
  {
    key: 'REDUCED_SPEED',
    number: 4,
    title: 'Kecepatan Operasi Berkurang',
    subtitle: 'Reduced Speed / Operating Below Nameplate Capacity',
    lossType: 'SPEED',
    lossTypeBadge: 'Speed Loss',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold',
    bgActive: 'bg-indigo-50',
    borderActive: 'border-indigo-400',
    defaultSubReasons: [
      'Viskositas WIP Terlalu Kental (Dibutuhkan RPM Pompa Lebih Rendah)',
      'Keausan Komponen Mekanikal / Getaran Tinggi pada Mesin',
      'Operator Sengaja Menurunkan Kecepatan untuk Menghindari Jamming',
      'Fluktuasi Suhu Pemanas Tangki Tidak Stabil (Perlu Menunggu)',
      'Toleransi Berat Karton Berfluktuasi pada Kecepatan Tinggi'
    ]
  },
  {
    key: 'PROCESS_DEFECTS',
    number: 5,
    title: 'Cacat Proses & Perbaikan',
    subtitle: 'Process Defects & Quality Rework',
    lossType: 'QUALITY',
    lossTypeBadge: 'Quality Loss',
    badgeClass: 'bg-orange-100 text-orange-950 border-orange-300 font-bold',
    bgActive: 'bg-orange-50',
    borderActive: 'border-orange-400',
    defaultSubReasons: [
      'Karton Bocor / Sealing Rekat Tidak Rapat Sempurna',
      'Bobot Netto Karton di Luar Batas Toleransi Standar QC',
      'Kontaminasi Fisik / Cacat Visual Label Kemasan',
      'Homogenitas & Kekentalan Formula WIP Drop di Bawah Standar',
      'Cacat Cetakan / Bentuk Produk Jadi Tidak Presisi'
    ]
  },
  {
    key: 'STARTUP_REJECTS',
    number: 6,
    title: 'Penurunan Yield & Startup Scrap',
    subtitle: 'Reduced Yield & Early Production Losses',
    lossType: 'QUALITY',
    lossTypeBadge: 'Quality Loss',
    badgeClass: 'bg-red-100 text-red-900 border-red-300 font-bold',
    bgActive: 'bg-red-50',
    borderActive: 'border-red-400',
    defaultSubReasons: [
      'Pembuangan Adonan / WIP Awal saat Pemanasan Mesin (Warm-up Scrap)',
      'Flushing / Pembilasan Sisa Air Saluran Pipa Line Produksi',
      'Penstabilan Parameter Berat pada 10 Menit Pertama Awal Shift',
      'Bahan Baku Awal Tidak Standar Suhu Operasional',
      'Adonan Pertama Ditolak QC Sebelum Mencapai Steady State'
    ]
  },
  {
    key: 'OTHER_PLANNED',
    number: 7,
    title: 'Downtime Terencana / Operasional',
    subtitle: 'Planned Maintenance, Break & Sanitation',
    lossType: 'PLANNED',
    lossTypeBadge: 'Planned Stop',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 font-bold',
    bgActive: 'bg-slate-100',
    borderActive: 'border-slate-400',
    defaultSubReasons: [
      'Waktu Istirahat Shift & Pergantian Regu Kerja',
      'Pembersihan Harian Rutin / Sanitasi Shift',
      'Briefing Operator & Tool Box Meeting K3 Pabrik',
      'Preventive Maintenance Terjadwal dari Tim Maintenance',
      'Instruksi Manajemen / Perubahan Rencana Produksi'
    ]
  }
];

export const SixBigLossesModal: React.FC<SixBigLossesModalProps> = ({
  isOpen,
  onClose,
  skuId,
  skuName,
  skuCode,
  startedAt,
  cartonsProducedDuringRun = 0,
  onConfirmStop,
  showToast
}) => {
  const currentShift = getCurrentShift();
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<SixBigLossCategory>('EQUIPMENT_FAILURE');
  const [selectedSubReason, setSelectedSubReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<string>('15');
  const [shiftNum, setShiftNum] = useState<ShiftNumber>(currentShift.shift);
  const [operatorName, setOperatorName] = useState<string>('Operator Line Produksi');
  const [technicianName, setTechnicianName] = useState<string>('');
  const [actionTaken, setActionTaken] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  if (!isOpen) return null;

  const currentCategoryMeta = LOSS_CATEGORIES.find(c => c.key === selectedCategoryKey) || LOSS_CATEGORIES[0];

  const handleSelectCategory = (cat: LossCategoryMeta) => {
    setSelectedCategoryKey(cat.key);
    setSelectedSubReason(cat.defaultSubReasons[0] || '');
    setCustomReason('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dur = parseInt(durationMinutes, 10);
    if (isNaN(dur) || dur < 0) {
      showToast('Harap masukkan durasi downtime valid (menit)', true);
      return;
    }

    const finalReason = customReason.trim()
      ? customReason.trim()
      : selectedSubReason || currentCategoryMeta.title;

    const stopTime = new Date().toISOString();
    const startTime = startedAt || new Date(Date.now() - dur * 60000).toISOString();

    onConfirmStop({
      skuId,
      skuName,
      skuCode,
      shift: shiftNum,
      startedAt: startTime,
      stoppedAt: stopTime,
      durationMinutes: dur,
      category: currentCategoryMeta.key,
      categoryLabel: currentCategoryMeta.title,
      lossType: currentCategoryMeta.lossType,
      reasonTitle: finalReason,
      subReason: selectedSubReason || undefined,
      actionTaken: actionTaken.trim() || undefined,
      operatorName: operatorName.trim() || undefined,
      technicianName: technicianName.trim() || undefined,
      notes: notes.trim() || undefined,
      cartonsProducedDuringRun
    });

    showToast(`Produksi distop: [${currentCategoryMeta.title}] tercatat ke database Six Big Losses TPM`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl shadow-xl overflow-hidden my-4">
        {/* Header Bar */}
        <div className="bg-rose-50 p-5 sm:p-6 border-b border-rose-200 flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 border border-rose-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base sm:text-lg text-slate-900">
                  Stop Produksi SKU — Klasifikasi Six Big Losses
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-rose-100 text-rose-800 font-mono font-bold border border-rose-200">
                  TPM Standard
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Menghentikan proses produksi <strong className="text-slate-900 font-bold">{skuName}</strong>. Wajib memilih alasan berhenti sesuai format 6 Kerugian Utama TPM untuk audit OEE pabrik.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 transition shadow-xs"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto no-scrollbar">
          {/* Active SKU & Run Status Info */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                SKU yang Sedang Berjalan:
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="font-bold text-slate-900 text-sm">{skuName}</span>
                {skuCode && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-950 font-bold border border-sky-300">
                    {skuCode}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3 text-right">
              <div>
                <span className="text-[10px] text-slate-600 font-medium block">Karton Selesai Run Ini:</span>
                <span className="font-mono font-extrabold text-sky-900 text-sm">
                  {cartonsProducedDuringRun.toLocaleString()} ktn
                </span>
              </div>
              <div className="h-7 w-px bg-slate-300" />
              <div>
                <span className="text-[10px] text-slate-600 font-medium block">Shift Berjalan:</span>
                <span className="font-mono font-extrabold text-amber-800 text-sm">
                  Shift {shiftNum}
                </span>
              </div>
            </div>
          </div>

          {/* Six Big Losses Category Selector Grid */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Pilih Kategori Alasan Stop (Six Big Losses TPM):</span>
              </label>
              <span className="text-[10px] text-slate-500 font-mono font-semibold">
                Pilih 1 dari 6 Kategori Standar
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {LOSS_CATEGORIES.map(cat => {
                const isSelected = selectedCategoryKey === cat.key;
                return (
                  <div
                    key={cat.key}
                    onClick={() => handleSelectCategory(cat)}
                    className={`p-3 rounded-2xl border cursor-pointer transition flex flex-col justify-between shadow-xs ${
                      isSelected
                        ? `${cat.bgActive} ${cat.borderActive} ring-2 ring-sky-500/40`
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          #{cat.number}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cat.badgeClass}`}>
                          {cat.lossTypeBadge}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs">{cat.title}</h4>
                      <p className="text-[10px] text-slate-600 mt-0.5">{cat.subtitle}</p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-medium">
                        {cat.defaultSubReasons.length} opsi sub-alasan
                      </span>
                      {isSelected ? (
                        <span className="font-bold text-sky-800 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-sky-700" />
                          <span>Dipilih</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Klik untuk pilih</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sub-Reason Dropdown & Custom Reason */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3 shadow-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-800 mb-1">
                Alasan Spesifik untuk [{currentCategoryMeta.title}]:
              </label>
              <select
                value={selectedSubReason}
                onChange={(e) => {
                  setSelectedSubReason(e.target.value);
                  if (e.target.value !== 'CUSTOM') {
                    setCustomReason('');
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 shadow-xs"
              >
                {currentCategoryMeta.defaultSubReasons.map((sub, idx) => (
                  <option key={idx} value={sub}>
                    {sub}
                  </option>
                ))}
                <option value="CUSTOM">➕ Alasan Kustom Lainnya (Ketik Manual)...</option>
              </select>
            </div>

            {selectedSubReason === 'CUSTOM' && (
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  Ketik Alasan Spesifik Baru:
                </label>
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Deskripsikan alasan terhentinya mesin..."
                  required
                  className="w-full bg-white border border-amber-300 rounded-xl px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 shadow-xs font-medium"
                />
              </div>
            )}
          </div>

          {/* Downtime Details: Durasi, Shift, Operator & Teknisi */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Estimasi Durasi Stop (Menit):
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:border-sky-500 shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Shift Kerja:
              </label>
              <select
                value={shiftNum}
                onChange={(e) => setShiftNum(parseInt(e.target.value, 10) as ShiftNumber)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 shadow-xs"
              >
                <option value={1}>Shift 1 (07:00 – 15:00)</option>
                <option value={2}>Shift 2 (15:00 – 23:00)</option>
                <option value={3}>Shift 3 (23:00 – 07:00)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Operator Penanggung Jawab:
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  required
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 shadow-xs"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Teknisi / Mekanik Maintenance (Opsional):
              </label>
              <div className="relative">
                <Wrench className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={technicianName}
                  onChange={(e) => setTechnicianName(e.target.value)}
                  placeholder="e.g. Suwandi (Mekanik Line 1)"
                  className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 shadow-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Tindakan Perbaikan / Koreksi yang Dilakukan:
              </label>
              <input
                type="text"
                value={actionTaken}
                onChange={(e) => setActionTaken(e.target.value)}
                placeholder="e.g. Reset thermal overload motor, flushing pipa"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Catatan Tambahan untuk Rekap OEE Shift:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan kendala, no. work order tiket perbaikan, atau instruksi lanjutan..."
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-medium focus:outline-none focus:border-sky-500 resize-none shadow-xs"
            />
          </div>

          {/* Action Footer */}
          <div className="flex items-center space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-2xl font-bold transition shadow-xs"
            >
              Batal (Lanjutkan Produksi)
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-bold shadow-xs border border-rose-600 transition active:scale-95 flex items-center justify-center space-x-2"
            >
              <ShieldAlert className="w-4 h-4 text-white" />
              <span className="text-white">Konfirmasi Stop & Catat Six Big Losses</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
