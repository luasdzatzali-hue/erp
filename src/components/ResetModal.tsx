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
      badgeColor: 'bg-rose-500/20 text-ink-rose border-rose-500/40',
      icon: AlertOctagon,
      iconColor: 'text-ink-rose',
      description:
        'Menghapus bersih seluruh database: Master Data (Material, WIP, SKU & Hierarki BOM), riwayat Permintaan, Penerimaan, Pemakaian, dan mengosongkan Tangki Liquid.',
      impact: `${materialsCount} Material, ${wipsCount} WIP, ${skusCount} SKU, ${receiptsCount} Penerimaan, ${requestsCount} Permintaan, ${usagesCount} Pemakaian.`
    },
    {
      id: 'master' as const,
      number: '2',
      title: 'Reset Master Data',
      badge: 'Master Saja',
      badgeColor: 'bg-amber-500/20 text-ink-amber border-amber-500/40',
      icon: Database,
      iconColor: 'text-ink-amber',
      description:
        'Menghapus seluruh master Material (database autosave), master WIP, master SKU, dan konfigurasi relasi BOM hierarki.',
      impact: `${materialsCount} Material, ${wipsCount} WIP, ${skusCount} SKU, ${bomLinksCount} Relasi BOM.`
    },
    {
      id: 'stock-receipts' as const,
      number: '3',
      title: 'Reset Data Stock Material Diterima (CK, WINEROTO & Storage Tank)',
      badge: 'Stok Masuk & Tangki',
      badgeColor: 'bg-emerald-500/20 text-ink-emerald border-emerald-500/40',
      icon: Truck,
      iconColor: 'text-ink-emerald',
      description:
        'Menghapus seluruh riwayat kedatangan/penerimaan material fisik dan me-reset level aktual Storage Tank Liquid ke 0.00 kg. Saldo fisik gudang CK, WINEROTO, dan Tangki akan kembali 0.',
      impact: `${receiptsCount} Dokumen Penerimaan fisik, level tangki saat ini: ${tankLevel.toFixed(2)} kg &rarr; 0.00 kg.`
    },
    {
      id: 'requests' as const,
      number: '4',
      title: 'Reset Data Pemesanan RM (Permintaan Material)',
      badge: 'Permintaan Saja',
      badgeColor: 'bg-cyan-500/20 text-brand border-cyan-500/40',
      icon: FileText,
      iconColor: 'text-brand',
      description:
        'Menghapus seluruh dokumen pengajuan permintaan bahan baku (Raw Material Requests) ke supplier GDRM dan Formulasi.',
      impact: `${requestsCount} Riwayat Permintaan Material.`
    },
    {
      id: 'usages' as const,
      number: '5',
      title: 'Reset Data Pemakaian & Perintah Kerja WIP',
      badge: 'Pemakaian Saja',
      badgeColor: 'bg-purple-500/20 text-ink-purple border-purple-500/40',
      icon: Cpu,
      iconColor: 'text-ink-purple',
      description:
        'Menghapus seluruh log transaksi pemakaian bahan baku serta seluruh riwayat perintah kerja batch WIP (baik yang aktif maupun telah selesai). Mengembalikan kuota batch WIP ke kondisi awal.',
      impact: `${usagesCount} Log Pemakaian Bahan, ${wipBatchesCount} Perintah Kerja Batch WIP.`
    }
  ];

  const currentCategoryObj = categories.find(c => c.id === selectedCategory);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto no-scrollbar p-4 sm:p-6 shadow-2xl relative space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center space-x-2.5 text-ink-rose">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <RotateCcw className="w-5 h-5 text-ink-rose" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-ink-primary">
                Menu Administrator: Kategori Reset Sistem
              </h3>
              <p className="text-[11px] text-ink-secondary">
                Pilih kategori data yang ingin dibersihkan secara terpisah
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-ink-secondary hover:text-ink-primary rounded-lg bg-elevated hover:bg-accent transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Confirmation Screen if a category is selected */}
        {selectedCategory && currentCategoryObj ? (
          <div className="bg-tint-rose border border-rose-500/50 p-4 sm:p-5 rounded-2xl space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-ink-rose shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-ink-primary">
                  Konfirmasi: {currentCategoryObj.title}
                </h4>
                <p className="text-xs text-ink-rose leading-relaxed">
                  {currentCategoryObj.description}
                </p>
                <div className="pt-2 text-[11px] text-ink-secondary font-mono bg-canvas p-2.5 rounded-lg border border-border-subtle">
                  <span className="text-ink-rose font-semibold block mb-0.5">Data Terkena Dampak:</span>
                  {currentCategoryObj.impact}
                </div>
                <p className="text-[11px] text-ink-amber pt-1 font-medium">
                  ⚠️ Peringatan: Tindakan ini tidak dapat dibatalkan setelah dieksekusi.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-rose-500/30">
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="px-4 py-2 bg-elevated hover:bg-accent text-ink-primary rounded-xl text-xs font-semibold transition"
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
            <p className="text-xs text-ink-secondary leading-relaxed">
              Silakan pilih salah satu dari 5 kategori reset sistem di bawah ini. Anda dapat me-reset modul tertentu tanpa menghapus modul lainnya:
            </p>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              {categories.map((cat) => {
                const IconComponent = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className="w-full p-3.5 rounded-xl bg-elevated hover:bg-elevated border border-border-strong hover:border-border-strong text-left transition group flex items-start justify-between gap-3"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-surface border border-border-strong flex items-center justify-center shrink-0 group-hover:scale-105 transition">
                        <IconComponent className={`w-4 h-4 ${cat.iconColor}`} />
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-ink-secondary">
                            {cat.number}.
                          </span>
                          <span className="font-bold text-xs sm:text-sm text-ink-primary group-hover:text-brand transition">
                            {cat.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-secondary mt-1 leading-relaxed">
                          {cat.description}
                        </p>
                        <div className="mt-1.5 text-[10px] text-ink-secondary font-mono flex items-center space-x-1">
                          <span className="text-ink-muted">Status Saat Ini:</span>
                          <span className="text-ink-secondary">{cat.impact}</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center space-x-2 self-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${cat.badgeColor}`}>
                        {cat.badge}
                      </span>
                      <ArrowRight className="w-4 h-4 text-ink-muted group-hover:text-ink-primary transition group-hover:translate-x-0.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Alternative: Load Preset */}
            <div className="pt-3 border-t border-border-subtle">
              <button
                onClick={() => {
                  onLoadPreset();
                  handleClose();
                }}
                className="w-full p-3 rounded-xl bg-tint-cyan border border-cyan-500/30 hover:bg-tint-cyan text-left transition flex items-center justify-between"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/20 text-brand">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-xs text-brand block">
                      Opsi Cadangan: Muat Preset Data Contoh Industri
                    </span>
                    <span className="text-[11px] text-ink-secondary block">
                      Isi kembali sistem dengan 8 material, 3 WIP terpisah, 2 SKU (Domestik & KITE Ekspor), dan relasi BOM siap pakai.
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-brand shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2">
          <button
            onClick={handleClose}
            className="w-full py-2 bg-elevated hover:bg-accent text-ink-secondary rounded-xl text-xs font-semibold transition"
          >
            Tutup Dialog Administrator
          </button>
        </div>
      </div>
    </div>
  );
};
