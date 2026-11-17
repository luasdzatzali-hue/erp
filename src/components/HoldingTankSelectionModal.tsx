import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Cylinder,
  CheckCircle2,
  AlertTriangle,
  Play,
  Package,
  Layers,
  Info
} from 'lucide-react';
import { AppState } from '../types';
import {
  getSkusRequiringHoldingTankChoice,
  getSkuWipsWithMultipleHoldingTanks,
  pickDefaultHoldingTankId
} from '../utils/skuTankHelper';

export interface PendingLineSkuAssignment {
  key: string; // Unique key e.g. lineId (or skuId for legacy callers)
  lineId?: string;
  lineName?: string;
  skuId: string;
  plannedCartons?: number;
}

interface HoldingTankSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  pendingSkuIds?: string[];
  pendingAssignments?: PendingLineSkuAssignment[];
  initialSelectionsBySku?: Record<string, Record<string, string>>;
  onConfirmStart?: (selectionsBySku: Record<string, Record<string, string>>) => void;
  onConfirmAssignments?: (selectionsByKey: Record<string, Record<string, string>>) => void;
}

export const HoldingTankSelectionModal: React.FC<HoldingTankSelectionModalProps> = ({
  isOpen,
  onClose,
  state,
  pendingSkuIds = [],
  pendingAssignments,
  initialSelectionsBySku,
  onConfirmStart,
  onConfirmAssignments
}) => {
  const [selectionsByKey, setSelectionsByKey] = useState<Record<string, Record<string, string>>>({});

  const requirements = useMemo(() => {
    if (pendingAssignments && pendingAssignments.length > 0) {
      return pendingAssignments
        .map(assign => {
          const sku = state.master.skus.find(s => s.id === assign.skuId);
          if (!sku) return null;
          const multiHoldingWips = getSkuWipsWithMultipleHoldingTanks(assign.skuId, state);
          if (multiHoldingWips.length === 0) return null;
          return {
            key: assign.key,
            lineId: assign.lineId,
            lineName: assign.lineName,
            plannedCartons: assign.plannedCartons,
            sku,
            multiHoldingWips
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    return getSkusRequiringHoldingTankChoice(pendingSkuIds, state).map(req => ({
      key: req.sku.id,
      lineId: undefined,
      lineName: undefined,
      plannedCartons: undefined,
      sku: req.sku,
      multiHoldingWips: req.multiHoldingWips
    }));
  }, [pendingAssignments, pendingSkuIds, state]);

  const signature = requirements.map(r => `${r.key}:${r.sku.id}`).join('|');

  useEffect(() => {
    if (!isOpen) return;
    const init: Record<string, Record<string, string>> = {};
    for (const req of requirements) {
      init[req.key] = {};
      for (const item of req.multiHoldingWips) {
        const pre =
          initialSelectionsBySku?.[req.key]?.[item.wip.id] ||
          initialSelectionsBySku?.[req.sku.id]?.[item.wip.id];
        const isPreValid = pre && item.holdingTanks.some(t => t.id === pre);
        init[req.key][item.wip.id] = isPreValid
          ? pre
          : pickDefaultHoldingTankId(item.holdingTanks);
      }
    }
    setSelectionsByKey(init);
  }, [isOpen, signature, state.master.tanks.length]);

  if (!isOpen || requirements.length === 0) return null;

  const handleSelectTank = (key: string, wipId: string, tankId: string) => {
    setSelectionsByKey(prev => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        [wipId]: tankId
      }
    }));
  };

  const handleConfirm = () => {
    if (onConfirmAssignments) {
      onConfirmAssignments(selectionsByKey);
    } else if (onConfirmStart) {
      onConfirmStart(selectionsByKey);
    }
    onClose();
  };

  const allChosenHaveStock = requirements.every(req =>
    req.multiHoldingWips.every(item => {
      const chosenId = selectionsByKey[req.key]?.[item.wip.id];
      const tank = item.holdingTanks.find(t => t.id === chosenId);
      return tank && tank.currentLevelKg >= item.skuWip.kgWipPerCartonSku;
    })
  );

  const totalRunCount = pendingAssignments ? pendingAssignments.length : pendingSkuIds.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-cyan-500/15 text-cyan-400 rounded-xl border border-cyan-500/30">
              <Cylinder className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex flex-wrap items-center gap-2">
                <span>Pilih Sumber Holding Tank Produksi SKU</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Multi-Holding Tank
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                BOM WIP berikut terkonfigurasi bisa diambil dari 2 atau lebih Holding Tank berbeda. Pilih Holding Tank untuk setiap Line Produksi sebelum memulai.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-3 flex items-start space-x-2.5 text-cyan-200">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span className="text-[11px] leading-relaxed">
              Sistem hanya memotong isi dari <strong>Holding Tank yang dipilih</strong> untuk masing-masing Line Produksi sesuai rasio BOM. Holding Tank lain tetap aman untuk line atau SKU lain.
            </span>
          </div>

          {requirements.map(({ key, lineName, plannedCartons, sku, multiHoldingWips }) => (
            <div
              key={key}
              className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4"
            >
              {/* Line & SKU Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-lg bg-slate-800 text-cyan-400">
                    <Package className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-white flex flex-wrap items-center gap-2">
                      {lineName && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-600 text-white font-bold">
                          {lineName}
                        </span>
                      )}
                      <span>{sku.name}</span>
                      {sku.code && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          {sku.code}
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      Target: {sku.targetHour} karton/jam
                      {plannedCartons ? ` · Planning Shift: ${plannedCartons.toLocaleString()} karton` : ''}
                      {` · ${multiHoldingWips.length} WIP multi Holding Tank`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Each WIP that has >= 2 Holding Tanks */}
              <div className="space-y-3">
                {multiHoldingWips.map(({ skuWip, wip, holdingTanks }) => {
                  const selectedTankId = selectionsByKey[key]?.[wip.id] || '';

                  return (
                    <div key={wip.id} className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <Layers className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-bold text-slate-100">
                            WIP: {wip.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {wip.code}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-cyan-400 font-semibold">
                          BOM: {skuWip.kgWipPerCartonSku.toFixed(4)} kg / karton
                        </span>
                      </div>

                      {/* Holding Tank Radio Cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {holdingTanks.map(tank => {
                          const isSelected = selectedTankId === tank.id;
                          const pct = tank.capacityKg > 0
                            ? Math.min(100, Math.round((tank.currentLevelKg / tank.capacityKg) * 100))
                            : 0;
                          const estCartons = skuWip.kgWipPerCartonSku > 0
                            ? Math.floor(tank.currentLevelKg / skuWip.kgWipPerCartonSku)
                            : 0;
                          const isLow = tank.currentLevelKg <= (tank.minAlertKg || tank.capacityKg * 0.2);
                          const isInactive = tank.status !== 'ACTIVE';

                          return (
                            <button
                              key={tank.id}
                              type="button"
                              onClick={() => handleSelectTank(key, wip.id, tank.id)}
                              className={`text-left p-3 rounded-xl border-2 transition relative ${
                                isSelected
                                  ? 'bg-cyan-950/50 border-cyan-400 shadow-md shadow-cyan-500/10'
                                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center space-x-1.5">
                                    <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${
                                      isSelected
                                        ? 'bg-cyan-500 text-slate-950'
                                        : 'bg-slate-800 text-cyan-300'
                                    }`}>
                                      {tank.code}
                                    </span>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      tank.status === 'ACTIVE'
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                    }`}>
                                      {tank.status}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-white block mt-1.5 truncate">
                                    {tank.name}
                                  </span>
                                </div>

                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                                  isSelected
                                    ? 'bg-cyan-400 border-cyan-300 text-slate-950'
                                    : 'border-slate-600 bg-slate-800'
                                }`}>
                                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                                </div>
                              </div>

                              {/* Level bar */}
                              <div className="mt-2.5 space-y-1">
                                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                  <span className="text-slate-300">
                                    Isi: <strong className="text-white">{tank.currentLevelKg.toFixed(1)}</strong> / {tank.capacityKg} kg ({pct}%)
                                  </span>
                                  <span className={isLow ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                    ±{estCartons.toLocaleString()} ktn
                                  </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all ${
                                      isLow ? 'bg-rose-500' : 'bg-cyan-400'
                                    }`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>

                              {isInactive && (
                                <div className="mt-2 text-[10px] text-amber-300 flex items-center space-x-1">
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                  <span>Status tangki saat ini: {tank.status}</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!allChosenHaveStock && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl flex items-center space-x-2 text-rose-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Perhatian: Salah satu Holding Tank yang dipilih memiliki stok di bawah kebutuhan 1 karton SKU. Produksi mungkin langsung berhenti jika tangki kosong.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 flex items-center space-x-2 transition active:scale-95"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>
              Konfirmasi Holding Tank &amp; Mulai Produksi ({totalRunCount} {pendingAssignments ? 'Line' : 'SKU'})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
