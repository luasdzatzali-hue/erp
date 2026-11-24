import React, { useState } from 'react';
import {
  Database,
  Layers,
  Box,
  GitBranch,
  Cpu,
  Network,
  Trash2,
  Lock,
  Plus,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Search,
  Sliders,
  HelpCircle,
  Cylinder,
  Settings,
  Wrench,
  ArrowRight,
  RotateCw,
  Thermometer,
  UploadCloud,
  Edit3,
  X,
  History,
  Users,
  UserCheck,
  Building,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  CheckSquare,
  Square,
  UserPlus,
  Filter,
  Scale
} from 'lucide-react';
import { MaterialImportModal } from '../MaterialImportModal';
import { MachineImportModal } from '../MachineImportModal';
import { TankImportModal } from '../TankImportModal';
import { MachineChangeoverModal } from '../MachineChangeoverModal';
import { MachineChangeoverHistoryModal } from '../MachineChangeoverHistoryModal';
import { validatePasswordStrength } from '../../utils/security';
import { RecipeImportModal } from '../RecipeImportModal';
import { SkuImportModal } from '../SkuImportModal';
import { SkuWipImportModal } from '../SkuWipImportModal';
import {
  AppState,
  Material,
  WIP,
  SKU,
  SkuWip,
  WipMaterial,
  WipRecipe,
  WipRecipeItem,
  MaterialType,
  MaterialSource,
  ProductionMachine,
  WipTank,
  WipTankType,
  WipTankStatus,
  ChangeoverType,
  MachineChangeoverRecord,
  MachineChangeoverChecklist,
  RegisteredOperator,
  RegisteredManagement
} from '../../types';

interface MasterBOMViewProps {
  state: AppState;
  onAddMaterial: (mat: Omit<Material, 'id'>) => void;
  onDeleteMaterial: (id: string) => void;
  onImportMaterials?: (materials: Material[], mode: 'replace' | 'append') => void;
  onAddWip: (wip: Omit<WIP, 'id'>) => void;
  onUpdateWip?: (wipId: string, updates: Partial<WIP>) => void;
  onDeleteWip: (id: string) => void;
  onAddSku: (sku: Omit<SKU, 'id'>) => void;
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

export const MasterBOMView: React.FC<MasterBOMViewProps> = ({
  state,
  onAddMaterial,
  onDeleteMaterial,
  onImportMaterials,
  onAddWip,
  onUpdateWip,
  onDeleteWip,
  onAddSku,
  onDeleteSku,
  onImportSkus,
  onAddSkuWip,
  onDeleteSkuWip,
  onImportSkuWips,
  onAddWipMat,
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
  // Master sub-tab selection
  const [activeSubTab, setActiveSubTab] = useState<'BOM' | 'MACHINES' | 'TANKS' | 'USERS'>('BOM');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isMachineImportOpen, setIsMachineImportOpen] = useState(false);
  const [isTankImportOpen, setIsTankImportOpen] = useState(false);

  // Machine changeover states
  const [changeoverModalMachine, setChangeoverModalMachine] = useState<ProductionMachine | null>(null);
  const [isChangeoverHistoryOpen, setIsChangeoverHistoryOpen] = useState(false);
  const [historySelectedMachineId, setHistorySelectedMachineId] = useState<string | null>(null);
  const [machineStatusFilter, setMachineStatusFilter] = useState<'ALL' | 'OPERATIONAL' | 'CHANGEOVER' | 'STANDBY' | 'MAINTENANCE'>('ALL');

  // Material form state
  const [matName, setMatName] = useState('');
  const [matCode, setMatCode] = useState('');
  const [matType, setMatType] = useState<MaterialType>('bubuk');
  const [matSource, setMatSource] = useState<MaterialSource>('GDRM');
  const [matPackaging, setMatPackaging] = useState('');
  const [matWeight, setMatWeight] = useState('');

  // WIP form state with 1 WIP = 1 Unique Code, multi-machine, duration, and multi-tanks (Holding & Storage Tanks)
  const [wipCode, setWipCode] = useState('');
  const [wipName, setWipName] = useState('');
  const [wipBatchWeight, setWipBatchWeight] = useState('');
  const [wipDurationMinutes, setWipDurationMinutes] = useState('30');
  const [wipMachineIds, setWipMachineIds] = useState<string[]>([]);
  const [wipTankIds, setWipTankIds] = useState<string[]>([]);

  // Edit WIP Modal State (for updating code, name, batch weight, duration, multi-machine & multi-tank)
  const [editingWip, setEditingWip] = useState<WIP | null>(null);
  const [editWipCode, setEditWipCode] = useState<string>('');
  const [editWipMachines, setEditWipMachines] = useState<string[]>([]);
  const [editWipTankIds, setEditWipTankIds] = useState<string[]>([]);
  const [editWipName, setEditWipName] = useState<string>('');
  const [editWipBatchWeight, setEditWipBatchWeight] = useState<string>('');
  const [editWipDuration, setEditWipDuration] = useState<string>('30');


  // Machine Master form state
  const [machCode, setMachCode] = useState('');
  const [machName, setMachName] = useState('');
  const [machLine, setMachLine] = useState('Line 1 (Biskuit Domestik)');
  const [machCapacity, setMachCapacity] = useState('800');
  const [machStatus, setMachStatus] = useState<'OPERATIONAL' | 'STANDBY' | 'MAINTENANCE'>('OPERATIONAL');
  const [machOperator, setMachOperator] = useState('');
  const [machNotes, setMachNotes] = useState('');

  // Tank Master form state
  const [tankCode, setTankCode] = useState('');
  const [tankName, setTankName] = useState('');
  const [tankTypeForm, setTankTypeForm] = useState<WipTankType>('HOLDING_TANK');
  const [tankCapacity, setTankCapacity] = useState('600');
  const [tankInitialLevel, setTankInitialLevel] = useState('400');
  const [tankAssignedWip, setTankAssignedWip] = useState('');
  const [tankAssignedMachines, setTankAssignedMachines] = useState<string[]>([]);
  const [tankTemp, setTankTemp] = useState('45.0');
  const [tankAgitator, setTankAgitator] = useState<'ON' | 'OFF'>('ON');
  const [tankMinAlert, setTankMinAlert] = useState('100');

  // Edit Tank Modal State (for updating existing tanks & their multi-machines)
  const [editingTank, setEditingTank] = useState<WipTank | null>(null);
  const [editTankMachines, setEditTankMachines] = useState<string[]>([]);
  const [editTankWip, setEditTankWip] = useState<string>('');
  const [editTankName, setEditTankName] = useState<string>('');
  const [editTankCapacity, setEditTankCapacity] = useState<string>('');
  const [editTankTemp, setEditTankTemp] = useState<string>('');
  const [editTankMinAlert, setEditTankMinAlert] = useState<string>('');
  const [editTankAgitator, setEditTankAgitator] = useState<'ON' | 'OFF'>('ON');

  // SKU form state
  const [skuName, setSkuName] = useState('');
  const [skuIsKite, setSkuIsKite] = useState(false);
  const [skuTarget, setSkuTarget] = useState('');
  const [skuWeight, setSkuWeight] = useState('');

  // SkuWip form state
  const [swSkuId, setSwSkuId] = useState('');
  const [swWipId, setSwWipId] = useState('');
  const [swKgPerCarton, setSwKgPerCarton] = useState('');

  // WipMat form state
  const [wmWipId, setWmWipId] = useState('');
  const [wmMatId, setWmMatId] = useState('');
  const [wmKgBatch, setWmKgBatch] = useState('');

  // Resep Formulasi WIP states
  const [recipeWipId, setRecipeWipId] = useState(state.master.wips[0]?.id || '');
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [isCreatingRecipe, setIsCreatingRecipe] = useState(false);
  const [isRecipeImportOpen, setIsRecipeImportOpen] = useState(false);
  const [isSkuImportOpen, setIsSkuImportOpen] = useState(false);
  const [isSkuWipImportOpen, setIsSkuWipImportOpen] = useState(false);
  const [newRecipeCode, setNewRecipeCode] = useState('');
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeDesc, setNewRecipeDesc] = useState('');

  // Resep Edit & Delete states
  const [editingRecipe, setEditingRecipe] = useState<WipRecipe | null>(null);
  const [editRecipeCode, setEditRecipeCode] = useState('');
  const [editRecipeName, setEditRecipeName] = useState('');
  const [editRecipeDesc, setEditRecipeDesc] = useState('');
  const [editRecipeIsDefault, setEditRecipeIsDefault] = useState(false);
  const [deleteRecipeTarget, setDeleteRecipeTarget] = useState<WipRecipe | null>(null);

  // Edit item in recipe state
  const [editingRecipeItem, setEditingRecipeItem] = useState<{ recipeId: string; item: WipRecipeItem } | null>(null);
  const [editItemAmount, setEditItemAmount] = useState('');
  const [editItemUnit, setEditItemUnit] = useState<'kg' | 'gr'>('kg');

  // Material item addition to recipe (Single & Multiple Mode)
  const [recipeInputMode, setRecipeInputMode] = useState<'multi' | 'single'>('multi');
  const [recipeMatId, setRecipeMatId] = useState('');
  const [recipeMatAmount, setRecipeMatAmount] = useState('');
  const [recipeMatUnit, setRecipeMatUnit] = useState<'kg' | 'gr'>('kg');

  // Multi-select materials state for active recipe
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [multiMaterialDosages, setMultiMaterialDosages] = useState<Record<string, { amount: string; unit: 'kg' | 'gr' }>>({});
  const [multiMatSearch, setMultiMatSearch] = useState('');
  const [multiMatTypeFilter, setMultiMatTypeFilter] = useState<'all' | 'padat' | 'bubuk' | 'liquid'>('all');

  // Multi-select materials state when creating brand-new recipe
  const [newRecipeSelectedMatIds, setNewRecipeSelectedMatIds] = useState<string[]>([]);
  const [newRecipeDosages, setNewRecipeDosages] = useState<Record<string, { amount: string; unit: 'kg' | 'gr' }>>({});
  const [newRecipeMatSearch, setNewRecipeMatSearch] = useState('');
  const [newRecipeMatTypeFilter, setNewRecipeMatTypeFilter] = useState<'all' | 'padat' | 'bubuk' | 'liquid'>('all');

