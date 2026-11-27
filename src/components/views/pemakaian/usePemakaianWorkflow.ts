import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  PalletAllocation,
  StorageLocation,
  WipBatchMaterialItem,
  WipProductionBatch
} from '../../../types';
import {
  calculateFifoPalletAllocation,
  calculateStockBalances,
  getMaterialPalletInventory
} from '../../../utils/storage';
import { getCurrentShift, ShiftNumber } from '../../../utils/shifts';
import { ParsedMaterialQrResult } from '../../../utils/materialQr';
import { QrScanFeedbackState, SuggestedWipsFromScanState } from './utils';

interface UsePemakaianWorkflowParams {
  state: AppState;
  showToast: (msg: string, isError?: boolean) => void;
  onStartWipBatch: (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => void;
}

export const usePemakaianWorkflow = ({
  state,
  showToast,
  onStartWipBatch
}: UsePemakaianWorkflowParams) => {
  const [skuId, setSkuId] = useState('');
  const [wipId, setWipId] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('');
  const [selectedMachineId, setSelectedMachineId] = useState<string>('');
  const [selectedTargetTankId, setSelectedTargetTankId] = useState<string>('');
  const [operatorName, setOperatorName] = useState('');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<
    'batch-order' | 'gantt-schedule' | 'batch-history' | 'material-history' | 'shift-activity'
  >('batch-order');
  const [showInlineGantt, setShowInlineGantt] = useState<boolean>(true);
  const [isBatchOrderFormOpen, setIsBatchOrderFormOpen] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pauseModalBatch, setPauseModalBatch] = useState<WipProductionBatch | null>(null);
  const [isRejectDrawerOpen, setIsRejectDrawerOpen] = useState(false);

  const [filterShift, setFilterShift] = useState<'all' | '1' | '2' | '3'>('all');
  const [batchDurationMinutes, setBatchDurationMinutes] = useState<string>('30');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const currentLiveShift = getCurrentShift(new Date(currentTime));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const [configuredMaterials, setConfiguredMaterials] = useState<WipBatchMaterialItem[]>([]);
  const [expandedPalletMatId, setExpandedPalletMatId] = useState<string | null>(null);

