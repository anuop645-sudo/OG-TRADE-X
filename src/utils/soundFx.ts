let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      audioCtx = new AudioContextCtor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  frequency: number,
  durationMs: number,
  type: OscillatorType = 'sine',
  gainValue = 0.05,
  delayMs = 0
) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + delayMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationMs / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + durationMs / 1000 + 0.02);
  } catch {
    // Fail silently if browser blocks audio
  }
}

function playPitchSweep(
  startFreq: number,
  endFreq: number,
  durationMs: number,
  type: OscillatorType = 'triangle',
  gainValue = 0.05,
  delayMs = 0
) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime + delayMs / 1000;
    const endTime = startTime + durationMs / 1000;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), endTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(endTime + 0.02);
  } catch {
    // Fail silently if browser blocks audio
  }
}

function playNoiseBurst(
  durationMs: number,
  filterFreq = 1800,
  gainValue = 0.04,
  delayMs = 0
) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const sampleCount = Math.max(128, Math.floor((ctx.sampleRate * durationMs) / 1000));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    const startTime = ctx.currentTime + delayMs / 1000;
    const endTime = startTime + durationMs / 1000;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(endTime + 0.01);
  } catch {
    // Ignore audio errors
  }
}

export function playClickSound(enabled: boolean) {
  if (!enabled) return;
  playTone(620, 40, 'triangle', 0.035);
}

export function playTickSound(enabled: boolean) {
  if (!enabled) return;
  playTone(820, 60, 'sine', 0.045);
}

export function playOrderSound(enabled: boolean) {
  if (!enabled) return;
  playTone(587.33, 90, 'triangle', 0.055, 0);
  playTone(880, 120, 'triangle', 0.05, 70);
}

export function playDiceRollSound(enabled: boolean) {
  if (!enabled) return;
  const delays = [0, 75, 155, 240, 330, 430, 540];
  const freqs = [320, 410, 360, 440, 380, 470, 520];
  delays.forEach((delay, idx) => {
    playTone(freqs[idx], 48, 'square', 0.028, delay);
  });
}

export function playWinSound(enabled: boolean) {
  if (!enabled) return;
  playTone(523.25, 120, 'triangle', 0.06, 0);
  playTone(659.25, 120, 'triangle', 0.06, 90);
  playTone(783.99, 140, 'triangle', 0.06, 180);
  playTone(1046.5, 220, 'sine', 0.065, 270);
}

export function playSettleSound(enabled: boolean) {
  if (!enabled) return;
  playTone(392, 110, 'sine', 0.04, 0);
  playTone(329.63, 130, 'sine', 0.035, 90);
}

export function playChickenStartSound(enabled: boolean) {
  if (!enabled) return;
  // Energetic arcade whistle + happy chicken cluck to start crossing
  playTone(523.25, 80, 'triangle', 0.05, 0);
  playTone(659.25, 80, 'triangle', 0.05, 75);
  playTone(783.99, 120, 'triangle', 0.06, 150);
  playPitchSweep(460, 740, 85, 'triangle', 0.045, 210);
}

export function playHopSound(enabled: boolean) {
  if (!enabled) return;
  // Expressive chicken "bawk-pop!" hop
  playPitchSweep(360, 720, 65, 'triangle', 0.055, 0);
  playPitchSweep(690, 420, 70, 'triangle', 0.04, 55);
}

export function playBarrierSound(enabled: boolean) {
  if (!enabled) return;
  // Safe barrier drop + multiplier chime
  playTone(587.33, 65, 'sine', 0.04, 50);
  playTone(880, 95, 'triangle', 0.045, 105);
}

export function playCarHornSound(enabled: boolean) {
  if (!enabled) return;
  // Subtle highway car "beep-beep!"
  playTone(440, 75, 'sawtooth', 0.018, 0);
  playTone(554.37, 75, 'sawtooth', 0.016, 0);
  playTone(440, 95, 'sawtooth', 0.018, 115);
  playTone(554.37, 95, 'sawtooth', 0.016, 115);
}

export function playCrashSound(enabled: boolean) {
  if (!enabled) return;
  // Tire screech + car horn + crash thud
  playNoiseBurst(170, 2200, 0.055, 0);
  playTone(349.23, 110, 'sawtooth', 0.04, 0);
  playTone(277.18, 110, 'sawtooth', 0.04, 0);
  playPitchSweep(150, 45, 220, 'sawtooth', 0.065, 85);
}

export function playChickenLaughSound(enabled: boolean) {
  if (!enabled) return;
  // Comical "ha-ha-ha-bawk!" chicken cackle right after crash
  const cackles = [
    { start: 780, end: 560, d: 85, delay: 230 },
    { start: 840, end: 590, d: 85, delay: 335 },
    { start: 900, end: 620, d: 90, delay: 440 },
    { start: 960, end: 520, d: 135, delay: 550 },
  ];
  cackles.forEach((c) => {
    playPitchSweep(c.start, c.end, c.d, 'triangle', 0.05, c.delay);
  });
}

export function playChickenWinSound(enabled: boolean) {
  if (!enabled) return;
  // Arcade coin cascade + cheerful cluck
  playTone(523.25, 100, 'triangle', 0.06, 0);
  playTone(659.25, 100, 'triangle', 0.06, 75);
  playTone(783.99, 110, 'triangle', 0.06, 150);
  playTone(1046.5, 160, 'sine', 0.065, 225);
  playTone(1318.5, 220, 'sine', 0.055, 310);
}

// Chicken Road 16-step arcade background groove (125 BPM, subtle non-fatiguing mix)
const CHICKEN_BASS_NOTES = [
  130.81, 0, 196.0, 0,
  146.83, 0, 196.0, 0,
  164.81, 0, 220.0, 0,
  174.61, 0, 196.0, 0,
];

const CHICKEN_LEAD_NOTES = [
  523.25, 0, 659.25, 783.99,
  0, 659.25, 587.33, 0,
  523.25, 0, 587.33, 659.25,
  783.99, 0, 659.25, 587.33,
];

let chickenMusicTimer: ReturnType<typeof setInterval> | null = null;
let chickenMusicStep = 0;

export function startChickenRoadBgMusic(): void {
  if (typeof window === 'undefined' || chickenMusicTimer !== null) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  chickenMusicTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    const activeCtx = getAudioContext();
    if (!activeCtx || activeCtx.state !== 'running') return;

    const step = chickenMusicStep % 16;
    chickenMusicStep += 1;

    const bass = CHICKEN_BASS_NOTES[step];
    if (bass > 0) {
      playTone(bass, 130, 'triangle', 0.022, 0);
    }

    const lead = CHICKEN_LEAD_NOTES[step];
    if (lead > 0) {
      playTone(lead, 115, 'sine', 0.019, 0);
    }

    if (step % 2 === 1) {
      playNoiseBurst(28, 5200, 0.008, 0);
    }
  }, 150);
}

export function stopChickenRoadBgMusic(): void {
  if (chickenMusicTimer !== null) {
    clearInterval(chickenMusicTimer);
    chickenMusicTimer = null;
  }
}


