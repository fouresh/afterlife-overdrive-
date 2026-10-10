/**
 * Procedural sound effects in the spirit of sfxr/jsfxr: every sound is a few oscillator layers
 * with pitch slides and envelopes, rendered once into an AudioBuffer. No audio files.
 */
type Wave = 'square' | 'saw' | 'sine' | 'triangle' | 'noise';

interface Layer {
  wave: Wave;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  attack?: number;
  duty?: number;
  /** Vibrato: [depth as fraction of freq, rate Hz]. */
  vib?: [number, number];
  /** One-pole low-pass amount 0..1 (1 = no filtering). */
  lp?: number;
  /** Arpeggio: frequency multipliers stepped evenly over the duration. */
  arp?: number[];
  delay?: number;
}

const RATE = 22050;

const SOUNDS: Record<string, Layer[]> = {
  swing: [{ wave: 'noise', f0: 5000, f1: 900, dur: 0.12, vol: 0.28, lp: 0.45 }],
  hit: [
    { wave: 'square', f0: 240, f1: 80, dur: 0.08, vol: 0.32, duty: 0.3 },
    { wave: 'noise', f0: 3500, f1: 600, dur: 0.06, vol: 0.25 },
  ],
  crit: [
    { wave: 'square', f0: 300, f1: 90, dur: 0.09, vol: 0.32 },
    { wave: 'sine', f0: 1600, f1: 1200, dur: 0.14, vol: 0.2 },
  ],
  enemyDie: [
    { wave: 'square', f0: 320, f1: 50, dur: 0.26, vol: 0.28, duty: 0.25 },
    { wave: 'noise', f0: 2400, f1: 200, dur: 0.22, vol: 0.22, lp: 0.6 },
  ],
  bones: [
    { wave: 'noise', f0: 7000, f1: 3000, dur: 0.05, vol: 0.25 },
    { wave: 'noise', f0: 6000, f1: 2000, dur: 0.05, vol: 0.2, delay: 0.06 },
    { wave: 'noise', f0: 5000, f1: 1500, dur: 0.06, vol: 0.18, delay: 0.12 },
  ],
  shoot: [
    { wave: 'noise', f0: 7000, f1: 2500, dur: 0.05, vol: 0.2 },
    { wave: 'triangle', f0: 950, f1: 480, dur: 0.07, vol: 0.2 },
  ],
  magic: [{ wave: 'sine', f0: 420, f1: 1150, dur: 0.18, vol: 0.26, vib: [0.05, 28] }],
  enemyShoot: [{ wave: 'square', f0: 700, f1: 350, dur: 0.09, vol: 0.12, duty: 0.4 }],
  explosion: [
    { wave: 'noise', f0: 1400, f1: 70, dur: 0.55, vol: 0.45, lp: 0.18 },
    { wave: 'square', f0: 90, f1: 35, dur: 0.3, vol: 0.25 },
  ],
  dash: [{ wave: 'noise', f0: 500, f1: 3200, dur: 0.14, vol: 0.18, lp: 0.5 }],
  coin: [{ wave: 'square', f0: 1320, dur: 0.12, vol: 0.14, duty: 0.5, arp: [1, 1.5] }],
  pickup: [{ wave: 'square', f0: 620, dur: 0.22, vol: 0.16, duty: 0.5, arp: [1, 1.26, 1.5, 2] }],
  potion: [{ wave: 'sine', f0: 280, f1: 620, dur: 0.28, vol: 0.28, vib: [0.12, 14] }],
  doorClose: [
    { wave: 'saw', f0: 95, f1: 45, dur: 0.28, vol: 0.32, lp: 0.3 },
    { wave: 'noise', f0: 900, f1: 100, dur: 0.18, vol: 0.25, lp: 0.3 },
  ],
  doorOpen: [{ wave: 'saw', f0: 60, f1: 120, dur: 0.22, vol: 0.25, lp: 0.35 }],
  clear: [{ wave: 'triangle', f0: 523, dur: 0.5, vol: 0.28, arp: [1, 1.26, 1.5, 2] }],
  hurt: [
    { wave: 'square', f0: 420, f1: 110, dur: 0.18, vol: 0.32, duty: 0.4 },
    { wave: 'noise', f0: 2000, f1: 300, dur: 0.12, vol: 0.2 },
  ],
  die: [{ wave: 'saw', f0: 330, f1: 40, dur: 1.0, vol: 0.32, vib: [0.06, 6], lp: 0.4 }],
  telegraph: [{ wave: 'square', f0: 950, dur: 0.05, vol: 0.08, duty: 0.25 }],
  roar: [
    { wave: 'saw', f0: 75, f1: 40, dur: 0.8, vol: 0.35, vib: [0.25, 9], lp: 0.25 },
    { wave: 'noise', f0: 600, f1: 120, dur: 0.6, vol: 0.2, lp: 0.2 },
  ],
  chest: [
    { wave: 'saw', f0: 140, f1: 220, dur: 0.18, vol: 0.18, lp: 0.3 },
    { wave: 'triangle', f0: 520, dur: 0.45, vol: 0.22, arp: [1, 1.5, 2, 3], delay: 0.12 },
  ],
  key: [{ wave: 'sine', f0: 1480, dur: 0.3, vol: 0.22, arp: [1, 2] }],
  unlock: [
    { wave: 'square', f0: 320, f1: 200, dur: 0.08, vol: 0.2 },
    { wave: 'noise', f0: 4000, f1: 1500, dur: 0.05, vol: 0.2, delay: 0.08 },
  ],
  spawn: [{ wave: 'noise', f0: 300, f1: 2400, dur: 0.25, vol: 0.12, lp: 0.3 }],
  trap: [
    { wave: 'noise', f0: 5000, f1: 1200, dur: 0.1, vol: 0.18 },
    { wave: 'square', f0: 1800, f1: 1200, dur: 0.05, vol: 0.08 },
  ],
  skill: [
    { wave: 'sine', f0: 300, f1: 900, dur: 0.2, vol: 0.22 },
    { wave: 'triangle', f0: 600, f1: 1200, dur: 0.15, vol: 0.12 },
  ],
  heal: [{ wave: 'triangle', f0: 660, dur: 0.35, vol: 0.2, arp: [1, 1.26, 1.5, 2, 2.52] }],
  ui: [{ wave: 'square', f0: 820, dur: 0.03, vol: 0.12, duty: 0.5 }],
  deny: [{ wave: 'square', f0: 180, f1: 140, dur: 0.12, vol: 0.18, duty: 0.5 }],
  victory: [
    { wave: 'triangle', f0: 392, dur: 1.1, vol: 0.3, arp: [1, 1.26, 1.5, 2, 1.5, 2, 2.52, 3] },
  ],
  stairs: [{ wave: 'triangle', f0: 300, f1: 150, dur: 0.6, vol: 0.25, arp: [2, 1.5, 1.26, 1] }],
};

