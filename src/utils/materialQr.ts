import { Material, StorageLocation } from '../types';

export interface MaterialQrPayload {
  v?: number;
  type?: 'PRODTRACK_MATERIAL';
  materialId?: string;
  code?: string;
  name?: string;
  lot?: string;
  qty?: number;
  loc?: StorageLocation;
}

export interface ParsedMaterialQrResult {
  matchedMaterial: Material | null;
  lotNumber?: string;
  qtyKg?: number;
  location?: StorageLocation;
  rawText: string;
  matchMethod?: 'id' | 'code' | 'name' | 'partial_code';
}

const VALID_LOCATIONS: StorageLocation[] = ['CK', 'WINEROTO', 'STORAGE_TANK'];

function normalizeLocation(val?: string | null): StorageLocation | undefined {
  if (!val) return undefined;
  const upper = val.trim().toUpperCase().replace(/\s+/g, '_');
  if (upper === 'TANK' || upper === 'STORAGE' || upper === 'STORAGETANK') return 'STORAGE_TANK';
  if (VALID_LOCATIONS.includes(upper as StorageLocation)) {
    return upper as StorageLocation;
  }
  return undefined;
}

function normalizeToken(value?: string): string {
  return (value || '').trim().toLowerCase();
}

export function buildMaterialQrPayload(
  material: Material,
  extras?: {
    lotNumber?: string;
    qtyKg?: number;
    location?: StorageLocation;
  }
): string {
  const payload: MaterialQrPayload = {
    v: 1,
    type: 'PRODTRACK_MATERIAL',
    materialId: material.id,
    code: material.code || material.id,
  };

  if (extras?.lotNumber?.trim()) {
    payload.lot = extras.lotNumber.trim();
  }
  if (typeof extras?.qtyKg === 'number' && !Number.isNaN(extras.qtyKg) && extras.qtyKg > 0) {
    payload.qty = parseFloat(extras.qtyKg.toFixed(4));
  }
  if (extras?.location) {
    payload.loc = extras.location;
  }

  return JSON.stringify(payload);
}

function findMaterialByCandidate(
  candidate: { materialId?: string; code?: string; name?: string },
  materials: Material[]
): { material: Material | null; matchMethod?: ParsedMaterialQrResult['matchMethod'] } {
  const idNorm = normalizeToken(candidate.materialId);
  const codeNorm = normalizeToken(candidate.code);
  const nameNorm = normalizeToken(candidate.name);

  if (idNorm) {
    const byId = materials.find((m) => normalizeToken(m.id) === idNorm);
    if (byId) return { material: byId, matchMethod: 'id' };
  }

  if (codeNorm) {
    const byCode = materials.find((m) => normalizeToken(m.code) === codeNorm);
    if (byCode) return { material: byCode, matchMethod: 'code' };

    const byIdAsCode = materials.find((m) => normalizeToken(m.id) === codeNorm);
    if (byIdAsCode) return { material: byIdAsCode, matchMethod: 'id' };
  }

  if (nameNorm) {
    const byName = materials.find((m) => normalizeToken(m.name) === nameNorm);
    if (byName) return { material: byName, matchMethod: 'name' };
  }

  // Fallback for raw single string matched against id, code, or name
  const fallbackToken = idNorm || codeNorm || nameNorm;
  if (fallbackToken) {
    const exactName = materials.find((m) => normalizeToken(m.name) === fallbackToken);
    if (exactName) return { material: exactName, matchMethod: 'name' };

    const partialCode = materials.find(
      (m) =>
        (m.code && normalizeToken(m.code).includes(fallbackToken)) ||
        (fallbackToken.length >= 4 && m.code && fallbackToken.includes(normalizeToken(m.code)))
    );
    if (partialCode) return { material: partialCode, matchMethod: 'partial_code' };
  }

  return { material: null };
}

