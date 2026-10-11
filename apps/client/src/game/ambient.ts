import { Container, Sprite, type Texture } from 'pixi.js';
import type { Lighting } from './lighting';
import { snap } from './renderer';

interface Mote {
  s: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  life: number;
  max: number;
}

export interface AmbientStyle {
  count: number;
  color: number;
  /** Peak opacity. */
  alpha: number;
  /** Drift speed, world px per second. */
  speed: number;
  /** Fireflies blink and light their surroundings; dust just floats. */
  firefly: boolean;
}

export const AMBIENT_STYLES: Record<'forest' | 'crypt' | 'hub', AmbientStyle> = {
  forest: { count: 16, color: 0xd6f07a, alpha: 0.95, speed: 7, firefly: true },
  crypt: { count: 22, color: 0xb9b4d6, alpha: 0.35, speed: 3, firefly: false },
  hub: { count: 18, color: 0xffd9a0, alpha: 0.3, speed: 2.5, firefly: false },
};

/**
 * Atmosphere particles around the camera (fireflies in the forest, dust in the crypt and the
 * hub). A fixed pool wanders inside the view and respawns at its edge; nothing is allocated
 * per frame. Purely cosmetic: lives in the client only, never touches the simulation.
 */
export class Ambient {
  readonly layer = new Container();
  private motes: Mote[] = [];
  private time = 0;

  constructor(
    tex: Texture,
    private style: AmbientStyle,
  ) {
    for (let i = 0; i < style.count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = style.color;
      s.alpha = 0;
      s.scale.set(style.firefly ? 0.75 : 0.5);
      this.layer.addChild(s);
      this.motes.push({ s, x: 0, y: 0, vx: 0, vy: 0, phase: 0, life: -1, max: 1 });
    }
  }

  private spawn(m: Mote, left: number, top: number, w: number, h: number): void {
    m.x = left + Math.random() * w;
    m.y = top + Math.random() * h;
    const a = Math.random() * Math.PI * 2;
    const v = this.style.speed * (0.5 + Math.random());
    m.vx = Math.cos(a) * v;
    m.vy = Math.sin(a) * v - (this.style.firefly ? 0 : this.style.speed * 0.3);
    m.max = m.life = 4 + Math.random() * 6;
    m.phase = Math.random() * 10;
  }

  /** `left`, `top`, `w`, `h` = visible world rectangle. */
  update(dt: number, left: number, top: number, w: number, h: number, light: Lighting): void {
    this.time += dt;
    const st = this.style;
    for (const m of this.motes) {
      m.life -= dt;
      const out = m.x < left - 8 || m.x > left + w + 8 || m.y < top - 8 || m.y > top + h + 8;
      if (m.life <= 0 || out) this.spawn(m, left, top, w, h);
      // Lazy wandering: velocity slowly turns with a per-mote phase.
      const turn = Math.sin(this.time * 0.7 + m.phase) * dt * 0.8;
      const c = Math.cos(turn);
      const s = Math.sin(turn);
      const vx = m.vx * c - m.vy * s;
      m.vy = m.vx * s + m.vy * c;
      m.vx = vx;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      // Fade in and out over the life; fireflies also blink.
      const fade = Math.min(1, m.life / 1.5, (m.max - m.life) / 1.5);
      const blink = st.firefly ? 0.5 + 0.5 * Math.sin(this.time * 2.3 + m.phase * 3) : 1;
      const a = Math.max(0, fade) * blink * st.alpha;
      m.s.alpha = a;
      m.s.position.set(snap(m.x), snap(m.y));
      if (st.firefly && a > 0.15) light.add(m.x, m.y, 22, st.color, a * 0.45);
    }
  }

  destroy(): void {
    this.layer.destroy({ children: true });
    this.motes = [];
  }
}
