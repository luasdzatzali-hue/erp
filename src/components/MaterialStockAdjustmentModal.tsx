import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  Scale,
  Warehouse,
  Building2,
  Cylinder,
  CheckCircle2,
  AlertTriangle,
  History,
  X,
  Search,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  TrendingUp,
  Save,
  RotateCcw
} from 'lucide-react';
import { AppState, Material, StorageLocation, MaterialStockAdjustment } from '../types';
import { calculateStockBalances } from '../utils/storage';

interface MaterialStockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  preselectedMaterialId?: string;
  onAdjustStock: (
    materialId: string,
    data: {
      initialStockCk: number;
      initialStockWineroto: number;
      initialStockTank: number;
      reason: string;
      notes?: string;
    }
  ) => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const MaterialStockAdjustmentModal: React.FC<MaterialStockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  state,
  preselectedMaterialId,
  onAdjustStock,
  showToast
}) => {
  const [selectedMatId, setSelectedMatId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'adjust' | 'history'>('adjust');
  const [searchQuery, setSearchQuery] = useState('');

  // Stock adjustment inputs
  const [stockCk, setStockCk] = useState<string>('0');
  const [stockWineroto, setStockWineroto] = useState<string>('0');
  const [stockTank, setStockTank] = useState<string>('0');
  const [reason, setReason] = useState<string>('Stock Opname Awal Shift');
  const [customNotes, setCustomNotes] = useState<string>('');

  // Admin permission check
  const isAdmin = state.currentUserRole === 'ADMINISTRATOR' || state.isAdmin;

  const stockBalances = calculateStockBalances(state);

  // Initialize selected material
  useEffect(() => {
    if (preselectedMaterialId && state.master.materials.some(m => m.id === preselectedMaterialId)) {
      setSelectedMatId(preselectedMaterialId);
    } else if (state.master.materials.length > 0 && !selectedMatId) {
      setSelectedMatId(state.master.materials[0].id);
    }
  }, [preselectedMaterialId, state.master.materials, isOpen]);

  // Sync inputs with selected material's current initial stock
  useEffect(() => {
    if (selectedMatId) {
      const mat = state.master.materials.find(m => m.id === selectedMatId);
      if (mat) {
        setStockCk((mat.initialStockCk ?? 0).toString());
        setStockWineroto((mat.initialStockWineroto ?? 0).toString());
        setStockTank((mat.initialStockTank ?? 0).toString());
      }
    }
  }, [selectedMatId, state.master.materials]);

  if (!isOpen) return null;

  const selectedMaterial = state.master.materials.find(m => m.id === selectedMatId);
  const currentBalance = selectedMatId ? stockBalances[selectedMatId] : null;

  // Numeric values
  const numCk = Math.max(0, parseFloat(stockCk) || 0);
  const numWineroto = Math.max(0, parseFloat(stockWineroto) || 0);
  const numTank = Math.max(0, parseFloat(stockTank) || 0);
  const newTotalInitial = numCk + numWineroto + numTank;

  const prevCk = Number(selectedMaterial?.initialStockCk ?? 0);
  const prevWineroto = Number(selectedMaterial?.initialStockWineroto ?? 0);
  const prevTank = Number(selectedMaterial?.initialStockTank ?? 0);
  const prevTotalInitial = prevCk + prevWineroto + prevTank;
  const deltaTotal = newTotalInitial - prevTotalInitial;

  const stdWeight = selectedMaterial?.weightKg || 25;
  const isSolidOrPowder = selectedMaterial?.type === 'bubuk' || selectedMaterial?.type === 'padat';

  // Bags estimation
  const bagsCk = stdWeight > 0 ? (numCk / stdWeight).toFixed(1) : '0';
  const bagsWineroto = stdWeight > 0 ? (numWineroto / stdWeight).toFixed(1) : '0';

  // Filtered materials for selection
  const filteredMaterials = state.master.materials.filter(m => {
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || (m.code && m.code.toLowerCase().includes(q));
  });

  // Recent stock adjustments for this material or all
  const recentAdjustments = (state.transactions.stockAdjustments || []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast('Akses Ditolak: Hanya Administrator yang berwenang mengubah saldo awal material', true);
      return;
    }
    if (!selectedMatId || !selectedMaterial) {
      showToast('Pilih material yang akan disesuaikan', true);
      return;
    }

    onAdjustStock(selectedMatId, {
      initialStockCk: numCk,
      initialStockWineroto: numWineroto,
      initialStockTank: numTank,
      reason,
      notes: customNotes.trim() || undefined
    });

    onClose();
  };

  const handleResetToCurrent = () => {
    if (selectedMaterial) {
      setStockCk((selectedMaterial.initialStockCk ?? 0).toString());
      setStockWineroto((selectedMaterial.initialStockWineroto ?? 0).toString());
      setStockTank((selectedMaterial.initialStockTank ?? 0).toString());
      showToast('Nilai saldo awal dikembalikan ke data tersimpan');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-sm sm:text-base text-white">
                  Penyesuaian Saldo Awal Material (Stock Adjustment)
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  Admin Only
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Akses Administrator untuk mengoreksi & menetapkan saldo stok awal fisik gudang (CK, WINEROTO, Tangki)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access Warning if not Admin */}
        {!isAdmin ? (
          <div className="p-6 text-center space-y-4">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="font-bold text-sm text-white">Akses Terkunci: Memerlukan Wewenang Administrator</h4>
              <p className="text-xs text-slate-400">
                Anda saat ini masuk sebagai <strong>{state.currentSession?.name || 'Operator'}</strong> ({state.currentUserRole}). Penyesuaian saldo awal material merupakan kewenangan ketat Administrator untuk menjaga integritas data MRP dan audit saldo fisik.
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold"
            >
              Kembali ke Aplikasi
            </button>
          </div>
        ) : (
          <div>
            {/* Tabs */}
            <div className="flex border-b border-slate-800 px-4 sm:px-5 bg-slate-900/60">
              <button
                onClick={() => setActiveTab('adjust')}
                className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 ${
                  activeTab === 'adjust'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Form Kalibrasi Saldo Awal</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 ${
                  activeTab === 'history'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Riwayat Audit Penyesuaian ({recentAdjustments.length})</span>
              </button>
            </div>

            {activeTab === 'adjust' ? (
              <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
                {/* Material Selection */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium text-slate-300">
                    Pilih Bahan Baku / Material yang Ingin Disesuaikan:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-1 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        placeholder="Cari nama / kode..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <select
                        value={selectedMatId}
                        onChange={(e) => setSelectedMatId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-medium"
                      >
                        {filteredMaterials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.code || 'NO-CODE'}) • {m.source} ({m.packaging})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Selected Material Info Banner */}
                {selectedMaterial && (
                  <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-[11px]">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-bold text-xs">{selectedMaterial.name}</span>
                        <span className="text-amber-400 font-semibold">[{selectedMaterial.code}]</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                          {selectedMaterial.type.toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800">
                          {selectedMaterial.source}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Standar Kemasan: {selectedMaterial.packaging} • Berat: {selectedMaterial.weightKg.toFixed(2)} kg
                      </p>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                      <span className="text-slate-400 text-[10px] block">Total Stok Aktual Onhand (Live):</span>
                      <span className="text-emerald-400 font-bold text-xs">
                        {currentBalance ? currentBalance.totalActual.toFixed(2) : '0.00'} kg
                      </span>
                    </div>
                  </div>
                )}

                {/* Initial Stock Adjustment Fields per Storage Area */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-200 flex items-center space-x-1.5">
                      <span>Kalibrasi Saldo Awal Fisik Per Lokasi Penyimpanan:</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleResetToCurrent}
                      className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center space-x-1 transition"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Kembalikan ke Data Tersimpan</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Gudang CK */}
                    <div className="bg-slate-800/60 border border-slate-700/80 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span className="flex items-center space-x-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-cyan-400" />
                          <span>1. Gudang CK</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Lama: {prevCk.toFixed(1)} kg
                        </span>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Saldo Awal Baru (kg):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockCk}
                          onChange={(e) => setStockCk(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 font-bold"
                        />
                      </div>
                      {isSolidOrPowder && (
                        <div className="text-[10px] text-cyan-300/80 font-mono">
                          ≈ {bagsCk} Zak (@ {stdWeight} kg)
                        </div>
                      )}
                    </div>

                    {/* Gudang WINEROTO */}
                    <div className="bg-slate-800/60 border border-slate-700/80 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span className="flex items-center space-x-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>2. Gudang WINEROTO</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Lama: {prevWineroto.toFixed(1)} kg
                        </span>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Saldo Awal Baru (kg):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockWineroto}
                          onChange={(e) => setStockWineroto(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-400 font-bold"
                        />
                      </div>
                      {isSolidOrPowder && (
                        <div className="text-[10px] text-amber-300/80 font-mono">
                          ≈ {bagsWineroto} Zak (@ {stdWeight} kg)
                        </div>
                      )}
                    </div>

                    {/* Storage Tank */}
                    <div className="bg-slate-800/60 border border-slate-700/80 p-3 rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-slate-300 font-medium">
                        <span className="flex items-center space-x-1.5">
                          <Cylinder className="w-3.5 h-3.5 text-purple-400" />
                          <span>3. Storage Tank (Liquid)</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Lama: {prevTank.toFixed(1)} kg
                        </span>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">Saldo Awal Baru (kg):</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={stockTank}
                          onChange={(e) => setStockTank(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-purple-400 font-bold"
                        />
                      </div>
                      <div className="text-[10px] text-purple-300/80 font-mono">
                        {selectedMaterial?.type === 'liquid' ? 'Tangki Liquid Utama' : 'Tangki Bulk Cadangan'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary & Variance Delta Card */}
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Saldo Awal Sebelumnya:</span>
                    <span className="text-slate-300 font-bold">{prevTotalInitial.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Saldo Awal Baru:</span>
                    <span className="text-amber-400 font-bold">{newTotalInitial.toFixed(2)} kg</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Selisih Penyesuaian (Delta):</span>
                    <span className={`font-bold ${deltaTotal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {deltaTotal > 0 ? `+${deltaTotal.toFixed(2)}` : deltaTotal.toFixed(2)} kg
                    </span>
                  </div>
                </div>

                {/* Justification & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Alasan / Dasar Penyesuaian Saldo Awal:
                    </label>
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="Stock Opname Awal Shift">Stock Opname Awal Shift (Verifikasi Fisik)</option>
                      <option value="Kalibrasi Timbangan & Fisik Gudang">Kalibrasi Timbangan & Fisik Gudang</option>
                      <option value="Koreksi Data Saldo Awal Periode">Koreksi Data Saldo Awal Periode</option>
                      <option value="Penyesuaian Buffer Stok Produksi">Penyesuaian Buffer Stok Produksi</option>
                      <option value="Audit Mutu & Re-stok Karung Zak">Audit Mutu & Re-stok Karung Zak</option>
                      <option value="Penyesuaian Khusus Administrator">Penyesuaian Khusus Administrator</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-300 mb-1">
                      Catatan Tambahan (Opsional):
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Hasil timbang ulang 100 zak terigu pallet A"
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md active:scale-95"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Simpan Penyesuaian Saldo Awal</span>
                  </button>
                </div>
              </form>
            ) : (
              /* History Tab */
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Log Audit Penyesuaian Saldo Awal Material oleh Administrator</span>
                  <span className="font-mono text-[11px]">Total: {recentAdjustments.length} Log</span>
                </div>

                {recentAdjustments.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                    Belum ada riwayat penyesuaian saldo awal material yang dicatat.
                  </div>
                ) : (
                  <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                    {recentAdjustments.map(adj => (
                      <div
                        key={adj.id}
                        className="bg-slate-950/80 border border-slate-800 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-amber-400 font-bold">{adj.adjustmentNumber}</span>
                            <span className="text-white font-semibold">{adj.materialName}</span>
                            {adj.materialCode && (
                              <span className="text-slate-400 font-mono text-[10px]">[{adj.materialCode}]</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                            <span>Alasan: <strong className="text-slate-200">{adj.reason}</strong></span>
                            <span>•</span>
                            <span>Oleh: <strong className="text-sky-400">{adj.adjustedBy}</strong></span>
                            {adj.notes && (
                              <>
                                <span>•</span>
                                <span className="italic text-slate-400">"{adj.notes}"</span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right font-mono shrink-0">
                          <div className="text-[10px] text-slate-400">
                            {adj.previousInitialStockKg.toFixed(1)} kg &rarr; <span className="text-white font-bold">{adj.newInitialStockKg.toFixed(1)} kg</span>
                          </div>
                          <div className={`text-xs font-bold ${adj.deltaKg >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {adj.deltaKg > 0 ? `+${adj.deltaKg.toFixed(1)}` : adj.deltaKg.toFixed(1)} kg
                          </div>
                          <div className="text-[9px] text-slate-500">
                            {new Date(adj.timestamp).toLocaleString('id-ID')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
