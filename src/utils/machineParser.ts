import { ProductionMachine, MachineStatus } from '../types';

export interface MachineParseResult {
  valid: ProductionMachine[];
  errors: string[];
}

export const SAMPLE_MACHINE_CSV_TEMPLATE = `Kode Mesin,Nama Mesin,Jalur (Line),Kapasitas (kg/jam),Status,Operator,Catatan
MX-01,Mixer High-Shear Adonan Utama,Line 1 (Biskuit Domestik),800,OPERATIONAL,Ahmad Fauzi (Shift 1),Kapasitas batching hingga 500 kg per siklus adonan
CK-01,Cooker & Vacuum Tank Sirup Glukosa,Line 1 (Biskuit Domestik),500,OPERATIONAL,Budi Santoso (Shift 1),Jalur pipa terhubung langsung ke Holding Tank HT-01
ENR-01,Enrober Unit Coating Cokelat KITE,Line 2 (Wafer Ekspor KITE),650,OPERATIONAL,Candra Wijaya (Shift 2),Suhu tempering diatur presisi 31.5°C
EXT-01,Twin-Screw Continuous Extruder,Line 2 (Wafer Ekspor KITE),750,STANDBY,Dedi Kurniawan,Siap untuk jadwal produksi shift malam
PKG-01,High-Speed Cartoning Packaging,Line 1 (Biskuit Domestik),1200,OPERATIONAL,Eko Prasetyo,Output 1200 karton ekuivalen per jam`;

export const SAMPLE_MACHINE_JSON_TEMPLATE = JSON.stringify(
  [
    {
      code: "MX-01",
      name: "Mixer High-Shear Adonan Utama",
      line: "Line 1 (Biskuit Domestik)",
      capacityKgPerHour: 800,
      status: "OPERATIONAL",
      operatorAssigned: "Ahmad Fauzi (Shift 1)",
      notes: "Kapasitas batching hingga 500 kg per siklus adonan"
    },
    {
      code: "CK-01",
      name: "Cooker & Vacuum Tank Sirup Glukosa",
      line: "Line 1 (Biskuit Domestik)",
      capacityKgPerHour: 500,
      status: "OPERATIONAL",
      operatorAssigned: "Budi Santoso (Shift 1)",
      notes: "Jalur pipa terhubung langsung ke Holding Tank HT-01"
    },
    {
      code: "ENR-01",
      name: "Enrober Unit Coating Cokelat KITE",
      line: "Line 2 (Wafer Ekspor KITE)",
      capacityKgPerHour: 650,
      status: "OPERATIONAL",
      operatorAssigned: "Candra Wijaya (Shift 2)",
      notes: "Suhu tempering diatur presisi 31.5°C"
    },
    {
      code: "EXT-01",
      name: "Twin-Screw Continuous Extruder",
      line: "Line 2 (Wafer Ekspor KITE)",
      capacityKgPerHour: 750,
      status: "STANDBY",
      operatorAssigned: "Dedi Kurniawan",
      notes: "Siap untuk jadwal produksi shift malam"
    }
  ],
  null,
  2
);

import {
  findHeaderRowIndex,
  normalizeHeaderName,
  parseBomNumber,
  prepareDelimitedLines,
  splitDelimitedRow,
  stripUtf8Bom
} from './bomCsvHelper';

