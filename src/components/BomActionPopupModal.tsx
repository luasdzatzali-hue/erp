import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Cylinder,
  Database,
  Edit3,
  FileSpreadsheet,
  GitBranch,
  Layers,
  Plus,
  Search,
  Sparkles,
  UploadCloud,
  X
} from 'lucide-react';
import {
  AppState,
  Material,
  MaterialSource,
  MaterialType,
  ProductionMachine,
  SKU,
  SkuWip,
  WIP,
  WipRecipe,
  WipRecipeItem,
  WipTank,
  WipTankType
} from '../types';

export type BomPopupAction =
  | 'LAUNCHER'
  | 'CREATE_MATERIAL'
  | 'EDIT_MATERIAL'
  | 'CREATE_WIP'
  | 'EDIT_WIP'
  | 'CREATE_RECIPE'
  | 'EDIT_RECIPE'
  | 'ADD_RECIPE_MATERIAL'
  | 'CREATE_SKU'
  | 'EDIT_SKU'
  | 'LINK_SKU_WIP'
  | 'CREATE_MACHINE'
  | 'CREATE_TANK'
  | 'EDIT_TANK'
  | 'IMPORT_HUB';

export interface BomPopupContext {
  skuId?: string;
  wipId?: string;
  recipeId?: string;
  materialId?: string;
  tankId?: string;
}

interface SearchableOption {
  value: string;
  label: string;
  code?: string;
  subLabel?: string;
  badge?: string;
}

interface SearchableEntitySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowEmpty?: boolean;
  emptyOptionLabel?: string;
}

