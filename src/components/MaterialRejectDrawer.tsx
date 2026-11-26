import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Layers, PackageX } from 'lucide-react';
import {
  AppState,
  MaterialRejectLog,
  RejectCategory,
  RejectStationType,
  ShiftNumber,
  StorageLocation
} from '../types';
import { SlideOverDrawer } from './ui/SlideOverDrawer';
import { calculateStockBalances } from '../utils/storage';
import {
  BomMaterialOption,
  REJECT_CATEGORIES,
  computeEquivalentCartonsLoss,
  getMaterialsForSkuBom,
  getMaterialsForWipBom
} from '../utils/rejectAnalytics';

interface MaterialRejectDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: AppState;
  stationType: RejectStationType;
  shift: ShiftNumber;
  dateStr: string;
  lineId?: string;
  lineName?: string;
  machineId?: string;
  machineName?: string;
  skuId?: string;
  skuName?: string;
  skuCode?: string;
  wipId?: string;
  wipName?: string;
  recipeId?: string;
  onSubmitReject: (log: MaterialRejectLog) => void;
}

export const MaterialRejectDrawer: React.FC<MaterialRejectDrawerProps> = ({
  open,
  onOpenChange,
  state,
  stationType,
  shift,
  dateStr,
  lineId,
  lineName,
  machineId,
  machineName,
  skuId,
  skuName,
  skuCode,
  wipId,
  wipName,
  recipeId,
  onSubmitReject
}) => {
  const stockBalances = useMemo(() => calculateStockBalances(state), [state]);

  const bomOptions = useMemo<BomMaterialOption[]>(() => {
    if (stationType === 'LINE' && skuId) {
      const fromSku = getMaterialsForSkuBom(state, skuId);
      if (fromSku.length > 0) return fromSku;
    }
    if (wipId) {
      const fromWip = getMaterialsForWipBom(state, wipId, recipeId, skuId);
      if (fromWip.length > 0) return fromWip;
    }
    return (state.master.materials || []).map(mat => ({
      material: mat,
      wipId: wipId || '',
      wipName: wipName || 'Umum / Non-BOM',
      kgPerBatch: mat.weightKg || 25,
      kgPerCartonSku: 0,
      defaultSourceLocation:
        mat.type === 'liquid' && (mat.initialStockTank || 0) > 0
          ? 'STORAGE_TANK'
          : mat.source === 'Formulasi'
          ? 'WINEROTO'
          : 'CK'
    }));
  }, [state, stationType, skuId, wipId, wipName, recipeId]);

  const isFilteredByBom = Boolean(
    (stationType === 'LINE' && skuId && getMaterialsForSkuBom(state, skuId).length > 0) ||
      (wipId && getMaterialsForWipBom(state, wipId, recipeId, skuId).length > 0)
  );

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [unit, setUnit] = useState<'kg' | 'gr'>('kg');
  const [qtyInput, setQtyInput] = useState<string>('');
  const [sourceLocation, setSourceLocation] = useState<StorageLocation>('CK');
  const [category, setCategory] = useState<RejectCategory>('KEMASAN_RUSAK');
  const [operatorName, setOperatorName] = useState<string>(state.currentSession?.name || 'Operator');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const firstOpt = bomOptions[0];
    setSelectedMaterialId(firstOpt?.material.id || '');
    setSourceLocation(firstOpt?.defaultSourceLocation || 'CK');
    setUnit('kg');
    setQtyInput('');
    setCategory(stationType === 'CENTRAL_KITCHEN' ? 'ADONAN_TERBUANG' : 'KEMASAN_RUSAK');
    setOperatorName(state.currentSession?.name || 'Operator');
    setNotes('');
    setErrorMsg('');
  }, [open, bomOptions, stationType, state.currentSession?.name]);

  const selectedOption = useMemo(
    () => bomOptions.find(opt => opt.material.id === selectedMaterialId) || null,
    [bomOptions, selectedMaterialId]
  );

  const parsedInput = parseFloat(qtyInput);
  const rejectQtyKg =
    Number.isFinite(parsedInput) && parsedInput > 0
      ? unit === 'gr'
        ? parseFloat((parsedInput / 1000).toFixed(4))
        : parseFloat(parsedInput.toFixed(4))
      : 0;

  const activeSku = skuId ? state.master.skus.find(s => s.id === skuId) : undefined;

  const equivalentCartonsLoss = useMemo(
    () =>
      computeEquivalentCartonsLoss({
        rejectQtyKg,
        materialKgPerCartonSku: selectedOption?.kgPerCartonSku,
        fallbackCartonWeightKg: activeSku?.cartonWeightKg
      }),
    [rejectQtyKg, selectedOption?.kgPerCartonSku, activeSku?.cartonWeightKg]
  );

  const currentBalance = selectedMaterialId ? stockBalances[selectedMaterialId] : undefined;
  const locationStockKg = currentBalance
    ? sourceLocation === 'CK'
      ? currentBalance.stockCk
      : sourceLocation === 'WINEROTO'
      ? currentBalance.stockWineroto
      : currentBalance.stockTank
    : 0;

  const handleSelectMaterial = (matId: string) => {
    setSelectedMaterialId(matId);
    const opt = bomOptions.find(o => o.material.id === matId);
    if (opt) {
      setSourceLocation(opt.defaultSourceLocation);
    }
    setErrorMsg('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) {
      setErrorMsg('Pilih material yang mengalami reject terlebih dahulu.');
      return;
    }
    if (!Number.isFinite(parsedInput) || parsedInput <= 0 || rejectQtyKg <= 0) {
      setErrorMsg('Masukkan jumlah reject material yang valid (> 0).');
      return;
    }
    if (!operatorName.trim()) {
      setErrorMsg('Nama operator pencatat wajib diisi.');
      return;
    }

    const nowIso = new Date().toISOString();
    const newLog: MaterialRejectLog = {
      id: `rej_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowIso,
      date: dateStr,
      shift,
      stationType,
      lineId: stationType === 'LINE' ? lineId : undefined,
      lineName: stationType === 'LINE' ? lineName : undefined,
      machineId: stationType === 'CENTRAL_KITCHEN' ? machineId : undefined,
      machineName: stationType === 'CENTRAL_KITCHEN' ? machineName : undefined,
      skuId: skuId || activeSku?.id,
      skuName: skuName || activeSku?.name,
      skuCode: skuCode || activeSku?.code,
      wipId: selectedOption.wipId || wipId,
      wipName: selectedOption.wipName || wipName,
      materialId: selectedOption.material.id,
      materialCode: selectedOption.material.code,
      materialName: selectedOption.material.name,
      unit,
      rejectQtyInput: parsedInput,
      rejectQtyKg,
      sourceLocation,
      equivalentCartonsLoss,
      rejectCategory: category,
      operatorName: operatorName.trim(),
      notes: notes.trim() || undefined
    };

    onSubmitReject(newLog);
    onOpenChange(false);
  };

  return (
    <SlideOverDrawer
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      icon={<PackageX className="w-5 h-5 text-ink-rose" />}
      title="Input Reject Material Stasiun"
      description={
        stationType === 'LINE'
          ? `Stasiun Line: ${lineName || lineId || 'Line Produksi'}${skuName ? ` · SKU: ${skuName}` : ''}`
          : `Stasiun Central Kitchen: ${machineName || machineId || 'Mesin CK'}${wipName ? ` · WIP: ${wipName}` : ''}`
      }
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl border border-border-strong bg-elevated hover:bg-accent text-ink-primary text-xs font-semibold transition"
          >
            Batal
          </button>
          <button
            type="submit"
            form="material-reject-form"
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Simpan Reject &amp; Potong Stok</span>
          </button>
        </div>
      }
    >
      <form id="material-reject-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Context strip */}
        <div className="bg-canvas border border-border-subtle rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand shrink-0" />
            <span className="text-ink-secondary">
              Filter Material:{' '}
              <strong className="text-ink-primary">
                {isFilteredByBom
                  ? stationType === 'LINE'
                    ? 'Otomatis sesuai BOM SKU aktif'
                    : 'Otomatis sesuai BOM WIP aktif'
                  : 'Semua Master Material'}
              </strong>
            </span>
          </div>
          <span className="font-mono text-[11px] text-ink-secondary tabular-nums">
            Shift {shift} · {dateStr}
          </span>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-ink-rose flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Material selector */}
        <div>
          <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
            Material yang Mengalami Reject *
          </label>
          <select
            value={selectedMaterialId}
            onChange={(e) => handleSelectMaterial(e.target.value)}
            required
            className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-ink-primary font-semibold focus:outline-none focus:border-accent-primary"
          >
            <option value="">-- Pilih Material BOM --</option>
            {bomOptions.map(opt => (
              <option key={opt.material.id} value={opt.material.id}>
                [{opt.material.code || 'MAT'}] {opt.material.name} ({opt.wipName})
              </option>
            ))}
          </select>
          {currentBalance && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-ink-secondary">
              <span>
                Saldo {sourceLocation}:{' '}
                <strong className="text-ink-primary">{locationStockKg.toFixed(2)} kg</strong>
              </span>
              {selectedOption && selectedOption.kgPerCartonSku > 0 && (
                <span>
                  Rasio BOM: <strong className="text-brand">{selectedOption.kgPerCartonSku.toFixed(4)} kg/ktn</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quantity + Unit + Source Location */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Jumlah Reject *
            </label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              required
              value={qtyInput}
              onChange={(e) => {
                setQtyInput(e.target.value);
                setErrorMsg('');
              }}
              placeholder="0.00"
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-ink-primary font-mono font-bold tabular-nums focus:outline-none focus:border-accent-primary"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Satuan Input
            </label>
            <div className="grid grid-cols-2 gap-1 bg-canvas border border-border-subtle rounded-xl p-1">
              {(['kg', 'gr'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`py-1.5 rounded-lg font-mono font-bold text-xs transition ${
                    unit === u
                      ? 'bg-cyan-600 text-white'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Lokasi Potong Stok
            </label>
            <select
              value={sourceLocation}
              onChange={(e) => setSourceLocation(e.target.value as StorageLocation)}
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-ink-primary font-mono font-semibold focus:outline-none focus:border-accent-primary"
            >
              <option value="CK">Gudang CK</option>
              <option value="WINEROTO">Gudang WINEROTO</option>
              <option value="STORAGE_TANK">Storage Tank</option>
            </select>
          </div>
        </div>

        {/* Live Conversion & Impact Preview */}
        <div className="bg-canvas border border-rose-500/30 rounded-xl p-3.5 grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] text-ink-secondary block">Normalisasi Berat Reject</span>
            <span className="text-lg font-bold font-mono tabular-nums text-ink-rose">
              {rejectQtyKg.toFixed(3)} kg
            </span>
          </div>
          <div>
            <span className="text-[11px] text-ink-secondary block">Ekuivalen Quality Loss</span>
            <span className="text-lg font-bold font-mono tabular-nums text-ink-amber">
              {equivalentCartonsLoss.toFixed(2)} ktn
            </span>
          </div>
        </div>

        {/* Reject Category */}
        <div>
          <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
            Kategori Penyebab Reject (Quality Loss) *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REJECT_CATEGORIES.map(cat => {
              const selected = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`text-left p-2.5 rounded-xl border transition ${
                    selected
                      ? 'bg-rose-500/15 border-rose-500/50 text-ink-primary'
                      : 'bg-canvas border-border-subtle text-ink-secondary hover:bg-elevated'
                  }`}
                >
                  <div className="font-bold text-xs text-ink-primary">{cat.label}</div>
                  <div className="text-[10px] text-ink-secondary mt-0.5 leading-snug">
                    {cat.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Operator & Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Operator Pelapor *
            </label>
            <input
              type="text"
              required
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-ink-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-ink-secondary mb-1.5">
              Catatan Tambahan (Opsional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Misal: Zak bocor saat tuang ke hopper"
              className="w-full bg-elevated border border-border-strong rounded-xl px-3 py-2.5 text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>
      </form>
    </SlideOverDrawer>
  );
};
