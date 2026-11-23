import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import { AppState, Material, RequestCartItem, StorageLocation } from '../types';
import { ceilSafe, detectMaterialPackageConfig, hasDecimalPart } from './orderRounding';

export type RequestSlipSatMode = 'kg' | 'zak_or_kg' | 'batch';

export const REQUEST_SLIP_ROWS_PER_PAGE = 10;

export interface RequestSlipFormOptions {
  supplier?: string;
  wipId?: string;
  wipName?: string;
  factoryGroupName?: string;
  docCode?: string;
  department?: string;
  kepadaWarehouse: string;
  tujuanPengiriman: string;
  permintaanShift: string;
  bonNumber: string;
  tanggal: string; // DD-MM-YYYY
  namaPengirim: string;
  namaPenerima: string;
  dibuatOleh: string;
  menyetujui: string;
  keterangan: string;
  satMode: RequestSlipSatMode;
  includeMaterialCodeInSap: boolean;
  materialsCatalog?: Material[];
  customSapCodes?: Record<string, string>;
  requestNumbers?: string[];
  qrDeepLinkUrl?: string;
}

export interface RequestSlipDeepLinkItem {
  code: string;
  qty: string;
  sat: string;
}

export interface RequestSlipDeepLinkData {
  bonNumber: string;
  supplier: string;
  wipName: string;
  tanggal: string;
  pageInfo?: string;
  requestNumbers: string[];
  items: RequestSlipDeepLinkItem[];
  rawUrl: string;
}

export function formatSlipQuantity(val: number): string {
  if (!Number.isFinite(val)) return '';
  if (Math.abs(val - Math.round(val)) < 1e-6) {
    return String(Math.round(val));
  }
  return parseFloat(val.toFixed(2)).toString();
}

export function formatIndonesianDateDash(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

export function resolveBomMaterialCode(
  item: Pick<RequestCartItem, 'id' | 'materialId' | 'materialCode'>,
  materialsCatalog?: Material[],
  customSapCodes?: Record<string, string>
): string {
  if (customSapCodes && customSapCodes[item.id] !== undefined) {
    return customSapCodes[item.id].trim();
  }
  const bomMat = materialsCatalog?.find(
    m => m.id === item.materialId || (item.materialCode && m.code === item.materialCode)
  );
  return (bomMat?.code || item.materialCode || '').trim();
}

export function resolveCartItemSlipRow(
  item: RequestCartItem,
  satMode: RequestSlipSatMode,
  includeMaterialCodeInSap: boolean,
  materialsCatalog?: Material[],
  customSapCodes?: Record<string, string>
): {
  kodeSap: string;
  kodeBatch: string;
  jenisBarang: string;
  sat: string;
  jumlahDiminta: string;
} {
  const bomMat = materialsCatalog?.find(
    m => m.id === item.materialId || (item.materialCode && m.code === item.materialCode)
  );
  const pkgCfg = detectMaterialPackageConfig(bomMat);

  let sat = 'kg';
  let jumlahDiminta = formatSlipQuantity(item.qty);

  if (satMode === 'batch') {
    sat = 'batch';
    const roundedBatch = hasDecimalPart(item.batch) ? ceilSafe(item.batch) : item.batch;
    jumlahDiminta = formatSlipQuantity(roundedBatch);
  } else if (satMode === 'zak_or_kg') {
    if (item.packageCount && item.packageCount > 0 && item.packageSizeKg) {
      sat = pkgCfg.shortUnit || 'zak';
      jumlahDiminta = formatSlipQuantity(ceilSafe(item.packageCount));
    } else if (pkgCfg.hasDiscretePackaging && pkgCfg.defaultPackSizeKg > 0 && item.qty > 0) {
      const packs = Math.max(1, ceilSafe(item.qty / pkgCfg.defaultPackSizeKg));
      sat = pkgCfg.shortUnit || 'kemasan';
      jumlahDiminta = formatSlipQuantity(packs);
    } else {
      sat = 'kg';
      jumlahDiminta = formatSlipQuantity(item.qty);
    }
  }

  const autoSapCode = resolveBomMaterialCode(item, materialsCatalog, customSapCodes);

  return {
    kodeSap: includeMaterialCodeInSap ? autoSapCode : '',
    kodeBatch: '',
    jenisBarang: item.materialName,
    sat,
    jumlahDiminta
  };
}

/**
 * Builds a compact deep-link URL inside the application linking directly
 * to the request details view in PermintaanView (#tab=permintaan&bon=...).
 */
export function buildRequestSlipQrUrl(
  items: RequestCartItem[],
  options: Pick<
    RequestSlipFormOptions,
    | 'bonNumber'
    | 'supplier'
    | 'wipName'
    | 'tanggal'
    | 'satMode'
    | 'includeMaterialCodeInSap'
    | 'materialsCatalog'
    | 'customSapCodes'
    | 'requestNumbers'
  > & { pageNumber?: number; totalPages?: number }
): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://prodtrack.local';
  const pathname = typeof window !== 'undefined' ? window.location.pathname || '/' : '/';

  const params = new URLSearchParams();
  params.set('tab', 'permintaan');
  if (options.bonNumber) params.set('bon', options.bonNumber.trim());
  const effectiveSupplier = options.supplier || items[0]?.supplier || 'GDRM';
  params.set('sup', effectiveSupplier);
  const effectiveWip = options.wipName || items[0]?.wipName || '';
  if (effectiveWip) params.set('wip', effectiveWip.slice(0, 40));
  if (options.tanggal) params.set('tgl', options.tanggal);
  if (options.totalPages && options.totalPages > 1 && options.pageNumber) {
    params.set('pg', `${options.pageNumber}/${options.totalPages}`);
  }

  if (options.requestNumbers && options.requestNumbers.length > 0) {
    params.set('req', options.requestNumbers.slice(0, 10).join(','));
  }

  // Encode up to 10 items per sheet so QR remains compact and reliably scannable
  const compactItems = items
    .slice(0, REQUEST_SLIP_ROWS_PER_PAGE)
    .map(item => {
      const row = resolveCartItemSlipRow(
        item,
        options.satMode,
        true,
        options.materialsCatalog,
        options.customSapCodes
      );
      const identifier = (row.kodeSap || item.materialName)
        .replace(/[~|]/g, ' ')
        .trim()
        .slice(0, 28);
      return `${identifier}~${row.jumlahDiminta}~${row.sat}`;
    })
    .join('|');

  if (compactItems) {
    params.set('items', compactItems);
  }

  return `${origin}${pathname}#${params.toString()}`;
}

