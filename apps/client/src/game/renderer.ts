import { Application, Container, Sprite, TextureSource } from 'pixi.js';
import { applyCanvasSize, type Viewport } from '../core/viewport';
import type { Atlas, AtlasEntry } from './atlas';

TextureSource.defaultOptions.scaleMode = 'nearest';

/** Pixi application wrapper: owns the canvas, the layer stack and the camera. */
export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly floorLayer = new Container();
  readonly decalLayer = new Container();
  readonly actorLayer = new Container();
  readonly fxLayer = new Container();
  readonly glowLayer = new Container();
  readonly topLayer = new Container();
  viewport!: Viewport;
  camX = 0;
  camY = 0;
  shake = 0;
  private shakeX = 0;
  private shakeY = 0;

  async init(canvas: HTMLCanvasElement, viewport: Viewport, background: string): Promise<void> {
    this.viewport = viewport;
    await this.app.init({
      canvas,
      width: viewport.logicalW,
      height: viewport.logicalH,
      resolution: 1,
      autoDensity: false,
      antialias: false,
      background,
      preference: 'webgl',
      powerPreference: 'high-performance',
      autoStart: false,
      sharedTicker: false,
      roundPixels: true,
      hello: false,
    });
    this.app.ticker.stop();
    applyCanvasSize(canvas, viewport);
    this.actorLayer.sortableChildren = true;
    this.glowLayer.blendMode = 'add';
    this.world.addChild(
      this.floorLayer,
      this.decalLayer,
      this.actorLayer,
      this.glowLayer,
      this.fxLayer,
      this.topLayer,
    );
    this.app.stage.addChild(this.world);
  }

  resize(v: Viewport): void {
    this.viewport = v;
    this.app.renderer.resize(v.logicalW, v.logicalH);
    applyCanvasSize(this.app.canvas, v);
  }

  /** Center the camera on (x, y) world px, clamped to the map, with screen shake. */
  updateCamera(x: number, y: number, mapW: number, mapH: number, dt: number): void {
    const v = this.viewport;
    const halfW = v.logicalW / 2;
    const halfH = v.logicalH / 2;
    const k = 1 - Math.pow(0.0001, dt); // frame-rate independent smoothing
    this.camX += (x - this.camX) * k;
    this.camY += (y - this.camY) * k;
    if (Math.abs(x - this.camX) > 200 || Math.abs(y - this.camY) > 200) {
      this.camX = x;
      this.camY = y;
    }
    const cx = mapW <= v.logicalW ? mapW / 2 : Math.min(Math.max(this.camX, halfW), mapW - halfW);
    const cy = mapH <= v.logicalH ? mapH / 2 : Math.min(Math.max(this.camY, halfH), mapH - halfH);
    if (this.shake > 0) {
      const s = this.shake;
      this.shakeX = (Math.random() * 2 - 1) * s;
      this.shakeY = (Math.random() * 2 - 1) * s;
      this.shake = Math.max(0, this.shake - dt * 30);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
    this.world.x = Math.round(halfW - cx + this.shakeX);
    this.world.y = Math.round(halfH - cy + this.shakeY);
  }

  addShake(amount: number): void {
    this.shake = Math.min(6, Math.max(this.shake, amount));
  }

  /** Visible world rectangle (for culling). */
  visibleRect(margin = 32): { x: number; y: number; w: number; h: number } {
    return {
      x: -this.world.x - margin,
      y: -this.world.y - margin,
      w: this.viewport.logicalW + margin * 2,
      h: this.viewport.logicalH + margin * 2,
    };
  }

  render(): void {
    this.app.render();
  }

  destroy(): void {
    this.app.destroy({ removeView: false }, { children: true });
  }
}

/** Create a sprite from an atlas entry with its pivot applied. */
export function makeSprite(entry: AtlasEntry, frame = 0): Sprite {
  const s = new Sprite(entry.frames[frame % entry.frames.length]);
  s.anchor.set(entry.def.ox / entry.def.w, entry.def.oy / entry.def.h);
  return s;
}

export function getEntry(atlas: Atlas, id: string): AtlasEntry {
  return atlas.get(id);
}
