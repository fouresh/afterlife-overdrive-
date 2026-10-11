import { Container, Sprite, type Texture } from 'pixi.js';
import type { Atlas } from './atlas';
import { snap } from './renderer';

/**
 * Pooled visual effects: particles, damage numbers, slashes, rings, flashes.
 * Everything lives in fixed-size pools — nothing is allocated during a fight.
 */
interface Particle {
  s: Sprite;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  gravity: number;
  fade: boolean;
  shrink: boolean;
}

interface Num {
  digits: Sprite[];
  x: number;
  y: number;
  life: number;
  vy: number;
}

interface Anim {
  s: Sprite;
  life: number;
  max: number;
  scale0: number;
  scale1: number;
  alpha0: number;
  follow: number;
  /** Constant multiplier of the vertical scale (thin stabs); the sign keeps flipY. */
  squash: number;
}

const MAX_PARTICLES = 320;
const MAX_NUMS = 40;
const MAX_ANIMS = 48;

export class Fx {
  readonly layer = new Container();
  readonly glow = new Container();
  private particles: Particle[] = [];
  private pFree: number[] = [];
  private nums: Num[] = [];
  private anims: Anim[] = [];
  private pxTex: Texture;
  private digitTex: Texture[];
  private time = 0;

  constructor(private atlas: Atlas) {
    this.pxTex = atlas.get('fx.px').frames[0]!;
    this.digitTex = atlas.get('fx.digits').frames;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new Sprite(this.pxTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.particles.push({
        s,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        max: 1,
        gravity: 0,
        fade: true,
        shrink: false,
      });
      this.pFree.push(i);
    }
    for (let i = 0; i < MAX_NUMS; i++) {
      const digits: Sprite[] = [];
      for (let d = 0; d < 4; d++) {
        const s = new Sprite(this.digitTex[0]);
        s.anchor.set(0.5);
        s.visible = false;
        this.layer.addChild(s);
        digits.push(s);
      }
      this.nums.push({ digits, x: 0, y: 0, life: 0, vy: 0 });
    }
    for (let i = 0; i < MAX_ANIMS; i++) {
      const s = new Sprite(this.pxTex);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.anims.push({
        s,
        life: 0,
        max: 1,
        scale0: 1,
        scale1: 1,
        alpha0: 1,
        follow: -1,
        squash: 1,
      });
    }
  }

  /** Burst of square particles (blood, bone chips, sparks, dust). */
  burst(
    x: number,
    y: number,
    color: number,
    count: number,
    speed = 60,
    opts: { up?: number; gravity?: number; life?: number; size?: number } = {},
  ): void {
    for (let k = 0; k < count; k++) {
      const idx = this.pFree.pop();
      if (idx === undefined) return;
      const p = this.particles[idx]!;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      p.x = x;
      p.y = y;
      p.z = 2 + Math.random() * 4;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp * 0.6;
      p.vz = (opts.up ?? 50) * (0.5 + Math.random());
      p.gravity = opts.gravity ?? 220;
      p.max = p.life = (opts.life ?? 0.45) * (0.6 + Math.random() * 0.8);
      p.fade = true;
      p.shrink = false;
      p.s.tint = color;
      p.s.texture = this.pxTex;
      // Finer sparks at HD density: 1.6–2.4 world px instead of 2–3.
      p.s.scale.set(opts.size ?? (Math.random() < 0.3 ? 1.2 : 0.8));
      p.s.alpha = 1;
      p.s.visible = true;
    }
  }

  /** Slow floating motes (trails, magic). */
  mote(x: number, y: number, color: number, life = 0.35): void {
    const idx = this.pFree.pop();
    if (idx === undefined) return;
    const p = this.particles[idx]!;
    p.x = x + (Math.random() - 0.5) * 2;
    p.y = y + (Math.random() - 0.5) * 2;
    p.z = 0;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = -6 - Math.random() * 6;
    p.vz = 0;
    p.gravity = 0;
    p.max = p.life = life;
    p.fade = true;
    p.shrink = true;
    p.s.tint = color;
    p.s.scale.set(1);
    p.s.alpha = 1;
    p.s.visible = true;
  }

  number(x: number, y: number, value: number, color: number): void {
    const n = this.nums.find((m) => m.life <= 0) ?? this.nums[0]!;
    const str = String(Math.min(9999, Math.max(0, Math.round(value))));
    n.x = x + (Math.random() - 0.5) * 6;
    n.y = y;
    n.life = 0.7;
    n.vy = -38;
    n.digits.forEach((s, d) => {
      const ch = str[d];
      s.visible = ch !== undefined;
      if (ch === undefined) return;
      s.texture = this.digitTex[Number(ch)]!;
      s.tint = color;
      s.alpha = 1;
    });
    const w = str.length * 4;
    n.digits.forEach((s, d) => (s.x = n.x - w / 2 + d * 4 + 2));
  }

  /** One-shot sprite animation (slash, ring, flash). Returns the sprite for extra tweaks. */
  anim(
    texId: string,
    x: number,
    y: number,
    opts: {
      rot?: number;
      tint?: number;
      life?: number;
      scale0?: number;
      scale1?: number;
      alpha?: number;
      glow?: boolean;
      flipY?: boolean;
      /** Vertical scale multiplier (default 1). */
      squash?: number;
    },
  ): Sprite | undefined {
    const a = this.anims.find((m) => m.life <= 0);
    if (!a) return undefined;
    const tex = this.atlas.get(texId).frames[0]!;
    a.s.texture = tex;
    a.s.position.set(x, y);
    a.s.rotation = opts.rot ?? 0;
    a.s.tint = opts.tint ?? 0xffffff;
    a.max = a.life = opts.life ?? 0.2;
    a.scale0 = opts.scale0 ?? 1;
    a.scale1 = opts.scale1 ?? a.scale0;
    a.alpha0 = opts.alpha ?? 1;
    a.s.alpha = a.alpha0;
    a.squash = opts.squash ?? 1;
    a.s.scale.set(a.scale0, a.scale0 * a.squash * (opts.flipY ? -1 : 1));
    a.s.visible = true;
    const parent = opts.glow ? this.glow : this.layer;
    if (a.s.parent !== parent) parent.addChild(a.s);
    return a.s;
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.pFree.push(i);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      if (p.z < 0 && p.gravity > 0) {
        p.z = 0;
        p.vz = -p.vz * 0.35;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      p.s.position.set(snap(p.x), snap(p.y - p.z));
      const k = p.life / p.max;
      if (p.fade) p.s.alpha = Math.min(1, k * 2);
      if (p.shrink) p.s.scale.set(Math.max(0.5, k * 1.5));
    }
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.vy += 70 * dt;
      n.y += n.vy * dt;
      const alpha = Math.min(1, n.life * 4);
      for (const s of n.digits) {
        if (!s.visible) continue;
        s.y = snap(n.y);
        s.alpha = alpha;
        if (n.life <= 0) s.visible = false;
      }
    }
    for (const a of this.anims) {
      if (a.life <= 0) continue;
      a.life -= dt;
      if (a.life <= 0) {
        a.s.visible = false;
        continue;
      }
      const t = 1 - a.life / a.max;
      const sc = a.scale0 + (a.scale1 - a.scale0) * t;
      a.s.scale.set(sc, sc * a.squash * Math.sign(a.s.scale.y || 1));
      a.s.alpha = a.alpha0 * (1 - t * t);
    }
  }
}
