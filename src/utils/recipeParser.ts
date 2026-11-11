import { WipRecipe, WipRecipeItem, WIP, Material, MaterialType } from '../types';

export interface RecipeParseResult {
  valid: WipRecipe[];
  errors: string[];
}

export const SAMPLE_RECIPE_CSV_TEMPLATE = `Kode Resep,Nama Resep,Target WIP,Kode Material,Nama Material,Jenis Material,Takaran,Satuan,Resep Utama,Keterangan
REC-WIP01-01,Resep Standar Original,WIP Adonan Utama,MAT-01,Tepung Terigu Segitiga,bubuk,25,kg,Ya,Formulasi utama adonan biskuit
REC-WIP01-01,Resep Standar Original,WIP Adonan Utama,MAT-02,Gula Pasir Kristal,padat,15,kg,Ya,Gula pasir halus
REC-WIP01-01,Resep Standar Original,WIP Adonan Utama,MAT-03,Minyak Sawit Refined,liquid,5,kg,Ya,Minyak nabati
REC-WIP02-01,Resep Sirup Karamel,WIP Sirup Glukosa,MAT-04,Sirup Glukosa High-Brix,liquid,40,kg,Ya,Karamelisasi suhu 105C
REC-WIP02-01,Resep Sirup Karamel,WIP Sirup Glukosa,MAT-05,Pewarna Karamel Bubuk,bubuk,250,gr,Ya,Pewarna makanan food grade`;

export const SAMPLE_RECIPE_JSON_TEMPLATE = JSON.stringify(
  [
    {
      recipeCode: "REC-WIP01-01",
      recipeName: "Resep Standar Original",
      wip: "WIP Adonan Utama",
      description: "Formulasi utama adonan biskuit",
      isDefault: true,
      items: [
        {
          materialCode: "MAT-01",
          materialName: "Tepung Terigu Segitiga",
          materialType: "bubuk",
          amount: 25,
          unit: "kg"
        },
        {
          materialCode: "MAT-02",
          materialName: "Gula Pasir Kristal",
          materialType: "padat",
          amount: 15,
          unit: "kg"
        },
        {
          materialCode: "MAT-03",
          materialName: "Minyak Sawit Refined",
          materialType: "liquid",
          amount: 5,
          unit: "kg"
        }
      ]
    },
    {
      recipeCode: "REC-WIP02-01",
      recipeName: "Resep Sirup Karamel",
      wip: "WIP Sirup Glukosa",
      description: "Karamelisasi suhu 105C",
      isDefault: true,
      items: [
        {
          materialCode: "MAT-04",
          materialName: "Sirup Glukosa High-Brix",
          materialType: "liquid",
          amount: 40,
          unit: "kg"
        },
        {
          materialCode: "MAT-05",
          materialName: "Pewarna Karamel Bubuk",
          materialType: "bubuk",
          amount: 250,
          unit: "gr"
        }
      ]
    }
  ],
  null,
  2
);

