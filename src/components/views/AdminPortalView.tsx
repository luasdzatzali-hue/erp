import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarRange,
  CheckCircle2,
  Cpu,
  Cylinder,
  Database,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Layers,
  Printer,
  RotateCcw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  Truck,
  Users
} from 'lucide-react';
import { AppState, AuditLogModule, ShiftNumber, UserRole } from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import { calculateStockBalances } from '../../utils/storage';
import { getActiveWeeklyPlan } from '../../utils/weeklyPlanComparison';
import { calculateShiftAllLinesOee } from '../../utils/oeeEngine';

interface AdminPortalViewProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onOpenPdfModal: () => void;
  onOpenTankModal: () => void;
  onOpenUserManagement: () => void;
  onOpenStockAdjustment?: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

type PortalSubTab = 'WORKFLOW' | 'AUDIT_ANOMALY';
type AuditFilterModule = 'ALL' | AuditLogModule | 'ANOMALY' | 'SECURITY';

interface NormalizedAuditRow {
  id: string;
  timestamp: string;
  dateStr: string;
  userName: string;
  userEmail?: string;
  role: UserRole | 'SYSTEM';
  module: AuditLogModule | 'ANOMALY' | 'SECURITY';
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'OVERRIDE' | 'ANOMALY' | 'SECURITY';
  targetId: string;
  targetLabel: string;
  previousSummary?: string;
  newSummary?: string;
  reasonNote?: string;
  isCriticalAnomaly?: boolean;
}

function formatAuditValueSummary(val: unknown): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'string') return val.trim() || undefined;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  try {
    const json = JSON.stringify(val);
    return json.length > 140 ? `${json.slice(0, 137)}...` : json;
  } catch {
    return String(val);
  }
}

function formatModuleLabel(mod: NormalizedAuditRow['module']): string {
  switch (mod) {
    case 'MASTER_BOM':
      return 'Master BOM';
    case 'STOCK_ADJUSTMENT':
      return 'Stok & Saldo';
    case 'OEE_DOWNTIME':
      return 'Downtime OEE';
    case 'SHIFT_CORRECTION':
      return 'Koreksi Shift';
    case 'PRODUCTION_USAGE':
      return 'Pemakaian';
    case 'SHIFT_HANDOVER':
      return 'Handover Shift';
    case 'ANOMALY':
      return 'Anomali OEE/BOM';
    case 'SECURITY':
      return 'Keamanan';
    default:
      return 'Sistem';
  }
}