export function parseRequestSlipQrHash(hash: string): RequestSlipDeepLinkData | null {
  if (!hash || !hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const tab = params.get('tab');
  const bon = params.get('bon');
  const reqParam = params.get('req');
  if (tab !== 'permintaan' || (!bon && !reqParam)) {
    return null;
  }

  const rawItems = params.get('items') || '';
  const items: RequestSlipDeepLinkItem[] = rawItems
    ? rawItems
        .split('|')
        .filter(Boolean)
        .map(chunk => {
          const [code = '', qty = '', sat = 'kg'] = chunk.split('~');
          return { code, qty, sat };
        })
    : [];

  return {
    bonNumber: bon || reqParam || 'SLIP-QR',
    supplier: params.get('sup') || '',
    wipName: params.get('wip') || '',
    tanggal: params.get('tgl') || '',
    pageInfo: params.get('pg') || undefined,
    requestNumbers: reqParam
      ? reqParam
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : [],
    items,
    rawUrl: typeof window !== 'undefined' ? window.location.href : hash
  };
}

/**
 * Generates an A4 Landscape PDF formatted identically to the
 * "BON PERMINTAAN RM & PM" factory paper form (10 rows per sheet;
 * overflows automatically to continuation sheets when >10 materials,
 * 5-stage delivery + WH/Prod TTD columns, Total yang dikirim,
 * SAP footnote, Dibuat/Menyetujui signatures, QR deep-link, and Keterangan box).
 */
export async function generateMaterialRequestSlipPdf(
  items: RequestCartItem[],
  options: RequestSlipFormOptions
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const ROWS_PER_PAGE = REQUEST_SLIP_ROWS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(items.length / ROWS_PER_PAGE));

  const marginX = 10;
  const usableW = 277; // 297 - 20

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const pageItems = items.slice(pageIdx * ROWS_PER_PAGE, (pageIdx + 1) * ROWS_PER_PAGE);

    const pageQrUrl =
      totalPages === 1 && options.qrDeepLinkUrl
        ? options.qrDeepLinkUrl
        : buildRequestSlipQrUrl(pageItems, {
            bonNumber: options.bonNumber,
            supplier: options.supplier,
            wipName: options.wipName,
            tanggal: options.tanggal,
            satMode: options.satMode,
            includeMaterialCodeInSap: options.includeMaterialCodeInSap,
            materialsCatalog: options.materialsCatalog,
            customSapCodes: options.customSapCodes,
            requestNumbers: options.requestNumbers,
            pageNumber: pageIdx + 1,
            totalPages
          });

    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(pageQrUrl, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.warn('QR image generation failed for PDF slip:', err);
    }

    doc.setDrawColor(15, 23, 42);
    doc.setTextColor(15, 23, 42);
    doc.setLineWidth(0.35);

    // ------------------------------------------------------------------
    // 1. HEADER BOX (y = 10..31, h = 21mm)
    // ------------------------------------------------------------------
    const headerY = 10;
    const headerH = 21;
    const leftBoxW = 46;
    const rightBoxW = 62;
    const centerBoxW = usableW - leftBoxW - rightBoxW; // 169mm

    doc.rect(marginX, headerY, leftBoxW, headerH);
    doc.rect(marginX + leftBoxW, headerY, centerBoxW, headerH);
    doc.rect(marginX + leftBoxW + centerBoxW, headerY, rightBoxW, headerH);

    // Left box: Factory / Group brand
    const groupText = (options.factoryGroupName || 'PRODTRACK').trim();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const groupLines = doc.splitTextToSize(groupText.toUpperCase(), leftBoxW - 6).slice(0, 2);
    doc.text(groupLines, marginX + leftBoxW / 2, headerY + 9, { align: 'center' });

    doc.setFontSize(7.5);
    doc.text('GROUP', marginX + 3.5, headerY + headerH - 2.5);

    // Center box: Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14.5);
    doc.text('BON PERMINTAAN RM & PM', marginX + leftBoxW + centerBoxW / 2, headerY + 12.2, {
      align: 'center'
    });
    if (totalPages > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text(
        `Lembar ${pageIdx + 1} dari ${totalPages}${pageIdx > 0 ? ' (Lanjutan)' : ''}`,
        marginX + leftBoxW + centerBoxW / 2,
        headerY + 17.5,
        { align: 'center' }
      );
    }

    // Right box: split into 2 rows
    const rightX = marginX + leftBoxW + centerBoxW;
    const halfRightH = headerH / 2;
    doc.line(rightX, headerY + halfRightH, rightX + rightBoxW, headerY + halfRightH);

    doc.setFont('times', 'normal');
    doc.setFontSize(6.8);
    doc.text(
      options.docCode || 'MAY PRC LLA WFR UTG WHRxx/09/001-08-4',
      rightX + rightBoxW / 2,
      headerY + 6.5,
      { align: 'center' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Departemen : ${options.department || 'Warehouse'}`,
      rightX + rightBoxW / 2,
      headerY + halfRightH + 6.5,
      { align: 'center' }
    );

    // ------------------------------------------------------------------
    // 2. METADATA BLOCK (y = 34..54)
    // ------------------------------------------------------------------
    const metaY = 34.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);

    const leftMetaRows: Array<[string, string]> = [
      ['Kepada Warehouse', options.kepadaWarehouse || ''],
      ['Tujuan Pengiriman', options.tujuanPengiriman || ''],
      ['Permintaan Shift', options.permintaanShift || '']
    ];
    leftMetaRows.forEach(([label, val], idx) => {
      const yPos = metaY + 4 + idx * 5.6;
      doc.setFont('helvetica', 'bold');
      doc.text(label, marginX, yPos);
      doc.text(':', marginX + 31, yPos);
      doc.setFont('helvetica', 'normal');
      const truncated = doc.splitTextToSize(val, 60)[0] || '';
      doc.text(truncated, marginX + 33.5, yPos);
    });

    const centerMetaX = marginX + 98;
    const bonDisplay =
      totalPages > 1
        ? `${options.bonNumber || ''} (${pageIdx + 1}/${totalPages})`
        : options.bonNumber || '';
    const centerMetaRows: Array<[string, string]> = [
      ['No', bonDisplay],
      ['Tanggal', options.tanggal || '']
    ];
    centerMetaRows.forEach(([label, val], idx) => {
      const yPos = metaY + 4 + idx * 5.6;
      doc.setFont('helvetica', 'bold');
      doc.text(label, centerMetaX, yPos);
      doc.text(':', centerMetaX + 15, yPos);
      doc.setFont('helvetica', 'normal');
      const truncated = doc.splitTextToSize(val, 55)[0] || '';
      doc.text(truncated, centerMetaX + 17.5, yPos);
    });

    const rightMetaX = marginX + 175;
    const rightMetaY = 33.5;
    const rightMetaW = usableW - 175; // 102mm
    const rightMetaLabelW = 28;
    const rightMetaRowH = 5;
    const rightMetaTotalH = rightMetaRowH * 4;

    doc.setLineWidth(0.28);
    doc.rect(rightMetaX, rightMetaY, rightMetaW, rightMetaTotalH);
    doc.line(
      rightMetaX + rightMetaLabelW,
      rightMetaY,
      rightMetaX + rightMetaLabelW,
      rightMetaY + rightMetaTotalH
    );
    for (let r = 1; r < 4; r++) {
      doc.line(
        rightMetaX,
        rightMetaY + r * rightMetaRowH,
        rightMetaX + rightMetaW,
        rightMetaY + r * rightMetaRowH
      );
    }

    const rightMetaCells = [
      { label: 'Nama Pengirim', val: options.namaPengirim || '' },
      { label: '', val: '' },
      { label: 'Nama Penerima', val: options.namaPenerima || '' },
      { label: '', val: '' }
    ];

    rightMetaCells.forEach((row, rIdx) => {
      const textY = rightMetaY + rIdx * rightMetaRowH + 3.6;
      if (row.label) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.text(row.label, rightMetaX + 2, textY);
      }
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.text(':', rightMetaX + rightMetaLabelW + 1.5, textY);
      if (row.val) {
        const fitted = doc.splitTextToSize(row.val, rightMetaW - rightMetaLabelW - 6)[0] || '';
        doc.text(fitted, rightMetaX + rightMetaLabelW + 4, textY);
      }
    });

    // ------------------------------------------------------------------
    // 3. MAIN 10-ROW TABLE (y = 57..147)
    // ------------------------------------------------------------------
    const tableY = 57;
    const levelH = 6; // 3 header levels => 18mm total header height
    const headerTotalH = levelH * 3; // 18mm -> ends at y = 75
    const rowH = 7.2; // 10 rows => 72mm -> ends at y = 147

    const colWidths = {
      no: 8,
      kodeSap: 23,
      kodeBatch: 22,
      jenisBarang: 54,
      sat: 13,
      diminta: 17,
      cycleQty: 8,
      cycleWh: 8,
      cycleProd: 8,
      totalDikirim: 20
    };
    const cycleW = colWidths.cycleQty + colWidths.cycleWh + colWidths.cycleProd; // 24mm
    const dikirimGroupW = cycleW * 5; // 120mm

    const xNo = marginX; // 10
    const xSap = xNo + colWidths.no; // 18
    const xBatch = xSap + colWidths.kodeSap; // 41
    const xJenis = xBatch + colWidths.kodeBatch; // 63
    const xSat = xJenis + colWidths.jenisBarang; // 117
    const xDiminta = xSat + colWidths.sat; // 130
    const xDikirim = xDiminta + colWidths.diminta; // 147
    const xTotal = xDikirim + dikirimGroupW; // 267

    const totalTableH = headerTotalH + ROWS_PER_PAGE * rowH; // 90mm

    doc.setLineWidth(0.32);
    doc.rect(marginX, tableY, usableW, totalTableH);
    doc.line(marginX, tableY + headerTotalH, marginX + usableW, tableY + headerTotalH);

    [xSap, xBatch, xJenis, xSat, xDiminta, xDikirim, xTotal].forEach(x => {
      doc.line(x, tableY, x, tableY + totalTableH);
    });

    doc.line(xDikirim, tableY + levelH, xTotal, tableY + levelH);
    for (let i = 0; i < 5; i++) {
      const cx = xDikirim + i * cycleW;
      if (i > 0) {
        doc.line(cx, tableY + levelH, cx, tableY + totalTableH);
      }
      doc.line(cx + colWidths.cycleQty, tableY + levelH, cx + colWidths.cycleQty, tableY + totalTableH);
      doc.line(cx + colWidths.cycleQty, tableY + levelH * 2, cx + cycleW, tableY + levelH * 2);
      doc.line(
        cx + colWidths.cycleQty + colWidths.cycleWh,
        tableY + levelH * 2,
        cx + colWidths.cycleQty + colWidths.cycleWh,
        tableY + totalTableH
      );
    }

    doc.setFont('helvetica', 'bold');
    const drawCenteredText = (
      text: string | string[],
      cx: number,
      cy: number,
      fontSize = 7.8
    ) => {
      doc.setFontSize(fontSize);
      if (Array.isArray(text)) {
        const lineHeight = fontSize * 0.42;
        const startY = cy - ((text.length - 1) * lineHeight) / 2 + fontSize * 0.14;
        text.forEach((line, idx) => {
          doc.text(line, cx, startY + idx * lineHeight, { align: 'center' });
        });
      } else {
        doc.text(text, cx, cy + fontSize * 0.14, { align: 'center' });
      }
    };

    const fullHeaderMidY = tableY + headerTotalH / 2;
    drawCenteredText('No', xNo + colWidths.no / 2, fullHeaderMidY, 7.8);
    drawCenteredText('Kode SAP*', xSap + colWidths.kodeSap / 2, fullHeaderMidY, 7.8);
    drawCenteredText('Kode Batch', xBatch + colWidths.kodeBatch / 2, fullHeaderMidY, 7.8);
    drawCenteredText('Jenis Barang', xJenis + colWidths.jenisBarang / 2, fullHeaderMidY, 7.8);
    drawCenteredText('SAT', xSat + colWidths.sat / 2, fullHeaderMidY, 7.8);
    drawCenteredText(['Jumlah yang', 'diminta'], xDiminta + colWidths.diminta / 2, fullHeaderMidY, 7.2);
    drawCenteredText(
      ['Total yang', 'dikirim'],
      xTotal + colWidths.totalDikirim / 2,
      fullHeaderMidY,
      7.2
    );

    drawCenteredText('Jumlah yang dikirim', xDikirim + dikirimGroupW / 2, tableY + levelH / 2, 7.8);

    for (let i = 0; i < 5; i++) {
      const cx = xDikirim + i * cycleW;
      drawCenteredText(`ke-${i + 1}`, cx + colWidths.cycleQty / 2, tableY + levelH + levelH, 7.2);
      drawCenteredText(
        'TTD',
        cx + colWidths.cycleQty + (colWidths.cycleWh + colWidths.cycleProd) / 2,
        tableY + levelH + levelH / 2,
        6.8
      );
      drawCenteredText(
        'WH',
        cx + colWidths.cycleQty + colWidths.cycleWh / 2,
        tableY + levelH * 2 + levelH / 2,
        6.5
      );
      drawCenteredText(
        'Prod',
        cx + colWidths.cycleQty + colWidths.cycleWh + colWidths.cycleProd / 2,
        tableY + levelH * 2 + levelH / 2,
        6.5
      );
    }

    // Body Rows (10 numbered rows per sheet; continues 11..20, 21..30 on next pages)
    doc.setLineWidth(0.25);
    for (let r = 0; r < ROWS_PER_PAGE; r++) {
      const rowTop = tableY + headerTotalH + r * rowH;
      if (r > 0) {
        doc.line(marginX, rowTop, marginX + usableW, rowTop);
      }

      const rowCenterY = rowTop + rowH / 2 + 1.1;
      const rowNum = pageIdx * ROWS_PER_PAGE + r + 1;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(String(rowNum), xNo + colWidths.no / 2, rowCenterY, { align: 'center' });

      const item = pageItems[r];
      if (item) {
        const mapped = resolveCartItemSlipRow(
          item,
          options.satMode,
          options.includeMaterialCodeInSap,
          options.materialsCatalog,
          options.customSapCodes
        );

        if (mapped.kodeSap) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          const sapFit = doc.splitTextToSize(mapped.kodeSap, colWidths.kodeSap - 2.5)[0] || '';
          doc.text(sapFit, xSap + colWidths.kodeSap / 2, rowCenterY, { align: 'center' });
        }

        if (mapped.kodeBatch) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          const batchFit = doc.splitTextToSize(mapped.kodeBatch, colWidths.kodeBatch - 2.5)[0] || '';
          doc.text(batchFit, xBatch + colWidths.kodeBatch / 2, rowCenterY, { align: 'center' });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        const jenisLines = doc.splitTextToSize(mapped.jenisBarang, colWidths.jenisBarang - 3);
        if (jenisLines.length === 1) {
          doc.text(jenisLines[0], xJenis + 1.8, rowCenterY);
        } else {
          doc.setFontSize(6.8);
          doc.text(jenisLines.slice(0, 2), xJenis + 1.8, rowTop + 2.9);
        }

        doc.setFontSize(7.8);
        doc.text(mapped.sat, xSat + colWidths.sat / 2, rowCenterY, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.text(mapped.jumlahDiminta, xDiminta + colWidths.diminta / 2, rowCenterY, {
          align: 'center'
        });
      }
    }

    // ------------------------------------------------------------------
    // 4. FOOTER: SAP FOOTNOTE, SIGNATURES, QR CODE, KETERANGAN BOX
    // ------------------------------------------------------------------
    const footerY = tableY + totalTableH; // 147

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.text(
      '*Penulisan kode SAP hanya untuk permintaan barang packaging material (PM)',
      marginX,
      footerY + 4
    );

    const sigTitleY = footerY + 13; // 160
    const sigNameY = footerY + 39; // 186

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text('Dibuat,', marginX + 26, sigTitleY, { align: 'center' });
    doc.text('Menyetujui,', marginX + 78, sigTitleY, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const dibuatLabel = options.dibuatOleh.trim()
      ? `( ${options.dibuatOleh.trim()} )`
      : '(....................)';
    const menyetujuiLabel = options.menyetujui.trim()
      ? `( ${options.menyetujui.trim()} )`
      : '(....................)';
    doc.text(dibuatLabel, marginX + 26, sigNameY, { align: 'center' });
    doc.text(menyetujuiLabel, marginX + 78, sigNameY, { align: 'center' });

    // QR Code Block between Menyetujui & Keterangan
    const qrBoxX = marginX + 105; // 115
    const qrBoxY = footerY + 6; // 153
    const qrBoxW = 28;
    const qrBoxH = 33;
    doc.setLineWidth(0.25);
    doc.rect(qrBoxX, qrBoxY, qrBoxW, qrBoxH);

    if (qrDataUrl) {
      doc.addImage(qrDataUrl, 'PNG', qrBoxX + 3, qrBoxY + 1.5, 22, 22);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.8);
    doc.text('SCAN DETAIL REQUEST', qrBoxX + qrBoxW / 2, qrBoxY + 26.5, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    const shortBon = (options.bonNumber || options.supplier || 'SLIP').slice(0, 22);
    doc.text(shortBon, qrBoxX + qrBoxW / 2, qrBoxY + 30.2, { align: 'center' });

    // Keterangan box on right
    const ketX = xDikirim; // 147
    const ketY = footerY + 6; // 153
    const ketW = usableW - (xDikirim - marginX); // 140mm
    const ketH = 38;

    doc.setLineWidth(0.32);
    doc.rect(ketX, ketY, ketW, ketH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.text('Keterangan :', ketX + 3, ketY + 5.5);

    if (options.keterangan.trim()) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      const ketLines = doc
        .splitTextToSize(options.keterangan.trim(), ketW - 6)
        .slice(0, 7);
      doc.text(ketLines, ketX + 3, ketY + 11);
    }

    if (totalPages > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Lembar ${pageIdx + 1} dari ${totalPages} • ${options.bonNumber || 'BON PERMINTAAN RM & PM'}`,
        marginX + usableW,
        202,
        { align: 'right' }
      );
      doc.setTextColor(15, 23, 42);
    }
  }

  const supTag = (options.supplier || items[0]?.supplier || 'ALL').replace(/[^a-zA-Z0-9_-]/g, '_');
  const wipTag = (options.wipName || items[0]?.wipName || '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const safeBon = (options.bonNumber || 'Bon_Permintaan').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeDate = (options.tanggal || formatIndonesianDateDash()).replace(/[^0-9-]/g, '');
  const filename = wipTag
    ? `Bon_Permintaan_${supTag}_${wipTag}_${safeBon}_${safeDate}.pdf`
    : `Bon_Permintaan_${supTag}_${safeBon}_${safeDate}.pdf`;
  doc.save(filename);
}