export function parseMaterialQrScan(rawText: string, materials: Material[]): ParsedMaterialQrResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { matchedMaterial: null, rawText };
  }

  // 1. Try JSON payload: {"materialId":"...","code":"...","lot":"...","qty":25,"loc":"CK"}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const materialId =
        typeof parsed.materialId === 'string'
          ? parsed.materialId
          : typeof parsed.id === 'string'
          ? parsed.id
          : undefined;
      const code =
        typeof parsed.code === 'string'
          ? parsed.code
          : typeof parsed.materialCode === 'string'
          ? parsed.materialCode
          : undefined;
      const name =
        typeof parsed.name === 'string'
          ? parsed.name
          : typeof parsed.materialName === 'string'
          ? parsed.materialName
          : undefined;
      const lotRaw =
        typeof parsed.lot === 'string'
          ? parsed.lot
          : typeof parsed.batchLotNumber === 'string'
          ? parsed.batchLotNumber
          : typeof parsed.lotNumber === 'string'
          ? parsed.lotNumber
          : undefined;
      const qtyRaw =
        typeof parsed.qty === 'number'
          ? parsed.qty
          : typeof parsed.qtyKg === 'number'
          ? parsed.qtyKg
          : typeof parsed.weightKg === 'number'
          ? parsed.weightKg
          : typeof parsed.qty === 'string'
          ? parseFloat(parsed.qty)
          : undefined;
      const locRaw =
        typeof parsed.loc === 'string'
          ? parsed.loc
          : typeof parsed.location === 'string'
          ? parsed.location
          : undefined;

      const found = findMaterialByCandidate({ materialId, code, name }, materials);
      return {
        matchedMaterial: found.material,
        matchMethod: found.matchMethod,
        lotNumber: lotRaw?.trim() || undefined,
        qtyKg: typeof qtyRaw === 'number' && !Number.isNaN(qtyRaw) && qtyRaw > 0 ? qtyRaw : undefined,
        location: normalizeLocation(locRaw),
        rawText: trimmed,
      };
    } catch {
      // Fall through to non-JSON parsers
    }
  }

  // 2. Try URL / query-string format: prodtrack://material?code=...&lot=... or https://...?mat=...
  if (trimmed.includes('://') || trimmed.includes('?')) {
    try {
      const queryPart = trimmed.includes('?') ? trimmed.split('?')[1] : '';
      const params = new URLSearchParams(queryPart);
      const materialId = params.get('materialId') || params.get('id') || undefined;
      const code = params.get('code') || params.get('mat') || undefined;
      const name = params.get('name') || undefined;
      const lot = params.get('lot') || params.get('batch') || undefined;
      const qtyStr = params.get('qty') || params.get('weight');
      const qty = qtyStr ? parseFloat(qtyStr) : undefined;
      const loc = normalizeLocation(params.get('loc') || params.get('location'));

      if (materialId || code || name) {
        const found = findMaterialByCandidate({ materialId, code, name }, materials);
        return {
          matchedMaterial: found.material,
          matchMethod: found.matchMethod,
          lotNumber: lot?.trim() || undefined,
          qtyKg: typeof qty === 'number' && !Number.isNaN(qty) && qty > 0 ? qty : undefined,
          location: loc,
          rawText: trimmed,
        };
      }
    } catch {
      // Fall through
    }
  }

  // 3. Try pipe/semicolon key-value syntax: MAT:MAT-01|LOT:L001|QTY:250|LOC:CK
  if (/[|;]/.test(trimmed) || /^(MAT|PRODTRACK|MATERIAL|CODE)\s*[:=]/i.test(trimmed)) {
    const segments = trimmed.split(/[|;\n]+/).map((s) => s.trim()).filter(Boolean);
    let materialId: string | undefined;
    let code: string | undefined;
    let name: string | undefined;
    let lotNumber: string | undefined;
    let qtyKg: number | undefined;
    let location: StorageLocation | undefined;

    for (const seg of segments) {
      const sepIdx = seg.search(/[:=]/);
      if (sepIdx === -1) {
        if (!code && !materialId) code = seg;
        continue;
      }
      const key = seg.slice(0, sepIdx).trim().toUpperCase();
      const val = seg.slice(sepIdx + 1).trim();
      if (!val) continue;

      if (key === 'ID' || key === 'MATERIALID' || key === 'MAT_ID' || key === 'PRODTRACK') {
        materialId = val;
      } else if (key === 'MAT' || key === 'MATERIAL' || key === 'CODE' || key === 'KODE') {
        code = val;
      } else if (key === 'NAME' || key === 'NAMA') {
        name = val;
      } else if (key === 'LOT' || key === 'BATCH' || key === 'NOLOT') {
        lotNumber = val;
      } else if (key === 'QTY' || key === 'WEIGHT' || key === 'KG') {
        const n = parseFloat(val);
        if (!Number.isNaN(n) && n > 0) qtyKg = n;
      } else if (key === 'LOC' || key === 'LOCATION' || key === 'LOKASI') {
        location = normalizeLocation(val);
      }
    }

    const found = findMaterialByCandidate({ materialId, code, name }, materials);
    if (found.material || materialId || code || name) {
      return {
        matchedMaterial: found.material,
        matchMethod: found.matchMethod,
        lotNumber,
        qtyKg,
        location,
        rawText: trimmed,
      };
    }
  }

  // 4. Plain token matching: direct material code, id, or exact name
  const found = findMaterialByCandidate(
    { materialId: trimmed, code: trimmed, name: trimmed },
    materials
  );
  return {
    matchedMaterial: found.material,
    matchMethod: found.matchMethod,
    rawText: trimmed,
  };
}
