import React, { useState } from 'react';
import {
  X,
  FileDown,
  Calendar,
  Clock,
  Layers,
  Package,
  Wrench,
  CheckCircle2,
  Boxes,
  ShieldCheck,
  User,
  Printer
} from 'lucide-react';
import { AppState, ShiftNumber } from '../types';
import { getCurrentShift, SHIFTS_CONFIG, formatIndonesianDate } from '../utils/shifts';
import { generateShiftProductionReportPdf } from '../utils/pdfReport';

interface ShiftReportPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  showToast: (msg: string, isError?: boolean) => void;
}

export const ShiftReportPdfModal: React.FC<ShiftReportPdfModalProps> = ({
  isOpen,
  onClose,
  state,
  showToast
}) => {
  const currentLiveShift = getCurrentShift();
  const todayString = new Date().toISOString().slice(0, 10);

  const [selectedShift, setSelectedShift] = useState<ShiftNumber | 'ALL'>(currentLiveShift.shift);
  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [operatorName, setOperatorName] = useState<string>('Shift Leader On-Duty');
  const [isGenerating, setIsGenerating] = useState(false);

  // Compute live preview metrics for selected date & shift
  const cartonLogs = (state.transactions.cartonProductions || []).filter(cp => {
    const matchDate = cp.timestamp.includes(selectedDate);
    if (!matchDate) return false;
    if (selectedShift === 'ALL') return true;
    return cp.shift === selectedShift;
  });

  const usages = (state.transactions.usages || []).filter(u => {
    const matchDate = u.date === selectedDate;
    if (!matchDate) return false;
    if (selectedShift === 'ALL') return true;
    return u.shift === selectedShift;
  });

  const wipBatches = (state.transactions.wipBatches || []).filter(b => {
    const matchDate = b.startedAt.includes(selectedDate);
    if (!matchDate) return false;
    if (selectedShift === 'ALL') return true;
    return b.shift === selectedShift;
  });

  const stopLogs = (state.transactions.productionStops || []).filter(s => {
    const matchDate = s.stoppedAt.includes(selectedDate) || s.startedAt.includes(selectedDate);
    if (!matchDate) return false;
    if (selectedShift === 'ALL') return true;
    return s.shift === selectedShift;
  });

  const totalCartons = cartonLogs.reduce((sum, c) => sum + c.cartonsProduced, 0);
  const totalMaterialUsedKg = usages.reduce((sum, u) => sum + u.usageQty, 0);
  const totalWipKg = wipBatches
    .filter(b => b.status === 'SELESAI')
    .reduce((sum, b) => sum + b.batchWeightKg, 0);
  const totalDowntimeMin = stopLogs.reduce((sum, s) => sum + s.durationMinutes, 0);

  const handleDownloadPdf = () => {
    try {
      setIsGenerating(true);
      generateShiftProductionReportPdf(state, {
        shift: selectedShift,
        dateString: selectedDate,
        operatorName: operatorName.trim() || 'Admin Produksi'
      });
      showToast('Laporan PDF ringkasan produksi shift berhasil diunduh!');
      setIsGenerating(false);
      onClose();
    } catch (err) {
      console.error('PDF generation error:', err);
      showToast('Gagal membuat file PDF laporan', true);
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-6 text-slate-900">
        {/* Header Bar */}
        <div className="bg-slate-100 p-5 sm:p-6 border-b border-slate-200 flex items-start justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="p-3 rounded-2xl bg-cyan-100 text-cyan-800 border border-cyan-300 shrink-0">
              <FileDown className="w-6 h-6 text-cyan-800" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base sm:text-lg text-slate-900">
                  Unduh Laporan Produksi Shift (PDF)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-950 font-mono font-extrabold border border-emerald-300">
                  Dokumen Resmi
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Format Resmi A4 Landscape: Saldo Stok Aktual (Satuan Batch & kg), Output SKU, Pemakaian, WIP & Downtime TPM.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-xl bg-slate-200 hover:bg-slate-300 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Shift Selection Pills */}
          <div>
            <label className="text-xs font-bold text-slate-800 block mb-2 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-700" />
              <span>Pilih Periode Shift Produksi:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSelectedShift(1)}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition text-center ${
                  selectedShift === 1
                    ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 font-semibold'
                }`}
              >
                Shift 1 (Pagi)
                <span className={`block text-[10px] font-normal ${selectedShift === 1 ? 'text-cyan-100' : 'text-slate-500'}`}>07:00 - 15:00</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedShift(2)}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition text-center ${
                  selectedShift === 2
                    ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 font-semibold'
                }`}
              >
                Shift 2 (Siang)
                <span className={`block text-[10px] font-normal ${selectedShift === 2 ? 'text-cyan-100' : 'text-slate-500'}`}>15:00 - 23:00</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedShift(3)}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition text-center ${
                  selectedShift === 3
                    ? 'bg-cyan-600 text-white border-cyan-700 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 font-semibold'
                }`}
              >
                Shift 3 (Malam)
                <span className={`block text-[10px] font-normal ${selectedShift === 3 ? 'text-cyan-100' : 'text-slate-500'}`}>23:00 - 07:00</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedShift('ALL')}
                className={`py-2 px-3 rounded-2xl text-xs font-bold border transition text-center ${
                  selectedShift === 'ALL'
                    ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-100 font-semibold'
                }`}
              >
                Semua Shift
                <span className={`block text-[10px] font-normal ${selectedShift === 'ALL' ? 'text-indigo-100' : 'text-slate-500'}`}>24 Jam Penuh</span>
              </button>
            </div>
          </div>

          {/* Date & PIC Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-cyan-700" />
                <span>Tanggal Laporan:</span>
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600 font-mono shadow-xs font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-cyan-700" />
                <span>Nama Operator / PIC:</span>
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="cth: Ahmad Fauzi / Shift Leader"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-cyan-600 shadow-xs font-medium"
              />
            </div>
          </div>

          {/* Live Preview Metric Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-700 block">
              Pratinjau Data Laporan ({selectedShift === 'ALL' ? '24 Jam' : `Shift ${selectedShift}`}):
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-600 block font-mono font-semibold">Total Karton:</span>
                <span className="text-base font-extrabold font-mono text-emerald-800">
                  {totalCartons.toLocaleString('id-ID')} <span className="text-xs font-normal text-slate-600">ktn</span>
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-600 block font-mono font-semibold">Pemakaian Material:</span>
                <span className="text-base font-extrabold font-mono text-cyan-800">
                  {totalMaterialUsedKg.toFixed(1)} <span className="text-xs font-normal text-slate-600">kg</span>
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-600 block font-mono font-semibold">Produksi WIP Selesai:</span>
                <span className="text-base font-extrabold font-mono text-purple-800">
                  {totalWipKg.toFixed(1)} <span className="text-xs font-normal text-slate-600">kg</span>
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] text-slate-600 block font-mono font-semibold">Downtime Mesin:</span>
                <span className="text-base font-extrabold font-mono text-rose-800">
                  {totalDowntimeMin} <span className="text-xs font-normal text-slate-600">mnt</span>
                </span>
              </div>
            </div>

            <div className="pt-1.5 flex items-center justify-between text-[11px] text-slate-600 border-t border-slate-200">
              <span className="font-medium">Mencakup: {state.master.materials.length} Saldo Material • {state.master.skus.length} SKU • {state.master.tanks.length} Tangki</span>
              <span className="text-emerald-800 font-bold flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Format Standar Audit QA</span>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-2xl text-xs font-bold transition border border-slate-300 shadow-xs"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isGenerating}
              className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-2xl text-xs font-bold transition shadow-sm flex items-center justify-center space-x-2 active:scale-95 disabled:opacity-60 border border-cyan-700"
            >
              <FileDown className="w-4 h-4 text-white" />
              <span className="text-white font-bold">{isGenerating ? 'Membuat PDF...' : 'Unduh Laporan PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
