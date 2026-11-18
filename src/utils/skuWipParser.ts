import { SKU, WIP, SkuWip } from '../types';

export interface ParsedSkuWipRow {
  skuWip: SkuWip;
  skuName: string;
  skuCode?: string;
  wipName: string;
  wipCode?: string;
}

export interface SkuWipParseResult {
  valid: ParsedSkuWipRow[];
  errors: string[];
  warnings: string[];
}

export const SAMPLE_SKU_WIP_CSV_TEMPLATE = `Kode SKU,Nama SKU,Kode WIP,Nama WIP,Kebutuhan WIP (kg/karton)
SKU-01,Biskuit Kelapa 250g,WIP-01,Adonan Biskuit Utama,0.2100
SKU-01,Biskuit Kelapa 250g,WIP-02,Krim Vanila Isi,0.0400
SKU-02,Wafer Cokelat Ekspor 400g (KITE),WIP-01,Adonan Biskuit Utama,0.2800
SKU-02,Wafer Cokelat Ekspor 400g (KITE),WIP-03,Coating Cokelat Cair,0.1200`;

export const SAMPLE_SKU_WIP_JSON_TEMPLATE = JSON.stringify(
  [
    {
      skuCode: 'SKU-01',
      skuName: 'Biskuit Kelapa 250g',
      wipCode: 'WIP-01',
      wipName: 'Adonan Biskuit Utama',
      kgWipPerCartonSku: 0.21
    },
    {
      skuCode: 'SKU-01',
      skuName: 'Biskuit Kelapa 250g',
      wipCode: 'WIP-02',
      wipName: 'Krim Vanila Isi',
      kgWipPerCartonSku: 0.04
    },
    {
      skuCode: 'SKU-02',
      skuName: 'Wafer Cokelat Ekspor 400g (KITE)',
      wipCode: 'WIP-01',
      wipName: 'Adonan Biskuit Utama',
      kgWipPerCartonSku: 0.28
    },
    {
      skuCode: 'SKU-02',
      skuName: 'Wafer Cokelat Ekspor 400g (KITE)',
      wipCode: 'WIP-03',
      wipName: 'Coating Cokelat Cair',
      kgWipPerCartonSku: 0.12
    }
  ],
  null,
  2
);

export function buildSkuWipCsvTemplate(skus: SKU[], wips: WIP[]): string {
  if (skus.length > 0 && wips.length > 0) {
    const rows = ['Kode SKU,Nama SKU,Kode WIP,Nama WIP,Kebutuhan WIP (kg/karton)'];
    const samplePairs = Math.min(4, Math.max(skus.length, wips.length));
    for (let i = 0; i < samplePairs; i++) {
      const sku = skus[i % skus.length];
      const wip = wips[i % wips.length];
      const estKg = sku.cartonWeightKg > 0 ? +(sku.cartonWeightKg * 0.65).toFixed(4) : 0.25;
      rows.push(
        `"${sku.code || ''}","${sku.name}","${wip.code || ''}","${wip.name}",${estKg}`
      );
    }
    return rows.join('\n');
  }
  return SAMPLE_SKU_WIP_CSV_TEMPLATE;
}

export function buildSkuWipJsonTemplate(skus: SKU[], wips: WIP[]): string {
  if (skus.length > 0 && wips.length > 0) {
    const samplePairs = Math.min(4, Math.max(skus.length, wips.length));
    const items = [];
    for (let i = 0; i < samplePairs; i++) {
      const sku = skus[i % skus.length];
      const wip = wips[i % wips.length];
      const estKg = sku.cartonWeightKg > 0 ? +(sku.cartonWeightKg * 0.65).toFixed(4) : 0.25;
      items.push({
        skuCode: sku.code || '',
        skuName: sku.name,
        wipCode: wip.code || '',
        wipName: wip.name,
        kgWipPerCartonSku: estKg
      });
    }
    return JSON.stringify(items, null, 2);
  }
  return SAMPLE_SKU_WIP_JSON_TEMPLATE;
}

import {
  findHeaderRowIndex,
  normalizeHeaderName,
  parseBomNumber,
  prepareDelimitedLines,
  splitDelimitedRow,
  stripUtf8Bom
} from './bomCsvHelper';

