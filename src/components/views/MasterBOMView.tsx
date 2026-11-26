import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowRight,
  Building,
  ChevronDown,
  ChevronRight,
  Cpu,
  Cylinder,
  Database,
  Edit3,
  Eye,
  EyeOff,
  GitBranch,
  History,
  KeyRound,
  Layers,
  Lock,
  Plus,
  RotateCw,
  Scale,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Unlink,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { BomActionPopupModal, BomPopupAction, BomPopupContext } from '../BomActionPopupModal';
import { MaterialImportModal } from '../MaterialImportModal';
import { MachineImportModal } from '../MachineImportModal';
import { TankImportModal } from '../TankImportModal';
import { MachineChangeoverModal } from '../MachineChangeoverModal';
import { MachineChangeoverHistoryModal } from '../MachineChangeoverHistoryModal';
import { validatePasswordStrength } from '../../utils/security';
import { RecipeImportModal } from '../RecipeImportModal';
import { SkuImportModal } from '../SkuImportModal';
import { SkuWipImportModal } from '../SkuWipImportModal';
import { resolveEffectiveRole } from '../../utils/roleAccess';
import {
  AppState,
  ChangeoverType,
  MachineChangeoverChecklist,
  MachineChangeoverRecord,
  Material,
  MaterialSource,
  MaterialType,
  ProductionMachine,
  RegisteredManagement,
  RegisteredOperator,
  SKU,
  SkuWip,
  WIP,
  WipMaterial,
  WipRecipe,
  WipRecipeItem,
  WipTank
} from '../../types';

interface MasterBOMViewProps {
  state: AppState;
  onAddMaterial: (mat: Omit<Material, 'id'>) => void;
  onUpdateMaterial?: (materialId: string, updates: Partial<Material>) => void;
  onDeleteMaterial: (id: string) => void;
  onImportMaterials?: (materials: Material[], mode: 'replace' | 'append') => void;
  onAddWip: (wip: Omit<WIP, 'id'>) => void;
  onUpdateWip?: (wipId: string, updates: Partial<WIP>) => void;
  onDeleteWip: (id: string) => void;
  onAddSku: (sku: Omit<SKU, 'id'>) => void;
  onUpdateSku?: (skuId: string, updates: Partial<SKU>) => void;
  onDeleteSku: (id: string) => void;
  onImportSkus?: (skus: SKU[], mode: 'replace' | 'append') => void;
  onAddSkuWip: (sw: Omit<SkuWip, 'id'>) => void;
  onDeleteSkuWip: (id: string) => void;
  onImportSkuWips?: (skuWips: SkuWip[], mode: 'replace' | 'append') => void;
  onAddWipMat: (wm: Omit<WipMaterial, 'id'>) => void;
  onDeleteWipMat: (id: string) => void;
  onAddRecipe?: (recipe: Omit<WipRecipe, 'id' | 'createdAt'>) => void;
  onUpdateRecipe?: (recipeId: string, updates: Partial<WipRecipe>) => void;
  onDeleteRecipe?: (recipeId: string) => void;
  onImportRecipes?: (recipes: WipRecipe[], mode: 'replace' | 'append') => void;
  onAddMaterialToRecipe?: (recipeId: string, item: Omit<WipRecipeItem, 'id'>) => void;
  onAddMultipleMaterialsToRecipe?: (recipeId: string, items: Array<Omit<WipRecipeItem, 'id'>>) => void;
  onUpdateRecipeItem?: (recipeId: string, itemId: string, newAmount: number, newUnit: 'kg' | 'gr') => void;
  onDeleteMaterialFromRecipe?: (recipeId: string, itemId: string) => void;
  onAddMachine?: (m: Omit<ProductionMachine, 'id'>) => void;
  onDeleteMachine?: (id: string) => void;
  onImportMachines?: (machines: ProductionMachine[], mode: 'replace' | 'append') => void;
  onStartMachineChangeover?: (
    machineId: string,
    data: {
      toWipId: string;
      toWipName: string;
      fromWipId?: string;
      fromWipName?: string;
      targetTankId?: string;
      targetTankCode?: string;
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      qcInspectorName?: string;
      checklist: MachineChangeoverChecklist;
      notes?: string;
    }
  ) => void;
  onCompleteMachineChangeover?: (machineId: string, record: MachineChangeoverRecord) => void;
  onCancelMachineChangeover?: (machineId: string) => void;
  onAddTank?: (t: Omit<WipTank, 'id'>) => void;
  onUpdateTank?: (tankId: string, updates: Partial<WipTank>) => void;
  onDeleteTank?: (id: string) => void;
  onImportTanks?: (tanks: WipTank[], mode: 'replace' | 'append') => void;
  onAddOperator?: (op: Omit<RegisteredOperator, 'id' | 'registeredAt'>) => void;
  onUpdateOperator?: (id: string, updates: Partial<RegisteredOperator>) => void;
  onDeleteOperator?: (id: string) => void;
  onAddManagement?: (mgt: Omit<RegisteredManagement, 'id' | 'registeredAt'>) => void;
  onToggleManagementAccess?: (id: string, hasAccess: boolean) => void;
  onDeleteManagement?: (id: string) => void;
  onChangeAdminPin?: (newPin: string) => void;
  onOpenAdminModal: () => void;
  onOpenUserManagement?: () => void;
  onOpenStockAdjustment?: (materialId?: string) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

type MasterMainTab = 'BOM_TREE' | 'RECIPES' | 'MATERIALS' | 'EQUIPMENT' | 'USERS';

export const MasterBOMView: React.FC<MasterBOMViewProps> = ({
  state,
  onAddMaterial,
  onUpdateMaterial,
  onDeleteMaterial,
  onImportMaterials,
  onAddWip,
  onUpdateWip,
  onDeleteWip,
  onAddSku,
  onUpdateSku,
  onDeleteSku,
  onImportSkus,
  onAddSkuWip,
  onDeleteSkuWip,
  onImportSkuWips,
  onAddWipMat: _onAddWipMat,
  onDeleteWipMat,
  onAddRecipe,
  onUpdateRecipe,
  onDeleteRecipe,
  onImportRecipes,
  onAddMaterialToRecipe,
  onAddMultipleMaterialsToRecipe,
  onUpdateRecipeItem,
  onDeleteMaterialFromRecipe,
  onAddMachine,
  onDeleteMachine,
  onImportMachines,
  onStartMachineChangeover,
  onCompleteMachineChangeover,
  onCancelMachineChangeover,
  onAddTank,
  onUpdateTank,
  onDeleteTank,
  onImportTanks,
  onAddOperator,
  onUpdateOperator,
  onDeleteOperator,
  onAddManagement,
  onToggleManagementAccess,
  onDeleteManagement,
  onChangeAdminPin,
  onOpenAdminModal,
  onOpenUserManagement,
  onOpenStockAdjustment,
  onSwitchTab,
  showToast
}) => {
  const effectiveRole = resolveEffectiveRole(state);
  const isAdmin = effectiveRole.isAdmin;

  // Main Canvas Tabs
  const [activeTab, setActiveTab] = useState<MasterMainTab>('BOM_TREE');
  const [equipmentSubTab, setEquipmentSubTab] = useState<'MACHINES' | 'TANKS'>('MACHINES');

  // Unified BOM Action Popup Modal State
  const [bomPopupOpen, setBomPopupOpen] = useState(false);
  const [bomPopupAction, setBomPopupAction] = useState<BomPopupAction>('LAUNCHER');
  const [bomPopupContext, setBomPopupContext] = useState<BomPopupContext | undefined>(undefined);

  const openBomPopup = useCallback((action: BomPopupAction = 'LAUNCHER', context?: BomPopupContext) => {
    setBomPopupAction(action);
    setBomPopupContext(context);
    setBomPopupOpen(true);
  }, []);

  // Import Modals
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isMachineImportOpen, setIsMachineImportOpen] = useState(false);
  const [isTankImportOpen, setIsTankImportOpen] = useState(false);
  const [isRecipeImportOpen, setIsRecipeImportOpen] = useState(false);
  const [isSkuImportOpen, setIsSkuImportOpen] = useState(false);
  const [isSkuWipImportOpen, setIsSkuWipImportOpen] = useState(false);

  // Machine changeover modals
  const [changeoverModalMachine, setChangeoverModalMachine] = useState<ProductionMachine | null>(null);
  const [isChangeoverHistoryOpen, setIsChangeoverHistoryOpen] = useState(false);
  const [historySelectedMachineId, setHistorySelectedMachineId] = useState<string | null>(null);
  const [machineStatusFilter, setMachineStatusFilter] = useState<'ALL' | 'OPERATIONAL' | 'CHANGEOVER' | 'STANDBY'>('ALL');
  const [equipmentSearch, setEquipmentSearch] = useState('');

  // Tab 1: Struktur SKU & BOM Tree filters & expand state
  const [treeSearch, setTreeSearch] = useState('');
  const [treeCategory, setTreeCategory] = useState<'ALL' | 'DOM' | 'KITE'>('ALL');
  const [expandedSkuIds, setExpandedSkuIds] = useState<Record<string, boolean>>({});

  // Tab 2: Resep Formulasi WIP state
  const [wipSearch, setWipSearch] = useState('');
  const [selectedWipId, setSelectedWipId] = useState<string>(state.master.wips[0]?.id || '');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');

  // Keep selectedWipId valid & auto-select active recipe
  useEffect(() => {
    if (!selectedWipId || !state.master.wips.some(w => w.id === selectedWipId)) {
      setSelectedWipId(state.master.wips[0]?.id || '');
    }
  }, [state.master.wips, selectedWipId]);

