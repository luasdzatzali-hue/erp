import { WipTank, WipTankType, WipTankStatus, WIP, ProductionMachine } from '../types';

export interface TankParseResult {
  valid: WipTank[];
  errors: string[];
}

export const SAMPLE_TANK_CSV_TEMPLATE = `Kode Tangki,Nama Tangki,Tipe,Kapasitas (kg),Level Awal (kg),Formula WIP,Mesin Pengisi,Suhu (°C),Agitator,Min Alert (kg),Status,Catatan
HT-01,Holding Tank Sirup Karamel #1,HOLDING_TANK,600,480,WIP Sirup Glukosa & Karamel,CK-01,49.5,ON,100,ACTIVE,Penampung antara sebelum dosing ke mixer adonan
HT-02,Holding Tank Buffer Adonan #2,HOLDING_TANK,800,620,WIP Adonan Utama Biskuit,"MX-01, CK-01",28.2,ON,150,ACTIVE,Buffer feeding adonan terisi dari MX-01 dan CK-01
ST-WIP-01,Storage Tank WIP Coating Ekspor,STORAGE_TANK,2500,1950,WIP Cream Wafer Cokelat,"ENR-01, EXT-01",43.0,ON,400,ACTIVE,Tangki penyimpanan utama WIP coating bersumber dari Enrober & Extruder
ST-WIP-02,Storage Tank Bulk Sirup Reserve,STORAGE_TANK,3000,2400,WIP Sirup Glukosa & Karamel,CK-01,47.0,OFF,500,ACTIVE,Penyimpanan sirup glukosa curah kapasitas besar
HT-03,Holding Tank Fast Batch Coating #3,HOLDING_TANK,500,390,WIP Cream Wafer Cokelat,ENR-01,42.5,ON,80,ACTIVE,Holding tank sirkulasi return untuk enrober line 2`;

