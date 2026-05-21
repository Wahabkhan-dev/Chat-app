let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new Ctor();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function playNotificationSound() {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;

  // Two-tone blip similar to Teams
  [660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.12;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}