const SearchableEntitySelect: React.FC<SearchableEntitySelectProps> = ({
  value,
  onChange,
  options,
  placeholder = '-- Pilih Item --',
  searchPlaceholder = 'Ketik kode atau nama...',
  emptyText = 'Tidak ada data yang cocok',
  allowEmpty = false,
  emptyOptionLabel = '-- Kosong / Tidak Dipilih --'
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => options.find(opt => opt.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt =>
      `${opt.code || ''} ${opt.label} ${opt.subLabel || ''} ${opt.badge || ''}`
        .toLowerCase()
        .includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const onOutsideClick = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onOutsideClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-2 bg-elevated border border-border-strong hover:border-accent-primary rounded-xl px-3 py-2 text-xs text-left transition focus:outline-none focus:border-accent-primary"
      >
        <div className="min-w-0 flex items-center gap-2 flex-1">
          {selected ? (
            <>
              {selected.code && (
                <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-tint-cyan text-brand border border-tint-cyan-border shrink-0">
                  {selected.code}
                </span>
              )}
              <span className="truncate font-semibold text-ink-primary">{selected.label}</span>
              {selected.subLabel && (
                <span className="text-[11px] text-ink-secondary font-mono tabular-nums truncate hidden sm:inline">
                  · {selected.subLabel}
                </span>
              )}
            </>
          ) : (
            <span className="text-ink-muted truncate">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-surface border border-border-strong rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-border-subtle bg-canvas">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-border-subtle">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-elevated flex items-center justify-between transition ${
                  value === '' ? 'bg-tint-cyan text-brand font-semibold' : 'text-ink-secondary'
                }`}
              >
                <span>{emptyOptionLabel}</span>
                {value === '' && <Check className="w-3.5 h-3.5 text-brand" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-ink-muted">{emptyText}</div>
            ) : (
              filtered.map(opt => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-elevated flex items-center justify-between gap-2 transition ${
                      isSelected ? 'bg-tint-cyan' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {opt.code && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-canvas text-brand border border-border-subtle shrink-0">
                            {opt.code}
                          </span>
                        )}
                        <span className={`truncate font-medium ${isSelected ? 'text-brand font-bold' : 'text-ink-primary'}`}>
                          {opt.label}
                        </span>
                      </div>
                      {opt.subLabel && (
                        <span className="text-[10px] text-ink-secondary font-mono tabular-nums block mt-0.5 truncate">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-elevated border border-border-subtle text-ink-secondary">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && <Check className="w-3.5 h-3.5 text-brand" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface BomActionPopupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: AppState;
  initialAction?: BomPopupAction;
  initialContext?: BomPopupContext;
  onAddMaterial: (mat: Omit<Material, 'id'>) => void;
  onUpdateMaterial?: (materialId: string, updates: Partial<Material>) => void;
  onAddWip: (wip: Omit<WIP, 'id'>) => void;
  onUpdateWip?: (wipId: string, updates: Partial<WIP>) => void;
  onAddSku: (sku: Omit<SKU, 'id'>) => void;
  onUpdateSku?: (skuId: string, updates: Partial<SKU>) => void;
  onAddSkuWip: (sw: Omit<SkuWip, 'id'>) => void;
  onAddRecipe?: (recipe: Omit<WipRecipe, 'id' | 'createdAt'>) => void;
  onUpdateRecipe?: (recipeId: string, updates: Partial<WipRecipe>) => void;
  onAddMaterialToRecipe?: (recipeId: string, item: Omit<WipRecipeItem, 'id'>) => void;
  onAddMultipleMaterialsToRecipe?: (recipeId: string, items: Array<Omit<WipRecipeItem, 'id'>>) => void;
  onAddMachine?: (m: Omit<ProductionMachine, 'id'>) => void;
  onAddTank?: (t: Omit<WipTank, 'id'>) => void;
  onUpdateTank?: (tankId: string, updates: Partial<WipTank>) => void;
  onOpenImportModal: (target: 'MATERIAL' | 'SKU' | 'SKU_WIP' | 'RECIPE' | 'MACHINE' | 'TANK') => void;
  showToast: (msg: string, isError?: boolean) => void;
}

interface LauncherActionDef {
  id: BomPopupAction;
  label: string;
  subtitle: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

const LAUNCHER_ACTIONS: LauncherActionDef[] = [
  {
    id: 'CREATE_MATERIAL',
    label: 'Tambah Material Baru',
    subtitle: 'Input bahan baku bubuk, liquid, atau padat + saldo awal',
    keywords: 'material bahan baku tambah input sap kemasan zak drum',
    icon: Database,
    accentClass: 'text-ink-rose bg-tint-rose border-tint-rose-border'
  },
  {
    id: 'CREATE_WIP',
    label: 'Tambah WIP Baru',
    subtitle: 'Buat kode WIP unik, bobot batch, mesin & tangki transfer',
    keywords: 'wip work in process adonan batch mesin tangki',
    icon: Layers,
    accentClass: 'text-ink-amber bg-tint-amber border-tint-amber-border'
  },
  {
    id: 'CREATE_RECIPE',
    label: 'Buat Resep WIP',
    subtitle: 'Formulasi resep baru lengkap dengan daftar material & takaran',
    keywords: 'resep formulasi wip buat recipe takaran kg gr',
    icon: Sparkles,
    accentClass: 'text-brand bg-tint-cyan border-tint-cyan-border'
  },
  {
    id: 'ADD_RECIPE_MATERIAL',
    label: 'Tambah Material ke Resep',
    subtitle: 'Pilih banyak bahan sekaligus atau satu per satu ke resep WIP',
    keywords: 'resep tambah material bahan takaran komposisi',
    icon: Plus,
    accentClass: 'text-ink-emerald bg-tint-emerald border-tint-emerald-border'
  },
  {
    id: 'CREATE_SKU',
    label: 'Tambah SKU Finish Good',
    subtitle: 'Input SKU produk jadi (Domestik / KITE Ekspor) & target output',
    keywords: 'sku produk jadi finish good domestik kite target karton',
    icon: Box,
    accentClass: 'text-brand bg-tint-cyan border-tint-cyan-border'
  },
  {
    id: 'LINK_SKU_WIP',
    label: 'Hubungkan WIP ke SKU',
    subtitle: 'Atur rasio pemakaian WIP (kg/karton SKU) pada hierarki BOM',
    keywords: 'hubungkan link relasi sku wip bom rasio karton',
    icon: GitBranch,
    accentClass: 'text-ink-indigo bg-tint-indigo border-tint-indigo-border'
  },
  {
    id: 'CREATE_MACHINE',
    label: 'Tambah Mesin Produksi',
    subtitle: 'Daftarkan mixer, cooker, extruder, atau enrober ke master',
    keywords: 'mesin produksi mixer cooker extruder enrober kapasitas',
    icon: Cpu,
    accentClass: 'text-ink-indigo bg-tint-indigo border-tint-indigo-border'
  },
  {
    id: 'CREATE_TANK',
    label: 'Tambah Tangki WIP',
    subtitle: 'Registrasi Holding Tank / Storage Tank, 1-WIP & jalur line',
    keywords: 'tangki holding storage tank kapasitas line agitator',
    icon: Cylinder,
    accentClass: 'text-brand bg-tint-cyan border-tint-cyan-border'
  },
  {
    id: 'IMPORT_HUB',
    label: 'Import Batch Excel / Drive',
    subtitle: 'Impor massal Material, SKU, Relasi SKU-WIP, Resep, Mesin & Tangki',
    keywords: 'import batch excel csv json google drive upload',
    icon: UploadCloud,
    accentClass: 'text-ink-emerald bg-tint-emerald border-tint-emerald-border'
  }
];

export const BomActionPopupModal: React.FC<BomActionPopupModalProps> = ({
  open,
  onOpenChange,
  state,
  initialAction = 'LAUNCHER',
  initialContext,
  onAddMaterial,
  onUpdateMaterial,
  onAddWip,
  onUpdateWip,
  onAddSku,
  onUpdateSku,
  onAddSkuWip,
  onAddRecipe,
  onUpdateRecipe,
  onAddMaterialToRecipe,
  onAddMultipleMaterialsToRecipe,
  onAddMachine,
  onAddTank,
  onUpdateTank,
  onOpenImportModal,
  showToast
}) => {
  const [activeAction, setActiveAction] = useState<BomPopupAction>(initialAction);
  const [actionSearch, setActionSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Material form state
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [matName, setMatName] = useState('');
  const [matCode, setMatCode] = useState('');
  const [matType, setMatType] = useState<MaterialType>('bubuk');
  const [matSource, setMatSource] = useState<MaterialSource>('GDRM');
  const [matPackaging, setMatPackaging] = useState('');
  const [matWeight, setMatWeight] = useState('');
  const [matMinStock, setMatMinStock] = useState('');
  const [matInitCk, setMatInitCk] = useState('');
  const [matInitWr, setMatInitWr] = useState('');
  const [matInitTank, setMatInitTank] = useState('');

  // WIP form state
  const [editingWipId, setEditingWipId] = useState<string | null>(null);
  const [wipCode, setWipCode] = useState('');
  const [wipName, setWipName] = useState('');
  const [wipBatchWeight, setWipBatchWeight] = useState('');
  const [wipDurationMinutes, setWipDurationMinutes] = useState('30');
  const [wipMachineIds, setWipMachineIds] = useState<string[]>([]);
  const [wipTankIds, setWipTankIds] = useState<string[]>([]);

  // SKU form state
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [skuCode, setSkuCode] = useState('');
  const [skuName, setSkuName] = useState('');
  const [skuIsKite, setSkuIsKite] = useState(false);
  const [skuTarget, setSkuTarget] = useState('');
  const [skuWeight, setSkuWeight] = useState('');

  // Link SKU-WIP state
  const [swSkuId, setSwSkuId] = useState('');
  const [swWipId, setSwWipId] = useState('');
  const [swKgPerCarton, setSwKgPerCarton] = useState('');

  // Recipe Create/Edit state
  const [recipeWipId, setRecipeWipId] = useState('');
  const [newRecipeCode, setNewRecipeCode] = useState('');
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeDesc, setNewRecipeDesc] = useState('');
  const [newRecipeSelectedMatIds, setNewRecipeSelectedMatIds] = useState<string[]>([]);
  const [newRecipeDosages, setNewRecipeDosages] = useState<Record<string, { amount: string; unit: 'kg' | 'gr' }>>({});
  const [newRecipeMatSearch, setNewRecipeMatSearch] = useState('');
  const [newRecipeMatTypeFilter, setNewRecipeMatTypeFilter] = useState<'all' | MaterialType>('all');

  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editRecipeCode, setEditRecipeCode] = useState('');
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editRecipeDesc, setEditRecipeDesc] = useState('');
  const [editRecipeIsDefault, setEditRecipeIsDefault] = useState(false);

  // Add material(s) to existing recipe state
  const [targetRecipeId, setTargetRecipeId] = useState('');
  const [recipeInputMode, setRecipeInputMode] = useState<'multi' | 'single'>('multi');
  const [recipeMatId, setRecipeMatId] = useState('');
  const [recipeMatAmount, setRecipeMatAmount] = useState('');
  const [recipeMatUnit, setRecipeMatUnit] = useState<'kg' | 'gr'>('kg');
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [multiMaterialDosages, setMultiMaterialDosages] = useState<Record<string, { amount: string; unit: 'kg' | 'gr' }>>({});
  const [multiMatSearch, setMultiMatSearch] = useState('');
  const [multiMatTypeFilter, setMultiMatTypeFilter] = useState<'all' | MaterialType>('all');

  // Machine form state
  const [machCode, setMachCode] = useState('');
  const [machName, setMachName] = useState('');
  const [machLine, setMachLine] = useState('Line 1 (Biskuit Domestik)');
  const [machCapacity, setMachCapacity] = useState('800');
  const [machStatus, setMachStatus] = useState<'OPERATIONAL' | 'STANDBY' | 'MAINTENANCE'>('OPERATIONAL');
  const [machOperator, setMachOperator] = useState('');
  const [machNotes, setMachNotes] = useState('');

  // Tank form state (Create & Edit)
  const [editingTankId, setEditingTankId] = useState<string | null>(null);
  const [tankCode, setTankCode] = useState('');
  const [tankName, setTankName] = useState('');
  const [tankTypeForm, setTankTypeForm] = useState<WipTankType>('HOLDING_TANK');
  const [tankCapacity, setTankCapacity] = useState('600');
  const [tankInitialLevel, setTankInitialLevel] = useState('400');
  const [tankAssignedWip, setTankAssignedWip] = useState('');
  const [tankAssignedMachines, setTankAssignedMachines] = useState<string[]>([]);
  const [tankAssignedLines, setTankAssignedLines] = useState<string[]>([]);
  const [tankTemp, setTankTemp] = useState('45.0');
  const [tankAgitator, setTankAgitator] = useState<'ON' | 'OFF'>('ON');
  const [tankMinAlert, setTankMinAlert] = useState('100');

  // Hydrate modal state whenever opened or action/context changes
  useEffect(() => {
    if (!open) return;
    setActionSearch('');
    setActiveAction(initialAction);

    const ctx = initialContext || {};

    // Material create/edit hydration
    if (initialAction === 'EDIT_MATERIAL' && ctx.materialId) {
      const m = state.master.materials.find(item => item.id === ctx.materialId);
      if (m) {
        setEditingMaterialId(m.id);
        setMatName(m.name);
        setMatCode(m.code || '');
        setMatType(m.type);
        setMatSource(m.source);
        setMatPackaging(m.packaging || '');
        setMatWeight(String(m.weightKg));
        setMatMinStock(m.minStockAlert !== undefined && m.minStockAlert > 0 ? String(m.minStockAlert) : '');
        setMatInitCk(m.initialStockCk ? String(m.initialStockCk) : '');
        setMatInitWr(m.initialStockWineroto ? String(m.initialStockWineroto) : '');
        setMatInitTank(m.initialStockTank ? String(m.initialStockTank) : '');
      }
    } else if (initialAction === 'CREATE_MATERIAL') {
      setEditingMaterialId(null);
      setMatName('');
      setMatCode('');
      setMatType('bubuk');
      setMatSource('GDRM');
      setMatPackaging('');
      setMatWeight('');
      setMatMinStock('');
      setMatInitCk('');
      setMatInitWr('');
      setMatInitTank('');
    }

    // WIP create/edit hydration
    if (initialAction === 'EDIT_WIP' && ctx.wipId) {
      const w = state.master.wips.find(item => item.id === ctx.wipId);
      if (w) {
        const mIds = w.assignedMachineIds && w.assignedMachineIds.length > 0
          ? w.assignedMachineIds
          : w.assignedMachineId ? [w.assignedMachineId] : [];
        const tIds = w.targetTankIds && w.targetTankIds.length > 0
          ? w.targetTankIds
          : w.targetTankId ? [w.targetTankId] : [];
        setEditingWipId(w.id);
        setWipCode(w.code || '');
        setWipName(w.name);
        setWipBatchWeight(String(w.batchWeightKg));
        setWipDurationMinutes(String(w.productionDurationMinutes || 30));
        setWipMachineIds(mIds);
        setWipTankIds(tIds);
      }
    } else if (initialAction === 'CREATE_WIP') {
      setEditingWipId(null);
      setWipCode('');
      setWipName('');
      setWipBatchWeight('');
      setWipDurationMinutes('30');
      setWipMachineIds([]);
      setWipTankIds([]);
    }

    // SKU create/edit hydration
    if (initialAction === 'EDIT_SKU' && ctx.skuId) {
      const s = state.master.skus.find(item => item.id === ctx.skuId);
      if (s) {
        setEditingSkuId(s.id);
        setSkuCode(s.code || '');
        setSkuName(s.name);
        setSkuIsKite(Boolean(s.isKite));
        setSkuTarget(String(s.targetHour));
        setSkuWeight(String(s.cartonWeightKg));
      }
    } else if (initialAction === 'CREATE_SKU') {
      setEditingSkuId(null);
      setSkuCode('');
      setSkuName('');
      setSkuIsKite(false);
      setSkuTarget('');
      setSkuWeight('');
    }

    // Link SKU-WIP hydration
    if (initialAction === 'LINK_SKU_WIP') {
      setSwSkuId(ctx.skuId || state.master.skus[0]?.id || '');
      setSwWipId(ctx.wipId || '');
      setSwKgPerCarton('');
    }

    // Recipe create hydration
    if (initialAction === 'CREATE_RECIPE') {
      const resolvedWipId = ctx.wipId || state.master.wips[0]?.id || '';
      setRecipeWipId(resolvedWipId);
      setNewRecipeCode('');
      setNewRecipeName('');
      setNewRecipeDesc('');
      setNewRecipeSelectedMatIds([]);
      setNewRecipeDosages({});
      setNewRecipeMatSearch('');
      setNewRecipeMatTypeFilter('all');
    }

    // Recipe edit hydration
    if (initialAction === 'EDIT_RECIPE' && ctx.recipeId) {
      const rec = (state.master.recipes || []).find(r => r.id === ctx.recipeId);
      if (rec) {
        setEditingRecipeId(rec.id);
        setEditRecipeCode(rec.recipeCode);
        setEditRecipeName(rec.recipeName);
        setEditRecipeDesc(rec.description || '');
        setEditRecipeIsDefault(Boolean(rec.isDefault));
      }
    }

    // Add material to recipe hydration
    if (initialAction === 'ADD_RECIPE_MATERIAL') {
      const resolvedWipId = ctx.wipId || state.master.wips[0]?.id || '';
      setRecipeWipId(resolvedWipId);
      if (ctx.recipeId) {
        setTargetRecipeId(ctx.recipeId);
      } else {
        const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === resolvedWipId);
        const def = recipesForWip.find(r => r.isDefault) || recipesForWip[0];
        setTargetRecipeId(def?.id || '');
      }
      setSelectedMaterialIds([]);
      setMultiMaterialDosages({});
      setMultiMatSearch('');
      setMultiMatTypeFilter('all');
      setRecipeMatId('');
      setRecipeMatAmount('');
      setRecipeMatUnit('kg');
    }

    // Tank create/edit hydration
    if (initialAction === 'EDIT_TANK' && ctx.tankId) {
      const t = state.master.tanks.find(item => item.id === ctx.tankId);
      if (t) {
        const mIds = (t.sourceMachineIds && t.sourceMachineIds.length > 0)
          ? t.sourceMachineIds
          : (t.assignedMachineIds && t.assignedMachineIds.length > 0)
            ? t.assignedMachineIds
            : t.assignedMachineId ? [t.assignedMachineId] : [];
        setEditingTankId(t.id);
        setTankCode(t.code);
        setTankName(t.name);
        setTankTypeForm(t.type);
        setTankCapacity(String(t.capacityKg));
        setTankInitialLevel(String(t.currentLevelKg));
        setTankAssignedWip(t.assignedWipId || '');
        setTankAssignedMachines(mIds);
        setTankAssignedLines(t.assignedLineIds || []);
        setTankTemp(String(t.temp !== undefined ? t.temp : 45.0));
        setTankAgitator(t.agitatorStatus || 'ON');
        setTankMinAlert(String(t.minAlertKg || Math.round(t.capacityKg * 0.2)));
      }
    } else if (initialAction === 'CREATE_TANK') {
      setEditingTankId(null);
      setTankCode('');
      setTankName('');
      setTankTypeForm('HOLDING_TANK');
      setTankCapacity('600');
      setTankInitialLevel('400');
      setTankAssignedWip('');
      setTankAssignedMachines([]);
      setTankAssignedLines([]);
      setTankTemp('45.0');
      setTankAgitator('ON');
      setTankMinAlert('100');
    }

    if (initialAction === 'LAUNCHER') {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
  }, [open, initialAction, initialContext, state.master]);

  // Keep targetRecipeId synced if user switches WIP inside ADD_RECIPE_MATERIAL
  useEffect(() => {
    if (activeAction !== 'ADD_RECIPE_MATERIAL') return;
    const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === recipeWipId);
    if (recipesForWip.length === 0) {
      setTargetRecipeId('');
    } else if (!recipesForWip.some(r => r.id === targetRecipeId)) {
      const def = recipesForWip.find(r => r.isDefault) || recipesForWip[0];
      setTargetRecipeId(def.id);
    }
  }, [recipeWipId, activeAction, state.master.recipes, targetRecipeId]);

  const skuOptions = useMemo<SearchableOption[]>(
    () =>
      state.master.skus.map(s => ({
        value: s.id,
        code: s.code,
        label: s.name,
        subLabel: `${s.targetHour} ktn/j · ${s.cartonWeightKg.toFixed(4)} kg/ktn`,
        badge: s.isKite ? 'KITE' : 'DOM'
      })),
    [state.master.skus]
  );

  const wipOptions = useMemo<SearchableOption[]>(
    () =>
      state.master.wips.map(w => ({
        value: w.id,
        code: w.code,
        label: w.name,
        subLabel: `${w.batchWeightKg.toFixed(2)} kg/batch · ${w.productionDurationMinutes || 30} mnt`,
        badge: `${(state.master.recipes || []).filter(r => r.wipId === w.id).length} Resep`
      })),
    [state.master.wips, state.master.recipes]
  );

  const materialOptions = useMemo<SearchableOption[]>(
    () =>
      state.master.materials.map(m => ({
        value: m.id,
        code: m.code,
        label: m.name,
        subLabel: `${m.type.toUpperCase()} · ${m.source} · ${m.weightKg.toFixed(4)} kg/${m.packaging || 'kemasan'}`
      })),
    [state.master.materials]
  );

  const switchActionClean = (nextAction: BomPopupAction) => {
    setActiveAction(nextAction);
    if (nextAction === 'CREATE_MATERIAL') {
      setEditingMaterialId(null);
      setMatName('');
      setMatCode('');
      setMatType('bubuk');
      setMatSource('GDRM');
      setMatPackaging('');
      setMatWeight('');
      setMatMinStock('');
      setMatInitCk('');
      setMatInitWr('');
      setMatInitTank('');
    } else if (nextAction === 'CREATE_WIP') {
      setEditingWipId(null);
      setWipCode('');
      setWipName('');
      setWipBatchWeight('');
      setWipDurationMinutes('30');
      setWipMachineIds([]);
      setWipTankIds([]);
    } else if (nextAction === 'CREATE_SKU') {
      setEditingSkuId(null);
      setSkuCode('');
      setSkuName('');
      setSkuIsKite(false);
      setSkuTarget('');
      setSkuWeight('');
    } else if (nextAction === 'LINK_SKU_WIP') {
      if (!swSkuId && state.master.skus[0]) setSwSkuId(state.master.skus[0].id);
    } else if (nextAction === 'CREATE_RECIPE') {
      if (!recipeWipId && state.master.wips[0]) setRecipeWipId(state.master.wips[0].id);
      setNewRecipeCode('');
      setNewRecipeName('');
      setNewRecipeDesc('');
      setNewRecipeSelectedMatIds([]);
      setNewRecipeDosages({});
    } else if (nextAction === 'ADD_RECIPE_MATERIAL') {
      const wId = recipeWipId || state.master.wips[0]?.id || '';
      setRecipeWipId(wId);
      const recs = (state.master.recipes || []).filter(r => r.wipId === wId);
      const def = recs.find(r => r.isDefault) || recs[0];
      setTargetRecipeId(def?.id || '');
      setSelectedMaterialIds([]);
      setMultiMaterialDosages({});
    } else if (nextAction === 'CREATE_TANK') {
      setEditingTankId(null);
      setTankCode('');
      setTankName('');
      setTankTypeForm('HOLDING_TANK');
      setTankCapacity('600');
      setTankInitialLevel('400');
      setTankAssignedWip('');
      setTankAssignedMachines([]);
      setTankAssignedLines([]);
      setTankTemp('45.0');
      setTankAgitator('ON');
      setTankMinAlert('100');
    }
  };

  // Filtered launcher items & entity quick-jumps
  const qLower = actionSearch.trim().toLowerCase();
  const filteredActions = useMemo(() => {
    if (!qLower) return LAUNCHER_ACTIONS;
    return LAUNCHER_ACTIONS.filter(a =>
      `${a.label} ${a.subtitle} ${a.keywords}`.toLowerCase().includes(qLower)
    );
  }, [qLower]);

  const matchedEntities = useMemo(() => {
    if (!qLower) return { skus: [] as SKU[], wips: [] as WIP[], materials: [] as Material[] };
    return {
      skus: state.master.skus
        .filter(s => `${s.code || ''} ${s.name}`.toLowerCase().includes(qLower))
        .slice(0, 4),
      wips: state.master.wips
        .filter(w => `${w.code || ''} ${w.name}`.toLowerCase().includes(qLower))
        .slice(0, 4),
      materials: state.master.materials
        .filter(m => `${m.code || ''} ${m.name}`.toLowerCase().includes(qLower))
        .slice(0, 4)
    };
  }, [qLower, state.master.skus, state.master.wips, state.master.materials]);

  // Helper to get default dosage for a material
  const getDefaultDosage = (matId: string): { amount: string; unit: 'kg' | 'gr' } => {
    const m = state.master.materials.find(mat => mat.id === matId);
    if (!m) return { amount: '1', unit: 'kg' };
    if (m.weightKg > 0 && m.weightKg < 1) {
      return { amount: String(Number((m.weightKg * 1000).toFixed(4))), unit: 'gr' };
    }
    return { amount: String(Number((m.weightKg || 1).toFixed(4))), unit: 'kg' };
  };

  // Submits
  const handleMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const weight = parseFloat(matWeight);
    const trimmedName = matName.trim();
    if (!trimmedName || isNaN(weight) || weight <= 0) {
      showToast('Harap masukkan nama dan berat kemasan material yang valid (> 0)', true);
      return;
    }
    const parsedMinStock = matMinStock.trim() !== '' ? Math.max(0, parseFloat(matMinStock) || 0) : undefined;
    const parsedCk = matInitCk.trim() !== '' ? Math.max(0, parseFloat(matInitCk) || 0) : 0;
    const parsedWr = matInitWr.trim() !== '' ? Math.max(0, parseFloat(matInitWr) || 0) : 0;
    const parsedTank = matInitTank.trim() !== '' ? Math.max(0, parseFloat(matInitTank) || 0) : 0;
    const normalizedCode = matCode.trim().toUpperCase();

    if (editingMaterialId && onUpdateMaterial) {
      onUpdateMaterial(editingMaterialId, {
        name: trimmedName,
        code: normalizedCode || undefined,
        type: matType,
        source: matSource,
        packaging: matPackaging.trim() || `${weight.toFixed(4)} kg`,
        weightKg: weight,
        minStockAlert: parsedMinStock,
        initialStockCk: parsedCk,
        initialStockWineroto: parsedWr,
        initialStockTank: parsedTank
      });
      showToast(`Perubahan material "${trimmedName}" berhasil disimpan`);
      onOpenChange(false);
      return;
    }

    onAddMaterial({
      name: trimmedName,
      code: normalizedCode || undefined,
      type: matType,
      source: matSource,
      packaging: matPackaging.trim() || `${weight.toFixed(4)} kg`,
      weightKg: weight,
      minStockAlert: parsedMinStock,
      initialStockCk: parsedCk,
      initialStockWineroto: parsedWr,
      initialStockTank: parsedTank
    });
    showToast(`Material "${trimmedName}" berhasil di-autosave ke database`);
    onOpenChange(false);
  };

  const handleWipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const batchW = parseFloat(wipBatchWeight);
    const duration = parseFloat(wipDurationMinutes) || 30;
    const trimmedCode = (
      wipCode.trim() || `WIP-${String(state.master.wips.length + 1).padStart(3, '0')}`
    ).toUpperCase();
    const trimmedName = wipName.trim();

    if (!trimmedName || isNaN(batchW) || batchW <= 0) {
      showToast('Harap masukkan nama dan bobot batch WIP yang valid', true);
      return;
    }

    if (editingWipId && onUpdateWip) {
      const duplicateCode = state.master.wips.some(
        w => w.id !== editingWipId && w.code?.toUpperCase() === trimmedCode
      );
      if (duplicateCode) {
        showToast(`Kode WIP "${trimmedCode}" sudah dipakai oleh WIP lain!`, true);
        return;
      }
      const firstTankObj = state.master.tanks.find(t => wipTankIds.includes(t.id));
      onUpdateWip(editingWipId, {
        code: trimmedCode,
        name: trimmedName,
        batchWeightKg: batchW,
        productionDurationMinutes: duration,
        assignedMachineIds: wipMachineIds,
        assignedMachineId: wipMachineIds[0] || undefined,
        targetTankIds: wipTankIds,
        targetTankId: wipTankIds[0] || undefined,
        targetTankType: firstTankObj?.type || 'HOLDING_TANK'
      });
      showToast(`WIP [${trimmedCode}] ${trimmedName} diperbarui`);
      onOpenChange(false);
      return;
    }

    if (state.master.wips.some(w => w.code?.toUpperCase() === trimmedCode)) {
      showToast(`Kode WIP "${trimmedCode}" sudah digunakan! 1 nama WIP memiliki 1 kode unik.`, true);
      return;
    }
    if (state.master.wips.some(w => w.name.toLowerCase() === trimmedName.toLowerCase())) {
      showToast(`Nama WIP "${trimmedName}" sudah terdaftar dalam database!`, true);
      return;
    }

    const firstTankObj = state.master.tanks.find(t => wipTankIds.includes(t.id));
    onAddWip({
      code: trimmedCode,
      name: trimmedName,
      batchWeightKg: batchW,
      productionDurationMinutes: duration,
      assignedMachineId: wipMachineIds[0] || undefined,
      assignedMachineIds: wipMachineIds,
      targetTankType: firstTankObj?.type || 'HOLDING_TANK',
      targetTankId: wipTankIds[0] || undefined,
      targetTankIds: wipTankIds
    });
    showToast(`WIP [${trimmedCode}] ${trimmedName} berhasil ditambahkan`);
    onOpenChange(false);
  };

  const handleSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = skuName.trim();
    const trimmedCode = skuCode.trim().toUpperCase();
    const targetH = parseFloat(skuTarget) || 0;
    const cWeight = parseFloat(skuWeight);
    if (!trimmedName || isNaN(cWeight) || cWeight <= 0) {
      showToast('Harap masukkan nama dan berat karton SKU yang valid (> 0)', true);
      return;
    }

    if (editingSkuId && onUpdateSku) {
      onUpdateSku(editingSkuId, {
        code: trimmedCode || undefined,
        name: trimmedName,
        isKite: skuIsKite,
        targetHour: targetH,
        cartonWeightKg: cWeight
      });
      showToast(`Perubahan SKU "${trimmedName}" (${skuIsKite ? 'KITE Ekspor' : 'Domestik'}) berhasil disimpan`);
      onOpenChange(false);
      return;
    }

    onAddSku({
      code: trimmedCode || undefined,
      name: trimmedName,
      isKite: skuIsKite,
      targetHour: targetH,
      cartonWeightKg: cWeight
    });
    showToast(`SKU "${trimmedName}" (${skuIsKite ? 'KITE Ekspor' : 'Domestik'}) berhasil disimpan`);
    onOpenChange(false);
  };

  const handleSkuWipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const kgPerCtn = parseFloat(swKgPerCarton);
    if (!swSkuId || !swWipId || isNaN(kgPerCtn) || kgPerCtn <= 0) {
      showToast('Harap pilih SKU, WIP, dan nilai kg/karton valid', true);
      return;
    }
    onAddSkuWip({
      skuId: swSkuId,
      wipId: swWipId,
      kgWipPerCartonSku: kgPerCtn
    });
    setSwKgPerCarton('');
    setSwWipId('');
    showToast('WIP terpisah berhasil diikat ke SKU (kg WIP / karton SKU)');
  };

  const handleCreateRecipeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeWipId) {
      showToast('Pilih Target WIP terlebih dahulu', true);
      return;
    }
    if (!newRecipeCode.trim() || !newRecipeName.trim()) {
      showToast('Harap masukkan kode dan nama resep', true);
      return;
    }

    const initialItems: Array<Omit<WipRecipeItem, 'id'>> = [];
    for (const matId of newRecipeSelectedMatIds) {
      const matObj = state.master.materials.find(m => m.id === matId);
      const dose = newRecipeDosages[matId] || getDefaultDosage(matId);
      const amountVal = parseFloat(dose.amount) || 1;
      const amountKg = dose.unit === 'gr' ? amountVal / 1000 : amountVal;
      initialItems.push({
        materialId: matId,
        materialName: matObj?.name || 'Material',
        materialCode: matObj?.code,
        materialType: matObj?.type || 'bubuk',
        amount: amountVal,
        unit: dose.unit,
        amountKg
      });
    }

    if (onAddRecipe) {
      onAddRecipe({
        wipId: recipeWipId,
        recipeCode: newRecipeCode.trim().toUpperCase(),
        recipeName: newRecipeName.trim(),
        description: newRecipeDesc.trim() || undefined,
        totalWeightKg: initialItems.reduce((s, it) => s + it.amountKg, 0),
        items: initialItems as any
      });
      onOpenChange(false);
    }
  };

  const handleEditRecipeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipeId || !onUpdateRecipe) return;
    if (!editRecipeCode.trim() || !editRecipeName.trim()) {
      showToast('Harap masukkan kode dan nama resep yang valid', true);
      return;
    }
    onUpdateRecipe(editingRecipeId, {
      recipeCode: editRecipeCode.trim().toUpperCase(),
      recipeName: editRecipeName.trim(),
      description: editRecipeDesc.trim() || undefined,
      isDefault: editRecipeIsDefault
    });
    showToast(`Resep ${editRecipeCode.toUpperCase()} berhasil diperbarui`);
    onOpenChange(false);
  };

  const handleSubmitMultipleMaterialsToRecipe = () => {
    if (!targetRecipeId) {
      showToast('Pilih resep formulasi terlebih dahulu', true);
      return;
    }
    if (selectedMaterialIds.length === 0) {
      showToast('Pilih setidaknya 1 material dari database', true);
      return;
    }
    const itemsToSubmit: Array<Omit<WipRecipeItem, 'id'>> = [];
    for (const matId of selectedMaterialIds) {
      const matObj = state.master.materials.find(m => m.id === matId);
      const dose = multiMaterialDosages[matId] || getDefaultDosage(matId);
      const amountVal = parseFloat(dose.amount);
      if (isNaN(amountVal) || amountVal <= 0) {
        showToast(`Takaran untuk "${matObj?.name || matId}" harus berupa angka positif!`, true);
        return;
      }
      const amountKg = dose.unit === 'gr' ? amountVal / 1000 : amountVal;
      itemsToSubmit.push({
        materialId: matId,
        materialName: matObj?.name || 'Material',
        materialCode: matObj?.code,
        materialType: matObj?.type || 'bubuk',
        amount: amountVal,
        unit: dose.unit,
        amountKg
      });
    }

    if (onAddMultipleMaterialsToRecipe) {
      onAddMultipleMaterialsToRecipe(targetRecipeId, itemsToSubmit);
    } else if (onAddMaterialToRecipe) {
      itemsToSubmit.forEach(it => onAddMaterialToRecipe(targetRecipeId, it));
      showToast(`Berhasil menambahkan ${itemsToSubmit.length} material ke resep!`);
    }
    setSelectedMaterialIds([]);
    setMultiMatSearch('');
    onOpenChange(false);
  };

  const handleAddSingleMaterialToRecipeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetRecipeId) {
      showToast('Pilih atau buat resep terlebih dahulu', true);
      return;
    }
    if (!recipeMatId) {
      showToast('Pilih material dari database', true);
      return;
    }
    const amountVal = parseFloat(recipeMatAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast('Masukkan nilai takaran yang valid', true);
      return;
    }
    const matObj = state.master.materials.find(m => m.id === recipeMatId);
    const amountInKg = recipeMatUnit === 'gr' ? amountVal / 1000 : amountVal;
    if (onAddMaterialToRecipe) {
      onAddMaterialToRecipe(targetRecipeId, {
        materialId: recipeMatId,
        materialName: matObj?.name || 'Material',
        materialCode: matObj?.code,
        materialType: matObj?.type || 'bubuk',
        amount: amountVal,
        unit: recipeMatUnit,
        amountKg: amountInKg
      });
      setRecipeMatId('');
      setRecipeMatAmount('');
    }
  };

  const handleMachineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(machCapacity);
    if (!machCode.trim() || !machName.trim() || isNaN(cap) || cap <= 0) {
      showToast('Harap masukkan kode, nama mesin, dan kapasitas valid', true);
      return;
    }
    if (onAddMachine) {
      onAddMachine({
        code: machCode.trim(),
        name: machName.trim(),
        line: machLine,
        capacityKgPerHour: cap,
        status: machStatus,
        operatorAssigned: machOperator.trim() || undefined,
        notes: machNotes.trim() || undefined
      });
      showToast(`Mesin ${machCode.trim()} - ${machName.trim()} berhasil disimpan ke master data`);
      setMachCode('');
      setMachName('');
      setMachOperator('');
      setMachNotes('');
      onOpenChange(false);
    }
  };

  const handleTankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(tankCapacity);
    const initLvl = parseFloat(tankInitialLevel) || 0;
    const alertLvl = parseFloat(tankMinAlert) || cap * 0.2;
    const tempVal = parseFloat(tankTemp) || 45.0;

    if (editingTankId && onUpdateTank) {
      if (!tankName.trim() || isNaN(cap) || cap <= 0) {
        showToast('Kapasitas dan nama tangki harus valid', true);
        return;
      }
      onUpdateTank(editingTankId, {
        name: tankName.trim(),
        capacityKg: cap,
        assignedWipId: tankAssignedWip || undefined,
        assignedMachineIds: tankAssignedMachines,
        sourceMachineIds: tankAssignedMachines,
        assignedMachineId: tankAssignedMachines[0] || undefined,
        assignedLineIds: tankAssignedLines,
        temp: tempVal,
        minAlertKg: alertLvl,
        agitatorStatus: tankAgitator
      });
      showToast(`Tangki ${tankCode} berhasil diperbarui`);
      onOpenChange(false);
      return;
    }

    if (!tankCode.trim() || !tankName.trim() || isNaN(cap) || cap <= 0) {
      showToast('Harap masukkan kode, nama tangki, dan kapasitas valid', true);
      return;
    }

    if (onAddTank) {
      onAddTank({
        code: tankCode.trim(),
        name: tankName.trim(),
        type: tankTypeForm,
        capacityKg: cap,
        currentLevelKg: Math.min(cap, Math.max(0, initLvl)),
        assignedWipId: tankAssignedWip || undefined,
        assignedMachineId: tankAssignedMachines[0] || undefined,
        assignedMachineIds: tankAssignedMachines,
        sourceMachineIds: tankAssignedMachines,
        assignedLineIds: tankAssignedLines,
        temp: tempVal,
        agitatorStatus: tankAgitator,
        status: 'ACTIVE',
        minAlertKg: alertLvl
      });
      showToast(`Tangki ${tankCode.trim()} berhasil disimpan ke database master`);
      onOpenChange(false);
    }
  };

  const packagingPresets: { label: string; pkg: string; weight: string; type: MaterialType }[] = [
    { label: 'Zak 15 kg', pkg: 'Zak 15 kg', weight: '15', type: 'bubuk' },
    { label: 'Zak 25 kg', pkg: 'Zak 25 kg', weight: '25', type: 'bubuk' },
    { label: 'Zak 50 kg', pkg: 'Zak 50 kg', weight: '50', type: 'bubuk' },
    { label: 'Karton 20 kg', pkg: 'Karton 20 kg', weight: '20', type: 'padat' },
    { label: 'Jerigen 20 kg', pkg: 'Jerigen 20 kg', weight: '20', type: 'liquid' },
    { label: 'Drum 200 kg', pkg: 'Drum 200 kg', weight: '200', type: 'liquid' },
    { label: 'IBC 1000 kg', pkg: 'IBC Tank 1000 kg', weight: '1000', type: 'liquid' }
  ];

  const activeTitleMap: Record<BomPopupAction, { title: string; subtitle: string }> = {
    LAUNCHER: {
      title: 'Quick-Action Launcher & Form BOM',
      subtitle: 'Pilih aksi di bawah atau ketik untuk mencari aksi / item master data'
    },
    CREATE_MATERIAL: {
      title: 'Tambah Material Baru',
      subtitle: 'Bahan baku tersimpan otomatis & siap dipakai pada formulasi resep WIP'
    },
    EDIT_MATERIAL: {
      title: 'Edit Data Material',
      subtitle: 'Perbarui spesifikasi kemasan, bobot, batas stok minimum, atau saldo awal'
    },
    CREATE_WIP: {
      title: 'Tambah WIP Baru',
      subtitle: '1 Nama WIP memiliki 1 kode unik, multi-mesin & multi-tangki transfer'
    },
    EDIT_WIP: {
      title: 'Edit Master WIP',
      subtitle: 'Kelola kode WIP, bobot batch, waktu produksi, mesin & tangki penampungan'
    },
    CREATE_RECIPE: {
      title: 'Buat Resep Formulasi WIP Baru',
      subtitle: 'Tetapkan kode resep, nama formulasi, dan komposisi material awal'
    },
    EDIT_RECIPE: {
      title: 'Edit Identitas Resep Formulasi',
      subtitle: 'Perbarui kode, nama, catatan, atau status acuan default resep'
    },
    ADD_RECIPE_MATERIAL: {
      title: 'Tambah Material ke Resep WIP',
      subtitle: 'Pilih banyak material sekaligus atau satu per satu dengan konversi otomatis'
    },
    CREATE_SKU: {
      title: 'Tambah SKU Produk Jadi',
      subtitle: 'Registrasi produk jadi (Pasar Domestik atau Ekspor KITE) & target per jam'
    },
    EDIT_SKU: {
      title: 'Edit Master SKU Produk Jadi',
      subtitle: 'Perbarui kode, kategori DOM/KITE, target output, dan bobot netto per karton'
    },
    LINK_SKU_WIP: {
      title: 'Hubungkan WIP ke SKU',
      subtitle: 'Ikat komponen WIP beserta kebutuhan kg WIP per 1 karton SKU'
    },
    CREATE_MACHINE: {
      title: 'Tambah Mesin Produksi Baru',
      subtitle: 'Daftarkan unit mesin pengolah (Mixer, Cooker, Extruder, Enrober)'
    },
    CREATE_TANK: {
      title: 'Tambah Tangki WIP Baru',
      subtitle: 'Registrasi Holding / Storage Tank dengan aturan 1-WIP & jalur mesin/line'
    },
    EDIT_TANK: {
      title: `Edit Tangki WIP ${tankCode}`,
      subtitle: 'Perbarui kapasitas, alokasi 1-WIP, mesin pengisi & lini tujuan suplai'
    },
    IMPORT_HUB: {
      title: 'Import Batch Excel / Google Drive',
      subtitle: 'Pilih modul master data yang ingin dimuat dari file CSV/JSON atau Google Drive'
    }
  };

  const currentHeader = activeTitleMap[activeAction];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-4xl max-h-[90vh] flex flex-col bg-surface border border-border-strong rounded-2xl shadow-2xl overflow-hidden focus:outline-none">
          {/* Top Modal Header */}
          <div className="px-5 py-3.5 border-b border-border-subtle bg-surface flex items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {activeAction !== 'LAUNCHER' && (
                  <button
                    type="button"
                    onClick={() => setActiveAction('LAUNCHER')}
                    className="px-2 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-[11px] font-semibold text-ink-secondary hover:text-ink-primary transition shrink-0"
                  >
                    &larr; Launcher
                  </button>
                )}
                <Dialog.Title className="text-sm sm:text-base font-bold text-ink-primary truncate">
                  {currentHeader.title}
                </Dialog.Title>
              </div>
              <Dialog.Description className="text-[11px] text-ink-secondary mt-0.5 truncate">
                {currentHeader.subtitle}
              </Dialog.Description>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-block font-mono text-[10px] px-2 py-0.5 rounded border border-border-subtle bg-canvas text-ink-muted">
                ESC tutup
              </span>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Tutup popup BOM"
                  className="p-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Quick-Action Switcher Strip */}
          <div className="px-5 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center gap-1.5 shrink-0">
            {LAUNCHER_ACTIONS.map(act => {
              const Icon = act.icon;
              const isCurrent =
                activeAction === act.id ||
                (act.id === 'CREATE_MATERIAL' && activeAction === 'EDIT_MATERIAL') ||
                (act.id === 'CREATE_WIP' && activeAction === 'EDIT_WIP') ||
                (act.id === 'CREATE_SKU' && activeAction === 'EDIT_SKU') ||
                (act.id === 'CREATE_RECIPE' && activeAction === 'EDIT_RECIPE') ||
                (act.id === 'CREATE_TANK' && activeAction === 'EDIT_TANK');
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={() => switchActionClean(act.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap ${
                    isCurrent
                      ? 'bg-cyan-600 border-cyan-500 text-white shadow-xs'
                      : 'bg-surface hover:bg-elevated border-border-subtle text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span>{act.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
            {/* ACTION: LAUNCHER */}
            {activeAction === 'LAUNCHER' && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-secondary absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={actionSearch}
                    onChange={(e) => setActionSearch(e.target.value)}
                    placeholder='Cari aksi atau item cepat... mis. "Tambah Material", "Buat Resep", atau nama SKU / WIP'
                    className="w-full bg-elevated border border-border-strong rounded-xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                  />
                  {actionSearch && (
                    <button
                      type="button"
                      onClick={() => setActionSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Matching entities quick jump when typing */}
                {qLower && (matchedEntities.skus.length > 0 || matchedEntities.wips.length > 0 || matchedEntities.materials.length > 0) && (
                  <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary block">
                      Item Master Ditemukan ({matchedEntities.skus.length + matchedEntities.wips.length + matchedEntities.materials.length})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {matchedEntities.skus.map(s => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-surface border border-border-subtle text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-brand font-bold mr-1.5">
                              {s.code || 'SKU'}
                            </span>
                            <span className="font-semibold text-ink-primary truncate">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSwSkuId(s.id);
                                setSwWipId('');
                                setSwKgPerCarton('');
                                setActiveAction('LINK_SKU_WIP');
                              }}
                              className="px-2 py-0.5 rounded bg-tint-cyan border border-tint-cyan-border text-brand text-[10px] font-semibold"
                            >
                              + WIP
                            </button>
                            {onUpdateSku && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSkuId(s.id);
                                  setSkuCode(s.code || '');
                                  setSkuName(s.name);
                                  setSkuIsKite(Boolean(s.isKite));
                                  setSkuTarget(String(s.targetHour));
                                  setSkuWeight(String(s.cartonWeightKg));
                                  setActiveAction('EDIT_SKU');
                                }}
                                className="px-2 py-0.5 rounded bg-elevated border border-border-strong text-ink-primary text-[10px] font-semibold"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      ))}

                      {matchedEntities.wips.map(w => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-surface border border-border-subtle text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-ink-amber font-bold mr-1.5">
                              {w.code || 'WIP'}
                            </span>
                            <span className="font-semibold text-ink-primary truncate">{w.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRecipeWipId(w.id);
                                setNewRecipeCode('');
                                setNewRecipeName('');
                                setNewRecipeDesc('');
                                setNewRecipeSelectedMatIds([]);
                                setNewRecipeDosages({});
                                setActiveAction('CREATE_RECIPE');
                              }}
                              className="px-2 py-0.5 rounded bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-semibold"
                            >
                              + Resep
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRecipeWipId(w.id);
                                setActiveAction('ADD_RECIPE_MATERIAL');
                              }}
                              className="px-2 py-0.5 rounded bg-tint-emerald border border-tint-emerald-border text-ink-emerald text-[10px] font-semibold"
                            >
                              + Material
                            </button>
                          </div>
                        </div>
                      ))}

                      {matchedEntities.materials.map(m => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-surface border border-border-subtle text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono text-[10px] text-ink-rose font-bold mr-1.5">
                              {m.code || 'MAT'}
                            </span>
                            <span className="font-semibold text-ink-primary truncate">{m.name}</span>
                          </div>
                          {onUpdateMaterial && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMaterialId(m.id);
                                setMatName(m.name);
                                setMatCode(m.code || '');
                                setMatType(m.type);
                                setMatSource(m.source);
                                setMatPackaging(m.packaging || '');
                                setMatWeight(String(m.weightKg));
                                setMatMinStock(m.minStockAlert ? String(m.minStockAlert) : '');
                                setMatInitCk(m.initialStockCk ? String(m.initialStockCk) : '');
                                setMatInitWr(m.initialStockWineroto ? String(m.initialStockWineroto) : '');
                                setMatInitTank(m.initialStockTank ? String(m.initialStockTank) : '');
                                setActiveAction('EDIT_MATERIAL');
                              }}
                              className="px-2 py-0.5 rounded bg-elevated border border-border-strong text-ink-primary text-[10px] font-semibold shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredActions.map(act => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => switchActionClean(act.id)}
                        className="group p-3.5 rounded-xl bg-canvas hover:bg-elevated border border-border-subtle hover:border-accent-primary text-left transition flex items-start gap-3"
                      >
                        <div className={`p-2 rounded-lg border shrink-0 ${act.accentClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-ink-primary group-hover:text-brand transition">
                            {act.label}
                          </div>
                          <div className="text-[11px] text-ink-secondary mt-0.5 leading-snug">
                            {act.subtitle}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ACTION: CREATE / EDIT MATERIAL */}
            {(activeAction === 'CREATE_MATERIAL' || activeAction === 'EDIT_MATERIAL') && (
              <form onSubmit={handleMaterialSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama Material *</label>
                    <input
                      type="text"
                      value={matName}
                      onChange={(e) => setMatName(e.target.value)}
                      required
                      autoFocus
                      placeholder="Contoh: Gula Pasir Halus / Minyak Nabati"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode SAP / Material</label>
                    <input
                      type="text"
                      value={matCode}
                      onChange={(e) => setMatCode(e.target.value.toUpperCase())}
                      placeholder="MAT-GL-01"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono uppercase placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Tipe Fisik Material</label>
                    <select
                      value={matType}
                      onChange={(e) => setMatType(e.target.value as MaterialType)}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="bubuk">Bubuk (Powder / Tepung)</option>
                      <option value="liquid">Liquid (Cair / Tangki)</option>
                      <option value="padat">Padat (Block / Lemak)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Sumber / Kategori Supplier</label>
                    <select
                      value={matSource}
                      onChange={(e) => setMatSource(e.target.value as MaterialSource)}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="GDRM">GDRM (Standar Gudang Utama)</option>
                      <option value="Formulasi">Formulasi (Bahan Racikan/Premix)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-ink-secondary">Kemasan &amp; Berat Standar *</label>
                    <span className="text-[10px] text-ink-muted">Preset cepat</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {packagingPresets.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setMatPackaging(preset.pkg);
                          setMatWeight(preset.weight);
                          setMatType(preset.type);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold border transition ${
                          matPackaging === preset.pkg && matWeight === preset.weight
                            ? 'bg-cyan-600 border-cyan-500 text-white'
                            : 'bg-elevated hover:bg-accent border-border-strong text-ink-secondary'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-medium text-ink-secondary mb-1">Label Kemasan</label>
                      <input
                        type="text"
                        value={matPackaging}
                        onChange={(e) => setMatPackaging(e.target.value)}
                        placeholder="Zak 25 kg / Drum 200 kg"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-medium text-ink-secondary mb-1">Berat/Kemasan (kg) *</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={matWeight}
                        onChange={(e) => setMatWeight(e.target.value)}
                        required
                        placeholder="25.0000"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums placeholder:text-ink-muted"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-medium text-ink-secondary mb-1">Alert Min (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={matMinStock}
                        onChange={(e) => setMatMinStock(e.target.value)}
                        placeholder="100"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-2.5 py-2 text-ink-primary font-mono tabular-nums placeholder:text-ink-muted"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-canvas border border-border-subtle rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ink-secondary">Saldo Awal Gudang (Opsional, kg)</span>
                    <span className="text-[11px] font-mono tabular-nums text-ink-amber font-bold">
                      Total: {((parseFloat(matInitCk) || 0) + (parseFloat(matInitWr) || 0) + (parseFloat(matInitTank) || 0)).toFixed(2)} kg
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[10px] text-ink-secondary mb-1">Gudang CK</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={matInitCk}
                        onChange={(e) => setMatInitCk(e.target.value)}
                        placeholder="0"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-2.5 py-1.5 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-secondary mb-1">Wineroto</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={matInitWr}
                        onChange={(e) => setMatInitWr(e.target.value)}
                        placeholder="0"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-2.5 py-1.5 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-ink-secondary mb-1">Storage Tank</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={matInitTank}
                        onChange={(e) => setMatInitTank(e.target.value)}
                        placeholder="0"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-2.5 py-1.5 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    {editingMaterialId ? 'Simpan Perubahan Material' : 'Simpan Material ke Database'}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: CREATE / EDIT WIP */}
            {(activeAction === 'CREATE_WIP' || activeAction === 'EDIT_WIP') && (
              <form onSubmit={handleWipSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode WIP (Unik) *</label>
                    <input
                      type="text"
                      value={wipCode}
                      onChange={(e) => setWipCode(e.target.value.toUpperCase())}
                      required={Boolean(editingWipId)}
                      placeholder="WIP-001"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-brand font-mono font-bold uppercase placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama WIP *</label>
                    <input
                      type="text"
                      value={wipName}
                      onChange={(e) => setWipName(e.target.value)}
                      required
                      placeholder="Contoh: Adonan Krim Coklat / Pasta Wafer"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Berat 1 Batch Formulasi (kg) *</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={wipBatchWeight}
                      onChange={(e) => setWipBatchWeight(e.target.value)}
                      required
                      placeholder="500.0000"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Lama Produksi (Menit / Batch) *
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={wipDurationMinutes}
                        onChange={(e) => setWipDurationMinutes(e.target.value)}
                        required
                        className="w-24 bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono font-bold tabular-nums focus:outline-none focus:border-accent-primary"
                      />
                      <div className="flex items-center gap-1">
                        {['15', '30', '45', '60'].map(mins => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => setWipDurationMinutes(mins)}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-mono border transition ${
                              wipDurationMinutes === mins
                                ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold'
                                : 'bg-elevated border-border-strong text-ink-secondary hover:bg-accent'
                            }`}
                          >
                            {mins}m
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Multi-Machine Selection */}
                <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink-primary flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-brand" />
                      <span>Mesin Produksi yang Diizinkan ({wipMachineIds.length})</span>
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setWipMachineIds(state.master.machines.map(m => m.id))}
                        className="text-brand hover:underline font-semibold"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => setWipMachineIds([])}
                        className="text-ink-secondary hover:text-ink-primary underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                    {state.master.machines.map(m => {
                      const isChecked = wipMachineIds.includes(m.id);
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition ${
                            isChecked
                              ? 'bg-tint-cyan border-tint-cyan-border text-ink-primary'
                              : 'bg-surface border-border-subtle text-ink-secondary hover:border-border-strong'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) setWipMachineIds(prev => [...prev, m.id]);
                                else setWipMachineIds(prev => prev.filter(id => id !== m.id));
                              }}
                              className="w-3.5 h-3.5 rounded text-cyan-600"
                            />
                            <span className="font-mono font-bold text-[10px] text-brand shrink-0">{m.code}</span>
                            <span className="truncate">{m.name}</span>
                          </div>
                          <span className="text-[10px] text-ink-muted font-mono shrink-0 ml-2">
                            {m.capacityKgPerHour} kg/j
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Multi-Tank Selection */}
                <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-ink-primary flex items-center gap-1.5">
                      <Cylinder className="w-3.5 h-3.5 text-ink-purple" />
                      <span>Tangki Transfer Tujuan ({wipTankIds.length})</span>
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setWipTankIds(state.master.tanks.filter(t => t.type === 'HOLDING_TANK').map(t => t.id))}
                        className="text-ink-amber hover:underline font-semibold"
                      >
                        HT Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => setWipTankIds(state.master.tanks.filter(t => t.type === 'STORAGE_TANK').map(t => t.id))}
                        className="text-brand hover:underline font-semibold"
                      >
                        ST Saja
                      </button>
                      <button
                        type="button"
                        onClick={() => setWipTankIds([])}
                        className="text-ink-secondary hover:text-ink-primary underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                    {state.master.tanks.map(t => {
                      const isChecked = wipTankIds.includes(t.id);
                      const isHT = t.type === 'HOLDING_TANK';
                      return (
                        <label
                          key={t.id}
                          className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition ${
                            isChecked
                              ? 'bg-tint-indigo border-tint-indigo-border text-ink-primary'
                              : 'bg-surface border-border-subtle text-ink-secondary hover:border-border-strong'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) setWipTankIds(prev => [...prev, t.id]);
                                else setWipTankIds(prev => prev.filter(id => id !== t.id));
                              }}
                              className="w-3.5 h-3.5 rounded text-indigo-600"
                            />
                            <span className={`font-mono text-[9px] font-bold px-1 py-0.5 rounded border shrink-0 ${
                              isHT
                                ? 'bg-tint-amber text-ink-amber border-tint-amber-border'
                                : 'bg-tint-sky text-ink-sky border-tint-sky-border'
                            }`}>
                              {isHT ? 'HT' : 'ST'}
                            </span>
                            <span className="font-mono font-bold text-ink-primary text-[11px] shrink-0">{t.code}</span>
                            <span className="truncate">{t.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-ink-muted shrink-0 ml-2">{t.capacityKg} kg</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    {editingWipId ? 'Simpan Perubahan WIP' : 'Simpan WIP Baru'}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: CREATE / EDIT SKU */}
            {(activeAction === 'CREATE_SKU' || activeAction === 'EDIT_SKU') && (
              <form onSubmit={handleSkuSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode SKU</label>
                    <input
                      type="text"
                      value={skuCode}
                      onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
                      placeholder="SKU-BSK-01"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono uppercase placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama SKU Produk Jadi *</label>
                    <input
                      type="text"
                      value={skuName}
                      onChange={(e) => setSkuName(e.target.value)}
                      required
                      autoFocus
                      placeholder="Contoh: Biskuit Wafer Coklat 120g"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                    Kategori Fasilitas Kepabeanan / Pasar
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSkuIsKite(false)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        !skuIsKite
                          ? 'bg-cyan-600 border-cyan-500 text-white'
                          : 'bg-elevated border-border-strong text-ink-secondary hover:bg-accent'
                      }`}
                    >
                      Pasar Domestik (DOM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSkuIsKite(true)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                        skuIsKite
                          ? 'bg-amber-600 border-amber-500 text-white'
                          : 'bg-elevated border-border-strong text-ink-secondary hover:bg-accent'
                      }`}
                    >
                      Ekspor Fasilitas KITE
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Target Output (Karton / Jam) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={skuTarget}
                      onChange={(e) => setSkuTarget(e.target.value)}
                      required
                      placeholder="Contoh: 180"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Berat Netto per Karton (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      value={skuWeight}
                      onChange={(e) => setSkuWeight(e.target.value)}
                      required
                      placeholder="Contoh: 4.8000"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-canvas border border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-ink-secondary">
                    Target / Shift (8 jam):{' '}
                    <strong className="font-mono tabular-nums text-brand">
                      {((parseFloat(skuTarget) || 0) * 8).toLocaleString('id-ID')} ktn
                    </strong>
                  </span>
                  <span className="text-ink-secondary">
                    Kapasitas Netto:{' '}
                    <strong className="font-mono tabular-nums text-ink-amber">
                      {((parseFloat(skuTarget) || 0) * (parseFloat(skuWeight) || 0)).toFixed(2)} kg/jam
                    </strong>
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    {editingSkuId ? 'Simpan Perubahan SKU' : 'Simpan SKU Produk'}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: LINK WIP TO SKU */}
            {activeAction === 'LINK_SKU_WIP' && (
              <form onSubmit={handleSkuWipSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      1. Pilih SKU Produk Jadi (Cari Kode/Nama) *
                    </label>
                    <SearchableEntitySelect
                      value={swSkuId}
                      onChange={setSwSkuId}
                      options={skuOptions}
                      placeholder="-- Pilih SKU --"
                      searchPlaceholder="Cari kode atau nama SKU..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      2. Pilih Komponen WIP (Cari Kode/Nama) *
                    </label>
                    <SearchableEntitySelect
                      value={swWipId}
                      onChange={setSwWipId}
                      options={wipOptions}
                      placeholder="-- Pilih WIP --"
                      searchPlaceholder="Cari kode atau nama WIP..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                    3. Kebutuhan WIP per 1 Karton SKU (kg / karton) *
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={swKgPerCarton}
                    onChange={(e) => setSwKgPerCarton(e.target.value)}
                    required
                    placeholder="Contoh: 2.4500"
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums focus:outline-none focus:border-accent-primary"
                  />
                </div>

                {/* Live linked WIPs preview for selected SKU */}
                {swSkuId && (
                  <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary block">
                      WIP Terhubung Saat Ini pada SKU Terpilih:
                    </span>
                    {(() => {
                      const existingLinks = state.master.skuWips.filter(sw => sw.skuId === swSkuId);
                      if (existingLinks.length === 0) {
                        return <p className="text-[11px] text-ink-muted italic">Belum ada WIP terhubung ke SKU ini.</p>;
                      }
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {existingLinks.map(sw => {
                            const wObj = state.master.wips.find(w => w.id === sw.wipId);
                            return (
                              <span
                                key={sw.id}
                                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-surface border border-border-subtle text-[11px]"
                              >
                                <span className="font-mono text-brand font-bold">{wObj?.code || 'WIP'}</span>
                                <span className="text-ink-primary">{wObj?.name || 'WIP'}</span>
                                <span className="font-mono tabular-nums text-ink-amber font-bold">
                                  {sw.kgWipPerCartonSku.toFixed(4)} kg/ktn
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Tutup
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    Ikat WIP ke SKU
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: CREATE RECIPE */}
            {activeAction === 'CREATE_RECIPE' && (
              <form onSubmit={handleCreateRecipeSubmit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Target WIP * (Cari Kode/Nama)</label>
                  <SearchableEntitySelect
                    value={recipeWipId}
                    onChange={setRecipeWipId}
                    options={wipOptions}
                    placeholder="-- Pilih WIP --"
                    searchPlaceholder="Cari kode atau nama WIP..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode Resep *</label>
                    <input
                      type="text"
                      value={newRecipeCode}
                      onChange={(e) => setNewRecipeCode(e.target.value.toUpperCase())}
                      required
                      placeholder="REC-WIP-01"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono font-bold uppercase focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama Resep Formulasi *</label>
                    <input
                      type="text"
                      value={newRecipeName}
                      onChange={(e) => setNewRecipeName(e.target.value)}
                      required
                      placeholder="Contoh: Resep Standar Original / Varian Ekspor"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Catatan Proses / QC (Opsional)</label>
                  <input
                    type="text"
                    value={newRecipeDesc}
                    onChange={(e) => setNewRecipeDesc(e.target.value)}
                    placeholder="Parameter mixing, suhu, atau catatan QC"
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                  />
                </div>

                {/* Multi-select initial materials */}
                <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-ink-primary">
                      Komposisi Material Awal ({newRecipeSelectedMatIds.length} Bahan Dipilih)
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-brand font-bold">
                      Total:{' '}
                      {newRecipeSelectedMatIds
                        .reduce((sum, id) => {
                          const d = newRecipeDosages[id] || getDefaultDosage(id);
                          const v = parseFloat(d.amount) || 0;
                          return sum + (d.unit === 'gr' ? v / 1000 : v);
                        }, 0)
                        .toFixed(4)}{' '}
                      kg
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={newRecipeMatSearch}
                        onChange={(e) => setNewRecipeMatSearch(e.target.value)}
                        placeholder="Cari material..."
                        className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-ink-primary"
                      />
                    </div>
                    <select
                      value={newRecipeMatTypeFilter}
                      onChange={(e) => setNewRecipeMatTypeFilter(e.target.value as any)}
                      className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                    >
                      <option value="all">Semua Tipe</option>
                      <option value="bubuk">Bubuk</option>
                      <option value="liquid">Liquid</option>
                      <option value="padat">Padat</option>
                    </select>
                  </div>

                  <div className="max-h-52 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded-lg bg-surface">
                    {state.master.materials
                      .filter(m => {
                        if (newRecipeMatTypeFilter !== 'all' && m.type !== newRecipeMatTypeFilter) return false;
                        if (newRecipeMatSearch.trim()) {
                          const q = newRecipeMatSearch.trim().toLowerCase();
                          return `${m.code || ''} ${m.name}`.toLowerCase().includes(q);
                        }
                        return true;
                      })
                      .map(m => {
                        const checked = newRecipeSelectedMatIds.includes(m.id);
                        const dose = newRecipeDosages[m.id] || getDefaultDosage(m.id);
                        return (
                          <div key={m.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 hover:bg-elevated">
                            <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setNewRecipeSelectedMatIds(prev => {
                                    if (prev.includes(m.id)) return prev.filter(id => id !== m.id);
                                    setNewRecipeDosages(dPrev => dPrev[m.id] ? dPrev : { ...dPrev, [m.id]: getDefaultDosage(m.id) });
                                    return [...prev, m.id];
                                  });
                                }}
                                className="w-3.5 h-3.5 rounded text-cyan-600"
                              />
                              {m.code && (
                                <span className="font-mono text-[10px] font-bold text-brand shrink-0">{m.code}</span>
                              )}
                              <span className="truncate text-ink-primary font-medium">{m.name}</span>
                              <span className="text-[10px] text-ink-muted uppercase shrink-0">{m.type}</span>
                            </label>
                            {checked && (
                              <div className="flex items-center gap-1 shrink-0">
                                <input
                                  type="number"
                                  step="0.0001"
                                  min="0.0001"
                                  value={dose.amount}
                                  onChange={(e) =>
                                    setNewRecipeDosages(prev => ({
                                      ...prev,
                                      [m.id]: { amount: e.target.value, unit: dose.unit }
                                    }))
                                  }
                                  className="w-20 bg-elevated border border-border-strong rounded px-2 py-1 text-right font-mono tabular-nums text-ink-primary"
                                />
                                <select
                                  value={dose.unit}
                                  onChange={(e) =>
                                    setNewRecipeDosages(prev => ({
                                      ...prev,
                                      [m.id]: { amount: dose.amount, unit: e.target.value as 'kg' | 'gr' }
                                    }))
                                  }
                                  className="bg-elevated border border-border-strong rounded px-1.5 py-1 font-mono text-ink-primary"
                                >
                                  <option value="kg">kg</option>
                                  <option value="gr">gr</option>
                                </select>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    Simpan Resep Formulasi
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: EDIT RECIPE */}
            {activeAction === 'EDIT_RECIPE' && (
              <form onSubmit={handleEditRecipeSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode Resep *</label>
                    <input
                      type="text"
                      value={editRecipeCode}
                      onChange={(e) => setEditRecipeCode(e.target.value.toUpperCase())}
                      required
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono font-bold uppercase"
                    />
                  </div>
                  <div className="sm:col-span-8">
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama Resep Formulasi *</label>
                    <input
                      type="text"
                      value={editRecipeName}
                      onChange={(e) => setEditRecipeName(e.target.value)}
                      required
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Catatan Formulasi</label>
                  <textarea
                    rows={2}
                    value={editRecipeDesc}
                    onChange={(e) => setEditRecipeDesc(e.target.value)}
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-canvas border border-border-subtle cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editRecipeIsDefault}
                    onChange={(e) => setEditRecipeIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600"
                  />
                  <div>
                    <span className="font-semibold text-ink-primary block">Jadikan Resep Acuan Utama (Default)</span>
                    <span className="text-[11px] text-ink-secondary">
                      Otomatis terpilih saat membuat batch WIP dan kalkulasi BOM
                    </span>
                  </div>
                </label>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    Simpan Perubahan Resep
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: ADD MATERIALS TO EXISTING RECIPE */}
            {activeAction === 'ADD_RECIPE_MATERIAL' && (
              <div className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Pilih WIP *</label>
                    <SearchableEntitySelect
                      value={recipeWipId}
                      onChange={setRecipeWipId}
                      options={wipOptions}
                      placeholder="-- Pilih WIP --"
                      searchPlaceholder="Cari WIP..."
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Pilih Resep Tujuan *</label>
                    {(() => {
                      const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === recipeWipId);
                      if (recipesForWip.length === 0) {
                        return (
                          <button
                            type="button"
                            onClick={() => setActiveAction('CREATE_RECIPE')}
                            className="w-full px-3 py-2 rounded-xl bg-tint-amber border border-tint-amber-border text-ink-amber font-semibold text-left"
                          >
                            WIP ini belum punya resep — klik untuk Buat Resep Baru
                          </button>
                        );
                      }
                      return (
                        <select
                          value={targetRecipeId}
                          onChange={(e) => setTargetRecipeId(e.target.value)}
                          className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary focus:outline-none focus:border-accent-primary"
                        >
                          {recipesForWip.map(r => (
                            <option key={r.id} value={r.id}>
                              [{r.recipeCode}] {r.recipeName} {r.isDefault ? '(Default)' : ''} — {r.totalWeightKg.toFixed(2)} kg
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                </div>

                {/* Mode Switcher */}
                <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
                  <div className="inline-flex rounded-xl bg-canvas border border-border-subtle p-0.5">
                    <button
                      type="button"
                      onClick={() => setRecipeInputMode('multi')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                        recipeInputMode === 'multi' ? 'bg-cyan-600 text-white' : 'text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      Pilih Banyak Sekaligus
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecipeInputMode('single')}
                      className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition ${
                        recipeInputMode === 'single' ? 'bg-cyan-600 text-white' : 'text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      Tambah Satu per Satu
                    </button>
                  </div>
                  {recipeInputMode === 'multi' && (
                    <span className="font-mono text-[11px] text-brand font-bold">
                      {selectedMaterialIds.length} bahan dipilih
                    </span>
                  )}
                </div>

                {recipeInputMode === 'multi' ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={multiMatSearch}
                          onChange={(e) => setMultiMatSearch(e.target.value)}
                          placeholder="Cari kode atau nama material..."
                          className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary"
                        />
                      </div>
                      <select
                        value={multiMatTypeFilter}
                        onChange={(e) => setMultiMatTypeFilter(e.target.value as any)}
                        className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                      >
                        <option value="all">Semua Tipe</option>
                        <option value="bubuk">Bubuk</option>
                        <option value="liquid">Liquid</option>
                        <option value="padat">Padat</option>
                      </select>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-border-subtle border border-border-subtle rounded-xl bg-canvas">
                      {state.master.materials
                        .filter(m => {
                          if (multiMatTypeFilter !== 'all' && m.type !== multiMatTypeFilter) return false;
                          if (multiMatSearch.trim()) {
                            const q = multiMatSearch.trim().toLowerCase();
                            return `${m.code || ''} ${m.name}`.toLowerCase().includes(q);
                          }
                          return true;
                        })
                        .map(m => {
                          const checked = selectedMaterialIds.includes(m.id);
                          const dose = multiMaterialDosages[m.id] || getDefaultDosage(m.id);
                          return (
                            <div key={m.id} className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-elevated">
                              <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedMaterialIds(prev => {
                                      if (prev.includes(m.id)) return prev.filter(id => id !== m.id);
                                      setMultiMaterialDosages(dPrev => dPrev[m.id] ? dPrev : { ...dPrev, [m.id]: getDefaultDosage(m.id) });
                                      return [...prev, m.id];
                                    });
                                  }}
                                  className="w-3.5 h-3.5 rounded text-cyan-600"
                                />
                                {m.code && <span className="font-mono text-[10px] font-bold text-brand shrink-0">{m.code}</span>}
                                <span className="truncate text-ink-primary font-medium">{m.name}</span>
                                <span className="text-[10px] text-ink-muted uppercase shrink-0">{m.type}</span>
                              </label>

                              {checked && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="number"
                                    step="0.0001"
                                    min="0.0001"
                                    value={dose.amount}
                                    onChange={(e) =>
                                      setMultiMaterialDosages(prev => ({
                                        ...prev,
                                        [m.id]: { amount: e.target.value, unit: dose.unit }
                                      }))
                                    }
                                    className="w-20 bg-elevated border border-border-strong rounded px-2 py-1 text-right font-mono tabular-nums text-ink-primary"
                                  />
                                  <select
                                    value={dose.unit}
                                    onChange={(e) =>
                                      setMultiMaterialDosages(prev => ({
                                        ...prev,
                                        [m.id]: { amount: dose.amount, unit: e.target.value as 'kg' | 'gr' }
                                      }))
                                    }
                                    className="bg-elevated border border-border-strong rounded px-1.5 py-1 font-mono text-ink-primary"
                                  >
                                    <option value="kg">kg</option>
                                    <option value="gr">gr</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={handleSubmitMultipleMaterialsToRecipe}
                        disabled={!targetRecipeId || selectedMaterialIds.length === 0}
                        className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold shadow-md shadow-cyan-600/20"
                      >
                        Tambahkan {selectedMaterialIds.length} Material ke Resep
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleAddSingleMaterialToRecipeSubmit} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                        Pilih Material Database (Cari Kode/Nama) *
                      </label>
                      <SearchableEntitySelect
                        value={recipeMatId}
                        onChange={(id) => {
                          setRecipeMatId(id);
                          const m = state.master.materials.find(mat => mat.id === id);
                          if (m && m.weightKg > 0) {
                            if (m.weightKg < 1) {
                              setRecipeMatUnit('gr');
                              setRecipeMatAmount(String(m.weightKg * 1000));
                            } else {
                              setRecipeMatUnit('kg');
                              setRecipeMatAmount(String(m.weightKg));
                            }
                          }
                        }}
                        options={materialOptions}
                        placeholder="-- Cari & Pilih Material --"
                        searchPlaceholder="Cari kode SAP atau nama material..."
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Takaran per 1 Batch *</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={recipeMatAmount}
                          onChange={(e) => setRecipeMatAmount(e.target.value)}
                          required
                          placeholder="0.0000"
                          className="flex-1 bg-elevated border border-border-strong rounded-xl px-3 py-2 text-brand font-mono font-bold tabular-nums"
                        />
                        <div className="flex rounded-xl overflow-hidden border border-border-strong bg-elevated p-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setRecipeMatUnit('kg')}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                              recipeMatUnit === 'kg' ? 'bg-cyan-600 text-white' : 'text-ink-secondary'
                            }`}
                          >
                            kg
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecipeMatUnit('gr')}
                            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                              recipeMatUnit === 'gr' ? 'bg-amber-600 text-white' : 'text-ink-secondary'
                            }`}
                          >
                            gr
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-tint-cyan border border-tint-cyan-border text-[11px] text-ink-secondary">
                      Setara:{' '}
                      <strong className="text-brand font-mono tabular-nums">
                        {recipeMatAmount && !isNaN(parseFloat(recipeMatAmount))
                          ? (recipeMatUnit === 'gr' ? parseFloat(recipeMatAmount) / 1000 : parseFloat(recipeMatAmount)).toFixed(4)
                          : '0.0000'}{' '}
                        kg
                      </strong>{' '}
                      per batch WIP.
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                      <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                      >
                        Tutup
                      </button>
                      <button
                        type="submit"
                        disabled={!targetRecipeId}
                        className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold"
                      >
                        Simpan ke Resep
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ACTION: CREATE MACHINE */}
            {activeAction === 'CREATE_MACHINE' && (
              <form onSubmit={handleMachineSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode Mesin *</label>
                    <input
                      type="text"
                      value={machCode}
                      onChange={(e) => setMachCode(e.target.value)}
                      required
                      placeholder="MX-02"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama Mesin *</label>
                    <input
                      type="text"
                      value={machName}
                      onChange={(e) => setMachName(e.target.value)}
                      required
                      placeholder="High-Speed Planetary Mixer"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Line Produksi *</label>
                    <input
                      type="text"
                      value={machLine}
                      onChange={(e) => setMachLine(e.target.value)}
                      required
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kapasitas (kg / jam) *</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={machCapacity}
                      onChange={(e) => setMachCapacity(e.target.value)}
                      required
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Status Operasional</label>
                    <select
                      value={machStatus}
                      onChange={(e) => setMachStatus(e.target.value as any)}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    >
                      <option value="OPERATIONAL">OPERATIONAL</option>
                      <option value="STANDBY">STANDBY</option>
                      <option value="MAINTENANCE">MAINTENANCE</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Operator PIC</label>
                    <input
                      type="text"
                      value={machOperator}
                      onChange={(e) => setMachOperator(e.target.value)}
                      placeholder="Supriyadi (Shift 1)"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Catatan Teknis / Pipa</label>
                  <input
                    type="text"
                    value={machNotes}
                    onChange={(e) => setMachNotes(e.target.value)}
                    placeholder="Terhubung ke Holding Tank HT-01"
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md shadow-indigo-600/20"
                  >
                    Simpan Mesin Produksi
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: CREATE / EDIT TANK */}
            {(activeAction === 'CREATE_TANK' || activeAction === 'EDIT_TANK') && (
              <form onSubmit={handleTankSubmit} className="space-y-3.5 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {!editingTankId && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kode Tangki *</label>
                      <input
                        type="text"
                        value={tankCode}
                        onChange={(e) => setTankCode(e.target.value.toUpperCase())}
                        required
                        placeholder="HT-04"
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono uppercase"
                      />
                    </div>
                  )}
                  <div className={editingTankId ? 'sm:col-span-2' : ''}>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Nama Tangki *</label>
                    <input
                      type="text"
                      value={tankName}
                      onChange={(e) => setTankName(e.target.value)}
                      required
                      placeholder="Holding Tank Coklat Line 1"
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    />
                  </div>
                  {!editingTankId ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Jenis Tangki *</label>
                      <select
                        value={tankTypeForm}
                        onChange={(e) => setTankTypeForm(e.target.value as WipTankType)}
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                      >
                        <option value="HOLDING_TANK">Holding Tank (HT)</option>
                        <option value="STORAGE_TANK">Storage Tank (ST)</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kapasitas (kg) *</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={tankCapacity}
                        onChange={(e) => setTankCapacity(e.target.value)}
                        required
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {!editingTankId && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Kapasitas (kg) *</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={tankCapacity}
                        onChange={(e) => setTankCapacity(e.target.value)}
                        required
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                  )}
                  {!editingTankId && (
                    <div>
                      <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Level Awal (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={tankInitialLevel}
                        onChange={(e) => setTankInitialLevel(e.target.value)}
                        className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Suhu Target (°C)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={tankTemp}
                      onChange={(e) => setTankTemp(e.target.value)}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Agitator</label>
                    <select
                      value={tankAgitator}
                      onChange={(e) => setTankAgitator(e.target.value as 'ON' | 'OFF')}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary"
                    >
                      <option value="ON">ON</option>
                      <option value="OFF">OFF</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">Min Alert (kg)</label>
                    <input
                      type="number"
                      step="1"
                      value={tankMinAlert}
                      onChange={(e) => setTankMinAlert(e.target.value)}
                      className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                    Alokasi 1 Jenis WIP (Formula Tunggal)
                  </label>
                  <SearchableEntitySelect
                    value={tankAssignedWip}
                    onChange={setTankAssignedWip}
                    options={wipOptions}
                    allowEmpty
                    emptyOptionLabel="-- Kosong / Belum Dialokasikan --"
                    placeholder="-- Pilih WIP --"
                    searchPlaceholder="Cari WIP..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Mesin Pengisi */}
                  <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-ink-primary">
                        Mesin Pengisi ({tankAssignedMachines.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setTankAssignedMachines([])}
                        className="text-[10px] text-ink-secondary hover:text-ink-primary underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {state.master.machines.map(mach => {
                        const isSelected = tankAssignedMachines.includes(mach.id);
                        return (
                          <label
                            key={mach.id}
                            className={`flex items-center justify-between p-1.5 rounded-lg border cursor-pointer ${
                              isSelected ? 'bg-tint-cyan border-tint-cyan-border' : 'bg-surface border-border-subtle'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setTankAssignedMachines(prev => [...prev, mach.id]);
                                  else setTankAssignedMachines(prev => prev.filter(id => id !== mach.id));
                                }}
                                className="w-3.5 h-3.5 rounded text-cyan-600"
                              />
                              <span className="font-mono font-bold text-brand text-[10px]">{mach.code}</span>
                              <span className="truncate text-ink-primary">{mach.name}</span>
                            </div>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-brand shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Line Produksi Tujuan */}
                  <div className="bg-canvas border border-border-subtle rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-ink-primary">
                        Lini Produksi Tujuan ({tankAssignedLines.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setTankAssignedLines([])}
                        className="text-[10px] text-ink-secondary hover:text-ink-primary underline"
                      >
                        Kosongkan
                      </button>
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {(state.master.productionLines || []).map(line => {
                        const isSelected = tankAssignedLines.includes(line.id);
                        return (
                          <label
                            key={line.id}
                            className={`flex items-center justify-between p-1.5 rounded-lg border cursor-pointer ${
                              isSelected ? 'bg-tint-emerald border-tint-emerald-border' : 'bg-surface border-border-subtle'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setTankAssignedLines(prev => [...prev, line.id]);
                                  else setTankAssignedLines(prev => prev.filter(id => id !== line.id));
                                }}
                                className="w-3.5 h-3.5 rounded text-emerald-600"
                              />
                              <span className="font-mono font-bold text-ink-emerald text-[10px]">{line.code}</span>
                              <span className="truncate text-ink-primary">{line.name}</span>
                            </div>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-ink-emerald shrink-0" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="px-4 py-2 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-md shadow-cyan-600/20"
                  >
                    {editingTankId ? 'Simpan Perubahan Tangki' : 'Simpan Tangki WIP'}
                  </button>
                </div>
              </form>
            )}

            {/* ACTION: IMPORT HUB */}
            {activeAction === 'IMPORT_HUB' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                {[
                  {
                    key: 'MATERIAL' as const,
                    title: 'Import Master Material',
                    desc: 'Impor daftar bahan baku & saldo awal dari Excel/CSV/Google Drive',
                    icon: Database
                  },
                  {
                    key: 'SKU' as const,
                    title: 'Import Master SKU',
                    desc: 'Impor katalog produk jadi (DOM / KITE), target/jam & bobot karton',
                    icon: Box
                  },
                  {
                    key: 'SKU_WIP' as const,
                    title: 'Import Relasi SKU - WIP',
                    desc: 'Pemetaan massal komponen WIP (kg/karton) ke daftar SKU',
                    icon: GitBranch
                  },
                  {
                    key: 'RECIPE' as const,
                    title: 'Import Resep Formulasi WIP',
                    desc: 'Impor batch formula resep beserta komposisi material per WIP',
                    icon: FileSpreadsheet
                  },
                  {
                    key: 'MACHINE' as const,
                    title: 'Import Mesin Produksi',
                    desc: 'Muat master list mixer, cooker, extruder beserta kapasitasnya',
                    icon: Cpu
                  },
                  {
                    key: 'TANK' as const,
                    title: 'Import Tangki WIP',
                    desc: 'Muat data Holding Tank & Storage Tank serta alokasi WIP',
                    icon: Cylinder
                  }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenImportModal(item.key);
                      }}
                      className="p-4 rounded-xl bg-canvas hover:bg-elevated border border-border-subtle hover:border-accent-primary text-left transition space-y-1.5"
                    >
                      <div className="flex items-center gap-2 text-brand font-bold">
                        <Icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </div>
                      <p className="text-[11px] text-ink-secondary leading-snug">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
