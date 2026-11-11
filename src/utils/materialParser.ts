import { Material, MaterialType, MaterialSource } from '../types';

export interface ParseResult {
  valid: Material[];
  errors: string[];
}

export function getMaterialCompositeKey(m: Partial<Material>): string {
  const codeKey = (m.code || m.name || '').trim().toLowerCase();
  const sourceKey = (m.source || 'GDRM').trim().toLowerCase();
  const weightKey = Number(m.weightKg || 0).toFixed(4);
  const pkgKey = (m.packaging || '').trim().toLowerCase();
  return `${codeKey}:::${sourceKey}:::${weightKey}:::${pkgKey}`;
}

export const SAMPLE_CSV_TEMPLATE = `Nama Material,Kode,Tipe,Sumber,Kemasan,Berat Standar (kg),Min Alert (kg)
Tepung Terigu Industri,MAT-TP-01,bubuk,GDRM,Zak 25.0000 kg,25.0000,100
Gula Pasir Rafinasi (50 kg),MAT-GL-01,padat,GDRM,Zak 50.0000 kg,50.0000,200
Gula Pasir Rafinasi (15 kg),MAT-GL-01,padat,GDRM,Zak 15.0000 kg,15.0000,100
Gula Pasir Formulasi Khusus,MAT-GL-01,padat,Formulasi,Zak 25.0000 kg,25.0000,50
Minyak Nabati RBDPO,MAT-MY-01,liquid,GDRM,Drum 180.0000 kg,180.0000,300
Flavor Pasta Vanilla,MAT-FL-01,liquid,Formulasi,Jerigen 10.0000 kg,10.0000,25
Premix Vitamin Fortifikasi,MAT-PX-02,bubuk,Formulasi,Batching 4.2500 kg,4.2500,15`;

export const SAMPLE_JSON_TEMPLATE = JSON.stringify(
  [
    {
      name: "Tepung Terigu Industri",
      code: "MAT-TP-01",
      type: "bubuk",
      source: "GDRM",
      packaging: "Zak 25.0000 kg",
      weightKg: 25.0,
      minStockAlert: 100
    },
    {
      name: "Gula Pasir Rafinasi (50 kg)",
      code: "MAT-GL-01",
      type: "padat",
      source: "GDRM",
      packaging: "Zak 50.0000 kg",
      weightKg: 50.0,
      minStockAlert: 200
    },
    {
      name: "Gula Pasir Rafinasi (15 kg)",
      code: "MAT-GL-01",
      type: "padat",
      source: "GDRM",
      packaging: "Zak 15.0000 kg",
      weightKg: 15.0,
      minStockAlert: 100
    },
    {
      name: "Gula Pasir Formulasi Khusus",
      code: "MAT-GL-01",
      type: "padat",
      source: "Formulasi",
      packaging: "Zak 25.0000 kg",
      weightKg: 25.0,
      minStockAlert: 50
    },
    {
      name: "Minyak Nabati RBDPO",
      code: "MAT-MY-01",
      type: "liquid",
      source: "GDRM",
      packaging: "Drum 180.0000 kg",
      weightKg: 180.0,
      minStockAlert: 300
    }
  ],
  null,
  2
);

export function parseMaterialFile(content: string): ParseResult {
  const errors: string[] = [];
  const valid: Material[] = [];

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
      } else if (parsed.materials && Array.isArray(parsed.materials)) {
        rawList = parsed.materials;
      } else if (parsed.master?.materials && Array.isArray(parsed.master.materials)) {
        rawList = parsed.master.materials;
      } else if (parsed.data?.materials && Array.isArray(parsed.data.materials)) {
        rawList = parsed.data.materials;
      } else {
        return {
          valid: [],
          errors: ['Format JSON tidak berisi daftar material yang valid (materials array tidak ditemukan)']
        };
      }

      rawList.forEach((item, idx) => {
        const rowNum = idx + 1;
        if (!item.name || typeof item.name !== 'string') {
          errors.push(`Baris ${rowNum}: Nama material wajib diisi`);
          return;
        }

        const weight = parseFloat(item.weightKg || item.weight || item.berat || '0');
        if (isNaN(weight) || weight <= 0) {
          errors.push(`Baris ${rowNum} (${item.name}): Berat standar harus berupa angka positif`);
          return;
        }

        let type: MaterialType = 'bubuk';
        const rawType = (item.type || item.tipe || '').toLowerCase();
        if (rawType.includes('liquid') || rawType.includes('cair')) type = 'liquid';
        else if (rawType.includes('padat') || rawType.includes('solid')) type = 'padat';
        else type = 'bubuk';

        let source: MaterialSource = 'GDRM';
        const rawSource = (item.source || item.sumber || '').toUpperCase();
        if (rawSource.includes('FORMULASI') || rawSource.includes('CUSTOM')) source = 'Formulasi';
        else source = 'GDRM';

        valid.push({
          id: item.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          name: item.name.trim(),
          code: item.code ? String(item.code).trim() : `MAT-${String(idx + 1).padStart(3, '0')}`,
          type,
          source,
          packaging: item.packaging ? String(item.packaging).trim() : `${weight.toFixed(4)} kg`,
          weightKg: weight,
          minStockAlert: parseFloat(item.minStockAlert || item.minAlert || '50') || 50
        });
      });

      return { valid, errors };
    } catch (e: any) {
      // If JSON parse failed, fall through to CSV
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
    firstLine.toLowerCase().includes('nama') ||
    firstLine.toLowerCase().includes('material') ||
    firstLine.toLowerCase().includes('name');

  const dataLines = isHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, idx) => {
    const rowNum = idx + (isHeader ? 2 : 1);
    // Simple CSV splitter handling quoted cells
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

    const name = cols[0].replace(/^["']|["']$/g, '').trim();
    if (!name) {
      errors.push(`Baris ${rowNum}: Nama material kosong`);
      return;
    }

    const code = cols[1] ? cols[1].replace(/^["']|["']$/g, '').trim() : `MAT-${String(idx + 1).padStart(3, '0')}`;
    const rawType = cols[2] ? cols[2].replace(/^["']|["']$/g, '').toLowerCase() : 'bubuk';
    const rawSource = cols[3] ? cols[3].replace(/^["']|["']$/g, '').toUpperCase() : 'GDRM';
    const packaging = cols[4] ? cols[4].replace(/^["']|["']$/g, '').trim() : '';
    const weightStr = cols[5] ? cols[5].replace(/[^0-9.]/g, '') : '';
    const alertStr = cols[6] ? cols[6].replace(/[^0-9.]/g, '') : '';

    let type: MaterialType = 'bubuk';
    if (rawType.includes('liquid') || rawType.includes('cair')) type = 'liquid';
    else if (rawType.includes('padat') || rawType.includes('solid')) type = 'padat';

    let source: MaterialSource = 'GDRM';
    if (rawSource.includes('FORMULASI') || rawSource.includes('CUSTOM')) source = 'Formulasi';

    const weight = parseFloat(weightStr || '25');
    if (isNaN(weight) || weight <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Berat standar "${cols[5]}" tidak valid`);
      return;
    }

    const minAlert = parseFloat(alertStr || '50') || 50;

    valid.push({
      id: `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      code,
      type,
      source,
      packaging: packaging || `${weight.toFixed(4)} kg`,
      weightKg: weight,
      minStockAlert: minAlert
    });
  });

  return { valid, errors };
}
