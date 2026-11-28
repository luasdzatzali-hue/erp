import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearOfflineQueue,
  computeExponentialBackoffMs,
  enqueueOfflineSyncItem,
  flushOfflineQueue,
  getOfflineQueueItems,
  getOfflineQueueStatus,
  isNetworkOrOfflineError,
  OFFLINE_SYNC_QUEUE_STORAGE_KEY,
  setOfflineQueueOnlineOverride
} from '../offlineQueue';

function installMockLocalStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    }
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true
  });
  return store;
}

describe('offlineQueue (FIFO resilient sync)', () => {
  let backingStore: Map<string, string>;

  beforeEach(() => {
    backingStore = installMockLocalStorage();
    setOfflineQueueOnlineOverride(true);
    clearOfflineQueue();
  });

  it('persists queued items to localStorage and reads them back in FIFO order', () => {
    enqueueOfflineSyncItem({
      id: 'item-1',
      type: 'TX_APPEND',
      workspaceId: 'ws-1',
      payload: { seq: 1 }
    });
    enqueueOfflineSyncItem({
      id: 'item-2',
      type: 'TX_UPDATE',
      workspaceId: 'ws-1',
      payload: { seq: 2 }
    });

    const raw = backingStore.get(OFFLINE_SYNC_QUEUE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const items = getOfflineQueueItems();
    expect(items.map(i => i.id)).toEqual(['item-1', 'item-2']);
    expect(getOfflineQueueStatus().pendingCount).toBe(2);
  });

  it('coalesces duplicate items sharing the same dedupeKey instead of duplicating queue entries', () => {
    enqueueOfflineSyncItem({
      type: 'OEE_SNAPSHOT',
      workspaceId: 'ws-1',
      dedupeKey: 'oee_snap_ws-1_2026-11-28-S1_L1',
      payload: { oee: 80 }
    });
    enqueueOfflineSyncItem({
      type: 'OEE_SNAPSHOT',
      workspaceId: 'ws-1',
      dedupeKey: 'oee_snap_ws-1_2026-11-28-S1_L1',
      payload: { oee: 86.5 }
    });

    const items = getOfflineQueueItems();
    expect(items).toHaveLength(1);
    expect(items[0].payload).toEqual({ oee: 86.5 });
  });

  it('computes capped exponential backoff delays', () => {
    expect(computeExponentialBackoffMs(1)).toBe(1000);
    expect(computeExponentialBackoffMs(2)).toBe(2000);
    expect(computeExponentialBackoffMs(3)).toBe(4000);
    expect(computeExponentialBackoffMs(10)).toBe(60000);
  });

  it('flushes FIFO sequentially and stops cleanly on quota_paused without dropping items', async () => {
    enqueueOfflineSyncItem({
      id: 'q-1',
      type: 'TX_APPEND',
      workspaceId: 'ws-1',
      payload: { n: 1 }
    });
    enqueueOfflineSyncItem({
      id: 'q-2',
      type: 'OEE_SNAPSHOT',
      workspaceId: 'ws-1',
      payload: { n: 2 }
    });
    enqueueOfflineSyncItem({
      id: 'q-3',
      type: 'AUDIT_LOG',
      workspaceId: 'ws-1',
      payload: { n: 3 }
    });

    const executedIds: string[] = [];
    const executor = vi.fn(async (item: { id: string }) => {
      executedIds.push(item.id);
      if (item.id === 'q-1') return 'ok' as const;
      if (item.id === 'q-2') return 'quota_paused' as const;
      return 'ok' as const;
    });

    const res = await flushOfflineQueue(executor, { nowMs: 10000 });
    expect(executedIds).toEqual(['q-1', 'q-2']);
    expect(res.flushedCount).toBe(1);
    expect(res.remainingCount).toBe(2);
    expect(res.pausedByQuota).toBe(true);
    expect(getOfflineQueueItems().map(i => i.id)).toEqual(['q-2', 'q-3']);
  });

  it('schedules exponential backoff retry on failed item and preserves FIFO head', async () => {
    enqueueOfflineSyncItem({
      id: 'r-1',
      type: 'TX_APPEND',
      workspaceId: 'ws-1',
      payload: { n: 1 }
    });
    enqueueOfflineSyncItem({
      id: 'r-2',
      type: 'TX_APPEND',
      workspaceId: 'ws-1',
      payload: { n: 2 }
    });

    const nowMs = 50_000;
    const res1 = await flushOfflineQueue(async () => 'retry', { nowMs });
    expect(res1.flushedCount).toBe(0);
    expect(res1.remainingCount).toBe(2);

    const headAfterFail = getOfflineQueueItems()[0];
    expect(headAfterFail.id).toBe('r-1');
    expect(headAfterFail.attempts).toBe(1);
    expect(headAfterFail.nextRetryAt).toBe(nowMs + 1000);

    // Before backoff expires, non-forced flush should skip without invoking executor
    const skippedExec = vi.fn(async () => 'ok' as const);
    const res2 = await flushOfflineQueue(skippedExec, { nowMs: nowMs + 500 });
    expect(skippedExec).not.toHaveBeenCalled();
    expect(res2.remainingCount).toBe(2);

    // Forced flush or after backoff expires flushes all in FIFO order
    const okOrder: string[] = [];
    const res3 = await flushOfflineQueue(
      async item => {
        okOrder.push(item.id);
        return 'ok';
      },
      { force: true, nowMs: nowMs + 600 }
    );
    expect(res3.flushedCount).toBe(2);
    expect(res3.remainingCount).toBe(0);
    expect(okOrder).toEqual(['r-1', 'r-2']);
  });

  it('detects common offline and network errors', () => {
    expect(isNetworkOrOfflineError({ code: 'unavailable', message: 'Network unreachable' })).toBe(true);
    expect(isNetworkOrOfflineError(new Error('Failed to fetch'))).toBe(true);
    expect(isNetworkOrOfflineError(new Error('permission-denied'))).toBe(false);
  });
});
