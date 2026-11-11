import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  PlayCircle,
  Search,
  AlertCircle,
  History,
  Droplet,
  User,
  CheckCircle2,
  Layers,
  Lock,
  Boxes,
  FileCheck,
  Clock,
  Ban,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Info,
  Printer,
  Calendar,
  FileText,
  Sparkles,
  Database
} from 'lucide-react';
import {
  AppState,
  MaterialUsage,
  StorageLocation,
  WipProductionBatch,
  WipBatchMaterialItem,
  PalletAllocation,
  PalletInventoryLot
} from '../../types';
import { calculateStockBalances, getMaterialPalletInventory, calculateFifoPalletAllocation } from '../../utils/storage';
import { calculateUsageBreakdown } from '../../utils/reportBreakdown';
import { getCurrentShift, SHIFTS_CONFIG, ShiftNumber, formatIndonesianDate } from '../../utils/shifts';
import { ChevronDown, ChevronUp, RefreshCw, PackageCheck } from 'lucide-react';

interface PemakaianViewProps {
  state: AppState;
  onRecordUsage: (usage: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => void;
  onStartWipBatch: (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => void;
  onCompleteWipBatch: (batchId: string) => void;
  onCancelWipBatch: (batchId: string) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const PemakaianView: React.FC<PemakaianViewProps> = ({
  state,
  onRecordUsage,
  onStartWipBatch,
  onCompleteWipBatch,
  onCancelWipBatch,
  onSwitchTab,
  showToast
}) => {
  const [skuId, setSkuId] = useState('');
  const [wipId, setWipId] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedTargetTankId, setSelectedTargetTankId] = useState<string>('');
  const [operatorName, setOperatorName] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'batch-order' | 'batch-history' | 'material-history' | 'shift-activity'>('batch-order');
  const [searchTerm, setSearchTerm] = useState('');

  // 3-Shift Operator System State
  const currentLiveShift = getCurrentShift();
  const [selectedShift, setSelectedShift] = useState<ShiftNumber>(currentLiveShift.shift);
  const [filterShift, setFilterShift] = useState<'all' | '1' | '2' | '3'>('all');
  const [usageViewMode, setUsageViewMode] = useState<'breakdown-sku-wip' | 'list'>('breakdown-sku-wip');
  const [usageFilterSkuId, setUsageFilterSkuId] = useState<string>('all');
  const [usageFilterWipId, setUsageFilterWipId] = useState<string>('all');

  // WIP Production Duration state (minutes) & live clock ticker for real-time countdown
  const [batchDurationMinutes, setBatchDurationMinutes] = useState<string>('30');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Editable materials mapped from BOM/Recipe for the selected WIP
  const [configuredMaterials, setConfiguredMaterials] = useState<WipBatchMaterialItem[]>([]);
  // Track which material has its FIFO pallet drawer open
  const [expandedPalletMatId, setExpandedPalletMatId] = useState<string | null>(null);

  const stockBalances = calculateStockBalances(state);

  // Filter WIPs linked to SKU if any
  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === skuId).map(sw => sw.wipId);
  const availableWips = skuId && linkedWips.length > 0
    ? state.master.wips.filter(w => linkedWips.includes(w.id))
    : state.master.wips;

  const selectedWipObj = state.master.wips.find(w => w.id === wipId);
  const selectedSkuObj = state.master.skus.find(s => s.id === skuId);
  const selectedMachObj = state.master.machines.find(m => m.id === selectedMachineId);

  // Available recipes for current WIP
  const availableRecipesForWip = useMemo(() => {
    if (!wipId) return [];
    return (state.master.recipes || []).filter(r => r.wipId === wipId);
  }, [state.master.recipes, wipId]);

  const activeRecipeObj = useMemo(() => {
    return availableRecipesForWip.find(r => r.id === selectedRecipeId) || null;
  }, [availableRecipesForWip, selectedRecipeId]);

  // Check if the SELECTED MACHINE has an active batch currently in progress (Strict Rule: 1 batch per machine)
  const activeBatchForSelectedMachine = (state.transactions.wipBatches || []).find(
    b => b.targetMachineId === selectedMachineId && b.status === 'SEDANG_PRODUKSI'
  );

  // All active WIP batches across all WIPs
  const allActiveBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI'
  );

  // Auto-select recipe when WIP changes
  useEffect(() => {
    if (!wipId) {
      setSelectedRecipeId('');
      return;
    }
    const recipes = (state.master.recipes || []).filter(r => r.wipId === wipId);
    if (recipes.length > 0) {
      const def = recipes.find(r => r.isDefault) || recipes[0];
      setSelectedRecipeId(def.id);
    } else {
      setSelectedRecipeId('');
    }
  }, [wipId, state.master.recipes]);

  // When WIP or Recipe selection changes, integrate with BOM and automatically populate materials with FIFO Pallet Allocation
  useEffect(() => {
    if (!wipId) {
      setConfiguredMaterials([]);
      return;
    }

    const currentWip = state.master.wips.find(w => w.id === wipId);
    if (currentWip?.productionDurationMinutes) {
      setBatchDurationMinutes(String(currentWip.productionDurationMinutes));
    } else {
      setBatchDurationMinutes('30');
    }

    // Auto-select preferred machine linked to this WIP from master database, or fallback to first available
    const preferredMachId = currentWip?.assignedMachineIds?.[0] || currentWip?.assignedMachineId;
    if (preferredMachId && state.master.machines.some(m => m.id === preferredMachId)) {
      setSelectedMachineId(preferredMachId);
    } else if (!selectedMachineId && state.master.machines.length > 0) {
      setSelectedMachineId(state.master.machines[0].id);
    }

    // Auto-select preferred target tank linked to this WIP from master database (Holding / Storage Tanks)
    const preferredTankId = currentWip?.targetTankIds?.[0] || currentWip?.targetTankId;
    if (preferredTankId && state.master.tanks.some(t => t.id === preferredTankId)) {
      setSelectedTargetTankId(preferredTankId);
    } else if (!selectedTargetTankId && state.master.tanks.length > 0) {
      setSelectedTargetTankId(state.master.tanks[0].id);
    }

    // Check if recipe is selected and has items
    const activeRecipe = (state.master.recipes || []).find(r => r.id === selectedRecipeId);

    if (activeRecipe && activeRecipe.items && activeRecipe.items.length > 0) {
      const populatedItems: WipBatchMaterialItem[] = activeRecipe.items.map(it => {
        const mat = state.master.materials.find(m => m.id === it.materialId);
        const bal = mat ? stockBalances[mat.id] : null;

        let defaultLocation: StorageLocation = 'CK';
        if (it.materialType === 'liquid' || mat?.type === 'liquid') {
          defaultLocation = 'STORAGE_TANK';
        } else if (bal && bal.stockWineroto > bal.stockCk) {
          defaultLocation = 'WINEROTO';
        }

        // Automatic FIFO Pallet locked weight check
        const availablePallets = getMaterialPalletInventory(state, it.materialId, defaultLocation);
        let palletAllocations: PalletAllocation[] | undefined = undefined;
        let actualUsedKg = it.amountKg;

        if (availablePallets.length > 0) {
          const fifoResult = calculateFifoPalletAllocation(availablePallets, it.amountKg);
          if (fifoResult.allocations.length > 0) {
            palletAllocations = fifoResult.allocations;
            actualUsedKg = fifoResult.totalAllocatedKg;
          }
        }

        return {
          materialId: it.materialId,
          materialName: it.materialName || mat?.name || 'Material',
          materialCode: it.materialCode || mat?.code || `MAT-${it.materialId.slice(-4)}`,
          materialType: it.materialType || mat?.type || 'bubuk',
          materialSource: mat?.source || 'GDRM',
          packaging: mat?.packaging || '-',
          unit: it.unit,
          recipeAmount: it.amount,
          requiredKg: it.amountKg,
          actualUsedKg,
          sourceLocation: defaultLocation,
          isConsumed: true,
          palletAllocations
        };
      });
      setConfiguredMaterials(populatedItems);
    } else {
      // Fallback to legacy wipMats for backward compatibility
      const wipBomEntries = state.master.wipMats.filter(wm => wm.wipId === wipId);
      const populatedItems: WipBatchMaterialItem[] = wipBomEntries.map(wm => {
        const mat = state.master.materials.find(m => m.id === wm.materialId);
        const bal = mat ? stockBalances[mat.id] : null;

        let defaultLocation: StorageLocation = 'CK';
        if (mat?.type === 'liquid') {
          defaultLocation = 'STORAGE_TANK';
        } else if (bal && bal.stockWineroto > bal.stockCk) {
          defaultLocation = 'WINEROTO';
        }

        const availablePallets = getMaterialPalletInventory(state, wm.materialId, defaultLocation);
        let palletAllocations: PalletAllocation[] | undefined = undefined;
        let actualUsedKg = wm.materialKgPerBatch;

        if (availablePallets.length > 0) {
          const fifoResult = calculateFifoPalletAllocation(availablePallets, wm.materialKgPerBatch);
          if (fifoResult.allocations.length > 0) {
            palletAllocations = fifoResult.allocations;
            actualUsedKg = fifoResult.totalAllocatedKg;
          }
        }

        return {
          materialId: wm.materialId,
          materialName: mat?.name || 'Material',
          materialCode: mat?.code || `MAT-${wm.materialId.slice(-4)}`,
          materialType: mat?.type || 'bubuk',
          materialSource: mat?.source || 'GDRM',
          packaging: mat?.packaging || '-',
          unit: 'kg',
          recipeAmount: wm.materialKgPerBatch,
          requiredKg: wm.materialKgPerBatch,
          actualUsedKg,
          sourceLocation: defaultLocation,
          isConsumed: true,
          palletAllocations
        };
      });
      setConfiguredMaterials(populatedItems);
    }
  }, [wipId, selectedRecipeId, state.master.recipes, state.master.wipMats, state.master.materials, state.transactions.receipts, state.transactions.usages]);

