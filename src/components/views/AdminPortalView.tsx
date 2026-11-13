import React from 'react';
import {
  Cpu,
  Boxes,
  Layers,
  FileText,
  Database,
  ArrowRight,
  Cylinder,
  CheckCircle2,
  Clock,
  Sparkles,
  Shield,
  Printer,
  Users,
  Activity,
  Droplet,
  PlayCircle,
  Truck,
  RotateCw,
  Scale
} from 'lucide-react';
import { AppState, ShiftNumber } from '../../types';
import { getCurrentShift, SHIFTS_CONFIG } from '../../utils/shifts';
import { calculateStockBalances } from '../../utils/storage';

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
  onOpenTankModal,
  onOpenUserManagement,
  onOpenStockAdjustment,
  showToast
}) => {
  const currentShift = getCurrentShift();
  const balances = calculateStockBalances(state);

  // Active production stats
  const activeSku = state.master.skus[0];
  const cartonCount = (state.transactions.cartonProductions || []).reduce(
    (acc, curr) => acc + (curr.cartonsProduced || 0),
    0
  );

  // Active WIP Batches currently running in plant
  const activeBatches = (state.transactions.wipBatches || []).filter(
    b => b.status === 'SEDANG_PRODUKSI'
  );

  // Total warehouse materials weight
  const totalStockKg = Object.values(balances).reduce(
    (acc, curr) => acc + curr.totalActual,
    0
  );

  // Tanks summary
  const totalTankCapacity = state.master.tanks.reduce((acc, curr) => acc + curr.capacityKg, 0);
  const totalTankCurrentKg = state.master.tanks.reduce((acc, curr) => acc + curr.currentLevelKg, 0);
  const tankFillPct = totalTankCapacity > 0 ? (totalTankCurrentKg / totalTankCapacity) * 100 : 0;

  return (
    <div className="h-full flex flex-col justify-between gap-3 text-xs">
      {/* Top Header Cockpit Banner */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-2xl shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-800">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                Portal Modul MRP & WMS Pabrik (Halaman Utama Administrator)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold font-mono">
                Akses Penuh
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Pusat kendali eksekutif operasional manufaktur 5 modul terintegrasi dalam 1 layar desktop tanpa scrolling.
            </p>
          </div>
        </div>

        {/* Live Plant Shift Beacon */}
        <div className="flex items-center space-x-2 text-[11px] font-mono bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-end sm:self-auto shadow-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-slate-800 font-semibold">{currentShift.name} ({currentShift.timeRange})</span>
          <span className="text-slate-400">|</span>
          <span className="text-sky-700 font-bold">{state.master.machines.length} Mesin</span>
          <span className="text-slate-400">|</span>
          <span className="text-indigo-700 font-bold">{state.master.tanks.length} Tangki</span>
        </div>
      </div>

      {/* 5 CORE MODULES INTERACTIVE GRID: Fits on 1 screen on desktop */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* MODUL 1: MANUFACTURING (MRP ENGINE) */}
        <div className="bg-white border border-slate-200 hover:border-sky-400 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between transition-all group">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-sky-100 text-sky-800">
                  <Cpu className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                  1. Modul Manufacturing (MRP)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-sky-800 font-bold bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                Simulasi & OEE
              </span>
            </div>

            <p className="text-[11px] text-slate-600 line-clamp-2">
              Kalkulator kebutuhan material per batch dan simulasi eksekusi produksi karton SKU secara realtime.
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] block">SKU Aktif:</span>
                <span className="text-slate-900 font-bold truncate block">{activeSku?.name || 'Choco Delight'}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Target Rate:</span>
                <span className="text-sky-700 font-bold">{activeSku?.targetHour || 350} ktn/jam</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Output Shift:</span>
                <span className="text-emerald-700 font-bold">{cartonCount} Karton</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Speed Multiplier:</span>
                <span className="text-amber-700 font-bold">1.0x Realtime</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 flex items-center space-x-2">
            <button
              onClick={() => onSwitchTab('dashboard')}
              className="flex-1 py-2 px-3 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow-xs active:scale-95"
            >
              <span>Buka Manufacturing</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSwitchTab('bom-calculator')}
              title="Kalkulator Defisit Bahan Baku"
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition border border-slate-300"
            >
              Kalkulator BOM
            </button>
          </div>
        </div>

        {/* MODUL 2: INVENTORY & TANK (WMS & LIQUID SENSORS) */}
        <div className="bg-white border border-slate-200 hover:border-emerald-400 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between transition-all group">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                  <Cylinder className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                  2. Inventory & Tangki WIP
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                WMS & Sensor
              </span>
            </div>

            <p className="text-[11px] text-slate-600 line-clamp-2">
              Penerimaan gudang GDRM area CK/Wineroto dan pemantauan 5 tangki WIP holding & storage.
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] block">Total Stok GDRM:</span>
                <span className="text-slate-900 font-bold">{totalStockKg.toFixed(1)} kg</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Tangki WIP Aktif:</span>
                <span className="text-emerald-700 font-bold">{state.master.tanks.length} Unit Tangki</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Volume Terisi:</span>
                <span className="text-sky-700 font-bold">{totalTankCurrentKg.toFixed(0)} kg ({tankFillPct.toFixed(0)}%)</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Suhu Liquid:</span>
                <span className="text-amber-700 font-bold">{state.tank.temp.toFixed(1)}°C (Agitator ON)</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 flex items-center space-x-2">
            <button
              onClick={() => onSwitchTab('tank-monitoring')}
              className="flex-1 py-2 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow-xs active:scale-95"
            >
              <span>Monitoring Tangki WIP</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {onOpenStockAdjustment && (
              <button
                onClick={onOpenStockAdjustment}
                title="Kalibrasi dan Sesuaikan Saldo Awal Material (Akses Administrator)"
                className="py-2 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-semibold rounded-xl text-xs transition border border-amber-300 flex items-center space-x-1 shadow-xs"
              >
                <Scale className="w-3.5 h-3.5 text-amber-700" />
                <span>Adjust Saldo</span>
              </button>
            )}
            <button
              onClick={() => onSwitchTab('penerimaan')}
              title="Penerimaan Bahan Baku Gudang GDRM"
              className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition border border-slate-300"
            >
              Penerimaan
            </button>
          </div>
        </div>

        {/* MODUL 3: WORK ORDER WIP (SHOP FLOOR BATCHES & RECIPES) */}
        <div className="bg-white border border-slate-200 hover:border-purple-400 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between transition-all group">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-purple-100 text-purple-800">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                  3. Work Order WIP
                </h3>
              </div>
              <span className="text-[10px] font-mono text-purple-800 font-bold bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                1 Batch/Mesin
              </span>
            </div>

            <p className="text-[11px] text-slate-600 line-clamp-2">
              Penerbitan perintah kerja pembuatan WIP berdasarkan resep formulasi presisi kg & gr per batch.
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] block">Batch Sedang Jalan:</span>
                <span className="text-purple-800 font-bold">{activeBatches.length} Batch Aktif</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Mesin Terhubung:</span>
                <span className="text-slate-900 font-bold">{state.master.machines.length} Mesin</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Master Resep:</span>
                <span className="text-sky-700 font-bold">{state.master.recipes?.length || 3} Resep Terdaftar</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Aturan Produksi:</span>
                <span className="text-amber-700 font-bold">Maks 1 Batch/Mesin</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 flex items-center space-x-2">
            <button
              onClick={() => onSwitchTab('pemakaian')}
              className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow-xs active:scale-95"
            >
              <span>Buka Perintah Kerja WIP</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSwitchTab('permintaan')}
              title="Permintaan Bahan Baku"
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-xl text-xs transition border border-slate-300"
            >
              Permintaan
            </button>
          </div>
        </div>

        {/* MODUL 4: REPORT PDF (LANDSCAPE A4 PRODUCTION & STOCK AUDIT) */}
        <div className="bg-white border border-slate-200 hover:border-rose-400 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between transition-all group md:col-span-1 lg:col-span-1">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-rose-100 text-rose-800">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                  4. Report PDF Shift
                </h3>
              </div>
              <span className="text-[10px] font-mono text-rose-800 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Landscape A4
              </span>
            </div>

            <p className="text-[11px] text-slate-600 line-clamp-2">
              Laporan saldo stock material aktual per shift format landscape dengan kolom saldo awal, kedatangan, pemakaian & saldo akhir.
            </p>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] block">Format Kertas:</span>
                <span className="text-slate-900 font-bold">A4 Landscape</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Audit Standar:</span>
                <span className="text-rose-700 font-bold">ISO / GMP Plant</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Item Dilaporkan:</span>
                <span className="text-sky-700 font-bold">{state.master.materials.length} Bahan Baku</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Shift Acuan:</span>
                <span className="text-emerald-700 font-bold">Shift {currentShift.shift} Terkini</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 flex items-center space-x-2">
            <button
              onClick={onOpenPdfModal}
              className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 shadow-xs active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak / Download PDF</span>
            </button>
          </div>
        </div>

        {/* MODUL 5: KONFIGURASI MASTER BOM (HIERARCHY, MACHINES & TANKS) */}
        <div className="bg-white border border-slate-200 hover:border-amber-400 p-3.5 rounded-2xl shadow-xs flex flex-col justify-between transition-all group md:col-span-2 lg:col-span-2">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                  <Database className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-xs sm:text-sm text-slate-900">
                  5. Konfigurasi Master BOM & Mesin
                </h3>
              </div>
              <span className="text-[10px] font-mono text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                Hierarki 4-Tingkat
              </span>
            </div>

            <p className="text-[11px] text-slate-600">
              Pengaturan hierarki formulasi: <strong>SKU</strong> &rarr; <strong>WIP Terpisah</strong> &rarr; <strong>Resep Formulasi</strong> &rarr; <strong>Material (Padat / Bubuk / Liquid)</strong> serta database mesin pengolah dan tangki.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] block">Master SKU:</span>
                <span className="text-slate-900 font-bold">{state.master.skus.length} Produk SKU</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Master WIP:</span>
                <span className="text-sky-700 font-bold">{state.master.wips.length} Jenis WIP</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Resep Formulasi:</span>
                <span className="text-amber-700 font-bold">{state.master.recipes?.length || 3} Resep Terdaftar</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Material Database:</span>
                <span className="text-emerald-700 font-bold">{state.master.materials.length} Bahan Baku</span>
              </div>
            </div>
          </div>

          <div className="pt-2.5 flex items-center space-x-2">
            <button
              onClick={() => onSwitchTab('master')}
              className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1 shadow-xs active:scale-95"
            >
              <span>Buka Konfigurasi Master BOM</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {onOpenStockAdjustment && (
              <button
                onClick={onOpenStockAdjustment}
                title="Kalibrasi dan Sesuaikan Saldo Awal Material (Akses Administrator)"
                className="py-2 px-3 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold rounded-xl text-xs transition border border-amber-300 flex items-center space-x-1 shadow-xs active:scale-95"
              >
                <Scale className="w-3.5 h-3.5 text-amber-700" />
                <span>Adjust Saldo Awal</span>
              </button>
            )}
            <button
              onClick={onOpenUserManagement}
              title="Kelola Pendaftaran Operator & Izin Management"
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-sky-800 font-semibold rounded-xl text-xs transition border border-sky-300 flex items-center space-x-1"
            >
              <Users className="w-3.5 h-3.5 text-sky-700" />
              <span>Kelola Pengguna ({state.registeredOperators.length + state.registeredManagement.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact Bottom Audit Bar */}
      <div className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl flex items-center justify-between text-[11px] text-slate-600 shrink-0 shadow-xs">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Status Sistem MRP & WMS: <strong>Normal Operasional</strong></span>
        </div>
        <div className="flex items-center space-x-3 font-mono text-[10px]">
          <span>Pengguna Aktif: <strong>{state.currentSession?.name || 'Administrator'}</strong></span>
          <span>•</span>
          <span>Versi Mesin: <strong>ProdTrack MES 4.2</strong></span>
        </div>
      </div>
    </div>
  );
};
