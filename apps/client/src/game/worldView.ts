import { CHAR_ANIMS } from '@ao/content';
import { Kind, type World } from '@ao/sim';
import { TILE } from '@ao/shared';
import type { Sprite } from 'pixi.js';
import { Container } from 'pixi.js';
import type { Atlas, AtlasEntry } from './atlas';
import { makeSprite, type Renderer } from './renderer';

interface View {
  gen: number;
  root: Container;
  body: Sprite;
  shadow: Sprite;
  entry: AtlasEntry;
}

/**
 * Maps sim entities to Pixi display objects. Views are pooled per entity slot and reused;
 * nothing is allocated per frame once the scene is warm.
 */
export class WorldView {
  private views: (View | undefined)[] = [];
  private torches: { sprite: Sprite; glow: Sprite; phase: number }[] = [];
  private time = 0;

  constructor(
    private r: Renderer,
    private atlas: Atlas,
    private world: World,
    private playerSheets: AtlasEntry[],
  ) {
    this.buildProps();
  }

  private buildProps(): void {
    const f = this.world.floor;
    const glow = this.atlas.get('fx.glow');
    for (const p of f.props) {
      const cx = p.x * TILE + TILE / 2;
      const cy = p.y * TILE + TILE / 2;
      if (p.kind === 'torch') {
        const s = makeSprite(this.atlas.get('crypt.torch'));
        s.position.set(cx, cy);
        this.r.decalLayer.addChild(s);
        const g = makeSprite(glow);
        g.position.set(cx, cy - 2);
        g.tint = 0xf2a14c;
        g.alpha = 0.35;
        g.scale.set(1.3);
        this.r.glowLayer.addChild(g);
        this.torches.push({ sprite: s, glow: g, phase: (p.x * 13 + p.y * 7) % 10 });
      } else if (p.kind === 'pillar') {
        const s = makeSprite(this.atlas.get('crypt.pillar'));
        s.position.set(cx, (p.y + 1) * TILE - 1);
        s.zIndex = (p.y + 1) * TILE - 2;
        this.r.actorLayer.addChild(s);
      }
    }
  }

  private createView(i: number): View {
    const w = this.world;
    const kind = w.e.kind[i]!;
    const root = new Container();
    const shadow = makeSprite(this.atlas.get('fx.shadow'));
    shadow.anchor.set(0.5, 0.5);
    root.addChild(shadow);
    let entry: AtlasEntry;
    if (kind === Kind.Player) {
      entry = this.playerSheets[w.e.ref[i]!] ?? this.playerSheets[0]!;
    } else {
      entry = this.atlas.get('fx.white');
    }
    const body = makeSprite(entry);
    root.addChild(body);
    this.r.actorLayer.addChild(root);
    return { gen: w.e.gen[i]!, root, body, shadow, entry };
  }

  sync(alpha: number, dt: number): void {
    this.time += dt;
    const e = this.world.e;
    for (let i = 0; i < e.hi; i++) {
      let v = this.views[i];
      if (!e.alive[i]) {
        if (v) v.root.visible = false;
        continue;
      }
      if (!v || v.gen !== e.gen[i]) {
        if (v) v.root.destroy({ children: true });
        v = this.createView(i);
        this.views[i] = v;
      }
      v.root.visible = true;
      const x = e.px[i]! + (e.x[i]! - e.px[i]!) * alpha;
      const y = e.py[i]! + (e.y[i]! - e.py[i]!) * alpha;
      v.root.position.set(x, y);
      v.root.zIndex = y;
      if (e.kind[i] === Kind.Player) this.animatePlayer(i, v);
    }
    // Torch flicker
    for (const t of this.torches) {
      const k = Math.floor(this.time * 6 + t.phase);
      t.sprite.texture = this.atlas.get('crypt.torch').frames[k & 1]!;
      t.glow.alpha =
        0.3 + 0.06 * Math.sin(this.time * 9 + t.phase) + 0.03 * Math.sin(this.time * 23);
    }
  }

  private animatePlayer(i: number, v: View): void {
    const e = this.world.e;
    const p = this.world.players[e.ref[i]!];
    const moving = p ? p.moving || p.dashT > 0 : false;
    const frames = moving ? CHAR_ANIMS.run : CHAR_ANIMS.idle;
    const fps = moving ? 10 : 2;
    const idx = frames[Math.floor(this.time * fps) % frames.length]!;
    const flash = e.hitFlash[i]! > 0;
    v.body.texture = (flash ? v.entry.flash : v.entry.frames)[idx]!;
    const face = e.face[i]!;
    v.body.scale.x = Math.abs(face) > Math.PI / 2 ? -1 : 1;
    // Blink while invulnerable after a hit (not during dash).
    v.body.alpha = e.iframes[i]! > 0 && p && p.dashT === 0 && this.world.tick & 2 ? 0.5 : 1;
  }

  destroy(): void {
    for (const v of this.views) v?.root.destroy({ children: true });
    this.views = [];
    this.torches = [];
  }
}
