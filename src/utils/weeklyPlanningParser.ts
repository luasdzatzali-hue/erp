import * as XLSX from 'xlsx';
import {
  AppState,
  MaterialSource,
  ProductionLine,
  RequestCartItem,
  ShiftNumber,
  SKU,
  WeeklyPlanDayKey,
  WeeklyPlanShiftRow,
  WeeklyPlanSkuItem,
  WeeklyProductionPlan
} from '../types';
import { calculateStockBalances } from './storage';
import { ceilSafe, detectMaterialPackageConfig, hasDecimalPart } from './orderRounding';
import { normalizeProductionLine } from './lineResolver';

export const WEEKLY_PLAN_DAYS: Array<{
  key: WeeklyPlanDayKey;
  label: string;
  shortLabel: string;
  aliases: string[];
}> = [
  { key: 'senin', label: 'Senin', shortLabel: 'Sen', aliases: ['senin', 'mon', 'monday', 'sen'] },
  { key: 'selasa', label: 'Selasa', shortLabel: 'Sel', aliases: ['selasa', 'tue', 'tuesday', 'sel'] },
  { key: 'rabu', label: 'Rabu', shortLabel: 'Rab', aliases: ['rabu', 'wed', 'wednesday', 'rab'] },
  { key: 'kamis', label: 'Kamis', shortLabel: 'Kam', aliases: ['kamis', 'thu', 'thursday', 'kam'] },
  { key: 'jumat', label: 'Jumat', shortLabel: 'Jum', aliases: ['jumat', "jum'at", 'fri', 'friday', 'jum'] },
  { key: 'sabtu', label: 'Sabtu', shortLabel: 'Sab', aliases: ['sabtu', 'sat', 'saturday', 'sab'] },
  { key: 'minggu', label: 'Minggu', shortLabel: 'Min', aliases: ['minggu', 'sun', 'sunday', 'ahad', 'min'] }
];

export function createEmptyDailyCartons(): Record<WeeklyPlanDayKey, number> {
  return {
    senin: 0,
    selasa: 0,
    rabu: 0,
    kamis: 0,
    jumat: 0,
    sabtu: 0,
    minggu: 0
  };
}

export function sumDailyCartons(daily: Record<WeeklyPlanDayKey, number>): number {
  return WEEKLY_PLAN_DAYS.reduce((acc, d) => acc + (Number(daily[d.key]) || 0), 0);
}

/**
 * Parses PPIC carton quantities supporting both Indonesian dot-thousands ("2.936" -> 2936)
 * and US comma-thousands ("1,344" -> 1344, "18,345" -> 18345), plus blanks & "-".
 */
export function parsePlanningCartons(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
  }
  if (raw === null || raw === undefined) return 0;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === '-' || /^off/i.test(trimmed) || /^n\/?a$/i.test(trimmed)) {
    return 0;
  }

  const clean = trimmed.replace(/\s+/g, '');

  // Pattern with repeated 3-digit thousand groups separated by '.' or ',' (e.g. 2.936 or 1,344 or 18,345)
  if (/^\d{1,3}([.,]\d{3})+$/.test(clean)) {
    const digitsOnly = clean.replace(/[.,]/g, '');
    const parsed = parseInt(digitsOnly, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  // Pattern with both comma and dot (e.g. 1,344.00 or 1.344,00)
  if (clean.includes(',') && clean.includes('.')) {
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');
    const normalized =
      lastComma > lastDot
        ? clean.replace(/\./g, '').replace(',', '.')
        : clean.replace(/,/g, '');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }

  // Single separator (e.g. "250,5" or "250.5" where trailing digits != 3)
  const normalized = clean.replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function normalizeToken(val: string): string {
  return String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function matchMasterSku(
  rawCode: string,
  rawName: string,
  masterSkus: SKU[]
): SKU | undefined {
  if (!masterSkus || masterSkus.length === 0) return undefined;
  const codeTrim = (rawCode || '').trim().toLowerCase();
  const nameTrim = (rawName || '').trim().toLowerCase();
  const codeNorm = normalizeToken(rawCode);
  const nameNorm = normalizeToken(rawName);

  // 1. Exact SKU code match
  if (codeTrim) {
    const exactCode = masterSkus.find(s => (s.code || '').trim().toLowerCase() === codeTrim);
    if (exactCode) return exactCode;

    if (codeNorm) {
      const strippedZeros = codeNorm.replace(/^0+/, '');
      const normCodeMatch = masterSkus.find(s => {
        const sc = normalizeToken(s.code || '');
        return sc && (sc === codeNorm || sc.replace(/^0+/, '') === strippedZeros);
      });
      if (normCodeMatch) return normCodeMatch;
    }
  }

  // 2. Exact SKU name match
  if (nameTrim) {
    const exactName = masterSkus.find(s => s.name.trim().toLowerCase() === nameTrim);
    if (exactName) return exactName;
  }

  // 3. Partial / token similarity match on name
  if (nameNorm.length >= 4) {
    const containsMatch = masterSkus.find(s => {
      const sn = normalizeToken(s.name);
      return sn.length >= 4 && (sn.includes(nameNorm) || nameNorm.includes(sn));
    });
    if (containsMatch) return containsMatch;

    const rawTokens = nameTrim
      .split(/[\s\-_/(),.]+/)
      .map(t => t.trim())
      .filter(t => t.length >= 3);
    if (rawTokens.length >= 2) {
      let best: { sku: SKU; score: number } | null = null;
      for (const s of masterSkus) {
        const sTokens = s.name
          .toLowerCase()
          .split(/[\s\-_/(),.]+/)
          .filter(t => t.length >= 3);
        if (sTokens.length === 0) continue;
        const hits = rawTokens.filter(t => sTokens.includes(t)).length;
        const score = hits / Math.max(rawTokens.length, sTokens.length);
        if (score >= 0.55 && (!best || score > best.score)) {
          best = { sku: s, score };
        }
      }
      if (best) return best.sku;
    }
  }

  return undefined;
}

export interface WeeklyPlanParseResult {
  plan: WeeklyProductionPlan | null;
  matchedSkuCount: number;
  unmatchedSkuCount: number;
  warnings: string[];
  errors: string[];
}

function parseDelimitedTextToGrid(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Auto-detect delimiter (comma, semicolon, or tab)
  const sample = lines.slice(0, 12).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const semis = (sample.match(/;/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const delimiter = tabs >= semis && tabs >= commas && tabs > 0 ? '\t' : semis > commas ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    row.push(current.trim());
    return row;
  };

  return lines.map(parseLine);
}

function extractSheetCellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.t === 'd') {
    return String(cell.w || cell.v || '').trim();
  }
  if (cell.t === 'n') {
    // Keep formatted string for Excel date-formatted cells (e.g. 05-Oct), raw integer/number otherwise
    if (cell.w && /[a-zA-Z]/.test(cell.w) && /[-/\s]/.test(cell.w)) {
      return cell.w.trim();
    }
    return String(cell.v ?? cell.w ?? '').trim();
  }
  return String(cell.w ?? cell.v ?? '').trim();
}

function extractGridFromXlsxBuffer(buffer: ArrayBuffer): {
  grid: string[][];
  sheetName: string;
} {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki worksheet.');
  }

  let chosenSheetName = workbook.SheetNames[0];
  let bestScore = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;
    const csvSample = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).slice(0, 4000).toLowerCase();
    let score = 0;
    if (csvSample.includes('rencana produksi')) score += 4;
    if (csvSample.includes('sku')) score += 3;
    if (csvSample.includes('senin') || csvSample.includes('monday')) score += 3;
    if (csvSample.includes('shift')) score += 2;
    if (csvSample.includes('produk')) score += 1;
    if (score > bestScore) {
      bestScore = score;
      chosenSheetName = name;
    }
  }

  const sheet = workbook.Sheets[chosenSheetName];
  if (!sheet || !sheet['!ref']) {
    throw new Error(`Sheet "${chosenSheetName}" kosong.`);
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const rowsCount = Math.min(range.e.r + 1, 500);
  const colsCount = Math.min(range.e.c + 1, 40);

  const grid: string[][] = Array.from({ length: rowsCount }, () => Array(colsCount).fill(''));

  for (let r = 0; r < rowsCount; r++) {
    for (let c = 0; c < colsCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      grid[r][c] = extractSheetCellText(sheet[addr]);
    }
  }

  // Expand merged cells (!merges) across rows & columns (crucial for PPIC 3-shift SKU blocks)
  const merges = sheet['!merges'] || [];
  for (const merge of merges) {
    const topLeftVal = grid[merge.s.r]?.[merge.s.c] ?? '';
    if (!topLeftVal) continue;
    for (let r = merge.s.r; r <= Math.min(merge.e.r, rowsCount - 1); r++) {
      for (let c = merge.s.c; c <= Math.min(merge.e.c, colsCount - 1); c++) {
        if (!grid[r][c]) {
          grid[r][c] = topLeftVal;
        }
      }
    }
  }

  return { grid, sheetName: chosenSheetName };
}