function resolveSku(
  availableSkus: SKU[],
  skuIdQuery: string,
  skuCodeQuery: string,
  skuNameQuery: string
): SKU | undefined {
  const idQ = skuIdQuery.trim();
  const codeQ = skuCodeQuery.trim().toLowerCase();
  const nameQ = skuNameQuery.trim().toLowerCase();

  if (idQ) {
    const byId = availableSkus.find(s => s.id === idQ);
    if (byId) return byId;
  }
  if (codeQ) {
    const byCode = availableSkus.find(
      s => (s.code && s.code.toLowerCase() === codeQ) || s.name.toLowerCase() === codeQ
    );
    if (byCode) return byCode;
  }
  if (nameQ) {
    const byExactName = availableSkus.find(
      s => s.name.toLowerCase() === nameQ || (s.code && s.code.toLowerCase() === nameQ)
    );
    if (byExactName) return byExactName;

    const byPartialName = availableSkus.find(
      s => s.name.toLowerCase().includes(nameQ) || nameQ.includes(s.name.toLowerCase())
    );
    if (byPartialName) return byPartialName;
  }
  return undefined;
}

function resolveWip(
  availableWips: WIP[],
  wipIdQuery: string,
  wipCodeQuery: string,
  wipNameQuery: string
): WIP | undefined {
  const idQ = wipIdQuery.trim();
  const codeQ = wipCodeQuery.trim().toLowerCase();
  const nameQ = wipNameQuery.trim().toLowerCase();

  if (idQ) {
    const byId = availableWips.find(w => w.id === idQ);
    if (byId) return byId;
  }
  if (codeQ) {
    const byCode = availableWips.find(
      w => (w.code && w.code.toLowerCase() === codeQ) || w.name.toLowerCase() === codeQ
    );
    if (byCode) return byCode;
  }
  if (nameQ) {
    const byExactName = availableWips.find(
      w => w.name.toLowerCase() === nameQ || (w.code && w.code.toLowerCase() === nameQ)
    );
    if (byExactName) return byExactName;

    const byPartialName = availableWips.find(
      w => w.name.toLowerCase().includes(nameQ) || nameQ.includes(w.name.toLowerCase())
    );
    if (byPartialName) return byPartialName;
  }
  return undefined;
}