  // Handler to adjust location or actual usage for a specific BOM material
  const handleUpdateMaterialRow = (
    materialId: string,
    updates: Partial<WipBatchMaterialItem>
  ) => {
    setConfiguredMaterials(prev =>
      prev.map(item => (item.materialId === materialId ? { ...item, ...updates } : item))
    );
  };

  // Handler for changing storage location with FIFO re-allocation
  const handleLocationChange = (materialId: string, newLocation: StorageLocation) => {
    const item = configuredMaterials.find(m => m.materialId === materialId);
    if (!item) return;

    const availablePallets = getMaterialPalletInventory(state, materialId, newLocation);
    if (availablePallets.length > 0) {
      const fifoResult = calculateFifoPalletAllocation(availablePallets, item.requiredKg);
      handleUpdateMaterialRow(materialId, {
        sourceLocation: newLocation,
        palletAllocations: fifoResult.allocations,
        actualUsedKg: fifoResult.totalAllocatedKg
      });
    } else {
      handleUpdateMaterialRow(materialId, {
        sourceLocation: newLocation,
        palletAllocations: undefined,
        actualUsedKg: item.requiredKg
      });
    }
  };

  // Adjust bags used for a specific pallet in the FIFO queue
  const handleAdjustPalletBags = (materialId: string, palletId: string, targetBags: number) => {
    const item = configuredMaterials.find(m => m.materialId === materialId);
    if (!item) return;

    const availableLots = getMaterialPalletInventory(state, materialId, item.sourceLocation);
    const targetLot = availableLots.find(l => l.palletId === palletId);
    if (!targetLot) return;

    const safeBags = Math.max(0, Math.min(targetLot.remainingBags, Math.round(targetBags)));
    const currentAllocs = item.palletAllocations ? [...item.palletAllocations] : [];
    const existingIndex = currentAllocs.findIndex(a => a.palletId === palletId);

    if (safeBags > 0) {
      const subtotalKg = parseFloat((safeBags * targetLot.weightPerBagKg).toFixed(4));
      const allocObj: PalletAllocation = {
        palletId: targetLot.palletId,
        receiptId: targetLot.receiptId,
        receiptNumber: targetLot.receiptNumber,
        palletLabel: targetLot.palletLabel,
        date: targetLot.date,
        bagsUsed: safeBags,
        weightPerBagKg: targetLot.weightPerBagKg,
        subtotalKg,
        location: targetLot.location
      };
      if (existingIndex >= 0) {
        currentAllocs[existingIndex] = allocObj;
      } else {
        currentAllocs.push(allocObj);
      }
    } else {
      if (existingIndex >= 0) {
        currentAllocs.splice(existingIndex, 1);
      }
    }

    const newTotalKg = currentAllocs.reduce((sum, a) => sum + a.subtotalKg, 0);
    handleUpdateMaterialRow(materialId, {
      palletAllocations: currentAllocs,
      actualUsedKg: parseFloat(newTotalKg.toFixed(4))
    });
  };

  // Reset pallet allocation back to strictly optimal FIFO recommendation
  const handleResetFifo = (materialId: string) => {
    const item = configuredMaterials.find(m => m.materialId === materialId);
    if (!item) return;

    const availableLots = getMaterialPalletInventory(state, materialId, item.sourceLocation);
    const fifoResult = calculateFifoPalletAllocation(availableLots, item.requiredKg);
    handleUpdateMaterialRow(materialId, {
      palletAllocations: fifoResult.allocations,
      actualUsedKg: fifoResult.totalAllocatedKg
    });
    showToast(`Alokasi ${item.materialName} dikembalikan ke rekomendasi FIFO optimal`);
  };