export interface SupplierCartGroup {
  supplier: string;
  items: RequestCartItem[];
  totalQty: number;
  totalBags: number;
}

export interface SupplierWipCartGroup {
  key: string;
  supplier: string;
  wipId: string;
  wipName: string;
  items: RequestCartItem[];
  totalQty: number;
  totalBags: number;
  pageCount: number;
}

export function groupCartItemsBySupplier(items: RequestCartItem[]): SupplierCartGroup[] {
  const map = new Map<string, RequestCartItem[]>();
  items.forEach(item => {
    const sup = item.supplier || 'GDRM';
    const list = map.get(sup) || [];
    list.push(item);
    map.set(sup, list);
  });
  return Array.from(map.entries()).map(([supplier, supItems]) => ({
    supplier,
    items: supItems,
    totalQty: supItems.reduce((sum, i) => sum + i.qty, 0),
    totalBags: supItems.reduce((sum, i) => sum + (i.packageCount || 0), 0)
  }));
}

export function groupCartItemsBySupplierAndWip(items: RequestCartItem[]): SupplierWipCartGroup[] {
  const map = new Map<string, RequestCartItem[]>();
  items.forEach(item => {
    const sup = item.supplier || 'GDRM';
    const wipKey = item.wipId || item.wipName || 'UMUM';
    const compositeKey = `${sup}__${wipKey}`;
    const list = map.get(compositeKey) || [];
    list.push(item);
    map.set(compositeKey, list);
  });

  return Array.from(map.entries()).map(([key, grpItems]) => {
    const first = grpItems[0];
    return {
      key,
      supplier: first.supplier || 'GDRM',
      wipId: first.wipId || '',
      wipName: first.wipName || 'Umum',
      items: grpItems,
      totalQty: grpItems.reduce((sum, i) => sum + i.qty, 0),
      totalBags: grpItems.reduce((sum, i) => sum + (i.packageCount || 0), 0),
      pageCount: Math.max(1, Math.ceil(grpItems.length / REQUEST_SLIP_ROWS_PER_PAGE))
    };
  });
}

