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

export function parseTankFile(
  content: string,
  availableWips: WIP[],
  availableMachines: ProductionMachine[]
): TankParseResult {
  const errors: string[] = [];
  const valid: WipTank[] = [];

  const trimmed = content.trim();
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
        const code = (item.code || item.kode || `TK-${String(idx + 1).padStart(2, '0')}`).trim();
        const name = (item.name || item.nama || '').trim();

        if (!name) {
          errors.push(`Baris ${rowNum}: Nama tangki wajib diisi`);
          return;
        }

        const capacity = parseFloat(item.capacityKg || item.capacity || item.kapasitas || '600');
        if (isNaN(capacity) || capacity <= 0) {
          errors.push(`Baris ${rowNum} (${name}): Kapasitas tangki harus angka positif`);
          return;
        }

        const rawType = String(item.type || item.tipe || '').toUpperCase();
        const type: WipTankType = rawType.includes('STORAGE') ? 'STORAGE_TANK' : 'HOLDING_TANK';

        const currentLevel = parseFloat(item.currentLevelKg || item.level || '0') || 0;
        const temp = parseFloat(item.temp || item.suhu || '45.0') || 45.0;
        const agitator: 'ON' | 'OFF' = String(item.agitatorStatus || item.agitator || 'ON').toUpperCase() === 'OFF' ? 'OFF' : 'ON';
        const minAlert = parseFloat(item.minAlertKg || item.minAlert || String(capacity * 0.2)) || capacity * 0.2;

        let status: WipTankStatus = 'ACTIVE';
        const rawStatus = String(item.status || '').toUpperCase();
        if (rawStatus.includes('STANDBY')) status = 'STANDBY';
        else if (rawStatus.includes('CLEAN')) status = 'CLEANING';
        else if (rawStatus.includes('MAINT')) status = 'MAINTENANCE';
        else if (rawStatus.includes('EMPTY')) status = 'EMPTY';

        // Resolve single WIP formula
        const assignedWipId =
          item.assignedWipId ||
          resolveWipId(item.wipName || item.wip || item.formula || '');

        // Resolve multi-machines
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
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return { valid: [], errors: ['Tidak ada baris data ditemukan'] };
  }

  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length) delimiter = ';';

  const isHeader =
    firstLine.toLowerCase().includes('kode') ||
    firstLine.toLowerCase().includes('nama') ||
    firstLine.toLowerCase().includes('tangki') ||
    firstLine.toLowerCase().includes('tank');

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

    const code = cols[0].replace(/^["']|["']$/g, '').trim() || `TK-${String(idx + 1).padStart(2, '0')}`;
    const name = cols[1].replace(/^["']|["']$/g, '').trim();

    if (!name) {
      errors.push(`Baris ${rowNum}: Nama tangki kosong`);
      return;
    }

    const rawType = cols[2] ? cols[2].replace(/^["']|["']$/g, '').toUpperCase() : '';
    const type: WipTankType = rawType.includes('STORAGE') ? 'STORAGE_TANK' : 'HOLDING_TANK';

    const capStr = cols[3] ? cols[3].replace(/[^0-9.]/g, '') : '';
    const capacity = parseFloat(capStr || '600');
    if (isNaN(capacity) || capacity <= 0) {
      errors.push(`Baris ${rowNum} (${name}): Kapasitas "${cols[3]}" tidak valid`);
      return;
    }

    const levelStr = cols[4] ? cols[4].replace(/[^0-9.]/g, '') : '';
    const currentLevel = parseFloat(levelStr || '0') || 0;

    const rawWip = cols[5] ? cols[5].replace(/^["']|["']$/g, '').trim() : '';
    const assignedWipId = resolveWipId(rawWip);

    const rawMachines = cols[6] ? cols[6].replace(/^["']|["']$/g, '').trim() : '';
    const assignedMachineIds = resolveMachineIds(rawMachines);

    const tempStr = cols[7] ? cols[7].replace(/[^0-9.]/g, '') : '';
    const temp = parseFloat(tempStr || '45.0') || 45.0;

    const rawAgitator = cols[8] ? cols[8].replace(/^["']|["']$/g, '').toUpperCase() : 'ON';
    const agitatorStatus: 'ON' | 'OFF' = rawAgitator === 'OFF' ? 'OFF' : 'ON';

    const alertStr = cols[9] ? cols[9].replace(/[^0-9.]/g, '') : '';
    const minAlert = parseFloat(alertStr || String(capacity * 0.2)) || capacity * 0.2;

    const rawStatus = cols[10] ? cols[10].replace(/^["']|["']$/g, '').toUpperCase() : 'ACTIVE';
    let status: WipTankStatus = 'ACTIVE';
    if (rawStatus.includes('STANDBY')) status = 'STANDBY';
    else if (rawStatus.includes('CLEAN')) status = 'CLEANING';
    else if (rawStatus.includes('MAINT')) status = 'MAINTENANCE';
    else if (rawStatus.includes('EMPTY')) status = 'EMPTY';

    const notes = cols[11] ? cols[11].replace(/^["']|["']$/g, '').trim() : '';

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
