import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  Plus,
  History,
  Table2,
  LogOut,
  Check,
  RotateCcw,
  ArrowLeft,
  Layers,
  Zap
} from 'lucide-react';
import { AppState, CartonProductionLog } from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import {
  appendSpreadsheetRows,
  clearWorkspaceDriveToken,
  createSpreadsheetTab,
  DEFAULT_PRODUCTION_SPREADSHEET_ID,
  DEFAULT_PRODUCTION_SPREADSHEET_URL,
  extractSpreadsheetIdFromInput,
  fetchSpreadsheetMetadata,
  getAccessToken,
  getDriveUserEmail,
  googleSignIn,
  googleSignInRedirect,
  isDriveAuthError,
  isDrivePopupBlockedError,
  readSpreadsheetValues,
  SpreadsheetMetadata,
  updateSpreadsheetRange
} from '../../utils/googleWorkspace';
import { buildSkuPlanVsActualSummary } from '../../utils/weeklyPlanComparison';
import {
  GoogleSheetsSyncSettings,
  loadSheetsSyncSettings,
  saveSheetsSyncSettings,
  SHEETS_SYNC_EVENT,
  updateSheetsSyncStatus
} from '../../utils/sheetsSyncStore';

interface GoogleSheetsSyncViewProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

type PendingSheetMutation =
  | {
      kind: 'APPEND_LOGS';
      title: string;
      description: string;
      sheetTitle: string;
      includeHeader: boolean;
      rows: (string | number)[][];
      logIds: string[];
    }
  | {
      kind: 'WRITE_PLAN_SUMMARY';
      title: string;
      description: string;
      sheetTitle: string;
      rows: (string | number)[][];
    }
  | {
      kind: 'CREATE_TAB';
      title: string;
      description: string;
      newTabName: string;
      rows: (string | number)[][];
    }
  | {
      kind: 'FORCE_SYNC_STATS';
      title: string;
      description: string;
      sheetTitle: string;
      rows: (string | number)[][];
    };

