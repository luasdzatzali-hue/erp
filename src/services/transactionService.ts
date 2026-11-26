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
  CartonProductionLog,
  MaterialReceipt,
  MaterialRejectLog,
  MaterialRequest,
  MaterialStockAdjustment,
  MaterialUsage,
  ShiftNumber,
  SKU,
  TankTransferLog
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
import { normalizeEmail } from '../utils/security';

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
  })
): Promise<WorkspaceTransactionDoc> {
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const normalized = normalizeTransactionDoc(tx);
  if (isCloudWritePaused()) {
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
  tx: WorkspaceTransactionDoc
): Promise<void> {
  if (isCloudWritePaused()) return;
  const safeWorkspaceId = sanitizeTransactionId(workspaceId || 'main');
  const normalized = normalizeTransactionDoc(tx);
  const path = `workspaces/${safeWorkspaceId}/transactions/${normalized.id}`;

  try {
    await runFirestoreWriteWithGuard(() =>
      setDoc(doc(db, 'workspaces', safeWorkspaceId, 'transactions', normalized.id), normalized)
    );
  } catch (error) {
    if (isQuotaExceededError(error)) {
      tripCloudWriteQuotaPause();
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
