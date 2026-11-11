import { SKU } from '../types';

export interface SkuParseResult {
  valid: SKU[];
  errors: string[];
  warnings: string[];
}

export const SAMPLE_SKU_CSV_TEMPLATE = `Nama SKU,Kode SKU,Kategori (Domestik/KITE),Target Karton/Jam,Berat per Karton (kg)
Biskuit Choco Delight (Domestik),SKU-DOM-01,Domestik,450.0000,12.0000
Wafer Choco Roll (KITE Ekspor),SKU-EXP-02,KITE,600.0000,10.5000
Cookies Vanilla Cream (Domestik),SKU-DOM-03,Domestik,500.0000,11.2500
Cracker Butter Crispy (KITE Ekspor),SKU-EXP-04,KITE,550.0000,9.8000
Marie Susu Balita (Domestik),SKU-DOM-05,Domestik,400.0000,10.0000
Wafer Cokelat Karamel (KITE Ekspor),SKU-EXP-06,KITE,650.0000,10.8000`;

export const SAMPLE_SKU_JSON_TEMPLATE = JSON.stringify(
  [
    {
      name: "Biskuit Choco Delight (Domestik)",
      code: "SKU-DOM-01",
      isKite: false,
      targetHour: 450,
      cartonWeightKg: 12.0
    },
    {
      name: "Wafer Choco Roll (KITE Ekspor)",
      code: "SKU-EXP-02",
      isKite: true,
      targetHour: 600,
      cartonWeightKg: 10.5
    },
    {
      name: "Cookies Vanilla Cream (Domestik)",
      code: "SKU-DOM-03",
      isKite: false,
      targetHour: 500,
      cartonWeightKg: 11.25
    },
    {
      name: "Cracker Butter Crispy (KITE Ekspor)",
      code: "SKU-EXP-04",
      isKite: true,
      targetHour: 550,
      cartonWeightKg: 9.8
    }
  ],
  null,
  2
);

