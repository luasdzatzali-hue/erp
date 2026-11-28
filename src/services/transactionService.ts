import {
  collection,
  deleteField,
  doc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import {
  AppState,
  AuditLogAction,
  AuditLogEntry,
  AuditLogModule,
  CartonProductionLog,
  MaterialReceipt,
  MaterialRejectLog,
  MaterialRequest,
  MaterialStockAdjustment,
  MaterialUsage,
  ShiftNumber,
  SKU,
  TankTransferLog,
  UserRole
} from '../types';
import {
  auth,
  db,
  handleFirestoreError,
  isCloudWritePaused,
  isQuotaExceededError,
  OperationType,
  runFirestoreWriteWithGuard,
  stripUndefinedDeep,
  tripCloudWriteQuotaPause
} from '../utils/firebaseSync';
import { normalizeEmail, sanitizeTextInput } from '../utils/security';
import {
  calculateLineShiftOee,
  calculateShiftAllLinesOee,
  IiotTelemetryEventDoc,
  ShiftOeeSnapshotDoc
} from '../utils/oeeEngine';
import {
  enqueueOfflineSyncItem,
  getBrowserOnlineStatus,
  isNetworkOrOfflineError
} from '../utils/offlineQueue';

export type FirestoreTransactionType =
  | 'REQUEST'
  | 'RECEIPT'
  | 'USAGE'
  | 'CARTON_PROD'
  | 'TANK_LOG'
  | 'ADJUSTMENT'
  | 'REJECT_LOG';

export interface WorkspaceTransactionDoc<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  type: FirestoreTransactionType;
  timestamp: string;
  actorEmail: string;
  payload: TPayload;
  shift: ShiftNumber | 0 | null;
  skuCode: string;
}

const VALID_TX_TYPES = new Set<FirestoreTransactionType>([
  'REQUEST',
  'RECEIPT',
  'USAGE',
  'CARTON_PROD',
  'TANK_LOG',
  'ADJUSTMENT',
  'REJECT_LOG'
]);

const MIGRATION_BATCH_SIZE = 400;
const inFlightMigrations = new Set<string>();

