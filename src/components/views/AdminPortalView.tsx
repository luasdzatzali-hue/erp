import React from 'react';
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Cpu,
  Cylinder,
  Database,
  FileSpreadsheet,
  FileText,
  Layers,
  Printer,
  Scale,
  Shield,
  Truck,
  Users
} from 'lucide-react';
import { AppState } from '../../types';
import { getCurrentShift } from '../../utils/shifts';
import { calculateStockBalances } from '../../utils/storage';
import { getActiveWeeklyPlan } from '../../utils/weeklyPlanComparison';

interface AdminPortalViewProps {
  state: AppState;
  onSwitchTab: (tab: AppState['currentTab']) => void;
  onOpenPdfModal: () => void;
  onOpenTankModal: () => void;
  onOpenUserManagement: () => void;
  onOpenStockAdjustment?: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const AdminPortalView: React.FC<AdminPortalViewProps> = ({
  state,
  onSwitchTab,
  onOpenPdfModal,
  onOpenUserManagement,
  onOpenStockAdjustment
}) => {
  const currentShift = getCurrentShift();
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
          <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-ink-amber shrink-0">
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
              Pusat Alur Kerja Operasional Pabrik (7 Tahap Berurutan)
            </h1>
            <p className="text-[11px] text-ink-secondary mt-0.5">
              Ikuti urutan langkah 01 sampai 07 dari persiapan Master BOM hingga eksekusi Manufacturing di lini produksi.
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

      {/* Sequential 7-Step Operational Workflow Cards */}
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
    </div>
  );
};
