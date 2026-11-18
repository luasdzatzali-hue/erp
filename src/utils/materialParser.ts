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

import {
  findHeaderRowIndex,
  normalizeHeaderName,
  parseBomNumber,
  prepareDelimitedLines,
  splitDelimitedRow,
  stripUtf8Bom
} from './bomCsvHelper';

export function parseMaterialFile(content: string): ParseResult {
  const errors: string[] = [];
  const valid: Material[] = [];

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
        const rawName = item.name || item.nama || item.namaMaterial || item.nama_material || '';
        if (!rawName || typeof rawName !== 'string') {
          errors.push(`Baris ${rowNum}: Nama material wajib diisi`);
          return;
        }

        const weight = parseBomNumber(
          item.weightKg ?? item.weight ?? item.berat ?? item.beratStandar ?? item.berat_kg
        );
        if (isNaN(weight) || weight <= 0) {
          errors.push(`Baris ${rowNum} (${rawName}): Berat standar harus berupa angka positif`);
          return;
        }

        let type: MaterialType = 'bubuk';
        const rawType = String(item.type || item.tipe || item.jenis || '').toLowerCase();
        if (rawType.includes('liquid') || rawType.includes('cair')) type = 'liquid';
        else if (rawType.includes('padat') || rawType.includes('solid')) type = 'padat';
        else type = 'bubuk';

        let source: MaterialSource = 'GDRM';
        const rawSource = String(item.source || item.sumber || '').toUpperCase();
        if (rawSource.includes('FORMULASI') || rawSource.includes('CUSTOM')) source = 'Formulasi';
        else source = 'GDRM';

        const minAlertRaw = parseBomNumber(item.minStockAlert ?? item.minAlert ?? item.min_alert);
        const minStockAlert = !isNaN(minAlertRaw) && minAlertRaw >= 0 ? minAlertRaw : 50;

        valid.push({
          id: item.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          name: rawName.trim(),
          code: item.code || item.kode ? String(item.code || item.kode).trim() : `MAT-${String(idx + 1).padStart(3, '0')}`,
          type,
          source,
          packaging: item.packaging || item.kemasan ? String(item.packaging || item.kemasan).trim() : `${weight.toFixed(4)} kg`,
          weightKg: weight,
          minStockAlert
        });
      });

      return { valid, errors };
    } catch {
      // If JSON parse failed, fall through to CSV
    }
  }

  // Parse as CSV / Delimited text
  const { lines, delimiter } = prepareDelimitedLines(trimmed);
  if (lines.length === 0) {
    return { valid: [], errors: ['Tidak ada baris data ditemukan'] };
  }

  const { headerIndex, isHeaderDetected } = findHeaderRowIndex(lines, delimiter, [
    'nama',
    'material',
    'name',
    'kode',
    'code',
    'tipe',
    'type',
    'sumber',
    'source',
    'kemasan',
    'packaging',
    'berat',
    'weight'
  ]);

  let nameIdx = 0;
  let codeIdx = 1;
  let typeIdx = 2;
  let sourceIdx = 3;
  let pkgIdx = 4;
  let weightIdx = 5;
  let alertIdx = 6;

  if (isHeaderDetected) {
    const rawHeaders = splitDelimitedRow(lines[headerIndex], delimiter).map(normalizeHeaderName);
    let mName = -1;
    let mCode = -1;
    let mType = -1;
    let mSource = -1;
    let mPkg = -1;
    let mWeight = -1;
    let mAlert = -1;

    rawHeaders.forEach((h, idx) => {
      if (!h) return;
      if (
        mName === -1 &&
        (h.includes('namamaterial') || h === 'nama' || h === 'name' || h === 'material' || h === 'namabahan' || h === 'bahan')
      ) {
        mName = idx;
      } else if (mCode === -1 && (h.includes('kodematerial') || h === 'kode' || h === 'code' || h === 'sku' || h === 'partno')) {
        mCode = idx;
      } else if (mType === -1 && (h === 'tipe' || h === 'type' || h.includes('jenismaterial') || h === 'jenis' || h === 'kategori')) {
        mType = idx;
      } else if (mSource === -1 && (h.includes('sumber') || h.includes('source') || h === 'asal')) {
        mSource = idx;
      } else if (mPkg === -1 && (h.includes('kemasan') || h.includes('pack') || h === 'satuan')) {
        mPkg = idx;
      } else if (mWeight === -1 && (h.includes('berat') || h.includes('weight') || h.includes('bobot') || h === 'kg')) {
        mWeight = idx;
      } else if (mAlert === -1 && (h.includes('alert') || h.includes('min'))) {
        mAlert = idx;
      }
    });

    // Account for an optional leading "No" column if positional fallbacks are needed
    const hasNoCol = rawHeaders[0] === 'no' || rawHeaders[0] === 'nomor' || rawHeaders[0] === 'num';
    const offset = hasNoCol ? 1 : 0;

    if (mName !== -1) nameIdx = mName;
    else nameIdx = 0 + offset;
    if (mCode !== -1) codeIdx = mCode;
    else codeIdx = 1 + offset;
    if (mType !== -1) typeIdx = mType;
    else typeIdx = 2 + offset;
    if (mSource !== -1) sourceIdx = mSource;
    else sourceIdx = 3 + offset;
    if (mPkg !== -1) pkgIdx = mPkg;
    else pkgIdx = 4 + offset;
    if (mWeight !== -1) weightIdx = mWeight;
    else weightIdx = 5 + offset;
    if (mAlert !== -1) alertIdx = mAlert;
    else alertIdx = 6 + offset;
  }

  const startRow = isHeaderDetected ? headerIndex + 1 : 0;
  const dataLines = lines.slice(startRow);

  if (dataLines.length === 0) {
    return { valid: [], errors: ['File hanya berisi header dan belum memiliki baris data material'] };
  }

  dataLines.forEach((line, idx) => {
    const rowNum = startRow + idx + 1;
    const cols = splitDelimitedRow(line, delimiter);

    if (cols.length < 2) {
      errors.push(`Baris ${rowNum}: Format kolom tidak sesuai (ditemukan ${cols.length} kolom)`);
      return;
    }

    const name = (cols[nameIdx] || '').trim();
    if (!name) {
      errors.push(`Baris ${rowNum}: Nama material kosong`);
      return;
    }

    const code = cols[codeIdx] ? cols[codeIdx].trim() : `MAT-${String(idx + 1).padStart(3, '0')}`;
    const rawType = cols[typeIdx] ? cols[typeIdx].toLowerCase() : 'bubuk';
    const rawSource = cols[sourceIdx] ? cols[sourceIdx].toUpperCase() : 'GDRM';
    const packaging = cols[pkgIdx] ? cols[pkgIdx].trim() : '';
    const rawWeightCell = cols[weightIdx] || '';
    const rawAlertCell = cols[alertIdx] || '';

    let type: MaterialType = 'bubuk';
    if (rawType.includes('liquid') || rawType.includes('cair')) type = 'liquid';
    else if (rawType.includes('padat') || rawType.includes('solid')) type = 'padat';

    let source: MaterialSource = 'GDRM';
    if (rawSource.includes('FORMULASI') || rawSource.includes('CUSTOM')) source = 'Formulasi';

    const weight = rawWeightCell.trim() ? parseBomNumber(rawWeightCell) : 25;
    if (isNaN(weight) || weight <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Berat standar "${rawWeightCell}" tidak valid`);
      return;
    }

    const parsedAlert = rawAlertCell.trim() ? parseBomNumber(rawAlertCell) : 50;
    const minAlert = !isNaN(parsedAlert) && parsedAlert >= 0 ? parsedAlert : 50;

    valid.push({
      id: `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
      name,
      code: code || `MAT-${String(idx + 1).padStart(3, '0')}`,
      type,
      source,
      packaging: packaging || `${weight.toFixed(4)} kg`,
      weightKg: weight,
      minStockAlert: minAlert
    });
  });

  return { valid, errors };
}