export function sanitizeTransactionId(rawId: string, fallbackPrefix = 'tx'): string {
  const cleaned = String(rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  if (cleaned.length > 0) return cleaned;
  return `${fallbackPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.slice(0, 128);
}

function normalizeShiftValue(raw: unknown): ShiftNumber | 0 | null {
  if (raw === 1 || raw === 2 || raw === 3) return raw;
  if (raw === 0) return 0;
  return null;
}

function normalizeTimestampIso(rawTs: unknown, fallbackDate?: unknown): string {
  if (typeof rawTs === 'string' && rawTs.trim()) {
    const trimmed = rawTs.trim().slice(0, 64);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
    return trimmed;
  }
  if (typeof fallbackDate === 'string' && fallbackDate.trim()) {
    const d = fallbackDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return `${d}T00:00:00.000Z`;
    }
    const parsed = Date.parse(d);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date().toISOString();
}

function resolveActorEmail(preferredEmail?: string | null): string {
  const authEmail = normalizeEmail(auth.currentUser?.email || '');
  if (authEmail) return authEmail.slice(0, 160);
  const cleaned = normalizeEmail(preferredEmail || '');
  if (cleaned) return cleaned.slice(0, 160);
  return 'system@prodtrack.local';
}

function normalizeSkuCode(rawCode?: string | null, fallbackSkuId?: string | null): string {
  const candidate = String(rawCode || fallbackSkuId || '').trim();
  return candidate.slice(0, 128);
}

export function normalizeTransactionDoc(
  tx: Omit<WorkspaceTransactionDoc, 'actorEmail' | 'timestamp' | 'shift' | 'skuCode'> & {
    timestamp?: string;
    actorEmail?: string;
    shift?: ShiftNumber | 0 | null;
    skuCode?: string;
  }
): WorkspaceTransactionDoc {
  const safeId = sanitizeTransactionId(tx.id, tx.type.toLowerCase());
  const safePayload = stripUndefinedDeep(
    tx.payload && typeof tx.payload === 'object' ? { ...tx.payload, id: tx.payload.id || safeId } : { id: safeId }
  ) as Record<string, unknown>;

  return {
    id: safeId,
    type: tx.type,
    timestamp: normalizeTimestampIso(tx.timestamp),
    actorEmail: resolveActorEmail(tx.actorEmail),
    payload: safePayload,
    shift: normalizeShiftValue(tx.shift),
    skuCode: normalizeSkuCode(tx.skuCode)
  };
}

/**
 * Appends a single immutable transaction document to
 * /workspaces/{workspaceId}/transactions/{tx.id} using setDoc.
 */
export async function appendTransaction(
  workspaceId: string,
  tx: WorkspaceTransactionDoc | (Omit<WorkspaceTransactionDoc, 'actorEmail' | 'timestamp' | 'shift' | 'skuCode'> & {
    timestamp?: string;
    actorEmail?: string;
    shift?: ShiftNumber | 0 | null;
    skuCode?: string;
  }),
  options?: { skipOfflineQueue?: boolean }
): Promise<WorkspaceTransactionDoc> {
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const normalized = normalizeTransactionDoc(tx);
  const enqueue = !options?.skipOfflineQueue;

  if (!auth.currentUser || !getBrowserOnlineStatus() || isCloudWritePaused()) {
    if (enqueue) {
      enqueueOfflineSyncItem({
        id: `oq_tx_${normalized.id}`,
        type: 'TX_APPEND',
        workspaceId: safeWorkspaceId,
        dedupeKey: `tx_append_${safeWorkspaceId}_${normalized.id}`,
        payload: { txDoc: normalized }
      });
    }
    return normalized;
  }
  const path = `workspaces/${safeWorkspaceId}/transactions/${normalized.id}`;

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', safeWorkspaceId, 'transactions', normalized.id), normalized)
    );
    return normalized;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      if (enqueue) {
        enqueueOfflineSyncItem({
          id: `oq_tx_${normalized.id}`,
          type: 'TX_APPEND',
          workspaceId: safeWorkspaceId,
          dedupeKey: `tx_append_${safeWorkspaceId}_${normalized.id}`,
          payload: { txDoc: normalized },
          lastError: 'Kuota Firestore sedang penuh'
        });
      }
      return normalized;
    }
    if (isNetworkOrOfflineError(error)) {
      if (enqueue) {
        enqueueOfflineSyncItem({
          id: `oq_tx_${normalized.id}`,
          type: 'TX_APPEND',
          workspaceId: safeWorkspaceId,
          dedupeKey: `tx_append_${safeWorkspaceId}_${normalized.id}`,
          payload: { txDoc: normalized },
          lastError: error instanceof Error ? error.message : String(error)
        });
      }
      return normalized;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

/**
 * Administrator-only update of an existing transaction document.
 */
export async function updateTransactionDoc(
  workspaceId: string,
  tx: WorkspaceTransactionDoc,
  options?: { skipOfflineQueue?: boolean }
): Promise<void> {
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const normalized = normalizeTransactionDoc(tx);
  const enqueue = !options?.skipOfflineQueue;

  if (!auth.currentUser || !getBrowserOnlineStatus() || isCloudWritePaused()) {
    if (enqueue) {
      enqueueOfflineSyncItem({
        id: `oq_txu_${normalized.id}`,
        type: 'TX_UPDATE',
        workspaceId: safeWorkspaceId,
        dedupeKey: `tx_update_${safeWorkspaceId}_${normalized.id}`,
        payload: { txDoc: normalized }
      });
    }
    return;
  }
  const path = `workspaces/${safeWorkspaceId}/transactions/${normalized.id}`;

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', safeWorkspaceId, 'transactions', normalized.id), normalized)
    );
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      if (enqueue) {
        enqueueOfflineSyncItem({
          id: `oq_txu_${normalized.id}`,
          type: 'TX_UPDATE',
          workspaceId: safeWorkspaceId,
          dedupeKey: `tx_update_${safeWorkspaceId}_${normalized.id}`,
          payload: { txDoc: normalized },
          lastError: 'Kuota Firestore sedang penuh'
        });
      }
      return;
    }
    if (isNetworkOrOfflineError(error)) {
      if (enqueue) {
        enqueueOfflineSyncItem({
          id: `oq_txu_${normalized.id}`,
          type: 'TX_UPDATE',
          workspaceId: safeWorkspaceId,
          dedupeKey: `tx_update_${safeWorkspaceId}_${normalized.id}`,
          payload: { txDoc: normalized },
          lastError: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Administrator-only batch deletion of transaction documents (e.g. on category reset).
 */
export async function deleteTransactionsByTypes(
  workspaceId: string,
  types: FirestoreTransactionType[]
): Promise<number> {
  if (!auth.currentUser || types.length === 0 || isCloudWritePaused()) return 0;
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const path = `workspaces/${safeWorkspaceId}/transactions`;
  const typeSet = new Set(types);

  try {
    // Bounded reads (<= 500) complying with list rule limit
    const q = query(
      collection(db, 'workspaces', safeWorkspaceId, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    const snap = await getDocs(q);
    const matchingDocs = snap.docs.filter(d => {
      const t = d.data()?.type as FirestoreTransactionType | undefined;
      return Boolean(t && typeSet.has(t));
    });
    if (matchingDocs.length === 0) return 0;

    for (let i = 0; i < matchingDocs.length; i += MIGRATION_BATCH_SIZE) {
      if (isCloudWritePaused()) break;
      const chunk = matchingDocs.slice(i, i + MIGRATION_BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(d => batch.delete(d.ref));
      await runFirestoreWriteWithGuard(() => batch.commit());
    }
    return matchingDocs.length;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      return 0;
    }
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Subscribes to the most recent transactions in /workspaces/{workspaceId}/transactions
 * ordered by timestamp descending with limit(limitCount).
 */
export function subscribeRecentTransactions(
  workspaceId: string,
  limitCount = 500,
  callback: (txs: WorkspaceTransactionDoc[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!auth.currentUser) return () => {};

  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const boundedLimit = Math.min(Math.max(1, Math.floor(limitCount || 500)), 500);
  const path = `workspaces/${safeWorkspaceId}/transactions`;

  const q = query(
    collection(db, 'workspaces', safeWorkspaceId, 'transactions'),
    orderBy('timestamp', 'desc'),
    limit(boundedLimit)
  );

  return onSnapshot(
    q,
    snapshot => {
      const docs: WorkspaceTransactionDoc[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (!d || !VALID_TX_TYPES.has(d.type)) return;
        docs.push({
          id: typeof d.id === 'string' && d.id ? d.id : docSnap.id,
          type: d.type as FirestoreTransactionType,
          timestamp: typeof d.timestamp === 'string' ? d.timestamp : new Date().toISOString(),
          actorEmail: typeof d.actorEmail === 'string' ? d.actorEmail : 'system@prodtrack.local',
          payload: (d.payload && typeof d.payload === 'object' ? d.payload : {}) as Record<string, unknown>,
          shift: normalizeShiftValue(d.shift),
          skuCode: typeof d.skuCode === 'string' ? d.skuCode : ''
        });
      });
      callback(docs);
    },
    err => {
      if (isQuotaExceededError(err)) {
        tripCloudWriteQuotaPause();
      }
      if (onError) onError(err);
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Prevent uncaught exceptions in snapshot error handler
      }
    }
  );
}

// ============================================================================
// Domain Model <-> WorkspaceTransactionDoc Converters
// ============================================================================

function findSkuCode(skuId: string | undefined, skus: SKU[] = []): string {
  if (!skuId) return '';
  const found = skus.find(s => s.id === skuId);
  return normalizeSkuCode(found?.code, skuId);
}

export function toTransactionDocFromRequest(
  req: MaterialRequest,
  actorEmail?: string | null,
  skus: SKU[] = [],
  timestampOverride?: string
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: req.id,
    type: 'REQUEST',
    timestamp: timestampOverride || normalizeTimestampIso(undefined, req.date),
    actorEmail: resolveActorEmail(actorEmail),
    payload: req as unknown as Record<string, unknown>,
    shift: normalizeShiftValue(req.shift),
    skuCode: findSkuCode(req.skuId, skus)
  });
}

export function toTransactionDocFromReceipt(
  receipt: MaterialReceipt,
  actorEmail?: string | null,
  timestampOverride?: string
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: receipt.id,
    type: 'RECEIPT',
    timestamp: timestampOverride || normalizeTimestampIso(undefined, receipt.date),
    actorEmail: resolveActorEmail(actorEmail),
    payload: receipt as unknown as Record<string, unknown>,
    shift: normalizeShiftValue(receipt.shift),
    skuCode: ''
  });
}

export function toTransactionDocFromUsage(
  usage: MaterialUsage,
  actorEmail?: string | null,
  skus: SKU[] = [],
  timestampOverride?: string
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: usage.id,
    type: 'USAGE',
    timestamp: timestampOverride || normalizeTimestampIso(undefined, usage.date),
    actorEmail: resolveActorEmail(actorEmail),
    payload: usage as unknown as Record<string, unknown>,
    shift: normalizeShiftValue(usage.shift),
    skuCode: findSkuCode(usage.skuId, skus)
  });
}

export function toTransactionDocFromCartonProd(
  log: CartonProductionLog,
  actorEmail?: string | null
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: log.id,
    type: 'CARTON_PROD',
    timestamp: normalizeTimestampIso(log.timestamp),
    actorEmail: resolveActorEmail(actorEmail),
    payload: log as unknown as Record<string, unknown>,
    shift: normalizeShiftValue(log.shift),
    skuCode: normalizeSkuCode(log.skuCode, log.skuId)
  });
}

export function toTransactionDocFromTankLog(
  log: TankTransferLog,
  actorEmail?: string | null
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: log.id,
    type: 'TANK_LOG',
    timestamp: normalizeTimestampIso(log.timestamp),
    actorEmail: resolveActorEmail(actorEmail),
    payload: log as unknown as Record<string, unknown>,
    shift: null,
    skuCode: normalizeSkuCode(log.skuName, log.batchCode || '')
  });
}

export function toTransactionDocFromAdjustment(
  adj: MaterialStockAdjustment,
  actorEmail?: string | null
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: adj.id,
    type: 'ADJUSTMENT',
    timestamp: normalizeTimestampIso(adj.timestamp, adj.date),
    actorEmail: resolveActorEmail(actorEmail),
    payload: adj as unknown as Record<string, unknown>,
    shift: null,
    skuCode: normalizeSkuCode(adj.materialCode, adj.materialId)
  });
}

export function toTransactionDocFromRejectLog(
  rejectLog: MaterialRejectLog,
  actorEmail?: string | null
): WorkspaceTransactionDoc {
  return normalizeTransactionDoc({
    id: rejectLog.id,
    type: 'REJECT_LOG',
    timestamp: normalizeTimestampIso(rejectLog.timestamp, rejectLog.date),
    actorEmail: resolveActorEmail(actorEmail),
    payload: rejectLog as unknown as Record<string, unknown>,
    shift: normalizeShiftValue(rejectLog.shift),
    skuCode: normalizeSkuCode(rejectLog.skuCode || rejectLog.skuId, rejectLog.materialCode || rejectLog.materialId)
  });
}

export interface HydratedSubcollectionTransactions {
  requests: MaterialRequest[];
  receipts: MaterialReceipt[];
  usages: MaterialUsage[];
  cartonProductions: CartonProductionLog[];
  tankLogs: TankTransferLog[];
  stockAdjustments: MaterialStockAdjustment[];
  rejectLogs: MaterialRejectLog[];
}

export function hydrateTransactionsFromDocs(
  docs: WorkspaceTransactionDoc[]
): HydratedSubcollectionTransactions {
  const requests: MaterialRequest[] = [];
  const receipts: MaterialReceipt[] = [];
  const usages: MaterialUsage[] = [];
  const cartonProductions: CartonProductionLog[] = [];
  const tankLogs: TankTransferLog[] = [];
  const stockAdjustments: MaterialStockAdjustment[] = [];
  const rejectLogs: MaterialRejectLog[] = [];

  const receivedRequestIds = new Set<string>();

  for (const tx of docs) {
    const p = tx.payload || {};
    switch (tx.type) {
      case 'RECEIPT': {
        const rec = { ...(p as unknown as MaterialReceipt), id: (p.id as string) || tx.id };
        if (rec.requestId) receivedRequestIds.add(rec.requestId);
        receipts.push(rec);
        break;
      }
      case 'REQUEST': {
        const req = { ...(p as unknown as MaterialRequest), id: (p.id as string) || tx.id };
        requests.push(req);
        break;
      }
      case 'USAGE': {
        const useItem = { ...(p as unknown as MaterialUsage), id: (p.id as string) || tx.id };
        usages.push(useItem);
        break;
      }
      case 'CARTON_PROD': {
        const cp = { ...(p as unknown as CartonProductionLog), id: (p.id as string) || tx.id };
        cartonProductions.push(cp);
        break;
      }
      case 'TANK_LOG': {
        const tl = { ...(p as unknown as TankTransferLog), id: (p.id as string) || tx.id };
        tankLogs.push(tl);
        break;
      }
      case 'ADJUSTMENT': {
        const adj = { ...(p as unknown as MaterialStockAdjustment), id: (p.id as string) || tx.id };
        stockAdjustments.push(adj);
        break;
      }
      case 'REJECT_LOG': {
        const rej = { ...(p as unknown as MaterialRejectLog), id: (p.id as string) || tx.id };
        rejectLogs.push(rej);
        break;
      }
    }
  }

  // Derive Received status from linked RECEIPT docs so Operators don't need update permission on REQUEST docs
  if (receivedRequestIds.size > 0) {
    for (let i = 0; i < requests.length; i++) {
      if (receivedRequestIds.has(requests[i].id) && requests[i].status !== 'Received') {
        requests[i] = { ...requests[i], status: 'Received' };
      }
    }
  }

  return {
    requests,
    receipts,
    usages,
    cartonProductions,
    tankLogs,
    stockAdjustments,
    rejectLogs
  };
}

// ============================================================================
// One-Time Legacy Migration (Admin Only, writeBatch)
// ============================================================================

export interface LegacyMigrationResult {
  migrated: boolean;
  migratedCount: number;
  alreadyClean: boolean;
}

/**
 * Checks whether workspaces/{workspaceId}/data/operations still contains legacy
 * transaction arrays (requests, receipts, usages, cartonProductions, tankLogs, stockAdjustments).
 * When triggered by an ADMINISTRATOR, copies them into /transactions/{txId} using
 * chunked writeBatch commits and removes the legacy arrays from data/operations.
 */
export async function migrateLegacyOperationsTransactionsIfNeeded(params: {
  workspaceId: string;
  adminEmail?: string | null;
  skus?: SKU[];
}): Promise<LegacyMigrationResult> {
  const user = auth.currentUser;
  if (!user || isCloudWritePaused()) {
    return { migrated: false, migratedCount: 0, alreadyClean: false };
  }

  const safeWorkspaceId = sanitizeTransactionId(params.workspaceId || 'main');
  if (inFlightMigrations.has(safeWorkspaceId)) {
    return { migrated: false, migratedCount: 0, alreadyClean: false };
  }

  inFlightMigrations.add(safeWorkspaceId);
  const opsPath = `workspaces/${safeWorkspaceId}/data/operations`;
  const opsRef = doc(db, 'workspaces', safeWorkspaceId, 'data', 'operations');

  try {
    const opsSnap = await getDocFromServer(opsRef);
    if (!opsSnap.exists()) {
      return { migrated: false, migratedCount: 0, alreadyClean: true };
    }

    const opsData = opsSnap.data() || {};
    const legacyRequests = Array.isArray(opsData.requests) ? (opsData.requests as MaterialRequest[]) : [];
    const legacyReceipts = Array.isArray(opsData.receipts) ? (opsData.receipts as MaterialReceipt[]) : [];
    const legacyUsages = Array.isArray(opsData.usages) ? (opsData.usages as MaterialUsage[]) : [];
    const legacyCartons = Array.isArray(opsData.cartonProductions)
      ? (opsData.cartonProductions as CartonProductionLog[])
      : [];
    const legacyTankLogs = Array.isArray(opsData.tankLogs) ? (opsData.tankLogs as TankTransferLog[]) : [];
    const legacyAdjustments = Array.isArray(opsData.stockAdjustments)
      ? (opsData.stockAdjustments as MaterialStockAdjustment[])
      : [];

    const hasLegacyKeys =
      'requests' in opsData ||
      'receipts' in opsData ||
      'usages' in opsData ||
      'cartonProductions' in opsData ||
      'tankLogs' in opsData ||
      'stockAdjustments' in opsData;

    const totalItems =
      legacyRequests.length +
      legacyReceipts.length +
      legacyUsages.length +
      legacyCartons.length +
      legacyTankLogs.length +
      legacyAdjustments.length;

    if (!hasLegacyKeys && opsData.transactionsMigratedAt) {
      return { migrated: false, migratedCount: 0, alreadyClean: true };
    }

    const migrationActor = resolveActorEmail(params.adminEmail || user.email);
    const skus = params.skus || [];
    const txDocsMap = new Map<string, WorkspaceTransactionDoc>();

    const registerDoc = (txDoc: WorkspaceTransactionDoc) => {
      if (!txDocsMap.has(txDoc.id)) {
        txDocsMap.set(txDoc.id, txDoc);
      }
    };

    legacyRequests.forEach((req, idx) => {
      const baseDate = normalizeTimestampIso(undefined, req.date);
      const offsetIso = new Date(Date.parse(baseDate) - idx).toISOString();
      registerDoc(toTransactionDocFromRequest(req, migrationActor, skus, offsetIso));
    });
    legacyReceipts.forEach((rec, idx) => {
      const baseDate = normalizeTimestampIso(undefined, rec.date);
      const offsetIso = new Date(Date.parse(baseDate) - idx).toISOString();
      registerDoc(toTransactionDocFromReceipt(rec, migrationActor, offsetIso));
    });
    legacyUsages.forEach((useItem, idx) => {
      const baseDate = normalizeTimestampIso(undefined, useItem.date);
      const offsetIso = new Date(Date.parse(baseDate) - idx).toISOString();
      registerDoc(toTransactionDocFromUsage(useItem, migrationActor, skus, offsetIso));
    });
    legacyCartons.forEach(cp => registerDoc(toTransactionDocFromCartonProd(cp, migrationActor)));
    legacyTankLogs.forEach(tl => registerDoc(toTransactionDocFromTankLog(tl, migrationActor)));
    legacyAdjustments.forEach(adj => registerDoc(toTransactionDocFromAdjustment(adj, migrationActor)));

    const docsToMigrate = Array.from(txDocsMap.values());

    // Commit migrated transaction docs in chunks <= 400 (respecting Firestore 500-write batch limit)
    for (let i = 0; i < docsToMigrate.length; i += MIGRATION_BATCH_SIZE) {
      if (isCloudWritePaused()) {
        return { migrated: false, migratedCount: 0, alreadyClean: false };
      }
      const chunk = docsToMigrate.slice(i, i + MIGRATION_BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(txDoc => {
        const txRef = doc(db, 'workspaces', safeWorkspaceId, 'transactions', txDoc.id);
        batch.set(txRef, txDoc);
      });
      await runFirestoreWriteWithGuard(() => batch.commit());
    }

    // Clean legacy transaction arrays from data/operations and mark migration timestamp atomically
    if ((hasLegacyKeys || !opsData.transactionsMigratedAt) && !isCloudWritePaused()) {
      const cleanupBatch = writeBatch(db);
      cleanupBatch.update(opsRef, {
        requests: deleteField(),
        receipts: deleteField(),
        usages: deleteField(),
        cartonProductions: deleteField(),
        tankLogs: deleteField(),
        stockAdjustments: deleteField(),
        transactionsMigratedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedByUid: user.uid
      });
      await runFirestoreWriteWithGuard(() => cleanupBatch.commit());
    }

    return {
      migrated: totalItems > 0 || hasLegacyKeys,
      migratedCount: docsToMigrate.length,
      alreadyClean: false
    };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      return { migrated: false, migratedCount: 0, alreadyClean: false };
    }
    handleFirestoreError(error, OperationType.WRITE, opsPath);
  } finally {
    inFlightMigrations.delete(safeWorkspaceId);
  }
}

export function mergeMigratedTransactionsIntoState(
  prev: AppState['transactions'],
  hydrated: HydratedSubcollectionTransactions,
  pendingLocalDocs: Map<string, WorkspaceTransactionDoc>
): AppState['transactions'] {
  if (pendingLocalDocs.size === 0) {
    return {
      ...prev,
      requests: hydrated.requests,
      receipts: hydrated.receipts,
      usages: hydrated.usages,
      cartonProductions: hydrated.cartonProductions,
      tankLogs: hydrated.tankLogs,
      stockAdjustments: hydrated.stockAdjustments,
      rejectLogs: hydrated.rejectLogs
    };
  }

  const seenIds = new Set<string>();
  const allDocs: WorkspaceTransactionDoc[] = [];

  for (const d of [
    ...Array.from(pendingLocalDocs.values()),
    ...hydrated.requests.map(r => toTransactionDocFromRequest(r)),
    ...hydrated.receipts.map(r => toTransactionDocFromReceipt(r)),
    ...hydrated.usages.map(u => toTransactionDocFromUsage(u)),
    ...hydrated.cartonProductions.map(c => toTransactionDocFromCartonProd(c)),
    ...hydrated.tankLogs.map(t => toTransactionDocFromTankLog(t)),
    ...hydrated.stockAdjustments.map(a => toTransactionDocFromAdjustment(a)),
    ...hydrated.rejectLogs.map(rej => toTransactionDocFromRejectLog(rej))
  ]) {
    if (!seenIds.has(d.id)) {
      seenIds.add(d.id);
      allDocs.push(d);
    }
  }

  allDocs.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));
  const merged = hydrateTransactionsFromDocs(allDocs);

  return {
    ...prev,
    requests: merged.requests,
    receipts: merged.receipts,
    usages: merged.usages,
    cartonProductions: merged.cartonProductions,
    tankLogs: merged.tankLogs,
    stockAdjustments: merged.stockAdjustments,
    rejectLogs: merged.rejectLogs
  };
}

// ============================================================================
// Shift OEE Snapshots (1 Summary Doc / Shift / Line for >90% Read Savings)
// ============================================================================

function clampSnapshotPct(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(100, Math.round(val * 100) / 100));
}

function clampMinutes(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1440, Math.round(val * 100) / 100));
}

function clampKg(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.max(0, Math.min(1000000, Math.round(val * 1000) / 1000));
}

export function buildShiftOeeSnapshotFirestoreDoc(
  snapshot: ShiftOeeSnapshotDoc,
  uid: string
): Record<string, unknown> {
  const safeWorkspaceId = sanitizeTransactionId(snapshot.workspaceId || 'main', 'ws').slice(0, 64);
  const safeLineId = sanitizeTransactionId(snapshot.lineId || 'line', 'line').slice(0, 64);
  const safeSnapshotId = sanitizeTransactionId(
    snapshot.id || `${snapshot.shiftId}_${safeLineId}`,
    'oee'
  );
  const safeUid = sanitizeTransactionId(uid || 'system', 'uid');
  const bd = snapshot.sixBigLossesBreakdown;

  const sanitizeBucket = (b?: { minutes?: number; lossKg?: number }) => ({
    minutes: clampMinutes(Number(b?.minutes ?? 0)),
    lossKg: clampKg(Number(b?.lossKg ?? 0))
  });

  return {
    id: safeSnapshotId,
    workspaceId: safeWorkspaceId,
    shiftId: String(snapshot.shiftId || `${snapshot.date}-S${snapshot.shift}`).slice(0, 32),
    date: String(snapshot.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
    shift: snapshot.shift === 1 || snapshot.shift === 2 || snapshot.shift === 3 ? snapshot.shift : 1,
    lineId: safeLineId,
    lineName: sanitizeTextInput(snapshot.lineName || safeLineId, 120),
    skuCode: String(snapshot.skuCode || 'UNASSIGNED').trim().slice(0, 64) || 'UNASSIGNED',
    availability: clampSnapshotPct(snapshot.availability),
    performance: clampSnapshotPct(snapshot.performance),
    quality: clampSnapshotPct(snapshot.quality),
    oeeScore: clampSnapshotPct(snapshot.oeeScore),
    sixBigLossesBreakdown: {
      equipmentFailure: sanitizeBucket(bd?.equipmentFailure),
      setupAdjustment: sanitizeBucket(bd?.setupAdjustment),
      idlingMinorStops: sanitizeBucket(bd?.idlingMinorStops),
      reducedSpeed: sanitizeBucket(bd?.reducedSpeed),
      processDefects: sanitizeBucket(bd?.processDefects),
      reducedYield: sanitizeBucket(bd?.reducedYield)
    },
    materialVariancePct: Math.max(-100, Math.min(10000, Number(snapshot.materialVariancePct) || 0)),
    plannedProductionTimeMinutes: clampMinutes(snapshot.plannedProductionTimeMinutes),
    operatingTimeMinutes: clampMinutes(snapshot.operatingTimeMinutes),
    totalOutputCartons: Math.max(0, Math.min(10000000, Math.round(Number(snapshot.totalOutputCartons) || 0))),
    goodOutputCartons: Math.max(0, Math.min(10000000, Number(snapshot.goodOutputCartons) || 0)),
    standardBomMaterialKg: Math.max(0, Math.min(10000000, Number(snapshot.standardBomMaterialKg) || 0)),
    actualMaterialUsedKg: Math.max(0, Math.min(10000000, Number(snapshot.actualMaterialUsedKg) || 0)),
    updatedByUid: safeUid
  };
}

export async function persistShiftOeeSnapshotDoc(
  snapshot: ShiftOeeSnapshotDoc,
  options?: { enqueueOnOffline?: boolean }
): Promise<{ saved: boolean; queued: boolean }> {
  const user = auth.currentUser;
  const workspaceId = sanitizeTransactionId(snapshot.workspaceId || 'main', 'ws').slice(0, 64);
  const enqueueOnOffline = options?.enqueueOnOffline ?? true;

  if (!user || !getBrowserOnlineStatus() || isCloudWritePaused()) {
    if (enqueueOnOffline) {
      enqueueOfflineSyncItem({
        type: 'OEE_SNAPSHOT',
        workspaceId,
        dedupeKey: `oee_snap_${workspaceId}_${snapshot.id}`,
        payload: { snapshot }
      });
    }
    return { saved: false, queued: enqueueOnOffline };
  }

  const firestoreBody = buildShiftOeeSnapshotFirestoreDoc(snapshot, user.uid);
  const snapshotId = String(firestoreBody.id);
  const path = `workspaces/${workspaceId}/shift_oee_snapshots/${snapshotId}`;

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', workspaceId, 'shift_oee_snapshots', snapshotId), {
        ...firestoreBody,
        updatedAt: serverTimestamp()
      })
    );
    return { saved: true, queued: false };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          type: 'OEE_SNAPSHOT',
          workspaceId,
          dedupeKey: `oee_snap_${workspaceId}_${snapshotId}`,
          payload: { snapshot },
          lastError: 'Kuota Firestore sedang penuh'
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    if (isNetworkOrOfflineError(error)) {
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          type: 'OEE_SNAPSHOT',
          workspaceId,
          dedupeKey: `oee_snap_${workspaceId}_${snapshotId}`,
          payload: { snapshot },
          lastError: error instanceof Error ? error.message : String(error)
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveShiftOeeSnapshot(params: {
  state: AppState;
  dateStr: string;
  shift: ShiftNumber;
  lineId?: string;
  nowMs?: number;
}): Promise<ShiftOeeSnapshotDoc[]> {
  const { state, dateStr, shift, lineId, nowMs } = params;
  const snapshots: ShiftOeeSnapshotDoc[] = lineId
    ? [
        calculateLineShiftOee({
          state,
          lineId,
          dateStr,
          shift,
          nowMs
        }).snapshot
      ]
    : calculateShiftAllLinesOee(state, dateStr, shift, nowMs).lineResults.map(r => r.snapshot);

  for (const snap of snapshots) {
    await persistShiftOeeSnapshotDoc(snap, { enqueueOnOffline: true });
  }
  return snapshots;
}

export async function fetchHistoricalShiftOeeSnapshots(
  workspaceId: string,
  limitCount = 60
): Promise<ShiftOeeSnapshotDoc[]> {
  if (!auth.currentUser) return [];
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main', 'ws').slice(0, 64);
  const boundedLimit = Math.min(Math.max(1, Math.floor(limitCount)), 200);
  const path = `workspaces/${safeWorkspaceId}/shift_oee_snapshots`;

  try {
    const q = query(
      collection(db, 'workspaces', safeWorkspaceId, 'shift_oee_snapshots'),
      orderBy('updatedAt', 'desc'),
      limit(boundedLimit)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        ...(data as unknown as ShiftOeeSnapshotDoc),
        id: typeof data.id === 'string' ? data.id : d.id,
        updatedAt:
          data.updatedAt && typeof data.updatedAt.toDate === 'function'
            ? data.updatedAt.toDate().toISOString()
            : typeof data.updatedAt === 'string'
            ? data.updatedAt
            : undefined
      };
    });
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      return [];
    }
    if (isNetworkOrOfflineError(error)) {
      return [];
    }
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ============================================================================
// IIoT Telemetry Stream Helpers (ESP32 / PLC Gateway Pipeline)
// ============================================================================

export async function recordIiotTelemetryEvent(
  event: Omit<IiotTelemetryEventDoc, 'receivedAt' | 'sourceUid'>,
  options?: { enqueueOnOffline?: boolean }
): Promise<{ saved: boolean; queued: boolean }> {
  const user = auth.currentUser;
  const workspaceId = sanitizeTransactionId(event.workspaceId || 'main', 'ws').slice(0, 64);
  const safeId = sanitizeTransactionId(event.id, 'tel');
  const enqueueOnOffline = options?.enqueueOnOffline ?? true;

  if (!user || !getBrowserOnlineStatus() || isCloudWritePaused()) {
    if (enqueueOnOffline) {
      enqueueOfflineSyncItem({
        id: `oq_tel_${safeId}`,
        type: 'IIOT_TELEMETRY',
        workspaceId,
        payload: { event: { ...event, id: safeId, workspaceId } }
      });
    }
    return { saved: false, queued: enqueueOnOffline };
  }

  const path = `workspaces/${workspaceId}/iiot_telemetry/${safeId}`;
  const docBody = stripUndefinedDeep({
    id: safeId,
    workspaceId,
    lineId: sanitizeTransactionId(event.lineId, 'line').slice(0, 64),
    machineId: event.machineId ? sanitizeTextInput(event.machineId, 64) : undefined,
    skuCode: event.skuCode ? sanitizeTextInput(event.skuCode, 64) : undefined,
    status: event.status,
    pulseCount: Math.max(0, Math.min(1000000, Math.round(Number(event.pulseCount) || 0))),
    cycleTimeSec: Math.max(0, Math.min(86400, Number(event.cycleTimeSec) || 0)),
    idleMinutes:
      event.idleMinutes !== undefined
        ? Math.max(0, Math.min(1440, Number(event.idleMinutes) || 0))
        : undefined,
    recordedAt: normalizeTimestampIso(event.recordedAt),
    receivedAt: serverTimestamp(),
    sourceUid: sanitizeTransactionId(user.uid, 'uid')
  });

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', workspaceId, 'iiot_telemetry', safeId), docBody)
    );
    return { saved: true, queued: false };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          id: `oq_tel_${safeId}`,
          type: 'IIOT_TELEMETRY',
          workspaceId,
          payload: { event: { ...event, id: safeId, workspaceId } }
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    if (isNetworkOrOfflineError(error)) {
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          id: `oq_tel_${safeId}`,
          type: 'IIOT_TELEMETRY',
          workspaceId,
          payload: { event: { ...event, id: safeId, workspaceId } }
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// Immutable Audit Trail Service (/workspaces/{workspaceId}/audit_logs/{auditId})
// ============================================================================

function serializeBoundedAuditValue(value: unknown, maxLen = 3800): string | undefined {
  if (value === undefined) return undefined;
  try {
    const json = typeof value === 'string' ? value : JSON.stringify(stripUndefinedDeep(value));
    if (!json) return undefined;
    return json.length > maxLen ? `${json.slice(0, maxLen - 3)}...` : json;
  } catch {
    return String(value).slice(0, maxLen);
  }
}

export interface RecordAuditLogParams {
  workspaceId?: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  role: UserRole;
  module: AuditLogModule;
  action: AuditLogAction;
  targetId: string;
  targetLabel?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reasonNote?: string;
  enqueueOnOffline?: boolean;
}

export function buildAuditLogEntry(params: RecordAuditLogParams): AuditLogEntry {
  const safeWorkspaceId = sanitizeTransactionId(params.workspaceId || 'main', 'ws').slice(0, 64);
  const safeId = sanitizeTransactionId(
    `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    'aud'
  );
  const resolvedUid = sanitizeTransactionId(
    params.userId || auth.currentUser?.uid || 'local_operator',
    'uid'
  );

  return {
    id: safeId,
    workspaceId: safeWorkspaceId,
    timestamp: new Date().toISOString(),
    userId: resolvedUid,
    userName: sanitizeTextInput(params.userName || 'System', 120) || 'System',
    userEmail: params.userEmail ? normalizeEmail(params.userEmail).slice(0, 160) : undefined,
    role: params.role,
    module: params.module,
    action: params.action,
    targetId: String(params.targetId || safeId).trim().slice(0, 128) || safeId,
    targetLabel: params.targetLabel ? sanitizeTextInput(params.targetLabel, 160) : undefined,
    previousValue: params.previousValue,
    newValue: params.newValue,
    reasonNote: params.reasonNote ? sanitizeTextInput(params.reasonNote, 500) : undefined
  };
}

