export type OfflineQueueItemType =
  | 'TX_APPEND'
  | 'TX_UPDATE'
  | 'OEE_SNAPSHOT'
  | 'AUDIT_LOG'
  | 'IIOT_TELEMETRY'
  | 'SECTION_SYNC';

export interface OfflineQueueItem {
  id: string;
  type: OfflineQueueItemType;
  workspaceId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  dedupeKey?: string;
}

export interface OfflineQueueStatus {
  isOnline: boolean;
  pendingCount: number;
  isFlushing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  nextRetryAt: number | null;
}

export type OfflineFlushOutcome = 'ok' | 'retry' | 'quota_paused' | 'drop';

export const OFFLINE_SYNC_QUEUE_STORAGE_KEY = 'prodtrack_offline_sync_queue_v1';
const OFFLINE_IDB_NAME = 'prodtrack_mes_offline_db';
const OFFLINE_IDB_STORE = 'sync_queue';
const MAX_QUEUE_SIZE = 500;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;

let inMemoryQueueFallback: OfflineQueueItem[] = [];
let currentIsFlushing = false;
let currentLastSyncedAt: string | null = null;
let currentLastError: string | null = null;
let currentIsOnline = getBrowserOnlineStatus();
const statusListeners = new Set<(status: OfflineQueueStatus) => void>();

export function getBrowserOnlineStatus(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export function setOfflineQueueOnlineOverride(isOnline: boolean): void {
  currentIsOnline = isOnline;
  notifyStatusListeners();
}

export function computeExponentialBackoffMs(attempt: number): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, safeAttempt - 1));
}

export function isNetworkOrOfflineError(error: unknown): boolean {
  if (!getBrowserOnlineStatus()) return true;
  if (!error) return false;
  const errObj = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = String(errObj.code || '').toLowerCase();
  const msg = String(errObj.message || error || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'network-request-failed' ||
    msg.includes('offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('timeout') ||
    msg.includes('timed out')
  );
}

function readQueueFromStorage(): OfflineQueueItem[] {
  if (typeof localStorage === 'undefined') {
    return [...inMemoryQueueFallback];
  }
  try {
    const raw = localStorage.getItem(OFFLINE_SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is OfflineQueueItem =>
        Boolean(it && typeof it === 'object' && typeof it.id === 'string' && typeof it.type === 'string')
    );
  } catch {
    return [...inMemoryQueueFallback];
  }
}

function writeQueueToStorage(items: OfflineQueueItem[]): void {
  const bounded = items.slice(-MAX_QUEUE_SIZE);
  inMemoryQueueFallback = [...bounded];
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(OFFLINE_SYNC_QUEUE_STORAGE_KEY, JSON.stringify(bounded));
    } catch {
      // Ignore storage quota issues; keep in-memory fallback
    }
  }
  void mirrorQueueToIndexedDb(bounded);
}