export function parseSkuWipFile(
  content: string,
  availableSkus: SKU[],
  availableWips: WIP[]
): SkuWipParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: ParsedSkuWipRow[] = [];

  const trimmed = stripUtf8Bom(content).trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong'], warnings: [] };
  }

  if (availableSkus.length === 0) {
    return {
      valid: [],
      errors: ['Database Master SKU masih kosong. Tambahkan atau impor Master SKU terlebih dahulu.'],
      warnings: []
    };
  }

  if (availableWips.length === 0) {
    return {
      valid: [],
      errors: ['Database Master WIP masih kosong. Tambahkan Master WIP terlebih dahulu.'],
      warnings: []
    };
  }

  const dedupMap = new Map<string, ParsedSkuWipRow>();

  const pushEntry = (
    rowLabel: string,
    skuIdQuery: string,
    skuCodeQuery: string,
    skuNameQuery: string,
    wipIdQuery: string,
    wipCodeQuery: string,
    wipNameQuery: string,
    kgVal: number,
    index: number
  ) => {
    const skuMatch = resolveSku(availableSkus, skuIdQuery, skuCodeQuery, skuNameQuery);
    if (!skuMatch) {
      errors.push(`${rowLabel}: SKU "${skuNameQuery || skuCodeQuery || skuIdQuery || '-'}" tidak ditemukan di Master SKU.`);
      return;
    }

    const wipMatch = resolveWip(availableWips, wipIdQuery, wipCodeQuery, wipNameQuery);
    if (!wipMatch) {
      errors.push(`${rowLabel}: WIP "${wipNameQuery || wipCodeQuery || wipIdQuery || '-'}" tidak ditemukan di Master WIP.`);
      return;
    }

    if (isNaN(kgVal) || kgVal <= 0) {
      errors.push(`${rowLabel} (${skuMatch.name} -> ${wipMatch.name}): Kebutuhan WIP (kg/karton) harus lebih dari 0.`);
      return;
    }

    const pairKey = `${skuMatch.id}__${wipMatch.id}`;
    if (dedupMap.has(pairKey)) {
      warnings.push(`${rowLabel}: Duplikat kombinasi ${skuMatch.name} + ${wipMatch.name} di file, menggunakan baris terbaru.`);
    }

    dedupMap.set(pairKey, {
      skuWip: {
        id: `sw_imp_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        skuId: skuMatch.id,
        wipId: wipMatch.id,
        kgWipPerCartonSku: parseFloat(kgVal.toFixed(4))
      },
      skuName: skuMatch.name,
      skuCode: skuMatch.code,
      wipName: wipMatch.name,
      wipCode: wipMatch.code
    });
  };

  // 1. JSON PARSING
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList: any[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (Array.isArray(parsed.skuWips)) {
        rawList = parsed.skuWips;
      } else if (Array.isArray(parsed.master?.skuWips)) {
        rawList = parsed.master.skuWips;
      } else if (Array.isArray(parsed.data?.skuWips)) {
        rawList = parsed.data.skuWips;
      } else if (Array.isArray(parsed.data)) {
        rawList = parsed.data;
      } else {
        errors.push('Format JSON tidak dikenali: tidak menemukan array relasi SKU-WIP');
      }

      rawList.forEach((item, idx) => {
        const skuIdQ = (item.skuId || '').toString();
        const skuCodeQ = (item.skuCode || item.kodeSku || item.codeSku || '').toString();
        const skuNameQ = (item.skuName || item.namaSku || item.sku || '').toString();

        const wipIdQ = (item.wipId || '').toString();
        const wipCodeQ = (item.wipCode || item.kodeWip || item.codeWip || '').toString();
        const wipNameQ = (item.wipName || item.namaWip || item.wip || '').toString();

        const kgVal = parseBomNumber(
          item.kgWipPerCartonSku ??
          item.kgPerCarton ??
          item.kgPerKarton ??
          item.kebutuhanWip ??
          item.kg ??
          item.weight ??
          item.qty
        );

        pushEntry(`Item #${idx + 1}`, skuIdQ, skuCodeQ, skuNameQ, wipIdQ, wipCodeQ, wipNameQ, kgVal, idx);
      });

      dedupMap.forEach(v => valid.push(v));
      if (valid.length === 0 && errors.length === 0) {
        errors.push('Tidak ada data relasi WIP-SKU valid yang ditemukan dalam file JSON.');
      }
      return { valid, errors, warnings };
    } catch (e: any) {
      return { valid: [], errors: [`Gagal mem-parse JSON: ${e.message}`], warnings: [] };
    }
  }

  // 2. CSV / TSV PARSING
  const { lines, delimiter } = prepareDelimitedLines(trimmed);

  if (lines.length < 2) {
    return {
      valid: [],
      errors: ['File CSV/Excel harus memiliki minimal 1 baris header dan 1 baris data'],
      warnings: []
    };
  }

  const { headerIndex, isHeaderDetected } = findHeaderRowIndex(lines, delimiter, [
    'sku',
    'kodesku',
    'namasku',
    'wip',
    'kodewip',
    'namawip',
    'kebutuhan',
    'kgwip',
    'takaran'
  ]);

  const headerRowIdx = isHeaderDetected ? headerIndex : 0;
  const header = splitDelimitedRow(lines[headerRowIdx], delimiter).map(normalizeHeaderName);

  const colSkuCode = header.findIndex(
    h => h === 'kodesku' || h === 'skucode' || h === 'codesku'
  );
  const colSkuName = header.findIndex(
    h => h === 'namasku' || h === 'skuname' || h === 'sku' || h === 'namaproduksku' || h === 'produk'
  );
  const colWipCode = header.findIndex(
    h => h === 'kodewip' || h === 'wipcode' || h === 'codewip'
  );
  const colWipName = header.findIndex(
    h => h === 'namawip' || h === 'wipname' || h === 'wip' || h === 'jeniswip'
  );
  const colKg = header.findIndex(
    h =>
      h.includes('kgwip') ||
      h.includes('kgper') ||
      h.includes('kebutuhan') ||
      h.includes('takaran') ||
      h.includes('berat') ||
      h === 'kg' ||
      h === 'qty'
  );

  // Fallback positional mapping if concise 3-col or 5-col CSV header wasn't matched cleanly
  const use3ColFallback =
    colSkuCode === -1 && colSkuName === -1 && colWipCode === -1 && colWipName === -1 && header.length >= 3;

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const row = splitDelimitedRow(lines[i], delimiter);
    if (row.length === 0 || row.every(c => !c)) continue;

    let skuCodeQ = '';
    let skuNameQ = '';
    let wipCodeQ = '';
    let wipNameQ = '';
    let kgVal = NaN;

    if (use3ColFallback) {
      skuNameQ = row[0] || '';
      wipNameQ = row[1] || '';
      kgVal = parseBomNumber(row[2]);
    } else {
      skuCodeQ = colSkuCode >= 0 ? row[colSkuCode] || '' : '';
      skuNameQ = colSkuName >= 0 ? row[colSkuName] || '' : '';
      wipCodeQ = colWipCode >= 0 ? row[colWipCode] || '' : '';
      wipNameQ = colWipName >= 0 ? row[colWipName] || '' : '';
      kgVal = colKg >= 0 ? parseBomNumber(row[colKg]) : NaN;
    }

    pushEntry(`Baris ${i + 1}`, '', skuCodeQ, skuNameQ, '', wipCodeQ, wipNameQ, kgVal, i);
  }

  dedupMap.forEach(v => valid.push(v));

  if (valid.length === 0 && errors.length === 0) {
    errors.push('Tidak dapat menemukan data relasi WIP-SKU yang valid dalam file.');
  }

  return { valid, errors, warnings };
}
