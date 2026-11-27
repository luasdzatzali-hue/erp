export function formatPauseDurationMs(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '-';
  const totalSecs = Math.round(ms / 1000);
  if (totalSecs < 60) return `${totalSecs} dtk`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}j ${remMins}m`;
}

export interface QrScanFeedbackState {
  type: 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}

export interface SuggestedWipsFromScanState {
  materialId: string;
  materialName: string;
  materialCode?: string;
  lotNumber?: string;
  wips: Array<{ id: string; code: string; name: string }>;
}