  useEffect(() => {
    if (!selectedWipId) {
      setSelectedRecipeId('');
      return;
    }
    const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === selectedWipId);
    if (recipesForWip.length === 0) {
      setSelectedRecipeId('');
      return;
    }
    if (!recipesForWip.some(r => r.id === selectedRecipeId)) {
      const def = recipesForWip.find(r => r.isDefault) || recipesForWip[0];
      setSelectedRecipeId(def.id);
    }
  }, [selectedWipId, state.master.recipes, selectedRecipeId]);

  // Tab 3: Database Material filters
  const [matSearch, setMatSearch] = useState('');
  const [matTypeFilter, setMatTypeFilter] = useState<'ALL' | MaterialType>('ALL');
  const [matSourceFilter, setMatSourceFilter] = useState<'ALL' | MaterialSource>('ALL');

  // Edit Item in Recipe Modal
  const [editingRecipeItem, setEditingRecipeItem] = useState<{ recipeId: string; item: WipRecipeItem } | null>(null);
  const [editItemAmount, setEditItemAmount] = useState('');
  const [editItemUnit, setEditItemUnit] = useState<'kg' | 'gr'>('kg');

  // Delete Recipe Confirmation
  const [deleteRecipeTarget, setDeleteRecipeTarget] = useState<WipRecipe | null>(null);

  // Generic Delete Confirmation for Master Entities & Users
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'OPERATOR' | 'MANAGEMENT' | 'SKU' | 'WIP' | 'MATERIAL' | 'MACHINE' | 'TANK';
    id: string;
    name: string;
    details: string;
  } | null>(null);

  // Users & Access sub-tab states
  const [activeUserTab, setActiveUserTab] = useState<'OPERATORS' | 'MANAGEMENT' | 'SECURITY'>('OPERATORS');
  const [isOperatorFormOpen, setIsOperatorFormOpen] = useState(false);
  const [isManagementFormOpen, setIsManagementFormOpen] = useState(false);
  const [opName, setOpName] = useState('');
  const [opNik, setOpNik] = useState('');
  const [opLine, setOpLine] = useState('Line 1 (Biskuit Domestik)');
  const [opShift, setOpShift] = useState<1 | 2 | 3>(1);
  const [opNotes, setOpNotes] = useState('');
  const [opSearch, setOpSearch] = useState('');
  const [opShiftFilter, setOpShiftFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');
  const [opStatusFilter, setOpStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  const [mgtName, setMgtName] = useState('');
  const [mgtEmail, setMgtEmail] = useState('');
  const [mgtTitle, setMgtTitle] = useState('');
  const [mgtDepartment, setMgtDepartment] = useState('Plant Operations Management');
  const [mgtAccess, setMgtAccess] = useState(true);
  const [mgtSearch, setMgtSearch] = useState('');
  const [mgtAccessFilter, setMgtAccessFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');

  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');

  // Keyboard shortcuts: Ctrl+K and '/' inside MasterBOMView
  useEffect(() => {
    if (!isAdmin) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setBomPopupAction('LAUNCHER');
        setBomPopupContext(undefined);
        setBomPopupOpen(prev => !prev);
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping && !bomPopupOpen) {
        e.preventDefault();
        openBomPopup('LAUNCHER');
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isAdmin, bomPopupOpen, openBomPopup]);

  const handleOpenImportModalByKey = useCallback(
    (target: 'MATERIAL' | 'SKU' | 'SKU_WIP' | 'RECIPE' | 'MACHINE' | 'TANK') => {
      if (!isAdmin) {
        onOpenAdminModal();
        showToast('Otorisasi Administrator diperlukan untuk impor data master', true);
        return;
      }
      if (target === 'MATERIAL') setIsImportModalOpen(true);
      else if (target === 'SKU') setIsSkuImportOpen(true);
      else if (target === 'SKU_WIP') setIsSkuWipImportOpen(true);
      else if (target === 'RECIPE') setIsRecipeImportOpen(true);
      else if (target === 'MACHINE') setIsMachineImportOpen(true);
      else if (target === 'TANK') setIsTankImportOpen(true);
    },
    [isAdmin, onOpenAdminModal, showToast]
  );

  // User CRUD handlers
  const generateAutoNik = () => {
    const year = new Date().getFullYear();
    const count = (state.registeredOperators?.length || 0) + 1;
    const autoNik = `OPR-${year}-${String(count).padStart(3, '0')}`;
    setOpNik(autoNik);
    showToast(`NIK Otomatis dibuat: ${autoNik}`);
  };

  const handleOperatorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opName.trim() || !opNik.trim()) {
      showToast('Harap masukkan nama lengkap dan NIK operator', true);
      return;
    }
    if (onAddOperator) {
      onAddOperator({
        name: opName.trim(),
        nik: opNik.trim().toUpperCase(),
        assignedLine: opLine,
        assignedShift: opShift,
        status: 'ACTIVE',
        notes: opNotes.trim() || undefined
      });
      setOpName('');
      setOpNik('');
      setOpNotes('');
      setIsOperatorFormOpen(false);
    }
  };

  const handleManagementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mgtName.trim() || !mgtEmail.trim() || !mgtTitle.trim()) {
      showToast('Harap masukkan nama lengkap, email, dan jabatan management', true);
      return;
    }
    if (onAddManagement) {
      onAddManagement({
        name: mgtName.trim(),
        email: mgtEmail.trim().toLowerCase(),
        title: mgtTitle.trim(),
        department: mgtDepartment,
        hasViewAccess: mgtAccess
      });
      setMgtName('');
      setMgtEmail('');
      setMgtTitle('');
      setIsManagementFormOpen(false);
    }
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePasswordStrength(newAdminPin);
    if (!check.isValid) {
      showToast(check.message || 'PIN/Password minimal 8 karakter dan tidak boleh umum.', true);
      return;
    }
    if (newAdminPin.trim() !== confirmAdminPin.trim()) {
      showToast('Konfirmasi PIN tidak cocok!', true);
      return;
    }
    if (onChangeAdminPin) {
      await onChangeAdminPin(newAdminPin.trim());
      setNewAdminPin('');
      setConfirmAdminPin('');
    }
  };

  const handleConfirmDeleteEntity = () => {
    if (!deleteConfirmation) return;
    const { type, id } = deleteConfirmation;
    if (type === 'OPERATOR' && onDeleteOperator) onDeleteOperator(id);
    else if (type === 'MANAGEMENT' && onDeleteManagement) onDeleteManagement(id);
    else if (type === 'SKU') onDeleteSku(id);
    else if (type === 'WIP') onDeleteWip(id);
    else if (type === 'MATERIAL') onDeleteMaterial(id);
    else if (type === 'MACHINE' && onDeleteMachine) onDeleteMachine(id);
    else if (type === 'TANK' && onDeleteTank) onDeleteTank(id);
    setDeleteConfirmation(null);
  };

  const handleSaveEditRecipeItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipeItem) return;
    const val = parseFloat(editItemAmount);
    if (isNaN(val) || val <= 0) {
      showToast('Masukkan takaran material yang valid (> 0)', true);
      return;
    }
    if (onUpdateRecipeItem) {
      onUpdateRecipeItem(editingRecipeItem.recipeId, editingRecipeItem.item.id, val, editItemUnit);
      showToast(`Takaran material diperbarui menjadi ${val} ${editItemUnit}`);
      setEditingRecipeItem(null);
    }
  };

  const handleConfirmDeleteRecipe = () => {
    if (!deleteRecipeTarget) return;
    if (onDeleteRecipe) {
      onDeleteRecipe(deleteRecipeTarget.id);
      showToast(`Resep "${deleteRecipeTarget.recipeName}" (${deleteRecipeTarget.recipeCode}) berhasil dihapus`);
      if (selectedRecipeId === deleteRecipeTarget.id) setSelectedRecipeId('');
      setDeleteRecipeTarget(null);
    }
  };

  // Filtered datasets
  const filteredSkus = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    return state.master.skus.filter(sku => {
      if (treeCategory === 'DOM' && sku.isKite) return false;
      if (treeCategory === 'KITE' && !sku.isKite) return false;
      if (!q) return true;
      if (`${sku.code || ''} ${sku.name}`.toLowerCase().includes(q)) return true;
      const linkedWipIds = state.master.skuWips.filter(sw => sw.skuId === sku.id).map(sw => sw.wipId);
      return state.master.wips.some(
        w => linkedWipIds.includes(w.id) && `${w.code || ''} ${w.name}`.toLowerCase().includes(q)
      );
    });
  }, [state.master.skus, state.master.skuWips, state.master.wips, treeSearch, treeCategory]);

  const filteredWips = useMemo(() => {
    const q = wipSearch.trim().toLowerCase();
    if (!q) return state.master.wips;
    return state.master.wips.filter(w => {
      if (`${w.code || ''} ${w.name}`.toLowerCase().includes(q)) return true;
      return (state.master.recipes || []).some(
        r => r.wipId === w.id && `${r.recipeCode} ${r.recipeName}`.toLowerCase().includes(q)
      );
    });
  }, [state.master.wips, state.master.recipes, wipSearch]);

  const filteredMaterials = useMemo(() => {
    const q = matSearch.trim().toLowerCase();
    return state.master.materials.filter(m => {
      if (matTypeFilter !== 'ALL' && m.type !== matTypeFilter) return false;
      if (matSourceFilter !== 'ALL' && m.source !== matSourceFilter) return false;
      if (q) {
        const hay = `${m.code || ''} ${m.name} ${m.packaging} ${m.type} ${m.source}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.master.materials, matSearch, matTypeFilter, matSourceFilter]);

  const filteredMachines = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    return state.master.machines.filter(m => {
      if (machineStatusFilter === 'OPERATIONAL' && m.status !== 'OPERATIONAL') return false;
      if (machineStatusFilter === 'CHANGEOVER' && m.status !== 'CHANGEOVER') return false;
      if (machineStatusFilter === 'STANDBY' && m.status !== 'STANDBY' && m.status !== 'MAINTENANCE') return false;
      if (q) {
        return `${m.code} ${m.name} ${m.line} ${m.currentWipName || ''}`.toLowerCase().includes(q);
      }
      return true;
    });
  }, [state.master.machines, machineStatusFilter, equipmentSearch]);

  const filteredTanks = useMemo(() => {
    const q = equipmentSearch.trim().toLowerCase();
    if (!q) return state.master.tanks;
    return state.master.tanks.filter(t => {
      const wip = state.master.wips.find(w => w.id === t.assignedWipId);
      return `${t.code} ${t.name} ${t.type} ${wip?.name || ''}`.toLowerCase().includes(q);
    });
  }, [state.master.tanks, state.master.wips, equipmentSearch]);

  const allExpanded =
    filteredSkus.length > 0 && filteredSkus.every(s => Boolean(expandedSkuIds[s.id]));

  const toggleExpandAllSkus = () => {
    if (allExpanded) {
      setExpandedSkuIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredSkus.forEach(s => {
        next[s.id] = true;
      });
      setExpandedSkuIds(next);
    }
  };

  // Access check
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-14 px-4 bg-surface border border-border-subtle rounded-2xl mt-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-tint-rose border border-tint-rose-border text-ink-rose flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-base text-ink-primary mb-2">Akses Administrator Diperlukan</h3>
        <p className="text-xs text-ink-secondary mb-6 leading-relaxed">
          Modul Master Data &amp; Bill of Materials (BOM) memengaruhi perhitungan formula resep dan seluruh inventaris pabrik. Harap login dengan PIN Administrator untuk melanjutkan.
        </p>
        <button
          onClick={onOpenAdminModal}
          className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-cyan-600/20 transition active:scale-95"
        >
          Buka Login Administrator
        </button>
      </div>
    );
  }

  const selectedWipObj = state.master.wips.find(w => w.id === selectedWipId) || null;
  const selectedWipRecipes = selectedWipObj
    ? (state.master.recipes || []).filter(r => r.wipId === selectedWipObj.id)
    : [];
  const activeRecipeObj =
    selectedWipRecipes.find(r => r.id === selectedRecipeId) || selectedWipRecipes[0] || null;
  const activeWipLegacyMats = selectedWipObj
    ? state.master.wipMats.filter(wm => wm.wipId === selectedWipObj.id)
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-4 pb-8">
      {/* Slim Workspace Header + Single Primary Action Button */}
      <div className="bg-surface border border-border-subtle rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-sm sm:text-base font-bold text-ink-primary tracking-tight">
              Master Data &amp; Bill of Materials (BOM)
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-ink-secondary">
              {state.master.skus.length} SKU · {state.master.wips.length} WIP · {(state.master.recipes || []).length} Resep · {state.master.materials.length} Material · {state.master.machines.length} Mesin · {state.master.tanks.length} Tangki
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onSwitchTab && (
            <button
              type="button"
              onClick={() => onSwitchTab('weekly-planning')}
              className="px-3 py-1.5 rounded-xl bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <span>Tahap 02: Planning</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => openBomPopup('LAUNCHER')}
            className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20 flex items-center gap-2 transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Input / Kelola BOM</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-mono font-semibold text-white/90">
              Ctrl+K / /
            </kbd>
          </button>
        </div>
      </div>

      {/* Slim Top Tab Switcher */}
      <div className="bg-surface border border-border-subtle p-1 rounded-xl flex flex-wrap items-center justify-between gap-1">
        <div className="flex flex-wrap items-center gap-1">
          {[
            { id: 'BOM_TREE' as const, label: 'Struktur SKU & BOM', count: state.master.skus.length, icon: GitBranch },
            { id: 'RECIPES' as const, label: 'Resep Formulasi WIP', count: (state.master.recipes || []).length, icon: Sparkles },
            { id: 'MATERIALS' as const, label: 'Database Material', count: state.master.materials.length, icon: Database },
            { id: 'EQUIPMENT' as const, label: 'Mesin & Tangki', count: state.master.machines.length + state.master.tanks.length, icon: Cpu }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  isActive
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
                <span className={`font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded ${
                  isActive ? 'bg-black/20 text-white' : 'bg-canvas text-ink-muted'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('USERS')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
            activeTab === 'USERS'
              ? 'bg-amber-500 text-slate-950 shadow-xs'
              : 'text-ink-amber hover:bg-elevated'
          }`}
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>Akses User &amp; PIN</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: STRUKTUR SKU & BOM (INTERACTIVE COMPACT TREE-VIEW / TABLE)     */}
      {/* ===================================================================== */}
      {activeTab === 'BOM_TREE' && (
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
          {/* Compact Toolbar */}
          <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="Cari kode/nama SKU atau WIP..."
                  className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                />
                {treeSearch && (
                  <button
                    type="button"
                    onClick={() => setTreeSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="inline-flex rounded-lg border border-border-strong bg-elevated p-0.5">
                {(['ALL', 'DOM', 'KITE'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setTreeCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                      treeCategory === cat
                        ? 'bg-cyan-600 text-white'
                        : 'text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua' : cat === 'DOM' ? 'DOM' : 'KITE'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] shrink-0">
              <span className="font-mono tabular-nums text-ink-secondary">
                {filteredSkus.length}/{state.master.skus.length} SKU
              </span>
              <button
                type="button"
                onClick={toggleExpandAllSkus}
                className="px-2.5 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary font-semibold transition"
              >
                {allExpanded ? 'Collapse Semua' : 'Expand Semua'}
              </button>
              <button
                type="button"
                onClick={() => openBomPopup('CREATE_SKU')}
                className="px-2.5 py-1 rounded-lg bg-tint-cyan hover:bg-tint-cyan border border-tint-cyan-border text-brand font-semibold flex items-center gap-1 transition"
              >
                <Plus className="w-3 h-3" />
                <span>SKU Baru</span>
              </button>
            </div>
          </div>

          {/* Tree Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                  <th className="px-3 w-8"></th>
                  <th className="px-3">Kode &amp; Nama SKU Finish Good</th>
                  <th className="px-2.5 text-center">Pasar</th>
                  <th className="px-2.5 text-right">Target/Jam</th>
                  <th className="px-2.5 text-right">Target/Shift</th>
                  <th className="px-2.5 text-right">Netto/Ktn</th>
                  <th className="px-2.5 text-center">WIP Terikat</th>
                  <th className="px-3 text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredSkus.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-xs text-ink-muted">
                      {state.master.skus.length === 0
                        ? 'Belum ada SKU. Klik "+ Input / Kelola BOM" untuk menambahkan SKU dan struktur BOM.'
                        : 'Tidak ada SKU yang cocok dengan pencarian/filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredSkus.map(sku => {
                    const isExpanded = Boolean(expandedSkuIds[sku.id]);
                    const skuWipComps = state.master.skuWips.filter(sw => sw.skuId === sku.id);
                    const totalWipKgPerCtn = skuWipComps.reduce((s, sw) => s + sw.kgWipPerCartonSku, 0);

                    return (
                      <React.Fragment key={sku.id}>
                        <tr
                          className={`h-[38px] transition cursor-pointer ${
                            isExpanded ? 'bg-elevated/70' : 'hover:bg-elevated/60'
                          }`}
                          onClick={() =>
                            setExpandedSkuIds(prev => ({ ...prev, [sku.id]: !prev[sku.id] }))
                          }
                        >
                          <td className="px-3 text-ink-secondary">
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-brand" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </td>
                          <td className="px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {sku.code && (
                                <span className="font-mono tabular-nums text-[11px] font-bold text-brand shrink-0">
                                  {sku.code}
                                </span>
                              )}
                              <span className="font-semibold text-ink-primary truncate">{sku.name}</span>
                            </div>
                          </td>
                          <td className="px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                sku.isKite
                                  ? 'bg-tint-amber text-ink-amber border-tint-amber-border'
                                  : 'bg-tint-cyan text-brand border-tint-cyan-border'
                              }`}
                            >
                              {sku.isKite ? 'KITE' : 'DOM'}
                            </span>
                          </td>
                          <td className="px-2.5 text-right font-mono tabular-nums text-ink-primary whitespace-nowrap">
                            {sku.targetHour.toLocaleString('id-ID')} ktn
                          </td>
                          <td className="px-2.5 text-right font-mono tabular-nums text-brand font-semibold whitespace-nowrap">
                            {(sku.targetHour * 8).toLocaleString('id-ID')} ktn
                          </td>
                          <td className="px-2.5 text-right font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                            {sku.cartonWeightKg.toFixed(4)} kg
                          </td>
                          <td className="px-2.5 text-center whitespace-nowrap">
                            <span className={`font-mono tabular-nums text-[11px] font-semibold ${
                              skuWipComps.length > 0 ? 'text-ink-emerald' : 'text-ink-muted'
                            }`}>
                              {skuWipComps.length} WIP {totalWipKgPerCtn > 0 ? `· ${totalWipKgPerCtn.toFixed(2)} kg` : ''}
                            </span>
                          </td>
                          <td
                            className="px-3 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openBomPopup('LINK_SKU_WIP', { skuId: sku.id })}
                                className="px-2 py-0.5 rounded bg-tint-cyan hover:bg-cyan-600/25 border border-tint-cyan-border text-brand text-[10px] font-semibold transition"
                                title="Hubungkan komponen WIP ke SKU ini"
                              >
                                + WIP
                              </button>
                              {onUpdateSku && (
                                <button
                                  type="button"
                                  onClick={() => openBomPopup('EDIT_SKU', { skuId: sku.id })}
                                  className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
                                  title="Edit SKU"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmation({
                                    type: 'SKU',
                                    id: sku.id,
                                    name: sku.name,
                                    details: `${sku.code ? `[${sku.code}] ` : ''}${sku.isKite ? 'KITE Ekspor' : 'Domestik'} · ${sku.cartonWeightKg.toFixed(4)} kg/ktn`
                                  })
                                }
                                className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose transition"
                                title="Hapus SKU"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded BOM Tree Node: Linked WIPs -> Recipes -> Materials */}
                        {isExpanded && (
                          <tr className="bg-canvas/70">
                            <td colSpan={8} className="px-4 py-3 border-t border-border-subtle">
                              <div className="pl-3 border-l-2 border-cyan-500/40 space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
                                    Komponen WIP pada {sku.code ? `[${sku.code}] ` : ''}{sku.name} ({skuWipComps.length} WIP)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openBomPopup('LINK_SKU_WIP', { skuId: sku.id })}
                                    className="text-[11px] font-semibold text-brand hover:underline flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Hubungkan WIP ke SKU ini</span>
                                  </button>
                                </div>

                                {skuWipComps.length === 0 ? (
                                  <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle text-[11px] text-ink-muted flex items-center justify-between">
                                    <span>Belum ada WIP yang dihubungkan ke SKU ini.</span>
                                    <button
                                      type="button"
                                      onClick={() => openBomPopup('LINK_SKU_WIP', { skuId: sku.id })}
                                      className="px-2.5 py-1 rounded bg-cyan-600 text-white text-[10px] font-bold"
                                    >
                                      + Hubungkan WIP
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {skuWipComps.map(sw => {
                                      const wObj = state.master.wips.find(w => w.id === sw.wipId);
                                      const wipRecipes = (state.master.recipes || []).filter(r => r.wipId === sw.wipId);
                                      const defaultRecipe = wipRecipes.find(r => r.isDefault) || wipRecipes[0];
                                      const legacyWipMats = state.master.wipMats.filter(wm => wm.wipId === sw.wipId);
                                      const machineIds = wObj?.assignedMachineIds?.length
                                        ? wObj.assignedMachineIds
                                        : wObj?.assignedMachineId ? [wObj.assignedMachineId] : [];
                                      const machines = state.master.machines.filter(m => machineIds.includes(m.id));

                                      return (
                                        <div
                                          key={sw.id}
                                          className="bg-surface border border-border-subtle rounded-xl overflow-hidden"
                                        >
                                          {/* WIP Row Header (38px compact) */}
                                          <div className="min-h-[38px] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-elevated/40">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <Layers className="w-3.5 h-3.5 text-ink-amber shrink-0" />
                                              {wObj?.code && (
                                                <span className="font-mono tabular-nums text-[11px] font-bold text-ink-amber shrink-0">
                                                  {wObj.code}
                                                </span>
                                              )}
                                              <span className="font-bold text-xs text-ink-primary truncate">
                                                {wObj ? wObj.name : 'WIP'}
                                              </span>
                                              <span className="font-mono tabular-nums text-[11px] text-brand font-semibold">
                                                {sw.kgWipPerCartonSku.toFixed(4)} kg/ktn
                                              </span>
                                              {wObj && (
                                                <span className="text-[10px] font-mono tabular-nums text-ink-secondary hidden sm:inline">
                                                  · Batch {wObj.batchWeightKg.toFixed(2)} kg · {machines.map(m => m.code).join(', ') || 'Tanpa mesin'}
                                                </span>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                              {wObj && (
                                                <button
                                                  type="button"
                                                  onClick={() => openBomPopup('CREATE_RECIPE', { wipId: wObj.id })}
                                                  className="px-2 py-0.5 rounded bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-semibold transition"
                                                  title="Buat resep baru untuk WIP ini"
                                                >
                                                  + Resep
                                                </button>
                                              )}
                                              {wObj && (
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    openBomPopup('ADD_RECIPE_MATERIAL', {
                                                      wipId: wObj.id,
                                                      recipeId: defaultRecipe?.id
                                                    })
                                                  }
                                                  className="px-2 py-0.5 rounded bg-tint-emerald border border-tint-emerald-border text-ink-emerald text-[10px] font-semibold transition"
                                                  title="Tambah material ke resep WIP ini"
                                                >
                                                  + Material
                                                </button>
                                              )}
                                              {wObj && onUpdateWip && (
                                                <button
                                                  type="button"
                                                  onClick={() => openBomPopup('EDIT_WIP', { wipId: wObj.id })}
                                                  className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary transition"
                                                  title="Edit Master WIP"
                                                >
                                                  <Edit3 className="w-3 h-3" />
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => onDeleteSkuWip(sw.id)}
                                                className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose transition"
                                                title="Putus relasi WIP dari SKU ini"
                                              >
                                                <Unlink className="w-3 h-3" />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Recipe & Material Sub-rows */}
                                          {wipRecipes.length > 0 ? (
                                            <div className="divide-y divide-border-subtle">
                                              {wipRecipes.map(recipe => (
                                                <div key={recipe.id} className="px-3 py-2 space-y-1.5">
                                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                                    <div className="flex items-center gap-2">
                                                      <span className="font-mono font-bold text-ink-amber">
                                                        {recipe.recipeCode}
                                                      </span>
                                                      <span className="font-semibold text-ink-primary">
                                                        {recipe.recipeName}
                                                      </span>
                                                      {recipe.isDefault && (
                                                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-tint-cyan text-brand border border-tint-cyan-border">
                                                          Default
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="flex items-center gap-2 font-mono tabular-nums">
                                                      <span className="text-brand font-bold">
                                                        {recipe.totalWeightKg.toFixed(4)} kg/batch ({recipe.items?.length || 0} bahan)
                                                      </span>
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          openBomPopup('ADD_RECIPE_MATERIAL', {
                                                            wipId: sw.wipId,
                                                            recipeId: recipe.id
                                                          })
                                                        }
                                                        className="text-[10px] font-sans font-semibold text-ink-emerald hover:underline"
                                                      >
                                                        + Bahan
                                                      </button>
                                                      {onUpdateRecipe && (
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            openBomPopup('EDIT_RECIPE', { recipeId: recipe.id })
                                                          }
                                                          className="text-[10px] font-sans font-semibold text-ink-secondary hover:text-ink-primary"
                                                        >
                                                          Edit
                                                        </button>
                                                      )}
                                                    </div>
                                                  </div>

                                                  {recipe.items && recipe.items.length > 0 && (
                                                    <table className="w-full text-left border-collapse text-[11px]">
                                                      <tbody className="divide-y divide-border-subtle">
                                                        {recipe.items.map((it, idx) => {
                                                          const mObj = state.master.materials.find(m => m.id === it.materialId);
                                                          const pct = wObj && wObj.batchWeightKg > 0
                                                            ? (it.amountKg / wObj.batchWeightKg) * 100
                                                            : 0;
                                                          return (
                                                            <tr key={it.id || idx} className="h-[34px] hover:bg-elevated/50">
                                                              <td className="px-2 font-mono tabular-nums text-ink-muted w-8">
                                                                {idx + 1}.
                                                              </td>
                                                              <td className="px-2 font-mono text-brand w-28 truncate">
                                                                {it.materialCode || mObj?.code || '-'}
                                                              </td>
                                                              <td className="px-2 text-ink-primary font-medium">
                                                                {it.materialName || mObj?.name}
                                                              </td>
                                                              <td className="px-2 uppercase font-mono text-[10px] text-ink-secondary w-20">
                                                                {it.materialType || mObj?.type || 'bubuk'}
                                                              </td>
                                                              <td className="px-2 text-right font-mono tabular-nums text-ink-amber w-24">
                                                                {it.amount} {it.unit}
                                                              </td>
                                                              <td className="px-2 text-right font-mono tabular-nums text-brand font-semibold w-28">
                                                                {it.amountKg.toFixed(4)} kg
                                                              </td>
                                                              <td className="px-2 text-right font-mono tabular-nums text-ink-secondary w-16">
                                                                {pct.toFixed(1)}%
                                                              </td>
                                                            </tr>
                                                          );
                                                        })}
                                                      </tbody>
                                                    </table>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          ) : legacyWipMats.length > 0 ? (
                                            <div className="px-3 py-2">
                                              <table className="w-full text-left border-collapse text-[11px]">
                                                <tbody className="divide-y divide-border-subtle">
                                                  {legacyWipMats.map((wm, idx) => {
                                                    const mObj = state.master.materials.find(m => m.id === wm.materialId);
                                                    return (
                                                      <tr key={wm.id || idx} className="h-[34px]">
                                                        <td className="px-2 font-mono text-brand">{mObj?.code || '-'}</td>
                                                        <td className="px-2 text-ink-primary">{mObj?.name || 'Material'}</td>
                                                        <td className="px-2 text-right font-mono tabular-nums text-brand">
                                                          {wm.materialKgPerBatch.toFixed(4)} kg/batch
                                                        </td>
                                                        <td className="px-2 text-right w-12">
                                                          <button
                                                            type="button"
                                                            onClick={() => onDeleteWipMat(wm.id)}
                                                            className="text-ink-rose hover:underline text-[10px]"
                                                          >
                                                            Hapus
                                                          </button>
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          ) : (
                                            <div className="px-3 py-2 text-[11px] text-ink-muted italic">
                                              Belum ada resep formulasi untuk WIP ini. Klik "+ Resep" di kanan atas baris WIP.
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: RESEP FORMULASI WIP (MASTER-DETAIL COMPACT TABLES)             */}
      {/* ===================================================================== */}
      {activeTab === 'RECIPES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Compact WIP List Table */}
          <div className="lg:col-span-5 bg-surface border border-border-subtle rounded-2xl overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-border-subtle bg-canvas flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={wipSearch}
                  onChange={(e) => setWipSearch(e.target.value)}
                  placeholder="Cari kode/nama WIP atau resep..."
                  className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => openBomPopup('CREATE_WIP')}
                className="px-2.5 py-1.5 rounded-lg bg-tint-amber border border-tint-amber-border text-ink-amber text-[11px] font-semibold flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3 h-3" />
                <span>WIP Baru</span>
              </button>
            </div>

            <div className="overflow-x-auto max-h-[540px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                  <tr className="h-[38px]">
                    <th className="px-3">Kode &amp; Nama WIP</th>
                    <th className="px-2 text-right">Batch</th>
                    <th className="px-2 text-center">Resep</th>
                    <th className="px-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredWips.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-xs text-ink-muted">
                        Belum ada WIP yang cocok.
                      </td>
                    </tr>
                  ) : (
                    filteredWips.map(w => {
                      const isSel = selectedWipObj?.id === w.id;
                      const recipeCount = (state.master.recipes || []).filter(r => r.wipId === w.id).length;
                      return (
                        <tr
                          key={w.id}
                          onClick={() => setSelectedWipId(w.id)}
                          className={`h-[38px] cursor-pointer transition ${
                            isSel ? 'bg-tint-cyan' : 'hover:bg-elevated/70'
                          }`}
                        >
                          <td className="px-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {w.code && (
                                <span className="font-mono tabular-nums text-[10px] font-bold text-brand shrink-0">
                                  {w.code}
                                </span>
                              )}
                              <span className={`truncate ${isSel ? 'font-bold text-ink-primary' : 'font-medium text-ink-primary'}`}>
                                {w.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 text-right font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                            {w.batchWeightKg.toFixed(1)} kg
                          </td>
                          <td className="px-2 text-center font-mono tabular-nums text-ink-amber font-semibold whitespace-nowrap">
                            {recipeCount}
                          </td>
                          <td className="px-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openBomPopup('CREATE_RECIPE', { wipId: w.id })}
                                className="px-1.5 py-0.5 rounded bg-tint-amber border border-tint-amber-border text-ink-amber text-[10px] font-semibold"
                                title="Buat resep baru untuk WIP ini"
                              >
                                + Resep
                              </button>
                              {onUpdateWip && (
                                <button
                                  type="button"
                                  onClick={() => openBomPopup('EDIT_WIP', { wipId: w.id })}
                                  className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary"
                                  title="Edit WIP"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmation({
                                    type: 'WIP',
                                    id: w.id,
                                    name: w.name,
                                    details: `${w.code || 'WIP'} · ${w.batchWeightKg} kg/batch`
                                  })
                                }
                                className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                                title="Hapus WIP"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Active WIP Recipe Details & Compact Ingredients Table */}
          <div className="lg:col-span-7 bg-surface border border-border-subtle rounded-2xl overflow-hidden">
            {!selectedWipObj ? (
              <div className="p-10 text-center text-xs text-ink-muted">
                Pilih WIP di sebelah kiri atau klik "+ Input / Kelola BOM" untuk menambahkan WIP dan resep.
              </div>
            ) : (
              <div>
                {/* Selected WIP Header */}
                <div className="px-4 py-3 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {selectedWipObj.code && (
                        <span className="font-mono text-xs font-bold text-ink-amber">
                          {selectedWipObj.code}
                        </span>
                      )}
                      <h3 className="font-bold text-sm text-ink-primary">{selectedWipObj.name}</h3>
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-ink-secondary mt-0.5">
                      Standar Batch: {selectedWipObj.batchWeightKg.toFixed(4)} kg · Durasi: {selectedWipObj.productionDurationMinutes || 30} mnt
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openBomPopup('CREATE_RECIPE', { wipId: selectedWipObj.id })}
                      className="px-2.5 py-1.5 rounded-lg bg-tint-amber border border-tint-amber-border text-ink-amber text-[11px] font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Buat Resep</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openBomPopup('ADD_RECIPE_MATERIAL', {
                          wipId: selectedWipObj.id,
                          recipeId: activeRecipeObj?.id
                        })
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Tambah Material</span>
                    </button>
                  </div>
                </div>

                {/* Recipe Selector Bar */}
                {selectedWipRecipes.length > 0 && (
                  <div className="px-4 py-2.5 border-b border-border-subtle flex flex-wrap items-center justify-between gap-2 bg-surface">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {selectedWipRecipes.map(r => {
                        const isActive = activeRecipeObj?.id === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelectedRecipeId(r.id)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition flex items-center gap-1.5 ${
                              isActive
                                ? 'bg-tint-cyan border-tint-cyan-border text-brand'
                                : 'bg-canvas border-border-subtle text-ink-secondary hover:text-ink-primary'
                            }`}
                          >
                            <span className="font-mono font-bold">{r.recipeCode}</span>
                            <span>{r.recipeName}</span>
                            {r.isDefault && (
                              <span className="text-[9px] uppercase font-mono text-ink-emerald">Default</span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {activeRecipeObj && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onUpdateRecipe && (
                          <button
                            type="button"
                            onClick={() => openBomPopup('EDIT_RECIPE', { recipeId: activeRecipeObj.id })}
                            className="px-2 py-1 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold"
                          >
                            Edit Resep
                          </button>
                        )}
                        {onDeleteRecipe && (
                          <button
                            type="button"
                            onClick={() => setDeleteRecipeTarget(activeRecipeObj)}
                            className="px-2 py-1 rounded-lg bg-tint-rose border border-tint-rose-border text-ink-rose text-[11px] font-semibold"
                          >
                            Hapus Resep
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Ingredients Compact Table */}
                {activeRecipeObj ? (
                  <div>
                    <div className="px-4 py-2 bg-canvas border-b border-border-subtle flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="text-ink-secondary">
                        {activeRecipeObj.description || 'Komposisi takaran material per 1 batch formulasi'}
                      </span>
                      <span className="font-mono tabular-nums font-bold text-brand">
                        Total Formula: {activeRecipeObj.totalWeightKg.toFixed(4)} kg / {selectedWipObj.batchWeightKg.toFixed(2)} kg batch
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                            <th className="px-3 w-10">No</th>
                            <th className="px-2.5">Kode</th>
                            <th className="px-2.5">Nama Material</th>
                            <th className="px-2.5">Tipe</th>
                            <th className="px-2.5 text-right">Takaran</th>
                            <th className="px-2.5 text-right">Konversi (kg)</th>
                            <th className="px-2.5 text-right">%</th>
                            <th className="px-3 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {activeRecipeObj.items && activeRecipeObj.items.length > 0 ? (
                            activeRecipeObj.items.map((item, idx) => {
                              const mObj = state.master.materials.find(m => m.id === item.materialId);
                              const pct = selectedWipObj.batchWeightKg > 0
                                ? (item.amountKg / selectedWipObj.batchWeightKg) * 100
                                : 0;
                              return (
                                <tr key={item.id || idx} className="h-[38px] hover:bg-elevated/60">
                                  <td className="px-3 font-mono tabular-nums text-ink-muted">{idx + 1}</td>
                                  <td className="px-2.5 font-mono text-[11px] text-brand whitespace-nowrap">
                                    {item.materialCode || mObj?.code || '-'}
                                  </td>
                                  <td className="px-2.5 font-medium text-ink-primary">
                                    {item.materialName || mObj?.name}
                                  </td>
                                  <td className="px-2.5 uppercase font-mono text-[10px] text-ink-secondary">
                                    {item.materialType || mObj?.type || 'bubuk'}
                                  </td>
                                  <td className="px-2.5 text-right font-mono tabular-nums text-ink-amber font-semibold whitespace-nowrap">
                                    {item.amount} {item.unit}
                                  </td>
                                  <td className="px-2.5 text-right font-mono tabular-nums text-brand font-bold whitespace-nowrap">
                                    {item.amountKg.toFixed(4)}
                                  </td>
                                  <td className="px-2.5 text-right font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                                    {pct.toFixed(1)}%
                                  </td>
                                  <td className="px-3 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1">
                                      {onUpdateRecipeItem && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingRecipeItem({ recipeId: activeRecipeObj.id, item });
                                            setEditItemAmount(String(item.amount));
                                            setEditItemUnit(item.unit);
                                          }}
                                          className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary"
                                          title="Edit takaran"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                        </button>
                                      )}
                                      {onDeleteMaterialFromRecipe && (
                                        <button
                                          type="button"
                                          onClick={() => onDeleteMaterialFromRecipe(activeRecipeObj.id, item.id)}
                                          className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                                          title="Hapus material dari resep"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={8} className="py-8 text-center text-xs text-ink-muted">
                                Resep ini belum memiliki komponen material. Klik "+ Tambah Material" di atas.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : activeWipLegacyMats.length > 0 ? (
                  <div className="p-4 space-y-2">
                    <span className="text-[11px] font-semibold text-ink-secondary block">
                      Relasi Material Legacy (Non-Resep)
                    </span>
                    <table className="w-full text-left border-collapse text-xs">
                      <tbody className="divide-y divide-border-subtle">
                        {activeWipLegacyMats.map(wm => {
                          const mObj = state.master.materials.find(m => m.id === wm.materialId);
                          return (
                            <tr key={wm.id} className="h-[38px]">
                              <td className="px-2 font-mono text-brand">{mObj?.code || '-'}</td>
                              <td className="px-2 text-ink-primary">{mObj?.name || 'Material'}</td>
                              <td className="px-2 text-right font-mono tabular-nums text-brand">
                                {wm.materialKgPerBatch.toFixed(4)} kg/batch
                              </td>
                              <td className="px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => onDeleteWipMat(wm.id)}
                                  className="text-ink-rose text-[11px] hover:underline"
                                >
                                  Hapus
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center space-y-3">
                    <p className="text-xs text-ink-muted">
                      Belum ada resep formulasi untuk WIP <strong>{selectedWipObj.name}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => openBomPopup('CREATE_RECIPE', { wipId: selectedWipObj.id })}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold"
                    >
                      + Buat Resep Formulasi Pertama
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: DATABASE MATERIAL (FULL-WIDTH 38PX COMPACT TABLE)              */}
      {/* ===================================================================== */}
      {activeTab === 'MATERIALS' && (
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  placeholder="Cari kode SAP, nama material, kemasan..."
                  className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-7 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
                />
                {matSearch && (
                  <button
                    type="button"
                    onClick={() => setMatSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={matTypeFilter}
                onChange={(e) => setMatTypeFilter(e.target.value as any)}
                className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
              >
                <option value="ALL">Semua Tipe</option>
                <option value="bubuk">Bubuk</option>
                <option value="liquid">Liquid</option>
                <option value="padat">Padat</option>
              </select>

              <select
                value={matSourceFilter}
                onChange={(e) => setMatSourceFilter(e.target.value as any)}
                className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
              >
                <option value="ALL">Semua Sumber</option>
                <option value="GDRM">GDRM</option>
                <option value="Formulasi">Formulasi</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono tabular-nums text-[11px] text-ink-secondary">
                {filteredMaterials.length}/{state.master.materials.length} Material
              </span>
              {onOpenStockAdjustment && (
                <button
                  type="button"
                  onClick={() => onOpenStockAdjustment()}
                  className="px-2.5 py-1.5 rounded-lg bg-tint-amber border border-tint-amber-border text-ink-amber text-[11px] font-semibold flex items-center gap-1"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>Adjust Saldo</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleOpenImportModalByKey('MATERIAL')}
                className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1"
              >
                <UploadCloud className="w-3.5 h-3.5 text-brand" />
                <span>Import</span>
              </button>
              <button
                type="button"
                onClick={() => openBomPopup('CREATE_MATERIAL')}
                className="px-2.5 py-1.5 rounded-lg bg-tint-cyan border border-tint-cyan-border text-brand text-[11px] font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Material Baru</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                <tr className="h-[38px]">
                  <th className="px-3">Kode</th>
                  <th className="px-2.5">Nama Material</th>
                  <th className="px-2.5">Tipe</th>
                  <th className="px-2.5">Sumber</th>
                  <th className="px-2.5">Kemasan</th>
                  <th className="px-2.5 text-right">Bobot/Kms</th>
                  <th className="px-2.5 text-right">Saldo Awal Total</th>
                  <th className="px-2.5 text-right">Min Alert</th>
                  <th className="px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-xs text-ink-muted">
                      Tidak ada material yang cocok dengan pencarian atau filter.
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map(m => {
                    const initTotal =
                      (m.initialStockCk || 0) +
                      (m.initialStockWineroto || 0) +
                      (m.initialStockTank || 0);
                    return (
                      <tr key={m.id} className="h-[38px] hover:bg-elevated/60 transition">
                        <td className="px-3 font-mono text-[11px] font-bold text-brand whitespace-nowrap">
                          {m.code || '-'}
                        </td>
                        <td className="px-2.5 font-semibold text-ink-primary">{m.name}</td>
                        <td className="px-2.5 uppercase font-mono text-[10px] text-ink-secondary whitespace-nowrap">
                          {m.type}
                        </td>
                        <td className="px-2.5 text-[11px] text-ink-secondary whitespace-nowrap">
                          {m.source}
                        </td>
                        <td className="px-2.5 text-ink-secondary whitespace-nowrap">{m.packaging}</td>
                        <td className="px-2.5 text-right font-mono tabular-nums text-ink-primary whitespace-nowrap">
                          {m.weightKg.toFixed(4)} kg
                        </td>
                        <td className="px-2.5 text-right font-mono tabular-nums text-ink-amber whitespace-nowrap">
                          {initTotal.toFixed(2)} kg
                        </td>
                        <td className="px-2.5 text-right font-mono tabular-nums text-ink-secondary whitespace-nowrap">
                          {m.minStockAlert !== undefined ? `${m.minStockAlert.toFixed(0)} kg` : '-'}
                        </td>
                        <td className="px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {onOpenStockAdjustment && (
                              <button
                                type="button"
                                onClick={() => onOpenStockAdjustment(m.id)}
                                className="p-1 rounded bg-elevated hover:bg-tint-amber border border-border-subtle text-ink-secondary hover:text-ink-amber"
                                title="Adjust Saldo Awal Material"
                              >
                                <Scale className="w-3 h-3" />
                              </button>
                            )}
                            {onUpdateMaterial && (
                              <button
                                type="button"
                                onClick={() => openBomPopup('EDIT_MATERIAL', { materialId: m.id })}
                                className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary"
                                title="Edit Material"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirmation({
                                  type: 'MATERIAL',
                                  id: m.id,
                                  name: m.name,
                                  details: `${m.code ? `[${m.code}] ` : ''}${m.type.toUpperCase()} · ${m.packaging}`
                                })
                              }
                              className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                              title="Hapus Material"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: MESIN & TANGKI (COMPACT 38PX TABLES)                           */}
      {/* ===================================================================== */}
      {activeTab === 'EQUIPMENT' && (
        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-border-strong bg-elevated p-0.5">
                <button
                  type="button"
                  onClick={() => setEquipmentSubTab('MACHINES')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    equipmentSubTab === 'MACHINES'
                      ? 'bg-cyan-600 text-white'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Mesin Produksi ({state.master.machines.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEquipmentSubTab('TANKS')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
                    equipmentSubTab === 'TANKS'
                      ? 'bg-cyan-600 text-white'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  <Cylinder className="w-3.5 h-3.5" />
                  <span>Tangki WIP ({state.master.tanks.length})</span>
                </button>
              </div>

              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={equipmentSearch}
                  onChange={(e) => setEquipmentSearch(e.target.value)}
                  placeholder={equipmentSubTab === 'MACHINES' ? 'Cari mesin / line...' : 'Cari tangki / WIP...'}
                  className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary placeholder:text-ink-muted"
                />
              </div>

              {equipmentSubTab === 'MACHINES' && (
                <select
                  value={machineStatusFilter}
                  onChange={(e) => setMachineStatusFilter(e.target.value as any)}
                  className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="OPERATIONAL">Operational</option>
                  <option value="CHANGEOVER">Changeover</option>
                  <option value="STANDBY">Standby / Maint</option>
                </select>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {equipmentSubTab === 'MACHINES' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setHistorySelectedMachineId(null);
                      setIsChangeoverHistoryOpen(true);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1"
                  >
                    <History className="w-3.5 h-3.5 text-brand" />
                    <span>Audit Changeover</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenImportModalByKey('MACHINE')}
                    className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-brand" />
                    <span>Import</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openBomPopup('CREATE_MACHINE')}
                    className="px-2.5 py-1.5 rounded-lg bg-tint-cyan border border-tint-cyan-border text-brand text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Mesin Baru</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleOpenImportModalByKey('TANK')}
                    className="px-2.5 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-ink-secondary hover:text-ink-primary text-[11px] font-semibold flex items-center gap-1"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-brand" />
                    <span>Import</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openBomPopup('CREATE_TANK')}
                    className="px-2.5 py-1.5 rounded-lg bg-tint-cyan border border-tint-cyan-border text-brand text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tangki Baru</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {equipmentSubTab === 'MACHINES' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                    <th className="px-3">Kode</th>
                    <th className="px-2.5">Nama Mesin</th>
                    <th className="px-2.5">Line Produksi</th>
                    <th className="px-2.5 text-right">Kapasitas</th>
                    <th className="px-2.5">WIP Aktif</th>
                    <th className="px-2.5 text-center">Status</th>
                    <th className="px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredMachines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-ink-muted">
                        Tidak ada mesin yang cocok.
                      </td>
                    </tr>
                  ) : (
                    filteredMachines.map(mach => {
                      const activeWip = state.master.wips.find(w => w.id === mach.currentWipId);
                      const isCO = mach.status === 'CHANGEOVER';
                      return (
                        <tr key={mach.id} className="h-[38px] hover:bg-elevated/60 transition">
                          <td className="px-3 font-mono font-bold text-brand whitespace-nowrap">{mach.code}</td>
                          <td className="px-2.5 font-semibold text-ink-primary">{mach.name}</td>
                          <td className="px-2.5 text-ink-secondary">{mach.line}</td>
                          <td className="px-2.5 text-right font-mono tabular-nums text-ink-primary whitespace-nowrap">
                            {mach.capacityKgPerHour} kg/j
                          </td>
                          <td className="px-2.5 text-ink-primary truncate max-w-[180px]">
                            {activeWip ? activeWip.name : mach.currentWipName || '-'}
                          </td>
                          <td className="px-2.5 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              isCO
                                ? 'bg-tint-amber text-ink-amber border-tint-amber-border'
                                : mach.status === 'OPERATIONAL'
                                  ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                                  : mach.status === 'MAINTENANCE'
                                    ? 'bg-tint-rose text-ink-rose border-tint-rose-border'
                                    : 'bg-elevated text-ink-secondary border-border-strong'
                            }`}>
                              {mach.status}
                            </span>
                          </td>
                          <td className="px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setChangeoverModalMachine(mach)}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition flex items-center gap-1 ${
                                  isCO
                                    ? 'bg-tint-amber border-tint-amber-border text-ink-amber'
                                    : 'bg-tint-cyan border-tint-cyan-border text-brand'
                                }`}
                              >
                                <RotateCw className={`w-3 h-3 ${isCO ? 'animate-spin' : ''}`} />
                                <span>{isCO ? 'Lanjut CO' : 'Changeover'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setHistorySelectedMachineId(mach.id);
                                  setIsChangeoverHistoryOpen(true);
                                }}
                                className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary"
                                title="Riwayat Changeover"
                              >
                                <History className="w-3 h-3" />
                              </button>
                              {onDeleteMachine && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirmation({
                                      type: 'MACHINE',
                                      id: mach.id,
                                      name: mach.name,
                                      details: `${mach.code} · ${mach.line}`
                                    })
                                  }
                                  className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                                  title="Hapus Mesin"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                    <th className="px-3">Kode</th>
                    <th className="px-2.5">Nama Tangki</th>
                    <th className="px-2.5 text-center">Tipe</th>
                    <th className="px-2.5 text-right">Level / Kapasitas</th>
                    <th className="px-2.5">1-WIP Terhubung</th>
                    <th className="px-2.5">Mesin &amp; Lini</th>
                    <th className="px-2.5 text-right">Suhu / Agitator</th>
                    <th className="px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredTanks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-ink-muted">
                        Tidak ada tangki WIP yang cocok.
                      </td>
                    </tr>
                  ) : (
                    filteredTanks.map(tank => {
                      const wip = state.master.wips.find(w => w.id === tank.assignedWipId);
                      const mIds = tank.sourceMachineIds?.length
                        ? tank.sourceMachineIds
                        : tank.assignedMachineIds?.length
                          ? tank.assignedMachineIds
                          : tank.assignedMachineId ? [tank.assignedMachineId] : [];
                      const lIds = tank.assignedLineIds || [];
                      const pct = tank.capacityKg > 0 ? (tank.currentLevelKg / tank.capacityKg) * 100 : 0;

                      return (
                        <tr key={tank.id} className="h-[38px] hover:bg-elevated/60 transition">
                          <td className="px-3 font-mono font-bold text-brand whitespace-nowrap">{tank.code}</td>
                          <td className="px-2.5 font-semibold text-ink-primary">{tank.name}</td>
                          <td className="px-2.5 text-center whitespace-nowrap">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              tank.type === 'STORAGE_TANK'
                                ? 'bg-tint-indigo text-ink-indigo border-tint-indigo-border'
                                : 'bg-tint-amber text-ink-amber border-tint-amber-border'
                            }`}>
                              {tank.type === 'STORAGE_TANK' ? 'ST' : 'HT'}
                            </span>
                          </td>
                          <td className="px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="text-ink-primary font-semibold">{tank.currentLevelKg.toFixed(1)}</span>
                            <span className="text-ink-muted"> / {tank.capacityKg.toFixed(0)} kg ({pct.toFixed(0)}%)</span>
                          </td>
                          <td className="px-2.5 text-ink-primary truncate max-w-[170px]">
                            {wip ? wip.name : <span className="text-ink-muted italic">Kosong</span>}
                          </td>
                          <td className="px-2.5 font-mono tabular-nums text-[11px] text-ink-secondary whitespace-nowrap">
                            {mIds.length} Mesin · {lIds.length} Line
                          </td>
                          <td className="px-2.5 text-right font-mono tabular-nums text-[11px] text-ink-secondary whitespace-nowrap">
                            {tank.temp !== undefined ? tank.temp : 45.0}°C · {tank.agitatorStatus || 'ON'}
                          </td>
                          <td className="px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {onUpdateTank && (
                                <button
                                  type="button"
                                  onClick={() => openBomPopup('EDIT_TANK', { tankId: tank.id })}
                                  className="p-1 rounded bg-elevated hover:bg-accent border border-border-subtle text-ink-secondary hover:text-ink-primary"
                                  title="Edit Tangki"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                              {onDeleteTank && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteConfirmation({
                                      type: 'TANK',
                                      id: tank.id,
                                      name: tank.name,
                                      details: `${tank.code} · ${tank.capacityKg} kg`
                                    })
                                  }
                                  className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                                  title="Hapus Tangki"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: AKSES USER & PIN KEAMANAN                                      */}
      {/* ===================================================================== */}
      {activeTab === 'USERS' && (
        <div className="space-y-4">
          <div className="bg-surface border border-border-subtle p-2 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveUserTab('OPERATORS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeUserTab === 'OPERATORS' ? 'bg-cyan-600 text-white' : 'text-ink-secondary hover:bg-elevated'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Operator ({state.registeredOperators?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveUserTab('MANAGEMENT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeUserTab === 'MANAGEMENT' ? 'bg-indigo-600 text-white' : 'text-ink-secondary hover:bg-elevated'
                }`}
              >
                <Building className="w-3.5 h-3.5" />
                <span>Management ({state.registeredManagement?.length || 0})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveUserTab('SECURITY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeUserTab === 'SECURITY' ? 'bg-amber-500 text-slate-950' : 'text-ink-secondary hover:bg-elevated'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Keamanan PIN</span>
              </button>
            </div>

            {onOpenUserManagement && (
              <button
                type="button"
                onClick={onOpenUserManagement}
                className="px-3 py-1.5 rounded-lg bg-elevated hover:bg-accent border border-border-strong text-xs font-semibold text-ink-secondary hover:text-ink-primary flex items-center gap-1.5"
              >
                <Users className="w-3.5 h-3.5 text-ink-amber" />
                <span>Mode Dialog Cepat</span>
              </button>
            )}
          </div>

          {activeUserTab === 'OPERATORS' && (
            <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={opSearch}
                      onChange={(e) => setOpSearch(e.target.value)}
                      placeholder="Cari nama / NIK..."
                      className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary"
                    />
                  </div>
                  <select
                    value={opShiftFilter}
                    onChange={(e) => setOpShiftFilter(e.target.value as any)}
                    className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                  >
                    <option value="ALL">Semua Shift</option>
                    <option value="1">Shift 1</option>
                    <option value="2">Shift 2</option>
                    <option value="3">Shift 3</option>
                  </select>
                  <select
                    value={opStatusFilter}
                    onChange={(e) => setOpStatusFilter(e.target.value as any)}
                    className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Aktif</option>
                    <option value="INACTIVE">Nonaktif</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOperatorFormOpen(prev => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-tint-cyan border border-tint-cyan-border text-brand text-xs font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isOperatorFormOpen ? 'Tutup Form' : '+ Tambah Operator'}</span>
                </button>
              </div>

              {isOperatorFormOpen && (
                <form onSubmit={handleOperatorSubmit} className="p-4 border-b border-border-subtle bg-canvas space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-ink-secondary font-semibold mb-1">Nama Lengkap *</label>
                      <input
                        type="text"
                        required
                        value={opName}
                        onChange={(e) => setOpName(e.target.value)}
                        placeholder="Supriyadi Pratama"
                        className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-ink-secondary font-semibold">NIK *</label>
                        <button type="button" onClick={generateAutoNik} className="text-[10px] text-brand underline">
                          Auto NIK
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={opNik}
                        onChange={(e) => setOpNik(e.target.value)}
                        placeholder="OPR-2026-009"
                        className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-ink-secondary font-semibold mb-1">Shift *</label>
                      <select
                        value={opShift}
                        onChange={(e) => setOpShift(Number(e.target.value) as 1 | 2 | 3)}
                        className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                      >
                        <option value={1}>Shift 1 (07:01 - 15:00)</option>
                        <option value={2}>Shift 2 (15:01 - 23:00)</option>
                        <option value={3}>Shift 3 (23:01 - 07:00)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-ink-secondary font-semibold mb-1">Line / Area</label>
                      <select
                        value={opLine}
                        onChange={(e) => setOpLine(e.target.value)}
                        className="w-full bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                      >
                        <option value="Line 1 (Biskuit Domestik)">Line 1 (Biskuit Domestik)</option>
                        <option value="Line 2 (Wafer Ekspor KITE)">Line 2 (Wafer Ekspor KITE)</option>
                        <option value="Line 3 (Crackers & Cookie)">Line 3 (Crackers &amp; Cookie)</option>
                        <option value="Gudang Bahan Baku (CK & WINEROTO)">Gudang Bahan Baku</option>
                        <option value="Mixing & Pengisian Holding Tank">Mixing &amp; Holding Tank</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opNotes}
                      onChange={(e) => setOpNotes(e.target.value)}
                      placeholder="Catatan kualifikasi / sertifikasi (opsional)..."
                      className="flex-1 bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                    />
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-cyan-600 text-white font-bold">
                      Simpan Operator
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                      <th className="px-3">NIK</th>
                      <th className="px-2.5">Nama Operator</th>
                      <th className="px-2.5">Penugasan Line</th>
                      <th className="px-2.5 text-center">Shift</th>
                      <th className="px-2.5 text-center">Status</th>
                      <th className="px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {(state.registeredOperators || [])
                      .filter(op => {
                        const q = opSearch.toLowerCase();
                        const matchQ = op.name.toLowerCase().includes(q) || op.nik.toLowerCase().includes(q);
                        const matchS = opShiftFilter === 'ALL' || String(op.assignedShift) === opShiftFilter;
                        const matchSt = opStatusFilter === 'ALL' || op.status === opStatusFilter;
                        return matchQ && matchS && matchSt;
                      })
                      .map(op => (
                        <tr key={op.id} className="h-[38px] hover:bg-elevated/60">
                          <td className="px-3 font-mono font-bold text-brand whitespace-nowrap">{op.nik}</td>
                          <td className="px-2.5 font-semibold text-ink-primary">{op.name}</td>
                          <td className="px-2.5 text-ink-secondary">{op.assignedLine}</td>
                          <td className="px-2.5 text-center font-mono text-[11px]">S{op.assignedShift}</td>
                          <td className="px-2.5 text-center">
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                              op.status === 'ACTIVE'
                                ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                                : 'bg-elevated text-ink-secondary border-border-strong'
                            }`}>
                              {op.status === 'ACTIVE' ? 'AKTIF' : 'NONAKTIF'}
                            </span>
                          </td>
                          <td className="px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {onUpdateOperator && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateOperator(op.id, {
                                      status: op.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                                    })
                                  }
                                  className="px-2 py-0.5 rounded bg-elevated border border-border-strong text-[10px] font-semibold text-ink-secondary hover:text-ink-primary"
                                >
                                  {op.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmation({
                                    type: 'OPERATOR',
                                    id: op.id,
                                    name: op.name,
                                    details: `NIK: ${op.nik} · ${op.assignedLine}`
                                  })
                                }
                                className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeUserTab === 'MANAGEMENT' && (
            <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border-subtle bg-canvas flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative w-56">
                    <Search className="w-3.5 h-3.5 text-ink-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mgtSearch}
                      onChange={(e) => setMgtSearch(e.target.value)}
                      placeholder="Cari nama, email, jabatan..."
                      className="w-full bg-elevated border border-border-strong rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink-primary"
                    />
                  </div>
                  <select
                    value={mgtAccessFilter}
                    onChange={(e) => setMgtAccessFilter(e.target.value as any)}
                    className="bg-elevated border border-border-strong rounded-lg px-2.5 py-1.5 text-xs text-ink-primary"
                  >
                    <option value="ALL">Semua Izin</option>
                    <option value="ACTIVE">Izin Aktif</option>
                    <option value="REVOKED">Dicabut</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setIsManagementFormOpen(prev => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-tint-indigo border border-tint-indigo-border text-ink-indigo text-xs font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{isManagementFormOpen ? 'Tutup Form' : '+ Tambah Management'}</span>
                </button>
              </div>

              {isManagementFormOpen && (
                <form onSubmit={handleManagementSubmit} className="p-4 border-b border-border-subtle bg-canvas space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input
                      type="text"
                      required
                      value={mgtName}
                      onChange={(e) => setMgtName(e.target.value)}
                      placeholder="Nama Lengkap *"
                      className="bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                    />
                    <input
                      type="email"
                      required
                      value={mgtEmail}
                      onChange={(e) => setMgtEmail(e.target.value)}
                      placeholder="Email Perusahaan *"
                      className="bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary font-mono"
                    />
                    <input
                      type="text"
                      required
                      value={mgtTitle}
                      onChange={(e) => setMgtTitle(e.target.value)}
                      placeholder="Jabatan *"
                      className="bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                    />
                    <select
                      value={mgtDepartment}
                      onChange={(e) => setMgtDepartment(e.target.value)}
                      className="bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-ink-primary"
                    >
                      <option value="Plant Operations Management">Plant Operations</option>
                      <option value="Quality Assurance & QC">QA &amp; QC</option>
                      <option value="Supply Chain Management">Supply Chain</option>
                      <option value="PPIC & Produksi">PPIC &amp; Produksi</option>
                      <option value="Engineering & Maintenance">Maintenance</option>
                      <option value="Direksi & Komisaris">Direksi</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 text-ink-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mgtAccess}
                        onChange={(e) => setMgtAccess(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-indigo-600"
                      />
                      <span>Berikan izin Read-Only Dashboard langsung</span>
                    </label>
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-bold">
                      Simpan Akun
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="h-[38px] bg-elevated text-[11px] font-semibold text-ink-secondary border-b border-border-subtle">
                      <th className="px-3">Nama &amp; Email</th>
                      <th className="px-2.5">Jabatan &amp; Divisi</th>
                      <th className="px-2.5 text-center">Izin Akses</th>
                      <th className="px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {(state.registeredManagement || [])
                      .filter(m => {
                        const q = mgtSearch.toLowerCase();
                        const matchQ = m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.title.toLowerCase().includes(q);
                        const matchA = mgtAccessFilter === 'ALL' || (mgtAccessFilter === 'ACTIVE' ? m.hasViewAccess : !m.hasViewAccess);
                        return matchQ && matchA;
                      })
                      .map(mgt => (
                        <tr key={mgt.id} className="h-[38px] hover:bg-elevated/60">
                          <td className="px-3">
                            <span className="font-semibold text-ink-primary">{mgt.name}</span>
                            <span className="text-[11px] font-mono text-ink-secondary ml-2">{mgt.email}</span>
                          </td>
                          <td className="px-2.5 text-ink-secondary">
                            {mgt.title} · {mgt.department}
                          </td>
                          <td className="px-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => onToggleManagementAccess && onToggleManagementAccess(mgt.id, !mgt.hasViewAccess)}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${
                                mgt.hasViewAccess
                                  ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                                  : 'bg-tint-rose text-ink-rose border-tint-rose-border'
                              }`}
                            >
                              {mgt.hasViewAccess ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              <span>{mgt.hasViewAccess ? 'Aktif' : 'Dicabut'}</span>
                            </button>
                          </td>
                          <td className="px-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirmation({
                                  type: 'MANAGEMENT',
                                  id: mgt.id,
                                  name: mgt.name,
                                  details: `${mgt.title} · ${mgt.email}`
                                })
                              }
                              className="p-1 rounded bg-elevated hover:bg-tint-rose border border-border-subtle text-ink-secondary hover:text-ink-rose"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeUserTab === 'SECURITY' && (
            <div className="max-w-lg bg-surface border border-border-subtle rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-tint-amber text-ink-amber border border-tint-amber-border">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-ink-primary">Ganti PIN Akses Administrator</h4>
                  <p className="text-[11px] text-ink-secondary">Di-hash dengan PBKDF2-SHA256</p>
                </div>
              </div>
              <form onSubmit={handleChangePinSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="block text-ink-secondary font-semibold mb-1">PIN / Password Baru (Min. 8 Karakter)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={newAdminPin}
                    onChange={(e) => setNewAdminPin(e.target.value)}
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink-secondary font-semibold mb-1">Konfirmasi PIN Baru</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmAdminPin}
                    onChange={(e) => setConfirmAdminPin(e.target.value)}
                    className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2 text-ink-primary font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                >
                  Simpan PIN Baru
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* UNIFIED QUICK-ACTION LAUNCHER & DYNAMIC FORM POPUP MODAL              */}
      {/* ===================================================================== */}
      <BomActionPopupModal
        open={bomPopupOpen}
        onOpenChange={setBomPopupOpen}
        state={state}
        initialAction={bomPopupAction}
        initialContext={bomPopupContext}
        onAddMaterial={onAddMaterial}
        onUpdateMaterial={onUpdateMaterial}
        onAddWip={onAddWip}
        onUpdateWip={onUpdateWip}
        onAddSku={onAddSku}
        onUpdateSku={onUpdateSku}
        onAddSkuWip={onAddSkuWip}
        onAddRecipe={onAddRecipe}
        onUpdateRecipe={onUpdateRecipe}
        onAddMaterialToRecipe={onAddMaterialToRecipe}
        onAddMultipleMaterialsToRecipe={onAddMultipleMaterialsToRecipe}
        onAddMachine={onAddMachine}
        onAddTank={onAddTank}
        onUpdateTank={onUpdateTank}
        onOpenImportModal={handleOpenImportModalByKey}
        showToast={showToast}
      />

      {/* Edit Takaran Material Modal */}
      <Dialog.Root open={!!editingRecipeItem} onOpenChange={(open) => !open && setEditingRecipeItem(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-md bg-surface border border-border-strong rounded-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div>
                <Dialog.Title className="font-bold text-ink-primary text-sm">Edit Takaran Material</Dialog.Title>
                <Dialog.Description className="text-[11px] text-ink-secondary">
                  {editingRecipeItem?.item.materialName}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="p-1.5 rounded-lg bg-elevated text-ink-secondary hover:text-ink-primary">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
            <form onSubmit={handleSaveEditRecipeItem} className="space-y-3 text-xs">
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={editItemAmount}
                  onChange={(e) => setEditItemAmount(e.target.value)}
                  required
                  className="flex-1 bg-elevated border border-border-strong rounded-xl px-3 py-2 text-brand font-mono font-bold tabular-nums"
                />
                <div className="flex rounded-xl overflow-hidden border border-border-strong bg-elevated p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditItemUnit('kg')}
                    className={`px-3 py-1 font-bold rounded-lg ${editItemUnit === 'kg' ? 'bg-cyan-600 text-white' : 'text-ink-secondary'}`}
                  >
                    kg
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItemUnit('gr')}
                    className={`px-3 py-1 font-bold rounded-lg ${editItemUnit === 'gr' ? 'bg-amber-600 text-white' : 'text-ink-secondary'}`}
                  >
                    gr
                  </button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
                <button
                  type="button"
                  onClick={() => setEditingRecipeItem(null)}
                  className="px-4 py-2 rounded-xl bg-elevated text-ink-secondary font-semibold"
                >
                  Batal
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-cyan-600 text-white font-bold">
                  Simpan Takaran
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Recipe Confirmation Modal */}
      <Dialog.Root open={!!deleteRecipeTarget} onOpenChange={(open) => !open && setDeleteRecipeTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-md bg-surface border border-tint-rose-border rounded-2xl p-5 space-y-4 shadow-2xl">
            <Dialog.Title className="font-bold text-ink-primary text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-ink-rose" />
              <span>Hapus Resep Formulasi?</span>
            </Dialog.Title>
            <Dialog.Description className="text-xs text-ink-secondary">
              Resep <strong>{deleteRecipeTarget?.recipeCode} — {deleteRecipeTarget?.recipeName}</strong> beserta seluruh komposisi bahannya akan dihapus permanen.
            </Dialog.Description>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setDeleteRecipeTarget(null)}
                className="px-4 py-2 rounded-xl bg-elevated text-ink-secondary text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRecipe}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Ya, Hapus Resep
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Entity / User Confirmation Modal */}
      <Dialog.Root open={!!deleteConfirmation} onOpenChange={(open) => !open && setDeleteConfirmation(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[94vw] max-w-md bg-surface border border-tint-rose-border rounded-2xl p-5 space-y-4 shadow-2xl">
            <Dialog.Title className="font-bold text-ink-primary text-sm flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-ink-rose" />
              <span>Konfirmasi Penghapusan Data</span>
            </Dialog.Title>
            <Dialog.Description className="text-xs text-ink-secondary">
              Hapus permanen <strong>{deleteConfirmation?.name}</strong> ({deleteConfirmation?.details})?
            </Dialog.Description>
            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 rounded-xl bg-elevated text-ink-secondary text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEntity}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Hapus Permanen
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Existing Batch Import & Changeover Modals */}
      <MaterialImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingMaterials={state.master.materials}
        onImportMaterials={(newMats, mode) => onImportMaterials && onImportMaterials(newMats, mode)}
        showToast={showToast}
      />

      <MachineImportModal
        isOpen={isMachineImportOpen}
        onClose={() => setIsMachineImportOpen(false)}
        existingMachines={state.master.machines}
        onImportMachines={(newMachines, mode) => onImportMachines && onImportMachines(newMachines, mode)}
        showToast={showToast}
      />

      <TankImportModal
        isOpen={isTankImportOpen}
        onClose={() => setIsTankImportOpen(false)}
        existingTanks={state.master.tanks}
        availableWips={state.master.wips}
        availableMachines={state.master.machines}
        onImportTanks={(newTanks, mode) => onImportTanks && onImportTanks(newTanks, mode)}
        showToast={showToast}
      />

      <RecipeImportModal
        isOpen={isRecipeImportOpen}
        onClose={() => setIsRecipeImportOpen(false)}
        availableWips={state.master.wips}
        availableMaterials={state.master.materials}
        existingRecipes={state.master.recipes || []}
        onImportRecipes={(newRecipes, mode) => onImportRecipes && onImportRecipes(newRecipes, mode)}
        showToast={showToast}
      />

      <SkuImportModal
        isOpen={isSkuImportOpen}
        onClose={() => setIsSkuImportOpen(false)}
        existingSkus={state.master.skus}
        onImportSkus={(newSkus, mode) => onImportSkus && onImportSkus(newSkus, mode)}
        showToast={showToast}
      />

      <SkuWipImportModal
        isOpen={isSkuWipImportOpen}
        onClose={() => setIsSkuWipImportOpen(false)}
        availableSkus={state.master.skus}
        availableWips={state.master.wips}
        existingSkuWips={state.master.skuWips}
        onImportSkuWips={(newSkuWips, mode) => onImportSkuWips && onImportSkuWips(newSkuWips, mode)}
        showToast={showToast}
      />

      <MachineChangeoverModal
        isOpen={!!changeoverModalMachine}
        onClose={() => setChangeoverModalMachine(null)}
        machine={changeoverModalMachine}
        availableWips={state.master.wips}
        availableTanks={state.master.tanks}
        onStartChangeover={(mId, data) => onStartMachineChangeover && onStartMachineChangeover(mId, data)}
        onCompleteChangeover={(mId, record) => onCompleteMachineChangeover && onCompleteMachineChangeover(mId, record)}
        onCancelChangeover={(mId) => onCancelMachineChangeover && onCancelMachineChangeover(mId)}
        showToast={showToast}
      />

      <MachineChangeoverHistoryModal
        isOpen={isChangeoverHistoryOpen}
        onClose={() => {
          setIsChangeoverHistoryOpen(false);
          setHistorySelectedMachineId(null);
        }}
        machines={state.master.machines}
        selectedMachineId={historySelectedMachineId}
        allChangeovers={state.transactions.changeovers || []}
      />
    </div>
  );
};
