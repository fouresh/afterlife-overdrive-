import { ART_RES, silhouette, type RgbaImage } from '@ao/content';
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { AtlasEntry } from './atlas';

/**
 * A small standalone texture sheet for runtime-composed sprites (paper-doll characters).
 * Kept separate from the main atlas so re-equipping does not leak atlas space.
 * `w`, `h`, `ox`, `oy` are in texels (ART_RES per world pixel), like atlas entries.
 */
export class Sheet {
  readonly entry: AtlasEntry;
  private source: CanvasSource;

  constructor(images: RgbaImage[], w: number, h: number, ox: number, oy: number) {
    const k = ART_RES;
    // Even cell pitch keeps every frame on whole world units.
    const pitch = w + 2 - (w & 1);
    const canvas = document.createElement('canvas');
    canvas.width = images.length * pitch;
    canvas.height = (h + (h & 1)) * 2 + 2;
    const flashY = h + (h & 1) + 2;
    const ctx = canvas.getContext('2d')!;
    images.forEach((img, i) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), w, h), i * pitch, 0);
      const fl = silhouette(img);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(fl.data), w, h), i * pitch, flashY);
    });
    this.source = new CanvasSource({ resource: canvas, scaleMode: 'nearest', resolution: k });
    const tex = (x: number, y: number) =>
      new Texture({ source: this.source, frame: new Rectangle(x / k, y / k, w / k, h / k) });
    this.entry = {
      def: { w, h, ox, oy },
      frames: images.map((_, i) => tex(i * pitch, 0)),
      flash: images.map((_, i) => tex(i * pitch, flashY)),
      rects: images.map((_, i) => ({ x: i * pitch, y: 0, w, h })),
    };
  }

  destroy(): void {
    this.source.destroy();
  }
}
