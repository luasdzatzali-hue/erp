import {
  DEFAULT_PRODUCTION_SPREADSHEET_ID,
  DEFAULT_PRODUCTION_SPREADSHEET_URL
} from './googleWorkspace';

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
}

const SHEETS_SYNC_STORAGE_KEY = 'prodtrack_gsheets_sync_v1';
export const SHEETS_SYNC_EVENT = 'prodtrack-sheets-sync-updated';

export function getDefaultSheetsSyncSettings(): GoogleSheetsSyncSettings {
  return {
    spreadsheetUrl: DEFAULT_PRODUCTION_SPREADSHEET_URL,
    spreadsheetId: DEFAULT_PRODUCTION_SPREADSHEET_ID,
    selectedSheetName: '',
    autoQueueNewProduction: true,
    syncedProductionIds: [],
    syncHistory: []
  };
}

export function loadSheetsSyncSettings(): GoogleSheetsSyncSettings {
  const defaults = getDefaultSheetsSyncSettings();
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaults;
  }
  try {
    const raw = window.localStorage.getItem(SHEETS_SYNC_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      spreadsheetUrl: parsed.spreadsheetUrl || defaults.spreadsheetUrl,
      spreadsheetId: parsed.spreadsheetId || defaults.spreadsheetId,
      selectedSheetName: typeof parsed.selectedSheetName === 'string' ? parsed.selectedSheetName : '',
      autoQueueNewProduction:
        typeof parsed.autoQueueNewProduction === 'boolean' ? parsed.autoQueueNewProduction : true,
      syncedProductionIds: Array.isArray(parsed.syncedProductionIds)
        ? parsed.syncedProductionIds.slice(-1500)
        : [],
      syncHistory: Array.isArray(parsed.syncHistory) ? parsed.syncHistory.slice(0, 30) : [],
      lastSyncedAt: parsed.lastSyncedAt
    };
  } catch {
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