export const GoogleSheetsSyncView: React.FC<GoogleSheetsSyncViewProps> = ({
  state,
  onSwitchTab,
  showToast
}) => {
  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const isAdmin = state.currentUserRole === 'ADMINISTRATOR';

  const [settings, setSettings] = useState<GoogleSheetsSyncSettings>(() => loadSheetsSyncSettings());
  const [urlInput, setUrlInput] = useState<string>(settings.spreadsheetUrl);

  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showRedirectFallback, setShowRedirectFallback] = useState(false);

  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  const [syncDatasetMode, setSyncDatasetMode] = useState<'PRODUCTION_LOGS' | 'PLAN_VS_ACTUAL'>(
    'PRODUCTION_LOGS'
  );
  const [logSendScope, setLogSendScope] = useState<'UNSYNCED_ONLY' | 'ALL_LOGS'>('UNSYNCED_ONLY');
  const [newTabInput, setNewTabInput] = useState('');
  const [isCreatingTabOpen, setIsCreatingTabOpen] = useState(false);

  const [pendingMutation, setPendingMutation] = useState<PendingSheetMutation | null>(null);
  const [isExecutingSync, setIsExecutingSync] = useState(false);

  // Keep local settings synced with storage updates
  useEffect(() => {
    const onUpdated = (ev: Event) => {
      const custom = ev as CustomEvent<GoogleSheetsSyncSettings>;
      if (custom.detail) {
        setSettings(custom.detail);
      } else {
        setSettings(loadSheetsSyncSettings());
      }
    };
    window.addEventListener(SHEETS_SYNC_EVENT, onUpdated);
    return () => window.removeEventListener(SHEETS_SYNC_EVENT, onUpdated);
  }, []);

  const updateSettings = useCallback((updater: (prev: GoogleSheetsSyncSettings) => GoogleSheetsSyncSettings) => {
    setSettings(prev => {
      const next = updater(prev);
      saveSheetsSyncSettings(next);
      return next;
    });
  }, []);

  const loadPreviewForTab = useCallback(
    async (token: string, spreadsheetId: string, sheetTitle: string) => {
      if (!token || !spreadsheetId || !sheetTitle) return;
      setIsLoadingPreview(true);
      try {
        const rows = await readSpreadsheetValues(token, spreadsheetId, sheetTitle, 'A1:P25');
        setPreviewRows(rows);
        updateSettings(prev =>
          prev.syncStatus === 'Error'
            ? { ...prev, syncStatus: prev.lastSyncedAt ? 'Success' : 'Idle', lastSyncError: undefined }
            : prev
        );
      } catch (err: any) {
        const msg = err?.message || 'Gagal memuat pratinjau sheet.';
        setSheetsError(msg);
        updateSheetsSyncStatus('Error', { lastSyncError: msg });
        if (isDriveAuthError(err)) {
          clearWorkspaceDriveToken();
          setGoogleToken(null);
          setGoogleEmail(null);
        }
      } finally {
        setIsLoadingPreview(false);
      }
    },
    [updateSettings]
  );

  const loadMetadataAndPreview = useCallback(
    async (token: string, spreadsheetId: string, preferredSheet?: string) => {
      if (!token || !spreadsheetId) return;
      setIsLoadingMeta(true);
      setSheetsError(null);
      try {
        const meta = await fetchSpreadsheetMetadata(token, spreadsheetId);
        setMetadata(meta);

        const existingTabTitles = meta.sheets.map(s => s.title);
        const resolvedSheet =
          (preferredSheet && existingTabTitles.includes(preferredSheet) && preferredSheet) ||
          (settings.selectedSheetName &&
            existingTabTitles.includes(settings.selectedSheetName) &&
            settings.selectedSheetName) ||
          meta.sheets[0]?.title ||
          '';

        if (resolvedSheet && resolvedSheet !== settings.selectedSheetName) {
          updateSettings(prev => ({ ...prev, selectedSheetName: resolvedSheet }));
        }

        if (resolvedSheet) {
          await loadPreviewForTab(token, spreadsheetId, resolvedSheet);
        } else {
          setPreviewRows([]);
          updateSettings(prev =>
            prev.syncStatus === 'Error'
              ? { ...prev, syncStatus: prev.lastSyncedAt ? 'Success' : 'Idle', lastSyncError: undefined }
              : prev
          );
        }
      } catch (err: any) {
        const msg = err?.message || 'Gagal membaca metadata spreadsheet.';
        setSheetsError(msg);
        updateSheetsSyncStatus('Error', { lastSyncError: msg });
        setMetadata(null);
        setPreviewRows([]);
        if (isDriveAuthError(err)) {
          clearWorkspaceDriveToken();
          setGoogleToken(null);
          setGoogleEmail(null);
        }
      } finally {
        setIsLoadingMeta(false);
      }
    },
    [loadPreviewForTab, settings.selectedSheetName, updateSettings]
  );

  // Hydrate in-memory Google token on mount
  useEffect(() => {
    let mounted = true;
    getAccessToken().then(tok => {
      if (!mounted) return;
      if (tok) {
        setGoogleToken(tok);
        setGoogleEmail(getDriveUserEmail());
        loadMetadataAndPreview(tok, settings.spreadsheetId);
      }
    });
    return () => {
      mounted = false;
    };
  }, [loadMetadataAndPreview, settings.spreadsheetId]);

  const handleGoogleConnect = async () => {
    setIsConnecting(true);
    setSheetsError(null);
    setShowRedirectFallback(false);
    try {
      const res = await googleSignIn(true);
      if (res) {
        setGoogleToken(res.accessToken);
        setGoogleEmail(res.user.email || getDriveUserEmail());
        showToast(`Terhubung ke Google Sheets sebagai ${res.user.email || 'Pengguna Google'}`);
        await loadMetadataAndPreview(res.accessToken, settings.spreadsheetId);
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menghubungkan akun Google.';
      setSheetsError(msg);
      updateSheetsSyncStatus('Error', { lastSyncError: msg });
      if (isDrivePopupBlockedError(err) || msg.toLowerCase().includes('popup')) {
        setShowRedirectFallback(true);
      }
      showToast(msg, true);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleGoogleRedirect = async () => {
    setIsConnecting(true);
    setSheetsError(null);
    try {
      await googleSignInRedirect();
    } catch (err: any) {
      const msg = err?.message || 'Gagal memulai login redirect Google.';
      setSheetsError(msg);
      updateSheetsSyncStatus('Error', { lastSyncError: msg });
      showToast(msg, true);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    clearWorkspaceDriveToken();
    setGoogleToken(null);
    setGoogleEmail(null);
    setMetadata(null);
    setPreviewRows([]);
    setSheetsError(null);
    updateSettings(prev => ({
      ...prev,
      syncStatus: 'Idle',
      lastSyncError: undefined
    }));
    showToast('Koneksi Google Sheets diputus.');
  };

  const handleApplySpreadsheetLink = async () => {
    const parsedId = extractSpreadsheetIdFromInput(urlInput);
    if (!parsedId) {
      showToast('URL atau ID Google Spreadsheet tidak valid.', true);
      return;
    }
    const cleanUrl = urlInput.includes('docs.google.com/spreadsheets')
      ? urlInput.trim()
      : `https://docs.google.com/spreadsheets/d/${parsedId}/edit`;

    updateSettings(prev => ({
      ...prev,
      spreadsheetId: parsedId,
      spreadsheetUrl: cleanUrl,
      selectedSheetName: ''
    }));
    setUrlInput(cleanUrl);
    showToast('Link Google Spreadsheet diperbarui.');

    if (googleToken) {
      await loadMetadataAndPreview(googleToken, parsedId);
    }
  };

  const handleResetDefaultLink = async () => {
    setUrlInput(DEFAULT_PRODUCTION_SPREADSHEET_URL);
    updateSettings(prev => ({
      ...prev,
      spreadsheetId: DEFAULT_PRODUCTION_SPREADSHEET_ID,
      spreadsheetUrl: DEFAULT_PRODUCTION_SPREADSHEET_URL,
      selectedSheetName: ''
    }));
    showToast('Link dikembalikan ke Spreadsheet Produksi utama.');
    if (googleToken) {
      await loadMetadataAndPreview(googleToken, DEFAULT_PRODUCTION_SPREADSHEET_ID);
    }
  };

  const handleSelectSheetTab = async (tabTitle: string) => {
    updateSettings(prev => ({ ...prev, selectedSheetName: tabTitle }));
    if (googleToken && settings.spreadsheetId) {
      await loadPreviewForTab(googleToken, settings.spreadsheetId, tabTitle);
    }
  };

  // Compute plan comparison & production log rows
  const planComparison = useMemo(
    () => buildSkuPlanVsActualSummary(state, { shiftScope: 'ALL', actualWindow: 'ALL_LOGS' }),
    [state]
  );

  const planLookupBySkuId = useMemo(() => {
    const map = new Map<string, { planned: number; actual: number; variance: number; pct: number }>();
    planComparison.rows.forEach(r => {
      if (r.skuId) {
        map.set(r.skuId, {
          planned: r.plannedCartons,
          actual: r.actualCartons,
          variance: r.varianceCartons,
          pct: r.achievementPct
        });
      }
    });
    return map;
  }, [planComparison.rows]);

  const allProductionLogs = useMemo(() => {
    return [...(state.transactions.cartonProductions || [])].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [state.transactions.cartonProductions]);

  const syncedIdSet = useMemo(
    () => new Set(settings.syncedProductionIds || []),
    [settings.syncedProductionIds]
  );

  const unsyncedProductionLogs = useMemo(
    () => allProductionLogs.filter(cp => !syncedIdSet.has(cp.id)),
    [allProductionLogs, syncedIdSet]
  );

  const logsToSync: CartonProductionLog[] =
    logSendScope === 'UNSYNCED_ONLY' ? unsyncedProductionLogs : allProductionLogs;

  const PRODUCTION_LOG_HEADERS = [
    'ID Log',
    'Waktu Catat',
    'Tanggal',
    'Shift',
    'Line',
    'Kode SKU',
    'Nama SKU',
    'Target Plan (Ktn)',
    'Hasil Aktual (Ktn)',
    'Varians Plan (Ktn)',
    'Capaian (%)',
    'Operator',
    'Konsumsi WIP (kg)',
    'Catatan'
  ];

  const PLAN_SUMMARY_HEADERS = [
    'Week Plan',
    'Periode',
    'Line',
    'Kode SKU',
    'Nama SKU',
    'Target Plan (Ktn)',
    'Aktual (Ktn)',
    'Varians (Ktn)',
    'Capaian (%)',
    'Status',
    'Terakhir Disinkronkan'
  ];

  const formatProductionLogRow = (cp: CartonProductionLog): (string | number)[] => {
    const dt = new Date(cp.timestamp);
    const tanggal = isNaN(dt.getTime()) ? (cp.timestamp || '').slice(0, 10) : dt.toLocaleDateString('id-ID');
    const waktu = isNaN(dt.getTime()) ? cp.timestamp : dt.toLocaleString('id-ID');
    const planStats = planLookupBySkuId.get(cp.skuId);
    const wipKg = (cp.tankDeductions || []).reduce((s, d) => s + (Number(d.kgDeducted) || 0), 0);

    return [
      cp.id,
      waktu,
      tanggal,
      cp.shift ? `Shift ${cp.shift}` : '-',
      cp.lineName || cp.lineId || '-',
      cp.skuCode || '-',
      cp.skuName,
      planStats ? planStats.planned : 0,
      Math.round(cp.cartonsProduced),
      planStats ? planStats.variance : Math.round(cp.cartonsProduced),
      planStats ? `${planStats.pct.toFixed(1)}%` : '-',
      cp.operatorName || '-',
      Number(wipKg.toFixed(2)),
      cp.notes || '-'
    ];
  };

  const buildPlanSummaryRows = (): (string | number)[][] => {
    const syncStamp = new Date().toLocaleString('id-ID');
    const weekLabel = planComparison.plan?.weekLabel || 'Tanpa Plan';
    const periode = planComparison.plan
      ? `${planComparison.plan.periodStart} s/d ${planComparison.plan.periodEnd}`
      : '-';

    const dataRows = planComparison.rows.map(r => [
      weekLabel,
      periode,
      r.lines,
      r.skuCode,
      r.skuName,
      r.plannedCartons,
      r.actualCartons,
      r.varianceCartons,
      `${r.achievementPct.toFixed(1)}%`,
      r.status === 'TERCAPAI'
        ? 'Tercapai'
        : r.status === 'PROSES'
        ? 'Berjalan'
        : r.status === 'UNPLANNED'
        ? 'Di Luar Plan'
        : 'Belum Mulai',
      syncStamp
    ]);

    return [PLAN_SUMMARY_HEADERS, ...dataRows];
  };

  const handleRequestSyncLogs = () => {
    if (isManagement) {
      showToast('Mode Management tidak memiliki izin mengubah spreadsheet.', true);
      return;
    }
    if (!googleToken) {
      showToast('Silakan login Google terlebih dahulu untuk menghubungkan ke Google Sheets.', true);
      return;
    }
    const targetTab = settings.selectedSheetName || metadata?.sheets[0]?.title;
    if (!targetTab) {
      showToast('Pilih atau buat tab sheet tujuan terlebih dahulu.', true);
      return;
    }
    if (logsToSync.length === 0) {
      showToast('Tidak ada data hasil produksi baru untuk diinput.', true);
      return;
    }

    // Check whether existing sheet already has our header row
    const firstRow = previewRows[0] || [];
    const hasHeaderAlready =
      firstRow.length > 0 &&
      (firstRow.includes('ID Log') || firstRow.some(c => c.toLowerCase().includes('nama sku')));
    const includeHeader = !hasHeaderAlready;

    // Sort chronological ascending when appending to spreadsheet
    const orderedLogs = [...logsToSync].reverse();
    const formattedRows = orderedLogs.map(formatProductionLogRow);
    const finalRows = includeHeader ? [PRODUCTION_LOG_HEADERS, ...formattedRows] : formattedRows;

    setPendingMutation({
      kind: 'APPEND_LOGS',
      title: 'Konfirmasi Input Hasil Produksi ke Google Sheets',
      description: `Akan menambahkan ${orderedLogs.length} baris hasil produksi${
        includeHeader ? ' (beserta 1 baris header tabel)' : ''
      } ke tab "${targetTab}" pada spreadsheet "${metadata?.title || settings.spreadsheetId}".`,
      sheetTitle: targetTab,
      includeHeader,
      rows: finalRows,
      logIds: orderedLogs.map(l => l.id)
    });
  };

  const handleRequestSyncPlanSummary = () => {
    if (isManagement) {
      showToast('Mode Management tidak memiliki izin mengubah spreadsheet.', true);
      return;
    }
    if (!googleToken) {
      showToast('Silakan login Google terlebih dahulu.', true);
      return;
    }
    const targetTab = settings.selectedSheetName || metadata?.sheets[0]?.title;
    if (!targetTab) {
      showToast('Pilih atau buat tab sheet tujuan terlebih dahulu.', true);
      return;
    }
    if (planComparison.rows.length === 0) {
      showToast('Belum ada data Weekly Plan maupun realisasi SKU untuk dikirim.', true);
      return;
    }

    const rows = buildPlanSummaryRows();
    setPendingMutation({
      kind: 'WRITE_PLAN_SUMMARY',
      title: 'Konfirmasi Perbarui Rekap Plan vs Aktual di Google Sheets',
      description: `Akan menulis ulang rentang A1:K${rows.length} pada tab "${targetTab}" dengan rekap progres Weekly Plan vs Aktual (${planComparison.rows.length} SKU). Data lama pada sel A1:K${rows.length} di tab tersebut akan diperbarui.`,
      sheetTitle: targetTab,
      rows
    });
  };

  const handleRequestCreateTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (isManagement || !googleToken) return;
    const clean = newTabInput.trim();
    if (!clean) {
      showToast('Masukkan nama tab sheet baru.', true);
      return;
    }
    if (metadata?.sheets.some(s => s.title.toLowerCase() === clean.toLowerCase())) {
      showToast(`Tab "${clean}" sudah ada pada spreadsheet ini.`, true);
      return;
    }

    setPendingMutation({
      kind: 'CREATE_TAB',
      title: 'Konfirmasi Tambah Tab Sheet Baru',
      description: `Akan membuat tab sheet baru bernama "${clean}" di dalam spreadsheet "${
        metadata?.title || settings.spreadsheetId
      }".`,
      newTabName: clean,
      rows: [[`Tab Baru: ${clean}`]]
    });
  };

  const buildForceSyncProductionStatsRows = (): (string | number)[][] => {
    const now = new Date();
    const syncStamp = now.toLocaleString('id-ID');
    const todayIso = now.toISOString().slice(0, 10);
    const currentShift = getCurrentShift(now);
    const adminLabel = state.currentSession?.name || googleEmail || 'Administrator';

    const todayCartonsTotal = Math.round(
      allProductionLogs
        .filter(cp => (cp.timestamp || '').startsWith(todayIso))
        .reduce((sum, cp) => sum + (Number(cp.cartonsProduced) || 0), 0)
    );

    const activeRunsList =
      state.activeSkuRuns && state.activeSkuRuns.length > 0
        ? state.activeSkuRuns
        : state.activeSkuRun
        ? [state.activeSkuRun]
        : [];
    const runningLinesCount = activeRunsList.filter(r => r.isRunning).length;

    const weekLabel = planComparison.plan?.weekLabel || 'Tanpa Plan';
    const periode = planComparison.plan
      ? `${planComparison.plan.periodStart} s/d ${planComparison.plan.periodEnd}`
      : '-';

    const rows: (string | number)[][] = [
      [
        'RINGKASAN STATUS PRODUKSI TERKINI (FORCE SYNC ADMIN)',
        'Waktu Sync',
        syncStamp,
        'Oleh Admin',
        adminLabel,
        'Shift Aktif',
        `Shift ${currentShift.shift} (${currentShift.timeRange})`,
        'Week Plan',
        weekLabel,
        'Periode',
        periode
      ],
      [
        'Total Log Produksi',
        'Log Belum Sync',
        'Output Hari Ini (Ktn)',
        'Line Aktif / Total',
        'Total Target Plan (Ktn)',
        'Total Aktual Plan (Ktn)',
        'Net Varians (Ktn)',
        'Capaian Keseluruhan (%)',
        'SKU Tercapai',
        'Level Tank WIP (kg)',
        'Suhu Tank (°C)'
      ],
      [
        allProductionLogs.length,
        unsyncedProductionLogs.length,
        todayCartonsTotal,
        `${runningLinesCount} / ${activeRunsList.length}`,
        planComparison.totalPlanned,
        planComparison.totalActual,
        planComparison.netVariance,
        `${planComparison.overallPct.toFixed(1)}%`,
        `${planComparison.completedSkuCount} / ${planComparison.totalActiveSkuCount}`,
        Number((state.tank?.level || 0).toFixed(1)),
        Number((state.tank?.temp || 0).toFixed(1))
      ]
    ];

    if (activeRunsList.length > 0) {
      rows.push([
        'STATUS LINE PRODUKSI AKTIF',
        'Line',
        'Kode SKU',
        'Nama SKU',
        'Shift',
        'Target Shift (Ktn)',
        'Aktual Run (Ktn)',
        'Status Line',
        'Operator',
        'Mulai',
        'Update Terakhir'
      ]);
      activeRunsList.forEach(run => {
        const statusLabel = run.isRunning
          ? 'BERJALAN'
          : run.completionStatus === 'COMPLETED'
          ? 'SELESAI'
          : run.completionStatus === 'STOPPED_SBL'
          ? 'STOP (SBL)'
          : run.completionStatus === 'STOPPED_SHORTAGE'
          ? 'STOP (WIP HABIS)'
          : run.completionStatus === 'SHIFT_HANDOVER'
          ? 'SERAH TERIMA SHIFT'
          : 'STANDBY';
        rows.push([
          'LINE RUN',
          run.lineName || run.lineId || '-',
          run.skuCode || '-',
          run.skuName,
          `Shift ${run.shift}`,
          run.plannedCartons || 0,
          Math.round(run.cartonsProducedTotal || 0),
          statusLabel,
          run.operatorName || '-',
          run.startedAt ? new Date(run.startedAt).toLocaleString('id-ID') : '-',
          run.lastDeductionTime ? new Date(run.lastDeductionTime).toLocaleString('id-ID') : syncStamp
        ]);
      });
    }

    rows.push(PLAN_SUMMARY_HEADERS);
    if (planComparison.rows.length > 0) {
      planComparison.rows.forEach(r => {
        rows.push([
          weekLabel,
          periode,
          r.lines,
          r.skuCode,
          r.skuName,
          r.plannedCartons,
          r.actualCartons,
          r.varianceCartons,
          `${r.achievementPct.toFixed(1)}%`,
          r.status === 'TERCAPAI'
            ? 'Tercapai'
            : r.status === 'PROSES'
            ? 'Berjalan'
            : r.status === 'UNPLANNED'
            ? 'Di Luar Plan'
            : 'Belum Mulai',
          syncStamp
        ]);
      });
    } else {
      rows.push([weekLabel, periode, '-', '-', 'Belum ada item plan/produksi', 0, 0, 0, '0.0%', 'Belum Mulai', syncStamp]);
    }

    return rows;
  };

  const handleForceSyncNow = () => {
    if (!isAdmin) {
      showToast('Fitur Force Sync Now hanya tersedia untuk Administrator.', true);
      return;
    }
    if (!googleToken) {
      showToast('Silakan login Google terlebih dahulu untuk menjalankan Force Sync Now.', true);
      return;
    }
    const targetTab = settings.selectedSheetName || metadata?.sheets[0]?.title;
    if (!targetTab) {
      showToast('Pilih atau buat tab sheet tujuan terlebih dahulu.', true);
      return;
    }

    const rows = buildForceSyncProductionStatsRows();
    setPendingMutation({
      kind: 'FORCE_SYNC_STATS',
      title: 'Konfirmasi Force Sync Now ke Google Sheets',
      description: `Administrator akan memperbarui statistik produksi terkini (ringkasan shift & tank, status line aktif, serta progres ${planComparison.rows.length} SKU Plan vs Aktual) ke rentang A1:K${rows.length} pada tab "${targetTab}".`,
      sheetTitle: targetTab,
      rows
    });
  };

  const executeConfirmedMutation = async () => {
    if (!pendingMutation || !googleToken) return;
    setIsExecutingSync(true);
    setSheetsError(null);
    updateSheetsSyncStatus('Syncing');
    try {
      if (pendingMutation.kind === 'APPEND_LOGS') {
        const res = await appendSpreadsheetRows(
          googleToken,
          settings.spreadsheetId,
          pendingMutation.sheetTitle,
          pendingMutation.rows
        );
        const nowIso = new Date().toISOString();
        updateSettings(prev => {
          const mergedIds = Array.from(
            new Set([...(prev.syncedProductionIds || []), ...pendingMutation.logIds])
          );
          return {
            ...prev,
            syncedProductionIds: mergedIds,
            lastSyncedAt: nowIso,
            syncStatus: 'Success',
            lastSyncError: undefined,
            syncHistory: [
              {
                id: `gs_${Date.now()}`,
                timestamp: nowIso,
                spreadsheetId: prev.spreadsheetId,
                spreadsheetTitle: metadata?.title || 'Google Spreadsheet',
                sheetName: pendingMutation.sheetTitle,
                mode: 'PRODUCTION_LOGS',
                rowsWritten: pendingMutation.logIds.length,
                updatedRange: res.updatedRange,
                triggeredBy: googleEmail || state.currentSession?.name || 'User'
              },
              ...(prev.syncHistory || [])
            ]
          };
        });
        showToast(
          `Berhasil menginput ${pendingMutation.logIds.length} hasil produksi ke tab "${pendingMutation.sheetTitle}"!`
        );
        setPendingMutation(null);
        await loadPreviewForTab(googleToken, settings.spreadsheetId, pendingMutation.sheetTitle);
      } else if (pendingMutation.kind === 'WRITE_PLAN_SUMMARY') {
        const lastRowNum = pendingMutation.rows.length;
        const res = await updateSpreadsheetRange(
          googleToken,
          settings.spreadsheetId,
          pendingMutation.sheetTitle,
          `A1:K${lastRowNum}`,
          pendingMutation.rows
        );
        const nowIso = new Date().toISOString();
        updateSettings(prev => ({
          ...prev,
          lastSyncedAt: nowIso,
          syncStatus: 'Success',
          lastSyncError: undefined,
          syncHistory: [
            {
              id: `gs_${Date.now()}`,
              timestamp: nowIso,
              spreadsheetId: prev.spreadsheetId,
              spreadsheetTitle: metadata?.title || 'Google Spreadsheet',
              sheetName: pendingMutation.sheetTitle,
              mode: 'PLAN_VS_ACTUAL',
              rowsWritten: Math.max(0, pendingMutation.rows.length - 1),
              updatedRange: res.updatedRange,
              triggeredBy: googleEmail || state.currentSession?.name || 'User'
            },
            ...(prev.syncHistory || [])
          ]
        }));
        showToast(`Rekap Plan vs Aktual berhasil diperbarui di tab "${pendingMutation.sheetTitle}".`);
        setPendingMutation(null);
        await loadPreviewForTab(googleToken, settings.spreadsheetId, pendingMutation.sheetTitle);
      } else if (pendingMutation.kind === 'CREATE_TAB') {
        const created = await createSpreadsheetTab(
          googleToken,
          settings.spreadsheetId,
          pendingMutation.newTabName
        );
        setNewTabInput('');
        setIsCreatingTabOpen(false);
        updateSettings(prev => ({
          ...prev,
          selectedSheetName: created.title,
          syncStatus: prev.lastSyncedAt ? 'Success' : 'Idle',
          lastSyncError: undefined
        }));
        showToast(`Tab baru "${created.title}" berhasil dibuat.`);
        setPendingMutation(null);
        await loadMetadataAndPreview(googleToken, settings.spreadsheetId, created.title);
      } else if (pendingMutation.kind === 'FORCE_SYNC_STATS') {
        const lastRowNum = pendingMutation.rows.length;
        const res = await updateSpreadsheetRange(
          googleToken,
          settings.spreadsheetId,
          pendingMutation.sheetTitle,
          `A1:K${lastRowNum}`,
          pendingMutation.rows
        );
        const nowIso = new Date().toISOString();
        const actor = googleEmail || state.currentSession?.name || 'Administrator';
        updateSettings(prev => ({
          ...prev,
          lastSyncedAt: nowIso,
          syncStatus: 'Success',
          lastSyncError: undefined,
          syncHistory: [
            {
              id: `gs_${Date.now()}`,
              timestamp: nowIso,
              spreadsheetId: prev.spreadsheetId,
              spreadsheetTitle: metadata?.title || 'Google Spreadsheet',
              sheetName: pendingMutation.sheetTitle,
              mode: 'FORCE_SYNC_STATS',
              rowsWritten: pendingMutation.rows.length,
              updatedRange: res.updatedRange,
              triggeredBy: `${actor} (Force Sync Now)`
            },
            ...(prev.syncHistory || [])
          ]
        }));
        showToast(
          `Force Sync Now berhasil memperbarui statistik produksi terkini ke tab "${pendingMutation.sheetTitle}".`
        );
        setPendingMutation(null);
        await loadPreviewForTab(googleToken, settings.spreadsheetId, pendingMutation.sheetTitle);
      }
    } catch (err: any) {
      const msg = err?.message || 'Gagal menyinkronkan data ke Google Sheets.';
      setSheetsError(msg);
      updateSheetsSyncStatus('Error', { lastSyncError: msg });
      showToast(msg, true);
      if (isDriveAuthError(err)) {
        clearWorkspaceDriveToken();
        setGoogleToken(null);
        setGoogleEmail(null);
      }
    } finally {
      setIsExecutingSync(false);
    }
  };

  const handleMarkAllSynced = () => {
    const allIds = allProductionLogs.map(l => l.id);
    updateSettings(prev => ({
      ...prev,
      syncedProductionIds: Array.from(new Set([...(prev.syncedProductionIds || []), ...allIds])),
      lastSyncedAt: prev.lastSyncedAt || new Date().toISOString(),
      syncStatus: 'Success',
      lastSyncError: undefined
    }));
    showToast('Seluruh log produksi saat ini ditandai sudah tersinkron.');
  };

  const handleResetSyncedFlags = () => {
    updateSettings(prev => ({
      ...prev,
      syncedProductionIds: [],
      syncStatus: 'Idle',
      lastSyncError: undefined
    }));
    showToast('Status sinkronisasi log direset. Semua log siap dikirim ulang.');
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-4">
      {/* Top Panel Header */}
      <div className="bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/35 text-emerald-400 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
              <span className="text-emerald-400 font-semibold">Google Sheets Integration</span>
              <span aria-hidden="true">·</span>
              <span>Spreadsheet ID: {settings.spreadsheetId.slice(0, 12)}…</span>
              {settings.lastSyncedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Sync terakhir: {new Date(settings.lastSyncedAt).toLocaleString('id-ID')}</span>
                </>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight mt-0.5">
              Panel Integrasi Otomatis Hasil Produksi ke Google Spreadsheet
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchTab('dashboard')}
            className="px-3 py-2 bg-[#06090f]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Dashboard</span>
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleForceSyncNow}
              disabled={isExecutingSync || isConnecting}
              title="Perbarui paksa seluruh statistik produksi terkini ke Google Spreadsheet (khusus Administrator)"
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition active:scale-95"
            >
              {isExecutingSync ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              <span>Force Sync Now</span>
            </button>
          )}
          <a
            href={settings.spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka Google Spreadsheet</span>
          </a>
        </div>
      </div>

      {/* Error Banner */}
      {sheetsError && (
        <div className="p-3.5 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-bold text-rose-300">Kendala Koneksi Google Sheets</p>
            <p className="leading-relaxed">{sheetsError}</p>
          </div>
        </div>
      )}

      {/* Row 1: Google Connection + Spreadsheet Link Target */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Google Account Sign-In Card */}
        <div className="lg:col-span-5 bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-white">1. Koneksi Akun Google Sheets</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Masuk dengan akun Google yang memiliki akses Editor ke spreadsheet tujuan agar aplikasi dapat membaca daftar tab sheet dan menginput hasil produksi.
            </p>
          </div>

          {!googleToken ? (
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Official Google Sign-In Styled Button */}
                <button
                  type="button"
                  onClick={handleGoogleConnect}
                  disabled={isConnecting}
                  className="inline-flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-100 text-[#1f1f1f] border border-[#747775]/40 rounded-lg text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                    </svg>
                  )}
                  <span>Sign in with Google</span>
                </button>

                {showRedirectFallback && (
                  <button
                    type="button"
                    onClick={handleGoogleRedirect}
                    disabled={isConnecting}
                    className="px-3.5 py-2.5 bg-[#06090f] hover:bg-slate-800 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Hubungkan via Redirect
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Pastikan kotak izin Google Sheets dicentang pada jendela login Google.
              </p>
            </div>
          ) : (
            <div className="bg-[#06090f]/80 border border-emerald-500/35 rounded-lg p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>Terhubung ke Google Sheets</span>
                </p>
                <p className="text-xs font-mono text-white truncate mt-0.5">
                  {googleEmail || 'Akun Google Terverifikasi'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Putus</span>
              </button>
            </div>
          )}
        </div>

        {/* Spreadsheet Target & Sheet Selector Card */}
        <div className="lg:col-span-7 bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">2. Target Spreadsheet &amp; Pemilihan Tab Sheet</h2>
            <button
              type="button"
              onClick={handleResetDefaultLink}
              className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Link Utama</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Tempel link Google Spreadsheet (https://docs.google.com/spreadsheets/d/...)"
              className="flex-1 bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleApplySpreadsheetLink}
              className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0"
            >
              Terapkan Link
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Judul Spreadsheet Terdeteksi
              </label>
              <div className="bg-[#06090f]/80 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-semibold flex items-center justify-between gap-2 min-h-[36px]">
                <span className="truncate">
                  {isLoadingMeta
                    ? 'Memuat metadata...'
                    : metadata?.title || (googleToken ? 'Tidak dapat membaca metadata' : 'Login Google untuk membaca')}
                </span>
                {googleToken && (
                  <button
                    type="button"
                    onClick={() => loadMetadataAndPreview(googleToken, settings.spreadsheetId)}
                    disabled={isLoadingMeta}
                    title="Muat ulang daftar tab sheet"
                    className="text-cyan-400 hover:text-cyan-300 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMeta ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Tab Sheet Tujuan
                </label>
                {googleToken && !isManagement && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingTabOpen(prev => !prev)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Tab Baru</span>
                  </button>
                )}
              </div>

              <select
                value={settings.selectedSheetName}
                onChange={e => handleSelectSheetTab(e.target.value)}
                disabled={!metadata || metadata.sheets.length === 0}
                className="w-full bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              >
                {!metadata || metadata.sheets.length === 0 ? (
                  <option value="">
                    {googleToken ? 'Belum ada tab terbaca' : 'Hubungkan akun Google terlebih dahulu'}
                  </option>
                ) : (
                  metadata.sheets.map(tab => (
                    <option key={tab.sheetId} value={tab.title}>
                      {tab.title}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {isCreatingTabOpen && googleToken && !isManagement && (
            <form
              onSubmit={handleRequestCreateTab}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-800/80"
            >
              <input
                type="text"
                value={newTabInput}
                onChange={e => setNewTabInput(e.target.value)}
                placeholder="Nama tab baru (contoh: Hasil_Produksi_Nov)"
                className="flex-1 bg-[#06090f]/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold whitespace-nowrap shrink-0"
              >
                Buat Tab Sheet
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Row 2: Automated Production Queue & Sync Controls */}
      <div className="bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              3. Sinkronisasi &amp; Input Hasil Produksi ke Spreadsheet
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Setiap hasil produksi karton yang tercatat otomatis masuk ke antrean sinkronisasi bebas duplikasi dan siap dikirim ke tab sheet terpilih dengan konfirmasi pengguna.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center p-0.5 bg-[#06090f]/90 border border-slate-800 rounded-lg">
              <button
                type="button"
                onClick={() => setSyncDatasetMode('PRODUCTION_LOGS')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                  syncDatasetMode === 'PRODUCTION_LOGS'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Log Hasil Produksi ({unsyncedProductionLogs.length} Baru)
              </button>
              <button
                type="button"
                onClick={() => setSyncDatasetMode('PLAN_VS_ACTUAL')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                  syncDatasetMode === 'PLAN_VS_ACTUAL'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Rekap Plan vs Aktual ({planComparison.rows.length} SKU)
              </button>
            </div>
          </div>
        </div>

        {syncDatasetMode === 'PRODUCTION_LOGS' ? (
          <div className="space-y-3">
            {/* Queue Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-400">Total Log Tercatat:</span>{' '}
                  <strong className="text-white">{allProductionLogs.length}</strong>
                </div>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <div>
                  <span className="text-slate-400">Belum Diinput ke Sheets:</span>{' '}
                  <strong className={unsyncedProductionLogs.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    {unsyncedProductionLogs.length} baris
                  </strong>
                </div>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer font-sans text-slate-300">
                  <input
                    type="checkbox"
                    checked={settings.autoQueueNewProduction}
                    onChange={e =>
                      updateSettings(prev => ({ ...prev, autoQueueNewProduction: e.target.checked }))
                    }
                    className="rounded border-slate-600 text-emerald-500 focus:ring-0"
                  />
                  <span>Pantau antrean otomatis saat produksi berjalan</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <select
                  value={logSendScope}
                  onChange={e => setLogSendScope(e.target.value as 'UNSYNCED_ONLY' | 'ALL_LOGS')}
                  className="bg-[#0c121d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                >
                  <option value="UNSYNCED_ONLY">
                    Hanya Log Baru ({unsyncedProductionLogs.length})
                  </option>
                  <option value="ALL_LOGS">Semua Log Produksi ({allProductionLogs.length})</option>
                </select>

                {!isManagement && unsyncedProductionLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllSynced}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Tandai Sudah Sync
                  </button>
                )}
                {!isManagement && settings.syncedProductionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleResetSyncedFlags}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Reset Penanda
                  </button>
                )}

                {!isManagement && (
                  <button
                    type="button"
                    onClick={handleRequestSyncLogs}
                    disabled={!googleToken || logsToSync.length === 0 || !settings.selectedSheetName}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Input ke Google Sheets ({logsToSync.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Production Logs Ready to Sync Table */}
            {logsToSync.length === 0 ? (
              <div className="py-8 px-4 text-center bg-[#06090f]/60 border border-slate-800/70 rounded-lg space-y-1.5">
                <Check className="w-7 h-7 text-emerald-400 mx-auto" />
                <p className="text-xs font-bold text-white">
                  {allProductionLogs.length === 0
                    ? 'Belum ada catatan hasil produksi karton'
                    : 'Semua catatan hasil produksi sudah disinkronkan ke Google Sheets'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {allProductionLogs.length === 0
                    ? 'Jalankan produksi di modul Manufacturing atau catat output karton agar data otomatis masuk ke antrean.'
                    : 'Setiap pencatatan output karton baru akan langsung muncul di antrean ini.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-800/90 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-[11px] text-slate-300 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">Waktu</th>
                      <th className="py-2 px-3">Shift / Line</th>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3 text-right">Target Plan</th>
                      <th className="py-2 px-3 text-right">Hasil Aktual</th>
                      <th className="py-2 px-3 text-right">Varians Plan</th>
                      <th className="py-2 px-3">Operator</th>
                      <th className="py-2 px-3">Status Sync</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {logsToSync.slice(0, 60).map(cp => {
                      const planStats = planLookupBySkuId.get(cp.skuId);
                      const isSynced = syncedIdSet.has(cp.id);
                      return (
                        <tr key={cp.id} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-300 tabular-nums whitespace-nowrap">
                            {new Date(cp.timestamp).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                            S{cp.shift || '-'} · {cp.lineName || '-'}
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-semibold text-white">{cp.skuName}</div>
                            <div className="text-[10px] font-mono text-slate-400">{cp.skuCode || '-'}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-400">
                            {planStats ? planStats.planned.toLocaleString('id-ID') : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                            {Math.round(cp.cartonsProduced).toLocaleString('id-ID')} ktn
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono tabular-nums font-semibold ${
                              !planStats
                                ? 'text-slate-400'
                                : planStats.variance >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {planStats
                              ? planStats.variance > 0
                                ? `+${planStats.variance.toLocaleString('id-ID')}`
                                : planStats.variance.toLocaleString('id-ID')
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-300">{cp.operatorName || '-'}</td>
                          <td className="py-2 px-3 text-[11px] font-semibold">
                            {isSynced ? (
                              <span className="text-emerald-400">Tersinkron</span>
                            ) : (
                              <span className="text-amber-400">Siap Input</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-3">
              <div className="text-xs text-slate-300">
                <span className="font-bold text-white">
                  Rekapitulasi {planComparison.plan?.weekLabel || 'Planning Mingguan'} vs Aktual per SKU
                </span>
                <span className="text-slate-400 ml-2 font-mono tabular-nums">
                  ({planComparison.rows.length} SKU · Target {planComparison.totalPlanned.toLocaleString('id-ID')} ktn · Aktual {planComparison.totalActual.toLocaleString('id-ID')} ktn)
                </span>
              </div>
              {!isManagement && (
                <button
                  type="button"
                  onClick={handleRequestSyncPlanSummary}
                  disabled={!googleToken || planComparison.rows.length === 0 || !settings.selectedSheetName}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tulis Rekap ke Google Sheets</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto border border-slate-800/90 rounded-lg max-h-72 overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-900 text-[11px] text-slate-300 border-b border-slate-800">
                  <tr>
                    <th className="py-2 px-3">Line</th>
                    <th className="py-2 px-3">Kode &amp; Nama SKU</th>
                    <th className="py-2 px-3 text-right">Target Plan (Ktn)</th>
                    <th className="py-2 px-3 text-right">Aktual (Ktn)</th>
                    <th className="py-2 px-3 text-right">Varians (Ktn)</th>
                    <th className="py-2 px-3 text-right">Capaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {planComparison.rows.map(r => (
                    <tr key={r.key} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono text-slate-300">{r.lines}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-white">{r.skuName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{r.skuCode}</div>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-400">
                        {r.plannedCartons.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                        {r.actualCartons.toLocaleString('id-ID')}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${
                          r.varianceCartons >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {r.varianceCartons > 0
                          ? `+${r.varianceCartons.toLocaleString('id-ID')}`
                          : r.varianceCartons.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200">
                        {r.achievementPct.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Row 3: Live Sheet Preview & Sync Execution History */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Live Sheet Preview */}
        <div className="xl:col-span-7 bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">
                Pratinjau Isi Sheet: {settings.selectedSheetName || '-'}
              </h3>
            </div>
            {googleToken && settings.selectedSheetName && (
              <button
                type="button"
                onClick={() =>
                  loadPreviewForTab(googleToken, settings.spreadsheetId, settings.selectedSheetName)
                }
                disabled={isLoadingPreview}
                className="px-2.5 py-1 bg-[#06090f] hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-md text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingPreview ? 'animate-spin' : ''}`} />
                <span>Refresh Isi Sheet</span>
              </button>
            )}
          </div>

          {!googleToken ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Hubungkan akun Google di atas untuk melihat isi live dari Google Spreadsheet.
            </div>
          ) : isLoadingPreview ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Membaca baris dari Google Sheets...</span>
            </div>
          ) : previewRows.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Tab "{settings.selectedSheetName}" masih kosong. Header tabel akan dibuat otomatis saat pengiriman data pertama.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800/90 rounded-lg max-h-64 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <tbody>
                  {previewRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={
                        rIdx === 0
                          ? 'bg-slate-900 font-bold text-cyan-300 border-b border-slate-700'
                          : 'border-b border-slate-800/60 text-slate-300'
                      }
                    >
                      <td className="py-1.5 px-2 text-slate-500 border-r border-slate-800 w-8 text-right">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="py-1.5 px-2.5 whitespace-nowrap max-w-[200px] truncate">
                          {cell || <span className="text-slate-600">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sync Audit History */}
        <div className="xl:col-span-5 bg-[#0c121d]/80 backdrop-blur-md border border-slate-800/90 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Riwayat Sinkronisasi Spreadsheet</h3>
          </div>

          {settings.syncHistory.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Belum ada aktivitas pengiriman data ke Google Sheets pada perangkat ini.
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {settings.syncHistory.map(item => (
                <div
                  key={item.id}
                  className="bg-[#06090f]/80 border border-slate-800/80 rounded-lg p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-bold ${
                        item.mode === 'FORCE_SYNC_STATS' ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {item.mode === 'PRODUCTION_LOGS'
                        ? `+${item.rowsWritten} Log Hasil Produksi`
                        : item.mode === 'FORCE_SYNC_STATS'
                        ? `Force Sync Stats (${item.rowsWritten} Baris)`
                        : `Rekap Plan vs Aktual (${item.rowsWritten} SKU)`}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                      {new Date(item.timestamp).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 truncate">
                    Tab: {item.sheetName} · Range: {item.updatedRange}
                  </div>
                  <div className="text-[10px] text-slate-400">Oleh: {item.triggeredBy}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Explicit Confirmation Modal Before Any Google Sheets Write/Mutate Operation */}
      {pendingMutation && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c121d] border border-slate-700 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  {pendingMutation.title}
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  {pendingMutation.description}
                </p>
              </div>
            </div>

            <div className="bg-[#06090f] border border-slate-800 rounded-lg p-3 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Spreadsheet:</span>
                <span className="text-white font-semibold truncate">
                  {metadata?.title || settings.spreadsheetId}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Tab Sheet Tujuan:</span>
                <span className="text-emerald-400 font-semibold">
                  {pendingMutation.kind === 'CREATE_TAB'
                    ? pendingMutation.newTabName
                    : pendingMutation.sheetTitle}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Jumlah Baris Diproses:</span>
                <span className="text-cyan-400 font-semibold tabular-nums">
                  {pendingMutation.rows.length} baris
                </span>
              </div>
            </div>

            {/* Preview of first 5 rows */}
            <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-44 overflow-y-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <tbody>
                  {pendingMutation.rows.slice(0, 6).map((row, i) => (
                    <tr
                      key={i}
                      className={
                        i === 0
                          ? 'bg-slate-900 text-cyan-300 font-bold border-b border-slate-700'
                          : 'border-b border-slate-800/60 text-slate-300'
                      }
                    >
                      {row.slice(0, 8).map((val, j) => (
                        <td key={j} className="py-1.5 px-2 whitespace-nowrap max-w-[160px] truncate">
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingMutation(null)}
                disabled={isExecutingSync}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={executeConfirmedMutation}
                disabled={isExecutingSync}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {isExecutingSync ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {isExecutingSync ? 'Mengirim ke Spreadsheet...' : 'Konfirmasi & Kirim ke Google Sheets'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