async function mirrorQueueToIndexedDb(items: OfflineQueueItem[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await new Promise<void>(resolve => {
      const req = indexedDB.open(OFFLINE_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(OFFLINE_IDB_STORE)) {
          db.createObjectStore(OFFLINE_IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(OFFLINE_IDB_STORE, 'readwrite');
          const store = tx.objectStore(OFFLINE_IDB_STORE);
          store.clear();
          items.forEach(item => store.put(item));
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });
  } catch {
    // IndexedDB is a durability mirror; localStorage & memory already hold the queue
  }
}

export function getOfflineQueueItems(): OfflineQueueItem[] {
  return readQueueFromStorage();
}

export function getOfflineQueueStatus(): OfflineQueueStatus {
  const items = readQueueFromStorage();
  const nextRetryAt =
    items.length > 0
      ? items.reduce((minTs, it) => (it.nextRetryAt < minTs ? it.nextRetryAt : minTs), items[0].nextRetryAt)
      : null;

  return {
    isOnline: currentIsOnline && getBrowserOnlineStatus(),
    pendingCount: items.length,
    isFlushing: currentIsFlushing,
    lastSyncedAt: currentLastSyncedAt,
    lastError: currentLastError,
    nextRetryAt
  };
}

function notifyStatusListeners(): void {
  const status = getOfflineQueueStatus();
  statusListeners.forEach(listener => {
    try {
      listener(status);
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeOfflineQueue(
  listener: (status: OfflineQueueStatus) => void
): () => void {
  statusListeners.add(listener);
  listener(getOfflineQueueStatus());
  return () => {
    statusListeners.delete(listener);
  };
}

export function enqueueOfflineSyncItem(params: {
  id?: string;
  type: OfflineQueueItemType;
  workspaceId: string;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  lastError?: string;
}): OfflineQueueItem {
  const items = readQueueFromStorage();
  const nowIso = new Date().toISOString();
  const item: OfflineQueueItem = {
    id:
      params.id ||
      `oq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: params.type,
    workspaceId: params.workspaceId || 'main',
    payload: params.payload,
    createdAt: nowIso,
    attempts: 0,
    nextRetryAt: 0,
    lastError: params.lastError,
    dedupeKey: params.dedupeKey
  };

  if (params.dedupeKey) {
    const existingIdx = items.findIndex(it => it.dedupeKey === params.dedupeKey);
    if (existingIdx >= 0) {
      items[existingIdx] = {
        ...items[existingIdx],
        payload: item.payload,
        createdAt: item.createdAt,
        nextRetryAt: 0,
        lastError: item.lastError ?? items[existingIdx].lastError
      };
      writeQueueToStorage(items);
      notifyStatusListeners();
      return items[existingIdx];
    }
  }

  items.push(item);
  writeQueueToStorage(items);
  notifyStatusListeners();
  return item;
}

export function removeOfflineQueueItem(id: string): void {
  const items = readQueueFromStorage().filter(it => it.id !== id);
  writeQueueToStorage(items);
  notifyStatusListeners();
}

export function clearOfflineQueue(): void {
  currentLastError = null;
  writeQueueToStorage([]);
  notifyStatusListeners();
}

export async function flushOfflineQueue(
  executor: (item: OfflineQueueItem) => Promise<OfflineFlushOutcome>,
  options?: { force?: boolean; nowMs?: number }
): Promise<{
  flushedCount: number;
  remainingCount: number;
  pausedByQuota: boolean;
}> {
  if (currentIsFlushing) {
    const remaining = readQueueFromStorage().length;
    return { flushedCount: 0, remainingCount: remaining, pausedByQuota: false };
  }

  const initialItems = readQueueFromStorage();
  if (initialItems.length === 0) {
    return { flushedCount: 0, remainingCount: 0, pausedByQuota: false };
  }

  if (!getBrowserOnlineStatus() || !currentIsOnline) {
    return { flushedCount: 0, remainingCount: initialItems.length, pausedByQuota: false };
  }

  currentIsFlushing = true;
  notifyStatusListeners();

  let flushedCount = 0;
  let pausedByQuota = false;
  const nowMs = options?.nowMs ?? Date.now();
  const workingQueue = [...initialItems];

  try {
    while (workingQueue.length > 0) {
      const head = workingQueue[0];
      if (!options?.force && head.nextRetryAt > nowMs) {
        break;
      }

      let outcome: OfflineFlushOutcome = 'retry';
      let errorMsg: string | undefined;

      try {
        outcome = await executor(head);
      } catch (err) {
        outcome = 'retry';
        errorMsg = err instanceof Error ? err.message : String(err);
      }

      if (outcome === 'ok' || outcome === 'drop') {
        workingQueue.shift();
        flushedCount += outcome === 'ok' ? 1 : 0;
        currentLastError = null;
        if (outcome === 'ok') {
          currentLastSyncedAt = new Date().toISOString();
        }
        writeQueueToStorage(workingQueue);
        continue;
      }

      if (outcome === 'quota_paused') {
        pausedByQuota = true;
        currentLastError = 'Kuota Firestore harian sedang dijeda. Antrean tetap aman tersimpan.';
        writeQueueToStorage(workingQueue);
        break;
      }

      // 'retry': apply exponential backoff while preserving FIFO head ordering
      const nextAttempts = (head.attempts || 0) + 1;
      const delayMs = computeExponentialBackoffMs(nextAttempts);
      workingQueue[0] = {
        ...head,
        attempts: nextAttempts,
        nextRetryAt: nowMs + delayMs,
        lastError: errorMsg || head.lastError || 'Gagal menjangkau Cloud Firestore'
      };
      currentLastError = workingQueue[0].lastError || null;
      writeQueueToStorage(workingQueue);
      break;
    }
  } finally {
    currentIsFlushing = false;
    notifyStatusListeners();
  }

  return {
    flushedCount,
    remainingCount: workingQueue.length,
    pausedByQuota
  };
}
