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
import {
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
  showToast
}: UseMasterDataParams) {
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
    showToast('Kategori 2: Master Data (Material, WIP, SKU, Mesin, Tangki & BOM) berhasil di-reset');
  };

  // Add Material
  const handleAddMaterial = (matData: Omit<Material, 'id'>) => {
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
  };

  // Update Material
  const handleUpdateMaterial = (materialId: string, updates: Partial<Material>) => {
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
  };

  // Delete Material
  const handleDeleteMaterial = (id: string) => {
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

    showToast('Saldo awal material berhasil disesuaikan oleh Administrator');
  };

  // Import Materials (Internal Storage & Google Drive Batch Loader)
  const handleImportMaterials = (newMaterials: Material[], mode: 'replace' | 'append') => {
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
  };

  // Add WIP
  const handleAddWip = (wipData: Omit<WIP, 'id'>) => {
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
  };

  // Delete WIP
  const handleDeleteWip = (id: string) => {
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
    showToast('WIP berhasil dihapus');
  };

  // Update WIP (Multi-mesin, nama, bobot batch)
  const handleUpdateWip = (wipId: string, updates: Partial<WIP>) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wips: prev.master.wips.map(w => (w.id === wipId ? { ...w, ...updates } : w))
      }
    }));
  };

  // Add SKU
  const handleAddSku = (skuData: Omit<SKU, 'id'>) => {
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
  };

  // Update SKU
  const handleUpdateSku = (skuId: string, updates: Partial<SKU>) => {
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
  };

  // Delete SKU
  const handleDeleteSku = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skus: prev.master.skus.filter(s => s.id !== id),
        skuWips: prev.master.skuWips.filter(sw => sw.skuId !== id)
      }
    }));
    showToast('SKU berhasil dihapus');
  };

  // Import SKUs (Internal Storage & Google Drive Batch Loader)
  const handleImportSkus = (newSkus: SKU[], mode: 'replace' | 'append') => {
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
  };

  // Delete SkuWip link
  const handleDeleteSkuWip = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        skuWips: prev.master.skuWips.filter(sw => sw.id !== id)
      }
    }));
    showToast('Relasi WIP ke SKU dihapus');
  };

  // Import SkuWip links (Local File & Google Drive Batch Loader)
  const handleImportSkuWips = (newSkuWips: SkuWip[], mode: 'replace' | 'append') => {
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

    showToast(
      mode === 'replace'
        ? `Berhasil mengganti seluruh relasi WIP per karton SKU (${finalSkuWips.length} relasi)`
        : `Berhasil mengimpor & memperbarui ${newSkuWips.length} relasi WIP per karton SKU (Total: ${finalSkuWips.length})`
    );
  };

  // Add WipMat link
  const handleAddWipMat = (wmData: Omit<WipMaterial, 'id'>) => {
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
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        wipMats: prev.master.wipMats.filter(wm => wm.materialId !== id)
      }
    }));
    showToast('Relasi Material ke WIP dihapus');
  };

  // Recipe Management (Resep Berdasarkan Material untuk WIP)
  const handleAddRecipe = (recipeData: Omit<WipRecipe, 'id' | 'createdAt'>) => {
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
    showToast(
      `Resep "${newRecipe.recipeName}" (${newRecipe.recipeCode}) berhasil disimpan dengan ${initialItems.length} material`
    );
  };

  const handleUpdateRecipe = (recipeId: string, updates: Partial<WipRecipe>) => {
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
    showToast('Resep berhasil diperbarui');
  };

  const handleDeleteRecipe = (recipeId: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        recipes: (prev.master.recipes || []).filter(r => r.id !== recipeId)
      }
    }));
    showToast('Resep berhasil dihapus');
  };

  const handleAddMaterialToRecipe = (recipeId: string, itemData: Omit<WipRecipeItem, 'id'>) => {
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
    showToast(
      `Material ${itemData.materialName || ''} ditambahkan ke resep (${itemData.amount} ${itemData.unit})`
    );
  };

  const handleAddMultipleMaterialsToRecipe = (
    recipeId: string,
    itemsData: Array<Omit<WipRecipeItem, 'id'>>
  ) => {
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
    const amountKg = newUnit === 'gr' ? newAmount / 1000 : newAmount;
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
    showToast('Takaran material dalam resep berhasil diperbarui');
  };

  const handleDeleteMaterialFromRecipe = (recipeId: string, itemId: string) => {
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
    showToast('Material dihapus dari resep');
  };

  // Import Resep Formulasi (Google Drive & Local File Batch Loader)
  const handleImportRecipes = (newRecipes: WipRecipe[], mode: 'replace' | 'append') => {
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
    showToast(`Berhasil mengimpor ${newRecipes.length} resep formulasi`);
  };

  // Add Machine
  const handleAddMachine = (machData: Omit<ProductionMachine, 'id'>) => {
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
  };

  // Delete Machine
  const handleDeleteMachine = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        machines: prev.master.machines.filter(m => m.id !== id),
        wips: prev.master.wips.map(w => (w.assignedMachineId === id ? { ...w, assignedMachineId: undefined } : w))
      }
    }));
    showToast('Mesin berhasil dihapus dari master data');
  };

  // Import Machines
  const handleImportMachines = (newMachines: ProductionMachine[], mode: 'replace' | 'append') => {
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
  };

  // Delete Tank
  const handleDeleteTank = (id: string) => {
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.filter(t => t.id !== id),
        wips: prev.master.wips.map(w => (w.targetTankId === id ? { ...w, targetTankId: undefined } : w))
      }
    }));
    showToast('Tangki berhasil dihapus dari master data');
  };

  // Import Tanks
  const handleImportTanks = (newTanks: WipTank[], mode: 'replace' | 'append') => {
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

    markExplicitOperationsWrite();
    setState(prev => ({
      ...prev,
      master: {
        ...prev.master,
        tanks: prev.master.tanks.map(t => (t.id === tankId ? { ...t, ...updates } : t))
      }
    }));
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
  const isAdminSession = () => getEffectiveRoleForState().isAdmin;

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
