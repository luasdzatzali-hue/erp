import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActiveSkuProductionRun,
  AppState,
  CartonProductionLog,
  ChangeoverType,
  EffectiveRoleResolution,
  MachineChangeoverChecklist,
  MachineChangeoverRecord,
  MaterialReceipt,
  MaterialRejectLog,
  MaterialRequest,
  MaterialUsage,
  ProductionStopLog,
  ShiftNumber,
  StorageLocation,
  TankTransferLog,
  UserRole,
  WeeklyProductionPlan,
  WipBatchPauseLog,
  WipProductionBatch
} from '../types';
import { DEFAULT_STATE, getSampleState } from '../utils/storage';
import {
  deleteTransactionsByTypes,
  toTransactionDocFromCartonProd,
  toTransactionDocFromReceipt,
  toTransactionDocFromRejectLog,
  toTransactionDocFromRequest,
  toTransactionDocFromTankLog,
  toTransactionDocFromUsage,
  updateTransactionDoc,
  WorkspaceTransactionDoc
} from '../services/transactionService';
import { getCurrentShift, getNextShiftNumber, getShiftPeriodInfo } from '../utils/shifts';
import { getAllTanksForWip, checkRunHoldingTankAvailability } from '../utils/skuTankHelper';
import { calculateMissedProduction } from '../utils/productionReconcile';
import { playWipCompletionChime } from '../utils/soundAlarm';
import { sanitizeTextInput } from '../utils/security';
import type { AutoCartonBufferEntry } from './useFirebaseSyncManager';

