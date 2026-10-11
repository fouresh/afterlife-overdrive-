import { ART_RES } from '@ao/content';
import { Application, Container, Sprite, TextureSource } from 'pixi.js';
import { applyCanvasSize, type Viewport } from '../core/viewport';
import type { Atlas, AtlasEntry } from './atlas';
import { Lighting } from './lighting';

TextureSource.defaultOptions.scaleMode = 'nearest';

/** Snap a world coordinate to the texel grid (1 / ART_RES world px). */
export function snap(v: number): number {
  return Math.round(v * ART_RES) / ART_RES;
}

/**
 * Pixi application wrapper: owns the canvas, the layer stack and the camera. The stage works in
 * world pixels; the renderer resolution is ART_RES, so one canvas pixel is one sprite texel.
 */
export class Renderer {
  readonly app = new Application();
  readonly world = new Container();
  readonly floorLayer = new Container();
  readonly decalLayer = new Container();
  readonly actorLayer = new Container();
  readonly fxLayer = new Container();
  readonly glowLayer = new Container();
  readonly topLayer = new Container();
  readonly lighting = new Lighting();
  viewport!: Viewport;
  camX = 0;
  camY = 0;
  shake = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeTime = 0;

  async init(canvas: HTMLCanvasElement, viewport: Viewport, background: string): Promise<void> {
    this.viewport = viewport;
    await this.app.init({
      canvas,
      width: viewport.logicalW,
      height: viewport.logicalH,
      resolution: ART_RES,
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
    this.lighting.resize(viewport.logicalW, viewport.logicalH);
    // Light map multiplies everything below it; glows and effects above it stay emissive.
    this.world.addChild(
      this.floorLayer,
      this.decalLayer,
      this.actorLayer,
      this.lighting.overlay,
      this.glowLayer,
      this.fxLayer,
      this.topLayer,
    );
    this.app.stage.addChild(this.world);
  }

  resize(v: Viewport): void {
    this.viewport = v;
    this.app.renderer.resize(v.logicalW, v.logicalH);
    this.lighting.resize(v.logicalW, v.logicalH);
    applyCanvasSize(this.app.canvas, v);
  }

  /**
   * Follow a world-space target with a small dead zone and velocity look-ahead.
   * Velocity is measured in world pixels per simulation tick.
   */
  updateCamera(
    x: number,
    y: number,
    mapW: number,
    mapH: number,
    dt: number,
    velocityX = 0,
    velocityY = 0,
  ): void {
    const v = this.viewport;
    const halfW = v.logicalW / 2;
    const halfH = v.logicalH / 2;
    const lookX = Math.max(-24, Math.min(24, velocityX * 5));
    const lookY = Math.max(-16, Math.min(16, velocityY * 4));
    const targetX = x + lookX;
    const targetY = y + lookY;

    // Keep tiny player movements from making the whole world drift every frame.
    const deadX = Math.min(24, v.logicalW * 0.08);
    const deadY = Math.min(14, v.logicalH * 0.06);
    const desiredX =
      targetX > this.camX + deadX
        ? targetX - deadX
        : targetX < this.camX - deadX
          ? targetX + deadX
          : this.camX;
    const desiredY =
      targetY > this.camY + deadY
        ? targetY - deadY
        : targetY < this.camY - deadY
          ? targetY + deadY
          : this.camY;

    // Exponential smoothing is stable at variable frame rates.
    const k = 1 - Math.exp(-dt * 10);
    if (Math.abs(targetX - this.camX) > 200 || Math.abs(targetY - this.camY) > 200) {
      this.camX = targetX;
      this.camY = targetY;
    } else {
      this.camX += (desiredX - this.camX) * k;
      this.camY += (desiredY - this.camY) * k;
    }

    // Clamp the camera center so the map edge never reveals empty space.
    const cx = mapW <= v.logicalW ? mapW / 2 : Math.min(Math.max(this.camX, halfW), mapW - halfW);
    const cy = mapH <= v.logicalH ? mapH / 2 : Math.min(Math.max(this.camY, halfH), mapH - halfH);

    // Smooth, decaying shake avoids the harsh random-pixel buzz of per-frame randomness.
    if (this.shake > 0) {
      this.shakeTime += dt;
      this.shakeX = Math.sin(this.shakeTime * 57) * this.shake;
      this.shakeY = Math.cos(this.shakeTime * 43) * this.shake * 0.72;
      this.shake = Math.max(0, this.shake - dt * 22);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeTime = 0;
    }
    // Snap to texels (not whole world pixels): half-pixel camera steps make scrolling smoother.
    this.world.x = snap(halfW - cx + this.shakeX);
    this.world.y = snap(halfH - cy + this.shakeY);
  }

  addShake(amount: number): void {
    this.shake = Math.min(6, Math.max(this.shake, amount));
    this.shakeTime = 0;
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
    this.lighting.render(this.app.renderer, this.world.x, this.world.y);
    this.app.render();
  }

  destroy(): void {
    this.lighting.destroy();
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
