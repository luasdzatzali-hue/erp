import React from 'react';
import { Cpu } from 'lucide-react';

export const ScadaLoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center min-h-[320px] p-6">
    <div className="bg-slate-950/90 border border-cyan-500/30 rounded-2xl px-7 py-6 shadow-2xl flex flex-col items-center gap-3 text-center">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
        <span className="absolute inset-1.5 rounded-full border border-emerald-400/20 border-b-emerald-400 animate-spin" />
        <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
      </div>
      <div className="space-y-0.5">
        <p className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
          SCADA TELEMETRY // LOADING MODULE
        </p>
        <p className="text-[11px] text-slate-400">Menghubungkan sinkronisasi modul operasional...</p>
      </div>
    </div>
  </div>
);
