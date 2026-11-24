import {
  DEFAULT_PRODUCTION_SPREADSHEET_ID,
  DEFAULT_PRODUCTION_SPREADSHEET_URL
} from './googleWorkspace';

export type GoogleSheetsSyncStatus = 'Idle' | 'Syncing' | 'Success' | 'Error';

export interface SheetsSyncHistoryEntry {
  id: string;
  timestamp: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetName: string;
  mode: 'PRODUCTION_LOGS' | 'PLAN_VS_ACTUAL' | 'FORCE_SYNC_STATS';
  rowsWritten: number;
  updatedRange: string;
  triggeredBy: string;
}

export interface GoogleSheetsSyncSettings {
  spreadsheetUrl: string;
  spreadsheetId: string;
  selectedSheetName: string;
  autoQueueNewProduction: boolean;
  syncedProductionIds: string[];
  syncHistory: SheetsSyncHistoryEntry[];
  lastSyncedAt?: string;
  syncStatus: GoogleSheetsSyncStatus;
  lastSyncError?: string;
}

const SHEETS_SYNC_STORAGE_KEY = 'prodtrack_gsheets_sync_v1';
export const SHEETS_SYNC_EVENT = 'prodtrack-sheets-sync-updated';

const VALID_SYNC_STATUSES: GoogleSheetsSyncStatus[] = ['Idle', 'Syncing', 'Success', 'Error'];
let staleSyncingClearedOnBoot = false;

export function getDefaultSheetsSyncSettings(): GoogleSheetsSyncSettings {
  return {
    spreadsheetUrl: DEFAULT_PRODUCTION_SPREADSHEET_URL,
    spreadsheetId: DEFAULT_PRODUCTION_SPREADSHEET_ID,
    selectedSheetName: '',
    autoQueueNewProduction: true,
    syncedProductionIds: [],
    syncHistory: [],
    syncStatus: 'Idle'
  };
}

export function loadSheetsSyncSettings(): GoogleSheetsSyncSettings {
  const defaults = getDefaultSheetsSyncSettings();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(SHEETS_SYNC_STORAGE_KEY);
    if (!raw) {
      staleSyncingClearedOnBoot = true;
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const rawStatus = parsed.syncStatus as GoogleSheetsSyncStatus | undefined;
    let derivedStatus: GoogleSheetsSyncStatus =
      rawStatus && VALID_SYNC_STATUSES.includes(rawStatus)
        ? rawStatus
        : parsed.lastSyncedAt
        ? 'Success'
        : 'Idle';

    const shouldRecoverStaleSyncing = !staleSyncingClearedOnBoot && derivedStatus === 'Syncing';
    staleSyncingClearedOnBoot = true;
    if (shouldRecoverStaleSyncing) {
      derivedStatus = parsed.lastSyncedAt ? 'Success' : 'Idle';
    }

    const result: GoogleSheetsSyncSettings = {
      spreadsheetUrl: parsed.spreadsheetUrl || defaults.spreadsheetUrl,
      spreadsheetId: parsed.spreadsheetId || defaults.spreadsheetId,
      selectedSheetName: typeof parsed.selectedSheetName === 'string' ? parsed.selectedSheetName : '',
      autoQueueNewProduction:
        typeof parsed.autoQueueNewProduction === 'boolean' ? parsed.autoQueueNewProduction : true,
      syncedProductionIds: Array.isArray(parsed.syncedProductionIds)
        ? parsed.syncedProductionIds.slice(-1500)
        : [],
      syncHistory: Array.isArray(parsed.syncHistory) ? parsed.syncHistory.slice(0, 30) : [],
      lastSyncedAt: parsed.lastSyncedAt,
      syncStatus: derivedStatus,
      lastSyncError: typeof parsed.lastSyncError === 'string' ? parsed.lastSyncError : undefined
    };

    if (shouldRecoverStaleSyncing) {
      try {
        window.localStorage.setItem(SHEETS_SYNC_STORAGE_KEY, JSON.stringify(result));
      } catch {
        // ignore
      }
    }

    return result;
  } catch {
    staleSyncingClearedOnBoot = true;
    return defaults;
  }
}

export function saveSheetsSyncSettings(next: GoogleSheetsSyncSettings): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const bounded: GoogleSheetsSyncSettings = {
      ...next,
      syncedProductionIds: (next.syncedProductionIds || []).slice(-1500),
      syncHistory: (next.syncHistory || []).slice(0, 30)
    };
    window.localStorage.setItem(SHEETS_SYNC_STORAGE_KEY, JSON.stringify(bounded));
    window.dispatchEvent(new CustomEvent(SHEETS_SYNC_EVENT, { detail: bounded }));
  } catch {
    // ignore storage quota issues
  }
}

export function updateSheetsSyncStatus(
  syncStatus: GoogleSheetsSyncStatus,
  options?: { lastSyncError?: string; lastSyncedAt?: string }
): GoogleSheetsSyncSettings {
  const current = loadSheetsSyncSettings();
  const next: GoogleSheetsSyncSettings = {
    ...current,
    syncStatus,
    lastSyncError:
      syncStatus === 'Error'
        ? options?.lastSyncError || 'Sinkronisasi Google Sheets gagal.'
        : syncStatus === 'Success' || syncStatus === 'Idle'
        ? undefined
        : current.lastSyncError,
    lastSyncedAt: options?.lastSyncedAt ?? current.lastSyncedAt
  };
  saveSheetsSyncSettings(next);
  return next;
}
