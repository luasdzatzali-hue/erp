import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarRange,
  Cylinder,
  Eye,
  FileSpreadsheet,
  FileText,
  Layers
} from 'lucide-react';
import {
  AppState,
  ChangeoverType,
  ProductionLine,
  ProductionStopLog,
  StorageLocation
} from '../../types';
import { calculateStockBalances } from '../../utils/storage';
import { formatIndonesianDate, getCurrentShift, ShiftNumber } from '../../utils/shifts';
import { DashboardLineStatusSnapshot } from '../../utils/firebaseSync';
import { loadSheetsSyncSettings, SHEETS_SYNC_EVENT } from '../../utils/sheetsSyncStore';
import { calculateMultiShiftOee, SixBigLossParetoItem } from '../../utils/oeeEngine';
import { useOptionalErp } from '../../context/ErpContext';
import { ProductionTargetPanel } from '../ProductionTargetPanel';
import { WeeklyPlanVsActualChart } from '../WeeklyPlanVsActualChart';
import { ExecutiveOeeKpiStrip } from '../analytics/ExecutiveOeeKpiStrip';
import { SixBigLossesPareto } from '../analytics/SixBigLossesPareto';
import { MaterialVarianceWatchlist } from '../analytics/MaterialVarianceWatchlist';
import { PlantTelemetryAndStockPanel } from '../analytics/PlantTelemetryAndStockPanel';

