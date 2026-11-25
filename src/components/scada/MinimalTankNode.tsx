import React from 'react';
import { Settings, RotateCw, Thermometer, AlertTriangle, Droplets } from 'lucide-react';
import { WipTank, WIP } from '../../types';

interface MinimalTankNodeProps {
  tank: WipTank;
  wip?: WIP;
  onOpenSettings: (tank: WipTank) => void;
  inletPortRef?: (el: HTMLDivElement | null) => void;
  outletPortRef?: (el: HTMLDivElement | null) => void;
  isSelected?: boolean;
  isFlowingIn?: boolean;
  isFlowingOut?: boolean;
}

export const MinimalTankNode: React.FC<MinimalTankNodeProps> = ({
  tank,
  wip,
  onOpenSettings,
  inletPortRef,
  outletPortRef,
  isSelected = false,
  isFlowingIn = false,
  isFlowingOut = false,
}) => {
  const capacity = tank.capacityKg > 0 ? tank.capacityKg : 1;
  const percent = Math.max(0, Math.min(100, (tank.currentLevelKg / capacity) * 100));
  const minAlertThreshold = tank.minAlertKg ?? capacity * 0.2;
  const isCip = tank.status === 'CIP' || tank.status === 'CLEANING';
  const isMaintenance = tank.status === 'MAINTENANCE';
  const isEmpty = tank.status === 'EMPTY' || (tank.currentLevelKg <= 0.05 && !isCip);
  const isLow = !isCip && !isEmpty && tank.currentLevelKg <= minAlertThreshold;

  // Determine visual palette based on SCADA status
  let liquidStart = '#06b6d4'; // Normal Cyan
  let liquidEnd = '#0891b2';
  let strokeAccent = 'border-border-subtle';
  let statusTextClass = 'text-ink-cyan';

  if (isCip) {
    liquidStart = '#3b82f6'; // Blue CIP
    liquidEnd = '#2563eb';
    strokeAccent = 'border-blue-500/60';
    statusTextClass = 'text-blue-400';
  } else if (isMaintenance) {
    liquidStart = '#64748b'; // Maintenance Slate
    liquidEnd = '#475569';
    strokeAccent = 'border-amber-500/50';
    statusTextClass = 'text-ink-amber';
  } else if (isLow) {
    liquidStart = percent < 10 ? '#f43f5e' : '#f59e0b'; // Low-Level Warning Rose/Amber
    liquidEnd = percent < 10 ? '#e11d48' : '#d97706';
    strokeAccent = percent < 10 ? 'border-rose-500/70' : 'border-amber-500/60';
    statusTextClass = percent < 10 ? 'text-ink-rose' : 'text-ink-amber';
  } else if (isSelected) {
    strokeAccent = 'border-cyan-500';
  }

  // Unique SVG gradient ID per tank
  const gradientId = `tank-liq-${tank.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clipId = `tank-clip-${tank.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Liquid height inside the SVG cylinder body (y=18 to y=134 => height 116)
  const vesselTop = 18;
  const vesselHeight = 116;
  const displayPercent = isCip ? Math.max(35, percent) : percent;
  const fillHeight = (displayPercent / 100) * vesselHeight;
  const fillY = vesselTop + (vesselHeight - fillHeight);

  return (
    <div
      className={`relative bg-surface border rounded-2xl p-3.5 transition-all duration-200 select-none shadow-sm hover:shadow-md ${strokeAccent} ${
        isSelected ? 'ring-2 ring-cyan-500/40 bg-elevated/70' : ''
      }`}
    >
      {/* Left Inlet Pipe Port */}
      <div
        ref={inletPortRef}
        aria-hidden="true"
        className={`absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10 transition-colors ${
          isFlowingIn
            ? 'bg-cyan-500 border-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.8)]'
            : 'bg-elevated border-border-strong'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isFlowingIn ? 'bg-white animate-pulse' : 'bg-ink-muted'}`} />
      </div>

      {/* Right Outlet Pipe Port */}
      <div
        ref={outletPortRef}
        aria-hidden="true"
        className={`absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center z-10 transition-colors ${
          isFlowingOut
            ? 'bg-emerald-500 border-emerald-200 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
            : 'bg-elevated border-border-strong'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isFlowingOut ? 'bg-white animate-pulse' : 'bg-ink-muted'}`} />
      </div>

      {/* Top Header: Code, Type & Single Gear Icon Button */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-extrabold text-brand bg-tint-cyan px-2 py-0.5 rounded-md border border-cyan-500/30">
              {tank.code}
            </span>
            <span
              className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                tank.type === 'STORAGE_TANK'
                  ? 'bg-indigo-500/10 text-ink-indigo border-indigo-500/30'
                  : 'bg-amber-500/10 text-ink-amber border-amber-500/30'
              }`}
            >
              {tank.type === 'STORAGE_TANK' ? 'STORAGE' : 'HOLDING'}
            </span>
          </div>
          <h4 className="text-xs font-bold text-ink-primary truncate mt-1" title={tank.name}>
            {tank.name}
          </h4>
        </div>

        {/* Single Gear Icon Action */}
        <button
          type="button"
          onClick={() => onOpenSettings(tank)}
          aria-label={`Pengaturan & Kontrol Tangki ${tank.code}`}
          title="Buka Panel Kontrol & Pengaturan Tangki"
          className="p-1.5 rounded-lg bg-elevated hover:bg-accent text-ink-secondary hover:text-brand border border-border-strong transition-all active:scale-95 shrink-0"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Center: Cylindrical SVG Vessel with Dynamic Liquid & Telemetry Overlay */}
      <div className="relative flex flex-col items-center justify-center my-2">
        <div className="relative w-32 h-36 flex items-center justify-center">
          <svg
            viewBox="0 0 120 144"
            className="w-full h-full overflow-visible drop-shadow-sm"
            role="img"
            aria-label={`Visual tangki ${tank.code}: ${percent.toFixed(0)}%`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={liquidStart} stopOpacity="0.95" />
                <stop offset="100%" stopColor={liquidEnd} stopOpacity="0.88" />
              </linearGradient>
              <clipPath id={clipId}>
                <path d="M 16 24 C 16 14, 104 14, 104 24 L 104 122 C 104 134, 16 134, 16 122 Z" />
              </clipPath>
            </defs>

            {/* Vessel Outer Shell */}
            <path
              d="M 16 24 C 16 14, 104 14, 104 24 L 104 122 C 104 134, 16 134, 16 122 Z"
              className="fill-canvas stroke-border-strong"
              strokeWidth="2.5"
            />

            {/* Liquid Level Clipped Inside Vessel */}
            <g clipPath={`url(#${clipId})`}>
              {(displayPercent > 0.5 || isCip) && (
                <g
                  style={{
                    transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <rect
                    x="14"
                    y={fillY}
                    width="92"
                    height={fillHeight + 16}
                    fill={`url(#${gradientId})`}
                    className={`transition-all duration-700 ease-out ${isCip ? 'animate-pulse' : ''}`}
                  />
                  {/* Liquid Top Meniscus Highlight */}
                  <ellipse
                    cx="60"
                    cy={fillY}
                    rx="44"
                    ry="4"
                    fill="#ffffff"
                    fillOpacity="0.28"
                    className="transition-all duration-700 ease-out"
                  />
                </g>
              )}

              {/* Subtle Graduation Lines */}
              {[0.25, 0.5, 0.75].map((ratio) => {
                const gy = vesselTop + vesselHeight * (1 - ratio);
                return (
                  <line
                    key={ratio}
                    x1="18"
                    y1={gy}
                    x2="28"
                    y2={gy}
                    stroke="currentColor"
                    className="text-ink-muted/50"
                    strokeWidth="1.2"
                  />
                );
              })}
            </g>

            {/* Top Ellipse Rim */}
            <ellipse
              cx="60"
              cy="24"
              rx="44"
              ry="7"
              className="fill-elevated/50 stroke-border-strong"
              strokeWidth="2"
            />

            {/* Vessel Legs */}
            <line x1="28" y1="130" x2="24" y2="140" className="stroke-border-strong" strokeWidth="3" strokeLinecap="round" />
            <line x1="92" y1="130" x2="96" y2="140" className="stroke-border-strong" strokeWidth="3" strokeLinecap="round" />
          </svg>

          {/* Center Numeric Telemetry Readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-3 pt-2">
            <div className="bg-surface/85 backdrop-blur-xs border border-border-subtle rounded-xl px-2.5 py-1 text-center shadow-xs">
              <div className={`font-mono text-base font-extrabold leading-none tabular-nums ${statusTextClass}`}>
                {isCip ? 'CIP' : `${percent.toFixed(0)}%`}
              </div>
              <div className="font-mono text-[10px] font-bold text-ink-primary tabular-nums mt-0.5">
                {tank.currentLevelKg.toFixed(0)} <span className="text-ink-secondary font-normal">kg</span>
              </div>
            </div>
          </div>

          {/* Low Level or CIP Alert Indicator */}
          {isLow && (
            <div
              className="absolute -top-1 right-1 bg-rose-500 text-white p-1 rounded-full shadow animate-bounce"
              title="Level WIP di bawah batas minimum"
            >
              <AlertTriangle className="w-3 h-3" />
            </div>
          )}
          {isCip && (
            <div
              className="absolute -top-1 right-1 bg-blue-500 text-white p-1 rounded-full shadow animate-pulse"
              title="Sedang dalam proses sanitasi CIP"
            >
              <Droplets className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom WIP Badge & Minimal Sensor Strip */}
      <div className="space-y-1.5 mt-1">
        {isCip ? (
          <div className="w-full py-1 px-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[11px] font-mono font-bold text-center tracking-wide">
            PROSES CIP
          </div>
        ) : wip ? (
          <div
            className="w-full py-1 px-2 rounded-lg bg-canvas border border-border-subtle text-ink-primary text-[11px] font-semibold text-center truncate"
            title={wip.name}
          >
            {wip.name}
          </div>
        ) : (
          <div className="w-full py-1 px-2 rounded-lg bg-canvas border border-border-subtle text-ink-muted text-[11px] font-mono font-semibold text-center">
            KOSONG
          </div>
        )}

        {/* Compact Temp & Agitator Indicator (Read-only telemetry) */}
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-secondary px-1">
          <span className="flex items-center gap-1 tabular-nums">
            <Thermometer className="w-3 h-3 text-ink-amber" />
            {tank.temp !== undefined ? `${tank.temp.toFixed(1)}°C` : '--'}
          </span>
          <span className="flex items-center gap-1">
            <RotateCw
              className={`w-3 h-3 ${tank.agitatorStatus === 'ON' ? 'animate-spin text-brand' : 'text-ink-muted'}`}
            />
            {tank.agitatorStatus || 'OFF'}
          </span>
        </div>
      </div>
    </div>
  );
};