function normalizeHeaderCell(cell: string): string {
  return String(cell || '')
    .toLowerCase()
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDayKeyInHeader(cell: string): WeeklyPlanDayKey | null {
  const norm = normalizeHeaderCell(cell).replace(/[^a-z']/g, '');
  for (const d of WEEKLY_PLAN_DAYS) {
    if (d.aliases.some(a => norm === a || norm.startsWith(a))) {
      return d.key;
    }
  }
  return null;
}

export function parseWeeklyPlanGrid(
  grid: string[][],
  masterSkus: SKU[],
  options?: {
    fileName?: string;
    uploadedBy?: string;
  }
): WeeklyPlanParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!grid || grid.length === 0) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: ['File planning mingguan kosong atau tidak terbaca.']
    };
  }

  // 1. Scan top rows for PPIC metadata (Company, Title, Periode, Week, Departemen)
  let companyHeader = '';
  let title = '';
  let weekLabel = '';
  let periodStart = '';
  let periodEnd = '';
  let department = '';

  const scanLimit = Math.min(12, grid.length);
  for (let r = 0; r < scanLimit; r++) {
    const rowCells = grid[r].map(c => c.trim()).filter(Boolean);
    const joined = rowCells.join(' ');
    if (!joined) continue;

    for (const cell of rowCells) {
      if (!companyHeader && /^pt\.?\s+/i.test(cell)) {
        companyHeader = cell.replace(/\s+/g, ' ');
      }
      if (!title && /rencana\s+produksi|production\s+plan|planning\s+mingguan/i.test(cell)) {
        title = cell.replace(/\s+/g, ' ');
      }
      if (!department && /departemen/i.test(cell)) {
        department = cell.replace(/\s+/g, ' ');
      }
    }

    const weekMatch = joined.match(/\b(WEEK|WK)\s*[-#:]?\s*(\d{1,2})\b/i);
    if (weekMatch && !weekLabel) {
      weekLabel = `WEEK ${weekMatch[2]}`;
    }

    const periodMatch = joined.match(
      /(\d{1,2}[\/\-][A-Za-z0-9]+(?:[\/\-]\d{2,4})?)\s*(?:s\/?d|sd|to|-)\s*(\d{1,2}[\/\-][A-Za-z0-9]+(?:[\/\-]\d{2,4})?)/i
    );
    if (periodMatch && !periodStart) {
      periodStart = periodMatch[1];
      periodEnd = periodMatch[2];
    }
  }

  // 2. Locate table header row
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(20, grid.length); r++) {
    const normCells = grid[r].map(normalizeHeaderCell);
    const hasSkuOrProduct = normCells.some(
      c => c === 'sku' || c.includes('kode sku') || c === 'produk' || c.includes('nama produk') || c.includes('nama sku')
    );
    const hasShiftOrDay = normCells.some(
      c =>
        c === 'shift' ||
        c.includes('senin') ||
        c.includes('selasa') ||
        c.includes('monday') ||
        c.includes('planning karton') ||
        c.includes('target karton') ||
        c.includes('shift 1')
    );
    if (hasSkuOrProduct && hasShiftOrDay) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: [
        'Header tabel planning mingguan tidak ditemukan. Pastikan terdapat kolom SKU/Produk serta Shift atau Hari (Senin–Minggu).'
      ]
    };
  }

  const headerRow = grid[headerRowIdx];
  const subHeaderRow = grid[headerRowIdx + 1] || [];

  let lineCol = -1;
  let skuCol = -1;
  let productCol = -1;
  let carJamCol = -1;
  let noteCol = -1;
  let shiftCol = -1;
  let totalOutputCol = -1;
  let totalProduksiCol = -1;
  let singleCartonCol = -1;
  const shiftWideCols: Partial<Record<ShiftNumber, number>> = {};
  const dayCols: Partial<Record<WeeklyPlanDayKey, number>> = {};
  const dayDates: Partial<Record<WeeklyPlanDayKey, string>> = {};

  for (let c = 0; c < headerRow.length; c++) {
    const h = normalizeHeaderCell(headerRow[c]);
    const sub = normalizeHeaderCell(subHeaderRow[c] || '');
    const combined = `${h} ${sub}`.trim();

    if (lineCol === -1 && (h === 'line' || h.startsWith('line '))) {
      lineCol = c;
      continue;
    }
    if (skuCol === -1 && (h === 'sku' || h.includes('kode sku') || h === 'sku code')) {
      skuCol = c;
      continue;
    }
    if (
      productCol === -1 &&
      (h === 'produk' || h === 'product' || h.includes('nama produk') || h.includes('nama sku'))
    ) {
      productCol = c;
      continue;
    }
    if (carJamCol === -1 && (h.includes('car / jam') || h.includes('car/jam') || h.includes('ktn/jam'))) {
      carJamCol = c;
      continue;
    }
    if (
      noteCol === -1 &&
      (combined.includes('konfirmasi') || combined.includes('keterangan') || h === 'status' || h === 'catatan')
    ) {
      noteCol = c;
      continue;
    }
    if (shiftCol === -1 && h === 'shift') {
      shiftCol = c;
      continue;
    }
    if (h === 'shift 1' || h === 's1') {
      shiftWideCols[1] = c;
      continue;
    }
    if (h === 'shift 2' || h === 's2') {
      shiftWideCols[2] = c;
      continue;
    }
    if (h === 'shift 3' || h === 's3') {
      shiftWideCols[3] = c;
      continue;
    }
    if (totalOutputCol === -1 && h.includes('total output')) {
      totalOutputCol = c;
      continue;
    }
    if (totalProduksiCol === -1 && (h.includes('total produksi') || h.includes('total minggu'))) {
      totalProduksiCol = c;
      continue;
    }
    if (
      singleCartonCol === -1 &&
      (h.includes('planning karton') || h.includes('jumlah karton') || h.includes('target karton') || h === 'karton')
    ) {
      singleCartonCol = c;
      continue;
    }

    const dayKey = findDayKeyInHeader(headerRow[c]);
    if (dayKey && dayCols[dayKey] === undefined) {
      dayCols[dayKey] = c;
      // Extract date from subHeaderRow if it looks like 05-Oct / 05/10 / 2026-10-05
      const rawSub = (subHeaderRow[c] || '').trim();
      if (rawSub && /\d/.test(rawSub) && !/^[123]$/.test(rawSub)) {
        dayDates[dayKey] = rawSub;
      }
    }
  }

  // Check if header spans 2 rows (e.g. subHeaderRow has dates or 'Konfirmasi Pabrik')
  let dataStartRow = headerRowIdx + 1;
  if (subHeaderRow.length > 0) {
    const subLooksLikeSubHeader = subHeaderRow.some(cell => {
      const s = normalizeHeaderCell(cell);
      return (
        s.includes('fdis') ||
        s.includes('end stok') ||
        s.includes('konfirmasi') ||
        /^\d{1,2}[-\/][a-zA-Z]{3}/.test(s)
      );
    });
    if (subLooksLikeSubHeader) {
      dataStartRow = headerRowIdx + 2;
    }
  }

  const hasDailyColumns = Object.keys(dayCols).length > 0;
  const hasShiftWideColumns = Object.keys(shiftWideCols).length > 0;

  if (!hasDailyColumns && !hasShiftWideColumns && singleCartonCol === -1) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: [
        'Tidak ditemukan kolom hari (Senin–Minggu) maupun kolom jumlah karton planning.'
      ]
    };
  }

  // 3. Parse data rows, supporting vertically merged 3-shift PPIC blocks & flat tables
  const itemsMap = new Map<string, WeeklyPlanSkuItem>();
  const orderedItemKeys: string[] = [];

  let currentPlantUnit = '';
  let activeBlockKey = '';
  let lastLine = '';
  let lastRawCode = '';
  let lastRawProduct = '';
  let lastTargetPerHour = 0;
  let lastStatusNote = '';
  let blockCounter = 0;

  for (let r = dataStartRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every(c => !c || !c.trim())) continue;

    const firstCell = (row[0] || '').trim();
    const rowSkuCode = skuCol >= 0 ? (row[skuCol] || '').trim() : '';
    const rowProduct = productCol >= 0 ? (row[productCol] || '').trim() : '';
    const rowLine = lineCol >= 0 ? (row[lineCol] || '').trim() : '';
    const rowShiftRaw = shiftCol >= 0 ? (row[shiftCol] || '').trim() : '';
    const rowNote = noteCol >= 0 ? (row[noteCol] || '').trim() : '';
    const rowCarJam = carJamCol >= 0 ? parsePlanningCartons(row[carJamCol]) : 0;

    // Detect Unit/Plant banner row like "UB1" (single label in first cols, no shift & no day numbers)
    const nonEmptyCount = row.filter(c => c && c.trim().length > 0).length;
    if (
      nonEmptyCount <= 2 &&
      firstCell &&
      !rowShiftRaw &&
      !/^\d{4,}$/.test(rowSkuCode) &&
      !hasDailyColumnsWithNumbers(row, dayCols)
    ) {
      if (!/total|grand/i.test(firstCell)) {
        currentPlantUnit = firstCell;
      }
      continue;
    }

    // Ignore summary / grand total rows
    if (/^(grand\s+)?total(\s+all)?$/i.test(firstCell) || /^total$/i.test(rowProduct)) {
      continue;
    }

    // Handle wide format: Shift 1 / Shift 2 / Shift 3 on same row (e.g. simple template)
    if (hasShiftWideColumns && (rowSkuCode || rowProduct)) {
      const matched = matchMasterSku(rowSkuCode, rowProduct, masterSkus);
      const shifts: WeeklyPlanShiftRow[] = ([1, 2, 3] as ShiftNumber[]).map(sh => {
        const colIdx = shiftWideCols[sh];
        const qty = colIdx !== undefined ? parsePlanningCartons(row[colIdx]) : 0;
        const daily = createEmptyDailyCartons();
        daily.senin = qty;
        return { shift: sh, dailyCartons: daily, totalOutput: qty };
      });
      const totalProd = shifts.reduce((acc, s) => acc + s.totalOutput, 0);
      const isOff = /off\s*produksi/i.test(rowNote) && totalProd === 0;
      const itemId = `wpi_${++blockCounter}_${normalizeToken(rowSkuCode || rowProduct).slice(0, 12) || 'sku'}`;
      itemsMap.set(itemId, {
        id: itemId,
        plantUnit: currentPlantUnit || undefined,
        line: rowLine || '-',
        rawSkuCode: rowSkuCode || matched?.code || '-',
        rawProductName: rowProduct || matched?.name || rowSkuCode,
        matchedSkuId: matched?.id,
        targetPerHour: rowCarJam || matched?.targetHour || undefined,
        statusNote: rowNote || undefined,
        isOffProduction: isOff,
        shifts,
        totalProduksi: totalProd
      });
      orderedItemKeys.push(itemId);
      continue;
    }

    // Determine Shift number (1, 2, or 3)
    let shiftNum: ShiftNumber | null = null;
    if (rowShiftRaw) {
      const m = rowShiftRaw.match(/[123]/);
      if (m) {
        shiftNum = Number(m[0]) as ShiftNumber;
      }
    } else if (singleCartonCol >= 0 || hasDailyColumns) {
      shiftNum = 1;
    }

    if (!shiftNum) {
      // Could be a trailing note row
      continue;
    }

    // Determine if this row starts a NEW SKU block or continues the previous block (merged CSV rows!)
    const hasExplicitIdentity = Boolean(rowSkuCode || rowProduct);
    const identityChanged =
      hasExplicitIdentity &&
      (rowSkuCode !== lastRawCode ||
        rowProduct !== lastRawProduct ||
        (rowLine && rowLine !== lastLine));

    const startsNewBlock =
      !activeBlockKey ||
      identityChanged ||
      (shiftNum === 1 &&
        itemsMap.get(activeBlockKey)?.shifts.some(s => s.shift === 1 && s.totalOutput >= 0 && hasExplicitIdentity === false && r > dataStartRow && (itemsMap.get(activeBlockKey)?.shifts.filter(x => x.dailyCartons !== undefined).length || 0) >= 3));

    if (startsNewBlock && hasExplicitIdentity) {
      blockCounter++;
      lastLine = rowLine || lastLine || '-';
      lastRawCode = rowSkuCode;
      lastRawProduct = rowProduct;
      lastTargetPerHour = rowCarJam;
      lastStatusNote = rowNote;

      const matched = matchMasterSku(lastRawCode, lastRawProduct, masterSkus);
      activeBlockKey = `wpi_${blockCounter}_${normalizeToken(lastRawCode || lastRawProduct).slice(0, 14) || 'row'}`;

      const item: WeeklyPlanSkuItem = {
        id: activeBlockKey,
        plantUnit: currentPlantUnit || undefined,
        line: lastLine,
        rawSkuCode: lastRawCode || matched?.code || '-',
        rawProductName: lastRawProduct || matched?.name || lastRawCode,
        matchedSkuId: matched?.id,
        targetPerHour: lastTargetPerHour || matched?.targetHour || undefined,
        statusNote: lastStatusNote || undefined,
        isOffProduction: /off\s*produksi/i.test(lastStatusNote),
        shifts: [],
        totalProduksi: 0
      };
      itemsMap.set(activeBlockKey, item);
      orderedItemKeys.push(activeBlockKey);
    } else if (!activeBlockKey) {
      // Shift row appeared before any SKU row -> skip with warning
      warnings.push(`Baris ${r + 1}: Shift ${shiftNum} ditemukan tanpa identitas SKU/Produk, dilewati.`);
      continue;
    }

    const currentItem = itemsMap.get(activeBlockKey);
    if (!currentItem) continue;

    // Build daily cartons for this shift
    const daily = createEmptyDailyCartons();
    if (hasDailyColumns) {
      for (const d of WEEKLY_PLAN_DAYS) {
        const col = dayCols[d.key];
        if (col !== undefined) {
          daily[d.key] = parsePlanningCartons(row[col]);
        }
      }
    } else if (singleCartonCol >= 0) {
      daily.senin = parsePlanningCartons(row[singleCartonCol]);
    }

    const computedSum = sumDailyCartons(daily);
    const explicitOutput =
      totalOutputCol >= 0 ? parsePlanningCartons(row[totalOutputCol]) : 0;
    const shiftTotal = computedSum > 0 ? computedSum : explicitOutput;

    const existingShiftIdx = currentItem.shifts.findIndex(s => s.shift === shiftNum);
    if (existingShiftIdx >= 0) {
      // Merge (in case same SKU appeared twice cleanly)
      for (const d of WEEKLY_PLAN_DAYS) {
        currentItem.shifts[existingShiftIdx].dailyCartons[d.key] += daily[d.key];
      }
      currentItem.shifts[existingShiftIdx].totalOutput = sumDailyCartons(
        currentItem.shifts[existingShiftIdx].dailyCartons
      );
    } else {
      currentItem.shifts.push({
        shift: shiftNum,
        dailyCartons: daily,
        totalOutput: shiftTotal
      });
    }

    if (rowNote && !currentItem.statusNote) {
      currentItem.statusNote = rowNote;
    }
    if (/off\s*produksi/i.test(rowNote || currentItem.statusNote || '')) {
      currentItem.isOffProduction = currentItem.shifts.every(s => s.totalOutput === 0);
    }
  }

  // Finalize items (ensure Shifts 1, 2, 3 are sorted and present, recompute totalProduksi)
  const finalItems: WeeklyPlanSkuItem[] = [];
  for (const key of orderedItemKeys) {
    const it = itemsMap.get(key);
    if (!it) continue;
    for (const sh of [1, 2, 3] as ShiftNumber[]) {
      if (!it.shifts.some(s => s.shift === sh)) {
        it.shifts.push({
          shift: sh,
          dailyCartons: createEmptyDailyCartons(),
          totalOutput: 0
        });
      }
    }
    it.shifts.sort((a, b) => a.shift - b.shift);
    it.totalProduksi = it.shifts.reduce((acc, s) => acc + s.totalOutput, 0);
    if (it.totalProduksi > 0) {
      it.isOffProduction = false;
    } else if (/off\s*produksi/i.test(it.statusNote || '')) {
      it.isOffProduction = true;
    }
    finalItems.push(it);
  }

  if (finalItems.length === 0) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings,
      errors: [
        'Tidak ada baris SKU planning yang valid terbaca dari file. Periksa kolom SKU, Produk, dan Shift.'
      ]
    };
  }

  const matchedSkuCount = finalItems.filter(i => Boolean(i.matchedSkuId)).length;
  const unmatchedSkuCount = finalItems.length - matchedSkuCount;

  if (unmatchedSkuCount > 0) {
    warnings.push(
      `${unmatchedSkuCount} dari ${finalItems.length} baris SKU belum otomatis cocok dengan Master SKU BOM. Anda dapat menautkannya manual pada tabel pratinjau.`
    );
  }

  const resolvedWeek = weekLabel || `WEEK ${getIsoWeekNumber(new Date())}`;
  const plan: WeeklyProductionPlan = {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: title || `RENCANA PRODUKSI MINGGUAN (${resolvedWeek})`,
    weekLabel: resolvedWeek,
    periodStart: periodStart || '-',
    periodEnd: periodEnd || '-',
    department: department || 'DEPARTEMEN PPIC',
    companyHeader: companyHeader || undefined,
    dayDates: Object.keys(dayDates).length > 0 ? dayDates : undefined,
    uploadedAt: new Date().toISOString(),
    uploadedBy: options?.uploadedBy,
    sourceFileName: options?.fileName,
    items: finalItems
  };

  return {
    plan,
    matchedSkuCount,
    unmatchedSkuCount,
    warnings,
    errors
  };
}

