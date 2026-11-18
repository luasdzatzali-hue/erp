export function stripUtf8Bom(text: string): string {
  return (text || '').replace(/^\uFEFF/, '');
}

/**
 * Parses numeric values from Indonesian or US formatted strings:
 * - "12,5" -> 12.5
 * - "1.250,50" -> 1250.5
 * - "1,250.50" -> 1250.5
 * - "25.0000 kg" -> 25
 * - "0.2100" -> 0.21
 */
export function parseBomNumber(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  if (raw === null || raw === undefined) return NaN;

  let str = String(raw).trim();
  if (!str) return NaN;

  // Keep only digits, comma, dot, minus sign
  str = str.replace(/[^0-9.,-]/g, '');
  if (!str || str === '-' || str === '.' || str === ',') return NaN;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    // Whichever appears last is the decimal separator
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Indonesian/European: 1.250,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US/UK: 1,250.50
      str = str.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      // Multiple commas = thousand separators (1,000,000)
      str = str.replace(/,/g, '');
    } else {
      // Single comma = decimal separator (12,5 -> 12.5)
      str = str.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      // Multiple dots = thousand separators (1.000.000)
      str = str.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Counts occurrences of a delimiter character outside double quotes.
 */
function countUnquotedChar(line: string, target: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === target && !inQuotes) {
      count++;
    }
  }
  return count;
}

/**
 * Splits a single CSV/TSV/semicolon row respecting RFC 4180 quotes and escaped double quotes ("").
 */
export function splitDelimitedRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
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
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());

  return result.map(col => col.replace(/^"(.*)"$/, '$1').trim());
}

/**
 * Normalizes raw CSV/TSV/Excel-exported text:
 * - Strips UTF-8 BOM
 * - Detects optional Excel `sep=;` / `sep=,` / `sep=\t` directive on line 1
 * - Filters blank lines & comment lines (#) & rows that are completely empty cells (e.g. ",,,,")
 * - Auto-detects delimiter across the top non-empty lines
 */
export function prepareDelimitedLines(content: string): {
  lines: string[];
  delimiter: string;
} {
  const clean = stripUtf8Bom(content).trim();
  if (!clean) return { lines: [], delimiter: ',' };

  let rawLines = clean
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  if (rawLines.length === 0) return { lines: [], delimiter: ',' };

  // Handle Microsoft Excel `sep=;` or `sep=,` directive on row 1
  let forcedDelimiter: string | null = null;
  const sepMatch = rawLines[0].match(/^sep=(.|\\t)$/i);
  if (sepMatch) {
    forcedDelimiter = sepMatch[1] === '\\t' ? '\t' : sepMatch[1];
    rawLines = rawLines.slice(1);
  }

  if (rawLines.length === 0) return { lines: [], delimiter: forcedDelimiter || ',' };

  // Detect delimiter across first few lines (ignoring quoted commas/semicolons)
  let delimiter = forcedDelimiter || ',';
  if (!forcedDelimiter) {
    const sampleLines = rawLines.slice(0, 5);
    let tabScore = 0;
    let semiScore = 0;
    let commaScore = 0;
    for (const ln of sampleLines) {
      tabScore += countUnquotedChar(ln, '\t');
      semiScore += countUnquotedChar(ln, ';');
      commaScore += countUnquotedChar(ln, ',');
    }
    if (tabScore > semiScore && tabScore > commaScore) {
      delimiter = '\t';
    } else if (semiScore > commaScore) {
      delimiter = ';';
    } else {
      delimiter = ',';
    }
  }

  // Filter out rows whose cells are all empty (common in Excel exports with formatted blank cells)
  const nonEmptyLines = rawLines.filter(ln => {
    const cells = splitDelimitedRow(ln, delimiter);
    return cells.some(c => c.trim().length > 0);
  });

  return { lines: nonEmptyLines, delimiter };
}

/**
 * Finds the most likely header row index among the first N lines by matching expected keywords.
 * Falls back to 0 if no multi-keyword header row is found.
 */
export function findHeaderRowIndex(
  lines: string[],
  delimiter: string,
  headerKeywords: string[],
  maxScanRows = 8
): { headerIndex: number; isHeaderDetected: boolean } {
  const limit = Math.min(lines.length, maxScanRows);
  let bestIdx = 0;
  let bestMatches = 0;

  for (let i = 0; i < limit; i++) {
    const cols = splitDelimitedRow(lines[i], delimiter).map(c =>
      c.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    const nonEmptyCols = cols.filter(Boolean);
    if (nonEmptyCols.length < 2) continue;

    let matches = 0;
    for (const col of nonEmptyCols) {
      if (headerKeywords.some(kw => col.includes(kw))) {
        matches++;
      }
    }

    if (matches > bestMatches) {
      bestMatches = matches;
      bestIdx = i;
    }
  }

  if (bestMatches >= 2) {
    return { headerIndex: bestIdx, isHeaderDetected: true };
  }

  // Single-keyword fallback check on row 0
  if (lines.length > 0) {
    const row0 = splitDelimitedRow(lines[0], delimiter).map(c =>
      c.toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    if (row0.some(col => headerKeywords.some(kw => col.includes(kw)))) {
      return { headerIndex: 0, isHeaderDetected: true };
    }
  }

  return { headerIndex: 0, isHeaderDetected: false };
}

export function normalizeHeaderName(cell: string): string {
  return (cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