export function buildSupplierSlipFormOptions(
  supplier: string,
  itemsForGroup: RequestCartItem[],
  state: AppState,
  overrides?: Partial<RequestSlipFormOptions>
): RequestSlipFormOptions {
  const now = new Date();
  const yymmdd = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seqNum = String((state.transactions.requests?.length || 0) + 1).padStart(2, '0');
  const supCode =
    supplier === 'GDRM'
      ? 'GDRM'
      : supplier === 'Formulasi'
      ? 'FRM'
      : (supplier || 'WH').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

  const uniqueWips = Array.from(new Set(itemsForGroup.map(i => i.wipName).filter(Boolean)));
  const wipName = overrides?.wipName || (uniqueWips.length === 1 ? uniqueWips[0] : uniqueWips.join(', '));
  const wipId = overrides?.wipId || itemsForGroup[0]?.wipId || '';
  const wipObj = state.master.wips.find(w => w.id === wipId || w.name === wipName);
  const rawWipTag = wipObj?.code || wipName || 'WIP';
  const wipCode = rawWipTag.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'WIP';

  const kepadaDefault =
    supplier === 'GDRM'
      ? 'GDRM (Gudang Bahan Baku)'
      : supplier === 'Formulasi'
      ? 'Formulasi (Premix / Custom)'
      : supplier || 'Warehouse';

  const uniqueSkus = Array.from(new Set(itemsForGroup.map(i => i.skuName).filter(Boolean)));

  const storageLabels: Record<StorageLocation, string> = {
    CK: 'Area Penyimpanan CK',
    WINEROTO: 'Area Penyimpanan WINEROTO',
    STORAGE_TANK: 'Storage Tank Liquid'
  };

  const resolvedLocations = Array.from(
    new Set(
      itemsForGroup.map((item): StorageLocation => {
        const mat = state.master.materials.find(
          m => m.id === item.materialId || (item.materialCode && m.code === item.materialCode)
        );
        if (mat?.type === 'liquid' || item.materialType === 'liquid') {
          return 'STORAGE_TANK';
        }
        const initCk = Number(mat?.initialStockCk ?? 0);
        const initWineroto = Number(mat?.initialStockWineroto ?? 0);
        if (initWineroto > initCk) {
          return 'WINEROTO';
        }
        if (initCk > initWineroto) {
          return 'CK';
        }
        const latestReceipt = [...(state.transactions.receipts || [])]
          .reverse()
          .find(
            r =>
              r.materialId === item.materialId &&
              (r.location === 'CK' || r.location === 'WINEROTO')
          );
        if (latestReceipt) {
          return latestReceipt.location;
        }
        return (item.supplier || supplier) === 'Formulasi' ? 'WINEROTO' : 'CK';
      })
    )
  );

  const tujuanDefault =
    resolvedLocations.length > 0
      ? resolvedLocations.map(loc => storageLabels[loc]).join(' / ')
      : supplier === 'Formulasi'
      ? storageLabels.WINEROTO
      : storageLabels.CK;

  const autoNotesLines: string[] = [];
  if (wipName) {
    autoNotesLines.push(`Jenis WIP: ${wipName}${uniqueSkus.length > 0 ? ` • SKU: ${uniqueSkus.join(', ')}` : ''}`);
  } else if (uniqueSkus.length > 0) {
    autoNotesLines.push(`Tujuan SKU: ${uniqueSkus.join(', ')}`);
  }

  const pkgSummary = itemsForGroup
    .filter(i => i.packageCount && i.packageSizeKg)
    .map(i => {
      const mat = state.master.materials.find(m => m.id === i.materialId);
      const uLabel = detectMaterialPackageConfig(mat).shortUnit || 'zak';
      return `${i.materialName}: ${ceilSafe(i.packageCount || 0)} ${uLabel} @ ${i.packageSizeKg} kg (${i.qty.toFixed(2)} kg)`;
    });
  if (pkgSummary.length > 0) {
    autoNotesLines.push(`Kemasan: ${pkgSummary.slice(0, 3).join(' | ')}`);
  }

  const operatorName = state.currentSession?.name || state.currentAdminUser?.displayName || '';

  return {
    supplier,
    wipId,
    wipName,
    factoryGroupName: overrides?.factoryGroupName || state.factoryName || 'PRODTRACK',
    docCode: overrides?.docCode || 'MAY PRC LLA WFR UTG WHRxx/09/001-08-4',
    department: overrides?.department || 'Warehouse',
    kepadaWarehouse: overrides?.kepadaWarehouse || kepadaDefault,
    tujuanPengiriman: overrides?.tujuanPengiriman || tujuanDefault,
    permintaanShift: overrides?.permintaanShift || 'Shift 1',
    bonNumber: overrides?.bonNumber || `BON-${yymmdd}-${supCode}-${wipCode}-${seqNum}`,
    tanggal: overrides?.tanggal || formatIndonesianDateDash(now),
    namaPengirim: overrides?.namaPengirim || '',
    namaPenerima: overrides?.namaPenerima || operatorName,
    dibuatOleh: overrides?.dibuatOleh || operatorName,
    menyetujui: overrides?.menyetujui || '',
    keterangan: overrides?.keterangan ?? autoNotesLines.join('\n'),
    satMode: overrides?.satMode || 'kg',
    includeMaterialCodeInSap:
      overrides?.includeMaterialCodeInSap !== undefined
        ? overrides.includeMaterialCodeInSap
        : true,
    materialsCatalog: overrides?.materialsCatalog || state.master.materials,
    customSapCodes: overrides?.customSapCodes,
    requestNumbers: overrides?.requestNumbers,
    qrDeepLinkUrl: overrides?.qrDeepLinkUrl
  };
}

/**
 * Groups requested materials by their target supplier AND WIP type,
 * generating a separate PDF slip file for each (Supplier + WIP) group.
 * Groups with >10 materials automatically spill into continuation sheets (10 rows/sheet).
 */
export async function generateSeparateSupplierSlipsPdf(
  items: RequestCartItem[],
  state: AppState,
  overrides?: Partial<RequestSlipFormOptions>
): Promise<SupplierWipCartGroup[]> {
  const groups = groupCartItemsBySupplierAndWip(items);
  for (let idx = 0; idx < groups.length; idx++) {
    if (idx > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 180));
    }
    const group = groups[idx];
    const opts = buildSupplierSlipFormOptions(group.supplier, group.items, state, {
      ...overrides,
      wipId: group.wipId,
      wipName: group.wipName
    });
    await generateMaterialRequestSlipPdf(group.items, opts);
  }
  return groups;
}