export type SfxName = keyof typeof SOUNDS;

function render(layers: Layer[]): Float32Array {
  const total = Math.max(...layers.map((l) => (l.delay ?? 0) + l.dur));
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  for (const l of layers) {
    const start = Math.floor((l.delay ?? 0) * RATE);
    const len = Math.floor(l.dur * RATE);
    const vol = l.vol ?? 0.3;
    const attack = Math.max(1, Math.floor((l.attack ?? 0.005) * RATE));
    let phase = 0;
    let lpOut = 0;
    let noiseVal = 0;
    let noisePhase = 0;
    for (let i = 0; i < len && start + i < n; i++) {
      const p = i / len;
      let f = l.f1 !== undefined ? l.f0 * Math.pow(l.f1 / l.f0, p) : l.f0;
      if (l.arp) f *= l.arp[Math.min(l.arp.length - 1, Math.floor(p * l.arp.length))]!;
      if (l.vib) f *= 1 + l.vib[0] * Math.sin((2 * Math.PI * l.vib[1] * i) / RATE);
      phase = (phase + f / RATE) % 1;
      let s: number;
      switch (l.wave) {
        case 'square':
          s = phase < (l.duty ?? 0.5) ? 0.8 : -0.8;
          break;
        case 'saw':
          s = phase * 2 - 1;
          break;
        case 'triangle':
          s = 1 - 4 * Math.abs(phase - 0.5);
          break;
        case 'sine':
          s = Math.sin(phase * 2 * Math.PI);
          break;
        default: {
          noisePhase += f / RATE;
          if (noisePhase >= 1) {
            noisePhase -= 1;
            noiseVal = Math.random() * 2 - 1;
          }
          s = noiseVal;
        }
      }
      if (l.lp !== undefined) {
        lpOut += (s - lpOut) * l.lp;
        s = lpOut;
      }
      const env = (i < attack ? i / attack : 1) * Math.pow(1 - p, 1.6);
      out[start + i] = out[start + i]! + s * env * vol;
    }
  }
  return out;
}

class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private last = new Map<string, number>();
  private voices = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('ao.muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  /** Create/resume the context. Must run inside a user gesture on iOS Safari. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.7;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      // iOS: playing a silent buffer during the gesture fully unlocks output.
      const b = this.ctx.createBuffer(1, 1, RATE);
      const src = this.ctx.createBufferSource();
      src.buffer = b;
      src.connect(this.ctx.destination);
      src.start();
    } catch {
      /* no WebAudio */
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
    try {
      localStorage.setItem('ao.muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  play(name: SfxName, opts: { pitch?: number; vol?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.035 || this.voices > 20) return;
    this.last.set(name, now);
    let buf = this.buffers.get(name);
    if (!buf) {
      const data = render(SOUNDS[name]!);
      buf = ctx.createBuffer(1, data.length, RATE);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.buffers.set(name, buf);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.pitch ?? 1) * (0.94 + Math.random() * 0.12);
    let node: AudioNode = src;
    if (opts.vol !== undefined && opts.vol !== 1) {
      const g = ctx.createGain();
      g.gain.value = opts.vol;
      src.connect(g);
      node = g;
    }
    node.connect(this.master);
    this.voices++;
    src.onended = () => this.voices--;
    src.start();
  }
}

export const sfx = new Audio();

/** Install one-time gesture listeners that unlock audio (iOS needs a real touch). */
export function installAudioUnlock(): void {
  const handler = () => {
    sfx.unlock();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('touchend', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('pointerdown', handler);
  window.addEventListener('touchend', handler);
  window.addEventListener('keydown', handler);
}
