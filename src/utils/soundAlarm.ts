// Web Audio API Synthesized Industrial Chime & Alarm Generator
// Plays a clear, professional two-tone chime when a WIP batch finishes production

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Plays a pleasant, high-contrast industrial completion chime (D5 -> A5 -> D6 harmonic triad)
 */
export function playWipCompletionChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [
    { freq: 587.33, start: 0, duration: 0.18 }, // D5
    { freq: 880.00, start: 0.14, duration: 0.22 }, // A5
    { freq: 1174.66, start: 0.32, duration: 0.45 }  // D6
  ];

  notes.forEach(({ freq, start, duration }) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.28, now + start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    } catch {
      // Ignore audio failure
    }
  });
}

/**
 * Plays a double warning beep for critical tank/process alerts
 */
export function playAlertWarningSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  [0, 0.22].forEach((offset) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(740, now + offset);

      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(0.22, now + offset + 0.02);
      gain.gain.linearRampToValueAtTime(0.001, now + offset + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    } catch {
      // Ignore audio failure
    }
  });
}
