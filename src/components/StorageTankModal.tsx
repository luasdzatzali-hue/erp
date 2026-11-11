import React from 'react';
import { X, Droplet, Thermometer, Flame, Gauge, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { TankState } from '../types';

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
  onUpdateTank
}) => {
  if (!isOpen) return null;

  const percentage = Math.min(100, Math.max(0, (tank.level / tank.maxCapacity) * 100));
  const isTempNormal = tank.temp >= tank.minTempTarget && tank.temp <= tank.maxTempTarget;
  const isTempLow = tank.temp < tank.minTempTarget;
  const isTempHigh = tank.temp > tank.maxTempTarget;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center space-x-2 text-cyan-400">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <Droplet className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Storage Tank Liquid (1.000 kg)</h3>
              <p className="text-[11px] text-slate-400">Monitoring Suhu & Volume Otomatis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tank Level Gauge */}
        <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 flex items-center space-x-1.5">
              <Gauge className="w-4 h-4 text-cyan-400" />
              <span>Kapasitas Tangki Aktual</span>
            </span>
            <span className="text-base font-bold font-mono text-cyan-400">
              {tank.level.toFixed(2)} <span className="text-xs font-normal text-slate-400">/ {tank.maxCapacity.toFixed(0)} kg</span>
            </span>
          </div>

          {/* Liquid Visual Bar */}
          <div className="relative w-full h-7 bg-slate-950 rounded-xl overflow-hidden border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-cyan-600 via-teal-500 to-emerald-400 transition-all duration-500 flex items-center justify-end pr-2"
              style={{ width: `${percentage}%` }}
            >
              {percentage > 15 && (
                <span className="text-[10px] font-bold text-slate-950 tracking-wider">
                  {percentage.toFixed(1)}%
                </span>
              )}
            </div>
            {percentage <= 15 && (
              <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-mono text-cyan-300">
                {percentage.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>0 kg (Kosong)</span>
            <span>500 kg (50%)</span>
            <span>1000 kg (Penuh)</span>
          </div>
        </div>

        {/* Temperature Sensor & Heater Control */}
        <div className="bg-slate-800/60 border border-slate-700/60 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300 flex items-center space-x-1.5">
              <Thermometer className="w-4 h-4 text-amber-400" />
              <span>Suhu Liquid Tangki</span>
            </span>
            <div className="flex items-center space-x-2">
              <span className={`text-base font-bold font-mono px-2 py-0.5 rounded border text-xs ${
                isTempNormal
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
              }`}>
                {tank.temp.toFixed(1)}°C
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              {isTempNormal ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-slate-300">
                {isTempNormal && "Suhu dalam rentang standar operasional (45.0°C – 55.0°C)."}
                {isTempLow && "Suhu di bawah batas minimum (45°C). Pemanas jacket perlu diaktifkan."}
                {isTempHigh && "Suhu di atas batas maksimum (55°C). Sirkulasi pendingin diperlukan."}
              </span>
            </div>
          </div>

          {/* Temperature manual slider */}
          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Kalibrasi Sensor / Uji Suhu:</span>
              <span className="font-mono text-cyan-400">{tank.temp.toFixed(1)}°C</span>
            </div>
            <input
              type="range"
              min="35"
              max="65"
              step="0.5"
              value={tank.temp}
              onChange={(e) => onUpdateTank({ temp: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-slate-400">Simulasi Fluktuasi Sensor:</span>
            <button
              onClick={() => onUpdateTank({ isSimulationActive: !tank.isSimulationActive })}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition ${
                tank.isSimulationActive
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {tank.isSimulationActive ? 'Aktif (Auto)' : 'Jeda (Manual)'}
            </button>
          </div>
        </div>

        {/* Rules info */}
        <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
          <p className="font-semibold text-slate-300">SOP Tangki Liquid:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Penerimaan material jenis liquid dapat dialokasikan langsung ke Storage Tank.</li>
            <li>Pemakaian WIP liquid memotong otomatis persediaan di Storage Tank Liquid.</li>
            <li>Suhu optimal 45–55°C menjaga viskositas sirup tetap stabil untuk feeding pipa.</li>
          </ul>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition"
        >
          Tutup Panel Tangki
        </button>
      </div>
    </div>
  );
};