export function parseMachineFile(content: string): MachineParseResult {
  const errors: string[] = [];
  const valid: ProductionMachine[] = [];

  const trimmed = stripUtf8Bom(content).trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong'] };
  }

  // Attempt JSON parsing first
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList: any[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed.machines && Array.isArray(parsed.machines)) {
        rawList = parsed.machines;
      } else if (parsed.master?.machines && Array.isArray(parsed.master.machines)) {
        rawList = parsed.master.machines;
      } else if (parsed.data?.machines && Array.isArray(parsed.data.machines)) {
        rawList = parsed.data.machines;
      } else {
        return {
          valid: [],
          errors: ['Format JSON tidak berisi daftar mesin yang valid (array machines tidak ditemukan)']
        };
      }

      rawList.forEach((item, idx) => {
        const rowNum = idx + 1;
        const code = (item.code || item.kode || `MCH-${String(idx + 1).padStart(2, '0')}`).toString().trim();
        const name = (item.name || item.nama || '').toString().trim();

        if (!name) {
          errors.push(`Baris ${rowNum}: Nama mesin wajib diisi`);
          return;
        }

        const capacity = parseBomNumber(item.capacityKgPerHour ?? item.capacity ?? item.kapasitas ?? 500);
        if (isNaN(capacity) || capacity <= 0) {
          errors.push(`Baris ${rowNum} (${name}): Kapasitas mesin harus berupa angka positif`);
          return;
        }

        let status: MachineStatus = 'OPERATIONAL';
        const rawStatus = String(item.status || '').toUpperCase();
        if (rawStatus.includes('CHANGE') || rawStatus.includes('GANTI')) status = 'CHANGEOVER';
        else if (rawStatus.includes('STANDBY')) status = 'STANDBY';
        else if (rawStatus.includes('MAINT') || rawStatus.includes('RUSAK') || rawStatus.includes('PERBAIKAN')) status = 'MAINTENANCE';

        valid.push({
          id: item.id || `mach_imp_${Date.now()}_${idx}`,
          code,
          name,
          line: item.line || item.jalur || 'Line 1 (Produksi)',
          capacityKgPerHour: capacity,
          status,
          operatorAssigned: item.operatorAssigned || item.operator || undefined,
          notes: item.notes || item.catatan || undefined
        });
      });

      return { valid, errors };
    } catch {
      // If JSON parse failed, fall through to CSV parser
    }
  }

  // Parse as CSV / Delimited text
  const { lines, delimiter } = prepareDelimitedLines(trimmed);
  if (lines.length === 0) {
    return { valid: [], errors: ['Tidak ada baris data ditemukan'] };
  }

  const { headerIndex, isHeaderDetected } = findHeaderRowIndex(lines, delimiter, [
    'kode',
    'code',
    'nama',
    'name',
    'mesin',
    'machine',
    'jalur',
    'line',
    'kapasitas',
    'capacity',
    'status'
  ]);

  let codeIdx = 0;
  let nameIdx = 1;
  let lineIdx = 2;
  let capIdx = 3;
  let statusIdx = 4;
  let opIdx = 5;
  let notesIdx = 6;

  if (isHeaderDetected) {
    const rawHeaders = splitDelimitedRow(lines[headerIndex], delimiter).map(normalizeHeaderName);
    let mCode = -1;
    let mName = -1;
    let mLine = -1;
    let mCap = -1;
    let mStatus = -1;
    let mOp = -1;
    let mNotes = -1;

    rawHeaders.forEach((h, idx) => {
      if (!h) return;
      if (mCode === -1 && (h.includes('kodemesin') || h === 'kode' || h === 'code')) mCode = idx;
      else if (mName === -1 && (h.includes('namamesin') || h === 'nama' || h === 'name' || h === 'mesin')) mName = idx;
      else if (mLine === -1 && (h.includes('jalur') || h.includes('line'))) mLine = idx;
      else if (mCap === -1 && (h.includes('kapasitas') || h.includes('capacity'))) mCap = idx;
      else if (mStatus === -1 && h.includes('status')) mStatus = idx;
      else if (mOp === -1 && h.includes('operator')) mOp = idx;
      else if (mNotes === -1 && (h.includes('catatan') || h.includes('note') || h.includes('ket'))) mNotes = idx;
    });

    const hasNoCol = rawHeaders[0] === 'no' || rawHeaders[0] === 'nomor' || rawHeaders[0] === 'num';
    const offset = hasNoCol ? 1 : 0;

    codeIdx = mCode !== -1 ? mCode : 0 + offset;
    nameIdx = mName !== -1 ? mName : 1 + offset;
    lineIdx = mLine !== -1 ? mLine : 2 + offset;
    capIdx = mCap !== -1 ? mCap : 3 + offset;
    statusIdx = mStatus !== -1 ? mStatus : 4 + offset;
    opIdx = mOp !== -1 ? mOp : 5 + offset;
    notesIdx = mNotes !== -1 ? mNotes : 6 + offset;
  }

  const startRow = isHeaderDetected ? headerIndex + 1 : 0;
  const dataLines = lines.slice(startRow);

  if (dataLines.length === 0) {
    return { valid: [], errors: ['File hanya berisi header dan belum memiliki baris data mesin'] };
  }

  dataLines.forEach((line, idx) => {
    const rowNum = startRow + idx + 1;
    const cols = splitDelimitedRow(line, delimiter);

    if (cols.length < 2) {
      errors.push(`Baris ${rowNum}: Format kolom tidak sesuai`);
      return;
    }

    const code = (cols[codeIdx] || '').trim() || `MCH-${String(idx + 1).padStart(2, '0')}`;
    const name = (cols[nameIdx] || '').trim();

    if (!name) {
      errors.push(`Baris ${rowNum}: Nama mesin kosong`);
      return;
    }

    const lineName = cols[lineIdx] ? cols[lineIdx].trim() : 'Line 1 (Produksi)';
    const rawCapCell = cols[capIdx] || '';
    const rawStatus = cols[statusIdx] ? cols[statusIdx].toUpperCase() : 'OPERATIONAL';
    const operator = cols[opIdx] ? cols[opIdx].trim() : '';
    const notes = cols[notesIdx] ? cols[notesIdx].trim() : '';

    const capacity = rawCapCell.trim() ? parseBomNumber(rawCapCell) : 500;
    if (isNaN(capacity) || capacity <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Kapasitas mesin "${rawCapCell}" tidak valid`);
      return;
    }

    let status: MachineStatus = 'OPERATIONAL';
    if (rawStatus.includes('CHANGE') || rawStatus.includes('GANTI')) status = 'CHANGEOVER';
    else if (rawStatus.includes('STANDBY')) status = 'STANDBY';
    else if (rawStatus.includes('MAINT') || rawStatus.includes('RUSAK') || rawStatus.includes('PERBAIKAN')) status = 'MAINTENANCE';

    valid.push({
      id: `mach_imp_${Date.now()}_${idx}`,
      code,
      name,
      line: lineName || 'Line 1 (Produksi)',
      capacityKgPerHour: capacity,
      status,
      operatorAssigned: operator || undefined,
      notes: notes || undefined
    });
  });

  return { valid, errors };
}
