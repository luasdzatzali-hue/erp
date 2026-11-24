import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppState, ShiftNumber } from '../types';
import { calculateStockBalances } from './storage';
import { calculateMaterialStockBreakdown, calculateUsageBreakdown } from './reportBreakdown';
import { formatIndonesianDate, getCurrentShift, SHIFTS_CONFIG } from './shifts';

export interface ShiftReportOptions {
  shift: ShiftNumber | 'ALL';
  dateString?: string; // YYYY-MM-DD, defaults to today
  operatorName?: string;
}

export function generateShiftProductionReportPdf(
  state: AppState,
  options: ShiftReportOptions
): void {
  // Setup A4 Landscape: Width = 297mm, Height = 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const selectedDate = options.dateString || new Date().toISOString().slice(0, 10);
  const currentLiveShift = getCurrentShift();
  const shiftLabel =
    options.shift === 'ALL'
      ? 'Semua Shift (24 Jam Penuh: Shift 1, 2, 3)'
      : `Shift ${options.shift} (${SHIFTS_CONFIG[options.shift].name} • ${SHIFTS_CONFIG[options.shift].timeRange})`;

  // Calculate stock balances
  const stockBalances = calculateStockBalances(state);
  const materialList = state.master.materials;

  // Filter transactions by date and shift
  const cartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    const matchDate = cp.timestamp.includes(selectedDate);
    if (!matchDate) return false;
    if (options.shift === 'ALL') return true;
    return cp.shift === options.shift;
  });

  const usages = (state.transactions.usages || []).filter(u => {
    const matchDate = u.date === selectedDate;
    if (!matchDate) return false;
    if (options.shift === 'ALL') return true;
    return u.shift === options.shift;
  });

  const wipBatches = (state.transactions.wipBatches || []).filter(b => {
    const matchDate = b.startedAt.includes(selectedDate);
    if (!matchDate) return false;
    if (options.shift === 'ALL') return true;
    return b.shift === options.shift;
  });

  const stopLogs = (state.transactions.productionStops || []).filter(s => {
    const matchDate = s.stoppedAt.includes(selectedDate) || s.startedAt.includes(selectedDate);
    if (!matchDate) return false;
    if (options.shift === 'ALL') return true;
    return s.shift === options.shift;
  });

  // Calculate Aggregates
  const totalCartons = cartonLogs.reduce((sum, c) => sum + c.cartonsProduced, 0);
  const totalMaterialUsedKg = usages.reduce((sum, u) => sum + u.usageQty, 0);
  const totalWipProducedKg = wipBatches
    .filter(b => b.status === 'SELESAI')
    .reduce((sum, b) => sum + b.batchWeightKg, 0);
  const totalDowntimeMinutes = stopLogs.reduce((sum, s) => sum + s.durationMinutes, 0);

  // ----------------- HEADER SECTION (Landscape 297mm Deep Navy Header) -----------------
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, 297, 32, 'F');

  // Accent Line
  doc.setFillColor(6, 182, 212); // cyan-500
  doc.rect(0, 32, 297, 1.5, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('PRODTRACK MANUFACTURING EXECUTION SYSTEM', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text('LAPORAN RINGKASAN PRODUKSI PER SHIFT & EFISIENSI PABRIK', 14, 18);

  // Date and Shift in header
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Tanggal: ${selectedDate} (${formatIndonesianDate()})`, 14, 25);
  doc.text(`Periode: ${shiftLabel}`, 14, 29);

  // Print metadata on right (283mm = 297 - 14)
  const printedTime = new Date().toLocaleTimeString('id-ID');
  doc.text(`Waktu Cetak: ${printedTime} WIB`, 283, 25, { align: 'right' });
  doc.text(`PIC / Operator: ${options.operatorName || 'Admin Produksi'}`, 283, 29, { align: 'right' });

  let currentY = 38;

  // ----------------- EXECUTIVE KPI SUMMARY CARDS (Spans 269mm) -----------------
  const cardWidth = 63.5;
  const cardHeight = 16;
  const cardGap = 5;
  const startX = 14;

  const kpis = [
    { title: 'TOTAL KARTON SKU', value: `${totalCartons.toLocaleString('id-ID')} ktn`, color: [16, 185, 129] }, // emerald
    { title: 'PEMAKAIAN MATERIAL', value: `${totalMaterialUsedKg.toFixed(1)} kg`, color: [6, 182, 212] }, // cyan
    { title: 'OUTPUT BATCH WIP', value: `${totalWipProducedKg.toFixed(1)} kg`, color: [168, 85, 247] }, // purple
    { title: 'DOWNTIME MESIN', value: `${totalDowntimeMinutes} mnt`, color: [244, 63, 94] } // rose
  ];

  kpis.forEach((kpi, idx) => {
    const x = startX + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(x, currentY, cardWidth, cardHeight, 2, 2, 'FD');

    // Accent line on top of card
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(x, currentY, cardWidth, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.title, x + 3.5, currentY + 5.5);

    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(kpi.value, x + 3.5, currentY + 12.5);
  });

  currentY += cardHeight + 7;

  // ----------------- SECTION 1: OUTPUT PRODUKSI KARTON (SKU) -----------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Ringkasan Realisasi Output Karton (SKU)', 14, currentY);

  currentY += 2;

  // Calculate cartons per SKU
  const skuRows = state.master.skus.map((sku, index) => {
    const skuCartons = cartonLogs
      .filter(c => c.skuId === sku.id)
      .reduce((sum, c) => sum + c.cartonsProduced, 0);

    const shiftHours = options.shift === 'ALL' ? 24 : 8;
    const targetKtn = sku.targetHour * shiftHours;
    const achievePct = targetKtn > 0 ? ((skuCartons / targetKtn) * 100).toFixed(1) : '0.0';
    const totalWeightKg = (skuCartons * sku.cartonWeightKg).toFixed(1);

    return [
      (index + 1).toString(),
      sku.name + (sku.isKite ? ' [KITE Ekspor]' : ''),
      sku.code || `SKU-${index + 1}`,
      `${sku.targetHour} ktn/jam`,
      `${targetKtn.toLocaleString('id-ID')} ktn`,
      `${skuCartons.toLocaleString('id-ID')} ktn`,
      `${totalWeightKg} kg`,
      `${achievePct}%`
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Nama Produk (SKU)', 'Kode SKU', 'Target/Jam', 'Target Shift', 'Output Aktual', 'Total Bobot (kg)', 'Pencapaian']],
    body: skuRows.length > 0 ? skuRows : [['-', 'Belum ada data produksi karton pada shift ini', '-', '-', '-', '0 ktn', '0 kg', '0%']],
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold', textColor: [16, 185, 129] },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' }
    },
    theme: 'striped',
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ----------------- SECTION 2: PEMAKAIAN BAHAN BAKU (SESUAI SKU & WIP) -----------------
  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Laporan Pemakaian Bahan Baku (Sesuai SKU & WIP yang Diproduksi)', 14, currentY);

  currentY += 2;

  const usageGroups = calculateUsageBreakdown(state, {
    dateString: selectedDate,
    shift: options.shift
  });

  const usageRows: string[][] = [];
  let usageCounter = 1;

  usageGroups.forEach(grp => {
    grp.materials.forEach(m => {
      usageRows.push([
        (usageCounter++).toString(),
        grp.skuName + (grp.isKite ? ' [KITE]' : ''),
        grp.wipName,
        m.materialCode,
        m.materialName,
        m.locations.join(', ') || 'Gudang',
        m.shifts.map(s => `Shift ${s}`).join(', ') || '-',
        `${m.totalUsageKg.toFixed(4)} kg`,
        `${m.estimatedBatch.toFixed(2)} btc`,
        m.operators.join(', ') || '-'
      ]);
    });
  });

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'SKU Produk', 'Jenis WIP', 'Kode', 'Nama Material', 'Gudang', 'Shift', 'Pemakaian (kg)', 'Est. Batch', 'Operator']],
    body: usageRows.length > 0 ? usageRows : [['-', '-', '-', '-', 'Belum ada transaksi pemakaian bahan baku pada periode shift ini', '-', '-', '0.0000 kg', '0.00 btc', '-']],
    headStyles: {
      fillColor: [14, 116, 144], // cyan-700
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 32 },
      3: { cellWidth: 16, halign: 'center' },
      4: { cellWidth: 42 },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: [14, 116, 144] },
      8: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      9: { cellWidth: 26 }
    },
    theme: 'striped',
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ----------------- SECTION 3: LAPORAN SALDO STOCK MATERIAL AKTUAL -----------------
  // Requested header: sku ; Jenis WIP ; kode ; Nama material ; saldo awal (batch & kg) ; pemesanan material (batch & kg) ; kedatangan material (batch & kg) ; total onhand material (batch & kg) ; pemakaian material (batch & kg) ; saldo akhir shift (batch & kg) ; status.
  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Laporan Saldo Stock Material Aktual (Breakdown Berdasarkan SKU & WIP yang Diproduksi)', 14, currentY);

  currentY += 2;

  const stockBreakdown = calculateMaterialStockBreakdown(state, {
    dateString: selectedDate,
    shift: options.shift
  });

  const stockRows = stockBreakdown.map(r => [
    r.skuName + (r.isKite ? ' [KITE]' : ''),
    r.wipName,
    r.materialCode,
    r.materialName,
    `${r.saldoAwalBatch.toFixed(2)} btc\n(${r.saldoAwalKg.toFixed(2)} kg)`,
    `${r.pemesananBatch.toFixed(2)} btc\n(${r.pemesananKg.toFixed(2)} kg)`,
    `${r.kedatanganBatch.toFixed(2)} btc\n(${r.kedatanganKg.toFixed(2)} kg)`,
    `${r.totalOnhandBatch.toFixed(2)} btc\n(${r.totalOnhandKg.toFixed(2)} kg)`,
    `${r.pemakaianBatch.toFixed(2)} btc\n(${r.pemakaianKg.toFixed(2)} kg)`,
    `${r.saldoAkhirBatch.toFixed(2)} btc\n(${r.saldoAkhirKg.toFixed(2)} kg)`,
    r.status
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [[
      'SKU',
      'Jenis WIP',
      'Kode',
      'Nama Material',
      'Saldo Awal\n(Batch & kg)',
      'Pemesanan Material\n(Batch & kg)',
      'Kedatangan Material\n(Batch & kg)',
      'Total Onhand Material\n(Batch & kg)',
      'Pemakaian Material\n(Batch & kg)',
      'Saldo Akhir Shift\n(Batch & kg)',
      'Status'
    ]],
    body: stockRows.length > 0 ? stockRows : [['-', '-', '-', 'Tidak ada data stok material', '-', '-', '-', '-', '-', '-', '-']],
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 26, halign: 'left', fontStyle: 'bold' },
      1: { cellWidth: 25, halign: 'left' },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 35, halign: 'left' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
      6: { cellWidth: 26, halign: 'right' },
      7: { cellWidth: 26, halign: 'right', fontStyle: 'bold', textColor: [14, 116, 144] },
      8: { cellWidth: 26, halign: 'right' },
      9: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      10: { cellWidth: 17, halign: 'center', fontStyle: 'bold' }
    },
    theme: 'striped',
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ----------------- SECTION 4: PRODUKSI BATCH WIP & ALIRAN TANGKI -----------------
  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('4. Produksi Batch WIP & Penampungan Tangki', 14, currentY);

  currentY += 2;

  const batchRows = wipBatches.map((b, idx) => {
    const wip = state.master.wips.find(w => w.id === b.wipId);
    const targetTank = state.master.tanks.find(t => t.id === (b.targetTankId || wip?.targetTankId));
    const targetMachine = state.master.machines.find(m => m.id === (b.targetMachineId || wip?.assignedMachineId));
    const duration = b.durationMinutes || wip?.productionDurationMinutes || 30;

    const pauseInfo =
      b.pauseLogs && b.pauseLogs.length > 0
        ? `${b.status} (Jeda ${b.pauseLogs.length}x: ${b.pauseLogs[b.pauseLogs.length - 1].reason})`
        : b.status;

    return [
      (idx + 1).toString(),
      b.batchCode,
      b.wipName,
      targetMachine ? `${targetMachine.code}` : '-',
      targetTank ? `${targetTank.code} (${targetTank.type === 'HOLDING_TANK' ? 'Holding' : 'Storage'})` : '-',
      `${b.batchWeightKg.toFixed(1)} kg`,
      `${duration} mnt`,
      pauseInfo,
      b.operatorName || '-'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Kode Batch', 'Formula WIP', 'Mesin', 'Tangki Tujuan', 'Bobot Batch', 'Durasi', 'Status', 'Operator']],
    body: batchRows.length > 0 ? batchRows : [['-', '-', 'Belum ada batch WIP yang diproses pada shift ini', '-', '-', '0.0 kg', '-', '-', '-']],
    headStyles: {
      fillColor: [109, 40, 217], // purple-700
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'center' },
      7: { halign: 'center', fontStyle: 'bold' }
    },
    theme: 'striped',
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;

  // ----------------- SECTION 5: DOWNTIME MESIN (TPM SIX BIG LOSSES) -----------------
  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Log Downtime & Stop Produksi (Standar TPM Six Big Losses)', 14, currentY);

  currentY += 2;

  const stopRows = stopLogs.map((s, idx) => {
    const timeFormatted = s.stoppedAt ? new Date(s.stoppedAt).toLocaleTimeString('id-ID') : '-';
    return [
      (idx + 1).toString(),
      timeFormatted,
      s.skuName,
      s.categoryLabel,
      s.reasonTitle || s.subReason || '-',
      `${s.durationMinutes} mnt`,
      s.operatorName || '-',
      s.technicianName || '-',
      s.actionTaken || '-'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Jam Stop', 'SKU / Line', 'Kategori Six Big Losses', 'Alasan / Root Cause', 'Durasi', 'Operator', 'Teknisi', 'Tindakan']],
    body: stopRows.length > 0 ? stopRows : [['-', '-', 'Tidak ada kejadian downtime mesin tercatat pada shift ini (Zero Breakdown)', '-', '-', '0 mnt', '-', '-', '-']],
    headStyles: {
      fillColor: [190, 18, 60], // rose-700
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left'
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 16, halign: 'center' },
      5: { halign: 'right', fontStyle: 'bold', textColor: [190, 18, 60] }
    },
    theme: 'striped',
    margin: { left: 14, right: 14 }
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // ----------------- SIGNATURE APPROVAL BLOCK (Landscape 297mm) -----------------
  if (currentY > 165) {
    doc.addPage();
    currentY = 16;
  }

  const sigColWidth = 70;
  const sigStartX = 24;
  const sigGap = 20;
  const sigY = currentY + 4;

  const signers = [
    { role: 'Disiapkan Oleh:', title: 'Operator / Shift Leader' },
    { role: 'Diperiksa Oleh:', title: 'Supervisor QC & Lab' },
    { role: 'Disetujui Oleh:', title: 'Production Manager' }
  ];

  signers.forEach((sig, idx) => {
    const x = sigStartX + idx * (sigColWidth + sigGap);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(sig.role, x + sigColWidth / 2, sigY, { align: 'center' });

    // Signature line
    doc.setDrawColor(203, 213, 225);
    doc.line(x, sigY + 18, x + sigColWidth, sigY + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(`( ${sig.title} )`, x + sigColWidth / 2, sigY + 22, { align: 'center' });
  });

  // Footer page numbers on all landscape pages (height = 210mm, center = 148.5mm, y = 202mm)
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ProdTrack MES System • Dokumen Resmi Pabrik • Halaman ${i} dari ${totalPages}`,
      148.5,
      202,
      { align: 'center' }
    );
  }

  // Save the PDF
  const filename = `Laporan_Produksi_${options.shift === 'ALL' ? '24Jam' : `Shift${options.shift}`}_${selectedDate}.pdf`;
  doc.save(filename);
}
