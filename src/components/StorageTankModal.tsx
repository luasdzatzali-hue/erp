import React from 'react';
import {
  Droplet,
  Thermometer,
  Gauge,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { TankState } from '../types';
import { SlideOverDrawer } from './ui/SlideOverDrawer';

interface StorageTankModalProps {
  isOpen: boolean;
  onClose: () => void;
  tank: TankState;
  onUpdateTank: (updated: Partial<TankState>) => void;
}

export const StorageTankModal: React.FC<StorageTankModalProps> = ({
  isOpen,
  onClose,
  tank,
  onUpdateTank,
}) => {
  const percentage = Math.min(100, Math.max(0, (tank.level / tank.maxCapacity) * 100));
  const isTempNormal = tank.temp >= tank.minTempTarget && tank.temp <= tank.maxTempTarget;
  const isTempLow = tank.temp < tank.minTempTarget;
  const isTempHigh = tank.temp > tank.maxTempTarget;

  return (
    <SlideOverDrawer
      open={isOpen}
      onOpenChange={open => {
        if (!open) onClose();
      }}
      size="md"
      icon={<Droplet className="w-5 h-5" />}
      title={`Storage Tank Liquid (${tank.maxCapacity.toLocaleString('id-ID')} kg)`}
      description="Monitoring suhu & volume otomatis — panel geser kanan agar status lini tetap terlihat."
      bodyClassName="space-y-4"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-muted hover:bg-accent text-foreground border border-border font-semibold rounded-xl text-xs transition whitespace-nowrap"
        >
          Tutup Panel Tangki
        </button>
      }
    >
      {/* Tank Level Gauge */}
      <div className="bg-background border border-border p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-ink-cyan shrink-0" />
            <span>Kapasitas Tangki Aktual</span>
          </span>
          <span className="text-base font-bold font-mono tabular-nums text-ink-cyan">
            {tank.level.toFixed(2)}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              / {tank.maxCapacity.toFixed(0)} kg
            </span>
          </span>
        </div>

        {/* Liquid Visual Bar */}
        <div className="relative w-full h-7 bg-muted rounded-xl overflow-hidden border border-border">
          <div
            className="h-full bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-400 transition-all duration-500 flex items-center justify-end pr-2"
            style={{ width: `${percentage}%` }}
          >
            {percentage > 15 && (
              <span className="text-[10px] font-mono tabular-nums font-bold text-slate-950 tracking-wider">
                {percentage.toFixed(1)}%
              </span>
            )}
          </div>
          {percentage <= 15 && (
            <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-mono tabular-nums text-ink-cyan font-bold">
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="flex justify-between text-[10px] font-mono tabular-nums text-muted-foreground">
          <span>0 kg (Kosong)</span>
          <span>{Math.round(tank.maxCapacity / 2)} kg (50%)</span>
          <span>{tank.maxCapacity.toFixed(0)} kg (Penuh)</span>
        </div>
      </div>

      {/* Temperature Sensor & Heater Control */}
      <div className="bg-background border border-border p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Thermometer className="w-4 h-4 text-ink-amber shrink-0" />
            <span>Suhu Liquid Tangki</span>
          </span>
          <span
            className={`font-bold font-mono tabular-nums px-2.5 py-0.5 rounded-lg border text-xs ${
              isTempNormal
                ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                : 'bg-tint-amber text-ink-amber border-tint-amber-border'
            }`}
          >
            {tank.temp.toFixed(1)}°C
          </span>
        </div>

        <div className="p-2.5 rounded-lg bg-muted border border-border flex items-center gap-2 text-xs">
          {isTempNormal ? (
            <CheckCircle className="w-4 h-4 text-ink-emerald shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-ink-amber shrink-0" />
          )}
          <span className="text-foreground leading-relaxed">
            {isTempNormal &&
              `Suhu dalam rentang standar operasional (${tank.minTempTarget.toFixed(1)}°C – ${tank.maxTempTarget.toFixed(1)}°C).`}
            {isTempLow &&
              `Suhu di bawah batas minimum (${tank.minTempTarget}°C). Pemanas jacket perlu diaktifkan.`}
            {isTempHigh &&
              `Suhu di atas batas maksimum (${tank.maxTempTarget}°C). Sirkulasi pendingin diperlukan.`}
          </span>
        </div>

        {/* Temperature manual slider */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Kalibrasi Sensor / Uji Suhu:</span>
            <span className="font-mono tabular-nums font-semibold text-ink-cyan">
              {tank.temp.toFixed(1)}°C
            </span>
          </div>
          <input
            type="range"
            min="35"
            max="65"
            step="0.5"
            value={tank.temp}
            onChange={e => onUpdateTank({ temp: parseFloat(e.target.value) })}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-muted-foreground">Simulasi Fluktuasi Sensor:</span>
          <button
            type="button"
            onClick={() => onUpdateTank({ isSimulationActive: !tank.isSimulationActive })}
            className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition whitespace-nowrap ${
              tank.isSimulationActive
                ? 'bg-tint-emerald text-ink-emerald border-tint-emerald-border'
                : 'bg-muted text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {tank.isSimulationActive ? 'Aktif (Auto)' : 'Jeda (Manual)'}
          </button>
        </div>
      </div>

      {/* Rules info */}
      <div className="bg-background p-3.5 rounded-xl border border-border text-[11px] text-muted-foreground space-y-1.5">
        <p className="font-bold text-foreground">SOP Tangki Liquid</p>
        <ul className="list-disc list-inside space-y-1 leading-relaxed">
          <li>Penerimaan material jenis liquid dapat dialokasikan langsung ke Storage Tank.</li>
          <li>Pemakaian WIP liquid memotong otomatis persediaan di Storage Tank Liquid.</li>
          <li>Suhu optimal 45–55°C menjaga viskositas sirup tetap stabil untuk feeding pipa.</li>
        </ul>
      </div>
    </SlideOverDrawer>
  );
};
