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
  Database,
  QrCode,
  Tag,
  X,
  PauseCircle,
  Play,
  ShieldCheck
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
import { MaterialQrScannerModal } from '../MaterialQrScannerModal';
import { MaterialQrLabelModal } from '../MaterialQrLabelModal';
import { ParsedMaterialQrResult } from '../../utils/materialQr';
import { WipGanttChart, parseWipTimestamp } from '../WipGanttChart';
import { WipBatchPauseModal } from '../WipBatchPauseModal';
import { Activity, Maximize2 } from 'lucide-react';

function formatPauseDurationMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '-';
  const totalSecs = Math.round(ms / 1000);
  if (totalSecs < 60) return `${totalSecs} dtk`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}j ${remMins}m`;
}

interface PemakaianViewProps {
  state: AppState;
  onRecordUsage: (usage: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => void;
  onStartWipBatch: (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => void;
  onPauseWipBatch?: (batchId: string, reason: string, category?: string) => void;
  onResumeWipBatch?: (batchId: string) => void;
  onCompleteWipBatch: (batchId: string) => void;
  onCancelWipBatch: (batchId: string) => void;
  onSwitchTab?: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const PemakaianView: React.FC<PemakaianViewProps> = ({
  state,
  onRecordUsage,
  onStartWipBatch,
  onPauseWipBatch,
  onResumeWipBatch,
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
  const [activeTab, setActiveTab] = useState<'batch-order' | 'gantt-schedule' | 'batch-history' | 'material-history' | 'shift-activity'>('batch-order');
  const [showInlineGantt, setShowInlineGantt] = useState<boolean>(true);
  const [isBatchOrderFormOpen, setIsBatchOrderFormOpen] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [pauseModalBatch, setPauseModalBatch] = useState<WipProductionBatch | null>(null);
  const [expandedAuditBatchIds, setExpandedAuditBatchIds] = useState<Record<string, boolean>>({});

  // 3-Shift Operator System State (Otomatis mengikuti jam shift berjalan)
  const [filterShift, setFilterShift] = useState<'all' | '1' | '2' | '3'>('all');
  const [usageViewMode, setUsageViewMode] = useState<'breakdown-sku-wip' | 'list'>('breakdown-sku-wip');
  const [usageFilterSkuId, setUsageFilterSkuId] = useState<string>('all');
  const [usageFilterWipId, setUsageFilterWipId] = useState<string>('all');

  // WIP Production Duration state (minutes) & live clock ticker for real-time countdown & live shift sync
  const [batchDurationMinutes, setBatchDurationMinutes] = useState<string>('30');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const currentLiveShift = getCurrentShift(new Date(currentTime));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Editable materials mapped from BOM/Recipe for the selected WIP
  const [configuredMaterials, setConfiguredMaterials] = useState<WipBatchMaterialItem[]>([]);
  // Track which material has its FIFO pallet drawer open
  const [expandedPalletMatId, setExpandedPalletMatId] = useState<string | null>(null);

  // QR Scanner & Material Verification (Poka-Yoke) State
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [isQrLabelOpen, setIsQrLabelOpen] = useState(false);
  const [verifiedMaterialsMap, setVerifiedMaterialsMap] = useState<
    Record<string, { verifiedAt: string; scannedLot?: string }>
  >({});
  const [qrScanFeedback, setQrScanFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    detail?: string;
  } | null>(null);
  const [suggestedWipsFromScan, setSuggestedWipsFromScan] = useState<{
    materialId: string;
    materialName: string;
    materialCode?: string;
    lotNumber?: string;
    wips: Array<{ id: string; code: string; name: string }>;
  } | null>(null);
  const pendingAutoVerifyRef = React.useRef<{
    materialId: string;
    lotNumber?: string;
  } | null>(null);

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

  // Check if the SELECTED MACHINE has an active or paused batch (Strict Rule: 1 batch per machine)
  const activeBatchForSelectedMachine = (state.transactions.wipBatches || []).find(
    b => b.targetMachineId === selectedMachineId && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
  );

  // All active or paused WIP batches across all WIPs
  const allActiveBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  );
  const pausedBatchesCount = allActiveBatches.filter(b => b.status === 'DIJEDA').length;
  const runningBatchesCount = allActiveBatches.filter(b => b.status === 'SEDANG_PRODUKSI').length;

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

    // Reset verified materials on WIP/Recipe change, then apply any queued scan verification
    if (pendingAutoVerifyRef.current) {
      const pending = pendingAutoVerifyRef.current;
      setVerifiedMaterialsMap({
        [pending.materialId]: {
          verifiedAt: new Date().toLocaleTimeString('id-ID'),
          scannedLot: pending.lotNumber,
        },
      });
      pendingAutoVerifyRef.current = null;
    } else {
      setVerifiedMaterialsMap({});
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

    const activeShiftNow = getCurrentShift().shift;

    // Trigger Start Batch (strictly batchSize: 1 with shift synchronized to live shift hours)
    onStartWipBatch({
      wipId,
      wipName: selectedWipObj.name,
      recipeId: activeRecipeObj?.id,
      recipeCode: activeRecipeObj?.recipeCode,
      recipeName: activeRecipeObj?.recipeName,
      skuId: skuId || undefined,
      skuName: selectedSkuObj?.name,
      shift: activeShiftNow,
      batchSize: 1, // Strictly 1 batch
      batchWeightKg: selectedWipObj.batchWeightKg,
      operatorName: operatorName || `Operator Shift ${activeShiftNow}`,
      notes: notes ? `${notes} (Shift ${activeShiftNow})` : `Shift ${activeShiftNow}`,
      materials: configuredMaterials,
      durationMinutes: durMins,
      estimatedCompletionTime: estimatedCompletion,
      targetTankId: selectedTargetTankId || selectedWipObj.targetTankId || (selectedWipObj.targetTankIds && selectedWipObj.targetTankIds[0]),
      targetMachineId: selectedMachineId,
      targetMachineName: selectedMachObj?.name
    });

    setNotes('');
    setVerifiedMaterialsMap({});
    setQrScanFeedback(null);
    setSuggestedWipsFromScan(null);
  };

  // Handle camera QR scan for material identification & Poka-Yoke verification during production recording
  const handleQrScanMatched = (result: ParsedMaterialQrResult) => {
    const mat = result.matchedMaterial;
    if (!mat) return;

    const codeLabel = mat.code ? `[${mat.code}] ` : '';

    // Case 1: WIP is selected and BOM rows are loaded -> verify material belongs to recipe
    if (wipId && configuredMaterials.length > 0) {
      const matchedRow = configuredMaterials.find((item) => item.materialId === mat.id);
      if (matchedRow) {
        setVerifiedMaterialsMap((prev) => ({
          ...prev,
          [mat.id]: {
            verifiedAt: new Date().toLocaleTimeString('id-ID'),
            scannedLot: result.lotNumber,
          },
        }));

        if (result.location && result.location !== matchedRow.sourceLocation) {
          handleLocationChange(mat.id, result.location);
        }

        const detailText = [
          `Takaran Resep: ${matchedRow.requiredKg.toFixed(4)} kg`,
          `Lokasi: ${result.location || matchedRow.sourceLocation}`,
          result.lotNumber ? `Lot: ${result.lotNumber}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        setQrScanFeedback({
          type: 'success',
          title: `Sesuai Resep WIP: ${codeLabel}${mat.name}`,
          detail: detailText,
        });
        showToast(`QR terverifikasi untuk batch: ${codeLabel}${mat.name}`);
      } else {
        setQrScanFeedback({
          type: 'warning',
          title: `Peringatan Poka-Yoke: ${codeLabel}${mat.name} Tidak Ada di Resep`,
          detail: `Material ini bukan komponen dari WIP "${selectedWipObj?.name || '-'}". Periksa kembali kemasan bahan baku sebelum penuangan.`,
        });
        showToast(
          `Peringatan: ${codeLabel}${mat.name} tidak terdaftar pada resep WIP aktif!`,
          true
        );
      }
      return;
    }

    // Case 2: No WIP selected yet -> find WIPs whose BOM/Recipes use this material
    const matchingWipIds = new Set<string>();
    (state.master.recipes || []).forEach((rec) => {
      if (rec.items?.some((it) => it.materialId === mat.id)) {
        matchingWipIds.add(rec.wipId);
      }
    });
    state.master.wipMats.forEach((wm) => {
      if (wm.materialId === mat.id) {
        matchingWipIds.add(wm.wipId);
      }
    });

    const candidateWips = availableWips.filter((w) => matchingWipIds.has(w.id));

    if (candidateWips.length === 1) {
      const target = candidateWips[0];
      pendingAutoVerifyRef.current = {
        materialId: mat.id,
        lotNumber: result.lotNumber,
      };
      setWipId(target.id);
      setSuggestedWipsFromScan(null);
      setQrScanFeedback({
        type: 'success',
        title: `WIP Teridentifikasi: ${target.name}`,
        detail: `${codeLabel}${mat.name} dimuat & diverifikasi otomatis untuk batch ${target.code}.`,
      });
      showToast(`Material ${codeLabel}${mat.name} teridentifikasi -> Memuat WIP ${target.name}`);
    } else if (candidateWips.length > 1) {
      setSuggestedWipsFromScan({
        materialId: mat.id,
        materialName: mat.name,
        materialCode: mat.code,
        lotNumber: result.lotNumber,
        wips: candidateWips.map((w) => ({ id: w.id, code: w.code, name: w.name })),
      });
      setQrScanFeedback({
        type: 'success',
        title: `Material Teridentifikasi: ${codeLabel}${mat.name}`,
        detail: `Ditemukan di ${candidateWips.length} formula WIP. Pilih WIP target pada daftar yang muncul.`,
      });
      showToast(`${codeLabel}${mat.name} cocok dengan ${candidateWips.length} WIP. Silakan pilih target WIP.`);
    } else {
      setQrScanFeedback({
        type: 'warning',
        title: `${codeLabel}${mat.name} Belum Terhubung ke Resep WIP`,
        detail: 'Material ditemukan di database, namun belum ada BOM WIP yang memakai bahan baku ini.',
      });
      showToast(`Material ${codeLabel}${mat.name} ditemukan, namun belum tertaut ke resep WIP.`, true);
    }
  };

  const verifiedCountInBom = configuredMaterials.filter((m) => Boolean(verifiedMaterialsMap[m.materialId])).length;

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

  const handleQuickSelectFromGantt = ({ machineId, wipId: targetWipId }: { machineId?: string; wipId?: string }) => {
    if (targetWipId) {
      setWipId(targetWipId);
    }
    if (machineId) {
      setSelectedMachineId(machineId);
    }
    setActiveTab('batch-order');
    const mach = machineId ? state.master.machines.find(m => m.id === machineId) : undefined;
    const wip = targetWipId ? state.master.wips.find(w => w.id === targetWipId) : undefined;
    showToast(
      `Jalur dipilih: ${mach ? `${mach.code} (${mach.name})` : 'Mesin'}${wip ? ` · WIP ${wip.name}` : ''}`
    );
  };

  const activeBatchTotalKg = allActiveBatches.reduce((sum, b) => sum + (b.batchWeightKg || 0), 0);
  const operationalMachinesCount = state.master.machines.filter(m => m.status === 'OPERATIONAL').length;
  const busyMachineIds = new Set(allActiveBatches.map(b => b.targetMachineId).filter(Boolean));
  const currentShiftStats = shiftStats[currentLiveShift.shift];

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      {/* OIL & GAS CONTROL ROOM DISPATCH TELEMETRY STRIP */}
      <div className="bg-[#0c121d] border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-slate-800 bg-[#080c14] flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-sm text-white tracking-tight">
                  Pusat Kendali Produksi WIP &amp; Penyaluran Batch
                </h2>
                <span className={`text-[11px] font-mono font-semibold ${currentLiveShift.colorClass}`}>
                  · {currentLiveShift.name} ({currentLiveShift.timeRange})
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Pemantauan mesin batching, penjadwalan Gantt, pemotongan FIFO pallet, dan transfer otomatis ke tangki holding/storage.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              Jam Pabrik: <strong className="text-slate-100">{new Date(currentTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</strong>
            </span>
            {onSwitchTab && (
              <button
                type="button"
                onClick={() => onSwitchTab('tank-monitoring')}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition active:scale-95"
              >
                <span>Lanjut Tahap 06: Transfer WIP</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Control Room Readouts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          <div className="p-3.5">
            <span className="text-[11px] text-slate-400 block">Shift Operasional Aktif</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-lg font-bold font-mono tabular-nums ${currentLiveShift.colorClass}`}>
                Shift {currentLiveShift.shift}
              </span>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">{currentLiveShift.timeRange}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Sinkronisasi otomatis jam kerja 24 jam</p>
          </div>

          <div className="p-3.5">
            <span className="text-[11px] text-slate-400 block">Batch WIP Sedang Jalan</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-lg font-bold font-mono tabular-nums ${allActiveBatches.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {allActiveBatches.length} Batch
              </span>
              <span className="text-[11px] font-mono text-cyan-400 tabular-nums">{activeBatchTotalKg.toFixed(1)} kg</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {pausedBatchesCount > 0
                ? `${runningBatchesCount} jalan · ${pausedBatchesCount} dijeda (maks 1/mesin)`
                : 'Kapasitas terkunci: maks 1 batch / mesin'}
            </p>
          </div>

          <div className="p-3.5">
            <span className="text-[11px] text-slate-400 block">Utilisasi Mesin Batching</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg font-bold font-mono tabular-nums text-slate-100">
                {busyMachineIds.size} / {state.master.machines.length}
              </span>
              <span className="text-[11px] font-mono text-emerald-400 tabular-nums">{operationalMachinesCount} Operasional</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              {Math.max(0, operationalMachinesCount - busyMachineIds.size)} unit mesin siaga menerima dispatch
            </p>
          </div>

          <div className="p-3.5">
            <span className="text-[11px] text-slate-400 block">Konsumsi Material Shift {currentLiveShift.shift}</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg font-bold font-mono tabular-nums text-cyan-400">
                {currentShiftStats.totalKg.toFixed(1)} kg
              </span>
              <span className="text-[11px] font-mono text-slate-300 tabular-nums">{currentShiftStats.batchesCount} Batch</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">{currentShiftStats.count} transaksi pemotongan stok BOM</p>
          </div>
        </div>
      </div>

      {/* Active & Paused WIP Batches Pipeline Monitor */}
      {allActiveBatches.length > 0 && (
        <div className="bg-[#0c121d] border border-amber-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400 shrink-0" />
              <h4 className="font-bold text-xs sm:text-sm text-white">
                Aliran Batch Aktif di Lantai Produksi ({runningBatchesCount} Berjalan
                {pausedBatchesCount > 0 ? ` · ${pausedBatchesCount} Dijeda` : ''})
              </h4>
            </div>
            <span className="text-[11px] font-mono text-amber-300">
              Aturan Disiplin · 1 Batch Aktif / Mesin
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {allActiveBatches.map(batch => {
              const bMach = state.master.machines.find(m => m.id === batch.targetMachineId);
              const wipObj = state.master.wips.find(w => w.id === batch.wipId);
              const tId = batch.targetTankId || wipObj?.targetTankId || wipObj?.targetTankIds?.[0];
              const bTank = state.master.tanks.find(t => t.id === tId);
              const isPaused = batch.status === 'DIJEDA';
              const durMins = batch.durationMinutes || wipObj?.productionDurationMinutes || 30;
              const plannedMs = Math.max(1, durMins * 60_000);
              const startMs = parseWipTimestamp(batch.startedAt) || currentTime;
              const estMs = parseWipTimestamp(batch.estimatedCompletionTime) || (startMs + plannedMs);

              const remMs = isPaused
                ? typeof batch.remainingMsAtPause === 'number'
                  ? batch.remainingMsAtPause
                  : plannedMs
                : estMs - currentTime;
              const pct = isPaused
                ? Math.min(100, Math.max(0, ((plannedMs - remMs) / plannedMs) * 100))
                : Math.min(100, Math.max(0, ((currentTime - startMs) / Math.max(1, estMs - startMs)) * 100));
              const remMins = Math.floor(Math.abs(remMs) / 60_000);
              const remSecs = Math.floor((Math.abs(remMs) % 60_000) / 1000);

              return (
                <div
                  key={batch.id}
                  className={`bg-[#06090f] border p-3 rounded-lg space-y-2 transition ${
                    isPaused ? 'border-sky-500/50' : 'border-slate-800 hover:border-amber-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-mono">
                        <span className={`font-bold ${isPaused ? 'text-sky-400' : 'text-amber-400'}`}>
                          {batch.batchCode}
                        </span>
                        {isPaused && (
                          <span className="text-[10px] font-bold text-sky-300">
                            · DIJEDA
                          </span>
                        )}
                        {batch.recipeCode && (
                          <span className="text-slate-400">· {batch.recipeCode}</span>
                        )}
                      </div>
                      <p className="font-semibold text-xs text-white truncate mt-0.5">{batch.wipName}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
                        {bMach ? bMach.code : 'Mesin'} ➔ {bTank ? bTank.code : 'Tangki'} · {batch.batchWeightKg.toFixed(1)} kg · {batch.operatorName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPaused ? (
                        onResumeWipBatch && (
                          <button
                            type="button"
                            onClick={() => onResumeWipBatch(batch.id)}
                            className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                            title="Lanjutkan penghitungan waktu batch WIP"
                          >
                            <Play className="w-3 h-3" />
                            <span>Lanjut</span>
                          </button>
                        )
                      ) : (
                        onPauseWipBatch && (
                          <button
                            type="button"
                            onClick={() => setPauseModalBatch(batch)}
                            className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                            title="Pause sementara batch dan catat alasan"
                          >
                            <PauseCircle className="w-3 h-3" />
                            <span>Pause</span>
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => onCompleteWipBatch(batch.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-[10px] transition active:scale-95 flex items-center gap-1 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Selesai</span>
                      </button>
                    </div>
                  </div>

                  {isPaused && batch.pauseReason && (
                    <div className="px-2 py-1 rounded bg-sky-950/60 border border-sky-700/60 text-[10px] text-sky-200 truncate" title={batch.pauseReason}>
                      Alasan jeda: <strong>{batch.pauseReason}</strong>
                    </div>
                  )}

                  {/* Elapsed Progress Gauge (Frozen when paused) */}
                  <div className="space-y-1">
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isPaused ? 'bg-sky-400' : remMs <= 0 ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono tabular-nums">
                      <span className="text-slate-400">
                        Progres {pct.toFixed(0)}%{isPaused ? ' (Berhenti)' : ''}
                      </span>
                      <span
                        className={
                          isPaused
                            ? 'text-sky-300 font-semibold'
                            : remMs <= 0
                            ? 'text-emerald-400 font-bold'
                            : 'text-amber-300 font-semibold'
                        }
                      >
                        {isPaused
                          ? `Dijeda · Sisa ${remMins}m ${String(remSecs).padStart(2, '0')}s`
                          : remMs <= 0
                          ? 'Siap Transfer Tangki'
                          : `Sisa ${remMins}m ${String(remSecs).padStart(2, '0')}s`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Control Room Workspace Selector Bar */}
      <div className="bg-[#0c121d] border border-slate-800 p-1.5 rounded-xl flex items-center justify-between gap-2 shadow-sm">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('batch-order')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              activeTab === 'batch-order'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>1. Perintah Kerja WIP (BOM)</span>
          </button>

          <button
            onClick={() => setActiveTab('gantt-schedule')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              activeTab === 'gantt-schedule'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>2. Gantt Chart Produksi WIP</span>
          </button>

          <button
            onClick={() => setActiveTab('batch-history')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              activeTab === 'batch-history'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3. Status Batch WIP ({wipBatchesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('material-history')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              activeTab === 'material-history'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>4. Log Pemakaian Bahan Baku</span>
          </button>

          <button
            onClick={() => setActiveTab('shift-activity')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition flex items-center gap-1.5 ${
              activeTab === 'shift-activity'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>5. Log Aktivitas 3 Shift</span>
          </button>
        </div>

        {activeTab === 'batch-order' && (
          <button
            type="button"
            onClick={() => setShowInlineGantt(v => !v)}
            className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition whitespace-nowrap shrink-0 ${
              showInlineGantt
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{showInlineGantt ? 'Sembunyikan Gantt' : 'Tampilkan Gantt'}</span>
          </button>
        )}
      </div>

      {/* TAB 2: DEDICATED FULL-WIDTH GANTT CHART PRODUKSI WIP */}
      {activeTab === 'gantt-schedule' && (
        <WipGanttChart
          state={state}
          currentTime={currentTime}
          compact={false}
          onPauseWipBatch={(b) => setPauseModalBatch(b)}
          onResumeWipBatch={onResumeWipBatch}
          onCompleteWipBatch={onCompleteWipBatch}
          onCancelWipBatch={onCancelWipBatch}
          onQuickSelectLane={handleQuickSelectFromGantt}
        />
      )}

      {/* TAB 1: FORM PERINTAH KERJA BATCH WIP & BOM INTEGRATION (+ LIVE GANTT) */}
      {activeTab === 'batch-order' && (
        <div className="space-y-4">
          {showInlineGantt && (
            <WipGanttChart
              state={state}
              currentTime={currentTime}
              compact={true}
              onExpandFullView={() => setActiveTab('gantt-schedule')}
              onPauseWipBatch={(b) => setPauseModalBatch(b)}
              onResumeWipBatch={onResumeWipBatch}
              onCompleteWipBatch={onCompleteWipBatch}
              onCancelWipBatch={onCancelWipBatch}
              onQuickSelectLane={handleQuickSelectFromGantt}
            />
          )}

          <div className="bg-[#0c121d] border border-slate-800 p-4 sm:p-5 rounded-xl shadow-lg space-y-4">
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isBatchOrderFormOpen ? 'pb-3 border-b border-slate-800' : ''}`}>
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">
                    Perintah Kerja Produksi WIP (Kapasitas 1 Batch per Periode)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Pilih jenis WIP &amp; mesin untuk memuat formulasi resep BOM serta alokasi FIFO secara otomatis
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsQrScannerOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0 active:scale-95"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan QR Bahan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQrLabelOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center space-x-1.5 transition whitespace-nowrap shrink-0"
                  title="Buat & unduh label QR untuk kemasan bahan baku"
                >
                  <Tag className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Label QR</span>
                </button>
                <span className="text-[11px] font-mono text-slate-400">
                  1 Batch / Mesin
                </span>
                <button
                  type="button"
                  onClick={() => setIsBatchOrderFormOpen(prev => !prev)}
                  aria-expanded={isBatchOrderFormOpen}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap shrink-0"
                >
                  {isBatchOrderFormOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{isBatchOrderFormOpen ? 'Tutup Form' : 'Buka Form'}</span>
                </button>
              </div>
            </div>

          {isBatchOrderFormOpen && (
            <>

          {suggestedWipsFromScan && (
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <QrCode className="w-4 h-4 text-cyan-400 shrink-0" />
                  <p className="font-semibold text-white truncate">
                    Material Terpindai: {suggestedWipsFromScan.materialCode ? `[${suggestedWipsFromScan.materialCode}] ` : ''}
                    {suggestedWipsFromScan.materialName} · Pilih Target WIP:
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuggestedWipsFromScan(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
                  aria-label="Tutup saran WIP"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestedWipsFromScan.wips.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => {
                      pendingAutoVerifyRef.current = {
                        materialId: suggestedWipsFromScan.materialId,
                        lotNumber: suggestedWipsFromScan.lotNumber,
                      };
                      setWipId(w.id);
                      setSuggestedWipsFromScan(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-cyan-600 text-white border border-slate-700 hover:border-cyan-400 text-xs font-semibold transition whitespace-nowrap shrink-0"
                  >
                    [{w.code}] {w.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleStartBatchSubmit} className="space-y-4 text-xs bg-slate-950/40 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4">
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
                      b => b.targetMachineId === m.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
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
                    b => b.targetMachineId === m.id && (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
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

              {/* Shift Otomatis Sesuai Jam Shift Berjalan */}
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Shift Pemakaian Material (Jam Aktual)
                </label>
                <div className={`w-full bg-slate-800/90 border ${currentLiveShift.borderClass} rounded-xl px-3 py-2 text-xs font-bold flex items-center justify-between`}>
                  <span className={currentLiveShift.colorClass}>
                    {currentLiveShift.name} ({currentLiveShift.timeRange})
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">Otomatis</span>
                </div>
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
              const isPaused = activeBatchForSelectedMachine.status === 'DIJEDA';
              const estTime = activeBatchForSelectedMachine.estimatedCompletionTime
                ? new Date(activeBatchForSelectedMachine.estimatedCompletionTime).getTime()
                : null;
              const remainingMs = isPaused
                ? typeof activeBatchForSelectedMachine.remainingMsAtPause === 'number'
                  ? activeBatchForSelectedMachine.remainingMsAtPause
                  : (activeBatchForSelectedMachine.durationMinutes || 30) * 60_000
                : estTime
                ? estTime - currentTime
                : 0;
              const isOverdue = !isPaused && estTime ? remainingMs <= 0 : false;
              const remMins = Math.floor(Math.abs(remainingMs) / 60_000);
              const remSecs = Math.floor((Math.abs(remainingMs) % 60_000) / 1000);
              const targetTank = state.master.tanks.find(t => t.id === activeBatchForSelectedMachine.targetTankId || t.assignedWipId === activeBatchForSelectedMachine.wipId);
              const targetMach = state.master.machines.find(m => m.id === activeBatchForSelectedMachine.targetMachineId);
              const latestPauseLog = activeBatchForSelectedMachine.pauseLogs?.[activeBatchForSelectedMachine.pauseLogs.length - 1];

              return (
                <div
                  className={`p-4 rounded-2xl space-y-3 shadow-xl border ${
                    isPaused
                      ? 'bg-sky-950/40 border-sky-500/60'
                      : 'bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900 border-amber-500/50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2 rounded-xl shrink-0 ${
                          isPaused
                            ? 'bg-sky-950 border border-sky-700 text-sky-300'
                            : 'bg-amber-500/20 text-amber-400 animate-pulse'
                        }`}
                      >
                        {isPaused ? <PauseCircle className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-xs sm:text-sm flex flex-wrap items-center gap-2">
                          <span>
                            {isPaused
                              ? 'Batch WIP Sedang Di-Pause Sementara (Timer Dihentikan)'
                              : 'Mesin Sedang Memproses Batch di Lantai Produksi'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              isPaused
                                ? 'bg-sky-950 text-sky-300 border border-sky-700'
                                : 'bg-amber-500/30 text-amber-200'
                            }`}
                          >
                            {activeBatchForSelectedMachine.batchCode}
                          </span>
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Mesin: <strong className="text-cyan-400">{targetMach ? `${targetMach.code} - ${targetMach.name}` : 'Mesin'}</strong> • WIP: <strong>"{activeBatchForSelectedMachine.wipName}"</strong> • {activeBatchForSelectedMachine.batchWeightKg.toFixed(2)} kg • Operator: <strong>{activeBatchForSelectedMachine.operatorName}</strong>
                        </p>
                      </div>
                    </div>

                    {/* Live or Frozen Timer Box */}
                    <div
                      className={`text-right shrink-0 bg-slate-950/80 px-3 py-1.5 rounded-xl border ${
                        isPaused ? 'border-sky-500/50' : 'border-amber-500/40'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 block uppercase font-mono">
                        {isPaused
                          ? 'Waktu Dihentikan Sementara'
                          : isOverdue
                          ? 'Status Waktu'
                          : 'Sisa Durasi Siklus'}
                      </span>
                      <span
                        className={`font-mono tabular-nums text-sm font-black ${
                          isPaused
                            ? 'text-sky-300'
                            : isOverdue
                            ? 'text-emerald-400 animate-pulse'
                            : 'text-amber-400'
                        }`}
                      >
                        {isPaused
                          ? `Dijeda · ${remMins}m ${String(remSecs).padStart(2, '0')}s`
                          : isOverdue
                          ? 'SELESAI (Picu Alarm)'
                          : `${remMins}m ${String(remSecs).padStart(2, '0')}s`}
                      </span>
                    </div>
                  </div>

                  {/* Active Pause Reason & Audit Banner */}
                  {isPaused && (activeBatchForSelectedMachine.pauseReason || latestPauseLog) && (
                    <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-700/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-bold text-sky-300 block">
                          Log Alasan Pause ({latestPauseLog?.category || 'Lainnya'}):
                        </span>
                        <p className="text-white font-medium">
                          {latestPauseLog?.reason || activeBatchForSelectedMachine.pauseReason}
                        </p>
                      </div>
                      {latestPauseLog && (
                        <div className="text-[10px] font-mono text-slate-300 sm:text-right shrink-0">
                          <div>Oleh: <strong>{latestPauseLog.pausedBy}</strong></div>
                          <div>Mulai jeda: {new Date(latestPauseLog.pausedAt).toLocaleTimeString('id-ID')}</div>
                        </div>
                      )}
                    </div>
                  )}

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
                    {typeof activeBatchForSelectedMachine.totalPausedMs === 'number' && activeBatchForSelectedMachine.totalPausedMs > 0 && (
                      <span className="px-2 py-1 rounded-lg bg-sky-950/60 text-sky-300 border border-sky-800 font-mono text-[11px]">
                        Akumulasi Jeda: {formatPauseDurationMs(activeBatchForSelectedMachine.totalPausedMs)}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 ml-auto italic">
                      {isPaused
                        ? 'Tekan "Lanjutkan Produksi" agar penghitungan estimasi berjalan kembali.'
                        : 'Otomatis tertransfer ke tangki & alarm berbunyi saat durasi tuntas.'}
                    </span>
                  </div>

                  {/* Direct Actions: Cancel, Pause/Resume, Complete */}
                  <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => onCancelWipBatch(activeBatchForSelectedMachine.id)}
                      className="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-rose-400 hover:bg-slate-700 text-xs font-semibold transition"
                    >
                      Batalkan Perintah Kerja
                    </button>
                    {isPaused ? (
                      onResumeWipBatch && (
                        <button
                          type="button"
                          onClick={() => onResumeWipBatch(activeBatchForSelectedMachine.id)}
                          className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center space-x-1.5 active:scale-95"
                        >
                          <Play className="w-4 h-4" />
                          <span>Lanjutkan Produksi (Resume)</span>
                        </button>
                      )
                    ) : (
                      onPauseWipBatch && (
                        <button
                          type="button"
                          onClick={() => setPauseModalBatch(activeBatchForSelectedMachine)}
                          className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center justify-center space-x-1.5 active:scale-95"
                        >
                          <PauseCircle className="w-4 h-4" />
                          <span>Pause Sementara</span>
                        </button>
                      )
                    )}
                    <button
                      type="button"
                      onClick={() => onCompleteWipBatch(activeBatchForSelectedMachine.id)}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Selesai Sekarang &amp; Uji Alarm ({activeBatchForSelectedMachine.batchCode})</span>
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
                  <div className="flex flex-wrap items-center gap-3">
                    {configuredMaterials.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-300 tabular-nums">
                          Verifikasi QR: <strong className={verifiedCountInBom === configuredMaterials.length ? 'text-emerald-400' : 'text-cyan-400'}>{verifiedCountInBom}/{configuredMaterials.length}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsQrScannerOpen(true)}
                          className="px-2.5 py-1 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap shrink-0"
                        >
                          <QrCode className="w-3 h-3" />
                          <span>Scan Verifikasi</span>
                        </button>
                      </div>
                    )}
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
                          const qrVerification = verifiedMaterialsMap[item.materialId];

                          return (
                            <React.Fragment key={item.materialId}>
                              <tr className={`hover:bg-slate-900/50 transition ${isExpanded ? 'bg-slate-900/90' : qrVerification ? 'bg-emerald-950/15' : ''}`}>
                                <td className="py-2.5 px-3 font-medium text-white">
                                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                    <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                                      {item.materialCode}
                                    </span>
                                    <span>{item.materialName}</span>
                                    {qrVerification && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>QR Terverifikasi{qrVerification.scannedLot ? ` · Lot ${qrVerification.scannedLot}` : ''}</span>
                                      </span>
                                    )}
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
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/25 active:scale-95'
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
                    <span>Mulai Produksi 1 Batch WIP pada {selectedMachObj?.code || 'Mesin Terpilih'} &amp; Potong Stok Sesuai BOM</span>
                  </>
                )}
              </button>
            </div>
          </form>
            </>
          )}
          </div>
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
                  filteredBatches.map(batch => {
                    const pauseLogsCount = batch.pauseLogs?.length || 0;
                    const isAuditExpanded = Boolean(expandedAuditBatchIds[batch.id]);
                    const isPaused = batch.status === 'DIJEDA';
                    const frozenRemMs =
                      typeof batch.remainingMsAtPause === 'number'
                        ? batch.remainingMsAtPause
                        : (batch.durationMinutes || 30) * 60_000;
                    const frozenM = Math.floor(Math.abs(frozenRemMs) / 60_000);
                    const frozenS = Math.floor((Math.abs(frozenRemMs) % 60_000) / 1000);

                    return (
                      <React.Fragment key={batch.id}>
                        <tr className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 font-mono font-bold text-white">
                            <span>{batch.batchCode}</span>
                            <span className="block text-[10px] text-slate-500 font-normal">
                              {batch.materials.length} komponen bahan
                            </span>
                            {batch.materials.some(m => m.palletAllocations && m.palletAllocations.length > 0) && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                                FIFO Pallet
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
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-cyan-400">
                            {batch.batchWeightKg.toFixed(4)} kg
                          </td>
                          <td className="py-3 px-3 text-slate-400 text-[11px] space-y-0.5">
                            <div>Mulai: {batch.startedAt}</div>
                            {batch.durationMinutes && (
                              <div className="text-[10px] text-amber-400/90 font-mono tabular-nums">
                                Durasi target: {batch.durationMinutes} menit
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
                                <div className={`text-[10px] font-mono tabular-nums font-bold ${isDone ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`}>
                                  {isDone ? 'Selesai (Alarm)' : `Sisa: ${m}m ${String(s).padStart(2, '0')}s`}
                                </div>
                              );
                            })()}
                            {isPaused && (
                              <div className="text-[10px] font-mono tabular-nums font-bold text-sky-300">
                                Dijeda · Sisa Berhenti: {frozenM}m {String(frozenS).padStart(2, '0')}s
                              </div>
                            )}
                            {typeof batch.totalPausedMs === 'number' && batch.totalPausedMs > 0 && (
                              <div className="text-[10px] font-mono tabular-nums text-sky-400">
                                Total Jeda: {formatPauseDurationMs(batch.totalPausedMs)}
                              </div>
                            )}
                            {pauseLogsCount > 0 && (
                              <button
                                type="button"
                                aria-expanded={isAuditExpanded}
                                onClick={() =>
                                  setExpandedAuditBatchIds(prev => ({ ...prev, [batch.id]: !prev[batch.id] }))
                                }
                                className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950/60 hover:bg-sky-950 border border-sky-700 text-sky-300 text-[10px] font-semibold transition"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                <span>Audit Jeda ({pauseLogsCount})</span>
                                {isAuditExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {batch.operatorName}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${
                                batch.status === 'SEDANG_PRODUKSI'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                  : isPaused
                                  ? 'bg-sky-950 text-sky-300 border-sky-700'
                                  : batch.status === 'SELESAI'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {batch.status === 'SEDANG_PRODUKSI'
                                ? 'Sedang Produksi'
                                : isPaused
                                ? 'Dijeda'
                                : batch.status === 'SELESAI'
                                ? 'Selesai'
                                : 'Dibatalkan'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {batch.status === 'SEDANG_PRODUKSI' ? (
                              <div className="inline-flex items-center justify-center gap-1.5">
                                {onPauseWipBatch && (
                                  <button
                                    type="button"
                                    onClick={() => setPauseModalBatch(batch)}
                                    className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center gap-1 whitespace-nowrap"
                                    title="Pause sementara batch dan catat alasan audit trail"
                                  >
                                    <PauseCircle className="w-3 h-3" />
                                    <span>Pause</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onCompleteWipBatch(batch.id)}
                                  className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center space-x-1 whitespace-nowrap"
                                  title="Selesaikan batch seketika dan bunyikan alarm peringatan"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Selesai</span>
                                </button>
                              </div>
                            ) : isPaused ? (
                              <div className="inline-flex items-center justify-center gap-1.5">
                                {onResumeWipBatch && (
                                  <button
                                    type="button"
                                    onClick={() => onResumeWipBatch(batch.id)}
                                    className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center gap-1 whitespace-nowrap"
                                    title="Lanjutkan kembali timer batch WIP"
                                  >
                                    <Play className="w-3 h-3" />
                                    <span>Lanjut</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => onCompleteWipBatch(batch.id)}
                                  className="px-2.5 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-[10px] font-bold shadow transition active:scale-95 inline-flex items-center space-x-1 whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Selesai</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500 flex items-center justify-center space-x-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{batch.status === 'DIBATALKAN' ? 'Dibatalkan' : 'Tuntas'}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                        {isAuditExpanded && batch.pauseLogs && batch.pauseLogs.length > 0 && (
                          <tr className="bg-slate-950/60">
                            <td colSpan={10} className="px-4 py-3 border-b border-slate-800">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="font-bold text-sky-300 flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    <span>Audit Trail Penghentian Sementara ({batch.batchCode})</span>
                                  </span>
                                  <span className="font-mono tabular-nums text-slate-400">
                                    Total Kejadian: {batch.pauseLogs.length} · Akumulasi Jeda: {formatPauseDurationMs(batch.totalPausedMs)}
                                  </span>
                                </div>
                                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                                  <table className="w-full text-left border-collapse text-[11px]">
                                    <thead>
                                      <tr className="bg-slate-900 text-slate-300 border-b border-slate-800">
                                        <th className="py-1.5 px-2.5">No</th>
                                        <th className="py-1.5 px-2.5">Kategori</th>
                                        <th className="py-1.5 px-2.5">Alasan Penghentian Sementara</th>
                                        <th className="py-1.5 px-2.5">Waktu Pause</th>
                                        <th className="py-1.5 px-2.5">Waktu Lanjut</th>
                                        <th className="py-1.5 px-2.5 text-right">Durasi Jeda</th>
                                        <th className="py-1.5 px-2.5">Petugas Audit</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                      {batch.pauseLogs.map((log, lIdx) => (
                                        <tr key={log.id}>
                                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-400">{lIdx + 1}</td>
                                          <td className="py-1.5 px-2.5 font-semibold text-sky-300 whitespace-nowrap">{log.category}</td>
                                          <td className="py-1.5 px-2.5 text-white">{log.reason}</td>
                                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                            {new Date(log.pausedAt).toLocaleString('id-ID', {
                                              day: '2-digit',
                                              month: 'short',
                                              hour: '2-digit',
                                              minute: '2-digit',
                                              second: '2-digit'
                                            })}
                                          </td>
                                          <td className="py-1.5 px-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                                            {log.resumedAt
                                              ? new Date(log.resumedAt).toLocaleString('id-ID', {
                                                  day: '2-digit',
                                                  month: 'short',
                                                  hour: '2-digit',
                                                  minute: '2-digit',
                                                  second: '2-digit'
                                                })
                                              : 'Masih Dijeda'}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-right font-mono tabular-nums text-amber-300 whitespace-nowrap">
                                            {log.pausedDurationMs !== undefined
                                              ? formatPauseDurationMs(log.pausedDurationMs)
                                              : formatPauseDurationMs(Math.max(0, currentTime - new Date(log.pausedAt).getTime()))}
                                          </td>
                                          <td className="py-1.5 px-2.5 text-slate-300 whitespace-nowrap">
                                            Pause: <strong>{log.pausedBy}</strong>
                                            {log.resumedBy ? ` · Lanjut: ${log.resumedBy}` : ''}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-slate-500 text-xs">
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
          {/* Audit Trail Penghentian Sementara (Pause) Batch WIP */}
          {(() => {
            const pauseAuditRows = (state.transactions.wipBatches || []).flatMap(b => {
              const mach = state.master.machines.find(m => m.id === b.targetMachineId);
              return (b.pauseLogs || []).map(log => ({
                batch: b,
                machLabel: mach ? `${mach.code} - ${mach.name}` : b.targetMachineName || '-',
                log
              }));
            });
            if (pauseAuditRows.length === 0) return null;
            return (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 rounded-lg bg-sky-950 border border-sky-800 text-sky-300">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white">
                        Audit Trail Penghentian Sementara (Pause) Batch WIP
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Catatan kronologis setiap jeda perintah kerja batch WIP beserta kategori, alasan, dan durasinya
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-sky-300 font-semibold">
                    {pauseAuditRows.length} Catatan Pause
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800/60 text-[11px] font-semibold text-slate-300 border-b border-slate-800">
                        <th className="py-2.5 px-3">Batch &amp; WIP</th>
                        <th className="py-2.5 px-3">Mesin</th>
                        <th className="py-2.5 px-3">Kategori</th>
                        <th className="py-2.5 px-3">Alasan Penghentian Sementara</th>
                        <th className="py-2.5 px-3">Waktu Pause / Lanjut</th>
                        <th className="py-2.5 px-3 text-right">Durasi Jeda</th>
                        <th className="py-2.5 px-3">Petugas Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {pauseAuditRows.map(({ batch, machLabel, log }) => (
                        <tr key={log.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-sky-300 block">{batch.batchCode}</span>
                            <span className="text-[11px] text-white">{batch.wipName}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 text-[11px]">{machLabel}</td>
                          <td className="py-2.5 px-3 font-semibold text-sky-300 whitespace-nowrap">{log.category}</td>
                          <td className="py-2.5 px-3 text-white">{log.reason}</td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
                            <div>Pause: {new Date(log.pausedAt).toLocaleString('id-ID')}</div>
                            <div className="text-slate-400">
                              Lanjut: {log.resumedAt ? new Date(log.resumedAt).toLocaleString('id-ID') : 'Masih Dijeda'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300 font-semibold whitespace-nowrap">
                            {log.pausedDurationMs !== undefined
                              ? formatPauseDurationMs(log.pausedDurationMs)
                              : formatPauseDurationMs(Math.max(0, currentTime - new Date(log.pausedAt).getTime()))}
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-slate-300">
                            <div>Pause: <strong>{log.pausedBy}</strong></div>
                            {log.resumedBy && <div className="text-slate-400">Lanjut: {log.resumedBy}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modals: Camera QR Scanner (Continuous Poka-Yoke Verification), Label Generator & Batch Pause Reason */}
      <MaterialQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        materials={state.master.materials}
        title={wipId ? `Scan QR Bahan Baku (${selectedWipObj?.code || 'WIP'})` : 'Scan QR Bahan Baku Produksi'}
        subtitle={
          wipId
            ? 'Pindai QR pada kemasan bahan baku untuk memverifikasi kesesuaian resep WIP & lokasi FIFO.'
            : 'Pindai QR bahan baku untuk mengidentifikasi material dan mencari formula WIP terkait.'
        }
        allowContinuous={Boolean(wipId)}
        lastFeedback={qrScanFeedback}
        onScanMatched={handleQrScanMatched}
        onOpenLabelGenerator={() => {
          setIsQrScannerOpen(false);
          setIsQrLabelOpen(true);
        }}
      />

      <MaterialQrLabelModal
        isOpen={isQrLabelOpen}
        onClose={() => setIsQrLabelOpen(false)}
        materials={state.master.materials}
        initialMaterialId={configuredMaterials[0]?.materialId}
      />

      <WipBatchPauseModal
        isOpen={Boolean(pauseModalBatch)}
        batch={pauseModalBatch}
        machineLabel={
          pauseModalBatch?.targetMachineId
            ? (() => {
                const m = state.master.machines.find(x => x.id === pauseModalBatch.targetMachineId);
                return m ? `${m.code} - ${m.name}` : pauseModalBatch.targetMachineName;
              })()
            : pauseModalBatch?.targetMachineName
        }
        currentTime={currentTime}
        actorName={
          state.currentAdminUser?.displayName ||
          state.currentSession?.name ||
          pauseModalBatch?.operatorName ||
          'Operator'
        }
        onClose={() => setPauseModalBatch(null)}
        onConfirmPause={(bId, reason, category) => {
          if (onPauseWipBatch) {
            onPauseWipBatch(bId, reason, category);
          }
          setPauseModalBatch(null);
        }}
      />
    </div>
  );
};
