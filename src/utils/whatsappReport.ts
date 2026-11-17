import { ProductionStopLog, ShiftNumber, SixBigLossCategory } from '../types';
import { SHIFTS_CONFIG } from './shifts';

/**
 * Kategori Six Big Losses yang mendukung pengiriman laporan via WhatsApp:
 * 1. Kerusakan Mesin / Breakdown (EQUIPMENT_FAILURE)
 * 2. Penyetelan & Changeover (SETUP_ADJUSTMENT)
 * 3. Downtime Terencana / Operasional (OTHER_PLANNED)
 */
export const WHATSAPP_ELIGIBLE_SBL_CATEGORIES: SixBigLossCategory[] = [
  'EQUIPMENT_FAILURE',
  'SETUP_ADJUSTMENT',
  'OTHER_PLANNED'
];

export function isWhatsAppEligibleSblCategory(category?: SixBigLossCategory): boolean {
  if (!category) return false;
  return WHATSAPP_ELIGIBLE_SBL_CATEGORIES.includes(category);
}

export interface WhatsAppRecipient {
  id: string;
  label: string;
  phone: string;
}

const WA_RECIPIENTS_STORAGE_KEY = 'prodtrack_wa_recipients_v1';

export function loadWhatsAppRecipients(): WhatsAppRecipient[] {
  try {
    const raw = localStorage.getItem(WA_RECIPIENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWhatsAppRecipient(label: string, phone: string): WhatsAppRecipient[] {
  const cleanPhone = normalizeWhatsAppPhone(phone);
  const cleanLabel = label.trim() || cleanPhone;
  if (!cleanPhone) return loadWhatsAppRecipients();

  const existing = loadWhatsAppRecipients().filter(
    r => normalizeWhatsAppPhone(r.phone) !== cleanPhone
  );
  const next: WhatsAppRecipient[] = [
    {
      id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: cleanLabel,
      phone: cleanPhone
    },
    ...existing
  ].slice(0, 12);

  try {
    localStorage.setItem(WA_RECIPIENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

export function removeWhatsAppRecipient(id: string): WhatsAppRecipient[] {
  const next = loadWhatsAppRecipients().filter(r => r.id !== id);
  try {
    localStorage.setItem(WA_RECIPIENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
  return next;
}

/**
 * Normalisasi nomor telepon ke format internasional tanpa '+' (contoh: 0812xxx -> 62812xxx).
 */
export function normalizeWhatsAppPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function formatStopCategoryTitle(category: SixBigLossCategory, fallbackLabel?: string): string {
  switch (category) {
    case 'EQUIPMENT_FAILURE':
      return 'Kerusakan Mesin / Breakdown';
    case 'SETUP_ADJUSTMENT':
      return 'Penyetelan & Changeover';
    case 'OTHER_PLANNED':
      return 'Downtime Terencana / Operasional';
    default:
      return fallbackLabel || category;
  }
}

export function formatSblSingleReportMessage(
  log: Omit<ProductionStopLog, 'id'> | ProductionStopLog
): string {
  const stopDate = new Date(log.stoppedAt);
  const dateLabel = isNaN(stopDate.getTime())
    ? log.stoppedAt.slice(0, 10)
    : stopDate.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
  const timeLabel = isNaN(stopDate.getTime())
    ? log.stoppedAt
    : stopDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const shiftMeta = SHIFTS_CONFIG[log.shift];
  const categoryTitle = formatStopCategoryTitle(log.category, log.categoryLabel);
  const estMin = log.estimatedRepairMinutes ?? log.durationMinutes;

  const lines: string[] = [
    '*LAPORAN STOP PRODUKSI (SBL - TPM)*',
    `Kategori: *${categoryTitle}*`,
    '--------------------------------',
    `Tanggal : ${dateLabel}`,
    `Jam Stop: ${timeLabel} WIB`,
    `Shift   : Shift ${log.shift}${shiftMeta ? ` (${shiftMeta.timeRange})` : ''}`,
    `Line    : ${log.lineName || '-'}`,
    `Produk  : ${log.skuName}${log.skuCode ? ` (${log.skuCode})` : ''}`,
    `Output  : ${(log.cartonsProducedDuringRun || 0).toLocaleString('id-ID')} karton`,
    '--------------------------------',
    `Masalah : ${log.reasonTitle}`,
  ];

  if (log.subReason && log.subReason !== log.reasonTitle) {
    lines.push(`Detail  : ${log.subReason}`);
  }

  lines.push(`Est. Perbaikan: ${estMin} menit`);
  if (log.resumedAt) {
    lines.push(
      `Aktual Stop   : ${log.actualRepairMinutes ?? log.durationMinutes} menit (Sudah Lanjut Produksi)`
    );
  }

  if (log.operatorName) {
    lines.push(`Operator: ${log.operatorName}`);
  }
  if (log.technicianName) {
    lines.push(`Teknisi : ${log.technicianName}`);
  }
  if (log.actionTaken) {
    lines.push(`Tindakan: ${log.actionTaken}`);
  }
  if (log.notes) {
    lines.push(`Catatan : ${log.notes}`);
  }

  lines.push('--------------------------------');
  lines.push('_Dikirim dari ProdTrack MES_');

  return lines.join('\n');
}

export function formatSblShiftRecapMessage(
  logs: ProductionStopLog[],
  dateStr: string,
  shift: ShiftNumber
): string {
  const eligible = logs.filter(l => isWhatsAppEligibleSblCategory(l.category));
  const shiftMeta = SHIFTS_CONFIG[shift];
  const totalMinutes = eligible.reduce((sum, l) => sum + l.durationMinutes, 0);

  const lines: string[] = [
    '*REKAP LAPORAN SBL PRODUKSI (WHATSAPP)*',
    `Tanggal: ${dateStr}`,
    `Shift  : Shift ${shift}${shiftMeta ? ` (${shiftMeta.timeRange})` : ''}`,
    `Total Kejadian: ${eligible.length} stop (${totalMinutes} menit)`,
    'Kategori: Breakdown, Setup/Changeover, Downtime Terencana',
    '================================'
  ];

  eligible.forEach((log, idx) => {
    const t = new Date(log.stoppedAt);
    const jam = isNaN(t.getTime())
      ? log.stoppedAt
      : t.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    lines.push(
      `${idx + 1}. *[${formatStopCategoryTitle(log.category, log.categoryLabel)}]*`,
      `   Line/SKU: ${log.lineName || '-'} · ${log.skuName}`,
      `   Jam/Dur : ${jam} WIB (${log.durationMinutes} mnt)`,
      `   Masalah : ${log.reasonTitle}`
    );
    if (log.actionTaken || log.technicianName) {
      lines.push(
        `   PIC/Akt : ${[log.technicianName, log.actionTaken].filter(Boolean).join(' - ')}`
      );
    }
  });

  lines.push('================================');
  lines.push('_Dikirim dari ProdTrack MES_');
  return lines.join('\n');
}

export function buildWhatsAppUrl(message: string, phone?: string): string {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message);
  if (normalizedPhone) {
    return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}