function formatTimestampDisplay(ts: string): string {
  if (!ts) return '-';
  if (ts.length >= 19 && ts.includes('T')) {
    return `${ts.slice(0, 10)} ${ts.slice(11, 19)}`;
  }
  return ts.slice(0, 19);
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  state,
  onSwitchTab,
  onOpenPdfModal,
  onOpenUserManagement,
  onOpenStockAdjustment
}) => {
  const currentShift = getCurrentShift();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [activeSubTab, setActiveSubTab] = useState<PortalSubTab>('WORKFLOW');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');
  const [filterModule, setFilterModule] = useState<AuditFilterModule>('ALL');

  const balances = calculateStockBalances(state);
  const activePlan = getActiveWeeklyPlan(state);

  const totalStockKg = Object.values(balances).reduce(
    (acc, curr) => acc + curr.totalActual,
    0
  );

  const pendingRequests = state.transactions.requests.filter(r => r.status !== 'Received');
  const receiptsCount = state.transactions.receipts.length;
  const activeBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  );
  const completedBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SELESAI'
  );

  const totalTankCapacity = state.master.tanks.reduce((acc, curr) => acc + curr.capacityKg, 0);
  const totalTankCurrentKg = state.master.tanks.reduce((acc, curr) => acc + curr.currentLevelKg, 0);
  const tankFillPct = totalTankCapacity > 0 ? (totalTankCurrentKg / totalTankCapacity) * 100 : 0;

  const activeRuns = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
    r => r.isRunning
  );
  const cartonCount = (state.transactions.cartonProductions || []).reduce(
    (acc, curr) => acc + (curr.cartonsProduced || 0),
    0
  );

  const normalizedAuditRows = useMemo<NormalizedAuditRow[]>(() => {
    const rows: NormalizedAuditRow[] = [];

    // 1. Immutable Operational Audit Logs
    for (const entry of state.auditLogs || []) {
      rows.push({
        id: entry.id,
        timestamp: entry.timestamp,
        dateStr: (entry.timestamp || '').slice(0, 10),
        userName: entry.userName || 'System',
        userEmail: entry.userEmail,
        role: entry.role,
        module: entry.module,
        action: entry.action,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel || entry.targetId,
        previousSummary: formatAuditValueSummary(entry.previousValue),
        newSummary: formatAuditValueSummary(entry.newValue),
        reasonNote: entry.reasonNote
      });
    }

    // 2. Security & Auth Logs
    for (const sec of state.securityLogs || []) {
      rows.push({
        id: `sec_${sec.id}`,
        timestamp: sec.timestamp,
        dateStr: (sec.timestamp || '').slice(0, 10),
        userName: sec.userEmail || 'User',
        userEmail: sec.userEmail,
        role: sec.role,
        module: 'SECURITY',
        action: 'SECURITY',
        targetId: sec.eventType,
        targetLabel: sec.eventType.replace(/_/g, ' '),
        newSummary: sec.ipOrDevice,
        reasonNote: sec.notes,
        isCriticalAnomaly: sec.eventType === 'LOGIN_FAILED'
      });
    }

    // 3. Live Runtime Anomalies (Cycle Time > 100% & BOM Material Variance > ±2%)
    const anomalyEvalDate = filterDate || todayStr;
    ([1, 2, 3] as ShiftNumber[]).forEach(shiftNum => {
      const shiftSummary = calculateShiftAllLinesOee(state, anomalyEvalDate, shiftNum);
      for (const lr of shiftSummary.lineResults) {
        if (lr.performanceDetail.isCycleTimeAnomaly) {
          rows.push({
            id: `anom_ct_${anomalyEvalDate}_S${shiftNum}_${lr.lineId}`,
            timestamp: `${anomalyEvalDate}T00:00:00.000Z`,
            dateStr: anomalyEvalDate,
            userName: 'OEE Engine Telemetry',
            role: 'SYSTEM',
            module: 'ANOMALY',
            action: 'ANOMALY',
            targetId: lr.lineId,
            targetLabel: `Anomali Cycle Time >100% · ${lr.lineName} (Shift ${shiftNum})`,
            previousSummary: `Target: ${lr.targetPerHour} ktn/jam`,
            newSummary: `Perf Mentah: ${lr.performanceDetail.rawPerformancePct}%`,
            reasonNote:
              lr.performanceDetail.anomalyReason ||
              'Kecepatan aktual melebihi Ideal Cycle Time SKU. Periksa setting standar SKU.',
            isCriticalAnomaly: true
          });
        }

        if (Math.abs(lr.materialVariancePct) > 2 && lr.qualityDetail.materialVariance.standardBomMaterialKg > 0) {
          rows.push({
            id: `anom_var_${anomalyEvalDate}_S${shiftNum}_${lr.lineId}`,
            timestamp: `${anomalyEvalDate}T00:00:00.000Z`,
            dateStr: anomalyEvalDate,
            userName: 'BOM Reconcile Guard',
            role: 'SYSTEM',
            module: 'ANOMALY',
            action: 'ANOMALY',
            targetId: lr.lineId,
            targetLabel: `Anomali Material Variance · ${lr.lineName} (Shift ${shiftNum})`,
            previousSummary: `Standar BOM: ${lr.qualityDetail.materialVariance.standardBomMaterialKg} kg`,
            newSummary: `Aktual: ${lr.qualityDetail.materialVariance.totalActualMaterialKg} kg (${lr.materialVariancePct > 0 ? '+' : ''}${lr.materialVariancePct}%)`,
            reasonNote: 'Selisih pemakaian material aktual melebihi batas toleransi ±2% BOM.',
            isCriticalAnomaly: Math.abs(lr.materialVariancePct) > 5
          });
        }
      }
    });

    rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));
    return rows;
  }, [state, filterDate, todayStr]);

  const filteredAuditRows = useMemo(() => {
    const userNeedle = filterUser.trim().toLowerCase();
    return normalizedAuditRows.filter(row => {
      if (filterDate && row.dateStr !== filterDate) return false;
      if (filterModule !== 'ALL' && row.module !== filterModule) return false;
      if (userNeedle) {
        const hay = [
          row.userName,
          row.userEmail || '',
          row.targetLabel,
          row.targetId,
          row.reasonNote || ''
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(userNeedle)) return false;
      }
      return true;
    });
  }, [normalizedAuditRows, filterDate, filterUser, filterModule]);

  const auditSummary = useMemo(() => {
    const total = normalizedAuditRows.length;
    const correctionsAndOverrides = normalizedAuditRows.filter(
      r =>
        r.action === 'OVERRIDE' ||
        r.action === 'DELETE' ||
        r.module === 'SHIFT_CORRECTION' ||
        r.module === 'OEE_DOWNTIME' ||
        r.module === 'STOCK_ADJUSTMENT'
    ).length;
    const anomalies = normalizedAuditRows.filter(r => r.module === 'ANOMALY').length;
    const security = normalizedAuditRows.filter(r => r.module === 'SECURITY').length;
    return { total, correctionsAndOverrides, anomalies, security };
  }, [normalizedAuditRows]);

  const workflowCards = [
    {
      step: '01',
      tab: 'master' as AppState['currentTab'],
      title: 'Konfigurasi Master BOM',
      subtitle: 'Setup Material, WIP, Resep, SKU, Mesin & Tangki',
      icon: Database,
      accentText: 'text-ink-amber',
      buttonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
      cta: 'Atur Master BOM',
      ready: state.master.skus.length > 0 && state.master.materials.length > 0,
      metrics: [
        { label: 'Master SKU', value: `${state.master.skus.length} Produk` },
        { label: 'WIP & Resep', value: `${state.master.wips.length} WIP / ${state.master.recipes?.length || 0} Resep` },
        { label: 'Material', value: `${state.master.materials.length} Bahan` },
        { label: 'Mesin & Tangki', value: `${state.master.machines.length} Mesin · ${state.master.tanks.length} Tangki` }
      ]
    },
    {
      step: '02',
      tab: 'weekly-planning' as AppState['currentTab'],
      title: 'Penentuan Planning Mingguan',
      subtitle: 'Tetapkan target karton per SKU & shift sebagai acuan order',
      icon: CalendarRange,
      accentText: 'text-ink-emerald',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      cta: 'Atur Planning Mingguan',
      ready: Boolean(activePlan && activePlan.items.length > 0),
      metrics: [
        { label: 'Plan Aktif', value: activePlan ? activePlan.weekLabel : 'Belum diatur' },
        { label: 'Periode', value: activePlan ? `${activePlan.periodStart} - ${activePlan.periodEnd}` : '-' },
        { label: 'Item Terjadwal', value: `${activePlan?.items.length || 0} SKU` },
        { label: 'Total Rencana', value: `${(state.weeklyPlannings || []).length} Dokumen` }
      ]
    },
    {
      step: '03',
      tab: 'permintaan' as AppState['currentTab'],
      title: 'Permintaan Material',
      subtitle: 'Kalkulasi kebutuhan BOM + allowance & cetak slip order',
      icon: FileText,
      accentText: 'text-ink-sky',
      buttonClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
      cta: 'Buat Permintaan',
      ready: state.transactions.requests.length > 0,
      metrics: [
        { label: 'Order Menunggu', value: `${pendingRequests.length} Slip` },
        { label: 'Total Permintaan', value: `${state.transactions.requests.length} Transaksi` },
        { label: 'SOP Pengajuan', value: 'Shift 1 (07:01-15:00)' },
        { label: 'Sumber', value: 'GDRM & Formulasi' }
      ]
    },
    {
      step: '04',
      tab: 'penerimaan' as AppState['currentTab'],
      title: 'Kedatangan & Penerimaan Fisik',
      subtitle: 'Timbang fisik zak/lot, koreksi berat & input saldo gudang',
      icon: Truck,
      accentText: 'text-ink-emerald',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      cta: 'Catat Penerimaan',
      ready: receiptsCount > 0,
      metrics: [
        { label: 'Kedatangan Tercatat', value: `${receiptsCount} Lot` },
        { label: 'Total Stok Gudang', value: `${totalStockKg.toFixed(1)} kg` },
        { label: 'Order Pending', value: `${pendingRequests.length} Siap Terima` },
        { label: 'SOP Terima', value: 'Shift 1 & Shift 2' }
      ]
    },
    {
      step: '05',
      tab: 'pemakaian' as AppState['currentTab'],
      title: 'Pembuatan Work Order WIP',
      subtitle: 'Eksekusi batch resep mesin dengan pemotongan pallet FIFO',
      icon: Layers,
      accentText: 'text-ink-indigo',
      buttonClass: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      cta: 'Buka Work Order WIP',
      ready: activeBatches.length > 0 || completedBatches.length > 0,
      metrics: [
        { label: 'Batch Berjalan', value: `${activeBatches.length} Proses` },
        { label: 'Batch Selesai', value: `${completedBatches.length} Batch` },
        { label: 'Mesin Batching', value: `${state.master.machines.length} Unit` },
        { label: 'Kapasitas', value: 'Maks 1 Batch/Mesin' }
      ]
    },
    {
      step: '06',
      tab: 'tank-monitoring' as AppState['currentTab'],
      title: 'Transfer WIP ke Storage',
      subtitle: 'Pantau volume tangki & transfer Storage Tank ⇄ Holding Tank',
      icon: Cylinder,
      accentText: 'text-brand',
      buttonClass: 'bg-cyan-600 hover:bg-cyan-500 text-white',
      cta: 'Kelola Storage & Tangki',
      ready: totalTankCurrentKg > 0,
      metrics: [
        { label: 'Total Tangki WIP', value: `${state.master.tanks.length} Tangki` },
        { label: 'Volume Terisi', value: `${totalTankCurrentKg.toFixed(0)} kg (${tankFillPct.toFixed(0)}%)` },
        { label: 'Tangki Utama', value: `${state.tank.level.toFixed(1)} kg` },
        { label: 'Suhu Sensor', value: `${state.tank.temp.toFixed(1)}°C` }
      ]
    },
    {
      step: '07',
      tab: 'dashboard' as AppState['currentTab'],
      title: 'Manufacturing',
      subtitle: 'Jalankan lini produksi karton, kontrol OEE, SBL & output akhir',
      icon: Cpu,
      accentText: 'text-ink-emerald',
      buttonClass: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      cta: 'Buka Control Room Manufacturing',
      ready: activeRuns.length > 0 || cartonCount > 0,
      metrics: [
        { label: 'Lini Aktif', value: `${activeRuns.length} Lini Jalan` },
        { label: 'Total Output', value: `${cartonCount.toLocaleString('id-ID')} Karton` },
        { label: 'Shift Terkini', value: `Shift ${currentShift.shift}` },
        { label: 'Monitoring', value: 'Plan vs Aktual' }
      ]
    }
  ];

  return (
    <div className="max-w-[1440px] mx-auto space-y-4 text-xs pb-6">
      {/* Top Cockpit Header */}
      <div className="bg-surface border border-border-subtle p-4 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 rounded-xl bg-tint-amber border border-tint-amber-border text-ink-amber shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-ink-secondary">
              <span className="text-ink-amber font-semibold">Portal Administrator</span>
              <span aria-hidden="true">·</span>
              <span>{currentShift.name} ({currentShift.timeRange})</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{state.master.machines.length} Mesin / {state.master.tanks.length} Tangki</span>
            </div>
            <h1 className="font-extrabold text-sm sm:text-base text-ink-primary tracking-tight mt-0.5">
              {activeSubTab === 'WORKFLOW'
                ? 'Pusat Alur Kerja Operasional Pabrik (7 Tahap Berurutan)'
                : 'Audit Trail & Log Anomali Operasional (Immutable Governance)'}
            </h1>
            <p className="text-[11px] text-ink-secondary mt-0.5">
              {activeSubTab === 'WORKFLOW'
                ? 'Ikuti urutan langkah 01 sampai 07 dari persiapan Master BOM hingga eksekusi Manufacturing di lini produksi.'
                : 'Rekam jejak perubahan Master BOM, penyesuaian stok, koreksi shift/OEE, anomali kecepatan & variance material.'}
            </p>
          </div>
        </div>

        {/* Utility Shortcuts */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchTab('sheets-sync')}
            className="px-3 py-2 bg-canvas hover:bg-elevated border border-border-strong text-ink-emerald rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-ink-emerald" />
            <span>Sync Google Sheets</span>
          </button>
          {onOpenStockAdjustment && (
            <button
              type="button"
              onClick={onOpenStockAdjustment}
              className="px-3 py-2 bg-canvas hover:bg-elevated border border-border-strong text-ink-amber rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
            >
              <Scale className="w-3.5 h-3.5 text-ink-amber" />
              <span>Adjust Saldo Awal</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenUserManagement}
            className="px-3 py-2 bg-canvas hover:bg-elevated border border-border-strong text-brand rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
          >
            <Users className="w-3.5 h-3.5 text-brand" />
            <span>Pengguna ({state.registeredOperators.length + state.registeredManagement.length})</span>
          </button>
          <button
            type="button"
            onClick={onOpenPdfModal}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Laporan Shift PDF</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface border border-border-subtle p-1.5 rounded-xl">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveSubTab('WORKFLOW')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition ${
              activeSubTab === 'WORKFLOW'
                ? 'bg-accent-primary text-accent-primary-foreground'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Alur Kerja (7 Tahap)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('AUDIT_ANOMALY')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition ${
              activeSubTab === 'AUDIT_ANOMALY'
                ? 'bg-amber-600 text-white'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-elevated'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail &amp; Log Anomali</span>
            <span className="font-mono tabular-nums px-1.5 py-0.5 rounded bg-black/20 text-[10px]">
              {normalizedAuditRows.length}
            </span>
          </button>
        </div>

        {activeSubTab === 'AUDIT_ANOMALY' && (
          <div className="flex items-center gap-3 px-2 text-[11px] font-mono text-ink-secondary tabular-nums">
            <span>
              Koreksi/Override: <strong className="text-ink-amber">{auditSummary.correctionsAndOverrides}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Anomali: <strong className="text-ink-rose">{auditSummary.anomalies}</strong>
            </span>
          </div>
        )}
      </div>

      {activeSubTab === 'WORKFLOW' ? (
        /* Sequential 7-Step Operational Workflow Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {workflowCards.map((card, idx) => {
            const Icon = card.icon;
            const isFinalStep = idx === workflowCards.length - 1;
            return (
              <div
                key={card.tab}
                className={`bg-surface border border-border-subtle hover:border-cyan-500/50 p-4 rounded-xl flex flex-col justify-between gap-3 transition ${
                  isFinalStep ? 'md:col-span-2 xl:col-span-2' : ''
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-border-subtle">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-canvas border border-border-subtle flex items-center justify-center shrink-0">
                        <Icon className={`w-4 h-4 ${card.accentText}`} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-ink-secondary block">
                          Tahap {card.step} dari 07
                        </span>
                        <h2 className="font-bold text-sm text-ink-primary truncate">
                          {card.title}
                        </h2>
                      </div>
                    </div>

                    {card.ready && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono text-ink-emerald shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aktif</span>
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-ink-secondary leading-relaxed">
                    {card.subtitle}
                  </p>

                  <div
                    className={`grid gap-2 text-[11px] font-mono bg-canvas p-2.5 rounded-lg border border-border-subtle tabular-nums ${
                      isFinalStep ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'
                    }`}
                  >
                    {card.metrics.map(m => (
                      <div key={m.label} className="min-w-0">
                        <span className="text-ink-secondary text-[10px] block truncate">{m.label}</span>
                        <span className="text-ink-primary font-bold block truncate">{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSwitchTab(card.tab)}
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 active:scale-95 ${card.buttonClass}`}
                >
                  <span>{card.cta}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* Audit Trail & Log Anomali Governance View */
        <div className="space-y-4">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-surface border border-border-subtle rounded-xl p-3.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-secondary">
                Total Catatan Audit
              </div>
              <div className="text-xl font-black font-mono tabular-nums text-ink-primary mt-1">
                {auditSummary.total}
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5">
                Immutable cloud + lokal
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-3.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-amber">
                Koreksi &amp; Override
              </div>
              <div className="text-xl font-black font-mono tabular-nums text-ink-amber mt-1">
                {auditSummary.correctionsAndOverrides}
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5">
                Wajib catatan alasan (&ge;3 huruf)
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-3.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-ink-rose">
                Anomali OEE &amp; BOM
              </div>
              <div className="text-xl font-black font-mono tabular-nums text-ink-rose mt-1">
                {auditSummary.anomalies}
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5 font-mono tabular-nums">
                Evaluasi tgl {filterDate || todayStr}
              </div>
            </div>

            <div className="bg-surface border border-border-subtle rounded-xl p-3.5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-brand">
                Event Keamanan Akses
              </div>
              <div className="text-xl font-black font-mono tabular-nums text-brand mt-1">
                {auditSummary.security}
              </div>
              <div className="text-[11px] text-ink-secondary mt-0.5">
                Auth &amp; registrasi peran
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-surface border border-border-subtle rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              <div>
                <label className="block text-[10px] font-mono uppercase text-ink-secondary mb-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Filter Tanggal</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-canvas border border-border-strong rounded-lg text-xs font-mono text-ink-primary focus:outline-none focus:border-cyan-500"
                  />
                  {filterDate && (
                    <button
                      type="button"
                      onClick={() => setFilterDate('')}
                      className="px-2 py-1.5 bg-elevated hover:bg-canvas border border-border-strong rounded-lg text-[11px] text-ink-secondary whitespace-nowrap shrink-0"
                    >
                      Semua
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-ink-secondary mb-1 flex items-center gap-1">
                  <Search className="w-3 h-3" />
                  <span>Filter User / Target / Catatan</span>
                </label>
                <input
                  type="text"
                  value={filterUser}
                  onChange={e => setFilterUser(e.target.value)}
                  placeholder="Cari nama, email, SKU, atau alasan..."
                  className="w-full px-2.5 py-1.5 bg-canvas border border-border-strong rounded-lg text-xs text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase text-ink-secondary mb-1 flex items-center gap-1">
                  <Filter className="w-3 h-3" />
                  <span>Filter Modul</span>
                </label>
                <select
                  value={filterModule}
                  onChange={e => setFilterModule(e.target.value as AuditFilterModule)}
                  className="w-full px-2.5 py-1.5 bg-canvas border border-border-strong rounded-lg text-xs text-ink-primary focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">Semua Modul ({normalizedAuditRows.length})</option>
                  <option value="MASTER_BOM">Master BOM</option>
                  <option value="STOCK_ADJUSTMENT">Penyesuaian Stok</option>
                  <option value="OEE_DOWNTIME">Koreksi Downtime OEE</option>
                  <option value="SHIFT_CORRECTION">Koreksi Data Shift</option>
                  <option value="PRODUCTION_USAGE">Transaksi Pemakaian</option>
                  <option value="SHIFT_HANDOVER">Serah Terima Shift</option>
                  <option value="ANOMALY">Log Anomali (OEE &gt;100% / BOM Variance)</option>
                  <option value="SECURITY">Keamanan &amp; Login</option>
                  <option value="SYSTEM">Sistem</option>
                </select>
              </div>
            </div>

            {(filterDate || filterUser || filterModule !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFilterDate('');
                  setFilterUser('');
                  setFilterModule('ALL');
                }}
                className="px-3 py-1.5 bg-canvas hover:bg-elevated border border-border-strong text-ink-secondary hover:text-ink-primary rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>

          {/* Audit Table */}
          <div className="bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border-subtle flex items-center justify-between gap-2 bg-canvas/50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-ink-amber" />
                <span className="font-bold text-xs text-ink-primary">
                  Riwayat Audit Trail &amp; Anomali
                </span>
              </div>
              <span className="text-[11px] font-mono text-ink-secondary tabular-nums">
                Menampilkan {filteredAuditRows.length} dari {normalizedAuditRows.length} entri
              </span>
            </div>

            {filteredAuditRows.length === 0 ? (
              <div className="p-8 text-center text-ink-secondary space-y-1.5">
                <CheckCircle2 className="w-7 h-7 text-ink-emerald mx-auto opacity-75" />
                <div className="font-bold text-ink-primary text-xs">
                  Tidak ada catatan audit atau anomali untuk filter saat ini
                </div>
                <div className="text-[11px]">
                  Setiap mutasi Master BOM, penyesuaian stok, koreksi shift, dan pelanggaran toleransi OEE/BOM akan otomatis tercatat di sini.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-canvas text-[10px] font-mono uppercase tracking-wider text-ink-secondary border-b border-border-subtle">
                      <th className="py-2.5 px-3">Waktu</th>
                      <th className="py-2.5 px-3">Aktor · Peran</th>
                      <th className="py-2.5 px-3">Modul · Aksi</th>
                      <th className="py-2.5 px-3">Target</th>
                      <th className="py-2.5 px-3">Nilai Sebelum &rarr; Sesudah</th>
                      <th className="py-2.5 px-3">Catatan Alasan / Indikasi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle text-xs">
                    {filteredAuditRows.map(row => {
                      const isDanger =
                        row.action === 'DELETE' ||
                        row.action === 'ANOMALY' ||
                        row.isCriticalAnomaly;
                      const isWarn =
                        !isDanger &&
                        (row.action === 'OVERRIDE' ||
                          row.module === 'SHIFT_CORRECTION' ||
                          row.module === 'OEE_DOWNTIME' ||
                          row.module === 'STOCK_ADJUSTMENT');

                      return (
                        <tr
                          key={row.id}
                          className={`hover:bg-elevated/50 transition align-top ${
                            isDanger ? 'bg-tint-rose/30' : isWarn ? 'bg-tint-amber/20' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-[11px] text-ink-secondary whitespace-nowrap tabular-nums">
                            {formatTimestampDisplay(row.timestamp)}
                          </td>
                          <td className="py-2.5 px-3 min-w-[160px]">
                            <div className="font-semibold text-ink-primary truncate max-w-[200px]">
                              {row.userName}
                            </div>
                            <div className="text-[10px] font-mono text-ink-secondary flex items-center gap-1 flex-wrap">
                              <span>{row.role}</span>
                              {row.userEmail && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate max-w-[150px]">{row.userEmail}</span>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div
                              className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-bold ${
                                isDanger
                                  ? 'text-ink-rose'
                                  : isWarn
                                  ? 'text-ink-amber'
                                  : 'text-ink-cyan'
                              }`}
                            >
                              {isDanger ? (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <Shield className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{formatModuleLabel(row.module)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{row.action}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 min-w-[180px]">
                            <div className="font-semibold text-ink-primary">{row.targetLabel}</div>
                            {row.targetId && row.targetId !== row.targetLabel && (
                              <div className="text-[10px] font-mono text-ink-muted truncate max-w-[200px]">
                                ID: {row.targetId}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px] max-w-[280px]">
                            {row.previousSummary || row.newSummary ? (
                              <div className="font-mono text-[10px] space-y-0.5 break-words">
                                {row.previousSummary && (
                                  <div className="text-ink-secondary">
                                    Sebelum: <span className="text-ink-primary">{row.previousSummary}</span>
                                  </div>
                                )}
                                {row.newSummary && (
                                  <div className="text-ink-cyan">
                                    Sesudah: <span className="text-ink-primary">{row.newSummary}</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-muted font-mono text-[10px]">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[180px] max-w-[260px]">
                            {row.reasonNote ? (
                              <span
                                className={`text-[11px] leading-snug block ${
                                  isDanger
                                    ? 'text-ink-rose font-semibold'
                                    : isWarn
                                    ? 'text-ink-amber font-medium'
                                    : 'text-ink-primary'
                                }`}
                              >
                                {row.reasonNote}
                              </span>
                            ) : (
                              <span className="text-ink-muted text-[11px]">-</span>
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
        </div>
      )}
    </div>
  );
};