export interface UseProductionTransactionsParams {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  stateRef: React.MutableRefObject<AppState>;
  setupStatus: 'checking' | 'needs_setup' | 'ready' | 'error';
  isSyncingCloud: boolean;
  cloudAuthRole: UserRole | null;
  getEffectiveRoleForState: (targetState?: AppState) => EffectiveRoleResolution;
  getActiveActorEmail: () => string;
  dispatchAppendTx: (txDoc: WorkspaceTransactionDoc) => void;
  flushAutoCartonBuffer: (targetLineOrRunKey?: string) => void;
  markExplicitOperationsWrite: () => void;
  isApplyingRemoteRef: React.MutableRefObject<boolean>;
  autoCartonBufferRef: React.MutableRefObject<Map<string, AutoCartonBufferEntry>>;
  pendingTxDocsRef: React.MutableRefObject<Map<string, WorkspaceTransactionDoc>>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function useProductionTransactions({
  state,
  setState,
  stateRef,
  setupStatus,
  isSyncingCloud,
  cloudAuthRole,
  getEffectiveRoleForState,
  getActiveActorEmail,
  dispatchAppendTx,
  flushAutoCartonBuffer,
  markExplicitOperationsWrite,
  isApplyingRemoteRef,
  autoCartonBufferRef,
  pendingTxDocsRef,
  showToast
}: UseProductionTransactionsParams) {
  const [alarmWipBatch, setAlarmWipBatch] = useState<WipProductionBatch | null>(null);

  // 1. Reset All Data
  const handleResetAll = () => {
    autoCartonBufferRef.current.clear();
    pendingTxDocsRef.current.clear();
    markExplicitOperationsWrite();
    if (
      getEffectiveRoleForState().canWriteCloudMaster &&
      cloudAuthRole === 'ADMINISTRATOR' &&
      stateRef.current.cloudWorkspaceId
    ) {
      void deleteTransactionsByTypes(stateRef.current.cloudWorkspaceId, [
        'REQUEST',
        'RECEIPT',
        'USAGE',
        'CARTON_PROD',
        'TANK_LOG',
        'ADJUSTMENT',
        'REJECT_LOG'
      ]).catch(err => console.error('Reset all transactions cloud error:', err));
    }
    setState(prev => ({
      ...DEFAULT_STATE,
      factoryName: prev.factoryName,
      cloudWorkspaceId: prev.cloudWorkspaceId,
      cloudOwnerUid: prev.cloudOwnerUid,
      isAuthenticated: prev.isAuthenticated,
      currentUserRole: prev.currentUserRole,
      currentSession: prev.currentSession,
      adminPin: prev.adminPin,
      adminGoogleEmails: prev.adminGoogleEmails,
      workspaceAccessConfig: prev.workspaceAccessConfig,
      currentAdminUser: prev.currentAdminUser,
      registeredOperators: prev.registeredOperators,
      registeredManagement: prev.registeredManagement,
      tank: {
        ...DEFAULT_STATE.tank,
        level: 0.0
      }
    }));
    showToast('Kategori 1: Semua data sistem (Master & Transaksi) berhasil di-reset bersih');
  };

  // 3. Reset Data Stock Material Diterima (CK, WINEROTO & Storage Tank Liquid)
  const handleResetStockReceipts = () => {
    markExplicitOperationsWrite();
    if (
      getEffectiveRoleForState().canWriteCloudMaster &&
      cloudAuthRole === 'ADMINISTRATOR' &&
      stateRef.current.cloudWorkspaceId
    ) {
      void deleteTransactionsByTypes(stateRef.current.cloudWorkspaceId, ['RECEIPT']).catch(err =>
        console.error('Reset receipts cloud error:', err)
      );
    }
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        receipts: []
      },
      tank: {
        ...prev.tank,
        level: 0.0
      }
    }));
    showToast('Kategori 3: Data stok diterima di CK, WINEROTO, dan Tangki Liquid berhasil di-reset');
  };

  // 4. Reset Data Pemesanan RM (Permintaan Material)
  const handleResetRequests = () => {
    markExplicitOperationsWrite();
    if (
      getEffectiveRoleForState().canWriteCloudMaster &&
      cloudAuthRole === 'ADMINISTRATOR' &&
      stateRef.current.cloudWorkspaceId
    ) {
      void deleteTransactionsByTypes(stateRef.current.cloudWorkspaceId, ['REQUEST']).catch(err =>
        console.error('Reset requests cloud error:', err)
      );
    }
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        requests: []
      }
    }));
    showToast('Kategori 4: Data pemesanan / permintaan bahan baku (RM) berhasil di-reset');
  };

  // 5. Reset Data Pemakaian Material & WIP
  const handleResetUsages = () => {
    markExplicitOperationsWrite();
    if (
      getEffectiveRoleForState().canWriteCloudMaster &&
      cloudAuthRole === 'ADMINISTRATOR' &&
      stateRef.current.cloudWorkspaceId
    ) {
      void deleteTransactionsByTypes(stateRef.current.cloudWorkspaceId, ['USAGE']).catch(err =>
        console.error('Reset usages cloud error:', err)
      );
    }
    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        usages: [],
        wipBatches: []
      }
    }));
    showToast('Kategori 5: Data pemakaian bahan baku dan perintah kerja batch WIP berhasil di-reset');
  };

  // Load sample dataset
  const handleLoadSampleData = () => {
    markExplicitOperationsWrite();
    const sample = getSampleState();
    setState(prev => ({
      ...sample,
      factoryName: prev.factoryName || sample.factoryName,
      cloudOwnerUid: prev.cloudOwnerUid,
      isAuthenticated: prev.isAuthenticated,
      currentUserRole: prev.currentUserRole,
      currentSession: prev.currentSession,
      adminPin: prev.adminPin,
      adminGoogleEmails: prev.adminGoogleEmails?.length ? prev.adminGoogleEmails : sample.adminGoogleEmails,
      workspaceAccessConfig: prev.workspaceAccessConfig,
      currentAdminUser: prev.currentAdminUser,
      registeredOperators: prev.registeredOperators?.length
        ? prev.registeredOperators
        : sample.registeredOperators,
      registeredManagement: prev.registeredManagement?.length
        ? prev.registeredManagement
        : sample.registeredManagement
    }));
    showToast('Data contoh industri berhasil dimuat ke sistem');
  };

  // Stock transfer between warehouse locations
  const handleTransferStock = (
    materialId: string,
    from: StorageLocation,
    to: StorageLocation,
    qty: number
  ) => {
    const now = new Date().toISOString().slice(0, 10);
    const transferId = Date.now().toString();

    const newUsage: MaterialUsage = {
      id: `usg_tf_${transferId}`,
      usageNumber: `TF-OUT-${transferId.slice(-4)}`,
      date: now,
      skuId: state.master.skus[0]?.id || 'SKU_TRANSFER',
      wipId: state.master.wips[0]?.id || 'WIP_TRANSFER',
      materialId,
      qty,
      batch: 1,
      usageQty: qty,
      sourceLocation: from,
      operatorName: 'Sistem Mutasi Gudang',
      notes: `Transfer stok dari ${from} ke ${to}`
    };

    const newReceipt: MaterialReceipt = {
      id: `rec_tf_${transferId}`,
      receiptNumber: `TF-IN-${transferId.slice(-4)}`,
      date: now,
      materialId,
      requestedQty: qty,
      receivedQty: qty,
      location: to,
      batchLotNumber: `TF-${transferId.slice(-4)}`,
      status: 'Received',
      notes: `Diterima dari mutasi gudang ${from}`
    };

    const nowIso = new Date().toISOString();
    const actorEmail = getActiveActorEmail();
    dispatchAppendTx(toTransactionDocFromUsage(newUsage, actorEmail, state.master.skus, nowIso));
    dispatchAppendTx(toTransactionDocFromReceipt(newReceipt, actorEmail, nowIso));
    markExplicitOperationsWrite();

    setState(prev => {
      let updatedTankLevel = prev.tank.level;
      if (from === 'STORAGE_TANK') {
        updatedTankLevel = Math.max(0, updatedTankLevel - qty);
      }
      if (to === 'STORAGE_TANK') {
        updatedTankLevel = Math.min(prev.tank.maxCapacity, updatedTankLevel + qty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: [newUsage, ...prev.transactions.usages],
          receipts: [newReceipt, ...prev.transactions.receipts]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // 1. Start Machine Product Changeover
  const handleStartMachineChangeover = (
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
  ) => {
    setState(prev => {
      const now = new Date().toISOString();
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          return {
            ...m,
            status: 'CHANGEOVER' as const,
            activeChangeover: {
              ...data,
              startedAt: now
            }
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        }
      };
    });
  };

  // 2. Complete and verify Machine Product Changeover
  const handleCompleteMachineChangeover = (machineId: string, record: MachineChangeoverRecord) => {
    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          const currentHistory = Array.isArray(m.changeoverHistory) ? m.changeoverHistory : [];
          return {
            ...m,
            status: 'OPERATIONAL' as const,
            currentWipId: record.toWipId,
            currentWipName: record.toWipName,
            lastChangeoverDate: record.completedAt || new Date().toISOString(),
            activeChangeover: undefined,
            changeoverHistory: [record, ...currentHistory]
          };
        }
        return m;
      });

      const currentGlobalChangeovers = Array.isArray(prev.transactions.changeovers)
        ? prev.transactions.changeovers
        : [];

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          changeovers: [record, ...currentGlobalChangeovers]
        }
      };
    });
  };

  // 3. Cancel Machine Product Changeover
  const handleCancelMachineChangeover = (machineId: string) => {
    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (m.id === machineId) {
          return {
            ...m,
            status: 'OPERATIONAL' as const,
            activeChangeover: undefined
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        }
      };
    });
  };

  // Automatic Carton Production Depletion Engine (Holding Tank & Storage Tank Real-Time Depletion)
  const handleProduceCartons = useCallback(
    (
      skuId: string,
      cartonCount: number,
      operatorName?: string,
      notes?: string,
      overrideSelectedHoldingTanks?: Record<string, string>,
      runId?: string,
      lineId?: string,
      lineName?: string
    ): { success: boolean; message: string } => {
      const currentState = stateRef.current;
      const targetSku = currentState.master.skus.find(s => s.id === skuId);
      if (!targetSku) return { success: false, message: 'SKU tidak ditemukan!' };

      const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuId);
      if (linkedWips.length === 0) {
        return {
          success: false,
          message: `SKU "${targetSku.name}" belum memiliki relasi BOM WIP! Tambahkan relasi di Master BOM.`
        };
      }

      const activeRunsNow =
        currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
      const activeRunForLine =
        (runId ? activeRunsNow.find(r => r.id === runId) : undefined) ||
        (lineId ? activeRunsNow.find(r => r.lineId === lineId && r.isRunning) : undefined) ||
        activeRunsNow.find(r => r.skuId === skuId && r.isRunning) ||
        activeRunsNow.find(r => r.skuId === skuId);

      const resolvedLineId = lineId || activeRunForLine?.lineId;
      const resolvedLineName = lineName || activeRunForLine?.lineName;

      let effectiveCartons = cartonCount;
      if (activeRunForLine?.plannedCartons && activeRunForLine.plannedCartons > 0) {
        const remaining = activeRunForLine.plannedCartons - (activeRunForLine.cartonsProducedTotal || 0);
        if (remaining <= 0) {
          flushAutoCartonBuffer();
          markExplicitOperationsWrite();
          setState(prev => {
            const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
            const updatedRuns = prevRuns.map(r => {
              const isMatch = runId
                ? r.id === runId
                : resolvedLineId
                ? r.lineId === resolvedLineId && r.isRunning
                : r.skuId === skuId && r.isRunning;
              return isMatch
                ? { ...r, isRunning: false, completionStatus: 'COMPLETED' as const, completedAt: new Date().toISOString() }
                : r;
            });
            return {
              ...prev,
              activeSkuRuns: updatedRuns,
              activeSkuRun: updatedRuns.find(r => r.isRunning) || null
            };
          });
          return {
            success: true,
            message: `Planning ${activeRunForLine.plannedCartons.toLocaleString()} karton pada ${
              resolvedLineName || targetSku.name
            } telah selesai tercapai!`
          };
        }
        effectiveCartons = Math.min(cartonCount, remaining);
      }

      const effectiveSelectedTanks: Record<string, string> = {
        ...(activeRunForLine?.selectedHoldingTanks || {}),
        ...(overrideSelectedHoldingTanks || {})
      };

      // Pre-check all candidate tanks (respecting selected Holding Tank when configured)
      for (const sw of linkedWips) {
        const wip = currentState.master.wips.find(w => w.id === sw.wipId);
        const neededKg = effectiveCartons * sw.kgWipPerCartonSku;
        const allWipTanks = getAllTanksForWip(wip, currentState.master.tanks);
        const chosenHtId = wip ? effectiveSelectedTanks[wip.id] : undefined;
        const hasValidChosenHt = Boolean(chosenHtId && allWipTanks.some(t => t.id === chosenHtId));

        const candidateTanks = hasValidChosenHt
          ? allWipTanks.filter(t => t.type !== 'HOLDING_TANK' || t.id === chosenHtId)
          : allWipTanks;

        if (candidateTanks.length === 0) {
          return {
            success: false,
            message: `WIP "${wip?.name || 'WIP'}" belum memiliki tangki holding atau storage yang ditautkan!`
          };
        }

        const totalAvailableKg = candidateTanks.reduce((sum, t) => sum + t.currentLevelKg, 0);
        if (totalAvailableKg < neededKg) {
          const chosenTankObj = hasValidChosenHt ? allWipTanks.find(t => t.id === chosenHtId) : undefined;
          return {
            success: false,
            message: chosenTankObj
              ? `Massa WIP "${wip?.name}" pada Holding Tank terpilih (${chosenTankObj.code}) tidak cukup! Butuh ${neededKg.toFixed(2)} kg, tersisa ${totalAvailableKg.toFixed(2)} kg.`
              : `Massa WIP "${wip?.name}" tidak cukup! Butuh ${neededKg.toFixed(2)} kg, total di holding & storage tank hanya tersisa ${totalAvailableKg.toFixed(2)} kg.`
          };
        }
      }

      // Execute deduction cleanly outside setState so sub-collection writes & buffering stay deterministic
      const timestamp = new Date().toISOString();
      const currentShiftObj = getCurrentShift();
      const deductions: CartonProductionLog['tankDeductions'] = [];
      const newTankLogs: TankTransferLog[] = [];
      const updatedTanksSnapshot = currentState.master.tanks.map(t => ({ ...t }));
      let autoCompletedLineMsg: string | null = null;

      linkedWips.forEach(sw => {
        const wip = currentState.master.wips.find(w => w.id === sw.wipId);
        let neededKg = effectiveCartons * sw.kgWipPerCartonSku;

        const allWipTanks = getAllTanksForWip(wip, updatedTanksSnapshot);
        const allWipTankIdSet = new Set(allWipTanks.map(t => t.id));
        const chosenHtId = wip ? effectiveSelectedTanks[wip.id] : undefined;
        const hasValidChosenHt = Boolean(chosenHtId && allWipTankIdSet.has(chosenHtId));

        const candidateIndices = updatedTanksSnapshot
          .map((t, idx) => ({ t, idx }))
          .filter(({ t }) => {
            if (!allWipTankIdSet.has(t.id)) return false;
            if (hasValidChosenHt && t.type === 'HOLDING_TANK' && t.id !== chosenHtId) {
              return false;
            }
            return true;
          })
          .sort((a, b) => {
            if (hasValidChosenHt) {
              if (a.t.id === chosenHtId && b.t.id !== chosenHtId) return -1;
              if (a.t.id !== chosenHtId && b.t.id === chosenHtId) return 1;
            }
            if (a.t.type === 'HOLDING_TANK' && b.t.type !== 'HOLDING_TANK') return -1;
            if (a.t.type !== 'HOLDING_TANK' && b.t.type === 'HOLDING_TANK') return 1;
            return 0;
          });

        for (const { idx } of candidateIndices) {
          if (neededKg <= 0.0001) break;
          const prevLvl = updatedTanksSnapshot[idx].currentLevelKg;
          if (prevLvl <= 0) continue;

          const deductThisTank = Math.min(prevLvl, neededKg);
          const newLvl = Math.max(0, prevLvl - deductThisTank);
          updatedTanksSnapshot[idx].currentLevelKg = newLvl;
          neededKg -= deductThisTank;

          deductions.push({
            tankId: updatedTanksSnapshot[idx].id,
            tankCode: updatedTanksSnapshot[idx].code,
            tankName: updatedTanksSnapshot[idx].name,
            tankType: updatedTanksSnapshot[idx].type,
            wipId: wip?.id || '',
            wipName: wip?.name || '',
            kgPerCarton: sw.kgWipPerCartonSku,
            kgDeducted: deductThisTank,
            remainingLevelKg: newLvl
          });

          newTankLogs.push({
            id: `tl_${Date.now()}_${sw.id}_${updatedTanksSnapshot[idx].id}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp,
            tankId: updatedTanksSnapshot[idx].id,
            tankCode: updatedTanksSnapshot[idx].code,
            tankName: updatedTanksSnapshot[idx].name,
            type: 'CARTON_DEPLETION',
            amountKg: -deductThisTank,
            previousLevelKg: prevLvl,
            newLevelKg: newLvl,
            wipId: wip?.id,
            wipName: wip?.name,
            skuName: resolvedLineName ? `[${resolvedLineName}] ${targetSku.name}` : targetSku.name,
            cartonsCount: effectiveCartons,
            operatorName,
            notes:
              notes ||
              `Otomatis terpotong untuk ${effectiveCartons} karton ${targetSku.name}${
                resolvedLineName ? ` (${resolvedLineName})` : ''
              } (${updatedTanksSnapshot[idx].type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})`
          });
        }
      });

      const dateKey = timestamp.slice(0, 10);
      const isAutoTick = Boolean(notes?.startsWith('Auto ['));
      const newCartonLog: CartonProductionLog = {
        id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp,
        lineId: resolvedLineId,
        lineName: resolvedLineName,
        skuId: targetSku.id,
        skuName: targetSku.name,
        skuCode: targetSku.code,
        cartonsProduced: effectiveCartons,
        shift: currentShiftObj.shift,
        operatorName,
        tankDeductions: deductions,
        notes
      };

      const tankNewLevelMap = new Map(updatedTanksSnapshot.map(t => [t.id, t.currentLevelKg]));

      setState(prev => {
        const updatedTanks = prev.master.tanks.map(t =>
          tankNewLevelMap.has(t.id) ? { ...t, currentLevelKg: tankNewLevelMap.get(t.id)! } : t
        );

        const prevCartonLogs = prev.transactions.cartonProductions || [];
        let nextCartonLogs: CartonProductionLog[];
        if (isAutoTick) {
          const matchIdx = prevCartonLogs.findIndex(
            cp =>
              cp.notes?.startsWith('Auto [') &&
              (cp.timestamp || '').slice(0, 10) === dateKey &&
              cp.shift === currentShiftObj.shift &&
              (cp.lineId || '') === (resolvedLineId || '') &&
              cp.skuId === targetSku.id
          );
          if (matchIdx >= 0) {
            const existing = prevCartonLogs[matchIdx];
            const mergedDeductions = [...(existing.tankDeductions || [])];
            deductions.forEach(d => {
              const dIdx = mergedDeductions.findIndex(m => m.tankId === d.tankId && m.wipId === d.wipId);
              if (dIdx >= 0) {
                mergedDeductions[dIdx] = {
                  ...mergedDeductions[dIdx],
                  kgDeducted: parseFloat((mergedDeductions[dIdx].kgDeducted + d.kgDeducted).toFixed(4)),
                  remainingLevelKg: d.remainingLevelKg
                };
              } else {
                mergedDeductions.push({ ...d });
              }
            });
            const mergedEntry: CartonProductionLog = {
              ...existing,
              timestamp,
              cartonsProduced: existing.cartonsProduced + effectiveCartons,
              operatorName: operatorName || existing.operatorName,
              tankDeductions: mergedDeductions,
              notes
            };
            nextCartonLogs = [
              mergedEntry,
              ...prevCartonLogs.slice(0, matchIdx),
              ...prevCartonLogs.slice(matchIdx + 1)
            ];
          } else {
            nextCartonLogs = [newCartonLog, ...prevCartonLogs];
          }
        } else {
          nextCartonLogs = [newCartonLog, ...prevCartonLogs];
        }

        const prevTankLogs = [...(prev.transactions.tankLogs || [])];
        let nextTankLogs: TankTransferLog[];
        if (isAutoTick) {
          const mergedFresh: TankTransferLog[] = [];
          newTankLogs.forEach(ntl => {
            const existingIdx = prevTankLogs.findIndex(
              tl =>
                tl.type === 'CARTON_DEPLETION' &&
                tl.notes?.startsWith('Auto [') &&
                (tl.timestamp || '').slice(0, 10) === dateKey &&
                tl.tankId === ntl.tankId &&
                (tl.wipId || '') === (ntl.wipId || '') &&
                (tl.skuName || '') === (ntl.skuName || '')
            );
            if (existingIdx >= 0) {
              const ex = prevTankLogs[existingIdx];
              prevTankLogs.splice(existingIdx, 1);
              mergedFresh.push({
                ...ex,
                timestamp,
                amountKg: parseFloat((ex.amountKg + ntl.amountKg).toFixed(4)),
                newLevelKg: ntl.newLevelKg,
                cartonsCount: (ex.cartonsCount || 0) + (ntl.cartonsCount || 0),
                operatorName: ntl.operatorName || ex.operatorName,
                notes: ntl.notes
              });
            } else {
              mergedFresh.push(ntl);
            }
          });
          nextTankLogs = [...mergedFresh, ...prevTankLogs].slice(0, 200);
        } else {
          nextTankLogs = [...newTankLogs, ...prevTankLogs].slice(0, 200);
        }

        const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
        const updatedActiveRuns = prevRuns.map(r => {
          const isMatch = runId
            ? r.id === runId
            : resolvedLineId
            ? r.lineId === resolvedLineId && r.isRunning
            : r.skuId === targetSku.id && r.isRunning;

          if (isMatch) {
            const newTotal = (r.cartonsProducedTotal || 0) + effectiveCartons;
            const reachedTarget = Boolean(
              r.plannedCartons && r.plannedCartons > 0 && newTotal >= r.plannedCartons
            );
            if (reachedTarget) {
              autoCompletedLineMsg = `${r.lineName || 'Line'}: Target planning ${r.plannedCartons?.toLocaleString()} karton (${r.skuName}) selesai diproduksi!`;
            }
            return {
              ...r,
              cartonsProducedTotal: newTotal,
              lastDeductionTime: timestamp,
              isRunning: reachedTarget ? false : r.isRunning,
              completionStatus: reachedTarget ? ('COMPLETED' as const) : r.completionStatus,
              completedAt: reachedTarget ? timestamp : r.completedAt
            };
          }
          return r;
        });

        const updatedActiveRun = updatedActiveRuns.find(r => r.isRunning) || updatedActiveRuns[0] || null;

        return {
          ...prev,
          activeSkuRun: updatedActiveRun,
          activeSkuRuns: updatedActiveRuns,
          master: {
            ...prev.master,
            tanks: updatedTanks
          },
          transactions: {
            ...prev.transactions,
            cartonProductions: nextCartonLogs,
            tankLogs: nextTankLogs
          }
        };
      });

      const actorEmail = getActiveActorEmail();
      if (!isAutoTick) {
        dispatchAppendTx(toTransactionDocFromCartonProd(newCartonLog, actorEmail));
        newTankLogs.forEach(tl => dispatchAppendTx(toTransactionDocFromTankLog(tl, actorEmail)));
        markExplicitOperationsWrite();
      } else {
        const bufferKey = `${resolvedLineId || 'line'}::${targetSku.id}::${currentShiftObj.shift}`;
        const existingBuf = autoCartonBufferRef.current.get(bufferKey);
        if (!existingBuf) {
          const tlMap = new Map<string, TankTransferLog>();
          newTankLogs.forEach(tl => {
            tlMap.set(`${tl.tankId}::${tl.wipId || ''}`, { ...tl });
          });
          autoCartonBufferRef.current.set(bufferKey, {
            cartonLog: { ...newCartonLog },
            tankLogs: tlMap,
            lastFlushedAt: Date.now(),
            accumulatedCartons: effectiveCartons
          });
        } else {
          const mergedDed = [...(existingBuf.cartonLog.tankDeductions || [])];
          deductions.forEach(d => {
            const dIdx = mergedDed.findIndex(m => m.tankId === d.tankId && m.wipId === d.wipId);
            if (dIdx >= 0) {
              mergedDed[dIdx] = {
                ...mergedDed[dIdx],
                kgDeducted: parseFloat((mergedDed[dIdx].kgDeducted + d.kgDeducted).toFixed(4)),
                remainingLevelKg: d.remainingLevelKg
              };
            } else {
              mergedDed.push({ ...d });
            }
          });
          existingBuf.cartonLog = {
            ...existingBuf.cartonLog,
            timestamp,
            cartonsProduced: existingBuf.cartonLog.cartonsProduced + effectiveCartons,
            operatorName: operatorName || existingBuf.cartonLog.operatorName,
            tankDeductions: mergedDed,
            notes
          };
          newTankLogs.forEach(ntl => {
            const tkKey = `${ntl.tankId}::${ntl.wipId || ''}`;
            const prevTl = existingBuf.tankLogs.get(tkKey);
            if (!prevTl) {
              existingBuf.tankLogs.set(tkKey, { ...ntl });
            } else {
              existingBuf.tankLogs.set(tkKey, {
                ...prevTl,
                timestamp,
                amountKg: parseFloat((prevTl.amountKg + ntl.amountKg).toFixed(4)),
                newLevelKg: ntl.newLevelKg,
                cartonsCount: (prevTl.cartonsCount || 0) + (ntl.cartonsCount || 0),
                operatorName: ntl.operatorName || prevTl.operatorName,
                notes: ntl.notes
              });
            }
          });
          existingBuf.accumulatedCartons += effectiveCartons;
        }

        if (autoCompletedLineMsg) {
          flushAutoCartonBuffer(bufferKey);
          markExplicitOperationsWrite();
        }
      }

      if (autoCompletedLineMsg) {
        setTimeout(() => showToast(autoCompletedLineMsg!), 30);
      }

      return {
        success: true,
        message: `Berhasil mencatat ${effectiveCartons} karton ${targetSku.name}${
          resolvedLineName ? ` (${resolvedLineName})` : ''
        }. Isi tangki Holding & Storage otomatis berkurang!`
      };
    },
    [
      getActiveActorEmail,
      dispatchAppendTx,
      flushAutoCartonBuffer,
      markExplicitOperationsWrite,
      showToast,
      autoCartonBufferRef,
      setState,
      stateRef
    ]
  );

  // Rule Baru: Inter-Tank Transfer (Holding Tank -> Storage Tank, Storage Tank -> Holding Tank)
  const handleTransferBetweenTanks = (
    sourceTankId: string,
    destTankId: string,
    amountKg: number,
    notes?: string,
    operatorName?: string
  ): { success: boolean; message: string } => {
    const currentState = stateRef.current;
    const source = currentState.master.tanks.find(t => t.id === sourceTankId);
    const dest = currentState.master.tanks.find(t => t.id === destTankId);
    if (!source || !dest) return { success: false, message: 'Tangki tidak ditemukan!' };

    if (source.currentLevelKg < amountKg) {
      return {
        success: false,
        message: `Level tangki ${source.code} tidak mencukupi (${source.currentLevelKg.toFixed(1)} kg)`
      };
    }

    const freeSpace = dest.capacityKg - dest.currentLevelKg;
    if (amountKg > freeSpace) {
      return {
        success: false,
        message: `Melebihi kapasitas sisa tangki tujuan ${dest.code} (${freeSpace.toFixed(1)} kg tersisa)`
      };
    }

    // 1-WIP Rule check
    if (
      dest.currentLevelKg > 0.001 &&
      dest.assignedWipId &&
      source.assignedWipId &&
      dest.assignedWipId !== source.assignedWipId
    ) {
      return {
        success: false,
        message: 'Pelanggaran Aturan 1-WIP: Tangki tujuan memiliki WIP berbeda! Transfer dibatalkan.'
      };
    }

    const timestamp = new Date().toISOString();
    const sourceWip = currentState.master.wips.find(w => w.id === source.assignedWipId);
    const newSourceLevel = Math.max(0, source.currentLevelKg - amountKg);
    const newDestLevel = Math.min(dest.capacityKg, dest.currentLevelKg + amountKg);
    const baseTs = Date.now();

    const transferLog1: TankTransferLog = {
      id: `tl_${baseTs}_src`,
      timestamp,
      tankId: source.id,
      tankCode: source.code,
      tankName: source.name,
      type: 'MANUAL_TOPUP',
      amountKg: -amountKg,
      previousLevelKg: source.currentLevelKg,
      newLevelKg: newSourceLevel,
      wipId: source.assignedWipId,
      wipName: sourceWip?.name,
      operatorName,
      notes: `Transfer keluar (${amountKg.toFixed(1)} kg) ➔ ${dest.code} (${
        dest.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'
      }). ${notes || ''}`
    };

    const transferLog2: TankTransferLog = {
      id: `tl_${baseTs}_dest`,
      timestamp,
      tankId: dest.id,
      tankCode: dest.code,
      tankName: dest.name,
      type: 'WIP_BATCH_INFLOW',
      amountKg,
      previousLevelKg: dest.currentLevelKg,
      newLevelKg: newDestLevel,
      wipId: source.assignedWipId,
      wipName: sourceWip?.name,
      operatorName,
      notes: `Transfer masuk (${amountKg.toFixed(1)} kg) dari ${source.code} (${
        source.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'
      }). ${notes || ''}`
    };

    const actorEmail = getActiveActorEmail();
    flushAutoCartonBuffer();
    markExplicitOperationsWrite();
    dispatchAppendTx(toTransactionDocFromTankLog(transferLog1, actorEmail));
    dispatchAppendTx(toTransactionDocFromTankLog(transferLog2, actorEmail));

    setState(prev => {
      const updatedTanks = prev.master.tanks.map(t => {
        if (t.id === sourceTankId) {
          return { ...t, currentLevelKg: newSourceLevel };
        }
        if (t.id === destTankId) {
          return {
            ...t,
            currentLevelKg: newDestLevel,
            assignedWipId: t.assignedWipId || source.assignedWipId
          };
        }
        return t;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          tanks: updatedTanks
        },
        transactions: {
          ...prev.transactions,
          tankLogs: [transferLog1, transferLog2, ...(prev.transactions.tankLogs || [])]
        }
      };
    });

    const isRuleBaru = source.type === 'HOLDING_TANK' && dest.type === 'STORAGE_TANK';
    return {
      success: true,
      message: `Berhasil mentransfer ${amountKg.toFixed(1)} kg WIP dari ${source.code} (${
        source.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'
      }) ke ${dest.code} (${dest.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'})${
        isRuleBaru ? ' [Rule Baru: Holding ➔ Storage]' : ''
      }`
    };
  };

  // Stop a line automatically due to Material Shortage (empty / insufficient WIP in Holding Tank)
  const handleTriggerMaterialShortageStop = useCallback(
    (targetRunOrId: ActiveSkuProductionRun | string, reasonMessage: string) => {
      flushAutoCartonBuffer();
      markExplicitOperationsWrite();
      const currentState = stateRef.current;
      const prevRuns =
        currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
      const targetRun =
        typeof targetRunOrId === 'string'
          ? prevRuns.find(r => r.id === targetRunOrId || (r.lineId === targetRunOrId && r.isRunning))
          : prevRuns.find(r =>
              targetRunOrId.id ? r.id === targetRunOrId.id : r.lineId === targetRunOrId.lineId && r.isRunning
            ) || targetRunOrId;

      if (!targetRun) return;

      const stoppedAt = new Date().toISOString();
      const stopLogId = `stop_shortage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newStopLog: ProductionStopLog = {
        id: stopLogId,
        lineId: targetRun.lineId,
        lineName: targetRun.lineName,
        skuId: targetRun.skuId,
        skuName: targetRun.skuName,
        skuCode: targetRun.skuCode,
        shift: targetRun.shift || getCurrentShift().shift,
        startedAt: targetRun.startedAt,
        stoppedAt,
        durationMinutes: 1,
        category: 'MATERIAL_SHORTAGE',
        categoryLabel: 'Material Shortage (WIP Holding Tank Habis)',
        lossType: 'DOWNTIME',
        reasonTitle: reasonMessage || 'Material / WIP di Holding Tank habis atau di bawah kebutuhan 1 karton',
        subReason: 'Stok WIP di Holding Tank habis saat produksi berjalan',
        actionTaken: 'Menunggu pengisian / transfer batch WIP kembali ke Holding Tank',
        operatorName: targetRun.operatorName,
        cartonsProducedDuringRun: targetRun.cartonsProducedTotal || 0
      };

      setState(prev => {
        const currentRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
        const updatedRuns = currentRuns.map(r => {
          const isMatch = targetRun.id
            ? r.id === targetRun.id
            : r.lineId === targetRun.lineId && r.skuId === targetRun.skuId && r.isRunning;
          if (!isMatch) return r;
          return {
            ...r,
            isRunning: false,
            completionStatus: 'STOPPED_SHORTAGE' as const,
            shortageReason: reasonMessage,
            shortageStopLogId: stopLogId,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            completedAt: stoppedAt
          };
        });
        const stillRunning = updatedRuns.find(r => r.isRunning);
        return {
          ...prev,
          activeSkuRuns: updatedRuns,
          activeSkuRun: stillRunning || null,
          transactions: {
            ...prev.transactions,
            productionStops: [newStopLog, ...(prev.transactions.productionStops || [])]
          }
        };
      });

      showToast(
        `Material Shortage [${targetRun.lineName || 'Line'} · ${targetRun.skuName}]: ${reasonMessage}`,
        true
      );
    },
    [flushAutoCartonBuffer, markExplicitOperationsWrite, showToast, setState, stateRef]
  );

  // Start Single SKU Production on a Line
  const handleStartSkuProduction = (
    skuId: string,
    operatorName?: string,
    speedMultiplier: number = 1,
    selectedHoldingTanks?: Record<string, string>,
    lineId?: string,
    plannedCartons?: number,
    shiftOverride?: ShiftNumber
  ) => {
    const currentState = stateRef.current;
    const targetSku = currentState.master.skus.find(s => s.id === skuId);
    if (!targetSku) return;

    const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuId);
    if (linkedWips.length === 0) {
      showToast(`SKU "${targetSku.name}" belum memiliki relasi BOM WIP! Harap atur di Master BOM.`, true);
      return;
    }

    const lines = currentState.master.productionLines || [];
    const prevRuns =
      currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningRuns = prevRuns.filter(r => r.isRunning);

    let targetLine = lineId ? lines.find(l => l.id === lineId) : undefined;
    if (lineId && !targetLine) {
      showToast('Line produksi tidak ditemukan.', true);
      return;
    }

    if (targetLine) {
      const busyRun = runningRuns.find(r => r.lineId === targetLine!.id);
      if (busyRun) {
        showToast(
          `${targetLine.name} sedang memproduksi "${busyRun.skuName}". Tunggu hingga selesai/dihentikan sebelum menjalankan SKU lain.`,
          true
        );
        return;
      }
    } else {
      targetLine = lines.find(l => l.isActive && !runningRuns.some(r => r.lineId === l.id)) || lines[0];
      if (targetLine && runningRuns.some(r => r.lineId === targetLine!.id)) {
        showToast(
          'Semua line produksi sedang berjalan. Selesaikan satu line terlebih dahulu atau tambahkan line baru.',
          true
        );
        return;
      }
    }

    const currentPeriod = getShiftPeriodInfo();
    const activeShift = shiftOverride || currentPeriod.shift;
    const op = operatorName || currentState.currentSession?.name || 'Operator Line Produksi';
    const resolvedPlanned =
      plannedCartons && plannedCartons > 0 ? plannedCartons : (targetSku.targetHour || 500) * 8;
    const resolvedLineId = targetLine?.id || 'line_a';
    const resolvedLineName = targetLine?.name || 'Line A';
    const runId = `run_${resolvedLineId}_${Date.now()}`;

    const newRun: ActiveSkuProductionRun = {
      id: runId,
      lineId: resolvedLineId,
      lineName: resolvedLineName,
      skuId: targetSku.id,
      skuName: targetSku.name,
      skuCode: targetSku.code,
      shift: activeShift,
      shiftPeriodKey: currentPeriod.shiftKey,
      plannedCartons: resolvedPlanned,
      startedAt: new Date().toISOString(),
      isRunning: true,
      completionStatus: 'RUNNING',
      cartonsProducedTotal: 0,
      operatorName: op,
      targetPerHour: targetSku.targetHour,
      speedMultiplier: speedMultiplier || 1,
      selectedHoldingTanks:
        selectedHoldingTanks && Object.keys(selectedHoldingTanks).length > 0
          ? selectedHoldingTanks
          : undefined
    };

    markExplicitOperationsWrite();
    setState(prev => {
      const curRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const preservedRuns = curRuns.filter(
        r => r.lineId !== resolvedLineId || r.completionStatus === 'SHIFT_HANDOVER'
      );
      const updatedRuns = [newRun, ...preservedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRun
      };
    });

    setTimeout(() => {
      const res = handleProduceCartons(
        targetSku.id,
        1,
        op,
        `Mulai Produksi [${resolvedLineName}]: ${targetSku.name} (Planning ${resolvedPlanned.toLocaleString()} ktn / Shift ${activeShift})`,
        selectedHoldingTanks,
        runId,
        resolvedLineId,
        resolvedLineName
      );
      if (!res.success) {
        handleTriggerMaterialShortageStop(newRun, res.message);
      }
    }, 50);

    const selectedCodes = selectedHoldingTanks
      ? Object.values(selectedHoldingTanks)
          .map(tId => currentState.master.tanks.find(t => t.id === tId)?.code)
          .filter(Boolean)
      : [];

    showToast(
      selectedCodes.length > 0
        ? `[${resolvedLineName}] Produksi "${targetSku.name}" dimulai (Planning: ${resolvedPlanned.toLocaleString()} ktn) dengan Holding Tank [${selectedCodes.join(', ')}].`
        : `[${resolvedLineName}] Produksi "${targetSku.name}" dimulai (Planning: ${resolvedPlanned.toLocaleString()} ktn / Shift ${activeShift}).`
    );
  };

  // Start 1 or Multiple Production Lines Concurrently
  const handleStartLineBatchRuns = (
    assignments: {
      lineId: string;
      skuId: string;
      plannedCartons: number;
      shift?: ShiftNumber;
      operatorName?: string;
      speedMultiplier?: number;
      selectedHoldingTanks?: Record<string, string>;
    }[]
  ) => {
    const currentState = stateRef.current;
    if (assignments.length === 0) {
      showToast('Pilih minimal satu line produksi & SKU untuk dijalankan.', true);
      return;
    }

    const lines = currentState.master.productionLines || [];
    const prevRuns =
      currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const runningLineIds = new Set(prevRuns.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));
    const currentPeriod = getShiftPeriodInfo();

    const seenLineIds = new Set<string>();
    const newRuns: ActiveSkuProductionRun[] = [];

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      if (seenLineIds.has(a.lineId)) {
        showToast('Setiap line produksi hanya dapat memproduksi 1 jenis SKU dalam satu waktu.', true);
        return;
      }
      seenLineIds.add(a.lineId);

      const lineObj = lines.find(l => l.id === a.lineId);
      if (!lineObj) {
        showToast('Line produksi tidak ditemukan.', true);
        return;
      }
      if (runningLineIds.has(a.lineId)) {
        showToast(`${lineObj.name} masih berjalan. Selesaikan atau hentikan dahulu sebelum mengganti SKU.`, true);
        return;
      }

      const skuObj = currentState.master.skus.find(s => s.id === a.skuId);
      if (!skuObj) {
        showToast(`SKU untuk ${lineObj.name} belum dipilih.`, true);
        return;
      }
      const linkedWips = currentState.master.skuWips.filter(sw => sw.skuId === skuObj.id);
      if (linkedWips.length === 0) {
        showToast(`SKU "${skuObj.name}" (${lineObj.name}) belum memiliki relasi BOM WIP di Master BOM.`, true);
        return;
      }

      const planned = a.plannedCartons > 0 ? a.plannedCartons : (skuObj.targetHour || 500) * 8;
      const op = a.operatorName || currentState.currentSession?.name || 'Operator Line Produksi';

      newRuns.push({
        id: `run_${lineObj.id}_${Date.now()}_${i}`,
        lineId: lineObj.id,
        lineName: lineObj.name,
        skuId: skuObj.id,
        skuName: skuObj.name,
        skuCode: skuObj.code,
        shift: a.shift || currentPeriod.shift,
        shiftPeriodKey: currentPeriod.shiftKey,
        plannedCartons: planned,
        startedAt: new Date().toISOString(),
        isRunning: true,
        completionStatus: 'RUNNING',
        cartonsProducedTotal: 0,
        operatorName: op,
        targetPerHour: skuObj.targetHour,
        speedMultiplier: a.speedMultiplier || 1,
        selectedHoldingTanks:
          a.selectedHoldingTanks && Object.keys(a.selectedHoldingTanks).length > 0
            ? a.selectedHoldingTanks
            : undefined
      });
    }

    const replacingLineIds = new Set(newRuns.map(r => r.lineId));
    markExplicitOperationsWrite();
    setState(prev => {
      const curRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const unchangedRuns = curRuns.filter(
        r => !replacingLineIds.has(r.lineId) || r.completionStatus === 'SHIFT_HANDOVER'
      );
      const updatedRuns = [...newRuns, ...unchangedRuns];
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: newRuns[0] || null
      };
    });

    newRuns.forEach((run, idx) => {
      setTimeout(() => {
        const res = handleProduceCartons(
          run.skuId,
          1,
          run.operatorName,
          `Mulai Produksi [${run.lineName}]: ${run.skuName} (Planning ${run.plannedCartons?.toLocaleString()} ktn / Shift ${run.shift})`,
          run.selectedHoldingTanks,
          run.id,
          run.lineId,
          run.lineName
        );
        if (!res.success) {
          handleTriggerMaterialShortageStop(run, res.message);
        }
      }, 60 * (idx + 1));
    });

    showToast(`${newRuns.length} Line Produksi dijalankan bersamaan! Pengurangan WIP Holding Tank aktif sesuai BOM.`);
  };

  // Legacy wrapper for multi-SKU quick start
  const handleStartMultipleSkus = (
    skuIds: string[],
    operatorName?: string,
    speedMultiplier: number = 1,
    selectedHoldingTanksBySku?: Record<string, Record<string, string>>
  ) => {
    const currentState = stateRef.current;
    const lines = currentState.master.productionLines || [];
    const prevRuns =
      currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const busyLineIds = new Set(prevRuns.filter(r => r.isRunning && r.lineId).map(r => r.lineId!));
    const freeLines = lines.filter(l => l.isActive && !busyLineIds.has(l.id));

    const assignments = skuIds.slice(0, freeLines.length).map((skuId, idx) => {
      const sku = currentState.master.skus.find(s => s.id === skuId);
      return {
        lineId: freeLines[idx].id,
        skuId,
        plannedCartons: (sku?.targetHour || 500) * 8,
        operatorName,
        speedMultiplier,
        selectedHoldingTanks: selectedHoldingTanksBySku?.[skuId]
      };
    });

    if (assignments.length === 0) {
      showToast('Tidak ada line produksi standby yang tersedia.', true);
      return;
    }
    handleStartLineBatchRuns(assignments);
  };

  // Handle SKU Changeover on a production line
  const handleSkuChangeover = (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => {
    const currentState = stateRef.current;
    const targetLine = (currentState.master.productionLines || []).find(l => l.id === lineId);
    const targetSku = currentState.master.skus.find(s => s.id === newSkuId);
    if (!targetSku) return;

    const completedAt = new Date().toISOString();
    const startedAt = completedAt;
    const currentPeriod = getShiftPeriodInfo();

    flushAutoCartonBuffer();
    markExplicitOperationsWrite();
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (r.lineId === lineId && r.isRunning) {
          return {
            ...r,
            isRunning: false,
            completionStatus: 'COMPLETED' as const,
            completedAt
          };
        }
        return r;
      });

      const newRun: ActiveSkuProductionRun = {
        id: `run_${lineId}_${Date.now()}_co`,
        lineId,
        lineName: targetLine?.name || 'Line Produksi',
        skuId: newSkuId,
        skuName: targetSku.name,
        skuCode: targetSku.code,
        shift: currentPeriod.shift,
        shiftPeriodKey: currentPeriod.shiftKey,
        startedAt,
        isRunning: true,
        completionStatus: 'RUNNING',
        cartonsProducedTotal: 0,
        plannedCartons: (targetSku.targetHour || 500) * 8,
        operatorName: changeoverData.operatorName,
        targetPerHour: targetSku.targetHour,
        speedMultiplier: 1
      };

      const newChangeoverRecord: MachineChangeoverRecord = {
        id: `co_${Date.now()}`,
        machineId: lineId,
        machineCode: targetLine?.code || lineId,
        machineName: targetLine?.name || 'Line',
        timestamp: completedAt,
        startedAt,
        status: 'COMPLETED',
        fromWipId: '',
        fromWipName: '',
        toWipId: newSkuId,
        toWipName: targetSku.name,
        changeoverType: changeoverData.changeoverType,
        durationMinutes: changeoverData.estimatedMinutes,
        operatorName: changeoverData.operatorName,
        completedAt,
        checklist: {
          lineClearanceDone: true,
          cleaningSanitationDone: true,
          toolingMouldSwapped: changeoverData.changeoverType === 'MOULD_TOOLING',
          parameterConfigured: true,
          qcSwabClearanceDone: true
        },
        notes: `Changeover SKU ke ${targetSku.name} (${changeoverData.changeoverType}). ${changeoverData.notes || ''}`
      };

      return {
        ...prev,
        activeSkuRuns: [newRun, ...updatedRuns],
        activeSkuRun: newRun,
        transactions: {
          ...prev.transactions,
          changeovers: [newChangeoverRecord, ...(prev.transactions.changeovers || [])]
        }
      };
    });

    showToast(`Changeover SKU ke "${targetSku.name}" pada ${targetLine?.name || lineId} berhasil dilakukan.`);
  };

  // Switch active Holding Tank for a WIP during an ongoing line production run
  const handleUpdateRunHoldingTank = (skuId: string, wipId: string, tankId: string, runId?: string) => {
    const currentState = stateRef.current;
    const tankObj = currentState.master.tanks.find(t => t.id === tankId);
    const wipObj = currentState.master.wips.find(w => w.id === wipId);

    markExplicitOperationsWrite();
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        const isMatch = runId ? r.id === runId : r.skuId === skuId && r.isRunning;
        if (!isMatch) return r;
        return {
          ...r,
          selectedHoldingTanks: {
            ...(r.selectedHoldingTanks || {}),
            [wipId]: tankId
          }
        };
      });
      const updatedActiveRun =
        prev.activeSkuRun && (runId ? prev.activeSkuRun.id === runId : prev.activeSkuRun.skuId === skuId)
          ? {
              ...prev.activeSkuRun,
              selectedHoldingTanks: {
                ...(prev.activeSkuRun.selectedHoldingTanks || {}),
                [wipId]: tankId
              }
            }
          : prev.activeSkuRun;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: updatedActiveRun
      };
    });

    if (tankObj && wipObj) {
      showToast(`Sumber Holding Tank untuk ${wipObj.name} dialihkan ke ${tankObj.code} (${tankObj.name})`);
    }
  };

  // Change Speed Multiplier for live automated depletion
  const handleSetRunSpeedMultiplier = (speedMultiplier: number, runIdOrSkuId?: string) => {
    markExplicitOperationsWrite();
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (!runIdOrSkuId || r.id === runIdOrSkuId || r.lineId === runIdOrSkuId || r.skuId === runIdOrSkuId) {
          return { ...r, speedMultiplier };
        }
        return r;
      });
      const updatedActiveRun = prev.activeSkuRun
        ? !runIdOrSkuId ||
          prev.activeSkuRun.id === runIdOrSkuId ||
          prev.activeSkuRun.lineId === runIdOrSkuId ||
          prev.activeSkuRun.skuId === runIdOrSkuId
          ? { ...prev.activeSkuRun, speedMultiplier }
          : prev.activeSkuRun
        : null;

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: updatedActiveRun
      };
    });
  };

  // Complete a Line Run Normally
  const handleCompleteLineRun = (runIdOrLineId: string, notes?: string) => {
    flushAutoCartonBuffer();
    markExplicitOperationsWrite();
    const completedAt = new Date().toISOString();
    let completedInfo = '';

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        if (r.id === runIdOrLineId || (r.lineId === runIdOrLineId && r.isRunning)) {
          completedInfo = `${r.lineName || 'Line'} (${r.skuName} · ${(r.cartonsProducedTotal || 0).toLocaleString()} ktn)`;
          return {
            ...r,
            isRunning: false,
            completionStatus: 'COMPLETED' as const,
            completedAt
          };
        }
        return r;
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || null
      };
    });

    showToast(
      `Produksi selesai normal: ${completedInfo || 'Line'} sekarang berstatus Standby${notes ? ` (${notes})` : ''}.`
    );
  };

  // Resume a stopped line run
  const handleResumeLineRun = (runIdOrLineId: string) => {
    const currentState = stateRef.current;
    const prevRuns =
      currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
    const targetRun = prevRuns.find(
      r =>
        !r.isRunning &&
        r.completionStatus !== 'SHIFT_HANDOVER' &&
        (r.id === runIdOrLineId || r.lineId === runIdOrLineId)
    );
    if (!targetRun) {
      showToast('Data run produksi yang akan dilanjutkan tidak ditemukan.', true);
      return;
    }

    if (targetRun.lineId && prevRuns.some(r => r.lineId === targetRun.lineId && r.isRunning)) {
      showToast(`${targetRun.lineName || 'Line'} sedang menjalankan SKU lain.`, true);
      return;
    }

    const availability = checkRunHoldingTankAvailability(
      targetRun.skuId,
      currentState,
      targetRun.selectedHoldingTanks
    );

    if (!availability.isReady) {
      showToast(
        `WIP di Holding Tank belum mencukupi untuk melanjutkan [${targetRun.lineName || 'Line'}]: ${availability.missingDetails.join('; ')}`,
        true
      );
      return;
    }

    const resumedAtIso = new Date().toISOString();
    const currentPeriod = getShiftPeriodInfo();
    const isCrossShiftResume =
      targetRun.shift !== currentPeriod.shift ||
      (targetRun.shiftPeriodKey
        ? !targetRun.shiftPeriodKey.startsWith('MANUAL_HANDOVER_') &&
          targetRun.shiftPeriodKey !== currentPeriod.shiftKey
        : new Date(targetRun.startedAt).getTime() < new Date(currentPeriod.periodStartIso).getTime());

    const targetRunId = isCrossShiftResume
      ? `run_${targetRun.lineId || 'line'}_${Date.now()}_resumed`
      : targetRun.id || `run_${targetRun.lineId || 'line'}_${Date.now()}`;
    const wasSblStop = targetRun.completionStatus === 'STOPPED_SBL';
    const linkedSblLog = targetRun.sblStopLogId
      ? (currentState.transactions.productionStops || []).find(l => l.id === targetRun.sblStopLogId)
      : undefined;
    const sblEstMin =
      targetRun.sblEstimatedMinutes ?? linkedSblLog?.estimatedRepairMinutes ?? linkedSblLog?.durationMinutes ?? 0;
    const sblStoppedTimestamp = targetRun.sblStoppedAt || linkedSblLog?.stoppedAt || targetRun.completedAt;
    const sblElapsedMin = sblStoppedTimestamp
      ? Math.max(1, Math.round((Date.now() - new Date(sblStoppedTimestamp).getTime()) / 60000))
      : 1;
    const sblSavedMin = Math.max(0, sblEstMin - sblElapsedMin);

    markExplicitOperationsWrite();
    setState(prev => {
      const currentRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      let resumedRunObj: ActiveSkuProductionRun | null = null;
      const updatedRuns: ActiveSkuProductionRun[] = [];

      currentRuns.forEach(r => {
        const isMatch = targetRun.id
          ? r.id === targetRun.id
          : r.lineId === targetRun.lineId && r.skuId === targetRun.skuId;
        if (!isMatch) {
          updatedRuns.push(r);
          return;
        }
        if (isCrossShiftResume) {
          const remaining =
            r.plannedCartons && r.plannedCartons > 0
              ? Math.max(1, r.plannedCartons - (r.cartonsProducedTotal || 0))
              : (r.targetPerHour || 500) * 8;
          resumedRunObj = {
            ...r,
            id: targetRunId,
            shift: currentPeriod.shift,
            shiftPeriodKey: currentPeriod.shiftKey,
            startedAt: resumedAtIso,
            isRunning: true,
            completionStatus: 'RUNNING' as const,
            cartonsProducedTotal: 0,
            plannedCartons: remaining,
            carriedOverFromShift: r.shift,
            previousShiftCartons: r.cartonsProducedTotal || 0,
            shortageReason: undefined,
            shortageStopLogId: undefined,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            completedAt: undefined,
            lastDeductionTime: resumedAtIso
          };
          updatedRuns.push(resumedRunObj, {
            ...r,
            isRunning: false,
            completionStatus: 'SHIFT_HANDOVER' as const,
            handoverToShift: currentPeriod.shift,
            completedAt: resumedAtIso
          });
        } else {
          resumedRunObj = {
            ...r,
            id: targetRunId,
            isRunning: true,
            completionStatus: 'RUNNING' as const,
            shortageReason: undefined,
            shortageStopLogId: undefined,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            completedAt: undefined,
            lastDeductionTime: resumedAtIso
          };
          updatedRuns.push(resumedRunObj);
        }
      });

      const updatedStops = (prev.transactions.productionStops || []).map(log => {
        if (targetRun.shortageStopLogId && log.id === targetRun.shortageStopLogId) {
          const elapsedMin = Math.max(
            1,
            Math.round((Date.now() - new Date(log.stoppedAt).getTime()) / 60000)
          );
          return {
            ...log,
            durationMinutes: elapsedMin,
            actualRepairMinutes: elapsedMin,
            resumedAt: resumedAtIso,
            actionTaken: 'Produksi dilanjutkan kembali setelah WIP tersedia di Holding Tank'
          };
        }
        if (targetRun.sblStopLogId && log.id === targetRun.sblStopLogId) {
          const estMin = targetRun.sblEstimatedMinutes ?? log.estimatedRepairMinutes ?? log.durationMinutes;
          const elapsedMin = Math.max(
            1,
            Math.round((Date.now() - new Date(log.stoppedAt).getTime()) / 60000)
          );
          const savedMin = Math.max(0, estMin - elapsedMin);
          const summaryNote =
            savedMin > 0
              ? `Perbaikan selesai ${elapsedMin} mnt (lebih cepat ${savedMin} mnt dari est. ${estMin} mnt) · Produksi dilanjutkan`
              : `Perbaikan selesai (${elapsedMin} mnt dari est. ${estMin} mnt) · Produksi dilanjutkan`;
          return {
            ...log,
            estimatedRepairMinutes: estMin,
            actualRepairMinutes: elapsedMin,
            durationMinutes: elapsedMin,
            resumedAt: resumedAtIso,
            actionTaken: log.actionTaken ? `${log.actionTaken} | ${summaryNote}` : summaryNote
          };
        }
        return log;
      });

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: resumedRunObj || updatedRuns.find(r => r.isRunning) || null,
        transactions: {
          ...prev.transactions,
          productionStops: updatedStops
        }
      };
    });

    setTimeout(() => {
      const res = handleProduceCartons(
        targetRun.skuId,
        1,
        targetRun.operatorName,
        wasSblStop
          ? `Lanjut Produksi [${targetRun.lineName || 'Line'}]: ${targetRun.skuName} setelah perbaikan SBL (${sblElapsedMin} mnt)`
          : `Lanjut Produksi [${targetRun.lineName || 'Line'}]: ${targetRun.skuName} setelah pengisian WIP Holding Tank`,
        targetRun.selectedHoldingTanks,
        targetRunId,
        targetRun.lineId,
        targetRun.lineName
      );
      if (!res.success) {
        handleTriggerMaterialShortageStop(targetRunId, res.message);
      }
    }, 50);

    const remainingTarget = targetRun.plannedCartons
      ? Math.max(0, targetRun.plannedCartons - (targetRun.cartonsProducedTotal || 0))
      : 0;
    if (wasSblStop) {
      showToast(
        sblSavedMin > 0
          ? `[${targetRun.lineName || 'Line'}] Perbaikan selesai dalam ${sblElapsedMin} menit (lebih cepat ${sblSavedMin} mnt dari estimasi ${sblEstMin} mnt)! Produksi "${targetRun.skuName}" dilanjutkan.`
          : `[${targetRun.lineName || 'Line'}] Perbaikan selesai (${sblElapsedMin} menit). Produksi "${targetRun.skuName}" dilanjutkan kembali.`
      );
    } else {
      showToast(
        `[${targetRun.lineName || 'Line'}] Produksi "${targetRun.skuName}" dilanjutkan kembali! WIP siap (±${availability.minPossibleCartons.toLocaleString()} ktn${
          remainingTarget > 0 ? `, sisa target ${remainingTarget.toLocaleString()} ktn` : ''
        }).`
      );
    }
  };

  // Stop Specific Line / SKU Production due to Problem (Six Big Losses TPM)
  const handleStopSkuProduction = (stopData: Omit<ProductionStopLog, 'id'>) => {
    flushAutoCartonBuffer();
    markExplicitOperationsWrite();
    const newStopLog: ProductionStopLog = {
      ...stopData,
      estimatedRepairMinutes: stopData.estimatedRepairMinutes ?? stopData.durationMinutes,
      id: `stop_${Date.now()}`
    };

    const targetLineId = stopData.lineId;
    const targetSkuId = stopData.skuId;
    const completedAt = new Date().toISOString();
    const isMaterialShortage = stopData.category === 'MATERIAL_SHORTAGE';
    const estMinutes = stopData.estimatedRepairMinutes ?? stopData.durationMinutes;

    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r => {
        const isMatch = targetLineId
          ? r.lineId === targetLineId && r.isRunning
          : r.skuId === targetSkuId && r.isRunning;
        if (isMatch) {
          return {
            ...r,
            isRunning: false,
            completionStatus: isMaterialShortage ? ('STOPPED_SHORTAGE' as const) : ('STOPPED_SBL' as const),
            shortageReason: isMaterialShortage ? stopData.reasonTitle : undefined,
            shortageStopLogId: isMaterialShortage ? newStopLog.id : undefined,
            sblStopLogId: !isMaterialShortage ? newStopLog.id : undefined,
            sblEstimatedMinutes: !isMaterialShortage ? estMinutes : undefined,
            sblStoppedAt: !isMaterialShortage ? stopData.stoppedAt || completedAt : undefined,
            sblReason: !isMaterialShortage ? stopData.reasonTitle : undefined,
            sblCategoryLabel: !isMaterialShortage ? stopData.categoryLabel : undefined,
            completedAt
          };
        }
        return r;
      });
      const stillRunning = updatedRuns.find(r => r.isRunning);

      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: stillRunning || null,
        transactions: {
          ...prev.transactions,
          productionStops: [newStopLog, ...(prev.transactions.productionStops || [])]
        }
      };
    });

    showToast(
      isMaterialShortage
        ? `Produksi ${stopData.lineName ? `[${stopData.lineName}] ` : ''}"${stopData.skuName}" dihentikan: Material Shortage tercatat. Dapat dilanjutkan kembali setelah WIP Holding Tank terisi.`
        : `Produksi ${stopData.lineName ? `[${stopData.lineName}] ` : ''}"${stopData.skuName}" dihentikan (SBL · Est. perbaikan ${estMinutes} mnt). Klik "Start Produksi Kembali" jika perbaikan selesai.`
    );
  };

  // Stop All Running Lines Production
  const handleStopAllSkuProduction = () => {
    flushAutoCartonBuffer();
    markExplicitOperationsWrite();
    const completedAt = new Date().toISOString();
    setState(prev => {
      const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
      const updatedRuns = prevRuns.map(r =>
        r.isRunning ? { ...r, isRunning: false, completionStatus: 'COMPLETED' as const, completedAt } : r
      );
      return {
        ...prev,
        activeSkuRuns: updatedRuns,
        activeSkuRun: null
      };
    });
    showToast('Seluruh line produksi yang sedang berjalan telah dihentikan.');
  };

  // Shift Transition / Handover Logic
  const handleTriggerShiftHandover = useCallback(
    (options?: {
      isAutomatic?: boolean;
      targetShift?: ShiftNumber;
      targetPeriodKey?: string;
      forceHandoverAll?: boolean;
    }) => {
      flushAutoCartonBuffer();
      const currentState = stateRef.current;
      const curRuns =
        currentState.activeSkuRuns || (currentState.activeSkuRun ? [currentState.activeSkuRun] : []);
      const currentPeriod = getShiftPeriodInfo(new Date());
      const isAuto = options?.isAutomatic ?? false;
      const forceAll = options?.forceHandoverAll ?? !isAuto;

      const runsToHandover = curRuns.filter(r => {
        if (!r.isRunning) return false;
        if (forceAll) return true;
        const isManual = r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_');
        if (isManual) {
          return Boolean(options?.targetShift && r.shift !== options.targetShift);
        }
        return (
          r.shift !== currentPeriod.shift ||
          (r.shiftPeriodKey
            ? r.shiftPeriodKey !== currentPeriod.shiftKey
            : new Date(r.startedAt).getTime() < new Date(currentPeriod.periodStartIso).getTime())
        );
      });

      if (runsToHandover.length === 0) {
        if (!isAuto) {
          showToast('Tidak ada line produksi aktif yang perlu di-handover ke shift berikutnya.', true);
        }
        return;
      }

      markExplicitOperationsWrite();
      const handoverIso = new Date().toISOString();
      const handoverRunIds = new Set(runsToHandover.map((r, i) => r.id || `${r.lineId}_${r.skuId}_${i}`));
      const firstFromShift = runsToHandover[0].shift;
      const resolvedGlobalNextShift = isAuto
        ? options?.targetShift || currentPeriod.shift
        : getNextShiftNumber(firstFromShift);

      setState(prev => {
        const prevRuns = prev.activeSkuRuns || (prev.activeSkuRun ? [prev.activeSkuRun] : []);
        const continuedRuns: ActiveSkuProductionRun[] = [];
        const archivedPrevRuns: ActiveSkuProductionRun[] = [];
        const untouchedRuns: ActiveSkuProductionRun[] = [];

        prevRuns.forEach((r, idx) => {
          const key = r.id || `${r.lineId}_${r.skuId}_${idx}`;
          const matches =
            r.isRunning &&
            (forceAll ||
              handoverRunIds.has(key) ||
              (!r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_') &&
                (r.shift !== currentPeriod.shift ||
                  (r.shiftPeriodKey ? r.shiftPeriodKey !== currentPeriod.shiftKey : false))));

          if (!matches) {
            untouchedRuns.push(r);
            return;
          }

          const nextShift = isAuto
            ? options?.targetShift || currentPeriod.shift
            : getNextShiftNumber(r.shift);
          const nextPeriodKey = isAuto
            ? options?.targetPeriodKey || currentPeriod.shiftKey
            : `MANUAL_HANDOVER_${currentPeriod.shiftKey}_${Date.now()}`;

          const skuObj = prev.master.skus.find(s => s.id === r.skuId);
          const defaultShiftPlan = (skuObj?.targetHour || r.targetPerHour || 500) * 8;
          const remainingTarget =
            r.plannedCartons && r.plannedCartons > 0
              ? Math.max(0, r.plannedCartons - (r.cartonsProducedTotal || 0))
              : defaultShiftPlan;
          const nextPlannedCartons = remainingTarget > 0 ? remainingTarget : defaultShiftPlan;

          archivedPrevRuns.push({
            ...r,
            isRunning: false,
            completionStatus: 'SHIFT_HANDOVER' as const,
            handoverToShift: nextShift,
            completedAt: handoverIso
          });

          continuedRuns.push({
            ...r,
            id: `run_${r.lineId || 'line'}_${Date.now()}_${idx}`,
            shift: nextShift,
            shiftPeriodKey: nextPeriodKey,
            startedAt: handoverIso,
            completedAt: undefined,
            isRunning: true,
            completionStatus: 'RUNNING' as const,
            cartonsProducedTotal: 0,
            plannedCartons: nextPlannedCartons,
            carriedOverFromShift: r.shift,
            previousShiftCartons: r.cartonsProducedTotal || 0,
            handoverToShift: undefined,
            shortageReason: undefined,
            shortageStopLogId: undefined,
            sblStopLogId: undefined,
            sblEstimatedMinutes: undefined,
            sblStoppedAt: undefined,
            sblReason: undefined,
            sblCategoryLabel: undefined,
            lastDeductionTime: handoverIso
          });
        });

        const updatedRuns = [...continuedRuns, ...archivedPrevRuns, ...untouchedRuns];
        return {
          ...prev,
          activeSkuRuns: updatedRuns,
          activeSkuRun: continuedRuns[0] || updatedRuns.find(r => r.isRunning) || null,
          lastShiftHandover: {
            fromShift: firstFromShift,
            toShift: resolvedGlobalNextShift,
            timestamp: handoverIso,
            handedOverCount: continuedRuns.length
          }
        };
      });

      showToast(
        `Pergantian Shift: ${runsToHandover.length} line produksi dari Shift ${firstFromShift} dihentikan & otomatis dilanjutkan ke Shift ${resolvedGlobalNextShift}.`
      );
    },
    [flushAutoCartonBuffer, markExplicitOperationsWrite, showToast, setState, stateRef]
  );

  // Auto Catch-Up Production Reconciliation
  const lastCatchUpMsRef = useRef<Record<string, number>>({});
  const catchUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconcileMissedProduction = useCallback(() => {
    const activeState = stateRef.current;
    if (!activeState.isAuthenticated) return;
    if (isApplyingRemoteRef.current) {
      if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
      catchUpTimerRef.current = setTimeout(() => {
        reconcileMissedProduction();
      }, 180);
      return;
    }

    const runsNow =
      activeState.activeSkuRuns || (activeState.activeSkuRun ? [activeState.activeSkuRun] : []);
    const runningRuns = runsNow.filter(r => r.isRunning);
    if (runningRuns.length === 0) return;

    const nowMs = Date.now();
    let processedAny = false;
    let hasMorePending = false;

    for (const run of runningRuns) {
      const sku = activeState.master.skus.find(s => s.id === run.skuId);
      if (!sku) continue;

      const runKey = run.id || `${run.lineId || 'line'}::${run.skuId}`;
      const calc = calculateMissedProduction({
        anchorIso: run.lastDeductionTime || run.startedAt,
        nowMs,
        targetPerHour: sku.targetHour || run.targetPerHour || 600,
        speedMultiplier: run.speedMultiplier || 1,
        plannedCartons: run.plannedCartons,
        cartonsProducedTotal: run.cartonsProducedTotal,
        minElapsedMsOverride: lastCatchUpMsRef.current[runKey] || 0
      });

      if (calc.missedCartons < 1 && !calc.isPlanAlreadyReached) continue;

      if (processedAny) {
        hasMorePending = true;
        break;
      }

      processedAny = true;
      lastCatchUpMsRef.current[runKey] = nowMs;

      if (calc.isPlanAlreadyReached) {
        handleProduceCartons(
          run.skuId,
          1,
          run.operatorName || 'Auto Catch-Up Engine (BOM)',
          `Auto [${run.lineName || 'Line'}] Catch-up Selesai Target`,
          run.selectedHoldingTanks,
          run.id,
          run.lineId,
          run.lineName
        );
        continue;
      }

      const qtyNeeded = calc.targetToProduce;
      if (qtyNeeded < 1) continue;

      const availability = checkRunHoldingTankAvailability(
        run.skuId,
        activeState,
        run.selectedHoldingTanks
      );
      const maxDeliverable = availability.minPossibleCartons;

      if (maxDeliverable >= qtyNeeded) {
        const res = handleProduceCartons(
          run.skuId,
          qtyNeeded,
          run.operatorName || 'Auto Catch-Up Engine (BOM)',
          `Auto [${run.lineName || 'Line'}] Catch-up ${qtyNeeded} ktn (${sku.name})`,
          run.selectedHoldingTanks,
          run.id,
          run.lineId,
          run.lineName
        );
        if (!res.success) {
          handleTriggerMaterialShortageStop(run, res.message);
        } else if (qtyNeeded >= 2) {
          showToast(
            `Catch-Up Otomatis [${run.lineName || 'Line'}]: +${qtyNeeded.toLocaleString('id-ID')} karton ${sku.name} disinkronkan.`
          );
        }
      } else {
        if (maxDeliverable >= 1) {
          handleProduceCartons(
            run.skuId,
            maxDeliverable,
            run.operatorName || 'Auto Catch-Up Engine (BOM)',
            `Auto [${run.lineName || 'Line'}] Catch-up Parsial ${maxDeliverable} ktn sebelum WIP habis (${sku.name})`,
            run.selectedHoldingTanks,
            run.id,
            run.lineId,
            run.lineName
          );
        }
        const shortageReason =
          availability.missingDetails.join('; ') ||
          `Stok WIP di tangki tidak mencukupi saat catch-up produksi (${qtyNeeded} karton tertinggal).`;
        handleTriggerMaterialShortageStop(run, shortageReason);
      }
    }

    if (hasMorePending) {
      if (catchUpTimerRef.current) clearTimeout(catchUpTimerRef.current);
      catchUpTimerRef.current = setTimeout(() => {
        reconcileMissedProduction();
      }, 45);
    }
  }, [handleProduceCartons, handleTriggerMaterialShortageStop, showToast, isApplyingRemoteRef, stateRef]);

  // Run Catch-Up Reconciliation once cloud workspace sync completes
  useEffect(() => {
    if (setupStatus === 'ready' && !isSyncingCloud && state.isAuthenticated) {
      reconcileMissedProduction();
    }
  }, [setupStatus, isSyncingCloud, state.isAuthenticated, reconcileMissedProduction]);

  // Run Catch-Up Reconciliation when tab returns to foreground or window regains focus
  useEffect(() => {
    if (setupStatus !== 'ready' || !state.isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        reconcileMissedProduction();
      }
    };
    const handleWindowFocus = () => {
      reconcileMissedProduction();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      if (catchUpTimerRef.current) {
        clearTimeout(catchUpTimerRef.current);
        catchUpTimerRef.current = null;
      }
    };
  }, [setupStatus, state.isAuthenticated, reconcileMissedProduction]);

  // Automatic clock watcher for shift boundaries (07:01 Shift 1, 15:01 Shift 2, 23:01 Shift 3)
  const lastClockShiftKeyRef = useRef<string>(getShiftPeriodInfo().shiftKey);
  const handleTriggerShiftHandoverRef = useRef(handleTriggerShiftHandover);
  useEffect(() => {
    handleTriggerShiftHandoverRef.current = handleTriggerShiftHandover;
  }, [handleTriggerShiftHandover]);

  useEffect(() => {
    const checkShiftBoundary = () => {
      const period = getShiftPeriodInfo(new Date());
      const clockBoundaryCrossed = lastClockShiftKeyRef.current !== period.shiftKey;
      if (clockBoundaryCrossed) {
        lastClockShiftKeyRef.current = period.shiftKey;
      }

      const runsNow =
        stateRef.current.activeSkuRuns ||
        (stateRef.current.activeSkuRun ? [stateRef.current.activeSkuRun] : []);
      const hasPendingHandover = runsNow.some(r => {
        if (!r.isRunning) return false;
        const isManual = r.shiftPeriodKey?.startsWith('MANUAL_HANDOVER_');
        if (isManual) {
          return clockBoundaryCrossed && r.shift !== period.shift;
        }
        return (
          r.shift !== period.shift ||
          (r.shiftPeriodKey
            ? r.shiftPeriodKey !== period.shiftKey
            : new Date(r.startedAt).getTime() < new Date(period.periodStartIso).getTime())
        );
      });

      if (hasPendingHandover) {
        handleTriggerShiftHandoverRef.current({
          isAutomatic: true,
          targetShift: period.shift,
          targetPeriodKey: period.shiftKey,
          forceHandoverAll: false
        });
      }
    };

    checkShiftBoundary();
    const timer = setInterval(checkShiftBoundary, 3000);
    return () => clearInterval(timer);
  }, [stateRef]);

  // Engine Pengurangan Isi Tangki Otomatis Real-Time untuk SEMUA Line Produksi yang Berjalan Bersamaan
  const runningRunsSnapshot = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
    r => r.isRunning
  );
  const runningRunsSignature = runningRunsSnapshot
    .map(r => `${r.id || r.lineId || r.skuId}:${r.skuId}:${r.speedMultiplier || 1}`)
    .join('|');

  useEffect(() => {
    const prevRuns =
      stateRef.current.activeSkuRuns ||
      (stateRef.current.activeSkuRun ? [stateRef.current.activeSkuRun] : []);
    const runningRuns = prevRuns.filter(r => r.isRunning);
    if (runningRuns.length === 0) return;

    const intervalIds: ReturnType<typeof setInterval>[] = [];

    runningRuns.forEach(run => {
      const currentSku = stateRef.current.master.skus.find(s => s.id === run.skuId);
      if (!currentSku) return;

      const targetPerHour = currentSku.targetHour || 600;
      const speedMult = run.speedMultiplier || 1;
      const secondsPerCarton = 3600 / targetPerHour;
      const intervalMs = Math.max(800, Math.round((secondsPerCarton / speedMult) * 1000));

      const timer = setInterval(() => {
        const activeState = stateRef.current;
        const runsNow =
          activeState.activeSkuRuns || (activeState.activeSkuRun ? [activeState.activeSkuRun] : []);
        const thisRun =
          (run.id ? runsNow.find(r => r.id === run.id) : undefined) ||
          (run.lineId ? runsNow.find(r => r.lineId === run.lineId && r.isRunning) : undefined) ||
          runsNow.find(r => r.skuId === run.skuId && r.isRunning);
        if (!thisRun?.isRunning) return;

        const res = handleProduceCartons(
          run.skuId,
          1,
          thisRun.operatorName || 'Auto Depletion Engine (BOM)',
          `Auto [${thisRun.lineName || 'Line'}] (${currentSku.name} - ${targetPerHour} ktn/jam) - Pengurangan Holding Tank sesuai BOM`,
          thisRun.selectedHoldingTanks,
          thisRun.id,
          thisRun.lineId,
          thisRun.lineName
        );

        if (!res.success) {
          handleTriggerMaterialShortageStop(thisRun, res.message);
        }
      }, intervalMs);

      intervalIds.push(timer);
    });

    return () => {
      intervalIds.forEach(id => clearInterval(id));
    };
  }, [runningRunsSignature, state.master.skus, handleProduceCartons, handleTriggerMaterialShortageStop, stateRef]);

  // Create Single Request
  const handleCreateRequest = (reqData: Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>) => {
    const currentState = stateRef.current;
    const count = currentState.transactions.requests.length + 1;
    const nowIso = new Date().toISOString();
    const reqNumber = `REQ-${nowIso.slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
    const uniqueSuffix = Math.random().toString(36).substring(2, 8);
    const newReq: MaterialRequest = {
      ...reqData,
      id: `req_${Date.now()}_${uniqueSuffix}`,
      requestNumber: reqNumber,
      date: nowIso.slice(0, 10),
      status: 'Pending'
    };

    dispatchAppendTx(
      toTransactionDocFromRequest(newReq, getActiveActorEmail(), currentState.master.skus, nowIso)
    );

    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        requests: [newReq, ...prev.transactions.requests]
      }
    }));
  };

  // Create Multiple Requests atomically
  const handleCreateMultipleRequests = (
    items: Array<Omit<MaterialRequest, 'id' | 'requestNumber' | 'date' | 'status'>>
  ) => {
    if (items.length === 0) return;
    const currentState = stateRef.current;
    const baseCount = currentState.transactions.requests.length;
    const nowMs = Date.now();
    const datePrefix = new Date(nowMs).toISOString().slice(0, 7).replace('-', '');
    const dateStr = new Date(nowMs).toISOString().slice(0, 10);

    const newRequests: MaterialRequest[] = items.map((reqData, idx) => {
      const count = baseCount + idx + 1;
      const reqNumber = `REQ-${datePrefix}-${String(count).padStart(3, '0')}`;
      const uniqueSuffix = Math.random().toString(36).substring(2, 8);
      return {
        ...reqData,
        id: `req_${nowMs}_${idx}_${uniqueSuffix}`,
        requestNumber: reqNumber,
        date: dateStr,
        status: 'Pending'
      };
    });

    const actorEmail = getActiveActorEmail();
    newRequests.forEach((req, idx) => {
      const itemIso = new Date(nowMs + idx).toISOString();
      dispatchAppendTx(toTransactionDocFromRequest(req, actorEmail, currentState.master.skus, itemIso));
    });

    setState(prev => ({
      ...prev,
      transactions: {
        ...prev.transactions,
        requests: [...newRequests, ...prev.transactions.requests]
      }
    }));
  };

  // Weekly Production Planning handlers
  const handleSaveWeeklyPlan = useCallback(
    (plan: WeeklyProductionPlan) => {
      setState(prev => {
        const existing = prev.weeklyPlannings || [];
        const existsIdx = existing.findIndex(p => p.id === plan.id);
        const nextPlans =
          existsIdx >= 0
            ? existing.map(p => (p.id === plan.id ? plan : p))
            : [plan, ...existing].slice(0, 12);
        return {
          ...prev,
          weeklyPlannings: nextPlans,
          activeWeeklyPlanId: plan.id
        };
      });
    },
    [setState]
  );

  const handleSelectWeeklyPlan = useCallback(
    (planId: string) => {
      setState(prev => ({
        ...prev,
        activeWeeklyPlanId: planId
      }));
    },
    [setState]
  );

  const handleDeleteWeeklyPlan = useCallback(
    (planId: string) => {
      setState(prev => {
        const remaining = (prev.weeklyPlannings || []).filter(p => p.id !== planId);
        const nextActive =
          prev.activeWeeklyPlanId === planId ? remaining[0]?.id ?? null : prev.activeWeeklyPlanId ?? null;
        return {
          ...prev,
          weeklyPlannings: remaining,
          activeWeeklyPlanId: nextActive
        };
      });
    },
    [setState]
  );

  // Receive Material
  const handleReceiveMaterial = (receiptData: Omit<MaterialReceipt, 'id' | 'receiptNumber' | 'date'>) => {
    const currentState = stateRef.current;
    const count = currentState.transactions.receipts.length + 1;
    const nowIso = new Date().toISOString();
    const receiptNumber = `RCV-${nowIso.slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
    const newReceipt: MaterialReceipt = {
      ...receiptData,
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      receiptNumber,
      date: nowIso.slice(0, 10)
    };

    const actorEmail = getActiveActorEmail();
    dispatchAppendTx(toTransactionDocFromReceipt(newReceipt, actorEmail, nowIso));
    if (receiptData.location === 'STORAGE_TANK') {
      markExplicitOperationsWrite();
    }

    if (receiptData.requestId && cloudAuthRole === 'ADMINISTRATOR' && currentState.cloudWorkspaceId) {
      const linkedReq = currentState.transactions.requests.find(r => r.id === receiptData.requestId);
      if (linkedReq) {
        const updatedReqDoc = toTransactionDocFromRequest(
          { ...linkedReq, status: 'Received' },
          actorEmail,
          currentState.master.skus
        );
        void updateTransactionDoc(currentState.cloudWorkspaceId, updatedReqDoc).catch(err =>
          console.error('Update linked request status error:', err)
        );
      }
    }

    setState(prev => {
      const updatedRequests = prev.transactions.requests.map(r => {
        if (receiptData.requestId && r.id === receiptData.requestId) {
          return { ...r, status: 'Received' as const };
        }
        return r;
      });

      let updatedTankLevel = prev.tank.level;
      if (receiptData.location === 'STORAGE_TANK') {
        updatedTankLevel = Math.min(prev.tank.maxCapacity, updatedTankLevel + receiptData.receivedQty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          requests: updatedRequests,
          receipts: [newReceipt, ...prev.transactions.receipts]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // Record Usage
  const handleRecordUsage = (usageData: Omit<MaterialUsage, 'id' | 'usageNumber' | 'date'>) => {
    const currentState = stateRef.current;
    const liveShift = getCurrentShift().shift;
    const count = currentState.transactions.usages.length + 1;
    const nowIso = new Date().toISOString();
    const usageNumber = `USG-${nowIso.slice(0, 7).replace('-', '')}-${String(count).padStart(3, '0')}`;
    const newUsage: MaterialUsage = {
      ...usageData,
      shift: liveShift,
      id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      usageNumber,
      date: nowIso.slice(0, 10)
    };

    dispatchAppendTx(
      toTransactionDocFromUsage(newUsage, getActiveActorEmail(), currentState.master.skus, nowIso)
    );
    markExplicitOperationsWrite();

    setState(prev => {
      let updatedTankLevel = prev.tank.level;
      const mObj = prev.master.materials.find(m => m.id === usageData.materialId);

      if (usageData.sourceLocation === 'STORAGE_TANK' || (mObj && mObj.type === 'liquid')) {
        updatedTankLevel = Math.max(0, updatedTankLevel - usageData.usageQty);
      }

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: [newUsage, ...prev.transactions.usages]
        },
        tank: {
          ...prev.tank,
          level: updatedTankLevel
        }
      };
    });
  };

  // Update Usage (edit qty, sourceLocation, operator, or notes)
  const handleUpdateUsage = (
    usageId: string,
    updates: Partial<Pick<MaterialUsage, 'usageQty' | 'sourceLocation' | 'operatorName' | 'notes' | 'shift'>>
  ) => {
    const existing = stateRef.current.transactions.usages.find(u => u.id === usageId);
    if (!existing) {
      showToast('Data pemakaian material tidak ditemukan', true);
      return;
    }

    const nextQty =
      updates.usageQty !== undefined && Number.isFinite(updates.usageQty) && updates.usageQty >= 0
        ? updates.usageQty
        : existing.usageQty;
    const nextLocation = updates.sourceLocation ?? existing.sourceLocation;

    markExplicitOperationsWrite();

    setState(prev => {
      const mObj = prev.master.materials.find(m => m.id === existing.materialId);
      const isLiquid = mObj?.type === 'liquid';
      const prevUsedFromTank = existing.sourceLocation === 'STORAGE_TANK' || isLiquid ? existing.usageQty : 0;
      const nextUsedFromTank = nextLocation === 'STORAGE_TANK' || isLiquid ? nextQty : 0;
      const tankDelta = prevUsedFromTank - nextUsedFromTank;

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: prev.transactions.usages.map(u =>
            u.id === usageId
              ? {
                  ...u,
                  ...updates,
                  usageQty: nextQty,
                  sourceLocation: nextLocation
                }
              : u
          )
        },
        tank: {
          ...prev.tank,
          level: Math.max(0, Math.min(prev.tank.maxCapacity, prev.tank.level + tankDelta))
        }
      };
    });

    showToast(`Transaksi pemakaian ${existing.usageNumber} berhasil diperbarui`);
  };

  // Delete Usage
  const handleDeleteUsage = (usageId: string) => {
    const existing = stateRef.current.transactions.usages.find(u => u.id === usageId);
    if (!existing) {
      showToast('Data pemakaian material tidak ditemukan', true);
      return;
    }

    markExplicitOperationsWrite();

    setState(prev => {
      const mObj = prev.master.materials.find(m => m.id === existing.materialId);
      const shouldRestoreTank = existing.sourceLocation === 'STORAGE_TANK' || mObj?.type === 'liquid';
      const restoredTankLevel = shouldRestoreTank
        ? Math.min(prev.tank.maxCapacity, prev.tank.level + existing.usageQty)
        : prev.tank.level;

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          usages: prev.transactions.usages.filter(u => u.id !== usageId)
        },
        tank: {
          ...prev.tank,
          level: restoredTankLevel
        }
      };
    });

    showToast(`Transaksi pemakaian ${existing.usageNumber} telah dihapus`);
  };

  // Start WIP Production Batch
  const handleStartWipBatch = (batchData: Omit<WipProductionBatch, 'id' | 'batchCode' | 'status' | 'startedAt'>) => {
    const currentState = stateRef.current;
    const activeForMachine = (currentState.transactions.wipBatches || []).find(
      b =>
        b.targetMachineId === batchData.targetMachineId &&
        (b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA')
    );
    if (activeForMachine) {
      const mach = currentState.master.machines.find(m => m.id === batchData.targetMachineId);
      const machName = mach ? `${mach.code} - ${mach.name}` : 'Mesin terpilih';
      const stateText =
        activeForMachine.status === 'DIJEDA' ? 'sedang di-pause' : 'aktif yang belum selesai';
      showToast(
        `${machName} masih memiliki 1 batch ${stateText} (${activeForMachine.batchCode})! Lanjutkan, selesaikan, atau batalkan terlebih dahulu.`,
        true
      );
      return;
    }

    const liveShift = getCurrentShift().shift;
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const startedAt = `${dateStr} ${timeStr}`;
    const batchCount = (currentState.transactions.wipBatches || []).length + 1;
    const batchCode = `PK-WIP-${dateStr.replace(/-/g, '').slice(0, 6)}-${String(batchCount).padStart(3, '0')}`;
    const batchId = `wpb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newBatch: WipProductionBatch = {
      ...batchData,
      shift: liveShift,
      id: batchId,
      batchCode,
      status: 'SEDANG_PRODUKSI',
      startedAt
    };

    const newUsages: MaterialUsage[] = [];
    let tankDeduction = 0;

    batchData.materials.forEach((matItem, idx) => {
      const uCount = currentState.transactions.usages.length + 1 + idx;
      const usageNumber = `USG-${dateStr.slice(0, 7).replace('-', '')}-${String(uCount).padStart(3, '0')}`;
      const palletSummary =
        matItem.palletAllocations && matItem.palletAllocations.length > 0
          ? ` [Alokasi Pallet FIFO: ${matItem.palletAllocations
              .map(a => `${a.palletLabel} (${a.bagsUsed} zak @ ${a.weightPerBagKg} kg = ${a.subtotalKg.toFixed(2)} kg)`)
              .join(', ')}]`
          : '';

      newUsages.push({
        id: `use_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        usageNumber,
        date: dateStr,
        shift: liveShift,
        skuId: batchData.skuId || currentState.master.skus[0]?.id || 'SKU_GENERIC',
        wipId: batchData.wipId,
        materialId: matItem.materialId,
        qty: matItem.requiredKg,
        batch: 1,
        usageQty: matItem.actualUsedKg,
        sourceLocation: matItem.sourceLocation,
        operatorName: batchData.operatorName || `Operator Shift ${liveShift}`,
        notes: `Produksi Batch ${batchCode} (1 Batch ${batchData.wipName})${palletSummary}`,
        batchOrderId: batchId,
        palletAllocations: matItem.palletAllocations
      });

      const mObj = currentState.master.materials.find(m => m.id === matItem.materialId);
      if (matItem.sourceLocation === 'STORAGE_TANK' || (mObj && mObj.type === 'liquid')) {
        tankDeduction += matItem.actualUsedKg;
      }
    });

    const targetMach = currentState.master.machines.find(m => m.id === batchData.targetMachineId);
    const machDisplay = targetMach ? `${targetMach.code} - ${targetMach.name}` : '';

    const actorEmail = getActiveActorEmail();
    const skusList = stateRef.current.master.skus;
    newUsages.forEach((u, idx) => {
      const uIso = new Date(now.getTime() + idx).toISOString();
      dispatchAppendTx(toTransactionDocFromUsage(u, actorEmail, skusList, uIso));
    });
    markExplicitOperationsWrite();

    setState(prev => {
      const updatedMachines = prev.master.machines.map(m => {
        if (batchData.targetMachineId && m.id === batchData.targetMachineId) {
          return {
            ...m,
            currentWipId: batchData.wipId,
            currentWipName: batchData.wipName
          };
        }
        return m;
      });

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          wipBatches: [newBatch, ...(prev.transactions.wipBatches || [])],
          usages: [...newUsages, ...prev.transactions.usages]
        },
        tank: {
          ...prev.tank,
          level: Math.max(0, prev.tank.level - tankDeduction)
        }
      };
    });

    showToast(
      `Perintah Kerja ${batchCode} dimulai pada mesin ${machDisplay || 'Produksi'} (1 Batch ${batchData.wipName}). Bahan baku dipotong dari stok.`
    );
  };

  // Pause active WIP Batch
  const handlePauseWipBatch = (batchId: string, reason: string, category?: string) => {
    const cleanReason = sanitizeTextInput(reason || '').trim();
    if (cleanReason.length < 5) {
      showToast('Alasan penghentian sementara (minimal 5 karakter) wajib diisi untuk audit trail.', true);
      return;
    }
    const cleanCategory = sanitizeTextInput(category || 'Lainnya').trim() || 'Lainnya';
    const nowMs = Date.now();
    const pausedAtIso = new Date(nowMs).toISOString();
    const actor =
      stateRef.current.currentAdminUser?.displayName ||
      stateRef.current.currentSession?.name ||
      stateRef.current.currentUserRole ||
      'Operator';

    let pausedBatchCode = '';
    let frozenLabel = '';

    markExplicitOperationsWrite();
    setState(prev => {
      const updatedBatches = (prev.transactions.wipBatches || []).map(b => {
        if (b.id !== batchId || b.status !== 'SEDANG_PRODUKSI') return b;
        pausedBatchCode = b.batchCode;
        const defaultDurMs = (b.durationMinutes || 30) * 60_000;
        let remainingMs = defaultDurMs;
        if (b.estimatedCompletionTime) {
          const estMs = new Date(b.estimatedCompletionTime).getTime();
          if (Number.isFinite(estMs)) {
            remainingMs = Math.max(0, estMs - nowMs);
          }
        }
        const remMins = Math.floor(remainingMs / 60_000);
        const remSecs = Math.floor((remainingMs % 60_000) / 1000);
        frozenLabel = `${remMins}m ${String(remSecs).padStart(2, '0')}s`;

        const newPauseEntry: WipBatchPauseLog = {
          id: `wpl_${nowMs}_${Math.random().toString(36).substring(2, 7)}`,
          pausedAt: pausedAtIso,
          category: cleanCategory,
          reason: cleanReason,
          pausedBy: actor,
          remainingMsAtPause: remainingMs
        };

        return {
          ...b,
          status: 'DIJEDA' as const,
          pausedAt: pausedAtIso,
          remainingMsAtPause: remainingMs,
          estimatedCompletionTime: undefined,
          pauseReason: cleanReason,
          pauseLogs: [...(b.pauseLogs || []), newPauseEntry]
        };
      });

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          wipBatches: updatedBatches
        }
      };
    });

    if (pausedBatchCode) {
      showToast(
        `Batch ${pausedBatchCode} di-pause (sisa waktu berhenti di ${frozenLabel}). Log alasan dicatat ke audit trail.`
      );
    }
  };

  // Resume a paused WIP Batch
  const handleResumeWipBatch = (batchId: string) => {
    const nowMs = Date.now();
    const resumedAtIso = new Date(nowMs).toISOString();
    const actor =
      stateRef.current.currentAdminUser?.displayName ||
      stateRef.current.currentSession?.name ||
      stateRef.current.currentUserRole ||
      'Operator';

    let resumedBatchCode = '';
    let resumedRemLabel = '';

    markExplicitOperationsWrite();
    setState(prev => {
      const updatedBatches = (prev.transactions.wipBatches || []).map(b => {
        if (b.id !== batchId || b.status !== 'DIJEDA') return b;
        resumedBatchCode = b.batchCode;

        const pausedSinceMs = b.pausedAt ? new Date(b.pausedAt).getTime() : nowMs;
        const pausedDeltaMs = Number.isFinite(pausedSinceMs) ? Math.max(0, nowMs - pausedSinceMs) : 0;
        const remainingMs =
          typeof b.remainingMsAtPause === 'number' && Number.isFinite(b.remainingMsAtPause)
            ? Math.max(0, b.remainingMsAtPause)
            : (b.durationMinutes || 30) * 60_000;
        const newEstimatedCompletionTime = new Date(nowMs + remainingMs).toISOString();

        const remMins = Math.floor(remainingMs / 60_000);
        const remSecs = Math.floor((remainingMs % 60_000) / 1000);
        resumedRemLabel = `${remMins}m ${String(remSecs).padStart(2, '0')}s`;

        const existingLogs = b.pauseLogs || [];
        let closedOpenLog = false;
        const updatedLogs = existingLogs.map((log, idx) => {
          if (!log.resumedAt && idx === existingLogs.length - 1) {
            closedOpenLog = true;
            return {
              ...log,
              resumedAt: resumedAtIso,
              resumedBy: actor,
              pausedDurationMs: pausedDeltaMs
            };
          }
          return log;
        });
        if (!closedOpenLog && b.pausedAt) {
          updatedLogs.push({
            id: `wpl_${nowMs}_${Math.random().toString(36).substring(2, 7)}`,
            pausedAt: b.pausedAt,
            resumedAt: resumedAtIso,
            category: 'Lainnya',
            reason: b.pauseReason || 'Penghentian sementara',
            pausedBy: b.operatorName || actor,
            resumedBy: actor,
            remainingMsAtPause: remainingMs,
            pausedDurationMs: pausedDeltaMs
          });
        }

        return {
          ...b,
          status: 'SEDANG_PRODUKSI' as const,
          pausedAt: undefined,
          remainingMsAtPause: undefined,
          totalPausedMs: (b.totalPausedMs || 0) + pausedDeltaMs,
          estimatedCompletionTime: newEstimatedCompletionTime,
          pauseLogs: updatedLogs
        };
      });

      return {
        ...prev,
        transactions: {
          ...prev.transactions,
          wipBatches: updatedBatches
        }
      };
    });

    if (resumedBatchCode) {
      showToast(`Batch ${resumedBatchCode} dilanjutkan kembali. Sisa timer berjalan dari ${resumedRemLabel}.`);
    }
  };

  // Complete WIP Batch with Auto-Transfer into designated Tank
  const handleCompleteWipBatch = useCallback(
    (batchId: string) => {
      const currentState = stateRef.current;
      const now = new Date();
      const nowMs = now.getTime();
      const nowIso = now.toISOString();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const completedAt = `${dateStr} ${timeStr}`;
      const actor =
        currentState.currentAdminUser?.displayName ||
        currentState.currentSession?.name ||
        currentState.currentUserRole ||
        'Operator';

      const targetBatch = (currentState.transactions.wipBatches || []).find(b => b.id === batchId);
      if (!targetBatch) return;

      const completedBatchName = `${targetBatch.batchCode} (${targetBatch.wipName})`;
      const wipId = targetBatch.wipId;
      const batchWeight = targetBatch.batchWeightKg;
      const batchCode = targetBatch.batchCode;
      const wipName = targetBatch.wipName;

      const wipDef = currentState.master.wips.find(w => w.id === wipId);
      const targetTankId =
        targetBatch.targetTankId ||
        wipDef?.targetTankId ||
        (wipDef?.targetTankIds && wipDef.targetTankIds[0]) ||
        currentState.master.tanks.find(t => t.assignedWipId === wipId)?.id;

      let tankTransferMessage = '';
      let createdInflowLog: TankTransferLog | null = null;
      const targetTankObj = targetTankId
        ? currentState.master.tanks.find(t => t.id === targetTankId)
        : undefined;
      if (targetTankObj) {
        const prevLvl = targetTankObj.currentLevelKg;
        const newLvl = Math.min(targetTankObj.capacityKg, prevLvl + batchWeight);
        tankTransferMessage = ` & otomatis ditransfer ${batchWeight.toFixed(1)} kg ke ${targetTankObj.code} (${targetTankObj.name})`;
        createdInflowLog = {
          id: `tl_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
          timestamp: nowIso,
          tankId: targetTankObj.id,
          tankCode: targetTankObj.code,
          tankName: targetTankObj.name,
          type: 'WIP_BATCH_INFLOW',
          amountKg: batchWeight,
          previousLevelKg: prevLvl,
          newLevelKg: newLvl,
          wipId,
          wipName,
          batchCode,
          notes: `Transfer selesai batch ${batchCode} ke ${targetTankObj.code}`
        };
        dispatchAppendTx(toTransactionDocFromTankLog(createdInflowLog, getActiveActorEmail()));
      }
      flushAutoCartonBuffer();
      markExplicitOperationsWrite();

      setState(prev => {
        const updatedBatches = (prev.transactions.wipBatches || []).map(b => {
          if (b.id !== batchId) return b;
          let extraPausedMs = 0;
          let closedLogs = b.pauseLogs;
          if (b.status === 'DIJEDA' && b.pausedAt) {
            const pMs = new Date(b.pausedAt).getTime();
            if (Number.isFinite(pMs)) extraPausedMs = Math.max(0, nowMs - pMs);
            if (closedLogs && closedLogs.length > 0) {
              closedLogs = closedLogs.map((log, idx) =>
                !log.resumedAt && idx === closedLogs!.length - 1
                  ? {
                      ...log,
                      resumedAt: nowIso,
                      resumedBy: `${actor} (Diselesaikan)`,
                      pausedDurationMs: extraPausedMs
                    }
                  : log
              );
            }
          }
          return {
            ...b,
            status: 'SELESAI' as const,
            completedAt,
            pausedAt: undefined,
            remainingMsAtPause: undefined,
            totalPausedMs: (b.totalPausedMs || 0) + extraPausedMs,
            pauseLogs: closedLogs
          };
        });

        const updatedTanks = createdInflowLog
          ? prev.master.tanks.map(t =>
              t.id === createdInflowLog!.tankId
                ? { ...t, currentLevelKg: Math.min(t.capacityKg, t.currentLevelKg + batchWeight) }
                : t
            )
          : prev.master.tanks;

        const updatedMachines = targetBatch.targetMachineId
          ? prev.master.machines.map(m =>
              m.id === targetBatch.targetMachineId && m.currentWipId === targetBatch.wipId
                ? { ...m, currentWipId: undefined, currentWipName: undefined }
                : m
            )
          : prev.master.machines;

        return {
          ...prev,
          master: {
            ...prev.master,
            machines: updatedMachines,
            tanks: updatedTanks
          },
          transactions: {
            ...prev.transactions,
            wipBatches: updatedBatches,
            tankLogs: createdInflowLog
              ? [createdInflowLog, ...(prev.transactions.tankLogs || [])]
              : prev.transactions.tankLogs
          }
        };
      });

      showToast(`Batch WIP ${completedBatchName} selesai diproduksi${tankTransferMessage}!`);

      const currentBatches = stateRef.current.transactions.wipBatches || [];
      const completedBatch = currentBatches.find(b => b.id === batchId);
      if (completedBatch) {
        const wipDefNow = stateRef.current.master.wips.find(w => w.id === completedBatch.wipId);
        const resolvedTankId =
          wipDefNow?.targetTankId ||
          stateRef.current.master.tanks.find(t => t.assignedWipId === completedBatch.wipId)?.id;
        setAlarmWipBatch({
          ...completedBatch,
          status: 'SELESAI',
          completedAt,
          targetTankId: resolvedTankId
        });
        playWipCompletionChime();
      }
    },
    [dispatchAppendTx, flushAutoCartonBuffer, getActiveActorEmail, markExplicitOperationsWrite, setState, showToast, stateRef]
  );

  const handleCompleteWipBatchRef = useRef(handleCompleteWipBatch);
  useEffect(() => {
    handleCompleteWipBatchRef.current = handleCompleteWipBatch;
  }, [handleCompleteWipBatch]);

  // Auto-completion of WIP Production Batches when duration expired + Audio Alarm
  useEffect(() => {
    const checkInterval = setInterval(() => {
      if (!stateRef.current.isAuthenticated) return;
      const activeBatches = (stateRef.current.transactions.wipBatches || []).filter(
        b => b.status === 'SEDANG_PRODUKSI'
      );
      if (activeBatches.length === 0) return;

      const now = Date.now();
      activeBatches.forEach(batch => {
        if (batch.estimatedCompletionTime) {
          const compTime = new Date(batch.estimatedCompletionTime).getTime();
          if (now >= compTime) {
            handleCompleteWipBatchRef.current(batch.id);
          }
        }
      });
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [stateRef]);

  // Cancel WIP Batch
  const handleCancelWipBatch = (batchId: string) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const actor =
      stateRef.current.currentAdminUser?.displayName ||
      stateRef.current.currentSession?.name ||
      stateRef.current.currentUserRole ||
      'Operator';

    markExplicitOperationsWrite();
    setState(prev => {
      const cancellingBatch = (prev.transactions.wipBatches || []).find(b => b.id === batchId);
      let updatedMachines = prev.master.machines;
      if (cancellingBatch?.targetMachineId) {
        updatedMachines = prev.master.machines.map(m => {
          if (m.id === cancellingBatch.targetMachineId && m.currentWipId === cancellingBatch.wipId) {
            return {
              ...m,
              currentWipId: undefined,
              currentWipName: undefined
            };
          }
          return m;
        });
      }

      return {
        ...prev,
        master: {
          ...prev.master,
          machines: updatedMachines
        },
        transactions: {
          ...prev.transactions,
          wipBatches: (prev.transactions.wipBatches || []).map(b => {
            if (b.id !== batchId) return b;
            let extraPausedMs = 0;
            let closedLogs = b.pauseLogs;
            if (b.status === 'DIJEDA' && b.pausedAt) {
              const pMs = new Date(b.pausedAt).getTime();
              if (Number.isFinite(pMs)) extraPausedMs = Math.max(0, nowMs - pMs);
              if (closedLogs && closedLogs.length > 0) {
                closedLogs = closedLogs.map((log, idx) =>
                  !log.resumedAt && idx === closedLogs!.length - 1
                    ? {
                        ...log,
                        resumedAt: nowIso,
                        resumedBy: `${actor} (Dibatalkan)`,
                        pausedDurationMs: extraPausedMs
                      }
                    : log
                );
              }
            }
            return {
              ...b,
              status: 'DIBATALKAN' as const,
              pausedAt: undefined,
              remainingMsAtPause: undefined,
              totalPausedMs: (b.totalPausedMs || 0) + extraPausedMs,
              pauseLogs: closedLogs
            };
          })
        }
      };
    });
    showToast('Perintah kerja batch WIP telah dibatalkan', true);
  };

  // Record Material Reject from Station Monitors (Line / Central Kitchen)
  const handleRecordMaterialReject = useCallback(
    (log: MaterialRejectLog) => {
      const actorEmail = getActiveActorEmail();
      dispatchAppendTx(toTransactionDocFromRejectLog(log, actorEmail));
      setState(prev => ({
        ...prev,
        transactions: {
          ...prev.transactions,
          rejectLogs: [log, ...(prev.transactions.rejectLogs || [])]
        }
      }));
      showToast(
        `Reject ${log.materialName} (${log.rejectQtyKg.toFixed(2)} kg / -${log.equivalentCartonsLoss.toFixed(2)} ktn eq) dicatat & stok ${log.sourceLocation} otomatis terpotong.`
      );
    },
    [dispatchAppendTx, getActiveActorEmail, showToast, setState]
  );

  return {
    alarmWipBatch,
    setAlarmWipBatch,
    handleResetAll,
    handleResetStockReceipts,
    handleResetRequests,
    handleResetUsages,
    handleLoadSampleData,
    handleTransferStock,
    handleStartMachineChangeover,
    handleCompleteMachineChangeover,
    handleCancelMachineChangeover,
    handleProduceCartons,
    handleTransferBetweenTanks,
    handleStartSkuProduction,
    handleStartLineBatchRuns,
    handleStartMultipleSkus,
    handleSkuChangeover,
    handleUpdateRunHoldingTank,
    handleSetRunSpeedMultiplier,
    handleCompleteLineRun,
    handleTriggerMaterialShortageStop,
    handleResumeLineRun,
    handleStopSkuProduction,
    handleStopAllSkuProduction,
    handleTriggerShiftHandover,
    reconcileMissedProduction,
    handleCreateRequest,
    handleCreateMultipleRequests,
    handleSaveWeeklyPlan,
    handleSelectWeeklyPlan,
    handleDeleteWeeklyPlan,
    handleReceiveMaterial,
    handleRecordUsage,
    handleUpdateUsage,
    handleDeleteUsage,
    handleStartWipBatch,
    handlePauseWipBatch,
    handleResumeWipBatch,
    handleCompleteWipBatch,
    handleCancelWipBatch,
    handleRecordMaterialReject
  };
}
