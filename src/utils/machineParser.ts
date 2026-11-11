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

export function parseMachineFile(content: string): MachineParseResult {
  const errors: string[] = [];
  const valid: ProductionMachine[] = [];

  const trimmed = content.trim();
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
        const code = (item.code || item.kode || `MCH-${String(idx + 1).padStart(2, '0')}`).trim();
        const name = (item.name || item.nama || '').trim();

        if (!name) {
          errors.push(`Baris ${rowNum}: Nama mesin wajib diisi`);
          return;
        }

        const capacity = parseFloat(item.capacityKgPerHour || item.capacity || item.kapasitas || '500');
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
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { valid: [], errors: ['Tidak ada baris data ditemukan'] };
  }

  // Detect delimiter: comma, semicolon, or tab
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = ';';

  // Check if first line is header
  const isHeader =
    firstLine.toLowerCase().includes('kode') ||
    firstLine.toLowerCase().includes('nama') ||
    firstLine.toLowerCase().includes('mesin') ||
    firstLine.toLowerCase().includes('machine');

  const dataLines = isHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, idx) => {
    const rowNum = idx + (isHeader ? 2 : 1);
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    if (cols.length < 2) {
      errors.push(`Baris ${rowNum}: Format kolom tidak sesuai`);
      return;
    }

    const code = cols[0].replace(/^["']|["']$/g, '').trim() || `MCH-${String(idx + 1).padStart(2, '0')}`;
    const name = cols[1].replace(/^["']|["']$/g, '').trim();

    if (!name) {
      errors.push(`Baris ${rowNum}: Nama mesin kosong`);
      return;
    }

    const lineName = cols[2] ? cols[2].replace(/^["']|["']$/g, '').trim() : 'Line 1 (Produksi)';
    const capStr = cols[3] ? cols[3].replace(/[^0-9.]/g, '') : '';
    const rawStatus = cols[4] ? cols[4].replace(/^["']|["']$/g, '').toUpperCase() : 'OPERATIONAL';
    const operator = cols[5] ? cols[5].replace(/^["']|["']$/g, '').trim() : '';
    const notes = cols[6] ? cols[6].replace(/^["']|["']$/g, '').trim() : '';

    const capacity = parseFloat(capStr || '500');
    if (isNaN(capacity) || capacity <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Kapasitas mesin "${cols[3]}" tidak valid`);
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