export async function persistAuditLogEntry(
  entry: AuditLogEntry,
  options?: { enqueueOnOffline?: boolean }
): Promise<{ saved: boolean; queued: boolean }> {
  const user = auth.currentUser;
  const workspaceId = sanitizeTransactionId(entry.workspaceId || 'main', 'ws').slice(0, 64);
  const auditId = sanitizeTransactionId(entry.id, 'aud');
  const enqueueOnOffline = options?.enqueueOnOffline ?? true;

  if (!user || !getBrowserOnlineStatus() || isCloudWritePaused()) {
    if (enqueueOnOffline) {
      enqueueOfflineSyncItem({
        id: `oq_aud_${auditId}`,
        type: 'AUDIT_LOG',
        workspaceId,
        payload: { entry: { ...entry, id: auditId, workspaceId } }
      });
    }
    return { saved: false, queued: enqueueOnOffline };
  }

  const prevJson = serializeBoundedAuditValue(entry.previousValue);
  const nextJson = serializeBoundedAuditValue(entry.newValue);
  const path = `workspaces/${workspaceId}/audit_logs/${auditId}`;

  const docBody = stripUndefinedDeep({
    id: auditId,
    workspaceId,
    timestamp: normalizeTimestampIso(entry.timestamp),
    createdAt: serverTimestamp(),
    userId: sanitizeTransactionId(user.uid, 'uid'),
    userName: sanitizeTextInput(entry.userName || user.displayName || user.email || 'User', 120) || 'User',
    userEmail: entry.userEmail
      ? normalizeEmail(entry.userEmail).slice(0, 160)
      : user.email
      ? normalizeEmail(user.email).slice(0, 160)
      : undefined,
    role: entry.role,
    module: entry.module,
    action: entry.action,
    targetId: String(entry.targetId || auditId).trim().slice(0, 128) || auditId,
    targetLabel: entry.targetLabel ? sanitizeTextInput(entry.targetLabel, 160) : undefined,
    previousValueJson: prevJson,
    newValueJson: nextJson,
    reasonNote: entry.reasonNote ? sanitizeTextInput(entry.reasonNote, 500) : undefined
  });

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', workspaceId, 'audit_logs', auditId), docBody)
    );
    return { saved: true, queued: false };
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          id: `oq_aud_${auditId}`,
          type: 'AUDIT_LOG',
          workspaceId,
          payload: { entry: { ...entry, id: auditId, workspaceId } },
          lastError: 'Kuota Firestore sedang penuh'
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    if (isNetworkOrOfflineError(error)) {
      if (enqueueOnOffline) {
        enqueueOfflineSyncItem({
          id: `oq_aud_${auditId}`,
          type: 'AUDIT_LOG',
          workspaceId,
          payload: { entry: { ...entry, id: auditId, workspaceId } },
          lastError: error instanceof Error ? error.message : String(error)
        });
      }
      return { saved: false, queued: enqueueOnOffline };
    }
    // Non-fatal fallback for client role mismatches so local audit trail still stays intact
    console.warn(`Audit log cloud write rejected at ${path}:`, error);
    return { saved: false, queued: false };
  }
}