export function parseRecipeFile(
  content: string,
  availableWips: WIP[],
  availableMaterials: Material[]
): RecipeParseResult {
  const errors: string[] = [];
  const valid: WipRecipe[] = [];

  const trimmed = content.trim();
  if (!trimmed) {
    return { valid: [], errors: ['Konten file kosong'] };
  }

  // 1. ATTEMPT JSON PARSING
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      let rawList: any[] = [];

      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (parsed.recipes && Array.isArray(parsed.recipes)) {
        rawList = parsed.recipes;
      } else if (parsed.master?.recipes && Array.isArray(parsed.master.recipes)) {
        rawList = parsed.master.recipes;
      } else if (parsed.data?.recipes && Array.isArray(parsed.data.recipes)) {
        rawList = parsed.data.recipes;
      } else {
        errors.push('Format JSON tidak dikenali: tidak menemukan array resep');
      }

      rawList.forEach((r, idx) => {
        const recipeCode = (r.recipeCode || r.code || `REC-${idx + 1}`).toString().trim().toUpperCase();
        const recipeName = (r.recipeName || r.name || `Resep ${recipeCode}`).toString().trim();
        const desc = r.description || r.notes || r.keterangan || undefined;
        const isDefault = Boolean(r.isDefault || r.default || r.is_default);

        // Match target WIP
        let targetWip = availableWips.find(
          w =>
            w.id === r.wipId ||
            (w.code && w.code.toLowerCase() === (r.wipCode || r.wip || '').toString().toLowerCase()) ||
            w.name.toLowerCase() === (r.wipName || r.wip || '').toString().toLowerCase()
        );

        if (!targetWip && availableWips.length > 0) {
          // Fuzzy match on WIP name
          const searchStr = (r.wip || r.wipName || '').toString().toLowerCase();
          targetWip = availableWips.find(w => w.name.toLowerCase().includes(searchStr));
        }

        const resolvedWipId = targetWip?.id || availableWips[0]?.id || `wip_auto_${idx}`;

        const rawItems: any[] = Array.isArray(r.items) ? r.items : [];
        const parsedItems: WipRecipeItem[] = [];

        rawItems.forEach((it, itIdx) => {
          const matQueryCode = (it.materialCode || it.code || '').toString().trim().toLowerCase();
          const matQueryName = (it.materialName || it.name || '').toString().trim().toLowerCase();

          // Match material in database
          let matMatch = availableMaterials.find(
            m =>
              (m.code && m.code.toLowerCase() === matQueryCode) ||
              m.name.toLowerCase() === matQueryName ||
              m.id === it.materialId
          );

          if (!matMatch && matQueryName) {
            matMatch = availableMaterials.find(m => m.name.toLowerCase().includes(matQueryName));
          }

          const resolvedMatId = matMatch?.id || it.materialId || `mat_auto_${idx}_${itIdx}`;
          const resolvedMatName = matMatch?.name || it.materialName || it.name || `Material ${itIdx + 1}`;
          const resolvedMatCode = matMatch?.code || it.materialCode || it.code || undefined;
          const resolvedMatType: MaterialType = (
            it.materialType || it.type || matMatch?.type || 'bubuk'
          ).toString().toLowerCase() as MaterialType;

          const amountVal = parseFloat(it.amount || it.qty || it.takaran) || 0;
          const unitVal: 'kg' | 'gr' = (it.unit || it.satuan || 'kg').toString().toLowerCase() === 'gr' ? 'gr' : 'kg';
          const amountInKg = unitVal === 'gr' ? amountVal / 1000 : amountVal;

          if (amountVal > 0) {
            parsedItems.push({
              id: `ri_imp_${Date.now()}_${idx}_${itIdx}`,
              materialId: resolvedMatId,
              materialName: resolvedMatName,
              materialCode: resolvedMatCode,
              materialType: ['padat', 'bubuk', 'liquid'].includes(resolvedMatType) ? resolvedMatType : 'bubuk',
              amount: amountVal,
              unit: unitVal,
              amountKg: amountInKg
            });
          }
        });

        const totalWeight = parsedItems.reduce((acc, cur) => acc + cur.amountKg, 0);

        valid.push({
          id: `rec_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
          wipId: resolvedWipId,
          recipeCode,
          recipeName,
          description: desc,
          isDefault,
          totalWeightKg: totalWeight,
          items: parsedItems,
          createdAt: new Date().toISOString()
        });
      });

      if (valid.length > 0) {
        return { valid, errors };
      }
    } catch (e: any) {
      errors.push(`Gagal mem-parse JSON: ${e.message}`);
    }
  }

  // 2. ATTEMPT CSV / TSV PARSING
  const lines = trimmed
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#'));

  if (lines.length < 2) {
    errors.push('File CSV harus memiliki minimal 1 baris header dan 1 baris data');
    return { valid, errors };
  }

  // Detect delimiter: comma, semicolon, or tab
  const firstLine = lines[0];
  let delimiter = ',';
  if (firstLine.includes('\t')) delimiter = '\t';
  else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

  // Helper to split CSV row taking quotes into account
  const splitCsvRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const header = splitCsvRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Locate column indices
  const colRecipeCode = header.findIndex(h => h.includes('kodere') || h.includes('recipecode') || h === 'code');
  const colRecipeName = header.findIndex(h => h.includes('namare') || h.includes('recipename') || h === 'name');
  const colWip = header.findIndex(h => h.includes('targetwip') || h.includes('wip') || h.includes('namawip'));
  const colMatCode = header.findIndex(h => h.includes('kodemat') || h.includes('materialcode'));
  const colMatName = header.findIndex(h => h.includes('namamat') || h.includes('materialname') || h === 'material');
  const colMatType = header.findIndex(h => h.includes('jenismat') || h.includes('jenismaterial') || h === 'type' || h === 'jenis');
  const colAmount = header.findIndex(h => h.includes('takaran') || h.includes('amount') || h.includes('qty') || h.includes('berat'));
  const colUnit = header.findIndex(h => h.includes('satuan') || h.includes('unit'));
  const colDefault = header.findIndex(h => h.includes('resepuk') || h.includes('utama') || h.includes('default') || h.includes('isdefault'));
  const colDesc = header.findIndex(h => h.includes('ket') || h.includes('catatan') || h.includes('desc') || h.includes('note'));

  // Map to group items by recipe code
  interface GroupedRecipe {
    recipeCode: string;
    recipeName: string;
    targetWipQuery: string;
    description?: string;
    isDefault: boolean;
    items: Array<{
      matCode?: string;
      matName?: string;
      matType?: string;
      amount: number;
      unit: 'kg' | 'gr';
    }>;
  }

  const recipeMap = new Map<string, GroupedRecipe>();

  for (let i = 1; i < lines.length; i++) {
    const row = splitCsvRow(lines[i]);
    if (row.length === 0 || row.every(cell => !cell)) continue;

    const rCode = (colRecipeCode >= 0 && row[colRecipeCode] ? row[colRecipeCode] : `REC-${recipeMap.size + 1}`).trim().toUpperCase();
    const rName = (colRecipeName >= 0 && row[colRecipeName] ? row[colRecipeName] : `Resep ${rCode}`).trim();
    const wipQuery = (colWip >= 0 && row[colWip] ? row[colWip] : '').trim();
    const desc = colDesc >= 0 && row[colDesc] ? row[colDesc].trim() : undefined;
    const defaultVal = colDefault >= 0 && row[colDefault] ? row[colDefault].toLowerCase().trim() : '';
    const isDefault = ['ya', 'yes', 'true', '1', 'default', 'utama'].includes(defaultVal);

    const mCode = colMatCode >= 0 && row[colMatCode] ? row[colMatCode].trim() : undefined;
    const mName = colMatName >= 0 && row[colMatName] ? row[colMatName].trim() : undefined;
    const mType = colMatType >= 0 && row[colMatType] ? row[colMatType].trim().toLowerCase() : undefined;
    const amountVal = colAmount >= 0 && row[colAmount] ? parseFloat(row[colAmount].replace(',', '.')) : 0;
    const unitVal: 'kg' | 'gr' = colUnit >= 0 && row[colUnit]?.toLowerCase().includes('gr') ? 'gr' : 'kg';

    if (!recipeMap.has(rCode)) {
      recipeMap.set(rCode, {
        recipeCode: rCode,
        recipeName: rName,
        targetWipQuery: wipQuery,
        description: desc,
        isDefault,
        items: []
      });
    }

    const currentGroup = recipeMap.get(rCode)!;
    if (rName && (!currentGroup.recipeName || currentGroup.recipeName.startsWith('Resep '))) {
      currentGroup.recipeName = rName;
    }
    if (wipQuery && !currentGroup.targetWipQuery) {
      currentGroup.targetWipQuery = wipQuery;
    }
    if (isDefault) {
      currentGroup.isDefault = true;
    }
    if (desc && !currentGroup.description) {
      currentGroup.description = desc;
    }

    if (amountVal > 0) {
      currentGroup.items.push({
        matCode: mCode,
        matName: mName,
        matType: mType,
        amount: amountVal,
        unit: unitVal
      });
    }
  }

  // Convert grouped recipes into WipRecipe objects
  let groupIdx = 0;
  recipeMap.forEach((grp) => {
    groupIdx++;
    // Match target WIP
    let targetWip = availableWips.find(
      w =>
        (w.code && w.code.toLowerCase() === grp.targetWipQuery.toLowerCase()) ||
        w.name.toLowerCase() === grp.targetWipQuery.toLowerCase()
    );

    if (!targetWip && grp.targetWipQuery) {
      targetWip = availableWips.find(w => w.name.toLowerCase().includes(grp.targetWipQuery.toLowerCase()));
    }

    const resolvedWipId = targetWip?.id || availableWips[0]?.id || `wip_auto_${groupIdx}`;

    const parsedItems: WipRecipeItem[] = [];

    grp.items.forEach((it, itIdx) => {
      const qCode = (it.matCode || '').toLowerCase();
      const qName = (it.matName || '').toLowerCase();

      let matMatch = availableMaterials.find(
        m => (m.code && m.code.toLowerCase() === qCode) || m.name.toLowerCase() === qName
      );

      if (!matMatch && qName) {
        matMatch = availableMaterials.find(m => m.name.toLowerCase().includes(qName));
      }

      const resolvedMatId = matMatch?.id || `mat_auto_${groupIdx}_${itIdx}`;
      const resolvedMatName = matMatch?.name || it.matName || `Material ${itIdx + 1}`;
      const resolvedMatCode = matMatch?.code || it.matCode || undefined;
      const resolvedMatType: MaterialType = (
        it.matType || matMatch?.type || 'bubuk'
      ).toLowerCase() as MaterialType;

      const amountKg = it.unit === 'gr' ? it.amount / 1000 : it.amount;

      parsedItems.push({
        id: `ri_imp_${Date.now()}_${groupIdx}_${itIdx}`,
        materialId: resolvedMatId,
        materialName: resolvedMatName,
        materialCode: resolvedMatCode,
        materialType: ['padat', 'bubuk', 'liquid'].includes(resolvedMatType) ? resolvedMatType : 'bubuk',
        amount: it.amount,
        unit: it.unit,
        amountKg
      });
    });

    const totalWeight = parsedItems.reduce((acc, cur) => acc + cur.amountKg, 0);

    valid.push({
      id: `rec_imp_${Date.now()}_${groupIdx}_${Math.random().toString(36).substring(2, 7)}`,
      wipId: resolvedWipId,
      recipeCode: grp.recipeCode,
      recipeName: grp.recipeName,
      description: grp.description,
      isDefault: grp.isDefault,
      totalWeightKg: totalWeight,
      items: parsedItems,
      createdAt: new Date().toISOString()
    });
  });

  if (valid.length === 0 && errors.length === 0) {
    errors.push('Tidak dapat menemukan data resep valid dalam file. Pastikan format kolom sesuai dengan template.');
  }

  return { valid, errors };
}
