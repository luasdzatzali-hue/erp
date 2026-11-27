import React from 'react';
import { AlertTriangle, Clock, FileText, PauseCircle, Play, RefreshCw, X } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { getCurrentShift } from '../utils/shifts';

export const FactoryDispatchStrip: React.FC = () => {
  const erp = useErp();
  const {
    state,
    cloudQuotaStatus,
    quotaBannerDismissed,
    setQuotaBannerDismissed,
    isTestingQuotaReset,
    handleResetQuotaAndRetrySync,
    handleSwitchTab,
    handleResumeWipBatch,
    handleCompleteWipBatch,
    setIsPdfReportModalOpen
  } = erp;

  const currentShift = getCurrentShift();
  const runningRuns = (state.activeSkuRuns || (state.activeSkuRun ? [state.activeSkuRun] : [])).filter(
    r => r.isRunning
  );
  const activeWipBatch = (state.transactions.wipBatches || []).find(
    b => b.status === 'SEDANG_PRODUKSI' || b.status === 'DIJEDA'
  );
  const isWipPaused = activeWipBatch?.status === 'DIJEDA';

  return (
    <>
      {cloudQuotaStatus.isQuotaExceeded && !quotaBannerDismissed && (
        <div className="bg-tint-amber border-b border-tint-amber-border px-3 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-amber shrink-0 no-print">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <div className="min-w-0 leading-snug">
              <span className="font-bold">Kuota Tulis Harian Cloud Penuh: </span>
              <span className="text-ink-primary">
                Batas gratis tulis harian Firestore tercapai
                {cloudQuotaStatus.pausedUntilMs
                  ? ` (reset otomatis sekitar ${new Date(cloudQuotaStatus.pausedUntilMs).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Jakarta'
                    })} WIB)`
                  : ' dan akan reset otomatis besok'}
                . Operasional &amp; data tetap tersimpan aman di perangkat lokal.
              </span>{' '}
              <a
                href={cloudQuotaStatus.upgradeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-ink-amber hover:opacity-80"
              >
                Upgrade / Detail Firebase
              </a>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={isTestingQuotaReset}
              onClick={() => void handleResetQuotaAndRetrySync()}
              className="px-2.5 py-1 rounded-md bg-surface hover:bg-elevated disabled:opacity-60 border border-tint-amber-border text-ink-primary text-[11px] font-semibold flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingQuotaReset ? 'animate-spin' : ''}`} />
              <span>
                {isTestingQuotaReset
                  ? 'Menguji Koneksi Cloud...'
                  : 'Reset Status Kuota & Coba Sinkron Cloud'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setQuotaBannerDismissed(true)}
              aria-label="Tutup pemberitahuan kuota"
              className="p-1 rounded-md hover:bg-surface/60 text-ink-secondary hover:text-ink-primary transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Live Factory Dispatch Console Strip */}
      <div className="bg-canvas border-b border-border-subtle px-3 sm:px-5 py-1.5 flex items-center justify-between overflow-x-auto no-scrollbar gap-3 shrink-0 text-xs">
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Shift Telemetry */}
          <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-md border border-border-subtle font-mono tabular-nums whitespace-nowrap">
            <span className="font-bold text-ink-emerald text-[11px]">Shift {currentShift.shift}</span>
            <span className="text-[10px] text-ink-secondary hidden sm:inline">
              · {currentShift.timeRange}
            </span>
          </div>

          {/* Running Multi-SKU Dispatch */}
          {runningRuns.length > 0 ? (
            <div
              onClick={() => handleSwitchTab('dashboard')}
              className="flex items-center gap-2 cursor-pointer bg-tint-cyan border border-tint-cyan-border px-2.5 py-1 rounded-md text-[11px] hover:border-accent-primary transition whitespace-nowrap"
              title="Klik untuk membuka modul Manufacturing & melihat SKU yang sedang diproses"
            >
              <span className="font-bold text-ink-cyan font-mono">
                {runningRuns.length === 1 ? '1 Lini Aktif:' : `${runningRuns.length} Lini Aktif:`}
              </span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[280px] sm:max-w-[480px]">
                {runningRuns.map((r, i) => (
                  <span
                    key={r.id || `${r.lineId || ''}_${r.skuId}_${i}`}
                    className="flex items-center gap-1 whitespace-nowrap"
                  >
                    {i > 0 && <span className="text-ink-secondary">·</span>}
                    {r.lineName && <span className="text-ink-cyan font-semibold">{r.lineName}:</span>}
                    <span className="text-ink-primary font-medium">{r.skuName}</span>
                    <span className="text-ink-cyan font-mono text-[10px] tabular-nums">
                      ({(r.cartonsProducedTotal || 0).toLocaleString()}
                      {r.plannedCartons ? `/${r.plannedCartons.toLocaleString()}` : ''} ktn)
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-md border border-border-subtle text-[11px] text-ink-secondary whitespace-nowrap">
              <span>Lini Siaga</span>
            </div>
          )}

          {/* Active Running / Paused WIP Batch Quick Action */}
          {activeWipBatch && (
            <div
              onClick={() => handleSwitchTab('pemakaian')}
              className={`cursor-pointer flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] transition whitespace-nowrap border ${
                isWipPaused
                  ? 'bg-tint-cyan border-tint-cyan-border hover:border-accent-primary'
                  : 'bg-tint-amber border-tint-amber-border hover:border-ink-amber'
              }`}
              title={
                isWipPaused
                  ? `Batch dijeda: ${activeWipBatch.pauseReason || ''}`
                  : 'Klik untuk membuka rincian batch & Gantt WIP'
              }
            >
              {isWipPaused ? (
                <PauseCircle className="w-3 h-3 text-ink-sky shrink-0" />
              ) : (
                <Clock className="w-3 h-3 text-ink-amber shrink-0" />
              )}
              <span className={`${isWipPaused ? 'text-ink-sky' : 'text-ink-amber'} font-mono font-semibold`}>
                {activeWipBatch.batchCode}
              </span>
              <span className="text-ink-primary hidden sm:inline">
                · {activeWipBatch.wipName} {isWipPaused ? '(Dijeda)' : ''}
              </span>
              {isWipPaused ? (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleResumeWipBatch(activeWipBatch.id);
                  }}
                  className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold transition whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                  title="Lanjutkan kembali penghitungan waktu batch ini"
                >
                  <Play className="w-2.5 h-2.5" />
                  <span>Lanjutkan</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleCompleteWipBatch(activeWipBatch.id);
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition whitespace-nowrap shrink-0"
                  title="Selesaikan batch sekarang & transfer ke tangki"
                >
                  Selesai
                </button>
              )}
            </div>
          )}
        </div>

        {/* Quick Report Download Trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsPdfReportModalOpen(true)}
            className="flex items-center gap-1.5 bg-surface hover:bg-elevated border border-border-subtle hover:border-tint-rose-border text-ink-primary px-2.5 py-1 rounded-md text-[11px] font-semibold transition active:scale-95 whitespace-nowrap shrink-0"
            title="Download Laporan Saldo Stock Aktual Shift Format PDF (A4 Landscape)"
          >
            <FileText className="w-3.5 h-3.5 text-ink-rose" />
            <span>Laporan Shift (PDF)</span>
          </button>
        </div>
      </div>
    </>
  );
};
