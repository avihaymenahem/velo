import { getSetting } from "./db/settings";

export type SoundEvent =
  | "send"
  | "receive"
  | "task_complete"
  | "event_alert"
  | "send_error"
  | "shortcut_click";

// Lazy AudioContext — created on first use to comply with browser autoplay policy
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
  }
  return ctx;
}

// ─── Sound generators ────────────────────────────────────────────────────────

function playSend(ac: AudioContext, gain: GainNode) {
  // A short, damped click — low-frequency pop with fast attack/decay (~80ms)
  const buf = ac.createBuffer(1, ac.sampleRate * 0.08, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate;
    const env = Math.exp(-t * 55);
    data[i] = env * Math.sin(2 * Math.PI * 120 * t) * 0.6;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start();
}

function playReceive(ac: AudioContext, gain: GainNode) {
  // Two velvety mid-low tones, ~200ms each, 280ms apart
  function tone(startTime: number, freq: number) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.28, startTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);
    osc.connect(g);
    g.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + 0.25);
  }
  const now = ac.currentTime;
  tone(now, 440);
  tone(now + 0.28, 554);
}

function playTaskComplete(ac: AudioContext, gain: GainNode) {
  // Crystal metallic click — high-frequency sine with instant attack and fast decay (~120ms)
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1046, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ac.currentTime + 0.12);
  g.gain.setValueAtTime(0.35, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.14);
  osc.connect(g);
  g.connect(gain);
  osc.start();
  osc.stop(ac.currentTime + 0.16);
}

function playEventAlert(ac: AudioContext, gain: GainNode) {
  // Two mechanical pulses, more sustained — distinguishable from mail sounds
  function pulse(startTime: number) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "triangle";
    osc.frequency.value = 660;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(0.32, startTime + 0.01);
    g.gain.setValueAtTime(0.32, startTime + 0.09);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
    osc.connect(g);
    g.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + 0.22);
  }
  const now = ac.currentTime;
  pulse(now);
  pulse(now + 0.3);
}

function playSendError(ac: AudioContext, gain: GainNode) {
  // Low-frequency thud — subfrequency thump with noise, ~200ms
  const buf = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate;
    const env = Math.exp(-t * 18);
    // Mix low sine with slight noise for a "thud" texture
    const noise = (Math.random() * 2 - 1) * 0.08;
    data[i] = env * (Math.sin(2 * Math.PI * 55 * t) * 0.5 + noise);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start();
}

function playShortcutClick(ac: AudioContext, gain: GainNode) {
  // Nearly-imperceptible micro-click (~30ms) — acoustic texture only
  const buf = ac.createBuffer(1, ac.sampleRate * 0.03, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate;
    const env = Math.exp(-t * 200);
    data[i] = env * Math.sin(2 * Math.PI * 2000 * t) * 0.15;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start();
}

// ─── Public API ──────────────────────────────────────────────────────────────

const GENERATORS: Record<SoundEvent, (ac: AudioContext, gain: GainNode) => void> = {
  send: playSend,
  receive: playReceive,
  task_complete: playTaskComplete,
  event_alert: playEventAlert,
  send_error: playSendError,
  shortcut_click: playShortcutClick,
};

/**
 * Play a sound event if sounds are enabled globally and for the specific event.
 * Reads settings on every call so changes take effect without restart.
 */
export async function playSound(event: SoundEvent): Promise<void> {
  try {
    const enabled = await getSetting("sound_enabled");
    if (enabled === "false") return;

    const eventEnabled = await getSetting(`sound_${event}_enabled`);
    if (eventEnabled === "false") return;

    const volumeRaw = await getSetting("sound_volume");
    const volume = Math.min(1, Math.max(0, parseFloat(volumeRaw ?? "0.7")));

    const ac = getCtx();
    if (ac.state === "suspended") await ac.resume();

    const masterGain = ac.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(ac.destination);

    GENERATORS[event](ac, masterGain);
  } catch {
    // Never let a sound error surface to the user
  }
}

/**
 * Preview a sound immediately (used in settings UI — bypasses enabled checks).
 */
export async function previewSound(event: SoundEvent, volume = 0.7): Promise<void> {
  try {
    const ac = getCtx();
    if (ac.state === "suspended") await ac.resume();
    const masterGain = ac.createGain();
    masterGain.gain.value = Math.min(1, Math.max(0, volume));
    masterGain.connect(ac.destination);
    GENERATORS[event](ac, masterGain);
  } catch {
    // Silent fail
  }
}
