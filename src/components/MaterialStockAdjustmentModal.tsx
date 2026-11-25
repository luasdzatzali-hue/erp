import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Sliders,
  Scale,
  Warehouse,
  Building2,
  Cylinder,
  History,
  Search,
  Save,
  RotateCcw,
} from 'lucide-react';
import { AppState } from '../types';
import { calculateStockBalances } from '../utils/storage';
import { resolveEffectiveRole } from '../utils/roleAccess';
import { SlideOverDrawer } from './ui/SlideOverDrawer';

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
  showToast,
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

  // Admin permission check (Single Source of Truth)
  const effectiveRole = resolveEffectiveRole(state);
  const isAdmin = effectiveRole.isAdmin;

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
  const isSolidOrPowder =
    selectedMaterial?.type === 'bubuk' || selectedMaterial?.type === 'padat';

  // Bags estimation
  const bagsCk = stdWeight > 0 ? (numCk / stdWeight).toFixed(1) : '0';
  const bagsWineroto = stdWeight > 0 ? (numWineroto / stdWeight).toFixed(1) : '0';

  // Filtered materials for selection
  const filteredMaterials = state.master.materials.filter(m => {
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.code && m.code.toLowerCase().includes(q))
    );
  });

  // Recent stock adjustments
  const recentAdjustments = state.transactions.stockAdjustments || [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      showToast(
        'Akses Ditolak: Hanya Administrator yang berwenang mengubah saldo awal material',
        true
      );
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
      notes: customNotes.trim() || undefined,
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

  const drawerFooter = !isAdmin ? (
    <button
      type="button"
      onClick={onClose}
      className="w-full py-2.5 px-4 bg-muted hover:bg-accent text-foreground border border-border rounded-xl text-xs font-semibold transition"
    >
      Kembali ke Aplikasi
    </button>
  ) : activeTab === 'adjust' ? (
    <div className="flex items-center justify-end gap-2.5">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 bg-muted hover:bg-accent text-foreground border border-border rounded-xl text-xs font-semibold transition whitespace-nowrap"
      >
        Batal
      </button>
      <button
        type="submit"
        form="material-stock-adjustment-form"
        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md active:scale-95 whitespace-nowrap"
      >
        <Save className="w-3.5 h-3.5 shrink-0" />
        <span>Simpan Penyesuaian Saldo Awal</span>
      </button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="font-mono tabular-nums text-muted-foreground">
        Total Audit: {recentAdjustments.length} Log
      </span>
      <button
        type="button"
        onClick={onClose}
        className="px-5 py-2 bg-muted hover:bg-accent text-foreground border border-border rounded-xl font-semibold transition whitespace-nowrap"
      >
        Tutup Panel
      </button>
    </div>
  );

  return (
    <SlideOverDrawer
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      size="xl"
      icon={<Scale className="w-5 h-5" />}
      title="Penyesuaian Saldo Awal Material"
      description="Kalibrasi saldo stok awal fisik gudang CK, WINEROTO, dan Storage Tank Liquid oleh Administrator."
      bodyClassName="space-y-4"
      footer={drawerFooter}
    >
      {!isAdmin ? (
        <div className="py-10 px-4 text-center space-y-4 bg-background border border-border rounded-xl">
          <div className="inline-flex p-3 rounded-2xl bg-tint-rose border border-tint-rose-border text-ink-rose">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h4 className="font-bold text-sm text-foreground">
              Akses Terkunci: Memerlukan Wewenang Administrator
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Anda saat ini masuk sebagai{' '}
              <strong className="text-foreground">
                {state.currentSession?.name || 'Operator'}
              </strong>{' '}
              ({effectiveRole.role}). Penyesuaian saldo awal material merupakan kewenangan ketat
              Administrator untuk menjaga integritas data MRP dan audit saldo fisik.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-border bg-background/60 rounded-t-lg">
            <button
              type="button"
              onClick={() => setActiveTab('adjust')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'adjust'
                  ? 'border-amber-500 text-ink-amber'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Form Kalibrasi Saldo Awal</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'history'
                  ? 'border-amber-500 text-ink-amber'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Riwayat Audit Penyesuaian ({recentAdjustments.length})</span>
            </button>
          </div>

          {activeTab === 'adjust' ? (
            <form
              id="material-stock-adjustment-form"
              onSubmit={handleSubmit}
              className="space-y-4 text-xs"
            >
              {/* Material Selection */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-foreground">
                  Pilih Bahan Baku / Material yang Ingin Disesuaikan
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1 relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Cari nama / kode..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl pl-8 pr-2.5 py-2 text-xs text-foreground placeholder:text-ink-muted focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      value={selectedMatId}
                      onChange={e => setSelectedMatId(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500 font-medium"
                    >
                      {filteredMaterials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.code || 'NO-CODE'}) · {m.source} ({m.packaging})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Selected Material Info Banner */}
              {selectedMaterial && (
                <div className="bg-background border border-border p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px]">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-foreground font-bold">{selectedMaterial.name}</span>
                      <span className="font-mono text-ink-amber font-semibold">
                        [{selectedMaterial.code}]
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {selectedMaterial.type.toUpperCase()} · {selectedMaterial.source}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      Standar Kemasan: {selectedMaterial.packaging} · Berat:{' '}
                      {selectedMaterial.weightKg.toFixed(2)} kg
                    </p>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <span className="text-muted-foreground text-[10px] block">
                      Total Stok Aktual Onhand (Live)
                    </span>
                    <span className="text-ink-emerald font-mono tabular-nums font-bold text-sm">
                      {currentBalance ? currentBalance.totalActual.toFixed(2) : '0.00'} kg
                    </span>
                  </div>
                </div>
              )}

              {/* Initial Stock Adjustment Fields per Storage Area */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-foreground">
                    Kalibrasi Saldo Awal Fisik Per Lokasi Penyimpanan
                  </span>
                  <button
                    type="button"
                    onClick={handleResetToCurrent}
                    className="text-[11px] text-muted-foreground hover:text-ink-amber flex items-center gap-1 transition whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Kembalikan ke Data Tersimpan</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Gudang CK */}
                  <div className="bg-background border border-border p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-foreground font-medium">
                      <span className="flex items-center gap-1.5">
                        <Warehouse className="w-3.5 h-3.5 text-ink-cyan" />
                        <span>1. Gudang CK</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        Lama: {prevCk.toFixed(1)} kg
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">
                        Saldo Awal Baru (kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={stockCk}
                        onChange={e => setStockCk(e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-foreground font-mono tabular-nums text-xs focus:outline-none focus:border-accent-primary font-bold"
                      />
                    </div>
                    {isSolidOrPowder && (
                      <div className="text-[10px] text-ink-cyan font-mono tabular-nums">
                        ≈ {bagsCk} Zak (@ {stdWeight} kg)
                      </div>
                    )}
                  </div>

                  {/* Gudang WINEROTO */}
                  <div className="bg-background border border-border p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-foreground font-medium">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-ink-amber" />
                        <span>2. Gudang WINEROTO</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        Lama: {prevWineroto.toFixed(1)} kg
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">
                        Saldo Awal Baru (kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={stockWineroto}
                        onChange={e => setStockWineroto(e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-foreground font-mono tabular-nums text-xs focus:outline-none focus:border-amber-500 font-bold"
                      />
                    </div>
                    {isSolidOrPowder && (
                      <div className="text-[10px] text-ink-amber font-mono tabular-nums">
                        ≈ {bagsWineroto} Zak (@ {stdWeight} kg)
                      </div>
                    )}
                  </div>

                  {/* Storage Tank */}
                  <div className="bg-background border border-border p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-foreground font-medium">
                      <span className="flex items-center gap-1.5">
                        <Cylinder className="w-3.5 h-3.5 text-ink-purple" />
                        <span>3. Storage Tank</span>
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                        Lama: {prevTank.toFixed(1)} kg
                      </span>
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground mb-1">
                        Saldo Awal Baru (kg)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={stockTank}
                        onChange={e => setStockTank(e.target.value)}
                        className="w-full bg-muted border border-border rounded-lg px-2.5 py-1.5 text-foreground font-mono tabular-nums text-xs focus:outline-none focus:border-purple-500 font-bold"
                      />
                    </div>
                    <div className="text-[10px] text-ink-purple font-mono">
                      {selectedMaterial?.type === 'liquid'
                        ? 'Tangki Liquid Utama'
                        : 'Tangki Bulk Cadangan'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary & Variance Delta Card */}
              <div className="bg-background p-3.5 rounded-xl border border-border grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono tabular-nums text-[11px]">
                <div>
                  <span className="text-muted-foreground block text-[10px]">
                    Saldo Awal Sebelumnya
                  </span>
                  <span className="text-foreground font-bold">
                    {prevTotalInitial.toFixed(2)} kg
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">Saldo Awal Baru</span>
                  <span className="text-ink-amber font-bold">
                    {newTotalInitial.toFixed(2)} kg
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px]">
                    Selisih Penyesuaian (Delta)
                  </span>
                  <span
                    className={`font-bold ${
                      deltaTotal >= 0 ? 'text-ink-emerald' : 'text-ink-rose'
                    }`}
                  >
                    {deltaTotal > 0 ? `+${deltaTotal.toFixed(2)}` : deltaTotal.toFixed(2)} kg
                  </span>
                </div>
              </div>

              {/* Justification & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Alasan / Dasar Penyesuaian Saldo Awal
                  </label>
                  <select
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-amber-500"
                  >
                    <option value="Stock Opname Awal Shift">
                      Stock Opname Awal Shift (Verifikasi Fisik)
                    </option>
                    <option value="Kalibrasi Timbangan & Fisik Gudang">
                      Kalibrasi Timbangan &amp; Fisik Gudang
                    </option>
                    <option value="Koreksi Data Saldo Awal Periode">
                      Koreksi Data Saldo Awal Periode
                    </option>
                    <option value="Penyesuaian Buffer Stok Produksi">
                      Penyesuaian Buffer Stok Produksi
                    </option>
                    <option value="Audit Mutu & Re-stok Karung Zak">
                      Audit Mutu &amp; Re-stok Karung Zak
                    </option>
                    <option value="Penyesuaian Khusus Administrator">
                      Penyesuaian Khusus Administrator
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Catatan Tambahan (Opsional)
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Hasil timbang ulang 100 zak terigu pallet A"
                    value={customNotes}
                    onChange={e => setCustomNotes(e.target.value)}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-ink-muted focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </form>
          ) : (
            /* History Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Log Audit Penyesuaian Saldo Awal Material oleh Administrator</span>
                <span className="font-mono tabular-nums text-[11px]">
                  Total: {recentAdjustments.length} Log
                </span>
              </div>

              {recentAdjustments.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-xs border border-dashed border-border rounded-xl bg-background">
                  Belum ada riwayat penyesuaian saldo awal material yang dicatat.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentAdjustments.map(adj => (
                    <div
                      key={adj.id}
                      className="bg-background border border-border p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono tabular-nums text-ink-amber font-bold">
                            {adj.adjustmentNumber}
                          </span>
                          <span className="text-foreground font-semibold">{adj.materialName}</span>
                          {adj.materialCode && (
                            <span className="text-muted-foreground font-mono text-[10px]">
                              [{adj.materialCode}]
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-1.5">
                          <span>
                            Alasan: <strong className="text-foreground">{adj.reason}</strong>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Oleh: <strong className="text-ink-sky">{adj.adjustedBy}</strong>
                          </span>
                          {adj.notes && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="italic">"{adj.notes}"</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right font-mono tabular-nums shrink-0">
                        <div className="text-[10px] text-muted-foreground">
                          {adj.previousInitialStockKg.toFixed(1)} kg →{' '}
                          <span className="text-foreground font-bold">
                            {adj.newInitialStockKg.toFixed(1)} kg
                          </span>
                        </div>
                        <div
                          className={`text-xs font-bold ${
                            adj.deltaKg >= 0 ? 'text-ink-emerald' : 'text-ink-rose'
                          }`}
                        >
                          {adj.deltaKg > 0
                            ? `+${adj.deltaKg.toFixed(1)}`
                            : adj.deltaKg.toFixed(1)}{' '}
                          kg
                        </div>
                        <div className="text-[9px] text-muted-foreground">
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
    </SlideOverDrawer>
  );
};