function hasDailyColumnsWithNumbers(
  row: string[],
  dayCols: Partial<Record<WeeklyPlanDayKey, number>>
): boolean {
  for (const d of WEEKLY_PLAN_DAYS) {
    const col = dayCols[d.key];
    if (col !== undefined && parsePlanningCartons(row[col]) > 0) return true;
  }
  return false;
}

function getIsoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Parses a local uploaded File (.xlsx, .xls, .ods, .csv, .tsv, .json)
 */
export async function readAndParseWeeklyPlanFile(
  file: File,
  masterSkus: SKU[],
  uploadedBy?: string
): Promise<WeeklyPlanParseResult> {
  if (!file) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: ['Tidak ada file yang dipilih.']
    };
  }
  if (file.size === 0) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: [`File "${file.name}" kosong (0 byte).`]
    };
  }

  const lowerName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  // Check JSON first
  if (lowerName.endsWith('.json')) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '').trim();
    return parseWeeklyPlanTextOrJson(text, masterSkus, { fileName: file.name, uploadedBy });
  }

  // Binary Excel (.xlsx, .xls, .xlsm, .ods)
  const bytes = new Uint8Array(buffer);
  const isZipOrOle =
    (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) ||
    (bytes.length >= 4 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0);

  if (
    isZipOrOle ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.xlsm') ||
    lowerName.endsWith('.ods')
  ) {
    try {
      const { grid } = extractGridFromXlsxBuffer(buffer);
      return parseWeeklyPlanGrid(grid, masterSkus, { fileName: file.name, uploadedBy });
    } catch (err: any) {
      // Fallback if `.xls` is actually plain CSV text
      const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
      if (text.trim().length > 0 && !text.includes('\u0000')) {
        return parseWeeklyPlanTextOrJson(text, masterSkus, { fileName: file.name, uploadedBy });
      }
      return {
        plan: null,
        matchedSkuCount: 0,
        unmatchedSkuCount: 0,
        warnings: [],
        errors: [err?.message || 'Gagal membaca workbook Excel planning mingguan.']
      };
    }
  }

  // CSV / TSV / TXT
  const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
  return parseWeeklyPlanTextOrJson(text, masterSkus, { fileName: file.name, uploadedBy });
}

