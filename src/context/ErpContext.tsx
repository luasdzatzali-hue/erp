import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { AppState } from '../types';
import {
  LOCAL_LOG_RETENTION_DAYS,
  loadStoredState,
  pruneOldLocalTransactions
} from '../utils/storage';
import { enforceHttpsTransport } from '../utils/security';
import { getCurrentShift } from '../utils/shifts';
import {
  calculateShiftAllLinesOee,
  LineShiftOeeResult,
  ShiftAllLinesOeeSummary
} from '../utils/oeeEngine';
import { useFirebaseSyncManager } from '../hooks/useFirebaseSyncManager';
import { useMasterData } from '../hooks/useMasterData';
import { useProductionTransactions } from '../hooks/useProductionTransactions';
import { useWorkspaceSessionUi } from '../hooks/useWorkspaceSessionUi';

type LogoutUiResetCallback = () => void;

function useErpController() {
  const [state, setState] = useState<AppState>(() => {
    const loaded = loadStoredState();
    const { state: pruned } = pruneOldLocalTransactions(loaded, LOCAL_LOG_RETENTION_DAYS);
    return pruned;
  });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Enforce HTTPS in production environments
  useEffect(() => {
    enforceHttpsTransport();
  }, []);

  const showToast = useCallback((msg: string, isError = false) => {
    if (isError) {
      sonnerToast.error(msg);
    } else {
      sonnerToast.success(msg);
    }
  }, []);

  const logoutUiResetRef = useRef<LogoutUiResetCallback | null>(null);
  const clearAlarmRef = useRef<(() => void) | null>(null);

  const registerLogoutUiReset = useCallback((fn: LogoutUiResetCallback) => {
    logoutUiResetRef.current = fn;
    return () => {
      if (logoutUiResetRef.current === fn) {
        logoutUiResetRef.current = null;
      }
    };
  }, []);

  const handleResetUiOnLogout = useCallback(() => {
    clearAlarmRef.current?.();
    logoutUiResetRef.current?.();
  }, []);

  const firebaseSync = useFirebaseSyncManager({
    state,
    setState,
    stateRef,
    showToast,
    onResetUiOnLogout: handleResetUiOnLogout
  });

  const masterData = useMasterData({
    state,
    setState,
    stateRef,
    getEffectiveRoleForState: firebaseSync.getEffectiveRoleForState,
    getActiveActorEmail: firebaseSync.getActiveActorEmail,
    dispatchAppendTx: firebaseSync.dispatchAppendTx,
    flushAutoCartonBuffer: firebaseSync.flushAutoCartonBuffer,
    markExplicitOperationsWrite: firebaseSync.markExplicitOperationsWrite,
    logAuditTrail: firebaseSync.logAuditTrail,
    showToast
  });

  const productionTransactions = useProductionTransactions({
    state,
    setState,
    stateRef,
    setupStatus: firebaseSync.setupStatus,
    isSyncingCloud: firebaseSync.isSyncingCloud,
    cloudAuthRole: firebaseSync.cloudAuthRole,
    getEffectiveRoleForState: firebaseSync.getEffectiveRoleForState,
    getActiveActorEmail: firebaseSync.getActiveActorEmail,
    dispatchAppendTx: firebaseSync.dispatchAppendTx,
    flushAutoCartonBuffer: firebaseSync.flushAutoCartonBuffer,
    markExplicitOperationsWrite: firebaseSync.markExplicitOperationsWrite,
    logAuditTrail: firebaseSync.logAuditTrail,
    syncShiftOeeSnapshot: firebaseSync.syncShiftOeeSnapshot,
    isApplyingRemoteRef: firebaseSync.isApplyingRemoteRef,
    autoCartonBufferRef: firebaseSync.autoCartonBufferRef,
    pendingTxDocsRef: firebaseSync.pendingTxDocsRef,
    showToast
  });

  const sessionUi = useWorkspaceSessionUi({
    state,
    setState,
    stateRef,
    setupStatus: firebaseSync.setupStatus,
    firebaseUser: firebaseSync.firebaseUser,
    cloudAuthRole: firebaseSync.cloudAuthRole,
    getEffectiveRoleForState: firebaseSync.getEffectiveRoleForState,
    performCompleteLogout: firebaseSync.performCompleteLogout,
    showToast
  });

  useEffect(() => {
    clearAlarmRef.current = () => {
      productionTransactions.setAlarmWipBatch(null);
    };
  }, [productionTransactions.setAlarmWipBatch]);

  useEffect(() => {
    return registerLogoutUiReset(sessionUi.resetAllUiOnLogout);
  }, [registerLogoutUiReset, sessionUi.resetAllUiOnLogout]);

  const currentLiveShift = getCurrentShift();
  const currentOeeDateStr = new Date().toISOString().slice(0, 10);

  const liveOeeSummary: ShiftAllLinesOeeSummary = useMemo(() => {
    return calculateShiftAllLinesOee(state, currentOeeDateStr, currentLiveShift.shift);
  }, [
    state.cloudWorkspaceId,
    state.activeSkuRun,
    state.activeSkuRuns,
    state.master.productionLines,
    state.master.skus,
    state.master.skuWips,
    state.master.wips,
    state.master.wipMats,
    state.master.recipes,
    state.master.materials,
    state.master.machines,
    state.master.tanks,
    state.transactions.cartonProductions,
    state.transactions.productionStops,
    state.transactions.changeovers,
    state.transactions.wipBatches,
    state.transactions.rejectLogs,
    state.transactions.usages,
    state.transactions.tankLogs,
    currentOeeDateStr,
    currentLiveShift.shift
  ]);

  const liveOeeByLineId = useMemo<Record<string, LineShiftOeeResult>>(() => {
    const map: Record<string, LineShiftOeeResult> = {};
    for (const res of liveOeeSummary.lineResults) {
      map[res.lineId] = res;
    }
    return map;
  }, [liveOeeSummary]);

  return {
    state,
    setState,
    stateRef,
    master: state.master,
    transactions: state.transactions,
    liveOeeSummary,
    liveOeeByLineId,
    showToast,
    registerLogoutUiReset,
    ...firebaseSync,
    ...masterData,
    ...productionTransactions,
    ...sessionUi
  };
}

export type ErpContextValue = ReturnType<typeof useErpController>;

const ErpContext = createContext<ErpContextValue | null>(null);

export const ErpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useErpController();
  return <ErpContext.Provider value={value}>{children}</ErpContext.Provider>;
};

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) {
    throw new Error('useErp must be used within an ErpProvider');
  }
  return ctx;
}

export function useOptionalErp(): ErpContextValue | null {
  return useContext(ErpContext);
}
