import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast as sonnerToast } from 'sonner';
import { AppState } from '../types';
import {
  LOCAL_LOG_RETENTION_DAYS,
  loadStoredState,
  pruneOldLocalTransactions
} from '../utils/storage';
import { enforceHttpsTransport } from '../utils/security';
import { useFirebaseSyncManager } from '../hooks/useFirebaseSyncManager';
import { useMasterData } from '../hooks/useMasterData';
import { useProductionTransactions } from '../hooks/useProductionTransactions';

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
    isApplyingRemoteRef: firebaseSync.isApplyingRemoteRef,
    autoCartonBufferRef: firebaseSync.autoCartonBufferRef,
    pendingTxDocsRef: firebaseSync.pendingTxDocsRef,
    showToast
  });

  useEffect(() => {
    clearAlarmRef.current = () => {
      productionTransactions.setAlarmWipBatch(null);
    };
  }, [productionTransactions.setAlarmWipBatch]);

  return {
    state,
    setState,
    stateRef,
    master: state.master,
    transactions: state.transactions,
    showToast,
    registerLogoutUiReset,
    ...firebaseSync,
    ...masterData,
    ...productionTransactions
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