export function parseSkuFile(content: string): SkuParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: SKU[] = [];

  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong atau tidak memiliki data'], warnings: [] };
  }

  // 1. JSON Format parsing
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawList: any[] = Array.isArray(parsed) ? parsed : (parsed.skus || parsed.data || [parsed]);

      rawList.forEach((item, idx) => {
        const rowNum = idx + 1;
        const name = (item.name || item.nama || item.nama_sku || item.sku_name || '').toString().trim();
        if (!name) {
          errors.push(`Baris JSON #${rowNum}: Nama SKU wajib diisi`);
          return;
        }

        const rawKite = item.isKite !== undefined ? item.isKite : (item.is_kite !== undefined ? item.is_kite : (item.kategori || item.category || item.jenis || ''));
        const isKite = parseIsKite(rawKite, name);

        const targetHour = parseFloat(item.targetHour || item.target_hour || item.target_jam || item.target || 450);
        const cartonWeightKg = parseFloat(item.cartonWeightKg || item.carton_weight_kg || item.berat_karton_kg || item.berat_karton || item.weight || item.beratKg || 0);

        if (isNaN(cartonWeightKg) || cartonWeightKg <= 0) {
          errors.push(`Baris JSON #${rowNum} ("${name}"): Berat karton (kg) harus berupa angka positif valid`);
          return;
        }

        let code = (item.code || item.kode || item.kode_sku || '').toString().trim();
        if (!code) {
          code = isKite ? `SKU-EXP-${String(idx + 1).padStart(2, '0')}` : `SKU-DOM-${String(idx + 1).padStart(2, '0')}`;
          warnings.push(`Baris JSON #${rowNum} ("${name}"): Kode SKU dibuat otomatis: ${code}`);
        }

        valid.push({
          id: `sku_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          name,
          code,
          isKite,
          targetHour: isNaN(targetHour) || targetHour <= 0 ? 450 : targetHour,
          cartonWeightKg: parseFloat(cartonWeightKg.toFixed(4))
        });
      });

      return { valid, errors, warnings };
    } catch (e: any) {
      errors.push(`Gagal mem-parsing format JSON: ${e.message}`);
      return { valid: [], errors, warnings };
    }
  }

  // 2. CSV / TSV / Delimited text parsing
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      valid: [],
      errors: ['File CSV harus memiliki minimal 1 baris header dan 1 baris data'],
      warnings: []
    };
  }

  // Detect delimiter: comma, semicolon, or tab
  const headerLine = lines[0];
  let delimiter = ',';
  if (headerLine.includes('\t')) {
    delimiter = '\t';
  } else if (headerLine.includes(';') && (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length) {
    delimiter = ';';
  }

  const rawHeaders = splitDelimitedLine(headerLine, delimiter).map(h => h.trim().toLowerCase());

  // Find column indices
  let nameIdx = -1;
  let codeIdx = -1;
  let kiteIdx = -1;
  let targetIdx = -1;
  let weightIdx = -1;

  rawHeaders.forEach((h, idx) => {
    const clean = h.replace(/[^a-z0-9]/g, '');
    if (clean.includes('namasku') || clean === 'nama' || clean === 'name' || clean === 'namaproduk' || clean === 'produk') {
      if (nameIdx === -1) nameIdx = idx;
    } else if (clean.includes('kodesku') || clean === 'kode' || clean === 'code' || clean === 'sku' || clean === 'sku_code') {
      if (codeIdx === -1) codeIdx = idx;
    } else if (clean.includes('kite') || clean.includes('kategori') || clean.includes('category') || clean.includes('market') || clean.includes('jenis') || clean.includes('tipe') || clean.includes('status')) {
      if (kiteIdx === -1) kiteIdx = idx;
    } else if (clean.includes('target') || clean.includes('speed') || clean.includes('kartonperjam') || clean.includes('ktnjam')) {
      if (targetIdx === -1) targetIdx = idx;
    } else if (clean.includes('berat') || clean.includes('weight') || clean.includes('kg') || clean.includes('bobot')) {
      if (weightIdx === -1) weightIdx = idx;
    }
  });

  // Fallbacks if header labels are completely custom
  if (nameIdx === -1) nameIdx = 0;
  if (codeIdx === -1 && rawHeaders.length > 1) codeIdx = 1;
  if (kiteIdx === -1 && rawHeaders.length > 2) kiteIdx = 2;
  if (targetIdx === -1 && rawHeaders.length > 3) targetIdx = 3;
  if (weightIdx === -1 && rawHeaders.length > 4) weightIdx = 4;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitDelimitedLine(lines[i], delimiter);
    if (cols.length === 0 || cols.every(c => !c.trim())) continue;

    const name = (cols[nameIdx] || '').trim();
    if (!name) {
      errors.push(`Baris #${rowNum}: Nama SKU kosong`);
      continue;
    }

    const rawCode = codeIdx >= 0 ? (cols[codeIdx] || '').trim() : '';
    const rawKite = kiteIdx >= 0 ? (cols[kiteIdx] || '').trim() : '';
    const isKite = parseIsKite(rawKite, name);

    let targetHour = targetIdx >= 0 ? parseFloat(cols[targetIdx]?.replace(',', '.') || '450') : 450;
    if (isNaN(targetHour) || targetHour <= 0) targetHour = 450;

    const rawWeight = weightIdx >= 0 ? cols[weightIdx]?.replace(',', '.') || '' : '';
    const cartonWeightKg = parseFloat(rawWeight);

    if (isNaN(cartonWeightKg) || cartonWeightKg <= 0) {
      errors.push(`Baris #${rowNum} ("${name}"): Berat karton (kg) "${cols[weightIdx] || ''}" tidak valid atau <= 0`);
      continue;
    }

    let code = rawCode;
    if (!code) {
      code = isKite ? `SKU-EXP-${String(i).padStart(2, '0')}` : `SKU-DOM-${String(i).padStart(2, '0')}`;
      warnings.push(`Baris #${rowNum} ("${name}"): Kode SKU tidak tersedia, dibuat otomatis: ${code}`);
    }

    valid.push({
      id: `sku_imp_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      code,
      isKite,
      targetHour,
      cartonWeightKg: parseFloat(cartonWeightKg.toFixed(4))
    });
  }

  return { valid, errors, warnings };
}

function parseIsKite(val: any, skuName: string): boolean {
  if (typeof val === 'boolean') return val;
  const str = String(val || '').toLowerCase().trim();
  if (['kite', 'ekspor', 'export', 'true', '1', 'ya', 'yes', 'y'].includes(str)) {
    return true;
  }
  if (['dom', 'domestik', 'domestic', 'lokal', 'local', 'false', '0', 'tidak', 'no', 'n'].includes(str)) {
    return false;
  }
  // Smart heuristic based on SKU name: if name contains "KITE" or "Ekspor"
  const nameLower = skuName.toLowerCase();
  if (nameLower.includes('kite') || nameLower.includes('ekspor') || nameLower.includes('export')) {
    return true;
  }
  return false;
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideQuote = !insideQuote;
    } else if (char === delimiter && !insideQuote) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(col => col.replace(/^"(.*)"$/, '$1').trim());
}
