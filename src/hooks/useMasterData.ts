import React from 'react';
import {
  AppState,
  EffectiveRoleResolution,
  Material,
  MaterialStockAdjustment,
  ProductionLine,
  ProductionMachine,
  SKU,
  SkuWip,
  TankState,
  TankTransferLog,
  WIP,
  WipMaterial,
  WipRecipe,
  WipRecipeItem,
  WipTank
} from '../types';
import { getMaterialCompositeKey } from '../utils/materialParser';
import { canModifyMasterBom } from '../utils/roleAccess';
import {
  RecordAuditLogParams,
  toTransactionDocFromAdjustment,
  toTransactionDocFromTankLog,
  WorkspaceTransactionDoc
} from '../services/transactionService';

export interface UseMasterDataParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  stateRef: React.MutableRefObject<AppState>;
  getEffectiveRoleForState: (targetState?: AppState) => EffectiveRoleResolution;
  getActiveActorEmail: () => string;
  dispatchAppendTx: (txDoc: WorkspaceTransactionDoc) => void;
  flushAutoCartonBuffer: (targetLineOrRunKey?: string) => void;
  markExplicitOperationsWrite: () => void;
  logAuditTrail?: (
    params: Omit<RecordAuditLogParams, 'workspaceId' | 'userId' | 'userName' | 'userEmail' | 'role'>
  ) => unknown;
  showToast: (msg: string, isError?: boolean) => void;
}

