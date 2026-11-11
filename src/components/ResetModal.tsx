import React, { useState } from 'react';
import {
  X,
  AlertOctagon,
  Trash2,
  Sparkles,
  Database,
  Truck,
  FileText,
  Cpu,
  AlertTriangle,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Droplet
} from 'lucide-react';
import { AppState } from '../types';

interface ResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  onResetAll: () => void;
  onResetMasterData: () => void;
  onResetStockReceipts: () => void;
  onResetRequests: () => void;
  onResetUsages: () => void;
  onLoadPreset: () => void;
}

type ResetCategoryType =
  | 'all'
  | 'master'
  | 'stock-receipts'
  | 'requests'
  | 'usages'
  | null;

export const ResetModal: React.FC<ResetModalProps> = ({
  isOpen,
  onClose,
  state,
  onResetAll,
  onResetMasterData,
  onResetStockReceipts,
  onResetRequests,
  onResetUsages,
  onLoadPreset
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ResetCategoryType>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedCategory(null);
    onClose();
  };

  const executeConfirmedReset = () => {
    if (selectedCategory === 'all') {
      onResetAll();
    } else if (selectedCategory === 'master') {
      onResetMasterData();
    } else if (selectedCategory === 'stock-receipts') {
      onResetStockReceipts();
    } else if (selectedCategory === 'requests') {
      onResetRequests();
    } else if (selectedCategory === 'usages') {
      onResetUsages();
    }
    handleClose();
  };

  // Metrics for impact preview
  const materialsCount = state.master.materials.length;
  const wipsCount = state.master.wips.length;
  const skusCount = state.master.skus.length;
  const bomLinksCount = state.master.skuWips.length + state.master.wipMats.length;
  const receiptsCount = state.transactions.receipts.length;
  const requestsCount = state.transactions.requests.length;
  const usagesCount = state.transactions.usages.length;
  const wipBatchesCount = (state.transactions.wipBatches || []).length;
  const tankLevel = state.tank.level;

  const categories = [
    {
      id: 'all' as const,
      number: '1',
      title: 'Reset All Data (Kosongkan Seluruh Sistem)',
      badge: 'Semua Data',
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      icon: AlertOctagon,
      iconColor: 'text-rose-400',
      description:
        'Menghapus bersih seluruh database: Master Data (Material, WIP, SKU & Hierarki BOM), riwayat Permintaan, Penerimaan, Pemakaian, dan mengosongkan Tangki Liquid.',
      impact: `${materialsCount} Material, ${wipsCount} WIP, ${skusCount} SKU, ${receiptsCount} Penerimaan, ${requestsCount} Permintaan, ${usagesCount} Pemakaian.`
    },
    {
      id: 'master' as const,
      number: '2',
      title: 'Reset Master Data',
      badge: 'Master Saja',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: Database,
      iconColor: 'text-amber-400',
      description:
        'Menghapus seluruh master Material (database autosave), master WIP, master SKU, dan konfigurasi relasi BOM hierarki.',
      impact: `${materialsCount} Material, ${wipsCount} WIP, ${skusCount} SKU, ${bomLinksCount} Relasi BOM.`
    },
    {
      id: 'stock-receipts' as const,
      number: '3',
      title: 'Reset Data Stock Material Diterima (CK, WINEROTO & Storage Tank)',
      badge: 'Stok Masuk & Tangki',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      icon: Truck,
      iconColor: 'text-emerald-400',
      description:
        'Menghapus seluruh riwayat kedatangan/penerimaan material fisik dan me-reset level aktual Storage Tank Liquid ke 0.00 kg. Saldo fisik gudang CK, WINEROTO, dan Tangki akan kembali 0.',
      impact: `${receiptsCount} Dokumen Penerimaan fisik, level tangki saat ini: ${tankLevel.toFixed(2)} kg &rarr; 0.00 kg.`
    },
    {
      id: 'requests' as const,
      number: '4',
      title: 'Reset Data Pemesanan RM (Permintaan Material)',
      badge: 'Permintaan Saja',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      icon: FileText,
      iconColor: 'text-cyan-400',
      description:
        'Menghapus seluruh dokumen pengajuan permintaan bahan baku (Raw Material Requests) ke supplier GDRM dan Formulasi.',
      impact: `${requestsCount} Riwayat Permintaan Material.`
    },
    {
      id: 'usages' as const,
      number: '5',
      title: 'Reset Data Pemakaian & Perintah Kerja WIP',
      badge: 'Pemakaian Saja',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      icon: Cpu,
      iconColor: 'text-purple-400',
      description:
        'Menghapus seluruh log transaksi pemakaian bahan baku serta seluruh riwayat perintah kerja batch WIP (baik yang aktif maupun telah selesai). Mengembalikan kuota batch WIP ke kondisi awal.',
      impact: `${usagesCount} Log Pemakaian Bahan, ${wipBatchesCount} Perintah Kerja Batch WIP.`
    }
  ];

  const currentCategoryObj = categories.find(c => c.id === selectedCategory);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar p-4 sm:p-6 shadow-2xl relative space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 text-rose-400">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <RotateCcw className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-white">
                Menu Administrator: Kategori Reset Sistem
              </h3>
              <p className="text-[11px] text-slate-400">
                Pilih kategori data yang ingin dibersihkan secara terpisah
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Confirmation Screen if a category is selected */}
        {selectedCategory && currentCategoryObj ? (
          <div className="bg-rose-950/40 border border-rose-500/50 p-4 sm:p-5 rounded-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-white">
                  Konfirmasi: {currentCategoryObj.title}
                </h4>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  {currentCategoryObj.description}
                </p>
                <div className="pt-2 text-[11px] text-slate-300 font-mono bg-slate-950/60 p-2.5 rounded-lg border border-slate-800">
                  <span className="text-rose-400 font-semibold block mb-0.5">Data Terkena Dampak:</span>
                  {currentCategoryObj.impact}
                </div>
                <p className="text-[11px] text-amber-300 pt-1 font-medium">
                  ⚠️ Peringatan: Tindakan ini tidak dapat dibatalkan setelah dieksekusi.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-rose-500/30">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition"
              >
                Batal / Pilih Kategori Lain
              </button>
              <button
                type="button"
                onClick={executeConfirmedReset}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-600/30 transition flex items-center space-x-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Eksekusi Reset Sekarang</span>
              </button>
            </div>
          </div>
        ) : (
          /* List of 5 Categories */
          <div className="space-y-2.5">
            <p className="text-xs text-slate-300 leading-relaxed">
              Silakan pilih salah satu dari 5 kategori reset sistem di bawah ini. Anda dapat me-reset modul tertentu tanpa menghapus modul lainnya:
            </p>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {categories.map((cat) => {
                const IconComponent = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="w-full p-3.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 text-left transition group flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <IconComponent className={`w-4 h-4 ${cat.iconColor}`} />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            {cat.number}.
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-white group-hover:text-cyan-300 transition">
                            {cat.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {cat.description}
                        </p>
                        <div className="mt-1.5 text-[10px] text-slate-400 font-mono flex items-center space-x-1">
                          <span className="text-slate-500">Status Saat Ini:</span>
                          <span className="text-slate-300">{cat.impact}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center space-x-2 self-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${cat.badgeColor}`}>
                        {cat.badge}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-white transition group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Alternative: Load Preset */}
            <div className="pt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  onLoadPreset();
                  handleClose();
                }}
                className="w-full p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 hover:bg-cyan-900/30 text-left transition flex items-center justify-between"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-cyan-300 block">
                      Opsi Cadangan: Muat Preset Data Contoh Industri
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Isi kembali sistem dengan 8 material, 3 WIP terpisah, 2 SKU (Domestik & KITE Ekspor), dan relasi BOM siap pakai.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2">
          <button
            onClick={handleClose}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Tutup Dialog Administrator
          </button>
        </div>
      </div>
    </div>
  );
};