  // Submit new 1-batch work order
  const handleStartBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!wipId || !selectedWipObj) {
      showToast('Harap pilih jenis WIP terlebih dahulu', true);
      return;
    }

    if (!selectedMachineId) {
      showToast('Pilih mesin produksi dari master data mesin terlebih dahulu!', true);
      return;
    }

    const currentMachObj = state.master.machines.find(m => m.id === selectedMachineId);

    // STRICT CHECK: 1 batch in progress per selected MACHINE rule
    if (activeBatchForSelectedMachine) {
      showToast(
        `Mesin ${currentMachObj ? `${currentMachObj.code} - ${currentMachObj.name}` : 'terpilih'} masih memiliki 1 batch aktif (${activeBatchForSelectedMachine.batchCode})! 1 mesin hanya dapat memproses 1 batch dalam satu waktu.`,
        true
      );
      return;
    }

    if (configuredMaterials.length === 0) {
      showToast(
        `WIP ${selectedWipObj.name} belum memiliki komponen BOM material. Harap konfigurasikan BOM di menu Master Data.`,
        true
      );
      return;
    }

    // Verify stock availability
    let insufficientItems: string[] = [];
    configuredMaterials.forEach(item => {
      const bal = stockBalances[item.materialId];
      let available = 0;
      if (bal) {
        if (item.sourceLocation === 'CK') available = bal.stockCk;
        else if (item.sourceLocation === 'WINEROTO') available = bal.stockWineroto;
        else if (item.sourceLocation === 'STORAGE_TANK') available = bal.stockTank;
      }
      if (item.actualUsedKg > available) {
        insufficientItems.push(`${item.materialName} (${available.toFixed(2)} kg tersedia di ${item.sourceLocation})`);
      }
    });

    if (insufficientItems.length > 0) {
      const confirmProceed = window.confirm(
        `Peringatan: Stok bahan baku berikut kurang dari kebutuhan 1 batch:\n- ${insufficientItems.join('\n- ')}\n\nApakah tetap ingin memulai produksi batch WIP ini?`
      );
      if (!confirmProceed) return;
    }

    // Calculate duration & estimated completion time
    const durMins = parseFloat(batchDurationMinutes) || selectedWipObj.productionDurationMinutes || 30;
    const estimatedCompletion = new Date(Date.now() + durMins * 60 * 1000).toISOString();

    // Trigger Start Batch (strictly batchSize: 1 with shift assignment & duration config)
    onStartWipBatch({
      wipId,
      wipName: selectedWipObj.name,
      recipeId: activeRecipeObj?.id,
      recipeCode: activeRecipeObj?.recipeCode,
      recipeName: activeRecipeObj?.recipeName,
      skuId: skuId || undefined,
      skuName: selectedSkuObj?.name,
      shift: selectedShift,
      batchSize: 1, // Strictly 1 batch
      batchWeightKg: selectedWipObj.batchWeightKg,
      operatorName: operatorName || `Operator Shift ${selectedShift}`,
      notes: notes ? `${notes} (Shift ${selectedShift})` : `Shift ${selectedShift}`,
      materials: configuredMaterials,
      durationMinutes: durMins,
      estimatedCompletionTime: estimatedCompletion,
      targetTankId: selectedTargetTankId || selectedWipObj.targetTankId || (selectedWipObj.targetTankIds && selectedWipObj.targetTankIds[0]),
      targetMachineId: selectedMachineId,
      targetMachineName: selectedMachObj?.name
    });

    setNotes('');
  };

  // Total weight of BOM formula for 1 batch
  const totalBOMKg = configuredMaterials.reduce((acc, curr) => acc + curr.actualUsedKg, 0);

  // Filtered WIP Batches by search and shift
  const wipBatchesList = state.transactions.wipBatches || [];
  const filteredBatches = wipBatchesList.filter(b => {
    const query = searchTerm.toLowerCase();
    const matchShift = filterShift === 'all' || String(b.shift || 1) === filterShift;
    const matchQuery =
      b.batchCode.toLowerCase().includes(query) ||
      b.wipName.toLowerCase().includes(query) ||
      (b.skuName && b.skuName.toLowerCase().includes(query)) ||
      b.operatorName.toLowerCase().includes(query) ||
      b.status.toLowerCase().includes(query);
    return matchShift && matchQuery;
  });

  // Filtered Usages by search and shift
  const filteredUsages = state.transactions.usages.filter(u => {
    const sObj = state.master.skus.find(s => s.id === u.skuId);
    const wObj = state.master.wips.find(w => w.id === u.wipId);
    const mObj = state.master.materials.find(m => m.id === u.materialId);
    const query = searchTerm.toLowerCase();
    const matchShift = filterShift === 'all' || String(u.shift || 1) === filterShift;
    const matchQuery =
      u.usageNumber.toLowerCase().includes(query) ||
      (sObj && sObj.name.toLowerCase().includes(query)) ||
      (wObj && wObj.name.toLowerCase().includes(query)) ||
      (mObj && mObj.name.toLowerCase().includes(query)) ||
      (u.operatorName && u.operatorName.toLowerCase().includes(query));
    return matchShift && matchQuery;
  });

  // Raw material usages partitioned and grouped by SKU and WIP
  const usageBreakdownGroups = useMemo(() => {
    const shiftOpt = filterShift === 'all' ? 'ALL' : (parseInt(filterShift) as ShiftNumber);
    const groups = calculateUsageBreakdown(state, { shift: shiftOpt });
    const query = searchTerm.toLowerCase();

    return groups.filter(grp => {
      const matchSku = usageFilterSkuId === 'all' || grp.skuId === usageFilterSkuId;
      const matchWip = usageFilterWipId === 'all' || grp.wipId === usageFilterWipId;
      const matchQuery =
        !query ||
        grp.skuName.toLowerCase().includes(query) ||
        grp.wipName.toLowerCase().includes(query) ||
        grp.materials.some(m =>
          m.materialName.toLowerCase().includes(query) ||
          m.materialCode.toLowerCase().includes(query) ||
          m.operators.some(op => op.toLowerCase().includes(query))
        );
      return matchSku && matchWip && matchQuery;
    });
  }, [state, filterShift, searchTerm, usageFilterSkuId, usageFilterWipId]);

  // Group usages by shift for Shift Activity Log
  const shiftGroups = useMemo(() => {
    const groups: Record<ShiftNumber, MaterialUsage[]> = { 1: [], 2: [], 3: [] };
    state.transactions.usages.forEach(u => {
      const query = searchTerm.toLowerCase();
      const sObj = state.master.skus.find(s => s.id === u.skuId);
      const wObj = state.master.wips.find(w => w.id === u.wipId);
      const mObj = state.master.materials.find(m => m.id === u.materialId);
      const matchQuery =
        !query ||
        u.usageNumber.toLowerCase().includes(query) ||
        (sObj && sObj.name.toLowerCase().includes(query)) ||
        (wObj && wObj.name.toLowerCase().includes(query)) ||
        (mObj && mObj.name.toLowerCase().includes(query)) ||
        (u.operatorName && u.operatorName.toLowerCase().includes(query));

      if (matchQuery) {
        const s = (u.shift || 1) as ShiftNumber;
        if (groups[s]) {
          groups[s].push(u);
        } else {
          groups[1].push(u);
        }
      }
    });
    return groups;
  }, [state.transactions.usages, state.master.skus, state.master.wips, state.master.materials, searchTerm]);

  // Compute summary stats per shift
  const shiftStats = useMemo(() => {
    const stats: Record<ShiftNumber, { totalKg: number; count: number; batchesCount: number; operators: string[] }> = {
      1: { totalKg: 0, count: 0, batchesCount: 0, operators: [] },
      2: { totalKg: 0, count: 0, batchesCount: 0, operators: [] },
      3: { totalKg: 0, count: 0, batchesCount: 0, operators: [] }
    };

    const opSets: Record<ShiftNumber, Set<string>> = {
      1: new Set(),
      2: new Set(),
      3: new Set()
    };

    state.transactions.usages.forEach(u => {
      const s = (u.shift || 1) as ShiftNumber;
      if (stats[s]) {
        stats[s].totalKg += u.usageQty;
        stats[s].count += 1;
        if (u.operatorName) opSets[s].add(u.operatorName);
      }
    });

    (state.transactions.wipBatches || []).forEach(b => {
      const s = (b.shift || 1) as ShiftNumber;
      if (stats[s]) {
        stats[s].batchesCount += 1;
        if (b.operatorName) opSets[s].add(b.operatorName);
      }
    });

    ([1, 2, 3] as ShiftNumber[]).forEach(s => {
      stats[s].operators = Array.from(opSets[s]);
    });

    return stats;
  }, [state.transactions.usages, state.transactions.wipBatches]);

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* 3-Shift Operator Activity & Real-time Indicator Bar */}
      <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-xl bg-slate-800/90 border ${currentLiveShift.borderClass}`}>
            <Clock className={`w-5 h-5 ${currentLiveShift.colorClass}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-sm text-white">Sistem Kerja 3 Shift Operator</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${currentLiveShift.badgeBg} border ${currentLiveShift.borderClass} animate-pulse`}>
                Sedang Berjalan: {currentLiveShift.name} ({currentLiveShift.timeRange})
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Shift 1 (07.01-15.00) • Shift 2 (15.01-23.00) • Shift 3 (23.01-07.00)
            </p>
          </div>
        </div>

        {/* Shift selector for Work Order execution */}
        <div className="flex items-center space-x-1.5 self-end md:self-auto bg-slate-950/70 p-1 rounded-xl border border-slate-800">
          <span className="text-[10px] text-slate-400 px-2 font-medium">Shift Pengerjaan:</span>
          {([1, 2, 3] as ShiftNumber[]).map(sNum => {
            const sInfo = SHIFTS_CONFIG[sNum];
            return (
              <button
                key={sNum}
                type="button"
                onClick={() => setSelectedShift(sNum)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                  selectedShift === sNum
                    ? `${sInfo.badgeBg} border ${sInfo.borderClass} shadow-sm font-bold`
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                }`}
              >
                {sInfo.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
      {/* Active WIP Batches Alert Bar (if any in plant) */}
      {allActiveBatches.length > 0 && (
        <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-amber-950/40 border border-amber-500/40 p-3 sm:p-4 rounded-2xl shadow-xl space-y-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <h4 className="font-bold text-xs sm:text-sm text-white">
                {allActiveBatches.length} Perintah Kerja Batch WIP Sedang Berjalan di Lantai Produksi
              </h4>
            </div>
            <span className="text-[10px] text-amber-300 font-mono bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Aturan: 1 Batch / Mesin
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {allActiveBatches.map(batch => {
              const bMach = state.master.machines.find(m => m.id === batch.targetMachineId);
              return (
                <div
                  key={batch.id}
                  className="bg-slate-900/90 border border-amber-500/30 p-2.5 rounded-xl flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-amber-400 text-[11px]">{batch.batchCode}</span>
                      <span className="font-semibold text-white truncate">{batch.wipName}</span>
                      {batch.recipeCode && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-semibold" title={batch.recipeName}>
                          {batch.recipeCode}
                        </span>
                      )}
                      {bMach && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono">
                          {bMach.code}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-2">
                      <span>Mulai: {batch.startedAt}</span>
                      <span>•</span>
                      <span>Op: {batch.operatorName}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onCompleteWipBatch(batch.id)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-[10px] shadow transition active:scale-95 shrink-0 flex items-center space-x-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Selesaikan</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation & Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('batch-order')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'batch-order'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PlayCircle className="w-4 h-4" />
            <span>1. Perintah Kerja Produksi WIP (BOM Terintegrasi)</span>
          </button>

          <button
            onClick={() => setActiveTab('batch-history')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'batch-history'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>2. Status Batch WIP ({wipBatchesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('material-history')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'material-history'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>3. Log Pemakaian Bahan Baku</span>
          </button>

          <button
            onClick={() => setActiveTab('shift-activity')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${
              activeTab === 'shift-activity'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>4. Log Aktivitas 3 Shift</span>
          </button>
        </div>
      </div>

      {/* TAB 1: FORM PERINTAH KERJA BATCH WIP & BOM INTEGRATION */}
      {activeTab === 'batch-order' && (
        <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-2xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Perintah Kerja Produksi WIP (Kapasitas 1 Batch per Periode)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Pilih jenis WIP untuk memuat formulasi BOM terpisah secara otomatis
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] px-2 py-0.5 rounded font-mono bg-purple-950/60 border border-purple-500/30 text-purple-300">
                Aturan MES: 1 Batch Aktif / Mesin Produksi
              </span>
            </div>
          </div>

          <form onSubmit={handleStartBatchSubmit} className="space-y-4 text-xs">
            {/* Header Form Row: SKU, WIP Selection, Recipe Selection, Machine Selection, Target Tank Selection, Fixed Batch Count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {/* Optional SKU context */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  SKU Target (Opsional)
                </label>
                <select
                  value={skuId}
                  onChange={(e) => {
                    setSkuId(e.target.value);
                    setWipId('');
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 text-xs"
                >
                  <option value="">-- Semua / Pilih SKU --</option>
                  {state.master.skus.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.isKite ? '(KITE Ekspor)' : '(Domestik)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* WIP Selection (1 WIP = 1 Unique Code, Integrates with BOM immediately) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-purple-300 font-semibold">
                    Target WIP *
                  </label>
                  {selectedWipObj?.code && (
                    <span className="font-mono text-[10px] text-amber-300 font-bold px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                      {selectedWipObj.code}
                    </span>
                  )}
                </div>
                <select
                  value={wipId}
                  onChange={(e) => setWipId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-purple-500/40 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400 font-semibold text-xs"
                >
                  <option value="">-- Pilih Jenis WIP --</option>
                  {availableWips.map(w => (
                    <option key={w.id} value={w.id}>
                      [{w.code}] {w.name} ({w.batchWeightKg.toFixed(1)} kg)
                    </option>
                  ))}
                </select>
              </div>

              {/* Recipe Selection (Required step after selecting target WIP) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-amber-300 font-semibold flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Resep Formulasi *</span>
                  </label>
                  {activeRecipeObj && (
                    <span className="text-[10px] text-amber-400 font-mono">
                      {activeRecipeObj.recipeCode}
                    </span>
                  )}
                </div>
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(e.target.value)}
                  disabled={!wipId}
                  required
                  className="w-full bg-slate-800 border border-amber-500/50 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400 font-semibold text-xs disabled:opacity-50"
                >
                  {availableRecipesForWip.length === 0 ? (
                    <option value="">-- {wipId ? 'Belum Ada Resep (Default BOM)' : 'Pilih WIP Dahulu'} --</option>
                  ) : (
                    <>
                      <option value="">-- Pilih Resep Formulasi --</option>
                      {availableRecipesForWip.map(r => (
                        <option key={r.id} value={r.id}>
                          [{r.recipeCode}] {r.recipeName} ({r.totalWeightKg.toFixed(4)} kg) {r.isDefault ? '★' : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Production Machine Selection from Master Database */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-cyan-300 font-semibold flex items-center space-x-1">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Mesin Produksi *</span>
                  </label>
                  {selectedMachineId && (
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {state.master.machines.find(m => m.id === selectedMachineId)?.code || ''}
                    </span>
                  )}
                </div>
                <select
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  required
                  className="w-full bg-slate-800 border border-cyan-500/50 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400 font-semibold text-xs"
                >
                  <option value="">-- Pilih Mesin Master --</option>
                  {state.master.machines.map(m => {
                    const isPreferred = selectedWipObj?.assignedMachineIds?.includes(m.id) || selectedWipObj?.assignedMachineId === m.id;
                    const isBusy = (state.transactions.wipBatches || []).some(
                      b => b.targetMachineId === m.id && b.status === 'SEDANG_PRODUKSI'
                    );
                    const statusBadge = m.status === 'OPERATIONAL' ? 'Operasional' : m.status === 'MAINTENANCE' ? 'Maintenance' : 'Stop';
                    return (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name} [{statusBadge}] {isBusy ? '⛔ [SIBUK]' : isPreferred ? '⭐ [WIP]' : '✅'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Target Transfer Tank Selection (Multi-tank support: Holding Tanks & Storage Tanks) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-purple-300 font-semibold flex items-center space-x-1">
                    <Database className="w-3.5 h-3.5 text-purple-400" />
                    <span>Tangki Transfer *</span>
                  </label>
                  {selectedTargetTankId && (
                    <span className="text-[10px] text-purple-400 font-mono">
                      {state.master.tanks.find(t => t.id === selectedTargetTankId)?.code || ''}
                    </span>
                  )}
                </div>
                <select
                  value={selectedTargetTankId}
                  onChange={(e) => setSelectedTargetTankId(e.target.value)}
                  disabled={!wipId}
                  required
                  className="w-full bg-slate-800 border border-purple-500/50 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-400 font-semibold text-xs disabled:opacity-50"
                >
                  <option value="">-- Pilih Tangki Penampungan --</option>
                  {state.master.tanks.map(t => {
                    const isLinkedToWip = selectedWipObj?.targetTankIds?.includes(t.id) || selectedWipObj?.targetTankId === t.id;
                    const isHT = t.type === 'HOLDING_TANK';
                    const availableSpace = Math.max(0, t.capacityKg - t.currentLevelKg);
                    return (
                      <option key={t.id} value={t.id}>
                        [{isHT ? 'HT' : 'ST'}] {t.code} (Sisa: {availableSpace.toFixed(0)} kg) {isLinkedToWip ? '⭐ [DITAUTKAN]' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Fixed Batch Count (1 batch per production period rule) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Jumlah Batch
                  </label>
                  <span className="text-[10px] text-amber-400 font-mono">Terkunci: 1 Batch</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    disabled
                    value="1.0000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold cursor-not-allowed text-xs"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 font-mono">
                    1 Batch
                  </span>
                </div>
              </div>
            </div>

            {/* Active Recipe Summary Preview */}
            {activeRecipeObj && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-800/80 rounded-xl border border-amber-500/30 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-slate-300">
                    Resep Formulasi Acuan: <strong className="text-white font-mono">[{activeRecipeObj.recipeCode}]</strong> <strong className="text-amber-300">{activeRecipeObj.recipeName}</strong>
                  </span>
                  {activeRecipeObj.isDefault && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                      Resep Utama (Default)
                    </span>
                  )}
                  {activeRecipeObj.description && (
                    <span className="text-slate-400 text-[11px] hidden md:inline">({activeRecipeObj.description})</span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                  <span>Bobot Resep: <strong className="text-cyan-300">{activeRecipeObj.totalWeightKg.toFixed(4)} kg/batch</strong></span>
                  <span>Komposisi: <strong className="text-amber-300">{activeRecipeObj.items.length} Bahan (Padat/Bubuk/Liquid)</strong></span>
                </div>
              </div>
            )}

            {/* Selected Machine Detail Card Preview */}
            {selectedMachineId && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-800/70 rounded-xl border border-cyan-500/30 text-xs">
                {(() => {
                  const m = state.master.machines.find(mach => mach.id === selectedMachineId);
                  if (!m) return null;
                  const isBusy = (state.transactions.wipBatches || []).some(
                    b => b.targetMachineId === m.id && b.status === 'SEDANG_PRODUKSI'
                  );
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="p-1 rounded-lg bg-cyan-500/20 text-cyan-400">
                          <Cpu className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-slate-300">
                          Mesin: <strong className="text-white">{m.code} - {m.name}</strong> ({m.line})
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status === 'OPERATIONAL'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}>
                          {m.status === 'OPERATIONAL' ? 'Status: Operasional' : `Status: ${m.status}`}
                        </span>
                        {isBusy && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                            Sedang Memproses Batch Lain
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-400">
                        <span>Kapasitas: <strong className="text-cyan-300">{m.capacityKgPerHour} kg/jam</strong></span>
                        {selectedWipObj && (
                          <span>
                            Tangki Tujuan: <strong className="text-purple-300">{state.master.tanks.find(t => t.id === selectedWipObj.targetTankId)?.code || 'Holding Tank'}</strong>
                          </span>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Operator, Shift Selection, Duration, and Notes row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Operator Penanggung Jawab
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    placeholder="Contoh: Sutrisno (Leader Batching)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Shift Selector */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Shift Operator (3 Shift)
                </label>
                <select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(Number(e.target.value) as ShiftNumber)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 font-semibold"
                >
                  <option value={1}>Shift 1 (07:01 - 15:00)</option>
                  <option value={2}>Shift 2 (15:01 - 23:00)</option>
                  <option value={3}>Shift 3 (23:01 - 07:00)</option>
                </select>
              </div>

              {/* Konfigurasi Lama Waktu Produksi WIP (Menit) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-amber-300 flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Lama Waktu Produksi</span>
                  </label>
                  <span className="text-[10px] text-amber-400 font-mono font-bold">
                    {batchDurationMinutes} mnt
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min="1"
                    max="720"
                    value={batchDurationMinutes}
                    onChange={(e) => setBatchDurationMinutes(e.target.value)}
                    required
                    className="w-20 bg-slate-800 border border-amber-500/50 rounded-xl px-2.5 py-2 text-white font-mono font-bold focus:outline-none focus:border-amber-400 text-xs"
                  />
                  <div className="grid grid-cols-4 gap-0.5 flex-1">
                    {['15', '30', '45', '60'].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setBatchDurationMinutes(mins)}
                        className={`py-1 rounded text-[10px] font-mono transition text-center ${
                          batchDurationMinutes === mins
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Catatan Batch / Line
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Batching line wafer shift 1"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            {/* STRICT MACHINE BATCH PRODUCTION LOCK & LIVE PROGRESS BANNER */}
            {activeBatchForSelectedMachine && (() => {
              const estTime = activeBatchForSelectedMachine.estimatedCompletionTime
                ? new Date(activeBatchForSelectedMachine.estimatedCompletionTime).getTime()
                : null;
              const remainingMs = estTime ? estTime - currentTime : 0;
              const isOverdue = estTime ? remainingMs <= 0 : false;
              const remMins = Math.floor(Math.abs(remainingMs) / 60000);
              const remSecs = Math.floor((Math.abs(remainingMs) % 60000) / 1000);
              const targetTank = state.master.tanks.find(t => t.id === activeBatchForSelectedMachine.targetTankId || t.assignedWipId === activeBatchForSelectedMachine.wipId);
              const targetMach = state.master.machines.find(m => m.id === activeBatchForSelectedMachine.targetMachineId);

              return (
                <div className="bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900 border border-amber-500/50 p-4 rounded-2xl space-y-3 shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 animate-pulse">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs sm:text-sm flex items-center space-x-2">
                          <span>Mesin Sedang Memproses Batch di Lantai Produksi</span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[10px] font-mono">
                            {activeBatchForSelectedMachine.batchCode}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Mesin: <strong className="text-cyan-400">{targetMach ? `${targetMach.code} - ${targetMach.name}` : 'Mesin'}</strong> • WIP: <strong>"{activeBatchForSelectedMachine.wipName}"</strong> • {activeBatchForSelectedMachine.batchWeightKg.toFixed(2)} kg • Operator: <strong>{activeBatchForSelectedMachine.operatorName}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Live Timer Pill */}
                    <div className="text-right shrink-0 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-amber-500/40">
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">
                        {isOverdue ? 'Status Waktu' : 'Sisa Durasi Siklus'}
                      </span>
                      <span className={`font-mono text-sm font-black ${
                        isOverdue ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
                      }`}>
                        {isOverdue
                          ? '🔔 SELESAI (Picu Alarm)'
                          : `⏱️ ${remMins}m ${String(remSecs).padStart(2, '0')}s`}
                      </span>
                    </div>
                  </div>

                  {/* Destination Tank & Machine Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-slate-800">
                    {targetMach && (
                      <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px]">
                        Mesin: <strong className="text-cyan-400">{targetMach.code} - {targetMach.name}</strong>
                      </span>
                    )}
                    {targetTank && (
                      <span className="px-2 py-1 rounded-lg bg-cyan-950/70 text-cyan-200 border border-cyan-700/60 font-mono text-[11px]">
                        ➔ Tujuan Transfer: <strong className="text-cyan-300">{targetTank.code} ({targetTank.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})</strong>
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 ml-auto italic">
                      Otomatis tertransfer ke tangki & alarm berbunyi saat durasi tuntas.
                    </span>
                  </div>

                  {/* Direct Action to complete or cancel */}
                  <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onCancelWipBatch(activeBatchForSelectedMachine.id)}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-slate-800 text-rose-400 hover:bg-slate-700 text-xs font-semibold transition"
                    >
                      Batalkan Perintah Kerja
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompleteWipBatch(activeBatchForSelectedMachine.id)}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>⚡ Selesai Sekarang & Uji Alarm Notifikasi ({activeBatchForSelectedMachine.batchCode})</span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* INTEGRATED BOM MATERIAL BREAKDOWN CARD (Auto-determined when WIP and Recipe are selected) */}
            {selectedWipObj && (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-1 rounded-lg bg-amber-500/10 text-amber-400">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-white">
                        Formulasi {activeRecipeObj ? `Resep [${activeRecipeObj.recipeCode}]` : 'BOM Terpisah'} untuk 1 Batch: {selectedWipObj.name}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {activeRecipeObj
                          ? `Komposisi bahan baku ditentukan dari Resep Formulasi: ${activeRecipeObj.recipeName} (${activeRecipeObj.items.length} bahan: Padat, Bubuk, Liquid)`
                          : 'Material terpakai langsung ditentukan otomatis dari database BOM terhubung'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400">Bobot Formulasi: </span>
                    <span className="font-mono font-bold text-cyan-400 text-xs sm:text-sm">
                      {totalBOMKg.toFixed(4)} kg
                    </span>
                    <span className="text-[10px] text-slate-500 ml-1">
                      / Target: {selectedWipObj.batchWeightKg.toFixed(4)} kg
                    </span>
                  </div>
                </div>

                {configuredMaterials.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/80 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                          <th className="py-2.5 px-3">Bahan Baku (Database)</th>
                          <th className="py-2.5 px-3">Tipe & Kemasan</th>
                          <th className="py-2.5 px-3">Takaran Resep</th>
                          <th className="py-2.5 px-3">Lokasi Ambil</th>
                          <th className="py-2.5 px-3 text-right">Stok Tersedia</th>
                          <th className="py-2.5 px-3 text-right">Standar Resep (kg)</th>
                          <th className="py-2.5 px-3 text-right font-bold text-purple-300">Aktual Dipakai (kg)</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {configuredMaterials.map(item => {
                          const bal = stockBalances[item.materialId];
                          let available = 0;
                          if (bal) {
                            if (item.sourceLocation === 'CK') available = bal.stockCk;
                            else if (item.sourceLocation === 'WINEROTO') available = bal.stockWineroto;
                            else if (item.sourceLocation === 'STORAGE_TANK') available = bal.stockTank;
                          }
                          const isInsufficient = item.actualUsedKg > available;

                          const typeBadgeColor =
                            item.materialType === 'padat'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : item.materialType === 'liquid'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';

                          const availablePallets = getMaterialPalletInventory(state, item.materialId, item.sourceLocation);
                          const hasPallets = availablePallets.length > 0;
                          const isExpanded = expandedPalletMatId === item.materialId;
                          const totalAllocatedBags = (item.palletAllocations || []).reduce((sum, a) => sum + a.bagsUsed, 0);

                          return (
                            <React.Fragment key={item.materialId}>
                              <tr className={`hover:bg-slate-900/50 transition ${isExpanded ? 'bg-slate-900/90' : ''}`}>
                                <td className="py-2.5 px-3 font-medium text-white">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                                      {item.materialCode}
                                    </span>
                                    <span>{item.materialName}</span>
                                  </div>
                                  {hasPallets && (
                                    <div className="mt-1 flex items-center space-x-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setExpandedPalletMatId(isExpanded ? null : item.materialId)}
                                        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition border ${
                                          isExpanded
                                            ? 'bg-purple-900/60 text-purple-200 border-purple-500/60 shadow-sm'
                                            : 'bg-slate-800 text-amber-300 border-amber-500/30 hover:bg-slate-700'
                                        }`}
                                        title="Klik untuk membuka rincian alokasi kelompok/pallet FIFO terkunci"
                                      >
                                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                                        <span>Pallet FIFO ({totalAllocatedBags} Zak)</span>
                                        {isExpanded ? (
                                          <ChevronUp className="w-3 h-3 text-purple-300" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3 text-amber-400" />
                                        )}
                                      </button>
                                      <span className="text-[9px] text-slate-400 font-mono">
                                        ({availablePallets.length} pallet tersedia)
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-400">
                                  <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] uppercase font-bold border mr-1 ${typeBadgeColor}`}>
                                    {item.materialType}
                                  </span>
                                  <span className="text-[10px]">{item.packaging}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-amber-300">
                                  <div className="flex flex-col">
                                    <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] font-semibold w-fit">
                                      {item.recipeAmount !== undefined ? `${item.recipeAmount} ${item.unit || 'kg'}` : `${item.requiredKg.toFixed(4)} kg`}
                                    </span>
                                    {item.palletAllocations && item.palletAllocations.length > 0 && Math.abs(item.actualUsedKg - item.requiredKg) > 0.001 && (
                                      <span className="text-[9px] text-cyan-300 font-mono mt-0.5" title="Disesuaikan berat kemasan FIFO tanpa mengambil zak tambahan dari lot selanjutnya">
                                        ➔ Pas FIFO: {item.actualUsedKg.toFixed(2)} kg
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <select
                                    value={item.sourceLocation}
                                    onChange={(e) => handleLocationChange(item.materialId, e.target.value as StorageLocation)}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white"
                                  >
                                    <option value="CK">Area CK</option>
                                    <option value="WINEROTO">Area WINEROTO</option>
                                    <option value="STORAGE_TANK">Tank Liquid (1.000 kg)</option>
                                  </select>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                  <span className={isInsufficient ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                                    {available.toFixed(4)} kg
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                  {item.requiredKg.toFixed(4)} kg
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  {hasPallets ? (
                                    <div className="flex flex-col items-end">
                                      <div className="relative">
                                        <input
                                          type="number"
                                          step="0.0001"
                                          required
                                          readOnly
                                          value={item.actualUsedKg}
                                          onClick={() => setExpandedPalletMatId(isExpanded ? null : item.materialId)}
                                          title="Bobot aktual terkunci otomatis dari timbangan unit kelompok/pallet FIFO. Klik untuk atur zak per pallet."
                                          className="w-24 bg-slate-950 border border-amber-500/60 rounded-lg px-2 py-1 text-right text-amber-300 font-mono font-bold cursor-pointer hover:border-amber-400"
                                        />
                                        <Lock className="w-2.5 h-2.5 text-amber-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                      </div>
                                      <span className="text-[9px] text-amber-400/90 font-mono mt-0.5">
                                        🔒 Pas FIFO ({totalAllocatedBags} Zak)
                                      </span>
                                      {item.palletAllocations && item.palletAllocations.length > 0 && Math.abs(item.actualUsedKg - item.requiredKg) > 0.001 && (
                                        <span className="text-[8px] text-slate-400 font-mono">
                                          (Tanpa ambil zak lain)
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <input
                                      type="number"
                                      step="0.0001"
                                      required
                                      value={item.actualUsedKg}
                                      onChange={(e) =>
                                        handleUpdateMaterialRow(item.materialId, {
                                          actualUsedKg: parseFloat(e.target.value) || 0
                                        })
                                      }
                                      className="w-24 bg-slate-900 border border-purple-500/50 rounded-lg px-2 py-1 text-right text-purple-300 font-mono font-bold focus:outline-none focus:border-purple-400"
                                    />
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  {isInsufficient ? (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                      Stok Kurang
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      Cukup
                                    </span>
                                  )}
                                </td>
                              </tr>

                              {/* EXPANDED FIFO PALLET ALLOCATION DRAWER */}
                              {isExpanded && hasPallets && (
                                <tr className="bg-slate-950/90 border-b border-purple-500/30">
                                  <td colSpan={8} className="p-3">
                                    <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-3.5 space-y-3 shadow-xl">
                                      {/* Header Drawer */}
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-800 gap-2">
                                        <div className="flex items-center space-x-2">
                                          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                                            <PackageCheck className="w-4 h-4" />
                                          </div>
                                          <div>
                                            <h5 className="font-bold text-xs text-white flex items-center space-x-1.5">
                                              <span>Alokasi Unit Kelompok / Pallet FIFO: {item.materialName}</span>
                                              <span className="px-2 py-0.2 rounded text-[10px] font-mono bg-purple-950 border border-purple-500/40 text-purple-300">
                                                Lokasi {item.sourceLocation}
                                              </span>
                                            </h5>
                                            <p className="text-[10px] text-slate-400">
                                              Penyimpanan dikunci per pallet dengan berat per zak dari penerimaan GDRM. Alokasi otomatis urut FIFO (terlama didahulukan).
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                          <button
                                            type="button"
                                            onClick={() => handleResetFifo(item.materialId)}
                                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[10px] font-semibold flex items-center space-x-1 transition"
                                          >
                                            <RefreshCw className="w-3 h-3" />
                                            <span>⚡ Reset ke FIFO Otomatis</span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* Summary Metrics Bar */}
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-[11px] font-mono">
                                        <div>
                                          <span className="text-slate-400 block text-[10px]">Target Kebutuhan Resep:</span>
                                          <span className="text-white font-bold">{item.requiredKg.toFixed(4)} kg</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block text-[10px]">Total Aktual Dialokasikan:</span>
                                          <span className="text-cyan-400 font-bold">
                                            {item.actualUsedKg.toFixed(4)} kg ({totalAllocatedBags} Zak)
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block text-[10px]">Selisih dari Resep:</span>
                                          <span className={item.actualUsedKg >= item.requiredKg ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                                            {(item.actualUsedKg - item.requiredKg) > 0 ? '+' : ''}{(item.actualUsedKg - item.requiredKg).toFixed(4)} kg
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block text-[10px]">Status Kunci Bobot:</span>
                                          <span className="text-amber-300 font-bold flex items-center space-x-1">
                                            <Lock className="w-3 h-3 text-amber-400" />
                                            <span>Terkunci Unit Pallet</span>
                                          </span>
                                        </div>
                                      </div>

                                      {/* List of Available Pallets in strict FIFO order */}
                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-semibold">
                                          <span>Daftar Pallet Gudang (Urutan FIFO: Tanggal Kedatangan Terlama ➔ Terbaru)</span>
                                          <span>Jumlah Zak Dialokasikan ke Batch</span>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2">
                                          {availablePallets.map((lot, pIdx) => {
                                            const currentAlloc = (item.palletAllocations || []).find(a => a.palletId === lot.palletId);
                                            const bagsUsed = currentAlloc ? currentAlloc.bagsUsed : 0;
                                            const subtotalKg = currentAlloc ? currentAlloc.subtotalKg : 0;
                                            const isAllocated = bagsUsed > 0;
                                            const isOldestFifo = pIdx === 0;

                                            return (
                                              <div
                                                key={lot.palletId}
                                                className={`p-3 rounded-xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                                  isAllocated
                                                    ? 'bg-purple-950/30 border-purple-500/50 shadow-md shadow-purple-950/20'
                                                    : 'bg-slate-950/60 border-slate-800 opacity-80 hover:opacity-100'
                                                }`}
                                              >
                                                {/* Left Details */}
                                                <div className="space-y-1">
                                                  <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                                      isOldestFifo
                                                        ? 'bg-amber-950 text-amber-300 border-amber-600/50'
                                                        : 'bg-slate-800 text-slate-300 border-slate-700'
                                                    }`}>
                                                      FIFO #{pIdx + 1} {isOldestFifo ? '⭐ Tertua / Prioritas' : ''}
                                                    </span>
                                                    <span className="font-bold text-white text-xs">
                                                      {lot.palletLabel}
                                                    </span>
                                                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                                      {lot.receiptNumber}
                                                    </span>
                                                    {lot.batchLotNumber && (
                                                      <span className="text-[10px] text-slate-400 font-mono">
                                                        (Lot: {lot.batchLotNumber})
                                                      </span>
                                                    )}
                                                    <span className="text-[10px] text-slate-500">
                                                      Masuk: {lot.date}
                                                    </span>
                                                  </div>

                                                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-300">
                                                    <span>
                                                      Sisa Gudang: <strong className="text-white">{lot.remainingBags} Zak</strong> ({(lot.remainingKg).toFixed(2)} kg)
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold inline-flex items-center space-x-1">
                                                      <Lock className="w-2.5 h-2.5 text-amber-400" />
                                                      <span>Terkunci: {lot.weightPerBagKg.toFixed(2)} kg/zak</span>
                                                    </span>
                                                  </div>
                                                </div>

                                                {/* Right Allocation Controls */}
                                                <div className="flex items-center space-x-3 shrink-0 self-end md:self-center">
                                                  <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
                                                    <button
                                                      type="button"
                                                      onClick={() => handleAdjustPalletBags(item.materialId, lot.palletId, bagsUsed - 1)}
                                                      disabled={bagsUsed <= 0}
                                                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-sm"
                                                    >
                                                      -
                                                    </button>
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      max={lot.remainingBags}
                                                      value={bagsUsed}
                                                      onChange={(e) => handleAdjustPalletBags(item.materialId, lot.palletId, parseInt(e.target.value) || 0)}
                                                      className="w-14 text-center bg-transparent text-white font-mono font-bold text-xs focus:outline-none"
                                                    />
                                                    <button
                                                      type="button"
                                                      onClick={() => handleAdjustPalletBags(item.materialId, lot.palletId, bagsUsed + 1)}
                                                      disabled={bagsUsed >= lot.remainingBags}
                                                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center font-bold text-sm"
                                                    >
                                                      +
                                                    </button>
                                                  </div>

                                                  <div className="text-right font-mono min-w-[90px]">
                                                    <span className="text-[10px] text-slate-400 block">Bobot Terpakai:</span>
                                                    <span className={`text-xs font-bold ${isAllocated ? 'text-cyan-400' : 'text-slate-500'}`}>
                                                      {subtotalKg.toFixed(2)} kg
                                                    </span>
                                                  </div>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    <p className="font-medium text-slate-400">
                      WIP ini belum memiliki bahan baku di hierarki BOM Master.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Silakan hubungkan bahan baku ke WIP ini pada modul Master Data & BOM Hierarki.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Action Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={Boolean(activeBatchForSelectedMachine) || !wipId || !selectedMachineId || configuredMaterials.length === 0}
                className={`w-full py-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-lg ${
                  activeBatchForSelectedMachine || !wipId || !selectedMachineId || configuredMaterials.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 active:scale-95'
                }`}
              >
                {activeBatchForSelectedMachine ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Mesin Terkunci: {selectedMachObj?.name || 'Mesin ini'} Sedang Memproses Batch ({activeBatchForSelectedMachine.batchCode})</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    <span>Mulai Produksi 1 Batch WIP pada {selectedMachObj?.code || 'Mesin Terpilih'} & Potong Stok Sesuai BOM</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: DAFTAR STATUS PERINTAH KERJA BATCH WIP */}
      {activeTab === 'batch-history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
          {/* Printable Report Header */}
          <div className="print-only p-4 border-b-2 border-slate-900 mb-2">
            <h1 className="text-lg font-bold">PRODTRACK - LAPORAN STATUS PERINTAH KERJA BATCH WIP</h1>
            <p className="text-xs text-slate-700">
              Dicetak pada: {formatIndonesianDate()} | Filter: {filterShift === 'all' ? 'Semua Shift' : `Shift ${filterShift}`} | Total Batch: {filteredBatches.length}
            </p>
          </div>

          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 no-print">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">
                  Daftar Perintah Kerja Produksi Batch WIP
                </h3>
                <p className="text-[11px] text-slate-400">
                  Pelacakan siklus batch 1-per-periode per jenis WIP
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {/* Shift Filter Pills */}
              <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                {(['all', '1', '2', '3'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterShift(tab)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                      filterShift === tab
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari kode PK / nama WIP..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
              </div>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Cetak Laporan Perintah Kerja Batch"
              >
                <Printer className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Cetak</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                  <th className="py-2.5 px-3">No. Perintah Kerja</th>
                  <th className="py-2.5 px-3">Shift</th>
                  <th className="py-2.5 px-3">Jenis WIP</th>
                  <th className="py-2.5 px-3">Mesin Produksi</th>
                  <th className="py-2.5 px-3">Target SKU</th>
                  <th className="py-2.5 px-3 text-right">Bobot 1 Batch</th>
                  <th className="py-2.5 px-3">Waktu Mulai / Selesai</th>
                  <th className="py-2.5 px-3">Operator</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredBatches.length > 0 ? (
                  filteredBatches.map(batch => (
                    <tr key={batch.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-white">
                        <span>{batch.batchCode}</span>
                        <span className="block text-[10px] text-slate-500 font-normal">
                          {batch.materials.length} komponen bahan
                        </span>
                        {batch.materials.some(m => m.palletAllocations && m.palletAllocations.length > 0) && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                            🔒 FIFO Pallet
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {(() => {
                          const sNum = (batch.shift || 1) as ShiftNumber;
                          const sInfo = SHIFTS_CONFIG[sNum] || SHIFTS_CONFIG[1];
                          return (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}>
                              {sInfo.shortLabel}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-medium text-white block">{batch.wipName}</span>
                        {batch.recipeCode && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-mono">
                            {batch.recipeCode} {batch.recipeName ? `(${batch.recipeName})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {(() => {
                          const mach = state.master.machines.find(m => m.id === batch.targetMachineId);
                          if (!mach) return <span className="text-slate-500 font-mono text-[11px]">-</span>;
                          return (
                            <div>
                              <span className="font-mono text-cyan-300 font-semibold block text-[11px]">{mach.code}</span>
                              <span className="text-[10px] text-slate-300 block">{mach.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono">{mach.line}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {batch.skuName || '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-cyan-400">
                        {batch.batchWeightKg.toFixed(4)} kg
                      </td>
                      <td className="py-3 px-3 text-slate-400 text-[11px]">
                        <div>Mulai: {batch.startedAt}</div>
                        {batch.durationMinutes && (
                          <div className="text-[10px] text-amber-400/90 font-mono">
                            ⏱️ Durasi: {batch.durationMinutes} menit
                          </div>
                        )}
                        {batch.completedAt && (
                          <div className="text-emerald-400 text-[10px] font-semibold">Selesai: {batch.completedAt}</div>
                        )}
                        {batch.status === 'SEDANG_PRODUKSI' && batch.estimatedCompletionTime && (() => {
                          const rem = new Date(batch.estimatedCompletionTime).getTime() - currentTime;
                          const isDone = rem <= 0;
                          const m = Math.floor(Math.abs(rem) / 60000);
                          const s = Math.floor((Math.abs(rem) % 60000) / 1000);
                          return (
                            <div className={`text-[10px] font-mono font-bold mt-0.5 ${isDone ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`}>
                              {isDone ? '🔔 Selesai (Alarm)' : `Sisa: ${m}m ${String(s).padStart(2, '0')}s`}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {batch.operatorName}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          batch.status === 'SEDANG_PRODUKSI'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                            : batch.status === 'SELESAI'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {batch.status === 'SEDANG_PRODUKSI'
                            ? 'Sedang Produksi'
                            : batch.status === 'SELESAI'
                            ? 'Selesai'
                            : 'Dibatalkan'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {batch.status === 'SEDANG_PRODUKSI' ? (
                          <button
                            onClick={() => onCompleteWipBatch(batch.id)}
                            className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center space-x-1"
                            title="Selesaikan batch seketika dan bunyikan alarm peringatan"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>⚡ Selesai & Alarm</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 flex items-center justify-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Tuntas</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-500 text-xs">
                      Belum ada perintah kerja batch WIP yang cocok dengan filter pencarian / shift.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RIWAYAT DETAIL LOG PEMAKAIAN BAHAN BAKU */}
      {activeTab === 'material-history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                <History className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Laporan Pemakaian Bahan Baku</h3>
                <p className="text-[11px] text-slate-400">
                  {usageViewMode === 'breakdown-sku-wip'
                    ? 'Dipisahkan sesuai dengan SKU dan Jenis WIP yang diproduksi'
                    : 'Daftar riwayat pemotongan stok bahan baku per transaksi kronologis'}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto no-print">
              {/* Shift Filter Pills */}
              <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                {(['all', '1', '2', '3'] as const).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterShift(tab)}
                    className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition ${
                      filterShift === tab
                        ? 'bg-purple-600 text-white font-bold shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari SKU, WIP, material..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
                />
              </div>

              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                title="Cetak Log Pemakaian Material"
              >
                <Printer className="w-3.5 h-3.5 text-purple-400" />
                <span>Cetak</span>
              </button>
            </div>
          </div>

          {/* Subheader: View Mode Switch & SKU/WIP Filters */}
          <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs no-print">
            <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setUsageViewMode('breakdown-sku-wip')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  usageViewMode === 'breakdown-sku-wip'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Dipisah per SKU & WIP</span>
              </button>

              <button
                type="button"
                onClick={() => setUsageViewMode('list')}
                className={`px-2.5 py-1 rounded-lg font-bold text-xs transition flex items-center space-x-1.5 ${
                  usageViewMode === 'list'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Daftar Transaksi Kronologis ({filteredUsages.length})</span>
              </button>
            </div>

            {usageViewMode === 'breakdown-sku-wip' && (
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-slate-400">SKU:</span>
                  <select
                    value={usageFilterSkuId}
                    onChange={(e) => setUsageFilterSkuId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="all">Semua SKU ({state.master.skus.length})</option>
                    {state.master.skus.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    <option value="UNLINKED_SKU">Produksi WIP Langsung</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1">
                  <span className="text-[11px] text-slate-400">WIP:</span>
                  <select
                    value={usageFilterWipId}
                    onChange={(e) => setUsageFilterWipId(e.target.value)}
                    className="bg-slate-850 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-purple-500 font-medium"
                  >
                    <option value="all">Semua Jenis WIP ({state.master.wips.length})</option>
                    {state.master.wips.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* VIEW MODE 1: PISAHKAN PEMAKAIAN BAHAN BAKU SESUAI SKU & WIP */}
          {usageViewMode === 'breakdown-sku-wip' ? (
            <div className="p-4 space-y-4">
              {usageBreakdownGroups.length > 0 ? (
                usageBreakdownGroups.map((group) => (
                  <div
                    key={group.groupKey}
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition hover:border-slate-700"
                  >
                    {/* Header Group per SKU & WIP */}
                    <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-purple-950/40 p-3.5 sm:p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700 font-bold">
                            {group.skuCode}
                          </span>
                          <h4 className="font-bold text-sm text-white">
                            {group.skuName}
                          </h4>
                          {group.isKite && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              KITE
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                          <span className="text-slate-400">Jenis WIP:</span>
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold">
                            {group.wipName}
                          </span>
                        </div>
                      </div>

                      {/* Summary Metrics Pill for this SKU & WIP */}
                      <div className="flex items-center space-x-2">
                        <div className="bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-700/80 text-right">
                          <span className="text-[10px] text-slate-400 block font-mono">Total Terpakai:</span>
                          <span className="text-xs font-bold font-mono text-rose-400">
                            -{group.totalGroupKg.toFixed(4)} kg
                          </span>
                        </div>
                        <div className="bg-purple-950/40 px-3 py-1.5 rounded-xl border border-purple-500/30 text-right">
                          <span className="text-[10px] text-purple-300 block font-mono">Est. Output Batch:</span>
                          <span className="text-xs font-bold font-mono text-purple-300">
                            {group.totalGroupBatches.toFixed(2)} btc
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Table of raw materials consumed under this SKU & WIP */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-900/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                            <th className="py-2 px-3 text-center w-10">No</th>
                            <th className="py-2 px-3">Kode Material</th>
                            <th className="py-2 px-3">Nama Bahan Baku</th>
                            <th className="py-2 px-3">Gudang Sumber</th>
                            <th className="py-2 px-3">Shift & Frekuensi</th>
                            <th className="py-2 px-3 text-right text-rose-400 font-bold">Qty Terpakai (kg)</th>
                            <th className="py-2 px-3 text-right text-purple-300 font-bold">Kesetaraan Batch</th>
                            <th className="py-2 px-3">Operator PIC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {group.materials.map((m, mIdx) => (
                            <tr key={m.materialId} className="hover:bg-slate-800/30 transition text-xs">
                              <td className="py-2.5 px-3 text-center text-slate-500 font-mono">
                                {mIdx + 1}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">
                                <span className="px-1.5 py-0.5 rounded bg-slate-850 border border-slate-750 text-[10px]">
                                  {m.materialCode}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-white">
                                <div>{m.materialName}</div>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  Standar Formula: {m.batchSizeKg.toFixed(2)} kg/batch
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-750 text-[10px] text-slate-300">
                                  {m.locations.join(', ') || 'CK'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                <span>{m.shifts.map(s => `Shift ${s}`).join(', ') || '-'}</span>
                                <span className="text-[10px] text-slate-500 block">({m.usageCount}x pemakaian)</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                                -{m.totalUsageKg.toFixed(4)} kg
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-300">
                                {m.estimatedBatch.toFixed(2)} btc
                              </td>
                              <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                                {m.operators.join(', ') || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 text-xs">
                  <Boxes className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-white">
                    Belum ada riwayat pemakaian bahan baku yang cocok dengan filter.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Pastikan sudah terdapat transaksi Work Order pemakaian bahan baku pada shift ini.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* VIEW MODE 2: DAFTAR TRANSAKSI KRONOLOGIS */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                    <th className="py-2.5 px-3">No. Transaksi</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Tanggal</th>
                    <th className="py-2.5 px-3">SKU Produk</th>
                    <th className="py-2.5 px-3">WIP Terkait</th>
                    <th className="py-2.5 px-3">Nama Material</th>
                    <th className="py-2.5 px-3 text-right font-bold text-rose-400">Qty Terpakai</th>
                    <th className="py-2.5 px-3 text-center">Gudang</th>
                    <th className="py-2.5 px-3">Operator / Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsages.length > 0 ? (
                    filteredUsages.map(u => {
                      const sObj = state.master.skus.find(s => s.id === u.skuId);
                      const wObj = state.master.wips.find(w => w.id === u.wipId);
                      const mObj = state.master.materials.find(m => m.id === u.materialId);

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 font-mono font-semibold text-white">
                            {u.usageNumber}
                          </td>
                          <td className="py-3 px-3">
                            {(() => {
                              const sNum = (u.shift || 1) as ShiftNumber;
                              const sInfo = SHIFTS_CONFIG[sNum] || SHIFTS_CONFIG[1];
                              return (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}>
                                  {sInfo.shortLabel}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px]">
                            {u.date}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {sObj ? sObj.name : 'Produksi WIP Langsung'}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {wObj ? wObj.name : '-'}
                          </td>
                          <td className="py-3 px-3 font-medium text-white">
                            {mObj ? mObj.name : '-'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-rose-400">
                            <div>-{u.usageQty.toFixed(4)} kg</div>
                            {u.palletAllocations && u.palletAllocations.length > 0 && (
                              <div className="text-[9px] text-amber-400 font-normal mt-0.5">
                                🔒 FIFO ({u.palletAllocations.reduce((sum, a) => sum + a.bagsUsed, 0)} Zak)
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
                              {u.sourceLocation}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            <span className="text-white block">{u.operatorName || '-'}</span>
                            <span className="text-[10px] text-slate-400 block">{u.notes || ''}</span>
                            {u.palletAllocations && u.palletAllocations.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {u.palletAllocations.map((a, aIdx) => (
                                  <span key={aIdx} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30">
                                    {a.palletLabel}: {a.bagsUsed} zak @ {a.weightPerBagKg.toFixed(2)} kg = {a.subtotalKg.toFixed(2)} kg
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-slate-500 text-xs">
                        Belum ada riwayat pemakaian material yang cocok dengan filter pencarian / shift.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LOG AKTIVITAS 3 SHIFT (SHIFT ACTIVITY LOG) */}
      {activeTab === 'shift-activity' && (
        <div className="space-y-4">
          {/* Printable Report Header */}
          <div className="print-only p-4 border-b-2 border-slate-900 mb-2">
            <h1 className="text-lg font-bold">PRODTRACK - LAPORAN LOG AKTIVITAS PEMAKAIAN MATERIAL 3 SHIFT</h1>
            <p className="text-xs text-slate-700">
              Dicetak pada: {formatIndonesianDate()} | Shift Aktif: {currentLiveShift.name} ({currentLiveShift.timeRange}) | Total Terpakai: {(shiftStats[1].totalKg + shiftStats[2].totalKg + shiftStats[3].totalKg).toFixed(4)} kg
            </p>
          </div>

          {/* 3 Shifts Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 no-print">
            {([1, 2, 3] as ShiftNumber[]).map(sNum => {
              const sInfo = SHIFTS_CONFIG[sNum];
              const sStat = shiftStats[sNum];
              const isCurrent = currentLiveShift.shift === sNum;

              return (
                <div
                  key={sNum}
                  className={`p-4 rounded-2xl border shadow-xl space-y-2 transition ${
                    isCurrent
                      ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border-cyan-500/40 ring-1 ring-cyan-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}>
                      {sInfo.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {sInfo.timeRange}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Total Material Terpakai:</span>
                    <div className="text-2xl font-bold font-mono text-white mt-0.5">
                      {sStat.totalKg.toFixed(2)} <span className="text-xs text-slate-400 font-normal">kg</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 text-xs text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>Perintah Kerja Batch WIP:</span>
                      <strong className="text-slate-200 font-mono">{sStat.batchesCount} Batch</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Transaksi Pemakaian:</span>
                      <strong className="text-slate-200 font-mono">{sStat.count} Catatan</strong>
                    </div>
                    <div className="flex justify-between items-center pt-0.5">
                      <span>Operator Bertugas:</span>
                      <span className="text-cyan-400 truncate max-w-[130px] font-medium text-[11px]">
                        {sStat.operators.length > 0 ? sStat.operators.join(', ') : '-'}
                      </span>
                    </div>
                  </div>

                  {isCurrent && (
                    <div className="pt-1">
                      <span className="w-full py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold flex items-center justify-center space-x-1 border border-cyan-500/20">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                        <span>Shift Sedang Beroperasi (Live)</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grouped Tables by Shift */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 no-print">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Shift Activity Log: Pemakaian Material Terkelompok 3 Shift
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Shift 1 (07:01 - 15:00) • Shift 2 (15:01 - 23:00) • Shift 3 (23:01 - 07:00)
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {/* Shift Filter Pills */}
                <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                  {(['all', '1', '2', '3'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterShift(tab)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${
                        filterShift === tab
                          ? 'bg-purple-600 text-white font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tab === 'all' ? 'Semua Shift' : `Shift ${tab}`}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-48">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter nama/kode..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500"
                  />
                </div>

                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shrink-0"
                  title="Cetak Log Aktivitas Shift"
                >
                  <Printer className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Cetak Log</span>
                </button>
              </div>
            </div>

            {/* List of Shift Sections */}
            <div className="divide-y divide-slate-800">
              {([1, 2, 3] as ShiftNumber[])
                .filter(sNum => filterShift === 'all' || String(sNum) === filterShift)
                .map(sNum => {
                  const sInfo = SHIFTS_CONFIG[sNum];
                  const usagesInShift = shiftGroups[sNum] || [];
                  const totalKgInShift = usagesInShift.reduce((acc, curr) => acc + curr.usageQty, 0);
                  const isCurrent = currentLiveShift.shift === sNum;

                  return (
                    <div key={sNum} className="p-4 space-y-3">
                      {/* Shift Header Bar */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center space-x-2.5">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${sInfo.badgeBg} border ${sInfo.borderClass}`}>
                            {sInfo.name}
                          </span>
                          <span className="text-xs text-slate-300 font-mono">
                            {sInfo.timeRange}
                          </span>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold animate-pulse">
                              ● Sedang Berjalan
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 text-xs">
                          <span className="text-slate-400">
                            Total Pemakaian: <strong className="text-rose-400 font-mono">-{totalKgInShift.toFixed(4)} kg</strong>
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className="text-slate-400 font-mono">
                            {usagesInShift.length} Transaksi
                          </span>
                        </div>
                      </div>

                      {/* Shift Usages Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-400 border-b border-slate-800">
                              <th className="py-2.5 px-3">No. Transaksi</th>
                              <th className="py-2.5 px-3">Tanggal</th>
                              <th className="py-2.5 px-3">WIP / SKU Terkait</th>
                              <th className="py-2.5 px-3">Material & Kode</th>
                              <th className="py-2.5 px-3 text-right font-bold text-rose-400">Qty Digunakan</th>
                              <th className="py-2.5 px-3 text-center">Gudang</th>
                              <th className="py-2.5 px-3">Operator & Catatan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {usagesInShift.length > 0 ? (
                              usagesInShift.map(u => {
                                const wObj = state.master.wips.find(w => w.id === u.wipId);
                                const mObj = state.master.materials.find(m => m.id === u.materialId);

                                return (
                                  <tr key={u.id} className="hover:bg-slate-800/40 transition">
                                    <td className="py-2.5 px-3 font-mono font-semibold text-white">
                                      {u.usageNumber}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                                      {u.date}
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      {wObj ? wObj.name : '-'}
                                    </td>
                                    <td className="py-2.5 px-3 font-medium text-white">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                                          {mObj?.code || `MAT-${u.materialId.slice(-4)}`}
                                        </span>
                                        <span>{mObj ? mObj.name : '-'}</span>
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                                      -{u.usageQty.toFixed(4)} kg
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 border border-slate-700 text-slate-300">
                                        {u.sourceLocation}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      <span className="text-white block font-medium">{u.operatorName || '-'}</span>
                                      <span className="text-[10px] text-slate-500">{u.notes || ''}</span>
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={7} className="text-center py-6 text-slate-500 text-xs">
                                  Belum ada aktivitas pemakaian material yang tercatat pada {sInfo.name} ({sInfo.timeRange}).
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {usagesInShift.length > 0 && (
                            <tfoot>
                              <tr className="bg-slate-950/80 font-bold border-t border-slate-800 text-xs">
                                <td colSpan={4} className="py-2 px-3 text-slate-300 text-right">
                                  Subtotal Pemakaian {sInfo.name}:
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-rose-400">
                                  -{totalKgInShift.toFixed(4)} kg
                                </td>
                                <td colSpan={2} className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                                  {usagesInShift.length} transaksi
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
