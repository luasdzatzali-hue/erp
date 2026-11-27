import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle2,
  User,
  ShieldAlert,
  MessageCircle,
  Phone
} from 'lucide-react';
import {
  SixBigLossCategory,
  ProductionStopLog,
  ShiftNumber
} from '../types';
import { getCurrentShift } from '../utils/shifts';
import { isWhatsAppEligibleSblCategory, loadWhatsAppRecipients } from '../utils/whatsappReport';
import {
  SIX_BIG_LOSS_CATEGORIES,
  SixBigLossCategoryMeta,
  getSixBigLossCategoryMeta,
  buildProductionStopLogPayload
} from '../utils/oeeEngine';

interface SixBigLossesModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineId?: string;
  lineName?: string;
  skuId: string;
  skuName: string;
  skuCode?: string;
  startedAt?: string;
  cartonsProducedDuringRun?: number;
  onConfirmStop: (
    stopData: Omit<ProductionStopLog, 'id'>,
    options?: { sendWhatsApp?: boolean; whatsappPhone?: string }
  ) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const SixBigLossesModal: React.FC<SixBigLossesModalProps> = ({
  isOpen,
  onClose,
  lineId,
  lineName,
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
  const [selectedSubReason, setSelectedSubReason] = useState<string>(
    SIX_BIG_LOSS_CATEGORIES[0].defaultSubReasons[0] || ''
  );
  const [customReason, setCustomReason] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<string>('20');
  const [shiftNum, setShiftNum] = useState<ShiftNumber>(currentShift.shift);
  const [operatorName, setOperatorName] = useState<string>('Operator Line Produksi');
  const [technicianName, setTechnicianName] = useState<string>('');
  const [actionTaken, setActionTaken] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [sendWhatsAppReport, setSendWhatsAppReport] = useState<boolean>(true);
  const [whatsappPhone, setWhatsappPhone] = useState<string>('');
  const savedWaRecipients = loadWhatsAppRecipients();

  if (!isOpen) return null;

  const currentCategoryMeta = getSixBigLossCategoryMeta(selectedCategoryKey);
  const isWaEligible = isWhatsAppEligibleSblCategory(currentCategoryMeta.key);

  const handleSelectCategory = (cat: SixBigLossCategoryMeta) => {
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

    const stopPayload = buildProductionStopLogPayload({
      lineId,
      lineName,
      skuId,
      skuName,
      skuCode,
      shift: shiftNum,
      startedAt,
      durationMinutes: dur,
      category: currentCategoryMeta.key,
      selectedSubReason,
      customReason,
      actionTaken,
      operatorName,
      technicianName,
      notes,
      cartonsProducedDuringRun
    });

    onConfirmStop(stopPayload, {
      sendWhatsApp: isWaEligible && sendWhatsAppReport,
      whatsappPhone: whatsappPhone.trim() || undefined
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
                {lineName ? `${lineName} · SKU yang Sedang Berjalan:` : 'SKU yang Sedang Berjalan:'}
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                {lineName && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold">
                    {lineName}
                  </span>
                )}
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
                Pilih 1 dari {SIX_BIG_LOSS_CATEGORIES.length} Kategori
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SIX_BIG_LOSS_CATEGORIES.map(cat => {
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
                      <div className="flex items-center justify-between mb-1 gap-1.5">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          #{cat.number}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {isWhatsAppEligibleSblCategory(cat.key) && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-emerald-100 text-emerald-800 border-emerald-300 inline-flex items-center space-x-0.5">
                              <MessageCircle className="w-2.5 h-2.5" />
                              <span>Kirim WA</span>
                            </span>
                          )}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cat.badgeClass}`}>
                            {cat.lossTypeBadge}
                          </span>
                        </div>
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
                Estimasi Waktu Perbaikan (Menit):
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
              <div className="flex flex-wrap gap-1 mt-1.5">
                {[10, 15, 20, 30, 60].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDurationMinutes(String(preset))}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition ${
                      durationMinutes === String(preset)
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {preset}m
                  </button>
                ))}
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

          {/* WhatsApp Report Option for Breakdown, Setup/Changeover, & Planned Downtime */}
          {isWaEligible && (
            <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 space-y-2.5 shadow-xs">
              <label className="flex items-start space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsAppReport}
                  onChange={e => setSendWhatsAppReport(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <span className="font-bold text-emerald-950 flex items-center space-x-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Siapkan Laporan SBL untuk Dikirim via WhatsApp</span>
                  </span>
                  <span className="text-[11px] text-emerald-800 block mt-0.5">
                    Kategori <strong>{currentCategoryMeta.title}</strong> mendukung pelaporan langsung ke WhatsApp Teknisi / Supervisor setelah stop dikonfirmasi.
                  </span>
                </div>
              </label>

              {sendWhatsAppReport && (
                <div className="pl-6 space-y-2">
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-emerald-700 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={whatsappPhone}
                      onChange={e => setWhatsappPhone(e.target.value)}
                      placeholder="No. WhatsApp tujuan (opsional, misal 0812xxxxxxxx)"
                      className="w-full bg-white border border-emerald-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  {savedWaRecipients.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {savedWaRecipients.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setWhatsappPhone(r.phone)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border transition ${
                            whatsappPhone === r.phone
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