export function parseWeeklyPlanTextOrJson(
  content: string,
  masterSkus: SKU[],
  options?: { fileName?: string; uploadedBy?: string }
): WeeklyPlanParseResult {
  const trimmed = (content || '').trim();
  if (!trimmed) {
    return {
      plan: null,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      warnings: [],
      errors: ['Konten planning mingguan kosong.']
    };
  }

  // JSON format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const rawArr: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.items)
        ? parsed.items
        : [];
      if (rawArr.length > 0) {
        const items: WeeklyPlanSkuItem[] = rawArr.map((row: any, idx: number) => {
          const code = String(row.rawSkuCode || row.skuCode || row.sku || '').trim();
          const name = String(row.rawProductName || row.skuName || row.produk || '').trim();
          const matched = matchMasterSku(code, name, masterSkus);

          let shifts: WeeklyPlanShiftRow[] = [];
          if (Array.isArray(row.shifts)) {
            shifts = ([1, 2, 3] as ShiftNumber[]).map(sh => {
              const found = row.shifts.find((s: any) => Number(s.shift) === sh);
              const daily = createEmptyDailyCartons();
              if (found?.dailyCartons) {
                for (const d of WEEKLY_PLAN_DAYS) {
                  daily[d.key] = parsePlanningCartons(found.dailyCartons[d.key]);
                }
              }
              return { shift: sh, dailyCartons: daily, totalOutput: sumDailyCartons(daily) };
            });
          } else {
            shifts = ([1, 2, 3] as ShiftNumber[]).map(sh => {
              const daily = createEmptyDailyCartons();
              const val = parsePlanningCartons(row[`shift${sh}`] ?? (sh === 1 ? row.cartons : 0));
              daily.senin = val;
              return { shift: sh, dailyCartons: daily, totalOutput: val };
            });
          }
          const totalProduksi = shifts.reduce((a, s) => a + s.totalOutput, 0);
          return {
            id: `wpi_${Date.now()}_${idx}`,
            plantUnit: row.plantUnit || undefined,
            line: String(row.line || '-'),
            rawSkuCode: code || matched?.code || '-',
            rawProductName: name || matched?.name || code,
            matchedSkuId: matched?.id,
            targetPerHour: Number(row.targetPerHour || matched?.targetHour || 0) || undefined,
            statusNote: row.statusNote ? String(row.statusNote) : undefined,
            isOffProduction: Boolean(row.isOffProduction) && totalProduksi === 0,
            shifts,
            totalProduksi
          };
        });

        const matchedCount = items.filter(i => Boolean(i.matchedSkuId)).length;
        return {
          plan: {
            id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: String(parsed.title || 'RENCANA PRODUKSI MINGGUAN'),
            weekLabel: String(parsed.weekLabel || `WEEK ${getIsoWeekNumber(new Date())}`),
            periodStart: String(parsed.periodStart || '-'),
            periodEnd: String(parsed.periodEnd || '-'),
            department: String(parsed.department || 'DEPARTEMEN PPIC'),
            uploadedAt: new Date().toISOString(),
            uploadedBy: options?.uploadedBy,
            sourceFileName: options?.fileName,
            items
          },
          matchedSkuCount: matchedCount,
          unmatchedSkuCount: items.length - matchedCount,
          warnings: [],
          errors: []
        };
      }
    } catch {
      // fall through to CSV parser
    }
  }

  const grid = parseDelimitedTextToGrid(trimmed);
  return parseWeeklyPlanGrid(grid, masterSkus, options);
}

