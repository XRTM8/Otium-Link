/**
 * Otium Link — Zero-Asset Web Audio API Studio Chime Synthesizer
 * Generates organic, high-fidelity acoustic feedback without any audio files.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play an organic double harmonic chime on receive (D5 -> A5)
 */
export function playReceiveChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);

  // Note 1: 587.33 Hz (D5)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(587.33, now);
  gain1.gain.setValueAtTime(0.12 * gainScale, now);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.35);

  // Note 2: 880 Hz (A5)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(880, now + 0.08);
  gain2.gain.setValueAtTime(0.15 * gainScale, now + 0.08);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.08);
  osc2.stop(now + 0.45);
}

/**
 * Play a swift aerodynamic send chime (440Hz -> 659.25Hz)
 */
export function playSendChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.18);

  gain.gain.setValueAtTime(0.1 * gainScale, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

/**
 * Play a triple harmonious chord on connection or full verification (C5 -> E5 -> G5)
 */
export function playSuccessChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);
  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const startTime = now + idx * 0.06;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.09 * gainScale, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + 0.4);
  });
}

/**
 * Play a gentle dual-tone warning chime for missing peers or cancelled actions
 */
export function playWarningChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);

  // Note 1: E4 (329.63 Hz)
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(329.63, now);
  gain1.gain.setValueAtTime(0.08 * gainScale, now);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.25);

  // Note 2: C4 (261.63 Hz)
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(261.63, now + 0.1);
  gain2.gain.setValueAtTime(0.09 * gainScale, now + 0.1);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.start(now + 0.1);
  osc2.stop(now + 0.35);
}

/**
 * Play an aerodynamic drop cue when files enter or drop on the radar/hub
 */
export function playDropChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(580, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

  gain.gain.setValueAtTime(0.09 * gainScale, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.11);
}

/**
 * Play a swift subtle whoosh when deleting an item from the vault
 */
export function playDeleteChime(enabled: boolean = true, volume: number = 0.8) {
  if (!enabled || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const gainScale = Math.min(Math.max(volume, 0), 1);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);

  gain.gain.setValueAtTime(0.08 * gainScale, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}