  // QR Scanner & Material Verification (Poka-Yoke)
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isQrLabelOpen, setIsQrLabelOpen] = useState(false);
  const [verifiedMaterialsMap, setVerifiedMaterialsMap] = useState<
    Record<string, { verifiedAt: string; scannedLot?: string }>
  >({});
  const [qrScanFeedback, setQrScanFeedback] = useState<QrScanFeedbackState | null>(null);
  const [suggestedWipsFromScan, setSuggestedWipsFromScan] = useState<SuggestedWipsFromScanState | null>(
    null
  );
  const pendingAutoVerifyRef = useRef<{ materialId: string; lotNumber?: string } | null>(null);

  const stockBalances = useMemo(() => calculateStockBalances(state), [state]);

  const linkedWips = state.master.skuWips.filter(sw => sw.skuId === skuId).map(sw => sw.wipId);
  const availableWips =
    skuId && linkedWips.length > 0
      ? state.master.wips.filter(w => linkedWips.includes(w.id))
      : state.master.wips;

  const selectedWipObj = state.master.wips.find(w => w.id === wipId);
  const selectedSkuObj = state.master.skus.find(s => s.id === skuId);
  const selectedMachObj = state.master.machines.find(m => m.id === selectedMachineId);

  const availableRecipesForWip = useMemo(() => {
    if (!wipId) return [];
    return (state.master.recipes || []).filter(r => r.wipId === wipId);
  }, [state.master.recipes, wipId]);

  const activeRecipeObj = useMemo(
    () => availableRecipesForWip.find(r => r.id === selectedRecipeId) || null,
    [availableRecipesForWip, selectedRecipeId]
  );

  const wipBatchesList = state.transactions.wipBatches || [];
  const allActiveBatches = wipBatchesList.filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  );
  const pausedBatchesCount = allActiveBatches.filter(b => b.status === 'DIJEDA').length;
  const runningBatchesCount = allActiveBatches.filter(b => b.status === 'SEDANG_PRODUKSI').length;

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

  useEffect(() => {
    if (!wipId) {
      setConfiguredMaterials([]);
      return;
    }

    const currentWip = state.master.wips.find(w => w.id === wipId);
    setBatchDurationMinutes(
      currentWip?.productionDurationMinutes ? String(currentWip.productionDurationMinutes) : '30'
    );

    const preferredMachId = currentWip?.assignedMachineIds?.[0] || currentWip?.assignedMachineId;
    if (preferredMachId && state.master.machines.some(m => m.id === preferredMachId)) {
      setSelectedMachineId(preferredMachId);
    } else if (!selectedMachineId && state.master.machines.length > 0) {
      setSelectedMachineId(state.master.machines[0].id);
    }

    const preferredTankId = currentWip?.targetTankIds?.[0] || currentWip?.targetTankId;
    if (preferredTankId && state.master.tanks.some(t => t.id === preferredTankId)) {
      setSelectedTargetTankId(preferredTankId);
    } else if (!selectedTargetTankId && state.master.tanks.length > 0) {
      setSelectedTargetTankId(state.master.tanks[0].id);
    }

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

        const availablePallets = getMaterialPalletInventory(state, it.materialId, defaultLocation);
        let palletAllocations: PalletAllocation[] | undefined;
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
        let palletAllocations: PalletAllocation[] | undefined;
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

    if (pendingAutoVerifyRef.current) {
      const pending = pendingAutoVerifyRef.current;
      setVerifiedMaterialsMap({
        [pending.materialId]: {
          verifiedAt: new Date().toLocaleTimeString('id-ID'),
          scannedLot: pending.lotNumber
        }
      });
      pendingAutoVerifyRef.current = null;
    } else {
      setVerifiedMaterialsMap({});
    }
  }, [
    wipId,
    selectedRecipeId,
    state.master.recipes,
    state.master.wipMats,
    state.master.materials,
    state.transactions.receipts,
    state.transactions.usages
  ]);

  const handleUpdateMaterialRow = (materialId: string, updates: Partial<WipBatchMaterialItem>) => {
    setConfiguredMaterials(prev =>
      prev.map(item => (item.materialId === materialId ? { ...item, ...updates } : item))
    );
  };

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
      if (existingIndex >= 0) currentAllocs[existingIndex] = allocObj;
      else currentAllocs.push(allocObj);
    } else if (existingIndex >= 0) {
      currentAllocs.splice(existingIndex, 1);
    }

    const newTotalKg = currentAllocs.reduce((sum, a) => sum + a.subtotalKg, 0);
    handleUpdateMaterialRow(materialId, {
      palletAllocations: currentAllocs,
      actualUsedKg: parseFloat(newTotalKg.toFixed(4))
    });
  };

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

  const handleStartBatchConfirmed = (
    payload: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>
  ) => {
    onStartWipBatch(payload);
    setNotes('');
    setVerifiedMaterialsMap({});
    setQrScanFeedback(null);
    setSuggestedWipsFromScan(null);
  };

  const handleQrScanMatched = (result: ParsedMaterialQrResult) => {
    const mat = result.matchedMaterial;
    if (!mat) return;
    const codeLabel = mat.code ? `[${mat.code}] ` : '';

    if (wipId && configuredMaterials.length > 0) {
      const matchedRow = configuredMaterials.find(item => item.materialId === mat.id);
      if (matchedRow) {
        setVerifiedMaterialsMap(prev => ({
          ...prev,
          [mat.id]: {
            verifiedAt: new Date().toLocaleTimeString('id-ID'),
            scannedLot: result.lotNumber
          }
        }));
        if (result.location && result.location !== matchedRow.sourceLocation) {
          handleLocationChange(mat.id, result.location);
        }
        const detailText = [
          `Takaran Resep: ${matchedRow.requiredKg.toFixed(4)} kg`,
          `Lokasi: ${result.location || matchedRow.sourceLocation}`,
          result.lotNumber ? `Lot: ${result.lotNumber}` : null
        ]
          .filter(Boolean)
          .join(' · ');

        setQrScanFeedback({
          type: 'success',
          title: `Sesuai Resep WIP: ${codeLabel}${mat.name}`,
          detail: detailText
        });
        showToast(`QR terverifikasi untuk batch: ${codeLabel}${mat.name}`);
      } else {
        setQrScanFeedback({
          type: 'warning',
          title: `Peringatan Poka-Yoke: ${codeLabel}${mat.name} Tidak Ada di Resep`,
          detail: `Material ini bukan komponen dari WIP "${selectedWipObj?.name || '-'}". Periksa kembali kemasan bahan baku sebelum penuangan.`
        });
        showToast(`Peringatan: ${codeLabel}${mat.name} tidak terdaftar pada resep WIP aktif!`, true);
      }
      return;
    }

    const matchingWipIds = new Set<string>();
    (state.master.recipes || []).forEach(rec => {
      if (rec.items?.some(it => it.materialId === mat.id)) {
        matchingWipIds.add(rec.wipId);
      }
    });
    state.master.wipMats.forEach(wm => {
      if (wm.materialId === mat.id) matchingWipIds.add(wm.wipId);
    });

    const candidateWips = availableWips.filter(w => matchingWipIds.has(w.id));
    if (candidateWips.length === 1) {
      const target = candidateWips[0];
      pendingAutoVerifyRef.current = { materialId: mat.id, lotNumber: result.lotNumber };
      setWipId(target.id);
      setSuggestedWipsFromScan(null);
      setQrScanFeedback({
        type: 'success',
        title: `WIP Teridentifikasi: ${target.name}`,
        detail: `${codeLabel}${mat.name} dimuat & diverifikasi otomatis untuk batch ${target.code}.`
      });
      showToast(`Material ${codeLabel}${mat.name} teridentifikasi -> Memuat WIP ${target.name}`);
    } else if (candidateWips.length > 1) {
      setSuggestedWipsFromScan({
        materialId: mat.id,
        materialName: mat.name,
        materialCode: mat.code,
        lotNumber: result.lotNumber,
        wips: candidateWips.map(w => ({ id: w.id, code: w.code, name: w.name }))
      });
      setQrScanFeedback({
        type: 'success',
        title: `Material Teridentifikasi: ${codeLabel}${mat.name}`,
        detail: `Ditemukan di ${candidateWips.length} formula WIP. Pilih WIP target pada daftar yang muncul.`
      });
      showToast(`${codeLabel}${mat.name} cocok dengan ${candidateWips.length} WIP. Silakan pilih target WIP.`);
    } else {
      setQrScanFeedback({
        type: 'warning',
        title: `${codeLabel}${mat.name} Belum Terhubung ke Resep WIP`,
        detail: 'Material ditemukan di database, namun belum ada BOM WIP yang memakai bahan baku ini.'
      });
      showToast(`Material ${codeLabel}${mat.name} ditemukan, namun belum tertaut ke resep WIP.`, true);
    }
  };

  const shiftStats = useMemo(() => {
    const stats: Record<
      ShiftNumber,
      { totalKg: number; count: number; batchesCount: number; operators: string[] }
    > = {
      1: { totalKg: 0, count: 0, batchesCount: 0, operators: [] },
      2: { totalKg: 0, count: 0, batchesCount: 0, operators: [] },
      3: { totalKg: 0, count: 0, batchesCount: 0, operators: [] }
    };
    const opSets: Record<ShiftNumber, Set<string>> = { 1: new Set(), 2: new Set(), 3: new Set() };

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

  const handleQuickSelectFromGantt = ({
    machineId,
    wipId: targetWipId
  }: {
    machineId?: string;
    wipId?: string;
  }) => {
    if (targetWipId) setWipId(targetWipId);
    if (machineId) setSelectedMachineId(machineId);
    setActiveTab('batch-order');
    const mach = machineId ? state.master.machines.find(m => m.id === machineId) : undefined;
    const wip = targetWipId ? state.master.wips.find(w => w.id === targetWipId) : undefined;
    showToast(
      `Jalur dipilih: ${mach ? `${mach.code} (${mach.name})` : 'Mesin'}${wip ? ` · WIP ${wip.name}` : ''}`
    );
  };

  const activeBatchTotalKg = allActiveBatches.reduce((sum, b) => sum + (b.batchWeightKg || 0), 0);
  const operationalMachinesCount = state.master.machines.filter(m => m.status === 'OPERATIONAL').length;
  const busyMachineIds = new Set(
    allActiveBatches.map(b => b.targetMachineId).filter((id): id is string => Boolean(id))
  );
  const currentShiftStats = shiftStats[currentLiveShift.shift];

  return {
    skuId,
    setSkuId,
    wipId,
    setWipId,
    selectedRecipeId,
    setSelectedRecipeId,
    selectedMachineId,
    setSelectedMachineId,
    selectedTargetTankId,
    setSelectedTargetTankId,
    operatorName,
    setOperatorName,
    notes,
    setNotes,
    activeTab,
    setActiveTab,
    showInlineGantt,
    setShowInlineGantt,
    isBatchOrderFormOpen,
    setIsBatchOrderFormOpen,
    searchTerm,
    setSearchTerm,
    pauseModalBatch,
    setPauseModalBatch,
    isRejectDrawerOpen,
    setIsRejectDrawerOpen,
    filterShift,
    setFilterShift,
    batchDurationMinutes,
    setBatchDurationMinutes,
    currentTime,
    currentLiveShift,
    configuredMaterials,
    expandedPalletMatId,
    setExpandedPalletMatId,
    isQrScannerOpen,
    setIsQrScannerOpen,
    isQrLabelOpen,
    setIsQrLabelOpen,
    verifiedMaterialsMap,
    qrScanFeedback,
    suggestedWipsFromScan,
    setSuggestedWipsFromScan,
    pendingAutoVerifyRef,
    stockBalances,
    availableWips,
    selectedWipObj,
    selectedSkuObj,
    selectedMachObj,
    availableRecipesForWip,
    activeRecipeObj,
    wipBatchesList,
    allActiveBatches,
    pausedBatchesCount,
    runningBatchesCount,
    shiftStats,
    activeBatchTotalKg,
    operationalMachinesCount,
    busyMachineIds,
    currentShiftStats,
    handleUpdateMaterialRow,
    handleLocationChange,
    handleAdjustPalletBags,
    handleResetFifo,
    handleStartBatchConfirmed,
    handleQrScanMatched,
    handleQuickSelectFromGantt
  };
};
