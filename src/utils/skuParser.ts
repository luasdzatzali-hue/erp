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

import {
  findHeaderRowIndex,
  normalizeHeaderName,
  parseBomNumber,
  prepareDelimitedLines,
  splitDelimitedRow,
  stripUtf8Bom
} from './bomCsvHelper';

export function parseSkuFile(content: string): SkuParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: SKU[] = [];

  const trimmed = stripUtf8Bom(content).trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong atau tidak memiliki data'], warnings: [] };
  }

  // 1. JSON Format parsing
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList: any[] = [];
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (Array.isArray(parsed.skus)) {
        rawList = parsed.skus;
      } else if (Array.isArray(parsed.master?.skus)) {
        rawList = parsed.master.skus;
      } else if (Array.isArray(parsed.data?.skus)) {
        rawList = parsed.data.skus;
      } else if (Array.isArray(parsed.data)) {
        rawList = parsed.data;
      } else {
        rawList = [parsed];
      }

      rawList.forEach((item, idx) => {
        const rowNum = idx + 1;
        const name = (item.name || item.nama || item.nama_sku || item.sku_name || '').toString().trim();
        if (!name) {
          errors.push(`Baris JSON #${rowNum}: Nama SKU wajib diisi`);
          return;
        }

        const rawKite = item.isKite !== undefined ? item.isKite : (item.is_kite !== undefined ? item.is_kite : (item.kategori || item.category || item.jenis || ''));
        const isKite = parseIsKite(rawKite, name);

        const targetHour = parseBomNumber(item.targetHour ?? item.target_hour ?? item.target_jam ?? item.target ?? 450);
        const cartonWeightKg = parseBomNumber(item.cartonWeightKg ?? item.carton_weight_kg ?? item.berat_karton_kg ?? item.berat_karton ?? item.weight ?? item.beratKg ?? 0);

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
  const { lines, delimiter } = prepareDelimitedLines(trimmed);
  if (lines.length < 2) {
    return {
      valid: [],
      errors: ['File CSV/Excel harus memiliki minimal 1 baris header dan 1 baris data'],
      warnings: []
    };
  }

  const { headerIndex, isHeaderDetected } = findHeaderRowIndex(lines, delimiter, [
    'namasku',
    'nama',
    'name',
    'produk',
    'kodesku',
    'kode',
    'code',
    'kite',
    'kategori',
    'target',
    'berat',
    'weight'
  ]);

  const headerRowIdx = isHeaderDetected ? headerIndex : 0;
  const rawHeaders = splitDelimitedRow(lines[headerRowIdx], delimiter).map(normalizeHeaderName);

  // Find column indices
  let nameIdx = -1;
  let codeIdx = -1;
  let kiteIdx = -1;
  let targetIdx = -1;
  let weightIdx = -1;

  rawHeaders.forEach((clean, idx) => {
    if (!clean) return;
    if (clean.includes('namasku') || clean === 'nama' || clean === 'name' || clean === 'namaproduk' || clean === 'produk') {
      if (nameIdx === -1) nameIdx = idx;
    } else if (clean.includes('kodesku') || clean === 'kode' || clean === 'code' || clean === 'sku' || clean === 'skucode') {
      if (codeIdx === -1) codeIdx = idx;
    } else if (clean.includes('kite') || clean.includes('kategori') || clean.includes('category') || clean.includes('market') || clean.includes('jenis') || clean.includes('tipe') || clean.includes('status')) {
      if (kiteIdx === -1) kiteIdx = idx;
    } else if (clean.includes('target') || clean.includes('speed') || clean.includes('kartonperjam') || clean.includes('ktnjam')) {
      if (targetIdx === -1) targetIdx = idx;
    } else if (clean.includes('berat') || clean.includes('weight') || clean.includes('kg') || clean.includes('bobot')) {
      if (weightIdx === -1) weightIdx = idx;
    }
  });

  // Account for optional leading "No" column
  const hasNoCol = rawHeaders[0] === 'no' || rawHeaders[0] === 'nomor' || rawHeaders[0] === 'num';
  const offset = hasNoCol ? 1 : 0;

  if (nameIdx === -1) nameIdx = 0 + offset;
  if (codeIdx === -1 && rawHeaders.length > 1 + offset) codeIdx = 1 + offset;
  if (kiteIdx === -1 && rawHeaders.length > 2 + offset) kiteIdx = 2 + offset;
  if (targetIdx === -1 && rawHeaders.length > 3 + offset) targetIdx = 3 + offset;
  if (weightIdx === -1 && rawHeaders.length > 4 + offset) weightIdx = 4 + offset;

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = splitDelimitedRow(lines[i], delimiter);
    if (cols.length === 0 || cols.every(c => !c.trim())) continue;

    const name = (cols[nameIdx] || '').trim();
    if (!name) {
      errors.push(`Baris #${rowNum}: Nama SKU kosong`);
      continue;
    }

    const rawCode = codeIdx >= 0 ? (cols[codeIdx] || '').trim() : '';
    const rawKite = kiteIdx >= 0 ? (cols[kiteIdx] || '').trim() : '';
    const isKite = parseIsKite(rawKite, name);

    let targetHour = targetIdx >= 0 && cols[targetIdx]?.trim() ? parseBomNumber(cols[targetIdx]) : 450;
    if (isNaN(targetHour) || targetHour <= 0) targetHour = 450;

    const rawWeight = weightIdx >= 0 ? cols[weightIdx] || '' : '';
    const cartonWeightKg = parseBomNumber(rawWeight);

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
