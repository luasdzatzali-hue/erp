import React, { useState, useEffect } from 'react';
import {
  X,
  MessageCircle,
  Copy,
  Check,
  Phone,
  BookmarkPlus,
  Trash2,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { ProductionStopLog, ShiftNumber } from '../types';
import {
  buildWhatsAppUrl,
  formatSblShiftRecapMessage,
  formatSblSingleReportMessage,
  formatStopCategoryTitle,
  loadWhatsAppRecipients,
  normalizeWhatsAppPhone,
  removeWhatsAppRecipient,
  saveWhatsAppRecipient,
  WhatsAppRecipient
} from '../utils/whatsappReport';

interface WhatsAppSblModalProps {
  isOpen: boolean;
  onClose: () => void;
  stopLog?: Omit<ProductionStopLog, 'id'> | ProductionStopLog | null;
  recapLogs?: ProductionStopLog[];
  recapDate?: string;
  recapShift?: ShiftNumber;
  initialPhone?: string;
  showToast: (msg: string, isError?: boolean) => void;
}

export const WhatsAppSblModal: React.FC<WhatsAppSblModalProps> = ({
  isOpen,
  onClose,
  stopLog,
  recapLogs,
  recapDate,
  recapShift,
  initialPhone = '',
  showToast
}) => {
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [contactLabel, setContactLabel] = useState('');
  const [messageText, setMessageText] = useState('');
  const [recipients, setRecipients] = useState<WhatsAppRecipient[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRecipients(loadWhatsAppRecipients());
    setPhoneInput(initialPhone || '');
    setCopied(false);

    if (stopLog) {
      setMessageText(formatSblSingleReportMessage(stopLog));
    } else if (recapLogs && recapLogs.length > 0 && recapDate && recapShift) {
      setMessageText(formatSblShiftRecapMessage(recapLogs, recapDate, recapShift));
    } else {
      setMessageText('');
    }
  }, [isOpen, stopLog, recapLogs, recapDate, recapShift, initialPhone]);

  if (!isOpen) return null;

  const waUrl = buildWhatsAppUrl(messageText, phoneInput);
  const normalizedPreview = normalizeWhatsAppPhone(phoneInput);

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      showToast('Teks laporan SBL berhasil disalin ke clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Tidak dapat menyalin otomatis, silakan salin manual dari kotak teks', true);
    }
  };

  const handleSaveContact = () => {
    if (!normalizeWhatsAppPhone(phoneInput)) {
      showToast('Masukkan nomor WhatsApp valid terlebih dahulu', true);
      return;
    }
    const updated = saveWhatsAppRecipient(contactLabel || 'PIC / Grup Maintenance', phoneInput);
    setRecipients(updated);
    setContactLabel('');
    showToast('Kontak WhatsApp tujuan disimpan');
  };

  const handleDeleteContact = (id: string) => {
    setRecipients(removeWhatsAppRecipient(id));
  };

  const headerTitle = stopLog
    ? `Kirim Laporan SBL: ${formatStopCategoryTitle(stopLog.category, stopLog.categoryLabel)}`
    : `Kirim Rekap SBL Shift ${recapShift || ''} via WhatsApp`;

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-surface border border-border-strong rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-4 text-ink-primary">
        {/* Header */}
        <div className="bg-tint-emerald border-b border-emerald-500/30 p-4 sm:p-5 flex items-start justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-ink-emerald">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-ink-primary">{headerTitle}</h3>
              <p className="text-[11px] text-ink-emerald mt-0.5">
                Pelaporan cepat WhatsApp untuk kategori Kerusakan Mesin/Breakdown, Setup &amp; Changeover, serta Downtime Terencana.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-elevated hover:bg-accent text-ink-secondary transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Summary strip for single stop */}
          {stopLog && (
            <div className="bg-canvas border border-border-subtle rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-ink-rose shrink-0" />
                <div>
                  <span className="font-bold text-ink-primary block">
                    {stopLog.lineName ? `${stopLog.lineName} · ` : ''}
                    {stopLog.skuName}
                  </span>
                  <span className="text-[11px] text-ink-secondary">{stopLog.reasonTitle}</span>
                </div>
              </div>
              <span className="text-[11px] font-mono font-bold text-ink-rose bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-lg">
                Est. {stopLog.estimatedRepairMinutes ?? stopLog.durationMinutes} mnt · Shift {stopLog.shift}
              </span>
            </div>
          )}

          {/* Recipient Number & Saved Contacts */}
          <div className="bg-canvas border border-border-subtle rounded-xl p-3.5 space-y-2.5">
            <label className="block text-[11px] font-bold text-ink-secondary">
              Nomor WhatsApp Tujuan (Opsional — kosongkan untuk memilih kontak/grup di WhatsApp):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-5 relative">
                <Phone className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={e => setPhoneInput(e.target.value)}
                  placeholder="0812xxxxxxxx / 62812..."
                  className="w-full bg-surface border border-border-strong rounded-xl pl-8 pr-3 py-2 text-xs text-ink-primary font-mono placeholder:text-ink-muted focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={contactLabel}
                  onChange={e => setContactLabel(e.target.value)}
                  placeholder="Nama/Jabatan (untuk simpan)"
                  className="w-full bg-surface border border-border-strong rounded-xl px-3 py-2 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="sm:col-span-3">
                <button
                  type="button"
                  onClick={handleSaveContact}
                  className="w-full h-full py-2 px-3 bg-elevated hover:bg-accent text-ink-emerald border border-border-strong rounded-xl font-semibold flex items-center justify-center space-x-1.5 transition"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Simpan</span>
                </button>
              </div>
            </div>

            {normalizedPreview && (
              <p className="text-[10px] font-mono text-ink-emerald">
                Tujuan terformat: +{normalizedPreview}
              </p>
            )}

            {recipients.length > 0 && (
              <div className="pt-1.5 border-t border-border-subtle space-y-1.5">
                <span className="text-[10px] text-ink-secondary block">Kontak Tersimpan:</span>
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map(r => {
                    const isActive = normalizeWhatsAppPhone(phoneInput) === r.phone;
                    return (
                      <div
                        key={r.id}
                        className={`inline-flex items-center rounded-lg border text-[11px] overflow-hidden ${
                          isActive
                            ? 'bg-emerald-600/20 border-emerald-500/50 text-ink-emerald'
                            : 'bg-surface border-border-strong text-ink-secondary'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setPhoneInput(r.phone)}
                          className="px-2 py-1 hover:bg-elevated transition font-medium"
                        >
                          {r.label} <span className="font-mono text-[10px] opacity-80">({r.phone})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(r.id)}
                          title="Hapus kontak"
                          className="px-1.5 py-1 text-ink-muted hover:text-ink-rose transition border-l border-border-subtle"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Editable WhatsApp Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-ink-secondary">
                Pratinjau Pesan Laporan WhatsApp (dapat diedit sebelum kirim):
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="px-2.5 py-1 bg-elevated hover:bg-accent border border-border-strong rounded-lg text-[11px] font-semibold text-brand flex items-center space-x-1 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-ink-emerald" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin Teks'}</span>
              </button>
            </div>
            <textarea
              rows={10}
              value={messageText}
              onChange={e => setMessageText(e.target.value)}
              className="w-full bg-canvas border border-border-subtle rounded-xl p-3 text-xs font-mono text-ink-primary leading-relaxed focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="sm:w-1/3 py-2.5 px-4 bg-elevated hover:bg-accent text-ink-primary border border-border-strong rounded-xl font-semibold transition"
            >
              Tutup
            </button>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                showToast('Membuka aplikasi WhatsApp dengan format laporan SBL...');
              }}
              className="sm:w-2/3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Kirim Laporan via WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
