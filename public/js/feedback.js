/**
 * Optional sound (synthesised with Web Audio, no audio files) and haptics.
 * Both are off by default and do nothing unless enabled.
 */

export function createSound() {
  let ctx = null;
  let enabled = false;

  function context() {
    if (!ctx) {
      const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, duration, { type = 'sine', gain = 0.05, delay = 0 } = {}) {
    const ac = context();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  return {
    get enabled() { return enabled; },
    /** Must be called from a user gesture the first time so browsers allow audio. */
    setEnabled(value) {
      enabled = Boolean(value);
      if (enabled) context();
    },
    move() {
      if (enabled) tone(196, 0.07, { type: 'triangle', gain: 0.025 });
    },
    merge(value) {
      if (!enabled) return;
      const step = Math.log2(value) - 1;
      tone(261.63 * 2 ** ((step % 12) / 12 * 1.5), 0.16, { gain: 0.05 });
    },
    win() {
      if (!enabled) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.3, { gain: 0.05, delay: i * 0.1 }));
    },
    over() {
      if (!enabled) return;
      [392, 329.63, 261.63].forEach((f, i) => tone(f, 0.32, { type: 'triangle', gain: 0.045, delay: i * 0.14 }));
    },
    undo() {
      if (enabled) tone(329.63, 0.08, { type: 'triangle', gain: 0.025 });
    },
  };
}

export function createHaptics() {
  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  let enabled = false;
  const pulse = (pattern) => {
    if (!enabled || !supported) return;
    try { navigator.vibrate(pattern); } catch { /* ignored */ }
  };
  return {
    supported,
    setEnabled(value) { enabled = Boolean(value) && supported; },
    merge() { pulse(12); },
    win() { pulse([30, 60, 30]); },
    over() { pulse([60, 40, 60]); },
  };
}