interface DashboardViewProps {
  state: AppState;
  onOpenTankModal: () => void;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onTransferStock: (materialId: string, from: StorageLocation, to: StorageLocation, qty: number) => void;
  onProduceCartons?: (
    skuId: string,
    cartonCount: number,
    operatorName?: string,
    notes?: string,
    overrideSelectedHoldingTanks?: Record<string, string>,
    runId?: string,
    lineId?: string,
    lineName?: string
  ) => { success: boolean; message: string };
  onStartSkuProduction?: (
    skuId: string,
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanks?: Record<string, string>,
    lineId?: string,
    plannedCartons?: number,
    shiftOverride?: ShiftNumber
  ) => void;
  onStartMultipleSkus?: (
    skuIds: string[],
    operatorName?: string,
    speedMultiplier?: number,
    selectedHoldingTanksBySku?: Record<string, Record<string, string>>
  ) => void;
  onStartLineBatchRuns?: (
    assignments: {
      lineId: string;
      skuId: string;
      plannedCartons: number;
      shift?: ShiftNumber;
      operatorName?: string;
      speedMultiplier?: number;
      selectedHoldingTanks?: Record<string, string>;
    }[]
  ) => void;
  onCompleteLineRun?: (runIdOrLineId: string, notes?: string) => void;
  onResumeLineRun?: (runIdOrLineId: string) => void;
  onRecordMaterialShortage?: (runIdOrLineId: string, reasonMessage: string) => void;
  onUpdateRunHoldingTank?: (skuId: string, wipId: string, tankId: string, runId?: string) => void;
  onStopSkuProduction?: (stopData: Omit<ProductionStopLog, 'id'>) => void;
  onStopAllSkuProduction?: () => void;
  onTriggerShiftHandover?: () => void;
  onSetRunSpeedMultiplier?: (multiplier: number, runIdOrSkuId?: string) => void;
  onAddProductionLine?: (lineData: Omit<ProductionLine, 'id'>) => void;
  onUpdateProductionLine?: (lineId: string, updates: Partial<ProductionLine>) => void;
  onDeleteProductionLine?: (lineId: string) => void;
  onSetProductionLinesCount?: (count: number) => void;
  onOpenPdfModal?: () => void;
  onChangeSku?: (
    lineId: string,
    newSkuId: string,
    changeoverData: {
      changeoverType: ChangeoverType;
      estimatedMinutes: number;
      operatorName: string;
      notes?: string;
    }
  ) => void;
  liveLineStatus?: DashboardLineStatusSnapshot | null;
  onOpenStationMonitor?: (station: { type: 'line' | 'ck'; id: string }) => void;
  focusedLineId?: string | null;
  onClearFocusedLine?: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  liveLineStatus,
  onOpenTankModal,
  onSwitchTab,
  onTransferStock,
  onProduceCartons,
  onStartSkuProduction,
  onStartMultipleSkus,
  onStartLineBatchRuns,
  onCompleteLineRun,
  onResumeLineRun,
  onRecordMaterialShortage,
  onUpdateRunHoldingTank,
  onStopSkuProduction,
  onStopAllSkuProduction,
  onTriggerShiftHandover,
  onSetRunSpeedMultiplier,
  onAddProductionLine,
  onUpdateProductionLine,
  onDeleteProductionLine,
  onSetProductionLinesCount,
  onOpenPdfModal,
  onChangeSku,
  onOpenStationMonitor,
  focusedLineId,
  onClearFocusedLine,
  showToast
}) => {
  const erp = useOptionalErp();
  const currentLiveShift = getCurrentShift();
  const todayIsoDate = new Date().toISOString().split('T')[0];

  const [shiftScope, setShiftScope] = useState<'ALL' | ShiftNumber>(currentLiveShift.shift);
  const [lineScope, setLineScope] = useState<string>(focusedLineId || 'ALL');
  const [syncedLogIds, setSyncedLogIds] = useState<string[]>(
    () => loadSheetsSyncSettings().syncedProductionIds
  );

  useEffect(() => {
    if (focusedLineId) {
      setLineScope(focusedLineId);
    }
  }, [focusedLineId]);

  useEffect(() => {
    const syncListener = () => {
      setSyncedLogIds(loadSheetsSyncSettings().syncedProductionIds);
    };
    window.addEventListener(SHEETS_SYNC_EVENT, syncListener);
    return () => window.removeEventListener(SHEETS_SYNC_EVENT, syncListener);
  }, []);

  const unsyncedProductionCount = useMemo(() => {
    const syncedSet = new Set(syncedLogIds);
    return (state.transactions.cartonProductions || []).filter(cp => !syncedSet.has(cp.id)).length;
  }, [state.transactions.cartonProductions, syncedLogIds]);

  const isManagement = state.currentUserRole === 'MANAGEMENT';
  const isDaylightTheme = state.theme === 'daylight' || state.theme === 'light';

  const effectiveLines = useMemo<ProductionLine[]>(() => {
    if (state.master.productionLines && state.master.productionLines.length > 0) {
      return state.master.productionLines;
    }
    return [
      { id: 'line_a', code: 'LINE-A', name: 'Line A', description: 'Jalur Produksi Utama A', isActive: true },
      { id: 'line_b', code: 'LINE-B', name: 'Line B', description: 'Jalur Produksi B', isActive: true },
      { id: 'line_c', code: 'LINE-C', name: 'Line C', description: 'Jalur Produksi C', isActive: true },
      { id: 'line_d', code: 'LINE-D', name: 'Line D', description: 'Jalur Produksi D', isActive: true }
    ];
  }, [state.master.productionLines]);

  const printStorageTotals = useMemo(() => {
    const balances = Object.values(calculateStockBalances(state));
    let ck = 0;
    let wineroto = 0;
    balances.forEach(b => {
      ck += b.stockCk;
      wineroto += b.stockWineroto;
    });
    return { ck, wineroto };
  }, [state]);

  const scopedOeeAnalytics = useMemo(() => {
    return calculateMultiShiftOee({
      state,
      dateStr: todayIsoDate,
      shiftScope,
      activeShiftFallback: currentLiveShift.shift,
      lineId: lineScope
    });
  }, [state, todayIsoDate, shiftScope, currentLiveShift.shift, lineScope]);

  const scrollToProductionConsole = () => {
    const el = document.getElementById('production-target-console');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleLogLossAction = (category?: SixBigLossParetoItem) => {
    const allLineRuns =
      state.activeSkuRuns && state.activeSkuRuns.length > 0
        ? state.activeSkuRuns
        : state.activeSkuRun
        ? [state.activeSkuRun]
        : [];

    const matchingRun =
      (lineScope !== 'ALL'
        ? allLineRuns.find(r => r.lineId === lineScope && r.isRunning) ||
          allLineRuns.find(r => r.lineId === lineScope)
        : allLineRuns.find(r => r.isRunning) || allLineRuns[0]) || null;

    const matchingOeeLine =
      scopedOeeAnalytics.lineResults.find(r =>
        lineScope !== 'ALL' ? r.lineId === lineScope : Boolean(r.skuId)
      ) || scopedOeeAnalytics.lineResults[0];

    const fallbackSku = state.master.skus[0];
    const targetSkuId = matchingRun?.skuId || matchingOeeLine?.skuId || fallbackSku?.id;
    const targetSku = state.master.skus.find(s => s.id === targetSkuId) || fallbackSku;

    if (!targetSku || !erp?.openSixBigLossesModal) {
      scrollToProductionConsole();
      showToast(
        category
          ? `Pilih SKU pada konsol line untuk mencatat ${category.label}.`
          : 'Pilih SKU pada Konsol Line Produksi untuk mencatat Six Big Losses.',
        true
      );
      return;
    }

    const resolvedLineId =
      matchingRun?.lineId ||
      (lineScope !== 'ALL' ? lineScope : matchingOeeLine?.lineId || effectiveLines[0]?.id);
    const resolvedLineName =
      matchingRun?.lineName ||
      effectiveLines.find(l => l.id === resolvedLineId)?.name ||
      matchingOeeLine?.lineName;

    erp.openSixBigLossesModal({
      lineId: resolvedLineId,
      lineName: resolvedLineName,
      skuId: targetSku.id,
      skuName: targetSku.name,
      skuCode: targetSku.code,
      startedAt: matchingRun?.startedAt,
      cartonsProducedDuringRun:
        matchingRun?.cartonsProducedTotal ?? matchingOeeLine?.totalOutputCartons ?? 0,
      onConfirmStop: stopData => {
        if (onStopSkuProduction) {
          onStopSkuProduction(stopData);
        } else {
          erp.handleStopSkuProduction(stopData);
        }
      }
    });
  };

  return (
    <div className="space-y-4 max-w-[1440px] mx-auto">
      {/* Printable Header Banner (Only visible in Print view) */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-3">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              PRODTRACK MANUFACTURING EXECUTION SYSTEM
            </h1>
            <p className="text-sm font-semibold text-slate-800">
              Laporan Stok Opname Material Aktual &amp; Status Pabrik (24 Jam Penuh)
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">{formatIndonesianDate()}</p>
            <p>
              Shift Aktif: {currentLiveShift.name} ({currentLiveShift.timeRange})
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-300 text-xs">
          <div>
            Total Area CK: <strong>{printStorageTotals.ck.toFixed(2)} kg</strong>
          </div>
          <div>
            Total WINEROTO: <strong>{printStorageTotals.wineroto.toFixed(2)} kg</strong>
          </div>
          <div>
            Tangki Liquid: <strong>{state.tank.level.toFixed(2)} kg</strong> (
            {state.tank.temp.toFixed(1)}°C)
          </div>
        </div>
      </div>

      {/* Odoo MES Management Read-Only Banner */}
      {isManagement && (
        <div className="bg-surface border border-tint-indigo-border p-3 sm:p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm no-print">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-tint-indigo text-ink-indigo border border-tint-indigo-border flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-ink-primary">
                Odoo MRP Portal: Mode Management (Pantau Saja)
              </p>
              <p className="text-[11px] text-ink-secondary mt-0.5">
                Memantau OEE real-time, produksi berjalan, saldo stok material di gudang (CK &amp; WINEROTO), serta telemetri tangki WIP. Akses mutasi transaksi dibatasi.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-center text-[11px] font-mono font-bold text-ink-indigo whitespace-nowrap">
            READ-ONLY VIEW
          </span>
        </div>
      )}

      {/* Control Room Header Command Bar */}
      <div className="bg-surface/90 backdrop-blur-md border border-border-subtle px-4 py-3.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-sm no-print">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-tint-cyan border border-tint-cyan-border text-ink-cyan flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-ink-secondary tabular-nums">
              <span className="text-accent-primary font-semibold">
                Manufacturing Control Room
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatIndonesianDate()}</span>
              <span aria-hidden="true">·</span>
              <span className="text-ink-amber font-semibold">
                {currentLiveShift.name} ({currentLiveShift.timeRange})
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-ink-primary tracking-tight mt-0.5">
              Industry 4.0 OEE &amp; Variance Command Center
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchTab('weekly-planning')}
            className="px-3 py-2 bg-canvas/85 hover:bg-elevated text-ink-emerald border border-tint-emerald-border hover:border-ink-emerald/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <CalendarRange className="w-3.5 h-3.5 text-ink-emerald" />
            <span>Tahap 02: Planning Mingguan</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('sheets-sync')}
            className="px-3 py-2 bg-canvas/85 hover:bg-elevated text-ink-emerald border border-tint-emerald-border hover:border-ink-emerald/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-ink-emerald" />
            <span>
              Sync Sheets{unsyncedProductionCount > 0 ? ` (${unsyncedProductionCount})` : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('tank-monitoring')}
            className="px-3 py-2 bg-canvas/85 hover:bg-elevated text-ink-cyan border border-tint-cyan-border hover:border-accent-primary rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Cylinder className="w-3.5 h-3.5 text-accent-primary" />
            <span>Tangki WIP ({state.master.tanks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchTab('pemakaian')}
            className="px-3 py-2 bg-canvas/85 hover:bg-elevated text-ink-amber border border-tint-amber-border hover:border-ink-amber/60 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-ink-amber" />
            <span>Gantt &amp; Batch WIP</span>
          </button>
          {onOpenPdfModal && (
            <button
              type="button"
              onClick={onOpenPdfModal}
              className="px-3.5 py-2 bg-accent-primary hover:bg-accent-primary-hover text-accent-primary-foreground rounded-lg text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Laporan Shift PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Executive OEE KPI Strip (Overall OEE, Availability, Performance, Quality) */}
      <ExecutiveOeeKpiStrip
        analytics={scopedOeeAnalytics}
        currentLiveShift={currentLiveShift.shift}
        shiftScope={shiftScope}
        onChangeShiftScope={setShiftScope}
        lineScope={lineScope}
        onChangeLineScope={setLineScope}
        lines={effectiveLines}
      />

      {/* 2. Industry 4.0 Analytics Grid: Pareto Six Big Losses & Real-Time Material Variance Watchlist */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-7">
          <SixBigLossesPareto
            analytics={scopedOeeAnalytics}
            isDaylightTheme={isDaylightTheme}
            onLogLossAction={handleLogLossAction}
            onOpenShiftSummary={() => onSwitchTab('shift-summary')}
          />
        </div>
        <div className="xl:col-span-5">
          <MaterialVarianceWatchlist
            state={state}
            dateStr={todayIsoDate}
            shiftScope={shiftScope}
            lineScope={lineScope}
            onJumpToPemakaian={() => onSwitchTab('pemakaian')}
          />
        </div>
      </div>

      {/* 3. Recharts Weekly Production Plan vs Actual & Per-SKU Variance Visualization */}
      <WeeklyPlanVsActualChart
        state={state}
        onScrollToWeeklyPlan={() => onSwitchTab('weekly-planning')}
        onOpenSheetsSync={() => onSwitchTab('sheets-sync')}
      />

      {/* 4. Production Target Panel: 24 Jam Penuh (3 Shift × 8 Jam Kerja) & Line Produksi */}
      <div id="production-target-console">
        <ProductionTargetPanel
          state={state}
          liveLineStatus={liveLineStatus}
          onSwitchTab={onSwitchTab}
          onProduceCartons={onProduceCartons}
          onStartSkuProduction={onStartSkuProduction}
          onStartMultipleSkus={onStartMultipleSkus}
          onStartLineBatchRuns={onStartLineBatchRuns}
          onCompleteLineRun={onCompleteLineRun}
          onResumeLineRun={onResumeLineRun}
          onRecordMaterialShortage={onRecordMaterialShortage}
          onUpdateRunHoldingTank={onUpdateRunHoldingTank}
          onStopSkuProduction={onStopSkuProduction}
          onStopAllSkuProduction={onStopAllSkuProduction}
          onTriggerShiftHandover={onTriggerShiftHandover}
          onSetRunSpeedMultiplier={onSetRunSpeedMultiplier}
          onAddProductionLine={onAddProductionLine}
          onUpdateProductionLine={onUpdateProductionLine}
          onDeleteProductionLine={onDeleteProductionLine}
          onSetProductionLinesCount={onSetProductionLinesCount}
          onChangeSku={onChangeSku}
          onOpenStationMonitor={onOpenStationMonitor}
          focusedLineId={focusedLineId}
          onClearFocusedLine={onClearFocusedLine}
          showToast={showToast}
        />
      </div>

      {/* 5. Plant Telemetry Deck, Live Line Status Matrix & Stock Material Breakdown */}
      <PlantTelemetryAndStockPanel
        state={state}
        isManagement={isManagement}
        effectiveLines={effectiveLines}
        focusedLineId={focusedLineId}
        onOpenTankModal={onOpenTankModal}
        onSwitchTab={onSwitchTab}
        onTransferStock={onTransferStock}
        onOpenPdfModal={onOpenPdfModal}
        onOpenStationMonitor={onOpenStationMonitor}
        onScrollToProductionConsole={scrollToProductionConsole}
        showToast={showToast}
      />
    </div>
  );
};