export async function recordAuditLog(params: RecordAuditLogParams): Promise<AuditLogEntry> {
  const entry = buildAuditLogEntry(params);
  await persistAuditLogEntry(entry, { enqueueOnOffline: params.enqueueOnOffline ?? true });
  return entry;
}

export function subscribeAuditLogs(
  workspaceId: string,
  limitCount = 200,
  callback: (logs: AuditLogEntry[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  if (!auth.currentUser) return () => {};
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main', 'ws').slice(0, 64);
  const boundedLimit = Math.min(Math.max(1, Math.floor(limitCount || 200)), 300);
  const path = `workspaces/${safeWorkspaceId}/audit_logs`;

  const q = query(
    collection(db, 'workspaces', safeWorkspaceId, 'audit_logs'),
    orderBy('createdAt', 'desc'),
    limit(boundedLimit)
  );

  return onSnapshot(
    q,
    snapshot => {
      const entries: AuditLogEntry[] = [];
      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        if (!d) return;
        const parseJsonField = (raw: unknown): unknown => {
          if (typeof raw !== 'string' || !raw.trim()) return undefined;
          try {
            return JSON.parse(raw);
          } catch {
            return raw;
          }
        };
        entries.push({
          id: typeof d.id === 'string' && d.id ? d.id : docSnap.id,
          workspaceId: typeof d.workspaceId === 'string' ? d.workspaceId : safeWorkspaceId,
          timestamp: typeof d.timestamp === 'string' ? d.timestamp : new Date().toISOString(),
          userId: typeof d.userId === 'string' ? d.userId : '',
          userName: typeof d.userName === 'string' ? d.userName : 'User',
          userEmail: typeof d.userEmail === 'string' ? d.userEmail : undefined,
          role: (d.role as UserRole) || 'OPERATOR',
          module: (d.module as AuditLogModule) || 'SYSTEM',
          action: (d.action as AuditLogAction) || 'UPDATE',
          targetId: typeof d.targetId === 'string' ? d.targetId : docSnap.id,
          targetLabel: typeof d.targetLabel === 'string' ? d.targetLabel : undefined,
          previousValue: parseJsonField(d.previousValueJson),
          newValue: parseJsonField(d.newValueJson),
          reasonNote: typeof d.reasonNote === 'string' ? d.reasonNote : undefined
        });
      });
      callback(entries);
    },
    err => {
      if (isQuotaExceededError(err)) {
        tripCloudWriteQuotaPause();
      }
      if (onError) onError(err);
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Prevent uncaught error inside onSnapshot callback
      }
    }
  );
}