export function useMasterData({
  state,
  setState,
  stateRef,
  getEffectiveRoleForState,
  getActiveActorEmail,
  dispatchAppendTx,
  flushAutoCartonBuffer,
  markExplicitOperationsWrite,
  logAuditTrail,
  showToast
}: UseMasterDataParams) {
  const assertCanModifyMasterBom = (): boolean => {
    if (!canModifyMasterBom(getEffectiveRoleForState(stateRef.current))) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang mengubah Master BOM & Konfigurasi.', true);
      return false;
    }
    return true;
  };
  // Tank update
  const handleUpdateTank = (updated: Partial<TankState>) => {
    setState(prev => ({
      ...prev,
      tank: {
        ...prev.tank,
        ...updated
      }
    }));
  };

  // 2. Reset Master Data
  const handleResetMasterData = () => {
    if (!assertCanModifyMasterBom()) return;
    const prevCounts = {
      materials: stateRef.current.master.materials.length,
      wips: stateRef.current.master.wips.length,
      skus: stateRef.current.master.skus.length,
      recipes: (stateRef.current.master.recipes || []).length
    };
    setState(prev => ({
      ...prev,
      master: {
        materials: [],
        wips: [],
        skus: [],
        skuWips: [],
        wipMats: [],
        recipes: [],
        machines: [],
        tanks: [],
        productionLines: prev.master.productionLines || []
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'DELETE',
      targetId: 'master_all',
      targetLabel: 'Reset Seluruh Master BOM',
      previousValue: prevCounts,
      newValue: { materials: 0, wips: 0, skus: 0, recipes: 0 },
      reasonNote: 'Reset Master Data oleh Administrator'
    });
    showToast('Kategori 2: Master Data (Material, WIP, SKU, Mesin, Tangki & BOM) berhasil di-reset');
  };

  // Add Material
  const handleAddMaterial = (matData: Omit<Material, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newMat: Material = {
      ...matData,
      id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      code: matData.code?.trim() || `MAT-${String(state.master.materials.length + 1).padStart(3, '0')}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: [...prev.master.materials, newMat]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newMat.id,
      targetLabel: `Material: ${newMat.name} (${newMat.code})`,
      newValue: { name: newMat.name, code: newMat.code, weightKg: newMat.weightKg, source: newMat.source }
    });
  };

  // Update Material
  const handleUpdateMaterial = (materialId: string, updates: Partial<Material>) => {
    if (!assertCanModifyMasterBom()) return;
    const prevMat = stateRef.current.master.materials.find(m => m.id === materialId);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: prev.master.materials.map(m =>
          m.id === materialId
            ? {
                ...m,
                ...updates,
                code: updates.code !== undefined ? updates.code.trim() || m.code : m.code
              }
            : m
        )
      }
    }));
    if (prevMat) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'UPDATE',
        targetId: materialId,
        targetLabel: `Material: ${updates.name || prevMat.name}`,
        previousValue: { name: prevMat.name, code: prevMat.code, weightKg: prevMat.weightKg, minStockAlert: prevMat.minStockAlert },
        newValue: updates
      });
    }
  };

  // Delete Material
  const handleDeleteMaterial = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevMat = stateRef.current.master.materials.find(m => m.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: prev.master.materials.filter(m => m.id !== id),
        wipMats: prev.master.wipMats.filter(wm => wm.materialId !== id),
        recipes: (prev.master.recipes || []).map(r => {
          const filteredItems = r.items.filter(it => it.materialId !== id);
          return {
            ...r,
            items: filteredItems,
            totalWeightKg: filteredItems.reduce((sum, it) => sum + it.amountKg, 0)
          };
        })
      }
    }));
    if (prevMat) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: id,
        targetLabel: `Material: ${prevMat.name} (${prevMat.code || id})`,
        previousValue: { name: prevMat.name, code: prevMat.code, weightKg: prevMat.weightKg },
        reasonNote: 'Hapus material dari Master BOM'
      });
    }
    showToast('Material berhasil dihapus');
  };

  // Adjust Stock Material Awal (Akses Khusus Administrator)
  const handleAdjustMaterialStock = (
    materialId: string,
    adjustments: {
      initialStockCk: number;
      initialStockWineroto: number;
      initialStockTank: number;
      reason: string;
      notes?: string;
    }
  ) => {
    const currentState = stateRef.current;
    if (!getEffectiveRoleForState(currentState).isAdmin) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan adjust saldo awal material', true);
      return;
    }

    const targetMat = currentState.master.materials.find(m => m.id === materialId);
    if (!targetMat) return;

    const prevCk = Number(targetMat.initialStockCk ?? 0);
    const prevWineroto = Number(targetMat.initialStockWineroto ?? 0);
    const prevTank = Number(targetMat.initialStockTank ?? 0);
    const prevTotal = prevCk + prevWineroto + prevTank;

    const newCk = Math.max(0, adjustments.initialStockCk);
    const newWineroto = Math.max(0, adjustments.initialStockWineroto);
    const newTank = Math.max(0, adjustments.initialStockTank);
    const newTotal = newCk + newWineroto + newTank;
    const deltaTotal = newTotal - prevTotal;

    const now = new Date();
    const adjRecord: MaterialStockAdjustment = {
      id: `adj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      adjustmentNumber: `ADJ-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${String(
        (currentState.transactions.stockAdjustments?.length || 0) + 1
      ).padStart(3, '0')}`,
      date: now.toISOString().slice(0, 10),
      timestamp: now.toISOString(),
      materialId: targetMat.id,
      materialName: targetMat.name,
      materialCode: targetMat.code,
      location:
        newCk !== prevCk
          ? 'CK'
          : newWineroto !== prevWineroto
          ? 'WINEROTO'
          : newTank !== prevTank
          ? 'STORAGE_TANK'
          : 'ALL',
      previousInitialStockKg: prevTotal,
      newInitialStockKg: newTotal,
      deltaKg: deltaTotal,
      previousStockCk: prevCk,
      newStockCk: newCk,
      previousStockWineroto: prevWineroto,
      newStockWineroto: newWineroto,
      previousStockTank: prevTank,
      newStockTank: newTank,
      reason: adjustments.reason || 'Penyesuaian Saldo Awal Material oleh Administrator',
      adjustedBy: currentState.currentSession?.name || 'Administrator',
      notes: adjustments.notes
    };

    dispatchAppendTx(toTransactionDocFromAdjustment(adjRecord, getActiveActorEmail()));

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        materials: prev.master.materials.map(m =>
          m.id === materialId
            ? {
                ...m,
                initialStockCk: newCk,
                initialStockWineroto: newWineroto,
                initialStockTank: newTank
              }
            : m
        )
      },
      transactions: {
        ...prev.transactions,
        stockAdjustments: [adjRecord, ...(prev.transactions.stockAdjustments || [])]
      }
    }));

    logAuditTrail?.({
      module: 'STOCK_ADJUSTMENT',
      action: 'OVERRIDE',
      targetId: materialId,
      targetLabel: `Adjust Saldo Awal: ${targetMat.name}`,
      previousValue: { ck: prevCk, wineroto: prevWineroto, tank: prevTank, totalKg: prevTotal },
      newValue: { ck: newCk, wineroto: newWineroto, tank: newTank, totalKg: newTotal, deltaKg: deltaTotal },
      reasonNote: adjustments.reason || 'Penyesuaian Saldo Awal Material oleh Administrator'
    });

    showToast('Saldo awal material berhasil disesuaikan oleh Administrator');
  };

  // Import Materials (Internal Storage & Google Drive Batch Loader)
  const handleImportMaterials = (newMaterials: Material[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    setState(prev => {
      let finalMaterials: Material[] = [];

      if (mode === 'replace') {
        const map = new Map<string, Material>();
        newMaterials.forEach((m, idx) => {
          const key = getMaterialCompositeKey(m);
          const id = m.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...m, id });
        });
        finalMaterials = Array.from(map.values());
      } else {
        const map = new Map<string, Material>();
        prev.master.materials.forEach(m => {
          const key = getMaterialCompositeKey(m);
          map.set(key, m);
        });
        newMaterials.forEach((m, idx) => {
          const key = getMaterialCompositeKey(m);
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...m, id: existing.id });
          } else {
            const id = m.id || `mat_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
            map.set(key, { ...m, id });
          }
        });
        finalMaterials = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          materials: finalMaterials
        }
      };
    });
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: mode === 'replace' ? 'OVERRIDE' : 'CREATE',
      targetId: 'import_materials',
      targetLabel: `Import Master Material (${mode})`,
      newValue: { importedCount: newMaterials.length, mode }
    });
  };

  // Add WIP
  const handleAddWip = (wipData: Omit<WIP, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newWip: WIP = {
      ...wipData,
      id: `wip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: [...prev.master.wips, newWip]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newWip.id,
      targetLabel: `WIP: ${newWip.name}`,
      newValue: { code: newWip.code, batchWeightKg: newWip.batchWeightKg }
    });
  };

  // Delete WIP
  const handleDeleteWip = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevWip = stateRef.current.master.wips.find(w => w.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: prev.master.wips.filter(w => w.id !== id),
        skuWips: prev.master.skuWips.filter(sw => sw.wipId !== id),
        wipMats: prev.master.wipMats.filter(wm => wm.wipId !== id),
        recipes: (prev.master.recipes || []).filter(r => r.wipId !== id)
      }
    }));
    if (prevWip) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: id,
        targetLabel: `WIP: ${prevWip.name}`,
        previousValue: { name: prevWip.name, code: prevWip.code },
        reasonNote: 'Hapus WIP dari Master BOM'
      });
    }
    showToast('WIP berhasil dihapus');
  };

  // Update WIP (Multi-mesin, nama, bobot batch)
  const handleUpdateWip = (wipId: string, updates: Partial<WIP>) => {
    if (!assertCanModifyMasterBom()) return;
    const prevWip = stateRef.current.master.wips.find(w => w.id === wipId);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: prev.master.wips.map(w => (w.id === wipId ? { ...w, ...updates } : w))
      }
    }));
    if (prevWip) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'UPDATE',
        targetId: wipId,
        targetLabel: `WIP: ${updates.name || prevWip.name}`,
        previousValue: { name: prevWip.name, batchWeightKg: prevWip.batchWeightKg },
        newValue: updates
      });
    }
  };

  // Add SKU
  const handleAddSku = (skuData: Omit<SKU, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newSku: SKU = {
      ...skuData,
      id: `sku_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: [...prev.master.skus, newSku]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newSku.id,
      targetLabel: `SKU: ${newSku.name}`,
      newValue: { code: newSku.code, targetHour: newSku.targetHour, cartonWeightKg: newSku.cartonWeightKg }
    });
  };

  // Update SKU
  const handleUpdateSku = (skuId: string, updates: Partial<SKU>) => {
    if (!assertCanModifyMasterBom()) return;
    const prevSku = stateRef.current.master.skus.find(s => s.id === skuId);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: prev.master.skus.map(s =>
          s.id === skuId
            ? {
                ...s,
                ...updates,
                code: updates.code !== undefined ? updates.code.trim() || undefined : s.code
              }
            : s
        )
      }
    }));
    if (prevSku) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'UPDATE',
        targetId: skuId,
        targetLabel: `SKU: ${updates.name || prevSku.name}`,
        previousValue: { name: prevSku.name, targetHour: prevSku.targetHour, cartonWeightKg: prevSku.cartonWeightKg },
        newValue: updates
      });
    }
  };

  // Delete SKU
  const handleDeleteSku = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevSku = stateRef.current.master.skus.find(s => s.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: prev.master.skus.filter(s => s.id !== id),
        skuWips: prev.master.skuWips.filter(sw => sw.skuId !== id)
      }
    }));
    if (prevSku) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: id,
        targetLabel: `SKU: ${prevSku.name}`,
        previousValue: { name: prevSku.name, code: prevSku.code },
        reasonNote: 'Hapus SKU dari Master BOM'
      });
    }
    showToast('SKU berhasil dihapus');
  };

  // Import SKUs (Internal Storage & Google Drive Batch Loader)
  const handleImportSkus = (newSkus: SKU[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    let finalSkus: SKU[] = [];

    if (mode === 'replace') {
      const map = new Map<string, SKU>();
      newSkus.forEach((s, idx) => {
        const key = (s.code || s.name).trim().toLowerCase();
        const id = s.id || `sku_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        map.set(key, { ...s, id });
      });
      finalSkus = Array.from(map.values());
    } else {
      const map = new Map<string, SKU>();
      state.master.skus.forEach(s => {
        const key = (s.code || s.name).trim().toLowerCase();
        map.set(key, s);
      });
      newSkus.forEach((s, idx) => {
        const key = (s.code || s.name).trim().toLowerCase();
        const existing = map.get(key);
        if (existing) {
          map.set(key, { ...existing, ...s, id: existing.id });
        } else {
          const id = s.id || `sku_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...s, id });
        }
      });
      finalSkus = Array.from(map.values());
    }

    const kiteCount = finalSkus.filter(s => s.isKite).length;
    const domCount = finalSkus.filter(s => !s.isKite).length;

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: finalSkus
      }
    }));

    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master SKU (${finalSkus.length} SKU: ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
        : `Berhasil mengimpor & memperbarui master SKU (${newSkus.length} SKU diproses: total ${domCount} Domestik, ${kiteCount} KITE Ekspor)`
    );
  };

  // Add SkuWip link
  const handleAddSkuWip = (swData: Omit<SkuWip, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newSW: SkuWip = {
      ...swData,
      id: `sw_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: [...prev.master.skuWips, newSW]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newSW.id,
      targetLabel: `Relasi BOM SKU-WIP (${newSW.skuId} -> ${newSW.wipId})`,
      newValue: { kgWipPerCartonSku: newSW.kgWipPerCartonSku }
    });
  };

  // Delete SkuWip link
  const handleDeleteSkuWip = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevSw = stateRef.current.master.skuWips.find(sw => sw.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: prev.master.skuWips.filter(sw => sw.id !== id)
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'DELETE',
      targetId: id,
      targetLabel: `Relasi BOM SKU-WIP`,
      previousValue: prevSw,
      reasonNote: 'Hapus relasi WIP ke SKU'
    });
    showToast('Relasi WIP ke SKU dihapus');
  };

  // Import SkuWip links (Local File & Google Drive Batch Loader)
  const handleImportSkuWips = (newSkuWips: SkuWip[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    let finalSkuWips: SkuWip[] = [];

    if (mode === 'replace') {
      const map = new Map<string, SkuWip>();
      newSkuWips.forEach((sw, idx) => {
        const key = `${sw.skuId}__${sw.wipId}`;
        const id = sw.id || `sw_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
        map.set(key, { ...sw, id });
      });
      finalSkuWips = Array.from(map.values());
    } else {
      const map = new Map<string, SkuWip>();
      state.master.skuWips.forEach(sw => {
        map.set(`${sw.skuId}__${sw.wipId}`, sw);
      });
      newSkuWips.forEach((sw, idx) => {
        const key = `${sw.skuId}__${sw.wipId}`;
        const existing = map.get(key);
        if (existing) {
          map.set(key, {
            ...existing,
            kgWipPerCartonSku: sw.kgWipPerCartonSku
          });
        } else {
          const id = sw.id || `sw_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;
          map.set(key, { ...sw, id });
        }
      });
      finalSkuWips = Array.from(map.values());
    }

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: finalSkuWips
      }
    }));

    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: mode === 'replace' ? 'OVERRIDE' : 'CREATE',
      targetId: 'import_sku_wips',
      targetLabel: `Import Relasi SKU-WIP (${mode})`,
      newValue: { count: finalSkuWips.length }
    });

    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh relasi WIP per karton SKU (${finalSkuWips.length} relasi)`
        : `Berhasil mengimpor & memperbarui ${newSkuWips.length} relasi WIP per karton SKU (Total: ${finalSkuWips.length})`
    );
  };

  // Add WipMat link
  const handleAddWipMat = (wmData: Omit<WipMaterial, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newWM: WipMaterial = {
      ...wmData,
      id: `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wipMats: [...prev.master.wipMats, newWM]
      }
    }));
  };

  // Delete WipMat link
  const handleDeleteWipMat = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wipMats: prev.master.wipMats.filter(wm => wm.materialId !== id)
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'DELETE',
      targetId: id,
      targetLabel: 'Relasi Material ke WIP',
      reasonNote: 'Hapus relasi material ke WIP'
    });
    showToast('Relasi Material ke WIP dihapus');
  };

  // Recipe Management (Resep Berdasarkan Material untuk WIP)
  const handleAddRecipe = (recipeData: Omit<WipRecipe, 'id' | 'createdAt'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newRecipeId = `rcp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const initialItems = (recipeData.items || []).map(it => ({
      ...it,
      id: it.id || `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    }));
    const totalWeightKg = initialItems.reduce((sum, it) => sum + (it.amountKg || 0), 0);

    const newRecipe: WipRecipe = {
      ...recipeData,
      id: newRecipeId,
      items: initialItems,
      totalWeightKg: totalWeightKg > 0 ? totalWeightKg : recipeData.totalWeightKg || 0,
      createdAt: new Date().toISOString()
    };

    setState(prev => {
      let updatedWipMats = [...(prev.master.wipMats || [])];
      if (initialItems.length > 0) {
        initialItems.forEach(itemData => {
          const existingWmIdx = updatedWipMats.findIndex(
            wm => wm.wipId === newRecipe.wipId && wm.materialId === itemData.materialId
          );
          const newWmEntry: WipMaterial = {
            id:
              existingWmIdx >= 0
                ? updatedWipMats[existingWmIdx].id
                : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            wipId: newRecipe.wipId,
            materialId: itemData.materialId,
            materialKgPerBatch: itemData.amountKg,
            recipeId: newRecipeId,
            unit: itemData.unit,
            amount: itemData.amount
          };
          if (existingWmIdx >= 0) {
            updatedWipMats[existingWmIdx] = newWmEntry;
          } else {
            updatedWipMats.push(newWmEntry);
          }
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes: [...(prev.master.recipes || []), newRecipe],
          wipMats: updatedWipMats
        }
      };
    });
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newRecipeId,
      targetLabel: `Resep: ${newRecipe.recipeName} (${newRecipe.recipeCode})`,
      newValue: { wipId: newRecipe.wipId, itemsCount: initialItems.length, totalWeightKg: newRecipe.totalWeightKg }
    });
    showToast(
      `Resep "${newRecipe.recipeName}" (${newRecipe.recipeCode}) berhasil disimpan dengan ${initialItems.length} material`
    );
  };

  const handleUpdateRecipe = (recipeId: string, updates: Partial<WipRecipe>) => {
    if (!assertCanModifyMasterBom()) return;
    const prevRec = (stateRef.current.master.recipes || []).find(r => r.id === recipeId);
    setState(prev => {
      const target = (prev.master.recipes || []).find(r => r.id === recipeId);
      const wipId = target?.wipId;
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id === recipeId) {
          return { ...r, ...updates };
        }
        if (updates.isDefault && wipId && r.wipId === wipId) {
          return { ...r, isDefault: false };
        }
        return r;
      });
      return {
        ...prev,
        master: {
          ...prev.master,
          recipes
        }
      };
    });
    if (prevRec) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'UPDATE',
        targetId: recipeId,
        targetLabel: `Resep: ${updates.recipeName || prevRec.recipeName}`,
        previousValue: { recipeName: prevRec.recipeName, totalWeightKg: prevRec.totalWeightKg, isDefault: prevRec.isDefault },
        newValue: updates
      });
    }
    showToast('Resep berhasil diperbarui');
  };

  const handleDeleteRecipe = (recipeId: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevRec = (stateRef.current.master.recipes || []).find(r => r.id === recipeId);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        recipes: (prev.master.recipes || []).filter(r => r.id !== recipeId)
      }
    }));
    if (prevRec) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: recipeId,
        targetLabel: `Resep: ${prevRec.recipeName} (${prevRec.recipeCode})`,
        previousValue: { recipeCode: prevRec.recipeCode, itemsCount: prevRec.items.length },
        reasonNote: 'Hapus resep dari Master BOM'
      });
    }
    showToast('Resep berhasil dihapus');
  };

  const handleAddMaterialToRecipe = (recipeId: string, itemData: Omit<WipRecipeItem, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newItem: WipRecipeItem = {
      ...itemData,
      id: `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };

    setState(prev => {
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        const updatedItems = [...r.items.filter(it => it.materialId !== itemData.materialId), newItem];
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      const targetRecipe = prev.master.recipes?.find(r => r.id === recipeId);
      let updatedWipMats = prev.master.wipMats || [];
      if (targetRecipe) {
        const existingWmIdx = updatedWipMats.findIndex(
          wm => wm.wipId === targetRecipe.wipId && wm.materialId === itemData.materialId
        );
        const newWmEntry: WipMaterial = {
          id:
            existingWmIdx >= 0
              ? updatedWipMats[existingWmIdx].id
              : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          wipId: targetRecipe.wipId,
          materialId: itemData.materialId,
          materialKgPerBatch: itemData.amountKg,
          recipeId: recipeId,
          unit: itemData.unit,
          amount: itemData.amount
        };
        if (existingWmIdx >= 0) {
          updatedWipMats = updatedWipMats.map((wm, idx) => (idx === existingWmIdx ? newWmEntry : wm));
        } else {
          updatedWipMats = [...updatedWipMats, newWmEntry];
        }
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'UPDATE',
      targetId: recipeId,
      targetLabel: `Tambah Material Resep: ${itemData.materialName || itemData.materialId}`,
      newValue: { amount: itemData.amount, unit: itemData.unit, amountKg: itemData.amountKg }
    });
    showToast(
      `Material ${itemData.materialName || ''} ditambahkan ke resep (${itemData.amount} ${itemData.unit})`
    );
  };

  const handleAddMultipleMaterialsToRecipe = (
    recipeId: string,
    itemsData: Array<Omit<WipRecipeItem, 'id'>>
  ) => {
    if (!assertCanModifyMasterBom()) return;
    if (!itemsData || itemsData.length === 0) return;

    setState(prev => {
      const targetRecipe = prev.master.recipes?.find(r => r.id === recipeId);
      if (!targetRecipe) return prev;

      const newItems: WipRecipeItem[] = itemsData.map(it => ({
        ...it,
        id: `ri_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      }));

      const incomingMatIds = new Set(itemsData.map(it => it.materialId));
      const remainingItems = targetRecipe.items.filter(it => !incomingMatIds.has(it.materialId));
      const updatedItems = [...remainingItems, ...newItems];
      const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);

      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      let updatedWipMats = [...(prev.master.wipMats || [])];
      itemsData.forEach(itemData => {
        const existingWmIdx = updatedWipMats.findIndex(
          wm => wm.wipId === targetRecipe.wipId && wm.materialId === itemData.materialId
        );
        const newWmEntry: WipMaterial = {
          id:
            existingWmIdx >= 0
              ? updatedWipMats[existingWmIdx].id
              : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          wipId: targetRecipe.wipId,
          materialId: itemData.materialId,
          materialKgPerBatch: itemData.amountKg,
          recipeId: recipeId,
          unit: itemData.unit,
          amount: itemData.amount
        };
        if (existingWmIdx >= 0) {
          updatedWipMats[existingWmIdx] = newWmEntry;
        } else {
          updatedWipMats.push(newWmEntry);
        }
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });

    showToast(`Berhasil menambahkan ${itemsData.length} material database ke resep sekaligus!`);
  };

  const handleUpdateRecipeItem = (
    recipeId: string,
    itemId: string,
    newAmount: number,
    newUnit: 'kg' | 'gr'
  ) => {
    if (!assertCanModifyMasterBom()) return;
    const amountKg = newUnit === 'gr' ? newAmount / 1000 : newAmount;
    const prevRec = (stateRef.current.master.recipes || []).find(r => r.id === recipeId);
    const prevItem = prevRec?.items.find(it => it.id === itemId);
    setState(prev => {
      let targetWipId = '';
      let targetMatId = '';
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        targetWipId = r.wipId;
        const updatedItems = r.items.map(it => {
          if (it.id === itemId) {
            targetMatId = it.materialId;
            return {
              ...it,
              amount: newAmount,
              unit: newUnit,
              amountKg
            };
          }
          return it;
        });
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      let updatedWipMats = prev.master.wipMats || [];
      if (targetWipId && targetMatId) {
        updatedWipMats = updatedWipMats.map(wm => {
          if (wm.wipId === targetWipId && wm.materialId === targetMatId) {
            return {
              ...wm,
              materialKgPerBatch: amountKg,
              unit: newUnit,
              amount: newAmount
            };
          }
          return wm;
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    if (prevItem) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'UPDATE',
        targetId: `${recipeId}:${itemId}`,
        targetLabel: `Takaran Resep ${prevRec?.recipeName || recipeId} · ${prevItem.materialName}`,
        previousValue: { amount: prevItem.amount, unit: prevItem.unit, amountKg: prevItem.amountKg },
        newValue: { amount: newAmount, unit: newUnit, amountKg }
      });
    }
    showToast('Takaran material dalam resep berhasil diperbarui');
  };

  const handleDeleteMaterialFromRecipe = (recipeId: string, itemId: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevRec = (stateRef.current.master.recipes || []).find(r => r.id === recipeId);
    const prevItem = prevRec?.items.find(it => it.id === itemId);
    setState(prev => {
      let removedMaterialId = '';
      let targetWipId = '';
      const recipes = (prev.master.recipes || []).map(r => {
        if (r.id !== recipeId) return r;
        targetWipId = r.wipId;
        const targetItem = r.items.find(it => it.id === itemId);
        if (targetItem) removedMaterialId = targetItem.materialId;
        const updatedItems = r.items.filter(it => it.id !== itemId);
        const newTotalWeight = updatedItems.reduce((sum, it) => sum + it.amountKg, 0);
        return {
          ...r,
          items: updatedItems,
          totalWeightKg: newTotalWeight
        };
      });

      let updatedWipMats = prev.master.wipMats || [];
      if (removedMaterialId && targetWipId) {
        updatedWipMats = updatedWipMats.filter(
          wm => !(wm.wipId === targetWipId && wm.materialId === removedMaterialId)
        );
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes,
          wipMats: updatedWipMats
        }
      };
    });
    if (prevItem) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: `${recipeId}:${itemId}`,
        targetLabel: `Hapus Item Resep: ${prevItem.materialName}`,
        previousValue: prevItem,
        reasonNote: 'Hapus material dari resep formulasi'
      });
    }
    showToast('Material dihapus dari resep');
  };

  // Import Resep Formulasi (Google Drive & Local File Batch Loader)
  const handleImportRecipes = (newRecipes: WipRecipe[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    setState(prev => {
      let finalRecipes: WipRecipe[] = [];
      if (mode === 'replace') {
        finalRecipes = newRecipes;
      } else {
        const map = new Map<string, WipRecipe>();
        (prev.master.recipes || []).forEach(r => {
          map.set(`${r.wipId}_${r.recipeCode.toUpperCase()}`, r);
        });
        newRecipes.forEach(nr => {
          const key = `${nr.wipId}_${nr.recipeCode.toUpperCase()}`;
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...nr, id: existing.id });
          } else {
            map.set(key, nr);
          }
        });
        finalRecipes = Array.from(map.values());
      }

      let updatedWipMats = [...(prev.master.wipMats || [])];
      finalRecipes.forEach(recipe => {
        recipe.items.forEach(item => {
          const existingIdx = updatedWipMats.findIndex(
            wm => wm.wipId === recipe.wipId && wm.materialId === item.materialId
          );
          const newEntry: WipMaterial = {
            id:
              existingIdx >= 0
                ? updatedWipMats[existingIdx].id
                : `wm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            wipId: recipe.wipId,
            materialId: item.materialId,
            materialKgPerBatch: item.amountKg,
            recipeId: recipe.id,
            unit: item.unit,
            amount: item.amount
          };
          if (existingIdx >= 0) {
            updatedWipMats[existingIdx] = newEntry;
          } else {
            updatedWipMats.push(newEntry);
          }
        });
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          recipes: finalRecipes,
          wipMats: updatedWipMats
        }
      };
    });
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: mode === 'replace' ? 'OVERRIDE' : 'CREATE',
      targetId: 'import_recipes',
      targetLabel: `Import Resep Formulasi (${mode})`,
      newValue: { count: newRecipes.length }
    });
    showToast(`Berhasil mengimpor ${newRecipes.length} resep formulasi`);
  };

  // Add Machine
  const handleAddMachine = (machData: Omit<ProductionMachine, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newMach: ProductionMachine = {
      ...machData,
      id: `mach_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        machines: [...prev.master.machines, newMach]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newMach.id,
      targetLabel: `Mesin: ${newMach.code} - ${newMach.name}`,
      newValue: { code: newMach.code, name: newMach.name }
    });
  };

  // Delete Machine
  const handleDeleteMachine = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevMach = stateRef.current.master.machines.find(m => m.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        machines: prev.master.machines.filter(m => m.id !== id),
        wips: prev.master.wips.map(w => (w.assignedMachineId === id ? { ...w, assignedMachineId: undefined } : w))
      }
    }));
    if (prevMach) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: id,
        targetLabel: `Mesin: ${prevMach.code} - ${prevMach.name}`,
        previousValue: { code: prevMach.code, name: prevMach.name },
        reasonNote: 'Hapus mesin dari master data'
      });
    }
    showToast('Mesin berhasil dihapus dari master data');
  };

  // Import Machines
  const handleImportMachines = (newMachines: ProductionMachine[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    setState(prev => {
      let finalMachines: ProductionMachine[] = [];

      if (mode === 'replace') {
        finalMachines = newMachines;
      } else {
        const map = new Map<string, ProductionMachine>();
        prev.master.machines.forEach(m => {
          const key = m.code.toUpperCase().trim();
          map.set(key, m);
        });
        newMachines.forEach(m => {
          const key = m.code.toUpperCase().trim();
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...m, id: existing.id });
          } else {
            map.set(key, m);
          }
        });
        finalMachines = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: finalMachines
        }
      };
    });
    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master mesin (${newMachines.length} unit)`
        : `Berhasil mengimpor & memperbarui data mesin (${newMachines.length} unit diproses)`
    );
  };

  // Add Tank
  const handleAddTank = (tankData: Omit<WipTank, 'id'>) => {
    if (!assertCanModifyMasterBom()) return;
    const newTank: WipTank = {
      ...tankData,
      id: `tank_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: [...prev.master.tanks, newTank]
      }
    }));
    logAuditTrail?.({
      module: 'MASTER_BOM',
      action: 'CREATE',
      targetId: newTank.id,
      targetLabel: `Tangki: ${newTank.code} - ${newTank.name}`,
      newValue: { code: newTank.code, type: newTank.type, capacityKg: newTank.capacityKg }
    });
  };

  // Delete Tank
  const handleDeleteTank = (id: string) => {
    if (!assertCanModifyMasterBom()) return;
    const prevTank = stateRef.current.master.tanks.find(t => t.id === id);
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.filter(t => t.id !== id),
        wips: prev.master.wips.map(w => (w.targetTankId === id ? { ...w, targetTankId: undefined } : w))
      }
    }));
    if (prevTank) {
      logAuditTrail?.({
        module: 'MASTER_BOM',
        action: 'DELETE',
        targetId: id,
        targetLabel: `Tangki: ${prevTank.code} - ${prevTank.name}`,
        previousValue: { code: prevTank.code, name: prevTank.name },
        reasonNote: 'Hapus tangki dari master data'
      });
    }
    showToast('Tangki berhasil dihapus dari master data');
  };

  // Import Tanks
  const handleImportTanks = (newTanks: WipTank[], mode: 'replace' | 'append') => {
    if (!assertCanModifyMasterBom()) return;
    setState(prev => {
      let finalTanks: WipTank[] = [];

      if (mode === 'replace') {
        finalTanks = newTanks;
      } else {
        const map = new Map<string, WipTank>();
        prev.master.tanks.forEach(t => {
          const key = t.code.toUpperCase().trim();
          map.set(key, t);
        });
        newTanks.forEach(t => {
          const key = t.code.toUpperCase().trim();
          const existing = map.get(key);
          if (existing) {
            map.set(key, { ...existing, ...t, id: existing.id });
          } else {
            map.set(key, t);
          }
        });
        finalTanks = Array.from(map.values());
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          tanks: finalTanks
        }
      };
    });
    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh master tangki WIP (${newTanks.length} tangki)`
        : `Berhasil mengimpor & memperbarui master tangki WIP (${newTanks.length} tangki diproses)`
    );
  };

  // Update Tank Item
  const handleUpdateTankItem = (tankId: string, updates: Partial<WipTank>) => {
    if (updates.currentLevelKg !== undefined && !getEffectiveRoleForState().isAdmin) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan kalibrasi isi tangki', true);
      return;
    }
    const prevTank = stateRef.current.master.tanks.find(t => t.id === tankId);

    markExplicitOperationsWrite();
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.map(t => (t.id === tankId ? { ...t, ...updates } : t))
      }
    }));

    if (prevTank && updates.currentLevelKg !== undefined && updates.currentLevelKg !== prevTank.currentLevelKg) {
      logAuditTrail?.({
        module: 'STOCK_ADJUSTMENT',
        action: 'OVERRIDE',
        targetId: tankId,
        targetLabel: `Kalibrasi Tangki: ${prevTank.code} (${prevTank.name})`,
        previousValue: { currentLevelKg: prevTank.currentLevelKg },
        newValue: { currentLevelKg: updates.currentLevelKg },
        reasonNote: 'Kalibrasi manual level tangki WIP oleh Administrator'
      });
    }
  };

  // Top Up / Transfer WIP into Tank
  const handleTopUpTank = (tankId: string, amountKg: number, notes?: string) => {
    const currentState = stateRef.current;
    if (!getEffectiveRoleForState(currentState).isAdmin) {
      showToast('Akses ditolak: Hanya Administrator yang berwenang melakukan Isi Batch WIP ke tangki', true);
      return;
    }

    const targetTank = currentState.master.tanks.find(t => t.id === tankId);
    if (!targetTank) return;

    flushAutoCartonBuffer();
    markExplicitOperationsWrite();

    const prevLvl = targetTank.currentLevelKg;
    const newLvl = Math.min(targetTank.capacityKg, prevLvl + amountKg);
    const logEntry: TankTransferLog = {
      id: `tl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      tankId: targetTank.id,
      tankCode: targetTank.code,
      tankName: targetTank.name,
      type: 'MANUAL_TOPUP',
      amountKg,
      previousLevelKg: prevLvl,
      newLevelKg: newLvl,
      notes: notes || `Top-up / refill manual sebesar ${amountKg.toFixed(2)} kg`
    };

    dispatchAppendTx(toTransactionDocFromTankLog(logEntry, getActiveActorEmail()));

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.map(t => (t.id === tankId ? { ...t, currentLevelKg: newLvl } : t))
      },
      transactions: {
        ...prev.transactions,
        tankLogs: [logEntry, ...(prev.transactions.tankLogs || [])]
      }
    }));
  };

  // Production Line Customization CRUD (Line A, B, C, D, etc.)
  const isAdminSession = () => canModifyMasterBom(getEffectiveRoleForState());

  const handleAddProductionLine = (lineData: Omit<ProductionLine, 'id'>) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const newLine: ProductionLine = {
      ...lineData,
      id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    };
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: [...(prev.master.productionLines || []), newLine]
      }
    }));
    showToast(`Line produksi "${newLine.name}" berhasil ditambahkan`);
  };

  const handleUpdateProductionLine = (lineId: string, updates: Partial<ProductionLine>) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    setState(prev => {
      const updatedLines = (prev.master.productionLines || []).map(l =>
        l.id === lineId ? { ...l, ...updates } : l
      );
      const updatedLineName = updates.name;
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = updatedLineName
        ? prevRuns.map(r => (r.lineId === lineId ? { ...r, lineName: updatedLineName } : r))
        : prevRuns;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun:
          prev.activeSkuRun && prev.activeSkuRun.lineId === lineId && updatedLineName
            ? { ...prev.activeSkuRun, lineName: updatedLineName }
            : prev.activeSkuRun,
        master: {
          ...prev.master,
          productionLines: updatedLines
        }
      };
    });
    showToast('Data line produksi berhasil diperbarui');
  };

  const handleDeleteProductionLine = (lineId: string) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const currentState = stateRef.current;
    const runs = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const isBusy = runs.some(r => r.lineId === lineId && r.isRunning);
    if (isBusy) {
      showToast('Tidak dapat menghapus line yang sedang memproduksi SKU.', true);
      return;
    }
    const existing = currentState.master.productionLines || [];
    if (existing.length <= 1) {
      showToast('Minimal harus terdapat 1 line produksi.', true);
      return;
    }
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: (prev.master.productionLines || []).filter(l => l.id !== lineId)
      }
    }));
    showToast('Line produksi berhasil dihapus');
  };

  const handleSetProductionLinesCount = (targetCount: number) => {
    if (!isAdminSession()) {
      showToast('Akses ditolak: Pengaturan Line Produksi hanya dapat dilakukan di Mode Administrator.', true);
      return;
    }
    const currentState = stateRef.current;
    const existing = currentState.master.productionLines || [];
    const runs = currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningLineIds = new Set(runs.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));

    const getAlpha = (index: number) => {
      let n = index;
      let label = '';
      while (n >= 0) {
        label = String.fromCharCode((n % 26) + 65) + label;
        n = Math.floor(n / 26) - 1;
      }
      return label;
    };

    const nextLines = [...existing];
    if (targetCount > existing.length) {
      for (let i = existing.length; i < targetCount; i++) {
        const alpha = getAlpha(i);
        nextLines.push({
          id: `line_${alpha.toLowerCase()}_${Date.now()}_${i}`,
          code: `LINE-${alpha}`,
          name: `Line ${alpha}`,
          description: `Jalur Produksi ${alpha}`,
          isActive: true
        });
      }
    } else if (targetCount < existing.length) {
      while (nextLines.length > targetCount) {
        const removableIdx = [...nextLines].reverse().findIndex(l => !runningLineIds.has(l.id));
        if (removableIdx === -1) break;
        const actualIdx = nextLines.length - 1 - removableIdx;
        nextLines.splice(actualIdx, 1);
      }
    }

    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        productionLines: nextLines
      }
    }));
    showToast(`Jumlah line produksi diperbarui menjadi ${nextLines.length} line`);
  };

  return {
    handleUpdateTank,
    handleResetMasterData,
    handleAddMaterial,
    handleUpdateMaterial,
    handleDeleteMaterial,
    handleAdjustMaterialStock,
    handleImportMaterials,
    handleAddWip,
    handleDeleteWip,
    handleUpdateWip,
    handleAddSku,
    handleUpdateSku,
    handleDeleteSku,
    handleImportSkus,
    handleAddSkuWip,
    handleDeleteSkuWip,
    handleImportSkuWips,
    handleAddWipMat,
    handleDeleteWipMat,
    handleAddRecipe,
    handleUpdateRecipe,
    handleDeleteRecipe,
    handleAddMaterialToRecipe,
    handleAddMultipleMaterialsToRecipe,
    handleUpdateRecipeItem,
    handleDeleteMaterialFromRecipe,
    handleImportRecipes,
    handleAddMachine,
    handleDeleteMachine,
    handleImportMachines,
    handleAddTank,
    handleDeleteTank,
    handleImportTanks,
    handleUpdateTankItem,
    handleTopUpTank,
    handleAddProductionLine,
    handleUpdateProductionLine,
    handleDeleteProductionLine,
    handleSetProductionLinesCount
  };
}
