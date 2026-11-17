import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit3,
  Check,
  Factory,
  Lock,
  Layers
} from 'lucide-react';
import { ProductionLine, ActiveSkuProductionRun } from '../types';

interface ProductionLineManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  productionLines: ProductionLine[];
  runningRuns: ActiveSkuProductionRun[];
  onAddLine: (line: Omit<ProductionLine, 'id'>) => void;
  onUpdateLine: (lineId: string, updates: Partial<ProductionLine>) => void;
  onDeleteLine: (lineId: string) => void;
  onSetLineCount: (count: number) => void;
  showToast?: (msg: string, isError?: boolean) => void;
}

const getNextAlphabetLabel = (index: number): string => {
  // 0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA
  let n = index;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
};

export const ProductionLineManagerModal: React.FC<ProductionLineManagerModalProps> = ({
  isOpen,
  onClose,
  productionLines,
  runningRuns,
  onAddLine,
  onUpdateLine,
  onDeleteLine,
  onSetLineCount,
  showToast
}) => {
  const nextAlpha = getNextAlphabetLabel(productionLines.length);
  const [newName, setNewName] = useState(`Line ${nextAlpha}`);
  const [newCode, setNewCode] = useState(`LINE-${nextAlpha}`);
  const [newDesc, setNewDesc] = useState('');
  const [targetCount, setTargetCount] = useState<string>(String(Math.max(4, productionLines.length)));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    if (isOpen) {
      const alpha = getNextAlphabetLabel(productionLines.length);
      setNewName(`Line ${alpha}`);
      setNewCode(`LINE-${alpha}`);
      setNewDesc('');
      setTargetCount(String(productionLines.length));
      setEditingId(null);
    }
  }, [isOpen, productionLines.length]);

  if (!isOpen) return null;

  const handleCreateLine = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanCode = newCode.trim().toUpperCase() || cleanName.toUpperCase().replace(/\s+/g, '-');
    if (!cleanName) {
      showToast?.('Nama line produksi wajib diisi.', true);
      return;
    }
    const duplicate = productionLines.some(
      l => l.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      showToast?.(`Line dengan nama "${cleanName}" sudah terdaftar.`, true);
      return;
    }

    onAddLine({
      name: cleanName,
      code: cleanCode,
      description: newDesc.trim() || undefined,
      isActive: true
    });
  };

  const handleStartEdit = (line: ProductionLine) => {
    setEditingId(line.id);
    setEditName(line.name);
    setEditCode(line.code);
    setEditDesc(line.description || '');
  };

  const handleSaveEdit = (lineId: string) => {
    const cleanName = editName.trim();
    if (!cleanName) {
      showToast?.('Nama line tidak boleh kosong.', true);
      return;
    }
    onUpdateLine(lineId, {
      name: cleanName,
      code: editCode.trim().toUpperCase() || cleanName.toUpperCase().replace(/\s+/g, '-'),
      description: editDesc.trim() || undefined
    });
    setEditingId(null);
  };

  const handleApplyLineCount = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(targetCount, 10);
    if (isNaN(count) || count < 1 || count > 26) {
      showToast?.('Masukkan jumlah line antara 1 sampai 26.', true);
      return;
    }
    onSetLineCount(count);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Factory className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Kustomisasi Line Produksi
              </h2>
              <p className="text-xs text-slate-400">
                Atur jumlah dan ubah nama line produksi (Line A, B, C, D, dan seterusnya).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
          {/* Quick Set Line Count */}
          <form
            onSubmit={handleApplyLineCount}
            className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-center space-x-2.5">
              <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <p className="font-semibold text-white">Atur Jumlah Line Cepat (A, B, C, D...)</p>
                <p className="text-[11px] text-slate-400">
                  Otomatis menambah atau menyesuaikan jumlah line aktif tanpa mengganggu line yang sedang berjalan.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <input
                type="number"
                min={1}
                max={26}
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
                className="w-20 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-center font-mono font-bold text-white focus:outline-none focus:border-cyan-500 tabular-nums"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold transition whitespace-nowrap"
              >
                Terapkan Jumlah
              </button>
            </div>
          </form>

          {/* Add Custom Line Form */}
          <form
            onSubmit={handleCreateLine}
            className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-3"
          >
            <p className="font-semibold text-white">Tambah Line Produksi Baru</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Nama Line</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Line E / Line Wafer 1"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Kode Line</label>
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. LINE-E"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Keterangan (Opsional)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Biskuit & Coating"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center space-x-1.5 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Line Produksi</span>
              </button>
            </div>
          </form>

          {/* Existing Lines List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white">
                Daftar Line Produksi Terdaftar ({productionLines.length})
              </p>
              <span className="text-[11px] text-slate-400">
                Klik ikon edit untuk mengubah nama line
              </span>
            </div>

            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              {productionLines.map((line) => {
                const activeRun = runningRuns.find(r => r.lineId === line.id && r.isRunning);
                const isEditing = editingId === line.id;

                return (
                  <div
                    key={line.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-800/30 transition"
                  >
                    {isEditing ? (
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-slate-800 border border-cyan-500/60 rounded-lg px-2.5 py-1.5 text-white font-semibold focus:outline-none"
                          placeholder="Nama Line"
                        />
                        <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-white focus:outline-none"
                          placeholder="Kode Line"
                        />
                        <input
                          type="text"
                          value={editDesc}
                          onChange={(e) => setEditDesc(e.target.value)}
                          className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none"
                          placeholder="Deskripsi"
                        />
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{line.name}</span>
                          <span className="text-[11px] font-mono text-slate-400">· {line.code}</span>
                          {activeRun && (
                            <span className="text-[11px] font-medium text-emerald-400 flex items-center space-x-1">
                              <span>·</span>
                              <Lock className="w-3 h-3" />
                              <span>Sedang Jalan: {activeRun.skuName}</span>
                            </span>
                          )}
                        </div>
                        {line.description && (
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{line.description}</p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center space-x-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(line.id)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center space-x-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Simpan</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
                          >
                            Batal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(line)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Ubah nama line"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(activeRun) || productionLines.length <= 1}
                            onClick={() => onDeleteLine(line.id)}
                            className="p-2 rounded-lg bg-slate-800 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 disabled:opacity-35 disabled:cursor-not-allowed transition"
                            title={
                              activeRun
                                ? 'Tidak dapat menghapus line yang sedang berjalan'
                                : productionLines.length <= 1
                                ? 'Minimal harus ada 1 line produksi'
                                : 'Hapus line ini'
                            }
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};
