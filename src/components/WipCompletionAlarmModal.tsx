import React, { useEffect } from 'react';
import {
  BellRing,
  CheckCircle2,
  Cylinder,
  Layers,
  ArrowRight,
  Flame,
  Volume2,
  Sparkles
} from 'lucide-react';
import { WipProductionBatch, WipTank, ProductionMachine } from '../types';
import { playWipCompletionChime } from '../utils/soundAlarm';

interface WipCompletionAlarmModalProps {
  completedBatch: WipProductionBatch | null;
  onDismiss: () => void;
  onNavigateToTanks?: () => void;
  tanks: WipTank[];
  machines: ProductionMachine[];
}

export const WipCompletionAlarmModal: React.FC<WipCompletionAlarmModalProps> = ({
  completedBatch,
  onDismiss,
  onNavigateToTanks,
  tanks,
  machines
}) => {
  useEffect(() => {
    if (completedBatch) {
      // Play synthesized completion chime
      playWipCompletionChime();
    }
  }, [completedBatch]);

  if (!completedBatch) return null;

  const targetTank = tanks.find(t => t.id === completedBatch.targetTankId);
  const machine = machines.find(m => m.id === completedBatch.targetMachineId);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-gradient-to-br from-surface via-surface to-tint-amber border-2 border-amber-500/60 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden shadow-amber-500/20 my-6 animate-in zoom-in-95 duration-200">
        {/* Glowing Alarm Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 p-5 sm:p-6 text-slate-950 flex items-center space-x-3.5">
          <div className="p-3 bg-canvas text-ink-amber rounded-2xl shadow-lg animate-bounce">
            <BellRing className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-950">
                ALARM SELESAI PRODUKSI WIP
              </span>
            </div>
            <p className="text-xs font-semibold text-amber-950/90 mt-0.5">
              Proses batching di lantai produksi telah rampung 100% sesuai durasi BOM!
            </p>
          </div>
        </div>

        {/* Batch Details Card (Samsung One UI Squircle Card) */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="bg-canvas border border-border-subtle rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
              <span className="text-xs text-ink-secondary font-mono">Kode Perintah Kerja:</span>
              <span className="font-mono text-sm font-bold text-ink-amber bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                {completedBatch.batchCode}
              </span>
            </div>

            <div>
              <span className="text-[10px] text-ink-secondary block uppercase font-mono">Jenis Formula WIP Selesai:</span>
              <h4 className="font-bold text-ink-primary text-base mt-0.5">
                {completedBatch.wipName}
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="bg-surface p-2 rounded-xl border border-border-subtle">
                <span className="text-[10px] text-ink-secondary block font-mono">Total Massa:</span>
                <span className="font-mono font-bold text-ink-emerald text-sm">
                  {completedBatch.batchWeightKg.toFixed(2)} kg
                </span>
              </div>

              <div className="bg-surface p-2 rounded-xl border border-border-subtle">
                <span className="text-[10px] text-ink-secondary block font-mono">Mesin Pemroses:</span>
                <span className="font-semibold text-brand truncate block">
                  {machine ? `${machine.code} - ${machine.name}` : 'Mesin Terdaftar'}
                </span>
              </div>

              <div className="bg-surface p-2 rounded-xl border border-border-subtle">
                <span className="text-[10px] text-ink-secondary block font-mono">Durasi Proses:</span>
                <span className="font-mono font-semibold text-ink-amber">
                  {completedBatch.durationMinutes || 30} Menit
                </span>
              </div>
            </div>

            {/* Target Tank Inflow Notification */}
            {targetTank && (
              <div className="bg-tint-cyan border border-cyan-500/30 rounded-xl p-3 flex items-start space-x-2.5 text-xs text-brand">
                <Cylinder className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-ink-primary">
                    Otomatis Ditransfer ke {targetTank.code} ({targetTank.name})
                  </p>
                  <p className="text-[11px] text-brand mt-0.5">
                    Massa {completedBatch.batchWeightKg.toFixed(1)} kg telah otomatis ditambahkan ke tangki {targetTank.type === 'HOLDING_TANK' ? 'Holding Tank' : 'Storage Tank'}.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onDismiss}
              className="w-full sm:flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl text-xs transition shadow-lg shadow-amber-500/30 flex items-center justify-center space-x-2 active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Matikan Alarm & Konfirmasi</span>
            </button>

            {onNavigateToTanks && (
              <button
                type="button"
                onClick={() => {
                  onDismiss();
                  onNavigateToTanks();
                }}
                className="w-full sm:w-auto py-3 px-4 bg-elevated hover:bg-accent text-ink-primary font-semibold rounded-2xl text-xs transition border border-border-strong flex items-center justify-center space-x-1.5 active:scale-95"
              >
                <span>Lihat di Tangki</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