/**
 * Generates sample CSV matching the attached PPIC "RENCANA PRODUKSI MINGGUAN" sheet
 * (using the workspace's active SKUs when available so users can immediately test BOM matching!).
 */
export function buildSampleWeeklyPlanCsv(masterSkus: SKU[] = []): string {
  const s1 = masterSkus[0];
  const s2 = masterSkus[1];
  const s3 = masterSkus[2];

  const row1Code = s1?.code || '421185';
  const row1Name = s1?.name || 'SUPERSTAR TWIN DB 12X12X25G TH';
  const row1Rate = s1?.targetHour || 168;

  const row2Code = s2?.code || '421626';
  const row2Name = s2?.name || 'SUPERSTAR Jar 10X30X12,5g';
  const row2Rate = s2?.targetHour || 162;

  const row3Code = s3?.code || '410370';
  const row3Name = s3?.name || 'KALPA JAR GT 8JARX25PCX9G';
  const row3Rate = s3?.targetHour || 367;

  return [
    'PT. MAYORA INDAH DIV. WAFER,,RENCANA PRODUKSI MINGGUAN,,,,,,,,,,,,,,,DEPARTEMEN PPIC',
    'PERIODE :,05/Okt s/d 11/Okt,(WEEK 41),,,,,,,,,,,,,,,',
    'Line,SKU,Produk,Car / Jam,Konfirmasi Pabrik,Shift,Senin,Selasa,Rabu,Kamis,Jumat,Sabtu,Minggu,Total Output,Total Produksi',
    ',,,,,,05-Oct,06-Oct,07-Oct,08-Oct,09-Oct,10-Oct,11-Oct,,',
    'UB1,,,,,,,,,,,,,,',
    `1,${row1Code},"${row1Name}",${row1Rate},MENYELESAIKAN QUOTATION,1,"1,344","1,344","1,137","1,137","1,188",,,"6,150","18,345"`,
    `,,,,,2,"1,344","1,137","1,137","1,137","1,344",,,"6,098",`,
    `,,,,,3,"1,344","1,137","1,137","1,137","1,344",,,"6,098",`,
    `1,${row2Code},"${row2Name}",${row2Rate},TARGET EKSPOR KITE,1,,,200,200,150,,,550,"1,750"`,
    `,,,,,2,,200,200,200,,,,600,`,
    `,,,,,3,,200,200,200,,,,600,`,
    `2,${row3Code},"${row3Name}",${row3Rate},9 BULAN,1,2.936,,,,,,,2.936,8.808`,
    `,,,,,2,2.936,,,,,,,2.936,`,
    `,,,,,3,2.936,,,,,,,2.936,`
  ].join('\n');
}

/**
 * Generates and downloads an authentic .xlsx Excel template with merged 3-shift SKU cells
 * matching the attached PPIC Rencana Produksi Mingguan format.
 */