export const SAMPLE_TANK_JSON_TEMPLATE = JSON.stringify(
  [
    {
      code: "HT-01",
      name: "Holding Tank Sirup Karamel #1",
      type: "HOLDING_TANK",
      capacityKg: 600,
      currentLevelKg: 480,
      wipName: "WIP Sirup Glukosa & Karamel",
      machineCodes: ["CK-01"],
      temp: 49.5,
      agitatorStatus: "ON",
      minAlertKg: 100,
      status: "ACTIVE",
      notes: "Penampung antara sebelum dosing ke mixer adonan"
    },
    {
      code: "HT-02",
      name: "Holding Tank Buffer Adonan #2",
      type: "HOLDING_TANK",
      capacityKg: 800,
      currentLevelKg: 620,
      wipName: "WIP Adonan Utama Biskuit",
      machineCodes: ["MX-01", "CK-01"],
      temp: 28.2,
      agitatorStatus: "ON",
      minAlertKg: 150,
      status: "ACTIVE",
      notes: "Multi-mesin: Buffer feeding adonan terisi dari MX-01 dan CK-01"
    },
    {
      code: "ST-WIP-01",
      name: "Storage Tank WIP Coating Ekspor",
      type: "STORAGE_TANK",
      capacityKg: 2500,
      currentLevelKg: 1950,
      wipName: "WIP Cream Wafer Cokelat",
      machineCodes: ["ENR-01", "EXT-01"],
      temp: 43.0,
      agitatorStatus: "ON",
      minAlertKg: 400,
      status: "ACTIVE",
      notes: "Tangki penyimpanan utama bersumber dari 2 unit mesin"
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

export function parseTankFile(
  content: string,
  availableWips: WIP[],
  availableMachines: ProductionMachine[]
): TankParseResult {
  const errors: string[] = [];
  const valid: WipTank[] = [];

  const trimmed = stripUtf8Bom(content).trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong'] };
  }

  // Helper to resolve WIP ID from name, code, or ID
  const resolveWipId = (rawWip: string): string | undefined => {
    if (!rawWip) return undefined;
    const clean = rawWip.trim().toLowerCase();
    const match = availableWips.find(
      w =>
        w.id.toLowerCase() === clean ||
        w.name.toLowerCase() === clean ||
        (w.code && w.code.toLowerCase() === clean) ||
        clean.includes(w.name.toLowerCase()) ||
        w.name.toLowerCase().includes(clean)
    );
    return match ? match.id : undefined;
  };

  // Helper to resolve Machine IDs from string or array of codes/IDs
  const resolveMachineIds = (rawMachines: any): string[] => {
    if (!rawMachines) return [];
    let tokens: string[] = [];
    if (Array.isArray(rawMachines)) {
      tokens = rawMachines.map(m => String(m).trim());
    } else if (typeof rawMachines === 'string') {
      tokens = rawMachines.split(/[,;/+]+/).map(t => t.trim()).filter(Boolean);
    }

    const matchedIds: string[] = [];
    tokens.forEach(tok => {
      const cleanTok = tok.toLowerCase();
      const match = availableMachines.find(
        m =>
          m.code.toLowerCase() === cleanTok ||
          m.id.toLowerCase() === cleanTok ||
          m.name.toLowerCase() === cleanTok ||
          m.name.toLowerCase().includes(cleanTok)
      );
      if (match && !matchedIds.includes(match.id)) {
        matchedIds.push(match.id);
      }
    });

    return matchedIds;
  };

  // 1. JSON Parsing
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList: any[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed.tanks && Array.isArray(parsed.tanks)) {
        rawList = parsed.tanks;
      } else if (parsed.master?.tanks && Array.isArray(parsed.master.tanks)) {
        rawList = parsed.master.tanks;
      } else if (parsed.data?.tanks && Array.isArray(parsed.data.tanks)) {
        rawList = parsed.data.tanks;
      } else {
        return {
          valid: [],
          errors: ['Format JSON tidak berisi daftar tangki yang valid (array tanks tidak ditemukan)']
        };
      }

      rawList.forEach((item, idx) => {
        const rowNum = idx + 1;
        const code = (item.code || item.kode || `TK-${String(idx + 1).padStart(2, '0')}`).toString().trim();
        const name = (item.name || item.nama || '').toString().trim();

        if (!name) {
          errors.push(`Baris ${rowNum}: Nama tangki wajib diisi`);
          return;
        }

        const capacity = parseBomNumber(item.capacityKg ?? item.capacity ?? item.kapasitas ?? 600);
        if (isNaN(capacity) || capacity <= 0) {
          errors.push(`Baris ${rowNum} (${name}): Kapasitas tangki harus angka positif`);
          return;
        }

        const rawType = String(item.type || item.tipe || '').toUpperCase();
        const type: WipTankType = rawType.includes('STORAGE') ? 'STORAGE_TANK' : 'HOLDING_TANK';

        const currentLevel = parseBomNumber(item.currentLevelKg ?? item.level ?? 0) || 0;
        const temp = parseBomNumber(item.temp ?? item.suhu ?? 45.0) || 45.0;
        const agitator: 'ON' | 'OFF' = String(item.agitatorStatus || item.agitator || 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON';
        const minAlert = parseBomNumber(item.minAlertKg ?? item.minAlert ?? capacity * 0.2) || capacity * 0.2;

        let status: WipTankStatus = 'ACTIVE';
        const rawStatus = String(item.status || '').toUpperCase();
        if (rawStatus.includes('STANDBY')) status = 'STANDBY';
        else if (rawStatus.includes('CLEAN')) status = 'CLEANING';
        else if (rawStatus.includes('MAINT')) status = 'MAINTENANCE';
        else if (rawStatus.includes('EMPTY')) status = 'EMPTY';

        const assignedWipId =
          item.assignedWipId ||
          resolveWipId(item.wipName || item.wip || item.formula || '');

        const assignedMachineIds = resolveMachineIds(
          item.assignedMachineIds || item.machineCodes || item.machines || item.assignedMachineId
        );

        valid.push({
          id: item.id || `tank_imp_${Date.now()}_${idx}`,
          code,
          name,
          type,
          capacityKg: capacity,
          currentLevelKg: Math.min(capacity, Math.max(0, currentLevel)),
          assignedWipId,
          assignedMachineIds,
          assignedMachineId: assignedMachineIds[0] || undefined,
          temp,
          agitatorStatus: agitator,
          status,
          minAlertKg: minAlert,
          notes: item.notes || item.catatan || undefined
        });
      });

      return { valid, errors };
    } catch {
      // If JSON parse failed, fall through to CSV parser
    }
  }

  // 2. Delimited CSV/TSV Parsing
  const { lines, delimiter } = prepareDelimitedLines(trimmed);
  if (lines.length === 0) {
    return { valid: [], errors: ['Tidak ada baris data ditemukan'] };
  }

  const { headerIndex, isHeaderDetected } = findHeaderRowIndex(lines, delimiter, [
    'kode',
    'code',
    'nama',
    'name',
    'tangki',
    'tank',
    'kapasitas',
    'capacity',
    'level',
    'wip',
    'mesin',
    'suhu',
    'temp'
  ]);

  let codeIdx = 0;
  let nameIdx = 1;
  let typeIdx = 2;
  let capIdx = 3;
  let levelIdx = 4;
  let wipIdx = 5;
  let machIdx = 6;
  let tempIdx = 7;
  let agitatorIdx = 8;
  let alertIdx = 9;
  let statusIdx = 10;
  let notesIdx = 11;

  if (isHeaderDetected) {
    const rawHeaders = splitDelimitedRow(lines[headerIndex], delimiter).map(normalizeHeaderName);
    let mCode = -1, mName = -1, mType = -1, mCap = -1, mLevel = -1;
    let mWip = -1, mMach = -1, mTemp = -1, mAgit = -1, mAlert = -1, mStat = -1, mNotes = -1;

    rawHeaders.forEach((h, idx) => {
      if (!h) return;
      if (mCode === -1 && (h.includes('kodetangki') || h === 'kode' || h === 'code')) mCode = idx;
      else if (mName === -1 && (h.includes('namatangki') || h === 'nama' || h === 'name' || h === 'tangki')) mName = idx;
      else if (mType === -1 && (h === 'tipe' || h === 'type' || h === 'jenis')) mType = idx;
      else if (mCap === -1 && (h.includes('kapasitas') || h.includes('capacity'))) mCap = idx;
      else if (mLevel === -1 && (h.includes('level') || h.includes('isi'))) mLevel = idx;
      else if (mWip === -1 && (h.includes('wip') || h.includes('formula'))) mWip = idx;
      else if (mMach === -1 && (h.includes('mesin') || h.includes('machine'))) mMach = idx;
      else if (mTemp === -1 && (h.includes('suhu') || h.includes('temp'))) mTemp = idx;
      else if (mAgit === -1 && h.includes('agitator')) mAgit = idx;
      else if (mAlert === -1 && (h.includes('alert') || h.includes('min'))) mAlert = idx;
      else if (mStat === -1 && h.includes('status')) mStat = idx;
      else if (mNotes === -1 && (h.includes('catatan') || h.includes('note') || h.includes('ket'))) mNotes = idx;
    });

    const hasNoCol = rawHeaders[0] === 'no' || rawHeaders[0] === 'nomor' || rawHeaders[0] === 'num';
    const offset = hasNoCol ? 1 : 0;

    codeIdx = mCode !== -1 ? mCode : 0 + offset;
    nameIdx = mName !== -1 ? mName : 1 + offset;
    typeIdx = mType !== -1 ? mType : 2 + offset;
    capIdx = mCap !== -1 ? mCap : 3 + offset;
    levelIdx = mLevel !== -1 ? mLevel : 4 + offset;
    wipIdx = mWip !== -1 ? mWip : 5 + offset;
    machIdx = mMach !== -1 ? mMach : 6 + offset;
    tempIdx = mTemp !== -1 ? mTemp : 7 + offset;
    agitatorIdx = mAgit !== -1 ? mAgit : 8 + offset;
    alertIdx = mAlert !== -1 ? mAlert : 9 + offset;
    statusIdx = mStat !== -1 ? mStat : 10 + offset;
    notesIdx = mNotes !== -1 ? mNotes : 11 + offset;
  }

  const startRow = isHeaderDetected ? headerIndex + 1 : 0;
  const dataLines = lines.slice(startRow);

  if (dataLines.length === 0) {
    return { valid: [], errors: ['File hanya berisi header dan belum memiliki baris data tangki'] };
  }

  dataLines.forEach((line, idx) => {
    const rowNum = startRow + idx + 1;
    const cols = splitDelimitedRow(line, delimiter);

    if (cols.length < 2) {
      errors.push(`Baris ${rowNum}: Format kolom tidak sesuai`);
      return;
    }

    const code = (cols[codeIdx] || '').trim() || `TK-${String(idx + 1).padStart(2, '0')}`;
    const name = (cols[nameIdx] || '').trim();

    if (!name) {
      errors.push(`Baris ${rowNum}: Nama tangki kosong`);
      return;
    }

    const rawType = cols[typeIdx] ? cols[typeIdx].toUpperCase() : '';
    const type: WipTankType = rawType.includes('STORAGE') ? 'STORAGE_TANK' : 'HOLDING_TANK';

    const rawCapCell = cols[capIdx] || '';
    const capacity = rawCapCell.trim() ? parseBomNumber(rawCapCell) : 600;
    if (isNaN(capacity) || capacity <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Kapasitas "${rawCapCell}" tidak valid`);
      return;
    }

    const rawLevelCell = cols[levelIdx] || '';
    const currentLevel = (rawLevelCell.trim() ? parseBomNumber(rawLevelCell) : 0) || 0;

    const rawWip = cols[wipIdx] ? cols[wipIdx].trim() : '';
    const assignedWipId = resolveWipId(rawWip);

    const rawMachines = cols[machIdx] ? cols[machIdx].trim() : '';
    const assignedMachineIds = resolveMachineIds(rawMachines);

    const rawTempCell = cols[tempIdx] || '';
    const temp = (rawTempCell.trim() ? parseBomNumber(rawTempCell) : 45.0) || 45.0;

    const rawAgitator = cols[agitatorIdx] ? cols[agitatorIdx].toUpperCase() : 'ON';
    const agitatorStatus: 'ON' | 'OFF' = rawAgitator === 'OFF' ? 'OFF' : 'ON';

    const rawAlertCell = cols[alertIdx] || '';
    const minAlert = (rawAlertCell.trim() ? parseBomNumber(rawAlertCell) : capacity * 0.2) || capacity * 0.2;

    const rawStatus = cols[statusIdx] ? cols[statusIdx].toUpperCase() : 'ACTIVE';
    let status: WipTankStatus = 'ACTIVE';
    if (rawStatus.includes('STANDBY')) status = 'STANDBY';
    else if (rawStatus.includes('CLEAN')) status = 'CLEANING';
    else if (rawStatus.includes('MAINT')) status = 'MAINTENANCE';
    else if (rawStatus.includes('EMPTY')) status = 'EMPTY';

    const notes = cols[notesIdx] ? cols[notesIdx].trim() : '';

    valid.push({
      id: `tank_imp_${Date.now()}_${idx}`,
      code,
      name,
      type,
      capacityKg: capacity,
      currentLevelKg: Math.min(capacity, Math.max(0, currentLevel)),
      assignedWipId,
      assignedMachineIds,
      assignedMachineId: assignedMachineIds[0] || undefined,
      temp,
      agitatorStatus,
      status,
      minAlertKg: minAlert,
      notes: notes || undefined
    });
  });

  return { valid, errors };
}