  // Auto-select active recipe when recipeWipId changes
  React.useEffect(() => {
    if (!recipeWipId) {
      setSelectedRecipeId('');
      return;
    }
    const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === recipeWipId);
    if (recipesForWip.length > 0) {
      const def = recipesForWip.find(r => r.isDefault) || recipesForWip[0];
      setSelectedRecipeId(def.id);
    } else {
      setSelectedRecipeId('');
    }
  }, [recipeWipId, state.master.recipes]);

  // User Management tab states (Administrator only)
  const [activeUserTab, setActiveUserTab] = useState<'OPERATORS' | 'MANAGEMENT' | 'SECURITY'>('OPERATORS');

  // Operator form states
  const [opName, setOpName] = useState('');
  const [opNik, setOpNik] = useState('');
  const [opLine, setOpLine] = useState('Line 1 (Biskuit Domestik)');
  const [opShift, setOpShift] = useState<1 | 2 | 3>(1);
  const [opNotes, setOpNotes] = useState('');
  const [opSearch, setOpSearch] = useState('');
  const [opShiftFilter, setOpShiftFilter] = useState<'ALL' | '1' | '2' | '3'>('ALL');
  const [opStatusFilter, setOpStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Management form states
  const [mgtName, setMgtName] = useState('');
  const [mgtEmail, setMgtEmail] = useState('');
  const [mgtTitle, setMgtTitle] = useState('');
  const [mgtDepartment, setMgtDepartment] = useState('Plant Operations Management');
  const [mgtAccess, setMgtAccess] = useState(true);
  const [mgtSearch, setMgtSearch] = useState('');
  const [mgtAccessFilter, setMgtAccessFilter] = useState<'ALL' | 'ACTIVE' | 'REVOKED'>('ALL');

  // Admin PIN form states
  const [newAdminPin, setNewAdminPin] = useState('');
  const [confirmAdminPin, setConfirmAdminPin] = useState('');

  // In-app Delete Confirmation Modal State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: 'OPERATOR' | 'MANAGEMENT';
    id: string;
    name: string;
    details: string;
  } | null>(null);

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

  const handleConfirmDelete = () => {
    if (!deleteConfirmation) return;
    if (deleteConfirmation.type === 'OPERATOR') {
      if (onDeleteOperator) onDeleteOperator(deleteConfirmation.id);
    } else {
      if (onDeleteManagement) onDeleteManagement(deleteConfirmation.id);
    }
    setDeleteConfirmation(null);
  };

  // Access check
  if (!state.isAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-14 px-4 bg-slate-900 border border-slate-800 rounded-2xl mt-8 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-base text-white mb-2">Akses Administrator Diperlukan</h3>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Modul Master Data & Bill of Materials (BOM) memengaruhi perhitungan formula resep dan seluruh inventaris pabrik. Harap login dengan PIN Administrator untuk melanjutkan.
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

  // Material Submit
  const handleMaterialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const weight = parseFloat(matWeight);
    if (!matName || isNaN(weight) || weight <= 0) {
      showToast('Harap masukkan nama dan berat material yang valid', true);
      return;
    }

    onAddMaterial({
      name: matName,
      code: matCode.trim() || undefined,
      type: matType,
      source: matSource,
      packaging: matPackaging || `${weight.toFixed(4)} kg`,
      weightKg: weight
    });

    setMatName('');
    setMatCode('');
    setMatPackaging('');
    setMatWeight('');
    showToast('Material berhasil di-autosave ke database');
  };

  // WIP Submit with 1 WIP = 1 Unique Code, Multi-Machines, Duration, and Multi-Storage/Holding Tanks
  const handleWipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const batchW = parseFloat(wipBatchWeight);
    const duration = parseFloat(wipDurationMinutes) || 30;
    const trimmedCode = (wipCode.trim() || `WIP-${String(state.master.wips.length + 1).padStart(3, '0')}`).toUpperCase();
    const trimmedName = wipName.trim();

    if (!trimmedName || isNaN(batchW) || batchW <= 0) {
      showToast('Harap masukkan nama dan bobot batch WIP yang valid', true);
      return;
    }

    // STRICT VALIDATION: 1 Nama WIP memiliki 1 Kode unik
    const duplicateCode = state.master.wips.some(
      w => w.code?.toUpperCase() === trimmedCode
    );
    if (duplicateCode) {
      showToast(`Kode WIP "${trimmedCode}" sudah digunakan! 1 nama WIP memiliki 1 kode unik.`, true);
      return;
    }

    const duplicateName = state.master.wips.some(
      w => w.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicateName) {
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

    setWipCode('');
    setWipName('');
    setWipBatchWeight('');
    setWipDurationMinutes('30');
    setWipMachineIds([]);
    setWipTankIds([]);
    showToast(`WIP [${trimmedCode}] ${trimmedName} berhasil ditambahkan (${wipMachineIds.length} mesin & ${wipTankIds.length} tangki transfer)`);
  };

  const handleStartEditWip = (wip: WIP) => {
    setEditingWip(wip);
    const mIds = wip.assignedMachineIds && wip.assignedMachineIds.length > 0
      ? wip.assignedMachineIds
      : wip.assignedMachineId ? [wip.assignedMachineId] : [];
    const tIds = wip.targetTankIds && wip.targetTankIds.length > 0
      ? wip.targetTankIds
      : wip.targetTankId ? [wip.targetTankId] : [];

    setEditWipCode(wip.code || '');
    setEditWipMachines(mIds);
    setEditWipTankIds(tIds);
    setEditWipName(wip.name);
    setEditWipBatchWeight(wip.batchWeightKg.toString());
    setEditWipDuration((wip.productionDurationMinutes || 30).toString());
  };

  const handleSaveEditWip = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWip) return;
    const batchW = parseFloat(editWipBatchWeight);
    const duration = parseFloat(editWipDuration) || 30;
    const trimmedCode = editWipCode.trim().toUpperCase();
    const trimmedName = editWipName.trim();

    if (!trimmedCode || !trimmedName || isNaN(batchW) || batchW <= 0) {
      showToast('Harap masukkan kode WIP, nama, dan bobot batch yang valid', true);
      return;
    }

    // STRICT VALIDATION: 1 Nama WIP memiliki 1 Kode unik (cek selain WIP yang sedang diedit)
    const duplicateCode = state.master.wips.some(
      w => w.id !== editingWip.id && w.code?.toUpperCase() === trimmedCode
    );
    if (duplicateCode) {
      showToast(`Kode WIP "${trimmedCode}" sudah dipakai oleh WIP lain! 1 WIP harus memiliki 1 kode unik.`, true);
      return;
    }

    const firstTankObj = state.master.tanks.find(t => editWipTankIds.includes(t.id));

    if (onUpdateWip) {
      onUpdateWip(editingWip.id, {
        code: trimmedCode,
        name: trimmedName,
        batchWeightKg: batchW,
        productionDurationMinutes: duration,
        assignedMachineIds: editWipMachines,
        assignedMachineId: editWipMachines[0] || undefined,
        targetTankIds: editWipTankIds,
        targetTankId: editWipTankIds[0] || undefined,
        targetTankType: firstTankObj?.type || 'HOLDING_TANK'
      });
      showToast(`WIP [${trimmedCode}] ${trimmedName} diperbarui (${editWipMachines.length} mesin, ${editWipTankIds.length} tangki transfer)`);
      setEditingWip(null);
    }
  };


  // Machine Submit
  const handleMachineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(machCapacity);
    if (!machCode || !machName || isNaN(cap) || cap <= 0) {
      showToast('Harap masukkan kode, nama mesin, dan kapasitas valid', true);
      return;
    }

    if (onAddMachine) {
      onAddMachine({
        code: machCode,
        name: machName,
        line: machLine,
        capacityKgPerHour: cap,
        status: machStatus,
        operatorAssigned: machOperator || undefined,
        notes: machNotes || undefined
      });
      showToast(`Mesin ${machCode} - ${machName} berhasil disimpan ke master data`);
      setMachCode('');
      setMachName('');
      setMachOperator('');
      setMachNotes('');
    }
  };

  // Tank Submit
  const handleTankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cap = parseFloat(tankCapacity);
    const initLvl = parseFloat(tankInitialLevel) || 0;
    const alertLvl = parseFloat(tankMinAlert) || cap * 0.2;
    const tempVal = parseFloat(tankTemp) || 45.0;

    if (!tankCode || !tankName || isNaN(cap) || cap <= 0) {
      showToast('Harap masukkan kode, nama tangki, dan kapasitas valid', true);
      return;
    }

    if (onAddTank) {
      onAddTank({
        code: tankCode,
        name: tankName,
        type: tankTypeForm,
        capacityKg: cap,
        currentLevelKg: Math.min(cap, Math.max(0, initLvl)),
        assignedWipId: tankAssignedWip || undefined,
        assignedMachineId: tankAssignedMachines[0] || undefined,
        assignedMachineIds: tankAssignedMachines,
        temp: tempVal,
        agitatorStatus: tankAgitator,
        status: 'ACTIVE',
        minAlertKg: alertLvl
      });
      showToast(
        `Tangki ${tankCode} (${tankTypeForm === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}) berhasil disimpan dengan ${tankAssignedMachines.length} mesin pengisi`
      );
      setTankCode('');
      setTankName('');
      setTankCapacity('600');
      setTankInitialLevel('400');
      setTankAssignedWip('');
      setTankAssignedMachines([]);
    }
  };

  const handleStartEditTank = (tank: WipTank) => {
    setEditingTank(tank);
    const mIds = tank.assignedMachineIds && tank.assignedMachineIds.length > 0
      ? tank.assignedMachineIds
      : tank.assignedMachineId ? [tank.assignedMachineId] : [];
    setEditTankMachines(mIds);
    setEditTankWip(tank.assignedWipId || '');
    setEditTankName(tank.name);
    setEditTankCapacity(String(tank.capacityKg));
    setEditTankTemp(String(tank.temp !== undefined ? tank.temp : 45.0));
    setEditTankMinAlert(String(tank.minAlertKg || 100));
    setEditTankAgitator(tank.agitatorStatus || 'ON');
  };

  const handleSaveEditTank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTank) return;
    const cap = parseFloat(editTankCapacity);
    if (!editTankName || isNaN(cap) || cap <= 0) {
      showToast('Kapasitas dan nama tangki harus valid', true);
      return;
    }

    if (onUpdateTank) {
      onUpdateTank(editingTank.id, {
        name: editTankName,
        capacityKg: cap,
        assignedWipId: editTankWip || undefined,
        assignedMachineIds: editTankMachines,
        assignedMachineId: editTankMachines[0] || undefined,
        temp: parseFloat(editTankTemp) || 45.0,
        minAlertKg: parseFloat(editTankMinAlert) || cap * 0.2,
        agitatorStatus: editTankAgitator
      });
      showToast(`Tangki ${editingTank.code} berhasil diperbarui (${editTankMachines.length} mesin pengisi terhubung)`);
      setEditingTank(null);
    }
  };

  // SKU Submit
  const handleSkuSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetH = parseFloat(skuTarget) || 0;
    const cWeight = parseFloat(skuWeight);
    if (!skuName || isNaN(cWeight) || cWeight <= 0) {
      showToast('Harap masukkan nama dan berat karton SKU yang valid', true);
      return;
    }

    onAddSku({
      name: skuName,
      isKite: skuIsKite,
      targetHour: targetH,
      cartonWeightKg: cWeight
    });

    setSkuName('');
    setSkuIsKite(false);
    setSkuTarget('');
    setSkuWeight('');
    showToast(`SKU (${skuIsKite ? 'KITE Ekspor' : 'Domestik'}) berhasil disimpan`);
  };

  // Link SKU to WIP
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
    showToast('WIP terpisah berhasil diikat ke SKU (kg WIP / karton SKU)');
  };

  // Link WIP to Material with Autofill
  const handleWipMatSelectChange = (materialId: string) => {
    setWmMatId(materialId);
    const mObj = state.master.materials.find(m => m.id === materialId);
    if (mObj) {
      setWmKgBatch(mObj.weightKg.toFixed(4));
      showToast(`Autofill berat material database: ${mObj.weightKg.toFixed(4)} kg`);
    }
  };

  const handleWipMatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const kgBatch = parseFloat(wmKgBatch);
    if (!wmWipId || !wmMatId || isNaN(kgBatch) || kgBatch <= 0) {
      showToast('Harap pilih WIP, Material, dan nilai kg per batch valid', true);
      return;
    }

    onAddWipMat({
      wipId: wmWipId,
      materialId: wmMatId,
      materialKgPerBatch: kgBatch
    });

    setWmMatId('');
    setWmKgBatch('');
    showToast('Material database berhasil ditautkan ke batch WIP dengan autofill');
  };

  // Helper to get default dosage for a material
  const getDefaultDosage = (matId: string): { amount: string; unit: 'kg' | 'gr' } => {
    const m = state.master.materials.find(mat => mat.id === matId);
    if (!m) return { amount: '1', unit: 'kg' };
    if (m.weightKg > 0 && m.weightKg < 1) {
      return { amount: String(Number((m.weightKg * 1000).toFixed(4))), unit: 'gr' };
    }
    return { amount: String(Number((m.weightKg || 1).toFixed(4))), unit: 'kg' };
  };

  // Toggle selection for active recipe
  const handleToggleMaterialSelect = (matId: string) => {
    setSelectedMaterialIds(prev => {
      if (prev.includes(matId)) {
        return prev.filter(id => id !== matId);
      } else {
        setMultiMaterialDosages(dPrev => {
          if (!dPrev[matId]) {
            return { ...dPrev, [matId]: getDefaultDosage(matId) };
          }
          return dPrev;
        });
        return [...prev, matId];
      }
    });
  };

  const handleSelectAllMaterials = (filteredList: Material[]) => {
    const idsToAdd = filteredList.map(m => m.id);
    setSelectedMaterialIds(prev => {
      const merged = Array.from(new Set([...prev, ...idsToAdd]));
      setMultiMaterialDosages(dPrev => {
        const next = { ...dPrev };
        idsToAdd.forEach(id => {
          if (!next[id]) {
            next[id] = getDefaultDosage(id);
          }
        });
        return next;
      });
      return merged;
    });
  };

  const handleDeselectAllMaterials = () => {
    setSelectedMaterialIds([]);
  };

  const handleUpdateMultiDosage = (matId: string, amount: string, unit: 'kg' | 'gr') => {
    setMultiMaterialDosages(prev => ({
      ...prev,
      [matId]: { amount, unit }
    }));
  };

  // Submit batch of selected materials into active recipe
  const handleSubmitMultipleMaterialsToRecipe = () => {
    if (!selectedRecipeId) {
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
      onAddMultipleMaterialsToRecipe(selectedRecipeId, itemsToSubmit);
    } else if (onAddMaterialToRecipe) {
      itemsToSubmit.forEach(it => onAddMaterialToRecipe(selectedRecipeId, it));
      showToast(`Berhasil menambahkan ${itemsToSubmit.length} material ke resep!`);
    }

    setSelectedMaterialIds([]);
    setMultiMatSearch('');
  };

  // Toggle selection when creating a brand-new recipe
  const handleToggleNewRecipeMaterialSelect = (matId: string) => {
    setNewRecipeSelectedMatIds(prev => {
      if (prev.includes(matId)) {
        return prev.filter(id => id !== matId);
      } else {
        setNewRecipeDosages(dPrev => {
          if (!dPrev[matId]) {
            return { ...dPrev, [matId]: getDefaultDosage(matId) };
          }
          return dPrev;
        });
        return [...prev, matId];
      }
    });
  };

  const handleSelectAllNewRecipeMaterials = (filteredList: Material[]) => {
    const idsToAdd = filteredList.map(m => m.id);
    setNewRecipeSelectedMatIds(prev => {
      const merged = Array.from(new Set([...prev, ...idsToAdd]));
      setNewRecipeDosages(dPrev => {
        const next = { ...dPrev };
        idsToAdd.forEach(id => {
          if (!next[id]) {
            next[id] = getDefaultDosage(id);
          }
        });
        return next;
      });
      return merged;
    });
  };

  const handleDeselectAllNewRecipeMaterials = () => {
    setNewRecipeSelectedMatIds([]);
  };

  const handleUpdateNewRecipeDosage = (matId: string, amount: string, unit: 'kg' | 'gr') => {
    setNewRecipeDosages(prev => ({
      ...prev,
      [matId]: { amount, unit }
    }));
  };

  // Resep Formulasi Handlers
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

    // Build initial items from multi-select if any
    const initialItems: Array<Omit<WipRecipeItem, 'id'>> = [];
    if (newRecipeSelectedMatIds.length > 0) {
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
      setNewRecipeCode('');
      setNewRecipeName('');
      setNewRecipeDesc('');
      setNewRecipeSelectedMatIds([]);
      setNewRecipeDosages({});
      setIsCreatingRecipe(false);
    }
  };

  const handleRecipeMaterialSelect = (matId: string) => {
    setRecipeMatId(matId);
    const m = state.master.materials.find(mat => mat.id === matId);
    if (m && m.weightKg > 0) {
      if (m.weightKg < 1) {
        setRecipeMatUnit('gr');
        setRecipeMatAmount(String(m.weightKg * 1000));
      } else {
        setRecipeMatUnit('kg');
        setRecipeMatAmount(String(m.weightKg));
      }
    }
  };

  const handleAddMaterialToRecipeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeId) {
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
      onAddMaterialToRecipe(selectedRecipeId, {
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

  // Edit and Delete Recipe handlers
  const handleStartEditRecipe = (recipe: WipRecipe) => {
    setEditingRecipe(recipe);
    setEditRecipeCode(recipe.recipeCode);
    setEditRecipeName(recipe.recipeName);
    setEditRecipeDesc(recipe.description || '');
    setEditRecipeIsDefault(recipe.isDefault || false);
  };

  const handleSaveEditRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecipe) return;
    if (!editRecipeCode.trim() || !editRecipeName.trim()) {
      showToast('Harap masukkan kode dan nama resep yang valid', true);
      return;
    }
    if (onUpdateRecipe) {
      onUpdateRecipe(editingRecipe.id, {
        recipeCode: editRecipeCode.trim().toUpperCase(),
        recipeName: editRecipeName.trim(),
        description: editRecipeDesc.trim() || undefined,
        isDefault: editRecipeIsDefault
      });
      showToast(`Resep ${editRecipeCode.toUpperCase()} berhasil diperbarui`);
      setEditingRecipe(null);
    }
  };

  const handleConfirmDeleteRecipe = () => {
    if (!deleteRecipeTarget) return;
    if (onDeleteRecipe) {
      onDeleteRecipe(deleteRecipeTarget.id);
      showToast(`Resep "${deleteRecipeTarget.recipeName}" (${deleteRecipeTarget.recipeCode}) berhasil dihapus`);
      if (selectedRecipeId === deleteRecipeTarget.id) {
        setSelectedRecipeId('');
      }
      setDeleteRecipeTarget(null);
    }
  };

  const handleStartEditRecipeItem = (recipeId: string, item: WipRecipeItem) => {
    setEditingRecipeItem({ recipeId, item });
    setEditItemAmount(String(item.amount));
    setEditItemUnit(item.unit);
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
      showToast(`Takaran material resep berhasil diperbarui menjadi ${val} ${editItemUnit}`);
      setEditingRecipeItem(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      {/* Sub-tab Navigation: BOM Hierarki, Master Mesin, Master Tangki */}
      <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex flex-wrap items-center gap-1.5 shadow-xl">
        <button
          onClick={() => setActiveSubTab('BOM')}
          className={`flex-1 min-w-[150px] flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'BOM'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>1. Hierarki BOM (RM, WIP, SKU)</span>
        </button>

        <button
          onClick={() => setActiveSubTab('MACHINES')}
          className={`flex-1 min-w-[150px] flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'MACHINES'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>2. Master Mesin Produksi ({state.master.machines.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('TANKS')}
          className={`flex-1 min-w-[150px] flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'TANKS'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Cylinder className="w-4 h-4" />
          <span>3. Master Tangki WIP ({state.master.tanks.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('USERS')}
          className={`flex-1 min-w-[170px] flex items-center justify-center space-x-2 py-2 px-3 rounded-xl text-xs font-bold transition ${
            activeSubTab === 'USERS'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 ring-1 ring-amber-400'
              : 'text-amber-400 hover:text-amber-300 hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>4. Pengguna & Akses ({state.registeredOperators?.length || 0} Op / {state.registeredManagement?.length || 0} Mgt)</span>
        </button>
      </div>

      {activeSubTab === 'BOM' && (
        <div className="space-y-5">
          {/* Auto-saved Database Notification Banner */}
          <div className="bg-gradient-to-r from-cyan-950/60 via-slate-900 to-cyan-950/40 border border-cyan-500/30 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-cyan-300 shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-white text-xs sm:text-sm">Database Material Aktif (Autosave Standar Industri)</h4>
                <p className="text-[11px] text-cyan-200/80">
                  Semua material yang diinput tersimpan otomatis & langsung menjadi acuan dropdown batch WIP dengan autofill bobot kilogram (presisi 4 desimal).
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                    onOpenAdminModal();
                    showToast('Otorisasi Administrator diperlukan untuk impor data material', true);
                    return;
                  }
                  setIsImportModalOpen(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-95"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import / Muat Material (Drive & Storage)</span>
              </button>
              <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-semibold rounded-lg text-[10px]">
                Auto-Saved System
              </span>
              {onSwitchTab && (
                <button
                  type="button"
                  onClick={() => onSwitchTab('weekly-planning')}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition active:scale-95 whitespace-nowrap shrink-0"
                >
                  <span>Lanjut Tahap 02: Planning Mingguan</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Grid: 3 Foundation Columns (1. Material, 2. WIP, 3. SKU) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1: Material Master Form */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-1.5">
              <Database className="w-4 h-4 text-rose-400" />
              <span>1. Input Material (DB)</span>
            </h3>
            <div className="flex items-center space-x-2">
              {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && (
                <button
                  type="button"
                  onClick={() => onOpenStockAdjustment()}
                  className="text-[11px] text-amber-300 hover:text-white flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-800 hover:bg-amber-900/60 transition"
                  title="Kalibrasi dan Sesuaikan Saldo Awal Material (Akses Administrator)"
                >
                  <Scale className="w-3 h-3 text-amber-400" />
                  <span>Adjust Saldo Awal</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                    showToast('Otorisasi Administrator diperlukan untuk impor data material', true);
                    return;
                  }
                  setIsImportModalOpen(true);
                }}
                className="text-[11px] text-cyan-300 hover:text-white flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-cyan-950/60 border border-cyan-800 hover:bg-cyan-900/60 transition"
                title="Impor dari penyimpanan lokal atau Google Drive"
              >
                <UploadCloud className="w-3 h-3 text-cyan-400" />
                <span>Import</span>
              </button>
              <span className="text-[10px] text-slate-400 font-mono">
                {state.master.materials.length} item
              </span>
            </div>
          </div>

          <form onSubmit={handleMaterialSubmit} className="space-y-2 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={matName}
                onChange={(e) => setMatName(e.target.value)}
                required
                placeholder="Nama Material (e.g. Gula Pasir)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <input
                type="text"
                value={matCode}
                onChange={(e) => setMatCode(e.target.value)}
                placeholder="Kode Material (e.g. MAT-GL-01)"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={matType}
                onChange={(e) => setMatType(e.target.value as MaterialType)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="bubuk">Bubuk</option>
                <option value="liquid">Liquid</option>
                <option value="padat">Padat</option>
              </select>
              <select
                value={matSource}
                onChange={(e) => setMatSource(e.target.value as MaterialSource)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="GDRM">GDRM (Standar)</option>
                <option value="Formulasi">Formulasi (Custom)</option>
              </select>
            </div>
            <input
              type="text"
              value={matPackaging}
              onChange={(e) => setMatPackaging(e.target.value)}
              placeholder="Kemasan (e.g. Zak 15 kg, Zak 25 kg, Zak 50 kg)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500"
            />
            <input
              type="number"
              step="0.0001"
              value={matWeight}
              onChange={(e) => setMatWeight(e.target.value)}
              required
              placeholder="Berat Kemasan (Kilogram, 4 desimal)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
            />
            <button
              type="submit"
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-600/20 transition active:scale-95"
            >
              Simpan & Autosave Material
            </button>
          </form>

          {/* List of Materials */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar pt-2 border-t border-slate-800">
            {state.master.materials.length > 0 ? (
              state.master.materials.map(m => (
                <div
                  key={m.id}
                  className="bg-slate-800/50 border border-slate-700/60 p-2.5 rounded-xl flex items-center justify-between text-xs hover:bg-slate-800 transition"
                >
                  <div className="truncate mr-2">
                    <div className="flex items-center space-x-1.5 truncate">
                      {m.code && (
                        <span className="font-mono text-sky-950 font-extrabold bg-sky-100 px-2 py-0.5 rounded border border-sky-300 text-[11px] shrink-0">
                          {m.code}
                        </span>
                      )}
                      <span className="font-semibold text-white truncate">{m.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      <span className="text-slate-300 font-medium">{m.type.toUpperCase()}</span> • <span className={m.source === 'Formulasi' ? 'text-purple-300 font-medium' : 'text-blue-300 font-medium'}>{m.source}</span> • {m.packaging}
                    </span>
                    <span className="text-[10px] text-amber-300/90 font-mono block mt-0.5">
                      Saldo Awal: Total {((m.initialStockCk || 0) + (m.initialStockWineroto || 0) + (m.initialStockTank || 0)).toFixed(1)} kg
                      <span className="text-slate-400 text-[9px] ml-1">
                        (CK: {m.initialStockCk || 0} | WR: {m.initialStockWineroto || 0} | TK: {m.initialStockTank || 0})
                      </span>
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono text-cyan-400 font-semibold block text-[11px]">
                      {m.weightKg.toFixed(4)} kg
                    </span>
                    <div className="flex items-center space-x-2 mt-0.5 justify-end">
                      {state.currentUserRole === 'ADMINISTRATOR' && onOpenStockAdjustment && (
                        <button
                          type="button"
                          onClick={() => onOpenStockAdjustment(m.id)}
                          className="text-amber-400 hover:text-amber-300 text-[10px] font-medium"
                          title="Sesuaikan Saldo Awal Material Ini"
                        >
                          Adjust Saldo
                        </button>
                      )}
                      <button
                        onClick={() => onDeleteMaterial(m.id)}
                        className="text-rose-400 hover:text-rose-300 text-[10px]"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-500 text-center py-3">Belum ada material tersimpan.</p>
            )}
          </div>
        </div>

        {/* Column 2: WIP Master Form */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              <span>2. Input WIP & Mesin/Tangki</span>
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">
              {state.master.wips.length} WIP
            </span>
          </div>

          <form onSubmit={handleWipSubmit} className="space-y-2 text-xs">
            {/* 1 WIP = 1 Unique Code */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-[10px] text-slate-300 font-semibold uppercase mb-0.5">
                  Kode WIP:
                </label>
                <input
                  type="text"
                  value={wipCode}
                  onChange={(e) => setWipCode(e.target.value.toUpperCase())}
                  required
                  placeholder="WIP-001"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-cyan-300 font-mono font-bold uppercase placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-slate-300 font-semibold uppercase mb-0.5">
                  Nama WIP (1 Nama = 1 Kode):
                </label>
                <input
                  type="text"
                  value={wipName}
                  onChange={(e) => setWipName(e.target.value)}
                  required
                  placeholder="e.g. WIP Sirup Karamel"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <input
              type="number"
              step="0.0001"
              value={wipBatchWeight}
              onChange={(e) => setWipBatchWeight(e.target.value)}
              required
              placeholder="Berat 1 Batch WIP (kg, 4 desimal)"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
            />

            {/* Konfigurasi Lama Waktu Produksi WIP (Menit) */}
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-300 font-semibold uppercase flex items-center space-x-1">
                  <RotateCw className="w-3 h-3 text-amber-400" />
                  <span>Lama Waktu Produksi WIP:</span>
                </label>
                <span className="text-[10px] text-amber-400 font-mono font-bold">
                  {wipDurationMinutes || 30} Menit / Batch
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={wipDurationMinutes}
                  onChange={(e) => setWipDurationMinutes(e.target.value)}
                  required
                  placeholder="30"
                  className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-amber-400 font-bold"
                />
                <span className="text-slate-400 text-xs">menit</span>
                <div className="flex items-center space-x-1 ml-auto">
                  {['15', '30', '45', '60'].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setWipDurationMinutes(mins)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                        wipDurationMinutes === mins
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[9px] text-slate-400 leading-tight">
                Batch WIP otomatis terselesaikan saat durasi tercapai & alarm peringatan berbunyi.
              </p>
            </div>

            {/* Multi-Mesin Produksi Selector (Opsi Penggunaan Lebih dari 1 Mesin) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-300 font-semibold uppercase flex items-center space-x-1">
                  <Cpu className="w-3 h-3 text-cyan-400" />
                  <span>Mesin Pengolah WIP (Multi-Mesin):</span>
                </label>
                <div className="flex items-center space-x-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWipMachineIds(state.master.machines.map(m => m.id))}
                    className="text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setWipMachineIds([])}
                    className="text-slate-400 hover:text-slate-300 font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              {state.master.machines.length > 0 ? (
                <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto no-scrollbar bg-slate-950/70 p-2 rounded-xl border border-slate-700/80">
                  {state.master.machines.map(m => {
                    const isChecked = wipMachineIds.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center justify-between p-1.5 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate mr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWipMachineIds(prev => [...prev, m.id]);
                              } else {
                                setWipMachineIds(prev => prev.filter(id => id !== m.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-cyan-600 bg-slate-800 border-slate-700 focus:ring-0"
                          />
                          <span className="font-mono font-extrabold text-sky-950 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 text-xs shrink-0">{m.code}</span>
                          <span className="truncate">{m.name}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 shrink-0 font-mono">
                          {m.line.split('(')[0]}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic p-2 bg-slate-950 rounded-xl">
                  Belum ada master mesin produksi. Tambahkan di tab Master Mesin.
                </p>
              )}

              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{wipMachineIds.length} mesin diizinkan memproduksi WIP ini</span>
                {wipMachineIds.length > 1 && (
                  <span className="text-amber-400 font-medium">★ Multi-Mesin Fleksibel</span>
                )}
              </div>
            </div>

            {/* Multi-Storage / Holding Tanks Selector (Penyimpanan & Transfer WIP) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-300 font-semibold uppercase flex items-center space-x-1">
                  <Database className="w-3 h-3 text-purple-400" />
                  <span>Tangki Penampungan / Transfer (Multi-Tank):</span>
                </label>
                <div className="flex items-center space-x-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setWipTankIds(state.master.tanks.map(t => t.id))}
                    className="text-purple-400 hover:text-purple-300 font-medium"
                  >
                    Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setWipTankIds(state.master.tanks.filter(t => t.type === 'HOLDING_TANK').map(t => t.id))}
                    className="text-amber-400 hover:text-amber-300 font-medium"
                    title="Pilih hanya Holding Tanks"
                  >
                    HT
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setWipTankIds(state.master.tanks.filter(t => t.type === 'STORAGE_TANK').map(t => t.id))}
                    className="text-cyan-400 hover:text-cyan-300 font-medium"
                    title="Pilih hanya Storage Tanks"
                  >
                    ST
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setWipTankIds([])}
                    className="text-slate-400 hover:text-slate-300 font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              {state.master.tanks.length > 0 ? (
                <div className="grid grid-cols-1 gap-1 max-h-36 overflow-y-auto no-scrollbar bg-slate-950/70 p-2 rounded-xl border border-slate-700/80">
                  {state.master.tanks.map(t => {
                    const isChecked = wipTankIds.includes(t.id);
                    const isHT = t.type === 'HOLDING_TANK';
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center justify-between p-1.5 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-purple-500/15 border-purple-500/50 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate mr-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setWipTankIds(prev => [...prev, t.id]);
                              } else {
                                setWipTankIds(prev => prev.filter(id => id !== t.id));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded text-purple-600 bg-slate-800 border-slate-700 focus:ring-0"
                          />
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                            isHT
                              ? 'bg-amber-950 text-amber-300 border-amber-600/50'
                              : 'bg-sky-950 text-sky-300 border-sky-600/50'
                          }`}>
                            {isHT ? 'HT' : 'ST'}
                          </span>
                          <span className="font-mono font-bold text-white text-[11px]">{t.code}</span>
                          <span className="truncate text-slate-300">{t.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {t.capacityKg} kg
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic p-2 bg-slate-950 rounded-xl">
                  Belum ada master tangki. Tambahkan di tab Tangki.
                </p>
              )}

              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{wipTankIds.length} tangki penampungan / penyimpanan dipilih</span>
                {wipTankIds.length > 1 && (
                  <span className="text-purple-300 font-medium">★ Multi-Storage/Holding Tank</span>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-amber-600/20 transition active:scale-95"
            >
              Simpan WIP & Tautkan Mesin/Tangki
            </button>
          </form>

          {/* List of WIPs */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto no-scrollbar pt-2 border-t border-slate-800">
            {state.master.wips.length > 0 ? (
              state.master.wips.map(w => {
                const assignedMachineIds = w.assignedMachineIds && w.assignedMachineIds.length > 0
                  ? w.assignedMachineIds
                  : w.assignedMachineId ? [w.assignedMachineId] : [];
                const assignedMachs = state.master.machines.filter(m => assignedMachineIds.includes(m.id));

                const assignedTankIds = w.targetTankIds && w.targetTankIds.length > 0
                  ? w.targetTankIds
                  : w.targetTankId ? [w.targetTankId] : [];
                const assignedTnks = state.master.tanks.filter(t => assignedTankIds.includes(t.id));

                return (
                  <div
                    key={w.id}
                    className="bg-slate-800/50 border border-slate-700/60 p-2.5 rounded-xl text-xs hover:bg-slate-800 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 truncate mr-2">
                        {w.code && (
                          <span className="font-mono text-amber-950 font-extrabold bg-amber-100 px-2 py-0.5 rounded border border-amber-300 text-[11px] shrink-0">
                            {w.code}
                          </span>
                        )}
                        <span className="font-semibold text-white truncate">{w.name}</span>
                      </div>
                      <button
                        onClick={() => onDeleteWip(w.id)}
                        className="text-rose-400 hover:text-rose-300 text-[10px] shrink-0"
                      >
                        Hapus
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-amber-400 font-mono font-medium">
                        1 Batch = {w.batchWeightKg.toFixed(4)} kg
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono text-[9px]">
                        ⏱️ {w.productionDurationMinutes || 30} mnt (Auto-Alarm)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1 pt-1 text-[9px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {assignedMachs.length > 0 ? (
                          assignedMachs.map(m => (
                            <span key={m.id} className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-950 border border-sky-300 font-mono font-bold text-[10px]">
                              Mesin: {m.code}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">Tanpa mesin</span>
                        )}

                        {assignedTnks.length > 0 ? (
                          assignedTnks.map(t => (
                            <span
                              key={t.id}
                              className={`px-1.5 py-0.5 rounded font-mono text-[9px] border ${
                                t.type === 'HOLDING_TANK'
                                  ? 'bg-amber-950 text-amber-300 border-amber-700/60'
                                  : 'bg-purple-950 text-purple-300 border-purple-700/60'
                              }`}
                            >
                              ➔ {t.code} ({t.type === 'HOLDING_TANK' ? 'HT' : 'ST'})
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 italic">Tanpa tangki</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStartEditWip(w)}
                        className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-0.5 ml-auto"
                        title="Kelola / Ubah kode, mesin & tangki untuk WIP ini"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                        <span>Kelola WIP</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-[11px] text-slate-500 text-center py-3">Belum ada WIP tersimpan.</p>
            )}
          </div>
        </div>

        {/* Column 3: SKU Master Form */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-xs sm:text-sm text-white flex items-center space-x-1.5">
              <Box className="w-4 h-4 text-cyan-400" />
              <span>3. Input SKU (Domestik / KITE)</span>
            </h3>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                    onOpenAdminModal();
                    showToast('Otorisasi Administrator diperlukan untuk impor data SKU', true);
                    return;
                  }
                  setIsSkuImportOpen(true);
                }}
                className="flex items-center space-x-1 px-2 py-1 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded-lg text-[10px] font-semibold transition active:scale-95 shadow-sm"
                title="Impor daftar SKU dari Google Drive Spreadsheet atau file lokal (CSV/JSON)"
              >
                <UploadCloud className="w-3 h-3 text-cyan-400" />
                <span>Import Drive / File</span>
              </button>
              <span className="text-[10px] text-slate-400 font-mono">
                {state.master.skus.length} SKU
              </span>
            </div>
          </div>

          <form onSubmit={handleSkuSubmit} className="space-y-2 text-xs">
            <input
              type="text"
              value={skuName}
              onChange={(e) => setSkuName(e.target.value)}
              required
              placeholder="Nama SKU Produk Jadi"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex items-center space-x-2 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700">
              <input
                type="checkbox"
                id="skuIsKiteCheckbox"
                checked={skuIsKite}
                onChange={(e) => setSkuIsKite(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-600 bg-slate-700 border-slate-600 focus:ring-0"
              />
              <label htmlFor="skuIsKiteCheckbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                Tandai sebagai SKU Ekspor (KITE)
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="0.0001"
                value={skuTarget}
                onChange={(e) => setSkuTarget(e.target.value)}
                required
                placeholder="Target Ktn/Jam"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
              />
              <input
                type="number"
                step="0.0001"
                value={skuWeight}
                onChange={(e) => setSkuWeight(e.target.value)}
                required
                placeholder="Berat kg/Karton"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-95"
            >
              Simpan SKU Produk
            </button>
          </form>

          {/* List of SKUs */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar pt-2 border-t border-slate-800">
            {state.master.skus.length > 0 ? (
              state.master.skus.map(s => (
                <div
                  key={s.id}
                  className="bg-slate-800/50 border border-slate-700/60 p-2.5 rounded-xl flex items-center justify-between text-xs hover:bg-slate-800 transition"
                >
                  <div className="truncate mr-2">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-semibold text-white truncate">{s.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                        s.isKite ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
                      }`}>
                        {s.isKite ? 'KITE' : 'DOM'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      Target: {s.targetHour} ktn/j • {s.cartonWeightKg.toFixed(4)} kg/ktn
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteSku(s.id)}
                    className="text-rose-400 hover:text-rose-300 text-[10px] shrink-0"
                  >
                    Hapus
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-slate-500 text-center py-3">Belum ada SKU tersimpan.</p>
            )}
          </div>
        </div>
      </div>

      {/* Step 4: BOM Configuration (A. SKU to WIP kg/carton, B. WIP to Material kg with Autofill) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* A. Tentukan WIP (kg/karton) untuk 1 Karton SKU */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl space-y-3 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 gap-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                <GitBranch className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-white">
                  A. Tentukan Jenis WIP (kg/karton) untuk 1 Karton SKU
                </h3>
                <p className="text-[10px] text-slate-400">Hubungkan komponen WIP terpisah ke dalam 1 karton SKU</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setIsSkuWipImportOpen(true)}
                title="Import konfigurasi kebutuhan WIP per karton SKU dari File CSV/JSON atau Google Drive"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-xl text-[11px] font-semibold transition active:scale-95 shadow-sm"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import File</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleSkuWipSubmit} className="space-y-2.5 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Pilih SKU Produk Target
              </label>
              <select
                value={swSkuId}
                onChange={(e) => setSwSkuId(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Pilih SKU --</option>
                {state.master.skus.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.cartonWeightKg.toFixed(4)} kg/karton)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Pilih Jenis WIP Terpisah
              </label>
              <select
                value={swWipId}
                onChange={(e) => setSwWipId(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Pilih WIP --</option>
                {state.master.wips.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} (Batch: {w.batchWeightKg.toFixed(4)} kg)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                Kebutuhan WIP (Kilogram per Karton SKU)
              </label>
              <input
                type="number"
                step="0.0001"
                value={swKgPerCarton}
                onChange={(e) => setSwKgPerCarton(e.target.value)}
                required
                placeholder="0.0000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-95"
            >
              Tautkan WIP ke SKU
            </button>
          </form>
        </div>

        {/* B. Penentuan Batch WIP dari Resep & Database Material */}
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-white">
                  B. Penentuan Batch WIP dari Resep & Database Material
                </h3>
                <p className="text-[10px] text-slate-400">
                  Hierarki Formulasi: Pilih Target WIP &rarr; Pilih/Buat Resep &rarr; Konfigurasi Material (Padat/Bubuk/Liquid dalam kg atau gr/batch)
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsRecipeImportOpen(true)}
                title="Import Resep dari Google Drive atau File Spreadsheet/JSON"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 rounded-xl text-xs font-semibold transition active:scale-95 shadow"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Import Resep (Drive / File)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCreatingRecipe(!isCreatingRecipe)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold transition active:scale-95 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isCreatingRecipe ? 'Tutup Form Resep' : '+ Buat Resep Baru'}</span>
              </button>
            </div>
          </div>

          {/* Form Pembuatan Resep Baru (Bila Ditoggle) */}
          {isCreatingRecipe && (
            <form onSubmit={handleCreateRecipeSubmit} className="bg-slate-950/80 border border-amber-500/30 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Formulir Resep Formulasi Baru untuk WIP</span>
                </span>
                <span className="text-[10px] text-slate-400">1 WIP dapat memiliki beberapa varian resep</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Kode Resep Formulasi *
                  </label>
                  <input
                    type="text"
                    value={newRecipeCode}
                    onChange={(e) => setNewRecipeCode(e.target.value)}
                    placeholder="Contoh: RSP-WIP1-01"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono uppercase focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                    Nama Resep Formulasi *
                  </label>
                  <input
                    type="text"
                    value={newRecipeName}
                    onChange={(e) => setNewRecipeName(e.target.value)}
                    placeholder="Contoh: Formula Standar Biskuit Domestik"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Deskripsi / Catatan Formulasi (Opsional)
                </label>
                <input
                  type="text"
                  value={newRecipeDesc}
                  onChange={(e) => setNewRecipeDesc(e.target.value)}
                  placeholder="Keterangan parameter proses atau varian rasa"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>

              {/* Opsi Multi-Select Material Saat Membuat Resep Baru */}
              <div className="bg-slate-900/90 border border-slate-700/80 p-3.5 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div>
                    <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
                      <CheckSquare className="w-4 h-4 text-amber-400" />
                      <span>Pilih Material Database Sekaligus untuk Resep Ini (Multi-Select)</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Centang material di bawah untuk langsung dimasukkan ke resep tanpa harus menambahkan satu per satu
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 self-end sm:self-auto shrink-0">
                    <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                      {newRecipeSelectedMatIds.length} Material Terpilih
                    </span>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={newRecipeMatSearch}
                      onChange={(e) => setNewRecipeMatSearch(e.target.value)}
                      placeholder="Cari nama atau kode material..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="flex items-center space-x-1.5 overflow-x-auto">
                    {(['all', 'padat', 'bubuk', 'liquid'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewRecipeMatTypeFilter(t)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                          newRecipeMatTypeFilter === t
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {t === 'all' ? 'Semua' : t}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const searchNorm = newRecipeMatSearch.trim().toLowerCase();
                        const list = state.master.materials.filter(m => {
                          const matchSearch = !searchNorm ||
                            m.name.toLowerCase().includes(searchNorm) ||
                            (m.code && m.code.toLowerCase().includes(searchNorm)) ||
                            m.packaging.toLowerCase().includes(searchNorm);
                          const matchType = newRecipeMatTypeFilter === 'all' || m.type === newRecipeMatTypeFilter;
                          return matchSearch && matchType;
                        });
                        handleSelectAllNewRecipeMaterials(list);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-semibold transition border border-slate-700"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllNewRecipeMaterials}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-semibold transition border border-slate-700"
                    >
                      Batal
                    </button>
                  </div>
                </div>

                {/* Material Cards List */}
                <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/60">
                  {(() => {
                    const searchNorm = newRecipeMatSearch.trim().toLowerCase();
                    const list = state.master.materials.filter(m => {
                      const matchSearch = !searchNorm ||
                        m.name.toLowerCase().includes(searchNorm) ||
                        (m.code && m.code.toLowerCase().includes(searchNorm)) ||
                        m.packaging.toLowerCase().includes(searchNorm);
                      const matchType = newRecipeMatTypeFilter === 'all' || m.type === newRecipeMatTypeFilter;
                      return matchSearch && matchType;
                    });

                    if (list.length === 0) {
                      return (
                        <div className="py-6 text-center text-slate-500 text-xs">
                          Tidak ada material yang cocok dengan filter pencarian.
                        </div>
                      );
                    }

                    return list.map(m => {
                      const isSelected = newRecipeSelectedMatIds.includes(m.id);
                      const dosage = newRecipeDosages[m.id] || getDefaultDosage(m.id);
                      const amountVal = parseFloat(dosage.amount) || 0;
                      const amountInKg = dosage.unit === 'gr' ? amountVal / 1000 : amountVal;

                      return (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-xl border transition ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500/40'
                              : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            {/* Checkbox & Details */}
                            <div
                              onClick={() => handleToggleNewRecipeMaterialSelect(m.id)}
                              className="flex items-start space-x-2.5 cursor-pointer flex-1"
                            >
                              <button
                                type="button"
                                className="mt-0.5 text-amber-400 shrink-0"
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-500" />
                                )}
                              </button>
                              <div>
                                <div className="flex items-center space-x-1.5">
                                  {m.code && (
                                    <span className="font-mono text-[10px] font-bold text-cyan-300 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                                      {m.code}
                                    </span>
                                  )}
                                  <span className="font-semibold text-white text-xs">{m.name}</span>
                                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                    m.type === 'padat'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : m.type === 'liquid'
                                      ? 'bg-cyan-500/20 text-cyan-300'
                                      : 'bg-emerald-500/20 text-emerald-300'
                                  }`}>
                                    {m.type}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Supplier: <span className="text-slate-300 font-medium">{m.source}</span> | Kemasan: <span className="text-slate-300 font-medium">{m.packaging} ({m.weightKg.toFixed(4)} kg)</span>
                                </div>
                              </div>
                            </div>

                            {/* Dosage Inputs (Active when checked) */}
                            {isSelected && (
                              <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto bg-slate-950/70 p-1.5 rounded-lg border border-amber-500/30">
                                <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                                  Takaran:
                                </span>
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={dosage.amount}
                                  onChange={(e) => handleUpdateNewRecipeDosage(m.id, e.target.value, dosage.unit)}
                                  className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-amber-300 text-right focus:outline-none focus:border-amber-500"
                                />
                                <div className="flex rounded overflow-hidden border border-slate-700 bg-slate-900 p-0.5 text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateNewRecipeDosage(m.id, dosage.amount, 'kg')}
                                    className={`px-1.5 py-0.5 rounded font-bold transition ${
                                      dosage.unit === 'kg'
                                        ? 'bg-amber-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    kg
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateNewRecipeDosage(m.id, dosage.amount, 'gr')}
                                    className={`px-1.5 py-0.5 rounded font-bold transition ${
                                      dosage.unit === 'gr'
                                        ? 'bg-cyan-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                    }`}
                                  >
                                    gr
                                  </button>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                                  ({amountInKg.toFixed(4)} kg)
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingRecipe(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-amber-600/20 transition active:scale-95"
                >
                  {newRecipeSelectedMatIds.length > 0
                    ? `Simpan Resep & ${newRecipeSelectedMatIds.length} Material Sekaligus`
                    : 'Simpan Master Resep'}
                </button>
              </div>
            </form>
          )}

          {/* Selector 1: Target WIP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                1. Pilih Target Produk WIP *
              </label>
              <select
                value={recipeWipId}
                onChange={(e) => setRecipeWipId(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-medium"
              >
                <option value="">-- Pilih Produk WIP --</option>
                {state.master.wips.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} (Batch Basis: {w.batchWeightKg.toFixed(4)} kg)
                  </option>
                ))}
              </select>
            </div>

            {/* Selector 2: Pilih Resep dari WIP */}
            <div>
              <label className="block text-[11px] font-medium text-slate-300 mb-1">
                2. Pilih Resep Formulasi Acuan WIP *
              </label>
              {(() => {
                const recipesForWip = (state.master.recipes || []).filter(r => r.wipId === recipeWipId);
                return (
                  <select
                    value={selectedRecipeId}
                    onChange={(e) => setSelectedRecipeId(e.target.value)}
                    disabled={!recipeWipId || recipesForWip.length === 0}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500 font-medium disabled:opacity-50"
                  >
                    {recipesForWip.length === 0 ? (
                      <option value="">-- Belum ada resep, klik "+ Buat Resep Baru" --</option>
                    ) : (
                      <>
                        <option value="">-- Pilih Resep Formulasi --</option>
                        {recipesForWip.map(r => (
                          <option key={r.id} value={r.id}>
                            [{r.recipeCode}] {r.recipeName} ({r.totalWeightKg.toFixed(4)} kg / batch) {r.isDefault ? '★' : ''}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                );
              })()}
            </div>
          </div>

          {/* Active Recipe Details & Add Material Section */}
          {(() => {
            const currentWip = state.master.wips.find(w => w.id === recipeWipId);
            const activeRecipe = (state.master.recipes || []).find(r => r.id === selectedRecipeId);

            if (!recipeWipId) {
              return (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-slate-400 text-xs">
                  Silakan pilih Target Produk WIP di atas terlebih dahulu.
                </div>
              );
            }

            if (!activeRecipe) {
              return (
                <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-slate-400 text-xs space-y-2">
                  <p>Belum ada resep yang dipilih untuk <strong>{currentWip?.name}</strong>.</p>
                  <button
                    type="button"
                    onClick={() => setIsCreatingRecipe(true)}
                    className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Buat Resep Pertama untuk WIP Ini</span>
                  </button>
                </div>
              );
            }

            // Calculate percentage match
            const targetWeight = currentWip ? currentWip.batchWeightKg : 0;
            const variance = activeRecipe.totalWeightKg - targetWeight;
            const isMatch = Math.abs(variance) < 0.001;

            return (
              <div className="space-y-4">
                {/* Active Recipe Summary Header */}
                <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                        {activeRecipe.recipeCode}
                      </span>
                      <h4 className="font-bold text-white text-sm">{activeRecipe.recipeName}</h4>
                      {activeRecipe.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded font-semibold">
                          Resep Utama
                        </span>
                      )}
                    </div>
                    {activeRecipe.description && (
                      <p className="text-[11px] text-slate-400 mt-1">{activeRecipe.description}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    <div className="text-right mr-1">
                      <span className="text-[10px] text-slate-400 block">Total Bobot Resep:</span>
                      <span className="font-mono font-bold text-sm text-cyan-400">
                        {activeRecipe.totalWeightKg.toFixed(4)} kg / batch
                      </span>
                      <span className={`text-[10px] font-mono block ${isMatch ? 'text-emerald-400' : 'text-amber-400'}`}>
                        Target WIP: {targetWeight.toFixed(4)} kg {isMatch ? '✓ Sesuai' : `(Selisih: ${variance > 0 ? '+' : ''}${variance.toFixed(4)} kg)`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartEditRecipe(activeRecipe)}
                      title="Edit Kode, Nama, dan Keterangan Resep"
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-semibold border border-slate-700 transition active:scale-95 shadow"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Resep</span>
                    </button>

                    {onDeleteRecipe && (
                      <button
                        type="button"
                        onClick={() => setDeleteRecipeTarget(activeRecipe)}
                        title="Hapus Resep Formulasi ini"
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold border border-rose-500/20 transition active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Hapus</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Pilihan Mode Input: Multi-Select (Pilih Banyak Sekaligus) vs Input Satuan */}
                <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                        <CheckSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white block">
                          Input Material Database ke Resep [{activeRecipe.recipeCode}]
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Pilih beberapa material sekaligus agar praktis dan tidak perlu input satu per satu
                        </span>
                      </div>
                    </div>

                    {/* Mode Toggle Tabs */}
                    <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-900 p-0.5 text-xs self-start sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => setRecipeInputMode('multi')}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                          recipeInputMode === 'multi'
                            ? 'bg-cyan-600 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        <span>Pilih Banyak (Multi-Select)</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-900/60 text-cyan-200 border border-cyan-400/30 hidden sm:inline">
                          Rekomendasi
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRecipeInputMode('single')}
                        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg font-semibold transition ${
                          recipeInputMode === 'single'
                            ? 'bg-slate-700 text-white shadow-xs'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Satu per Satu</span>
                      </button>
                    </div>
                  </div>

                  {/* MODE 1: MULTI-SELECT MATERIAL (PILIH BANYAK SEKALIGUS) */}
                  {recipeInputMode === 'multi' ? (
                    <div className="space-y-3">
                      {/* Search, Filter & Quick Action Bar */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                        {/* Search Input */}
                        <div className="relative flex-1 max-w-sm">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            type="text"
                            value={multiMatSearch}
                            onChange={(e) => setMultiMatSearch(e.target.value)}
                            placeholder="Cari nama, kode material, kemasan..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        {/* Category Filter and Select All / Deselect All */}
                        <div className="flex items-center space-x-1.5 overflow-x-auto">
                          {(['all', 'padat', 'bubuk', 'liquid'] as const).map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setMultiMatTypeFilter(t)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition ${
                                multiMatTypeFilter === t
                                  ? 'bg-cyan-600 text-white shadow-xs'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {t === 'all' ? 'Semua' : t}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => {
                              const sNorm = multiMatSearch.trim().toLowerCase();
                              const filteredList = state.master.materials.filter(m => {
                                const matchSearch = !sNorm ||
                                  m.name.toLowerCase().includes(sNorm) ||
                                  (m.code && m.code.toLowerCase().includes(sNorm)) ||
                                  m.packaging.toLowerCase().includes(sNorm);
                                const matchType = multiMatTypeFilter === 'all' || m.type === multiMatTypeFilter;
                                return matchSearch && matchType;
                              });
                              handleSelectAllMaterials(filteredList);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-semibold transition border border-slate-700 shrink-0"
                          >
                            Pilih Semua
                          </button>

                          <button
                            type="button"
                            onClick={handleDeselectAllMaterials}
                            disabled={selectedMaterialIds.length === 0}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-semibold transition border border-slate-700 disabled:opacity-40 shrink-0"
                          >
                            Batal ({selectedMaterialIds.length})
                          </button>
                        </div>
                      </div>

                      {/* Material Checklist Grid */}
                      <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-800/60">
                        {(() => {
                          const sNorm = multiMatSearch.trim().toLowerCase();
                          const filteredList = state.master.materials.filter(m => {
                            const matchSearch = !sNorm ||
                              m.name.toLowerCase().includes(sNorm) ||
                              (m.code && m.code.toLowerCase().includes(sNorm)) ||
                              m.packaging.toLowerCase().includes(sNorm);
                            const matchType = multiMatTypeFilter === 'all' || m.type === multiMatTypeFilter;
                            return matchSearch && matchType;
                          });

                          if (filteredList.length === 0) {
                            return (
                              <div className="py-8 text-center text-slate-500 text-xs">
                                Tidak ada material database yang sesuai dengan kata kunci atau filter tipe.
                              </div>
                            );
                          }

                          return filteredList.map(m => {
                            const isSelected = selectedMaterialIds.includes(m.id);
                            const existingInRecipe = (activeRecipe.items || []).find(it => it.materialId === m.id);
                            const dosage = multiMaterialDosages[m.id] || (existingInRecipe ? { amount: String(existingInRecipe.amount), unit: existingInRecipe.unit } : getDefaultDosage(m.id));
                            const amountVal = parseFloat(dosage.amount) || 0;
                            const amountInKg = dosage.unit === 'gr' ? amountVal / 1000 : amountVal;

                            return (
                              <div
                                key={m.id}
                                className={`p-2.5 rounded-xl border transition ${
                                  isSelected
                                    ? 'bg-cyan-500/10 border-cyan-500/40 shadow-xs'
                                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                  {/* Checkbox & Material Details */}
                                  <div
                                    onClick={() => handleToggleMaterialSelect(m.id)}
                                    className="flex items-start space-x-2.5 cursor-pointer flex-1"
                                  >
                                    <button
                                      type="button"
                                      className="mt-0.5 text-cyan-400 shrink-0"
                                      aria-label={isSelected ? 'Hapus pilihan' : 'Pilih material'}
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="w-4 h-4 text-cyan-400" />
                                      ) : (
                                        <Square className="w-4 h-4 text-slate-500" />
                                      )}
                                    </button>

                                    <div>
                                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                        {m.code && (
                                          <span className="font-mono text-[10px] font-bold text-cyan-300 bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700">
                                            {m.code}
                                          </span>
                                        )}
                                        <span className="font-semibold text-white text-xs">{m.name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                          m.type === 'padat'
                                            ? 'bg-amber-500/20 text-amber-300'
                                            : m.type === 'liquid'
                                            ? 'bg-cyan-500/20 text-cyan-300'
                                            : 'bg-emerald-500/20 text-emerald-300'
                                        }`}>
                                          {m.type}
                                        </span>
                                        {existingInRecipe && (
                                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                                            Sudah di resep ({existingInRecipe.amount} {existingInRecipe.unit})
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-400 mt-0.5">
                                        Supplier: <span className="text-slate-300 font-medium">{m.source}</span> | Kemasan: <span className="text-slate-300 font-medium">{m.packaging} ({m.weightKg.toFixed(4)} kg)</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Dosage Control Row (Active when checked) */}
                                  {isSelected && (
                                    <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto bg-slate-950/80 p-1.5 rounded-xl border border-cyan-500/30">
                                      <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                                        Takaran Resep:
                                      </span>
                                      <input
                                        type="number"
                                        step="0.0001"
                                        value={dosage.amount}
                                        onChange={(e) => handleUpdateMultiDosage(m.id, e.target.value, dosage.unit)}
                                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold text-cyan-400 text-right focus:outline-none focus:border-cyan-500"
                                      />
                                      <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-900 p-0.5 text-[10px]">
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateMultiDosage(m.id, dosage.amount, 'kg')}
                                          className={`px-2 py-0.5 rounded font-bold transition ${
                                            dosage.unit === 'kg'
                                              ? 'bg-cyan-600 text-white'
                                              : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          kg
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateMultiDosage(m.id, dosage.amount, 'gr')}
                                          className={`px-2 py-0.5 rounded font-bold transition ${
                                            dosage.unit === 'gr'
                                              ? 'bg-amber-600 text-white'
                                              : 'text-slate-400 hover:text-white'
                                          }`}
                                        >
                                          gr
                                        </button>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono hidden md:inline">
                                        ({amountInKg.toFixed(4)} kg)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>

                      {/* Bottom Submit Action Bar */}
                      {(() => {
                        let totalBatchAddKg = 0;
                        selectedMaterialIds.forEach(id => {
                          const dose = multiMaterialDosages[id] || getDefaultDosage(id);
                          const val = parseFloat(dose.amount) || 0;
                          totalBatchAddKg += dose.unit === 'gr' ? val / 1000 : val;
                        });

                        return (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                            <div className="text-xs text-slate-300 font-mono">
                              {selectedMaterialIds.length > 0 ? (
                                <span>
                                  Terpilih: <strong className="text-cyan-400 font-bold">{selectedMaterialIds.length} Material</strong> | Total Takaran Tambahan: <strong className="text-white font-bold">{totalBatchAddKg.toFixed(4)} kg</strong> / batch
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  Centang kotak pada material di atas untuk memilih banyak bahan sekaligus.
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={handleSubmitMultipleMaterialsToRecipe}
                              disabled={selectedMaterialIds.length === 0}
                              className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-amber-600 hover:from-cyan-500 hover:to-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-cyan-600/20 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center space-x-2"
                            >
                              <Plus className="w-4 h-4" />
                              <span>
                                {selectedMaterialIds.length > 0
                                  ? `+ Masukkan ${selectedMaterialIds.length} Material ke Resep Sekaligus`
                                  : 'Pilih Material di Atas'}
                              </span>
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    /* MODE 2: SINGLE INPUT FORM (SATU PER SATU) */
                    <form onSubmit={handleAddMaterialToRecipeSubmit} className="space-y-3 pt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
                        {/* Material Select */}
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Pilih Material dari Database *
                          </label>
                          <select
                            value={recipeMatId}
                            onChange={(e) => handleRecipeMaterialSelect(e.target.value)}
                            required
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500 font-medium"
                          >
                            <option value="">-- Pilih Material Database --</option>
                            {state.master.materials.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.code ? `[${m.code}] ` : ''}{m.name} [{m.type.toUpperCase()}] ({m.source}) | Kemasan: {m.packaging} ({m.weightKg.toFixed(4)} kg)
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Takaran Input */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Takaran per Batch *
                          </label>
                          <input
                            type="number"
                            step="0.0001"
                            value={recipeMatAmount}
                            onChange={(e) => setRecipeMatAmount(e.target.value)}
                            required
                            placeholder="0.0000"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        {/* Unit Select (kg vs gr) */}
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-medium text-slate-300 mb-1">
                            Satuan Resep
                          </label>
                          <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800 p-0.5">
                            <button
                              type="button"
                              onClick={() => setRecipeMatUnit('kg')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                                recipeMatUnit === 'kg'
                                  ? 'bg-cyan-600 text-white shadow'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              kg / batch
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecipeMatUnit('gr')}
                              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                                recipeMatUnit === 'gr'
                                  ? 'bg-amber-600 text-white shadow'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              gr / batch
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Conversion Live Preview & Submit */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-slate-400 font-mono">
                          {recipeMatAmount && !isNaN(parseFloat(recipeMatAmount)) ? (
                            <span>
                              Konversi Formulasi: <strong className="text-white">{parseFloat(recipeMatAmount)} {recipeMatUnit}</strong> = <strong className="text-cyan-400">{(recipeMatUnit === 'gr' ? parseFloat(recipeMatAmount) / 1000 : parseFloat(recipeMatAmount)).toFixed(4)} kg</strong> per batch WIP
                            </span>
                          ) : (
                            <span>Masukkan takaran material dalam kg atau gr per 1 batch WIP</span>
                          )}
                        </div>

                        <button
                          type="submit"
                          className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-amber-600 hover:from-cyan-500 hover:to-amber-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-95 shrink-0"
                        >
                          + Tambahkan 1 Material ke Resep
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Table of Materials in this Recipe */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider px-1">
                    <span>Komponen Material dalam Resep ({activeRecipe.items?.length || 0} Bahan)</span>
                    <span>Total Berat: {activeRecipe.totalWeightKg.toFixed(4)} kg</span>
                  </div>

                  {activeRecipe.items && activeRecipe.items.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeRecipe.items.map((it, idx) => {
                        const matObj = state.master.materials.find(m => m.id === it.materialId);
                        const pct = targetWeight > 0 ? (it.amountKg / targetWeight) * 100 : 0;
                        const matType = it.materialType || matObj?.type || 'bubuk';

                        const typeColor =
                          matType === 'padat'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : matType === 'liquid'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

                        return (
                          <div
                            key={it.id || idx}
                            className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                          >
                            <div className="flex items-center space-x-2.5 truncate mr-2">
                              <span className="text-slate-500 font-mono text-[10px] w-4">{idx + 1}.</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-bold border ${typeColor}`}>
                                {matType}
                              </span>
                              <span className="text-slate-200 font-medium truncate">
                                {it.materialName || matObj?.name}
                              </span>
                              {it.materialCode && (
                                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-950 border border-sky-300 shrink-0">
                                  [{it.materialCode}]
                                </span>
                              )}
                            </div>

                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-[11px] font-mono text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                {it.amount} {it.unit}
                              </span>
                              <span className="text-xs font-mono font-bold text-cyan-400">
                                {it.amountKg.toFixed(4)} kg
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono w-12 text-right">
                                {pct.toFixed(1)}%
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEditRecipeItem(activeRecipe.id, it)}
                                title="Edit takaran material ini"
                                className="text-cyan-400 hover:text-cyan-300 p-1 rounded hover:bg-cyan-500/10 transition"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {onDeleteMaterialFromRecipe && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteMaterialFromRecipe(activeRecipe.id, it.id)}
                                  title="Hapus material dari resep ini"
                                  className="text-rose-400 hover:text-rose-300 p-1 rounded hover:bg-rose-500/10 transition"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-slate-500 text-xs italic">
                      Resep ini belum memiliki komponen bahan. Pilih material database di atas untuk menambahkan bahan padat, bubuk, atau liquid.
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Step 5: Visualisasi BOM Hierarki Profesional */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Visualisasi BOM Hierarki Profesional (SKU &rarr; WIP Terpisah &rarr; Material Database)
              </h3>
              <p className="text-[11px] text-slate-400">
                Pohon relasi formulasi berjenjang dengan presisi 4 desimal industri
              </p>
            </div>
          </div>
          <span className="text-[11px] px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg">
            Standar ISO / GMP Manufacturing
          </span>
        </div>

        {/* Hierarchical Cards */}
        <div className="space-y-4">
          {state.master.skus.length > 0 ? (
            state.master.skus.map(sku => {
              const skuWipComps = state.master.skuWips.filter(sw => sw.skuId === sku.id);

              return (
                <div
                  key={sku.id}
                  className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3 shadow-inner"
                >
                  {/* SKU Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
                        SKU
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-sm text-white">{sku.name}</h4>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            sku.isKite
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {sku.isKite ? 'KITE Ekspor' : 'Domestik'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Bobot: <strong>{sku.cartonWeightKg.toFixed(4)} kg/karton</strong> • Target Produksi: <strong>{sku.targetHour} karton/jam</strong>
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/40 px-2.5 py-1 rounded-lg border border-cyan-500/20 self-start sm:self-auto">
                      Hierarki Induk Tingkat 1
                    </span>
                  </div>

                  {/* WIP Components under this SKU */}
                  <div className="space-y-3 pt-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Komponen WIP Terpisah (kg WIP per karton SKU):
                    </p>

                    {skuWipComps.length > 0 ? (
                      skuWipComps.map(sw => {
                        const wObj = state.master.wips.find(w => w.id === sw.wipId);
                        const wipMatComps = state.master.wipMats.filter(wm => wm.wipId === sw.wipId);
                        const assignedMachineIds = wObj?.assignedMachineIds && wObj.assignedMachineIds.length > 0
                          ? wObj.assignedMachineIds
                          : wObj?.assignedMachineId ? [wObj.assignedMachineId] : [];
                        const assignedMachs = state.master.machines.filter(m => assignedMachineIds.includes(m.id));

                        // Calculate total weight of materials in 1 batch
                        const totalFormulaBatchWeight = wipMatComps.reduce(
                          (acc, curr) => acc + curr.materialKgPerBatch,
                          0
                        );

                        return (
                          <div
                            key={sw.id}
                            className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3 shadow-md"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800/80 gap-2">
                              <div className="flex items-center space-x-2.5">
                                <div className="p-1 rounded-lg bg-amber-500/10 text-amber-400">
                                  <Layers className="w-4 h-4" />
                                </div>
                                <div>
                                  <span className="font-bold text-white text-xs sm:text-sm">
                                    WIP Terpisah: {wObj ? wObj.name : 'WIP'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block">
                                    Basis 1 Batch Formulasi: {wObj?.batchWeightKg.toFixed(4)} kg
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center space-x-3 self-end sm:self-auto">
                                <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                                  {sw.kgWipPerCartonSku.toFixed(4)} kg WIP / ktn SKU
                                </span>
                                <button
                                  onClick={() => onDeleteSkuWip(sw.id)}
                                  title="Hapus relasi WIP ke SKU"
                                  className="text-rose-400 hover:text-rose-300 p-1 text-xs"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Multi-Mesin Produksi Strip for this WIP */}
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-slate-400 font-semibold uppercase text-[10px] flex items-center space-x-1">
                                  <Cpu className="w-3 h-3 text-cyan-400" />
                                  <span>Mesin Pengolah WIP:</span>
                                </span>
                                {assignedMachs.length > 0 ? (
                                  assignedMachs.map(m => (
                                    <span
                                      key={m.id}
                                      className="px-2 py-0.5 rounded-lg bg-sky-100 text-sky-950 border border-sky-300 font-mono text-[10px] font-bold flex items-center space-x-1 shadow-xs"
                                      title={`${m.code} - ${m.name} (${m.line})`}
                                    >
                                      <span className="font-extrabold text-sky-950 bg-sky-200/80 px-1 py-0.2 rounded border border-sky-300">{m.code}</span>
                                      <span className="text-slate-800 truncate max-w-[110px] font-medium">{m.name}</span>
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-slate-500 text-[10px] italic">
                                    Belum dihubungkan ke mesin master
                                  </span>
                                )}
                              </div>

                              {wObj && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditWip(wObj)}
                                  className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 transition text-[10px]"
                                  title="Konfigurasi multi-mesin yang diizinkan untuk WIP ini"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Kelola Mesin ({assignedMachs.length})</span>
                                </button>
                              )}
                            </div>

                            {/* Level 3 & Level 4: Resep Formulasi WIP & Material Database */}
                            {(() => {
                              const wipRecipes = (state.master.recipes || []).filter(r => r.wipId === sw.wipId);

                              if (wipRecipes.length > 0) {
                                return (
                                  <div className="pl-3 sm:pl-4 border-l-2 border-amber-500/30 space-y-3">
                                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                      <span className="flex items-center space-x-1.5 text-amber-400">
                                        <Sparkles className="w-3 h-3" />
                                        <span>Hierarki Level 3: Resep Formulasi WIP ({wipRecipes.length} Resep Terdaftar)</span>
                                      </span>
                                      <span className="text-[10px] text-slate-500 normal-case">
                                        Acuan BOM: Resep &rarr; Acuan Resep: Material
                                      </span>
                                    </div>

                                    <div className="space-y-2.5">
                                      {wipRecipes.map(recipe => (
                                        <div
                                          key={recipe.id}
                                          className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2 hover:border-slate-700 transition"
                                        >
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800/60 gap-1.5">
                                            <div className="flex items-center space-x-2">
                                              <span className="px-2 py-0.5 rounded font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 text-[11px]">
                                                {recipe.recipeCode}
                                              </span>
                                              <span className="text-white font-bold text-xs">
                                                {recipe.recipeName}
                                              </span>
                                              {recipe.isDefault && (
                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-semibold">
                                                  Default
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center space-x-2 text-[11px] font-mono">
                                              <span className="text-slate-400">Total Berat:</span>
                                              <span className="text-cyan-400 font-bold">
                                                {recipe.totalWeightKg.toFixed(4)} kg / batch
                                              </span>
                                            </div>
                                          </div>

                                          {/* Level 4: Material List inside this recipe */}
                                          <div className="space-y-1.5 pl-2 sm:pl-3 border-l-2 border-cyan-500/30">
                                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                                              Hierarki Level 4: Komponen Material Database ({recipe.items?.length || 0} Bahan)
                                            </span>

                                            {recipe.items && recipe.items.length > 0 ? (
                                              <div className="grid grid-cols-1 gap-1">
                                                {recipe.items.map((it, itIdx) => {
                                                  const mObj = state.master.materials.find(m => m.id === it.materialId);
                                                  const matType = it.materialType || mObj?.type || 'bubuk';
                                                  const percentage = wObj && wObj.batchWeightKg > 0
                                                    ? (it.amountKg / wObj.batchWeightKg) * 100
                                                    : 0;

                                                  const typeBadgeColor =
                                                    matType === 'padat'
                                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                                      : matType === 'liquid'
                                                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

                                                  return (
                                                    <div
                                                      key={it.id || itIdx}
                                                      className="bg-slate-900/80 border border-slate-800/80 p-2 rounded-lg flex items-center justify-between text-xs"
                                                    >
                                                      <div className="flex items-center space-x-2 truncate mr-2">
                                                        <span className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold border ${typeBadgeColor}`}>
                                                          {matType}
                                                        </span>
                                                        <span className="text-slate-200 font-medium truncate">
                                                          {it.materialName || mObj?.name}
                                                        </span>
                                                        {it.materialCode && (
                                                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-950 border border-sky-300 shrink-0">
                                                            [{it.materialCode}]
                                                          </span>
                                                        )}
                                                      </div>

                                                      <div className="flex items-center space-x-2.5 shrink-0 text-xs font-mono">
                                                        <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-[10px]">
                                                          {it.amount} {it.unit}
                                                        </span>
                                                        <span className="text-cyan-400 font-bold">
                                                          {it.amountKg.toFixed(4)} kg
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 w-10 text-right">
                                                          {percentage.toFixed(1)}%
                                                        </span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <p className="text-[10px] text-slate-500 italic py-0.5">
                                                Resep ini belum memiliki material formulasi.
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }

                              // Fallback if no recipes exist yet but legacy wipMatComps exist
                              if (wipMatComps.length > 0) {
                                return (
                                  <div className="pl-3 sm:pl-4 border-l-2 border-amber-500/30 space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                      <span>Komposisi Database Material 1 Batch WIP:</span>
                                      <span className="font-mono text-cyan-400 normal-case">
                                        Total Formula: {totalFormulaBatchWeight.toFixed(4)} kg
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-1.5">
                                      {wipMatComps.map(wm => {
                                        const mObj = state.master.materials.find(m => m.id === wm.materialId);
                                        const percentageOfBatch = wObj && wObj.batchWeightKg > 0
                                          ? (wm.materialKgPerBatch / wObj.batchWeightKg) * 100
                                          : 0;

                                        return (
                                          <div
                                            key={wm.id}
                                            className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                                          >
                                            <div className="flex items-center space-x-2 truncate mr-2">
                                              <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                              <span className="text-slate-200 font-medium truncate">
                                                {mObj ? mObj.name : 'Material'}
                                              </span>
                                              <span className="text-[10px] text-slate-400">
                                                ({mObj?.type} - {mObj?.source})
                                              </span>
                                            </div>
                                            <div className="flex items-center space-x-3 shrink-0">
                                              <span className="text-[10px] text-slate-400 font-mono">
                                                {percentageOfBatch.toFixed(1)}%
                                              </span>
                                              <span className="font-mono text-cyan-400 font-bold text-xs">
                                                {wm.materialKgPerBatch.toFixed(4)} kg / batch
                                              </span>
                                              <button
                                                onClick={() => onDeleteWipMat(wm.id)}
                                                title="Hapus relasi Material ke WIP"
                                                className="text-rose-400 hover:text-rose-300 p-1"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div className="pl-3 sm:pl-4 border-l-2 border-slate-800 py-1">
                                  <p className="text-[11px] text-slate-500 italic">
                                    Belum ada resep formulasi yang dibuat untuk WIP ini. Buat resep pada bagian B di atas.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[11px] text-slate-500 italic py-2">
                        Belum ada jenis WIP terpisah yang diikat ke SKU ini. Gunakan formulir bagian A di atas.
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-slate-500 text-xs">
              Belum ada konfigurasi hierarki BOM. Silakan tambahkan SKU, WIP, dan Material melalui form di atas.
            </div>
          )}
        </div>
      </div>
    </div>
  )}

    {/* SUB-TAB 2: MASTER MESIN PRODUKSI */}
    {activeSubTab === 'MACHINES' && (
      <div className="space-y-6">
        {/* Banner Info */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-indigo-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-indigo-300 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Master List Mesin Produksi</h4>
              <p className="text-[11px] text-indigo-200/80">
                Daftar mesin pengolah utama (Mixer, Cooker, Extruder, Enrober) yang menghasilkan WIP. Data mesin ini akan menjadi pilihan dropdown saat mengonfigurasi WIP pada BOM.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                  onOpenAdminModal();
                  showToast('Otorisasi Administrator diperlukan untuk impor data mesin', true);
                  return;
                }
                setIsMachineImportOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition active:scale-95"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Mesin (Drive & Storage)</span>
            </button>
            <span className="px-2.5 py-1 bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-bold rounded-lg text-[10px] shrink-0">
              {state.master.machines.length} Mesin Aktif
            </span>
          </div>
        </div>

        {/* Form Tambah Mesin */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Wrench className="w-4 h-4 text-cyan-400" />
              <span>Tambah Mesin Produksi Baru</span>
            </h3>
            <span className="text-xs text-slate-400">Master Plant Machinery</span>
          </div>

          <form onSubmit={handleMachineSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kode Mesin *</label>
                <input
                  type="text"
                  value={machCode}
                  onChange={(e) => setMachCode(e.target.value)}
                  required
                  placeholder="e.g. MX-02, ENR-02"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Nama Mesin *</label>
                <input
                  type="text"
                  value={machName}
                  onChange={(e) => setMachName(e.target.value)}
                  required
                  placeholder="e.g. High-Speed Planetary Mixer"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Line Produksi *</label>
                <input
                  type="text"
                  value={machLine}
                  onChange={(e) => setMachLine(e.target.value)}
                  required
                  placeholder="e.g. Line 1 (Biskuit Domestik)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kapasitas (kg / jam) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={machCapacity}
                  onChange={(e) => setMachCapacity(e.target.value)}
                  required
                  placeholder="800"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status Operasional</label>
                <select
                  value={machStatus}
                  onChange={(e) => setMachStatus(e.target.value as 'OPERATIONAL' | 'STANDBY' | 'MAINTENANCE')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="OPERATIONAL">OPERATIONAL (Aktif Beroperasi)</option>
                  <option value="STANDBY">STANDBY (Siaga)</option>
                  <option value="MAINTENANCE">MAINTENANCE (Pemeliharaan)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Operator Penanggung Jawab</label>
                <input
                  type="text"
                  value={machOperator}
                  onChange={(e) => setMachOperator(e.target.value)}
                  placeholder="e.g. Supriyadi (Shift 1)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Catatan Teknis / Jalur Pipa Transfer</label>
              <input
                type="text"
                value={machNotes}
                onChange={(e) => setMachNotes(e.target.value)}
                placeholder="e.g. Terhubung ke Holding Tank HT-01 melalui jalur pipa sanitasi"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30 flex items-center space-x-2 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Mesin ke Database Master</span>
              </button>
            </div>
          </form>
        </div>

        {/* Header & Changeover Control Bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-slate-400 gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold uppercase tracking-wider text-[11px] text-white">
                  Daftar Mesin Produksi & Opsi Changeover
                </span>
                {state.master.machines.filter(m => m.status === 'CHANGEOVER').length > 0 && (
                  <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold animate-pulse">
                    <RotateCw className="w-3 h-3 animate-spin" />
                    <span>{state.master.machines.filter(m => m.status === 'CHANGEOVER').length} Sedang Changeover</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Kontrol pergantian formula produk, sanitasi jalur pipa, dan audit log downtime mesin
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setHistorySelectedMachineId(null);
                  setIsChangeoverHistoryOpen(true);
                }}
                className="text-[11px] text-cyan-300 hover:text-white flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-800 hover:bg-cyan-900/60 transition active:scale-95 shadow-md shadow-cyan-950"
                title="Buka seluruh riwayat changeover & verifikasi QC pabrik"
              >
                <History className="w-3.5 h-3.5 text-cyan-400" />
                <span>Audit Log Changeover</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                    onOpenAdminModal();
                    showToast('Otorisasi Administrator diperlukan untuk impor data mesin', true);
                    return;
                  }
                  setIsMachineImportOpen(true);
                }}
                className="text-[11px] text-indigo-300 hover:text-white flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-800 hover:bg-indigo-900/60 transition active:scale-95"
                title="Impor master mesin dari CSV/JSON lokal atau Google Drive"
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                <span>Import Mesin</span>
              </button>
              <span className="font-mono text-slate-400 text-xs px-1">
                {state.master.machines.length} Unit Mesin
              </span>
            </div>
          </div>

          {/* Quick Filter Tabs for Machine Status */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <button
              onClick={() => setMachineStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                machineStatusFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              Semua ({state.master.machines.length})
            </button>
            <button
              onClick={() => setMachineStatusFilter('OPERATIONAL')}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                machineStatusFilter === 'OPERATIONAL'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              Operasional ({state.master.machines.filter(m => m.status === 'OPERATIONAL').length})
            </button>
            <button
              onClick={() => setMachineStatusFilter('CHANGEOVER')}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                machineStatusFilter === 'CHANGEOVER'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              Sedang Changeover ({state.master.machines.filter(m => m.status === 'CHANGEOVER').length})
            </button>
            <button
              onClick={() => setMachineStatusFilter('STANDBY')}
              className={`px-3 py-1.5 rounded-xl font-medium transition ${
                machineStatusFilter === 'STANDBY'
                  ? 'bg-slate-700 text-slate-200 border border-slate-600'
                  : 'text-slate-400 hover:text-white hover:bg-slate-850'
              }`}
            >
              Standby / Maint ({state.master.machines.filter(m => m.status === 'STANDBY' || m.status === 'MAINTENANCE').length})
            </button>
          </div>

          {/* Grid Mesin */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {state.master.machines
              .filter(m => {
                if (machineStatusFilter === 'ALL') return true;
                if (machineStatusFilter === 'OPERATIONAL') return m.status === 'OPERATIONAL';
                if (machineStatusFilter === 'CHANGEOVER') return m.status === 'CHANGEOVER';
                if (machineStatusFilter === 'STANDBY') return m.status === 'STANDBY' || m.status === 'MAINTENANCE';
                return true;
              })
              .map((mach) => {
                const linkedWips = state.master.wips.filter(w => w.assignedMachineId === mach.id);
                const activeWip = state.master.wips.find(w => w.id === mach.currentWipId);
                const isUndergoingChangeover = mach.status === 'CHANGEOVER';

                return (
                  <div
                    key={mach.id}
                    className={`bg-slate-900 border rounded-2xl p-4 shadow-xl flex flex-col justify-between transition ${
                      isUndergoingChangeover
                        ? 'border-amber-500/60 shadow-amber-950/40 bg-gradient-to-b from-slate-900 to-amber-950/20 ring-1 ring-amber-500/30'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top Header Card */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm font-extrabold text-sky-950 bg-sky-100 px-2.5 py-0.5 rounded-lg border border-sky-300 shadow-xs">
                              {mach.code}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                mach.status === 'CHANGEOVER'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse font-bold'
                                  : mach.status === 'OPERATIONAL'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : mach.status === 'STANDBY'
                                  ? 'bg-slate-700/50 text-slate-300 border border-slate-600'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {mach.status === 'CHANGEOVER' ? 'Sedang Changeover' : mach.status}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 mt-1.5">{mach.name}</h4>
                          <p className="text-[11px] text-slate-400">{mach.line}</p>
                        </div>

                        {onDeleteMachine && (
                          <button
                            onClick={() => onDeleteMachine(mach.id)}
                            className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                            title="Hapus Mesin"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Active Product Banner */}
                      <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 text-xs flex items-center justify-between my-2.5">
                        <div className="flex items-center space-x-2 truncate mr-2">
                          <Layers className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-[10px] text-slate-500 block uppercase font-semibold">Produk / WIP Aktif:</span>
                            <span className="text-white font-bold truncate block">
                              {activeWip ? activeWip.name : mach.currentWipName || 'Belum Ada Formula Terpilih'}
                            </span>
                          </div>
                        </div>
                        {activeWip && (
                          <span className="font-mono text-[10px] text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800 shrink-0">
                            {activeWip.batchWeightKg.toFixed(1)} kg/batch
                          </span>
                        )}
                      </div>

                      {/* Active Changeover Alert in Progress */}
                      {isUndergoingChangeover && mach.activeChangeover && (
                        <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-2.5 text-xs text-amber-200 mb-2.5 space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center space-x-1.5 text-amber-300">
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Sedang Proses Changeover</span>
                            </span>
                            <span className="font-mono text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                              ~{mach.activeChangeover.estimatedMinutes} Menit
                            </span>
                          </div>
                          <div className="text-[11px] text-amber-100 truncate">
                            Target Formula: <strong>{mach.activeChangeover.toWipName}</strong>
                          </div>
                          <div className="text-[10px] text-amber-300/80">
                            PIC: {mach.activeChangeover.operatorName} • Dimulai: {new Date(mach.activeChangeover.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                          </div>
                        </div>
                      )}

                      {/* Machinery Specs Info */}
                      <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800 text-xs space-y-1.5 my-2">
                        <div className="flex justify-between">
                          <span className="text-slate-400 text-[11px]">Kapasitas Produksi:</span>
                          <span className="font-mono text-white font-bold">{mach.capacityKgPerHour} kg/jam</span>
                        </div>
                        {mach.operatorAssigned && (
                          <div className="flex justify-between">
                            <span className="text-slate-400 text-[11px]">Operator PIC:</span>
                            <span className="text-slate-300 font-medium">{mach.operatorAssigned}</span>
                          </div>
                        )}
                        {mach.notes && (
                          <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-850">
                            {mach.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Area: Linked WIPs & Changeover Actions */}
                    <div className="space-y-3 pt-2">
                      <div className="border-t border-slate-800 text-[11px] pt-2">
                        <span className="text-slate-400 block mb-1">WIP yang Menggunakan Mesin Ini:</span>
                        {linkedWips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {linkedWips.map(w => (
                              <span
                                key={w.id}
                                className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium"
                              >
                                {w.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Belum ada WIP ditautkan ke mesin ini.</span>
                        )}
                      </div>

                      {/* Action Buttons: Changeover & History */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setHistorySelectedMachineId(mach.id);
                            setIsChangeoverHistoryOpen(true);
                          }}
                          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-[11px] font-medium transition active:scale-95"
                          title="Lihat riwayat switchover & clearance mesin ini"
                        >
                          <History className="w-3.5 h-3.5 text-slate-400" />
                          <span>Riwayat ({mach.changeoverHistory?.length || 0})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!state.isAdmin) {
                              onOpenAdminModal();
                              showToast('Otorisasi Administrator diperlukan untuk opsi changeover produk', true);
                              return;
                            }
                            setChangeoverModalMachine(mach);
                          }}
                          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-md active:scale-95 ${
                            isUndergoingChangeover
                              ? 'bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white shadow-amber-600/20 animate-pulse'
                              : 'bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white shadow-indigo-600/20'
                          }`}
                        >
                          <RotateCw className={`w-3.5 h-3.5 ${isUndergoingChangeover ? 'animate-spin' : ''}`} />
                          <span>{isUndergoingChangeover ? 'Lanjutkan Changeover' : 'Changeover Produk'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    )}

    {/* SUB-TAB 3: MASTER TANGKI WIP (HOLDING TANK & STORAGE TANK) */}
    {activeSubTab === 'TANKS' && (
      <div className="space-y-6">
        {/* Banner Info */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-cyan-300 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 shrink-0">
              <Cylinder className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-white text-sm">Master List Tangki WIP (Holding Tank & Storage Tank)</h4>
              <p className="text-[11px] text-cyan-200/80">
                Pusat data tangki penampung antara (Holding Tank) dan tangki penyimpanan kapasitas besar (Storage Tank). Isi tangki ini otomatis terpotong saat karton SKU diproduksi.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                  onOpenAdminModal();
                  showToast('Otorisasi Administrator diperlukan untuk impor data tangki WIP', true);
                  return;
                }
                setIsTankImportOpen(true);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 transition active:scale-95"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Import Tangki WIP (Drive & Storage)</span>
            </button>
            <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold rounded-lg text-[10px] shrink-0">
              {state.master.tanks.length} Tangki Terdaftar
            </span>
          </div>
        </div>

        {/* Form Tambah Tangki */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-sm text-white flex items-center space-x-2">
              <Cylinder className="w-4 h-4 text-cyan-400" />
              <span>Tambah Tangki WIP Baru</span>
            </h3>
            <span className="text-xs text-slate-400">Master Industrial Vessel</span>
          </div>

          <form onSubmit={handleTankSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kode Tangki *</label>
                <input
                  type="text"
                  value={tankCode}
                  onChange={(e) => setTankCode(e.target.value)}
                  required
                  placeholder="e.g. HT-04, ST-WIP-03"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Nama Tangki *</label>
                <input
                  type="text"
                  value={tankName}
                  onChange={(e) => setTankName(e.target.value)}
                  required
                  placeholder="e.g. Holding Tank Buffer Adonan #4"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tipe Tangki *</label>
                <select
                  value={tankTypeForm}
                  onChange={(e) => setTankTypeForm(e.target.value as WipTankType)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="HOLDING_TANK">Holding Tank (Penampung Antara Produksi)</option>
                  <option value="STORAGE_TANK">Storage Tank (Penyimpanan Kapasitas Besar)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kapasitas Maksimal (kg) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={tankCapacity}
                  onChange={(e) => setTankCapacity(e.target.value)}
                  required
                  placeholder="800"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Level Awal (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tankInitialLevel}
                  onChange={(e) => setTankInitialLevel(e.target.value)}
                  placeholder="400"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Suhu Standar (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tankTemp}
                  onChange={(e) => setTankTemp(e.target.value)}
                  placeholder="45.0"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status Agitator (Pengaduk)</label>
                <select
                  value={tankAgitator}
                  onChange={(e) => setTankAgitator(e.target.value as 'ON' | 'OFF')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ON">ON (Pengaduk Berputar)</option>
                  <option value="OFF">OFF (Tidak Aktif)</option>
                </select>
              </div>
            </div>

            {/* Row 2: 1 Jenis WIP Sama & Ambang Batas Alert */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-300 font-medium text-xs">
                    WIP yang Dialokasikan (1 Jenis WIP Sama)
                  </label>
                  <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                    Formula Tunggal
                  </span>
                </div>
                <select
                  value={tankAssignedWip}
                  onChange={(e) => setTankAssignedWip(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="">-- Kosong / Belum Dialokasikan --</option>
                  {state.master.wips.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.batchWeightKg} kg/batch)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  *Satu tangki hanya menampung 1 jenis WIP yang sama untuk menjaga kemurnian formula dan mencegah kontaminasi silang.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-300 font-medium text-xs">
                    Ambang Batas Alert Rendah (kg)
                  </label>
                  <span className="text-[10px] text-slate-400">Default: 20% Kapasitas</span>
                </div>
                <input
                  type="number"
                  step="1"
                  value={tankMinAlert}
                  onChange={(e) => setTankMinAlert(e.target.value)}
                  placeholder="100"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Alarm visual akan aktif jika isi tangki berada di bawah batas ini.
                </p>
              </div>
            </div>

            {/* Row 3: Multi-Mesin Pengisi (Pilihan lebih dari 1 mesin) */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <label className="text-xs font-bold text-white">
                    Pilihan Mesin Pengisi (Bisa Beberapa Unit Mesin)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/80 px-2.5 py-0.5 rounded-full border border-cyan-800">
                    {tankAssignedMachines.length} Mesin Pengisi Dipilih
                  </span>
                  <button
                    type="button"
                    onClick={() => setTankAssignedMachines(state.master.machines.map(m => m.id))}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-medium"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-600 text-xs">•</span>
                  <button
                    type="button"
                    onClick={() => setTankAssignedMachines([])}
                    className="text-[10px] text-slate-400 hover:text-white underline font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400">
                Pilih satu atau lebih mesin produksi yang menjadi sumber pengisian WIP ke dalam tangki ini. Semua mesin yang dipilih harus menghasilkan <strong>1 jenis WIP yang sama</strong> sesuai alokasi di atas.
              </p>

              {state.master.machines.length === 0 ? (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 text-center">
                  Belum ada master mesin. Silakan tambahkan mesin produksi di tab "Master Mesin Produksi".
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 max-h-48 overflow-y-auto no-scrollbar">
                  {state.master.machines.map((mach) => {
                    const isSelected = tankAssignedMachines.includes(mach.id);
                    return (
                      <div
                        key={mach.id}
                        onClick={() => {
                          if (isSelected) {
                            setTankAssignedMachines(prev => prev.filter(id => id !== mach.id));
                          } else {
                            setTankAssignedMachines(prev => [...prev, mach.id]);
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                          isSelected
                            ? 'bg-cyan-950/60 border-cyan-500/70 text-white shadow-md shadow-cyan-950'
                            : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                        }`}
                      >
                        <div className="truncate mr-2">
                          <div className="flex items-center space-x-1.5 truncate">
                            <span className="font-mono text-cyan-400 font-bold text-xs bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                              {mach.code}
                            </span>
                            <span className="truncate text-white font-medium">{mach.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate mt-1">
                            {mach.line} • {mach.capacityKgPerHour} kg/jam
                          </span>
                        </div>
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition ${
                          isSelected
                            ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold'
                            : 'border-slate-600 bg-slate-800'
                        }`}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-cyan-600/30 flex items-center space-x-2 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Tangki ke Database Master</span>
              </button>
            </div>
          </form>
        </div>

        {/* Daftar Tangki WIP */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Daftar Tangki WIP Terpasang</span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (state.currentUserRole !== 'ADMINISTRATOR' && !state.isAdmin) {
                    onOpenAdminModal();
                    showToast('Otorisasi Administrator diperlukan untuk impor data tangki WIP', true);
                    return;
                  }
                  setIsTankImportOpen(true);
                }}
                className="text-[11px] text-emerald-300 hover:text-white flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800 hover:bg-emerald-900/60 transition"
                title="Impor master tangki WIP dari CSV/JSON lokal atau Google Drive"
              >
                <UploadCloud className="w-3 h-3 text-emerald-400" />
                <span>Import Tangki</span>
              </button>
              <span className="font-mono">{state.master.tanks.length} Tangki</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {state.master.tanks.map((tank) => {
              const wip = state.master.wips.find(w => w.id === tank.assignedWipId);
              const mIds = tank.assignedMachineIds && tank.assignedMachineIds.length > 0
                ? tank.assignedMachineIds
                : tank.assignedMachineId ? [tank.assignedMachineId] : [];
              const assignedMachines = state.master.machines.filter(m => mIds.includes(m.id));
              const percent = tank.capacityKg > 0 ? (tank.currentLevelKg / tank.capacityKg) * 100 : 0;

              return (
                <div
                  key={tank.id}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm font-extrabold text-sky-950 bg-sky-100 px-2.5 py-0.5 rounded-lg border border-sky-300 shadow-xs">
                            {tank.code}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              tank.type === 'STORAGE_TANK'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {tank.type === 'STORAGE_TANK' ? 'Storage' : 'Holding'}
                          </span>
                        </div>
                        <h4 className="font-bold text-sm text-white mt-1.5">{tank.name}</h4>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        {onUpdateTank && (
                          <button
                            type="button"
                            onClick={() => handleStartEditTank(tank)}
                            className="text-cyan-400 hover:text-cyan-300 p-1.5 rounded-lg hover:bg-cyan-500/10 transition"
                            title="Edit Tangki & Mesin Pengisi"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                        {onDeleteTank && (
                          <button
                            type="button"
                            onClick={() => onDeleteTank(tank.id)}
                            className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition"
                            title="Hapus Tangki"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar & Level */}
                    <div className="space-y-1.5 my-3">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">Level Saat Ini:</span>
                        <span className="font-mono font-bold text-white">
                          {tank.currentLevelKg.toFixed(1)} / {tank.capacityKg.toFixed(0)} kg
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            percent < 20 ? 'bg-rose-500' : percent < 50 ? 'bg-amber-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${Math.min(100, percent)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>{percent.toFixed(1)}% Terisi</span>
                        <span>Alert: &lt; {tank.minAlertKg || (tank.capacityKg * 0.2).toFixed(0)} kg</span>
                      </div>
                    </div>

                    {/* Details Box */}
                    <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-[11px]">1 Jenis WIP:</span>
                        <span className="text-white font-semibold truncate max-w-[170px] text-right">
                          {wip ? wip.name : <em className="text-slate-500">Belum dialokasikan</em>}
                        </span>
                      </div>

                      {/* Connected Multi-Machines */}
                      <div className="pt-1 border-t border-slate-850 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-[11px] flex items-center space-x-1">
                            <Cpu className="w-3 h-3 text-cyan-400" />
                            <span>Mesin Pengisi:</span>
                          </span>
                          <span className="font-mono text-[10px] text-cyan-300 font-semibold bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                            {assignedMachines.length} Mesin Sumber
                          </span>
                        </div>
                        {assignedMachines.length > 0 ? (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {assignedMachines.map(m => (
                              <span
                                key={m.id}
                                className="px-1.5 py-0.5 bg-slate-900 border border-slate-700/80 text-slate-200 rounded text-[10px] font-mono flex items-center space-x-1"
                                title={`${m.code} - ${m.name} (${m.line})`}
                              >
                                <span className="font-extrabold text-sky-950 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300">{m.code}</span>
                                <span className="text-slate-400 truncate max-w-[85px]">{m.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-500 text-[10px] italic block">
                            Belum dihubungkan ke mesin pengisi
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between pt-1 border-t border-slate-850">
                        <span className="text-slate-400 text-[11px]">Suhu: {tank.temp !== undefined ? tank.temp : 45.0}°C</span>
                        <span className="text-slate-300 text-[11px]">Agitator: {tank.agitatorStatus || 'ON'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    )}

    {/* SUBTAB 4: PUSAT OTORITAS PENGGUNA (OPERATOR & MANAGEMENT) - ADMINISTRATOR ONLY */}
    {activeSubTab === 'USERS' && (
      <div className="space-y-5 animate-fadeIn">
        {/* Header Overview Banner */}
        <div className="bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-900 border border-amber-500/30 p-4 sm:p-5 rounded-2xl shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/20">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                  <span>Manajemen Otoritas & Akses Pengguna</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold uppercase">
                    Admin Hak Penuh
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Otoritas Administrator: Kelola pendaftaran & penghapusan operator lini produksi, serta kendalikan izin akses melihat bagi jajaran management.
                </p>
              </div>
            </div>

            {onOpenUserManagement && (
              <button
                type="button"
                onClick={onOpenUserManagement}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition flex items-center space-x-1.5 shrink-0"
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Buka Mode Dialog Cepat</span>
              </button>
            )}
          </div>

          {/* Metric KPI Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 text-xs">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block mb-0.5">Total Operator:</span>
              <span className="text-base sm:text-lg font-mono font-bold text-cyan-400">
                {state.registeredOperators?.length || 0} <span className="text-xs font-normal text-slate-400">Orang</span>
              </span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">
                ✓ {state.registeredOperators?.filter(o => o.status === 'ACTIVE').length || 0} Aktif Bekerja
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block mb-0.5">Sebaran Shift Operator:</span>
              <div className="text-xs font-mono font-semibold text-slate-200 mt-1 flex items-center space-x-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">S1: {state.registeredOperators?.filter(o => o.assignedShift === 1).length || 0}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">S2: {state.registeredOperators?.filter(o => o.assignedShift === 2).length || 0}</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-purple-300">S3: {state.registeredOperators?.filter(o => o.assignedShift === 3).length || 0}</span>
              </div>
              <span className="text-[10px] text-slate-500 block mt-1">3 Shift Produksi 24 Jam</span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block mb-0.5">Total Akun Management:</span>
              <span className="text-base sm:text-lg font-mono font-bold text-indigo-400">
                {state.registeredManagement?.length || 0} <span className="text-xs font-normal text-slate-400">Akun</span>
              </span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">
                ✓ {state.registeredManagement?.filter(m => m.hasViewAccess).length || 0} Izin Melihat Aktif
              </span>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block mb-0.5">Izin Dicabut / Nonaktif:</span>
              <span className="text-base sm:text-lg font-mono font-bold text-rose-400">
                {state.registeredManagement?.filter(m => !m.hasViewAccess).length || 0} <span className="text-xs font-normal text-slate-400">Terkunci</span>
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Read-Only Dashboard
              </span>
            </div>
          </div>
        </div>

        {/* Segment Selector: Operator, Management, Security */}
        <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveUserTab('OPERATORS')}
            className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
              activeUserTab === 'OPERATORS'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>1. Kelola Operator Produksi ({state.registeredOperators?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveUserTab('MANAGEMENT')}
            className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
              activeUserTab === 'MANAGEMENT'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>2. Izin Akses Management ({state.registeredManagement?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveUserTab('SECURITY')}
            className={`flex-1 min-w-[160px] py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 ${
              activeUserTab === 'SECURITY'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>3. Keamanan PIN Admin</span>
          </button>
        </div>

        {/* SEGMENT 1: PENGELOLAAN OPERATOR PRODUKSI & GUDANG */}
        {activeUserTab === 'OPERATORS' && (
          <div className="space-y-5">
            {/* Form Pendaftaran Operator Baru */}
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    <UserPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">Formulir Pendaftaran Operator Baru</h4>
                    <p className="text-[11px] text-slate-400">
                      Daftarkan operator untuk penugasan pada mesin pengisi, pembuatan WIP, atau penerimaan gudang.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={generateAutoNik}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-mono font-semibold border border-slate-700 transition"
                  title="Generate NIK otomatis"
                >
                  ⚡ Auto NIK
                </button>
              </div>

              <form onSubmit={handleOperatorSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Nama Operator */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Nama Lengkap Operator <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={opName}
                      onChange={(e) => setOpName(e.target.value)}
                      placeholder="e.g. Supriyadi Pratama, A.Md."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* NIK Operator */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Nomor Induk Karyawan (NIK) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={opNik}
                      onChange={(e) => setOpNik(e.target.value)}
                      placeholder="e.g. OPR-2026-009"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Shift Rutin */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Shift Penugasan <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={opShift}
                      onChange={(e) => setOpShift(Number(e.target.value) as 1 | 2 | 3)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value={1}>Shift 1 (07:01 - 15:00)</option>
                      <option value={2}>Shift 2 (15:01 - 23:00)</option>
                      <option value={3}>Shift 3 (23:01 - 07:00)</option>
                    </select>
                  </div>

                  {/* Line Penugasan */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Line / Area Penugasan Utama
                    </label>
                    <select
                      value={opLine}
                      onChange={(e) => setOpLine(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                    >
                      <option value="Line 1 (Biskuit Domestik)">Line 1 (Biskuit Domestik)</option>
                      <option value="Line 2 (Wafer Ekspor KITE)">Line 2 (Wafer Ekspor KITE)</option>
                      <option value="Line 3 (Crackers & Cookie)">Line 3 (Crackers & Cookie)</option>
                      <option value="Gudang Bahan Baku (CK & WINEROTO)">Gudang Bahan Baku (CK & WINEROTO)</option>
                      <option value="Gudang Tangki Liquid (Storage Tank)">Gudang Tangki Liquid (Storage Tank)</option>
                      <option value="Mixing & Pengisian Holding Tank">Mixing & Pengisian Holding Tank</option>
                    </select>
                  </div>

                  {/* Catatan / Kualifikasi Mesin */}
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Catatan Kualifikasi / Keterampilan Mesin
                    </label>
                    <input
                      type="text"
                      value={opNotes}
                      onChange={(e) => setOpNotes(e.target.value)}
                      placeholder="e.g. Sertifikasi Food Safety, Operator Mixer High-Shear, Operator CIP"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-600/25 active:scale-95 transition flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Daftarkan Operator Baru</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Tabel Daftar Operator Terdaftar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {/* Toolbar: Search & Filter */}
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/80">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-white">
                    Daftar Operator Terdaftar ({state.registeredOperators?.length || 0})
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Search box */}
                  <div className="relative flex-1 sm:w-56">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={opSearch}
                      onChange={(e) => setOpSearch(e.target.value)}
                      placeholder="Cari nama / NIK..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Filter Shift */}
                  <select
                    value={opShiftFilter}
                    onChange={(e) => setOpShiftFilter(e.target.value as any)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">Semua Shift</option>
                    <option value="1">Shift 1</option>
                    <option value="2">Shift 2</option>
                    <option value="3">Shift 3</option>
                  </select>

                  {/* Filter Status */}
                  <select
                    value={opStatusFilter}
                    onChange={(e) => setOpStatusFilter(e.target.value as any)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">Semua Status</option>
                    <option value="ACTIVE">Aktif Saja</option>
                    <option value="INACTIVE">Nonaktif</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-800/80 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama Operator & NIK</th>
                      <th className="py-2.5 px-3">Penugasan Line</th>
                      <th className="py-2.5 px-3 text-center">Shift Rutin</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3">Catatan / Keterampilan</th>
                      <th className="py-2.5 px-3 text-center">Aksi Administrator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(() => {
                      const list = (state.registeredOperators || []).filter(op => {
                        const q = opSearch.toLowerCase();
                        const matchQ = op.name.toLowerCase().includes(q) || op.nik.toLowerCase().includes(q) || (op.assignedLine || '').toLowerCase().includes(q);
                        const matchShift = opShiftFilter === 'ALL' || String(op.assignedShift) === opShiftFilter;
                        const matchStatus = opStatusFilter === 'ALL' || op.status === opStatusFilter;
                        return matchQ && matchShift && matchStatus;
                      });

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-slate-500 text-xs">
                              Tidak ada data operator yang sesuai dengan filter pencarian.
                            </td>
                          </tr>
                        );
                      }

                      return list.map((op, idx) => (
                        <tr key={op.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 font-mono text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-white text-xs block">{op.name}</span>
                            <span className="font-mono text-cyan-400 text-[11px]">{op.nik}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {op.assignedLine}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              op.assignedShift === 1 ? 'bg-cyan-500/20 text-cyan-300' :
                              op.assignedShift === 2 ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300'
                            }`}>
                              Shift {op.assignedShift}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              op.status === 'ACTIVE'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}>
                              {op.status === 'ACTIVE' ? 'AKTIF' : 'NON-AKTIF'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px] max-w-[160px] truncate" title={op.notes || '-'}>
                            {op.notes || '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center space-x-1.5">
                              {/* Toggle Active Status */}
                              <button
                                type="button"
                                onClick={() => {
                                  if (onUpdateOperator) {
                                    onUpdateOperator(op.id, {
                                      status: op.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                                    });
                                  }
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition ${
                                  op.status === 'ACTIVE'
                                    ? 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                                }`}
                              >
                                {op.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'}
                              </button>

                              {/* Delete Operator */}
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmation({
                                    type: 'OPERATOR',
                                    id: op.id,
                                    name: op.name,
                                    details: `NIK: ${op.nik} • ${op.assignedLine} (Shift ${op.assignedShift})`
                                  });
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition border border-transparent hover:border-rose-500/30"
                                title="Hapus Operator Terdaftar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEGMENT 2: PENGELOLAAN IZIN AKSES MANAGEMENT */}
        {activeUserTab === 'MANAGEMENT' && (
          <div className="space-y-5">
            {/* Otoritas Eksekutif Callout Banner */}
            <div className="bg-indigo-950/40 border border-indigo-500/40 p-4 rounded-2xl flex items-start space-x-3 text-xs shadow-lg">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                <Building className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-indigo-200">
                  Kebijakan Hak Akses Melihat Management (Read-Only Executive)
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Pengguna jenis Management hanya memiliki hak melihat (Read-Only) data Dashboard produksi berjalan, stok material, tangki WIP, dan mengunduh laporan PDF shift tanpa hak mengubah formula BOM atau data inventaris.
                  Administrator berhak penuh mendaftarkan akun jajaran management, mengaktifkan/mencabut izin akses kapan saja, atau menghapus akun terdaftar.
                </p>
              </div>
            </div>

            {/* Form Pendaftaran Akun Management */}
            <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl">
              <div className="flex items-center space-x-2.5 pb-3 mb-4 border-b border-slate-800">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Formulir Tambah Akun Management</h4>
                  <p className="text-[11px] text-slate-400">
                    Daftarkan akun eksekutif (Direktur, Factory Manager, Head of QC, PPIC, Maintenance).
                  </p>
                </div>
              </div>

              <form onSubmit={handleManagementSubmit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Nama Management */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Nama Lengkap & Gelar <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={mgtName}
                      onChange={(e) => setMgtName(e.target.value)}
                      placeholder="e.g. Dr. Ir. Gunawan, M.M."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Email Resmi */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Email Resmi Perusahaan <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={mgtEmail}
                      onChange={(e) => setMgtEmail(e.target.value)}
                      placeholder="e.g. gunawan@factory.co.id"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Jabatan / Title */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Jabatan / Title Eksekutif <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={mgtTitle}
                      onChange={(e) => setMgtTitle(e.target.value)}
                      placeholder="e.g. Factory Manager / Operations Director"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Departemen */}
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Departemen / Divisi <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={mgtDepartment}
                      onChange={(e) => setMgtDepartment(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="Plant Operations Management">Plant Operations Management</option>
                      <option value="Quality Assurance & QC">Quality Assurance & QC</option>
                      <option value="Supply Chain Management">Supply Chain Management</option>
                      <option value="PPIC & Produksi">PPIC & Produksi</option>
                      <option value="Engineering & Maintenance">Engineering & Maintenance</option>
                      <option value="Direksi & Komisaris">Direksi & Komisaris</option>
                    </select>
                  </div>
                </div>

                {/* Sakelar Izin Akses Awal */}
                <div className="flex items-center space-x-2 pt-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="mgtAccessCheckboxInTab"
                    checked={mgtAccess}
                    onChange={(e) => setMgtAccess(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                  <label htmlFor="mgtAccessCheckboxInTab" className="text-xs text-slate-200 font-medium cursor-pointer">
                    Langsung berikan izin akses melihat (Read-Only) pada akun ini saat disimpan
                  </label>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-indigo-600/25 active:scale-95 transition flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Daftarkan Akun Management</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Tabel Daftar Akun Management Terdaftar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              {/* Toolbar */}
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/80">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Building className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-white">
                    Daftar Akun Management Terdaftar ({state.registeredManagement?.length || 0})
                  </h4>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  {/* Search box */}
                  <div className="relative flex-1 sm:w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={mgtSearch}
                      onChange={(e) => setMgtSearch(e.target.value)}
                      placeholder="Cari nama, email, jabatan..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Filter Status Izin */}
                  <select
                    value={mgtAccessFilter}
                    onChange={(e) => setMgtAccessFilter(e.target.value as any)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="ALL">Semua Izin Akses</option>
                    <option value="ACTIVE">Izin Diberikan Saja</option>
                    <option value="REVOKED">Izin Dicabut Saja</option>
                  </select>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-800/80 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama Eksekutif & Email</th>
                      <th className="py-2.5 px-3">Jabatan & Departemen</th>
                      <th className="py-2.5 px-3 text-center">Status Izin Akses</th>
                      <th className="py-2.5 px-3 text-center">Terdaftar</th>
                      <th className="py-2.5 px-3 text-center">Aksi Administrator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {(() => {
                      const list = (state.registeredManagement || []).filter(m => {
                        const q = mgtSearch.toLowerCase();
                        const matchQ = m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.title.toLowerCase().includes(q) || m.department.toLowerCase().includes(q);
                        const matchAccess = mgtAccessFilter === 'ALL' || (mgtAccessFilter === 'ACTIVE' ? m.hasViewAccess : !m.hasViewAccess);
                        return matchQ && matchAccess;
                      });

                      if (list.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-slate-500 text-xs">
                              Tidak ada akun management yang sesuai dengan filter pencarian.
                            </td>
                          </tr>
                        );
                      }

                      return list.map((mgt, idx) => (
                        <tr key={mgt.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 font-mono text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-white text-xs block">{mgt.name}</span>
                            <span className="font-mono text-slate-400 text-[11px]">{mgt.email}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-indigo-300 block">{mgt.title}</span>
                            <span className="text-[10px] text-slate-400">{mgt.department}</span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {/* Interactive Access Switch Button */}
                            <button
                              type="button"
                              onClick={() => {
                                if (onToggleManagementAccess) {
                                  onToggleManagementAccess(mgt.id, !mgt.hasViewAccess);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl font-bold text-[11px] transition inline-flex items-center space-x-1.5 border ${
                                mgt.hasViewAccess
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                              }`}
                              title={mgt.hasViewAccess ? 'Klik untuk mencabut izin akses melihat' : 'Klik untuk memberikan izin akses melihat'}
                            >
                              {mgt.hasViewAccess ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Izin Diberikan (Dapat Memantau)</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Izin Dicabut (Akses Terkunci)</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3 px-3 text-center text-slate-400 text-[11px] font-mono">
                            {mgt.registeredAt ? mgt.registeredAt.slice(0, 10) : '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteConfirmation({
                                  type: 'MANAGEMENT',
                                  id: mgt.id,
                                  name: mgt.name,
                                  details: `${mgt.title} • ${mgt.email} (${mgt.department})`
                                });
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition border border-transparent hover:border-rose-500/30"
                              title="Hapus Akun & Izin Management"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SEGMENT 3: KEAMANAN ADMINISTRATOR (GANTI PIN) */}
        {activeUserTab === 'SECURITY' && (
          <div className="max-w-xl mx-auto space-y-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-800">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Ganti PIN Akses Administrator</h4>
                  <p className="text-[11px] text-slate-400">
                    PIN ini mengamankan seluruh perubahan formula BOM, mesin, tangki, dan manajemen otoritas pengguna.
                  </p>
                </div>
              </div>

              <form onSubmit={handleChangePinSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    PIN / Password Administrator Baru (Min. 8 Karakter)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={newAdminPin}
                    onChange={(e) => setNewAdminPin(e.target.value)}
                    placeholder="Minimal 8 karakter unik..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Konfirmasi Ulang PIN Administrator
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirmAdminPin}
                    onChange={(e) => setConfirmAdminPin(e.target.value)}
                    placeholder="Ketik ulang PIN baru"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-500/30 text-amber-300 text-[11px]">
                  🔒 <strong>Keamanan Aktif:</strong> PIN/Password Administrator di-hash menggunakan PBKDF2-SHA256 (210.000 iterasi) dan divalidasi terhadap daftar kata sandi umum yang bocor.
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-amber-600/25 active:scale-95 transition"
                  >
                    Simpan Perubahan PIN
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )}

    {/* MODAL KONFIRMASI PENGHAPUSAN PENGGUNA (IN-APP DIALOG) */}
    {deleteConfirmation && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
          <div className="flex items-center space-x-3 text-rose-400">
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">
                Konfirmasi Penghapusan {deleteConfirmation.type === 'OPERATOR' ? 'Operator' : 'Akun Management'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Tindakan ini akan menghapus data pengguna dari masterlist sistem.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-bold">
              Data yang Akan Dihapus:
            </span>
            <div className="font-bold text-white text-xs">{deleteConfirmation.name}</div>
            <div className="text-[11px] text-slate-400 font-mono">{deleteConfirmation.details}</div>
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setDeleteConfirmation(null)}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30"
            >
              Hapus Permanen
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Edit Tank Modal */}
    {editingTank && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Edit Tangki WIP & Mesin Pengisi: {editingTank.code}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Ubah mesin pengisi sumber WIP (multi-mesin) dan formula WIP tunggal
                </p>
              </div>
            </div>
            <button
              onClick={() => setEditingTank(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveEditTank} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nama Tangki</label>
                <input
                  type="text"
                  value={editTankName}
                  onChange={(e) => setEditTankName(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Kapasitas Maksimal (kg)</label>
                <input
                  type="number"
                  step="1"
                  value={editTankCapacity}
                  onChange={(e) => setEditTankCapacity(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Suhu Target (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editTankTemp}
                  onChange={(e) => setEditTankTemp(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status Agitator</label>
                <select
                  value={editTankAgitator}
                  onChange={(e) => setEditTankAgitator(e.target.value as 'ON' | 'OFF')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ON">ON (Aktif Berputar)</option>
                  <option value="OFF">OFF (Mati)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Min Alert (kg)</label>
                <input
                  type="number"
                  step="1"
                  value={editTankMinAlert}
                  onChange={(e) => setEditTankMinAlert(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* 1 Jenis WIP Sama */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-300 font-medium">
                  Alokasi Formula WIP (1 Jenis WIP Sama)
                </label>
                <span className="text-[10px] text-amber-400 font-medium bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                  Formula Tunggal
                </span>
              </div>
              <select
                value={editTankWip}
                onChange={(e) => setEditTankWip(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">-- Kosong / Belum Dialokasikan --</option>
                {state.master.wips.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.batchWeightKg} kg/batch)
                  </option>
                ))}
              </select>
            </div>

            {/* Mesin Pengisi Multi-Mesin */}
            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Mesin Pengisi Sumber WIP ({editTankMachines.length} Terpilih)</span>
                </label>
                <div className="flex space-x-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEditTankMachines(state.master.machines.map(m => m.id))}
                    className="text-cyan-400 hover:text-cyan-300 underline font-medium"
                  >
                    Pilih Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setEditTankMachines([])}
                    className="text-slate-400 hover:text-white underline font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar pt-1">
                {state.master.machines.map(mach => {
                  const isSelected = editTankMachines.includes(mach.id);
                  return (
                    <div
                      key={mach.id}
                      onClick={() => {
                        if (isSelected) {
                          setEditTankMachines(prev => prev.filter(id => id !== mach.id));
                        } else {
                          setEditTankMachines(prev => [...prev, mach.id]);
                        }
                      }}
                      className={`p-2 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-cyan-950/60 border-cyan-500 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="flex items-center space-x-1.5 truncate">
                          <span className="font-mono text-cyan-400 font-bold text-xs">{mach.code}</span>
                          <span className="truncate text-white font-medium text-[11px]">{mach.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block truncate">{mach.line}</span>
                      </div>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold' : 'border-slate-600'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-end space-x-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingTank(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-600/20 active:scale-95"
              >
                Simpan Perubahan Tangki
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Material Import Modal (Local Storage & Google Drive) */}
    <MaterialImportModal
      isOpen={isImportModalOpen}
      onClose={() => setIsImportModalOpen(false)}
      existingMaterials={state.master.materials}
      onImportMaterials={(newMats, mode) => {
        if (onImportMaterials) {
          onImportMaterials(newMats, mode);
        }
      }}
      showToast={showToast}
    />

    {/* Machine Import Modal (Local Storage & Google Drive) */}
    <MachineImportModal
      isOpen={isMachineImportOpen}
      onClose={() => setIsMachineImportOpen(false)}
      existingMachines={state.master.machines}
      onImportMachines={(newMachines, mode) => {
        if (onImportMachines) {
          onImportMachines(newMachines, mode);
        }
      }}
      showToast={showToast}
    />

    {/* Tank Import Modal (Local Storage & Google Drive) */}
    <TankImportModal
      isOpen={isTankImportOpen}
      onClose={() => setIsTankImportOpen(false)}
      existingTanks={state.master.tanks}
      availableWips={state.master.wips}
      availableMachines={state.master.machines}
      onImportTanks={(newTanks, mode) => {
        if (onImportTanks) {
          onImportTanks(newTanks, mode);
        }
      }}
      showToast={showToast}
    />

    {/* Machine Product Changeover Modal */}
    <MachineChangeoverModal
      isOpen={!!changeoverModalMachine}
      onClose={() => setChangeoverModalMachine(null)}
      machine={changeoverModalMachine}
      availableWips={state.master.wips}
      availableTanks={state.master.tanks}
      onStartChangeover={(mId, data) => {
        if (onStartMachineChangeover) {
          onStartMachineChangeover(mId, data);
        }
      }}
      onCompleteChangeover={(mId, record) => {
        if (onCompleteMachineChangeover) {
          onCompleteMachineChangeover(mId, record);
        }
      }}
      onCancelChangeover={(mId) => {
        if (onCancelMachineChangeover) {
          onCancelMachineChangeover(mId);
        }
      }}
      showToast={showToast}
    />

    {/* Machine Changeover Audit Log / History Modal */}
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

    {/* MODAL: Kelola Master WIP (1 Kode, Multi-Mesin, Multi-Tangki Transfer) */}
    {editingWip && (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto no-scrollbar">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Kelola Database WIP, Mesin & Tangki Transfer
                </h3>
                <p className="text-[11px] text-slate-400">
                  1 Nama WIP memiliki 1 Kode unik. Kustomisasi multi-mesin dan multi-tangki penampungan (HT/ST).
                </p>
              </div>
            </div>
            <button
              onClick={() => setEditingWip(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveEditWip} className="space-y-3 text-xs">
            {/* 1 Nama WIP = 1 Kode Unik */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-slate-300 font-semibold mb-1">Kode WIP (Unik):</label>
                <input
                  type="text"
                  value={editWipCode}
                  onChange={(e) => setEditWipCode(e.target.value.toUpperCase())}
                  required
                  placeholder="WIP-001"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-cyan-300 font-mono font-bold uppercase focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-300 font-semibold mb-1">Nama WIP:</label>
                <input
                  type="text"
                  value={editWipName}
                  onChange={(e) => setEditWipName(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Berat 1 Batch Formulasi (kg):
              </label>
              <input
                type="number"
                step="0.0001"
                value={editWipBatchWeight}
                onChange={(e) => setEditWipBatchWeight(e.target.value)}
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                <span>Lama Waktu Produksi (Menit / Batch):</span>
                <span className="text-amber-400 font-mono font-bold">{editWipDuration || 30} menit</span>
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={editWipDuration}
                  onChange={(e) => setEditWipDuration(e.target.value)}
                  required
                  className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500 font-bold"
                />
                <span className="text-slate-400">menit</span>
                <div className="flex items-center space-x-1.5 ml-auto">
                  {['15', '30', '45', '60'].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEditWipDuration(mins)}
                      className={`px-2 py-1 rounded-lg text-xs font-mono transition ${
                        editWipDuration === mins
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Batch WIP otomatis selesai setelah waktu ini dan memicu alarm notifikasi.
              </p>
            </div>

            {/* Multi-machine selection checklist */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-semibold uppercase text-[10px] flex items-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Pilih Mesin Produksi yang Diizinkan (Multi-Mesin):</span>
                </label>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEditWipMachines(state.master.machines.map(m => m.id))}
                    className="text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setEditWipMachines([])}
                    className="text-slate-400 hover:text-slate-300 font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto no-scrollbar bg-slate-950/80 p-2.5 rounded-xl border border-slate-700">
                {state.master.machines.map(m => {
                  const isChecked = editWipMachines.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-cyan-500/10 border-cyan-500/40 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditWipMachines(prev => [...prev, m.id]);
                            } else {
                              setEditWipMachines(prev => prev.filter(id => id !== m.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-cyan-600 bg-slate-800 border-slate-700 focus:ring-0"
                        />
                        <span className="font-mono font-extrabold text-sky-950 bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 text-xs shrink-0">{m.code}</span>
                        <span className="truncate">{m.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {m.line.split('(')[0]}
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400">
                Terpilih: <strong className="text-cyan-400 font-mono">{editWipMachines.length} unit mesin</strong>.
              </p>
            </div>

            {/* Multi-tank selection checklist (Holding Tanks & Storage Tanks) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-slate-300 font-semibold uppercase text-[10px] flex items-center space-x-1">
                  <Database className="w-3.5 h-3.5 text-purple-400" />
                  <span>Tangki Penampungan / Penyimpanan Transfer (Multi-Tank):</span>
                </label>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEditWipTankIds(state.master.tanks.map(t => t.id))}
                    className="text-purple-400 hover:text-purple-300 font-medium"
                  >
                    Semua
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setEditWipTankIds(state.master.tanks.filter(t => t.type === 'HOLDING_TANK').map(t => t.id))}
                    className="text-amber-400 hover:text-amber-300 font-medium"
                  >
                    HT
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setEditWipTankIds(state.master.tanks.filter(t => t.type === 'STORAGE_TANK').map(t => t.id))}
                    className="text-cyan-400 hover:text-cyan-300 font-medium"
                  >
                    ST
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => setEditWipTankIds([])}
                    className="text-slate-400 hover:text-slate-300 font-medium"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto no-scrollbar bg-slate-950/80 p-2.5 rounded-xl border border-slate-700">
                {state.master.tanks.map(t => {
                  const isChecked = editWipTankIds.includes(t.id);
                  const isHT = t.type === 'HOLDING_TANK';
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                        isChecked
                          ? 'bg-purple-500/15 border-purple-500/50 text-white'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditWipTankIds(prev => [...prev, t.id]);
                            } else {
                              setEditWipTankIds(prev => prev.filter(id => id !== t.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-purple-600 bg-slate-800 border-slate-700 focus:ring-0"
                        />
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                          isHT
                            ? 'bg-amber-950 text-amber-300 border-amber-600/50'
                            : 'bg-sky-950 text-sky-300 border-sky-600/50'
                        }`}>
                          {isHT ? 'HT' : 'ST'}
                        </span>
                        <span className="font-mono font-bold text-white text-[11px]">{t.code}</span>
                        <span className="truncate text-slate-300">{t.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {t.capacityKg} kg
                      </span>
                    </label>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-400">
                Terpilih: <strong className="text-purple-300 font-mono">{editWipTankIds.length} tangki transfer</strong> (Holding/Storage Tanks).
              </p>
            </div>

            <div className="flex items-center space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingWip(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition shadow-lg shadow-cyan-600/30"
              >
                Simpan Perubahan WIP
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* MODAL 1: Edit Resep (Kode, Nama, Deskripsi, Default) */}
    {editingRecipe && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Edit Resep Formulasi</h3>
                <p className="text-xs text-slate-400">
                  Ubah identitas resep untuk WIP {state.master.wips.find(w => w.id === editingRecipe.wipId)?.name || ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingRecipe(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveEditRecipe} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Kode Resep *</label>
              <input
                type="text"
                value={editRecipeCode}
                onChange={(e) => setEditRecipeCode(e.target.value.toUpperCase())}
                required
                placeholder="Contoh: REC-WIP-01"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold uppercase focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Nama Resep Formulasi *</label>
              <input
                type="text"
                value={editRecipeName}
                onChange={(e) => setEditRecipeName(e.target.value)}
                required
                placeholder="Contoh: Resep Standar Original"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Keterangan / Catatan Formulasi</label>
              <textarea
                rows={2}
                value={editRecipeDesc}
                onChange={(e) => setEditRecipeDesc(e.target.value)}
                placeholder="Catatan parameter proses, varian rasa, atau acuan QC..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <label className="flex items-center space-x-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer hover:border-cyan-500/40 transition">
              <input
                type="checkbox"
                checked={editRecipeIsDefault}
                onChange={(e) => setEditRecipeIsDefault(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-600 bg-slate-800 border-slate-700 focus:ring-0"
              />
              <div>
                <span className="font-semibold text-white block">Jadikan Resep Acuan Utama (Default)</span>
                <span className="text-[11px] text-slate-400 block">
                  Resep ini otomatis terpilih saat pembuatan batch WIP dan penarikan permintaan material
                </span>
              </div>
            </label>

            <div className="flex items-center space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRecipe(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl font-bold transition shadow-lg shadow-cyan-600/30"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* MODAL 2: Edit Takaran Material dalam Resep */}
    {editingRecipeItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                <Edit3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Edit Takaran Material</h3>
                <p className="text-xs text-slate-400">Sesuaikan porsi bahan dalam 1 batch WIP</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEditingRecipeItem(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveEditRecipeItem} className="space-y-4 text-xs">
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-mono block">Material Terpilih:</span>
              <span className="font-bold text-white text-sm block mt-0.5">
                {editingRecipeItem.item.materialName}
              </span>
              {editingRecipeItem.item.materialCode && (
                <span className="text-xs font-mono font-bold text-sky-950 bg-sky-100 border border-sky-300 px-2 py-0.5 rounded inline-block mt-1">
                  Kode Material: {editingRecipeItem.item.materialCode}
                </span>
              )}
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Takaran per 1 Batch *</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={editItemAmount}
                  onChange={(e) => setEditItemAmount(e.target.value)}
                  required
                  placeholder="0.0000"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-cyan-400 font-mono font-bold focus:outline-none focus:border-cyan-500 text-sm"
                />
                <div className="flex rounded-xl overflow-hidden border border-slate-700 bg-slate-800 p-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditItemUnit('kg')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                      editItemUnit === 'kg'
                        ? 'bg-cyan-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    kg / batch
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItemUnit('gr')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                      editItemUnit === 'gr'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    gr / batch
                  </button>
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-slate-300">
              Setara: <strong className="text-cyan-400 font-mono">{editItemAmount && !isNaN(parseFloat(editItemAmount)) ? (editItemUnit === 'gr' ? parseFloat(editItemAmount) / 1000 : parseFloat(editItemAmount)).toFixed(4) : '0.0000'} kg</strong> per batch WIP.
            </div>

            <div className="flex items-center space-x-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingRecipeItem(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition shadow-lg shadow-cyan-600/30"
              >
                Simpan Takaran
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* MODAL 3: Konfirmasi Hapus Resep Formulasi */}
    {deleteRecipeTarget && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-900 border border-rose-800/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
          <div className="flex items-center space-x-3 text-rose-400">
            <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Hapus Resep Formulasi?</h3>
              <p className="text-xs text-rose-300">Tindakan ini tidak dapat dibatalkan</p>
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-400">Kode Resep:</span>
              <span className="font-mono font-bold text-amber-400">{deleteRecipeTarget.recipeCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Nama Resep:</span>
              <span className="font-bold text-white">{deleteRecipeTarget.recipeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target WIP:</span>
              <span className="text-cyan-400 font-medium">
                {state.master.wips.find(w => w.id === deleteRecipeTarget.wipId)?.name || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Jumlah Bahan:</span>
              <span className="font-mono text-slate-200">{deleteRecipeTarget.items?.length || 0} material</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total Berat:</span>
              <span className="font-mono font-bold text-cyan-400">{deleteRecipeTarget.totalWeightKg.toFixed(4)} kg</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Menghapus resep ini akan menghapus seluruh susunan takaran material yang ada di dalamnya.
          </p>

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setDeleteRecipeTarget(null)}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition text-xs"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteRecipe}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition text-xs shadow-lg shadow-rose-600/30"
            >
              Ya, Hapus Resep
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Google Drive & Local File Recipe Import Modal */}
    <RecipeImportModal
      isOpen={isRecipeImportOpen}
      onClose={() => setIsRecipeImportOpen(false)}
      availableWips={state.master.wips}
      availableMaterials={state.master.materials}
      existingRecipes={state.master.recipes || []}
      onImportRecipes={(newRecipes, mode) => {
        if (onImportRecipes) {
          onImportRecipes(newRecipes, mode);
        }
      }}
      showToast={showToast}
    />

    {/* Google Drive & Local File SKU Import Modal */}
    <SkuImportModal
      isOpen={isSkuImportOpen}
      onClose={() => setIsSkuImportOpen(false)}
      existingSkus={state.master.skus}
      onImportSkus={(newSkus, mode) => {
        if (onImportSkus) {
          onImportSkus(newSkus, mode);
        }
      }}
      showToast={showToast}
    />

    {/* Google Drive & Local File SKU-WIP Mapping Import Modal */}
    <SkuWipImportModal
      isOpen={isSkuWipImportOpen}
      onClose={() => setIsSkuWipImportOpen(false)}
      availableSkus={state.master.skus}
      availableWips={state.master.wips}
      existingSkuWips={state.master.skuWips}
      onImportSkuWips={(newSkuWips, mode) => {
        if (onImportSkuWips) {
          onImportSkuWips(newSkuWips, mode);
        }
      }}
      showToast={showToast}
    />
  </div>
);
};