export function downloadWeeklyPlanningTemplateXlsx(masterSkus: SKU[] = []): void {
  const s1 = masterSkus[0];
  const s2 = masterSkus[1];
  const s3 = masterSkus[2];

  const rows: any[][] = [
    ['PT. MAYORA INDAH DIV. WAFER', '', 'RENCANA PRODUKSI MINGGUAN', '', '', '', '', '', '', '', '', '', '', '', 'DEPARTEMEN PPIC'],
    ['', '', 'PERIODE :', '05/Okt s/d 11/Okt', '(WEEK 41)', '', '', '', '', '', '', '', '', '', ''],
    ['Line', 'SKU', 'Produk', 'Car / Jam', 'Konfirmasi Pabrik', 'Shift', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu', 'Total Output', 'Total Produksi'],
    ['', '', '', '', '', '', '05-Oct', '06-Oct', '07-Oct', '08-Oct', '09-Oct', '10-Oct', '11-Oct', '', ''],
    ['UB1', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [1, s1?.code || '421185', s1?.name || 'SUPERSTAR TWIN DB 12X12X25G TH', s1?.targetHour || 168, 'MENYELESAIKAN QUOTATION', 1, 1344, 1344, 1137, 1137, 1188, 0, 0, 6150, 18345],
    ['', '', '', '', '', 2, 1344, 1137, 1137, 1137, 1344, 0, 0, 6098, ''],
    ['', '', '', '', '', 3, 1344, 1137, 1137, 1137, 1344, 0, 0, 6098, ''],
    [1, s2?.code || '421626', s2?.name || 'SUPERSTAR Jar 10X30X12,5g', s2?.targetHour || 162, 'TARGET EKSPOR', 1, 0, 0, 200, 200, 150, 0, 0, 550, 1750],
    ['', '', '', '', '', 2, 0, 200, 200, 200, 0, 0, 0, 600, ''],
    ['', '', '', '', '', 3, 0, 200, 200, 200, 0, 0, 0, 600, ''],
    [2, s3?.code || '410370', s3?.name || 'KALPA JAR GT 8JARX25PCX9G', s3?.targetHour || 367, '9 BULAN', 1, 2936, 0, 0, 0, 0, 0, 0, 2936, 8808],
    ['', '', '', '', '', 2, 2936, 0, 0, 0, 0, 0, 0, 2936, ''],
    ['', '', '', '', '', 3, 2936, 0, 0, 0, 0, 0, 0, 2936, '']
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = [
    // Title merges
    { s: { r: 0, c: 0 }, e: { r: 1, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 13 } },
    // Merge Line, SKU, Produk, Car/Jam, Konfirmasi, Total Produksi across Shift 1..3 for each SKU block
    ...[5, 8, 11].flatMap(startRow => [
      { s: { r: startRow, c: 0 }, e: { r: startRow + 2, c: 0 } },
      { s: { r: startRow, c: 1 }, e: { r: startRow + 2, c: 1 } },
      { s: { r: startRow, c: 2 }, e: { r: startRow + 2, c: 2 } },
      { s: { r: startRow, c: 3 }, e: { r: startRow + 2, c: 3 } },
      { s: { r: startRow, c: 4 }, e: { r: startRow + 2, c: 4 } },
      { s: { r: startRow, c: 14 }, e: { r: startRow + 2, c: 14 } }
    ])
  ];

  ws['!cols'] = [
    { wch: 7 },
    { wch: 11 },
    { wch: 36 },
    { wch: 10 },
    { wch: 24 },
    { wch: 7 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 14 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Planning Mingguan');
  XLSX.writeFile(wb, 'Template_Planning_Mingguan_PPIC.xlsx');
}

// ============================================================================
// WEEKLY PLAN -> MATERIAL REQUIREMENT EXPLOSION (SUPPLIER ORDER REFERENCE)
// ============================================================================

export interface WeeklyPlanExplosionOptions {
  selectedDays: WeeklyPlanDayKey[];
  selectedShifts: ShiftNumber[];
  selectedItemIds?: string[]; // if omitted, include all active non-off matched items
  lineFilter?: string;
  orderMode: 'FULL_NEED' | 'DEFICIT_ONLY';
  batchRoundMode: 'EXACT' | 'CEIL_BATCH';
  packagingRoundMode?: 'ROUND_UP' | 'EXACT';
  allowancePercent?: number; // 0, 3, 5, 7
}

export interface WeeklyPlanWipNeed {
  lineId: string;
  lineName: string;
  wipId: string;
  wipName: string;
  wipCode: string;
  totalCartons: number;
  wipKgNeeded: number;
  batchWeightKg: number;
  exactBatches: number;
  usedBatches: number;
  contributingSkus: Array<{
    skuId: string;
    skuName: string;
    skuCode?: string;
    isKite: boolean;
    cartons: number;
  }>;
}

export interface WeeklyPlanMaterialRequirement {
  key: string; // `${lineId}__${wipId}__${materialId}`
  lineId: string;
  lineName: string;
  materialId: string;
  materialName: string;
  materialCode?: string;
  materialType: string;
  packaging: string;
  supplier: MaterialSource;
  wipId: string;
  wipName: string;
  wipCode: string;
  primarySkuId: string;
  primarySkuName: string;
  primarySkuCode?: string;
  primarySkuIsKite: boolean;
  contributingSkusLabel: string;
  batchCount: number;
  theoreticalQtyKg: number;
  currentStockKg: number;
  deficitKg: number;
  orderBaseBeforeAllowanceKg?: number;
  allowancePercent?: number;
  allowanceKg?: number;
  orderBaseKg: number;
  isGdrmSolid: boolean;
  isPackagedOrder?: boolean;
  packUnitLabel?: string;
  bagSizeKg?: number;
  bagCount?: number;
  finalOrderQtyKg: number;
  surplusKg: number;
  recipeCodeUsed?: string;
}

export interface WeeklyPlanExplosionResult {
  totalPlannedCartons: number;
  includedSkuCount: number;
  matchedSkuCount: number;
  unmatchedItems: WeeklyPlanSkuItem[];
  skusMissingBom: Array<{ item: WeeklyPlanSkuItem; skuName: string }>;
  wipNeeds: WeeklyPlanWipNeed[];
  materialRequirements: WeeklyPlanMaterialRequirement[];
  totalTheoreticalKg: number;
  totalFinalOrderKg: number;
  totalGdrmBags: number;
  scopeSummaryLabel: string;
}

export function getPlannedCartonsForItem(
  item: WeeklyPlanSkuItem,
  selectedDays: WeeklyPlanDayKey[],
  selectedShifts: ShiftNumber[]
): number {
  let sum = 0;
  for (const sh of item.shifts) {
    if (!selectedShifts.includes(sh.shift)) continue;
    for (const d of selectedDays) {
      sum += Number(sh.dailyCartons[d]) || 0;
    }
  }
  return sum;
}

export function detectGdrmBagSizeKg(packaging: string, weightKg: number): number {
  const pkg = (packaging || '').toLowerCase();
  if (pkg.includes('15') || weightKg === 15) return 15;
  if (pkg.includes('20') || weightKg === 20) return 20;
  if (pkg.includes('50') || weightKg === 50) return 50;
  return 25;
}

export function calculateWeeklyPlanMaterialRequirements(
  plan: WeeklyProductionPlan,
  state: AppState,
  options: WeeklyPlanExplosionOptions
): WeeklyPlanExplosionResult {
  const {
    selectedDays,
    selectedShifts,
    selectedItemIds,
    lineFilter,
    orderMode,
    batchRoundMode,
    packagingRoundMode = 'ROUND_UP',
    allowancePercent = 0
  } = options;

  const stockBalances = calculateStockBalances(state);
  const wipNeedsMap = new Map<string, WeeklyPlanWipNeed>();
  const unmatchedItems: WeeklyPlanSkuItem[] = [];
  const skusMissingBom: Array<{ item: WeeklyPlanSkuItem; skuName: string }> = [];

  let totalPlannedCartons = 0;
  let includedSkuCount = 0;
  let matchedSkuCount = 0;

  for (const item of plan.items) {
    if (lineFilter && lineFilter !== 'ALL' && item.line !== lineFilter) continue;
    if (selectedItemIds && !selectedItemIds.includes(item.id)) continue;

    const itemCartons = getPlannedCartonsForItem(item, selectedDays, selectedShifts);
    if (itemCartons <= 0 || item.isOffProduction) continue;

    includedSkuCount++;
    totalPlannedCartons += itemCartons;

    const sku = item.matchedSkuId
      ? state.master.skus.find(s => s.id === item.matchedSkuId)
      : undefined;

    if (!sku) {
      unmatchedItems.push(item);
      continue;
    }

    matchedSkuCount++;

    const skuWipLinks = state.master.skuWips.filter(sw => sw.skuId === sku.id);
    if (skuWipLinks.length === 0) {
      skusMissingBom.push({ item, skuName: sku.name });
      continue;
    }

    const resolvedLine = normalizeProductionLine(
      item.line,
      state.master.productionLines
    ) || {
      lineId: 'line_umum',
      lineName: 'Line Umum',
      lineCode: 'UMUM'
    };

    for (const sw of skuWipLinks) {
      const wip = state.master.wips.find(w => w.id === sw.wipId);
      if (!wip) continue;
      const wipKgForSku = itemCartons * (sw.kgWipPerCartonSku || 0);
      if (wipKgForSku <= 0) continue;

      const wipLineKey = `${resolvedLine.lineId}__${wip.id}`;
      let existing = wipNeedsMap.get(wipLineKey);
      if (!existing) {
        existing = {
          lineId: resolvedLine.lineId,
          lineName: resolvedLine.lineName,
          wipId: wip.id,
          wipName: wip.name,
          wipCode: wip.code || wip.id,
          totalCartons: 0,
          wipKgNeeded: 0,
          batchWeightKg: wip.batchWeightKg || 1,
          exactBatches: 0,
          usedBatches: 0,
          contributingSkus: []
        };
        wipNeedsMap.set(wipLineKey, existing);
      }

      existing.totalCartons += itemCartons;
      existing.wipKgNeeded += wipKgForSku;

      const prevSkuEntry = existing.contributingSkus.find(cs => cs.skuId === sku.id);
      if (prevSkuEntry) {
        prevSkuEntry.cartons += itemCartons;
      } else {
        existing.contributingSkus.push({
          skuId: sku.id,
          skuName: sku.name,
          skuCode: sku.code,
          isKite: sku.isKite,
          cartons: itemCartons
        });
      }
    }
  }

  // Compute batches per WIP and explode to materials (default recipe first, fallback wipMats)
  const wipNeeds: WeeklyPlanWipNeed[] = [];
  const matReqMap = new Map<string, WeeklyPlanMaterialRequirement>();

  for (const wipNeed of wipNeedsMap.values()) {
    const exact = wipNeed.batchWeightKg > 0 ? wipNeed.wipKgNeeded / wipNeed.batchWeightKg : 0;
    const used =
      batchRoundMode === 'CEIL_BATCH'
        ? exact <= 0
          ? 0
          : hasDecimalPart(exact)
          ? ceilSafe(exact)
          : Math.round(exact)
        : exact;
    wipNeed.exactBatches = exact;
    wipNeed.usedBatches = used;
    wipNeeds.push(wipNeed);

    if (used <= 0) continue;

    // Look for default recipe (or first recipe) for this WIP
    const wipRecipes = (state.master.recipes || []).filter(r => r.wipId === wipNeed.wipId);
    const activeRecipe = wipRecipes.find(r => r.isDefault) || wipRecipes[0];

    const recipeComponents: Array<{ materialId: string; kgPerBatch: number; recipeCode?: string }> =
      activeRecipe && activeRecipe.items && activeRecipe.items.length > 0
        ? activeRecipe.items.map(ri => ({
            materialId: ri.materialId,
            kgPerBatch: ri.amountKg,
            recipeCode: activeRecipe.recipeCode
          }))
        : state.master.wipMats
            .filter(wm => wm.wipId === wipNeed.wipId)
            .map(wm => ({
              materialId: wm.materialId,
              kgPerBatch: wm.materialKgPerBatch
            }));

    const primarySku = wipNeed.contributingSkus[0];
    const contributingSkusLabel =
      wipNeed.contributingSkus.length > 1
        ? `${primarySku.skuName} (+${wipNeed.contributingSkus.length - 1} SKU: ${wipNeed.totalCartons.toLocaleString('id-ID')} ktn)`
        : `${primarySku.skuName} (${primarySku.cartons.toLocaleString('id-ID')} ktn)`;

    for (const comp of recipeComponents) {
      const mat = state.master.materials.find(m => m.id === comp.materialId);
      if (!mat || comp.kgPerBatch <= 0) continue;

      const matKey = `${wipNeed.lineId}__${wipNeed.wipId}__${mat.id}`;
      const addedKg = used * comp.kgPerBatch;
      const stockAtual = stockBalances[mat.id]?.totalActual || 0;

      let req = matReqMap.get(matKey);
      if (!req) {
        req = {
          key: matKey,
          lineId: wipNeed.lineId,
          lineName: wipNeed.lineName,
          materialId: mat.id,
          materialName: mat.name,
          materialCode: mat.code,
          materialType: mat.type,
          packaging: mat.packaging,
          supplier: mat.source || 'GDRM',
          wipId: wipNeed.wipId,
          wipName: wipNeed.wipName,
          wipCode: wipNeed.wipCode,
          primarySkuId: primarySku.skuId,
          primarySkuName: primarySku.skuName,
          primarySkuCode: primarySku.skuCode,
          primarySkuIsKite: primarySku.isKite,
          contributingSkusLabel,
          batchCount: used,
          theoreticalQtyKg: 0,
          currentStockKg: stockAtual,
          deficitKg: 0,
          orderBaseKg: 0,
          isGdrmSolid: false,
          finalOrderQtyKg: 0,
          surplusKg: 0,
          recipeCodeUsed: comp.recipeCode
        };
        matReqMap.set(matKey, req);
      }

      req.theoreticalQtyKg += addedKg;
    }
  }

  // Finalize stock deficit, optional allowance (3%, 5%, 7%), & packaging rounding
  const safeAllowancePercent =
    Number.isFinite(allowancePercent) && allowancePercent > 0 ? allowancePercent : 0;
  const allowanceMultiplier = 1 + safeAllowancePercent / 100;

  const materialRequirements: WeeklyPlanMaterialRequirement[] = [];
  for (const req of matReqMap.values()) {
    req.deficitKg = Math.max(0, req.theoreticalQtyKg - req.currentStockKg);
    const baseNeedBeforeAllowance =
      orderMode === 'DEFICIT_ONLY' ? req.deficitKg : req.theoreticalQtyKg;

    if (baseNeedBeforeAllowance <= 0.0001) {
      req.orderBaseBeforeAllowanceKg = 0;
      req.allowancePercent = safeAllowancePercent;
      req.allowanceKg = 0;
      req.orderBaseKg = 0;
      req.finalOrderQtyKg = 0;
      req.surplusKg = 0;
      materialRequirements.push(req);
      continue;
    }

    req.orderBaseBeforeAllowanceKg = Number(baseNeedBeforeAllowance.toFixed(4));
    req.allowancePercent = safeAllowancePercent;
    req.orderBaseKg = Number((baseNeedBeforeAllowance * allowanceMultiplier).toFixed(4));
    req.allowanceKg = Math.max(
      0,
      Number((req.orderBaseKg - req.orderBaseBeforeAllowanceKg).toFixed(4))
    );

    const mat = state.master.materials.find(m => m.id === req.materialId);
    const pkgCfg = detectMaterialPackageConfig(mat);
    const isSolid =
      req.supplier === 'GDRM' && (req.materialType === 'bubuk' || req.materialType === 'padat');
    req.isGdrmSolid = isSolid;

    const shouldRoundPackage =
      packagingRoundMode !== 'EXACT' &&
      pkgCfg.hasDiscretePackaging &&
      pkgCfg.defaultPackSizeKg > 0;

    if (shouldRoundPackage) {
      const bagSize = isSolid
        ? mat?.weightKg && mat.weightKg > 0
          ? mat.weightKg
          : detectGdrmBagSizeKg(req.packaging, 25)
        : pkgCfg.defaultPackSizeKg;
      const bagCount = Math.max(1, ceilSafe(req.orderBaseKg / bagSize));
      const finalQty = Number((bagCount * bagSize).toFixed(4));
      req.isPackagedOrder = true;
      req.packUnitLabel = pkgCfg.unitLabel || (isSolid ? 'Zak' : 'Kemasan');
      req.bagSizeKg = bagSize;
      req.bagCount = bagCount;
      req.finalOrderQtyKg = finalQty;
      req.surplusKg = Math.max(0, Number((finalQty - req.orderBaseKg).toFixed(4)));
    } else if (packagingRoundMode !== 'EXACT' && hasDecimalPart(req.orderBaseKg)) {
      const finalQty = ceilSafe(req.orderBaseKg);
      req.isPackagedOrder = false;
      req.packUnitLabel = pkgCfg.unitLabel;
      req.finalOrderQtyKg = finalQty;
      req.surplusKg = Math.max(0, Number((finalQty - req.orderBaseKg).toFixed(4)));
    } else {
      req.isPackagedOrder = false;
      req.packUnitLabel = pkgCfg.unitLabel;
      req.finalOrderQtyKg = req.orderBaseKg;
      req.surplusKg = 0;
    }

    materialRequirements.push(req);
  }

  // Sort by Production Line, then Supplier (GDRM first, then Formulasi), then WIP Name, then Material Name
  materialRequirements.sort((a, b) => {
    if (a.lineName !== b.lineName) return a.lineName.localeCompare(b.lineName);
    if (a.supplier !== b.supplier) return a.supplier.localeCompare(b.supplier);
    if (a.wipName !== b.wipName) return a.wipName.localeCompare(b.wipName);
    return a.materialName.localeCompare(b.materialName);
  });

  const dayDesc =
    selectedDays.length === 7
      ? 'Senin–Minggu (1 Minggu)'
      : selectedDays
          .map(d => WEEKLY_PLAN_DAYS.find(x => x.key === d)?.shortLabel || d)
          .join(', ');
  const shiftDesc =
    selectedShifts.length === 3
      ? 'Shift 1, 2, 3'
      : selectedShifts.map(s => `Shift ${s}`).join(' & ');

  return {
    totalPlannedCartons,
    includedSkuCount,
    matchedSkuCount,
    unmatchedItems,
    skusMissingBom,
    wipNeeds,
    materialRequirements,
    totalTheoreticalKg: materialRequirements.reduce((a, m) => a + m.theoreticalQtyKg, 0),
    totalFinalOrderKg: materialRequirements.reduce((a, m) => a + m.finalOrderQtyKg, 0),
    totalGdrmBags: materialRequirements.reduce((a, m) => a + (m.bagCount || 0), 0),
    scopeSummaryLabel: `${plan.weekLabel} • ${dayDesc} • ${shiftDesc}`
  };
}

export function convertPlanMaterialsToCartItems(
  requirements: WeeklyPlanMaterialRequirement[],
  scopeSummaryLabel: string
): RequestCartItem[] {
  const nowStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return requirements
    .filter(r => r.finalOrderQtyKg > 0.0001)
    .map((req, idx) => {
      const hasPack = Boolean((req.isPackagedOrder || req.isGdrmSolid) && req.bagCount && req.bagSizeKg);
      const unitLabel = req.packUnitLabel || 'Zak';
      const batchVal = hasDecimalPart(req.batchCount)
        ? Number(req.batchCount.toFixed(4))
        : Math.round(req.batchCount);

      const allowanceTag =
        req.allowancePercent && req.allowancePercent > 0
          ? ` • Allowance +${req.allowancePercent}%`
          : '';

      return {
        id: `cart_plan_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        lineId: req.lineId,
        lineName: req.lineName,
        skuId: req.primarySkuId,
        skuName: req.contributingSkusLabel,
        skuCode: req.primarySkuCode,
        isKite: req.primarySkuIsKite,
        wipId: req.wipId,
        wipName: req.wipName,
        materialId: req.materialId,
        materialName: req.materialName,
        materialCode: req.materialCode,
        materialType: req.materialType,
        qty: req.finalOrderQtyKg,
        theoreticalQty: req.orderBaseKg,
        baseTheoreticalQty: req.orderBaseBeforeAllowanceKg,
        allowancePercent:
          req.allowancePercent && req.allowancePercent > 0 ? req.allowancePercent : undefined,
        packageSizeKg: hasPack ? req.bagSizeKg : undefined,
        packageCount: hasPack ? req.bagCount : undefined,
        surplusKg: req.surplusKg,
        batch: batchVal,
        saldoAwal: req.currentStockKg,
        supplier: req.supplier,
        shift: 1,
        notes: hasPack
          ? `[${req.lineName} • Planning ${scopeSummaryLabel}${allowanceTag}] ${req.bagCount} ${unitLabel} @ ${req.bagSizeKg} kg (Butuh: ${req.orderBaseKg.toFixed(2)} kg)`
          : `[${req.lineName} • Planning ${scopeSummaryLabel}${allowanceTag}] ${batchVal} batch WIP`,
        addedAt: nowStr
      };
    });
}
