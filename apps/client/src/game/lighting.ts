import { Container, RenderTexture, Sprite, Texture, type Renderer as PixiRenderer } from 'pixi.js';
import { gfx } from './gfx';

/** Soft round light: bright core, long smooth tail (reads as a pool of light, not a disc). */
function lightTexture(): Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  // Roughly (1 - d²)² falloff, sampled.
  for (let k = 0; k <= 8; k++) {
    const d = k / 8;
    const a = (1 - d * d) * (1 - d * d);
    grad.addColorStop(d, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = Texture.from(c);
  t.source.scaleMode = 'linear';
  return t;
}

/**
 * Light map: every frame the scene is multiplied by `ambient` plus additive pools of light.
 * Lights are submitted immediate-mode (`add`) between `begin` and `render`; sprites are pooled,
 * so a warm frame allocates nothing. The light map is half the texel resolution and filtered
 * linearly: light is soft by nature and the pass stays cheap on phones.
 */
export class Lighting {
  /** Multiply overlay; lives in the world container between actors and glows. */
  readonly overlay: Sprite;
  /** Darkness of unlit areas (multiplier color). */
  ambient = 0xffffff;
  enabled = gfx.lighting;
  /** Render root: `lights` is offset by the camera inside it. */
  private root = new Container();
  private lights = new Container();
  private pool: Sprite[] = [];
  private used = 0;
  private rt: RenderTexture;
  private tex = lightTexture();

  constructor() {
    this.rt = RenderTexture.create({ width: 1, height: 1, resolution: 1 });
    this.rt.source.scaleMode = 'linear';
    this.overlay = new Sprite(this.rt);
    this.overlay.blendMode = 'multiply';
    this.lights.blendMode = 'add';
    this.root.addChild(this.lights);
  }

  /** Light map size in world pixels (the logical viewport). */
  resize(w: number, h: number): void {
    this.rt.resize(w, h);
    this.overlay.texture = this.rt;
  }

  begin(): void {
    this.used = 0;
  }

  /** A light at world (x, y); `radius` in world px, `alpha` = strength at the centre. */
  add(x: number, y: number, radius: number, color: number, alpha = 1): void {
    if (!this.enabled) return;
    let s = this.pool[this.used];
    if (!s) {
      s = new Sprite(this.tex);
      s.anchor.set(0.5);
      this.pool.push(s);
      this.lights.addChild(s);
    }
    this.used++;
    s.visible = true;
    s.position.set(x, y);
    s.width = radius * 2;
    s.height = radius * 2;
    s.tint = color;
    s.alpha = alpha;
  }

  /** Draw the submitted lights into the light map; `wx`, `wy` = world container offset. */
  render(renderer: PixiRenderer, wx: number, wy: number): void {
    this.overlay.visible = this.enabled;
    if (!this.enabled) return;
    for (let k = this.used; k < this.pool.length; k++) this.pool[k]!.visible = false;
    this.lights.position.set(wx, wy);
    this.overlay.position.set(-wx, -wy);
    renderer.render({
      container: this.root,
      target: this.rt,
      clear: true,
      clearColor: this.ambient,
    });
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.overlay.destroy();
    this.rt.destroy(true);
    this.tex.destroy(true);
  }
}
