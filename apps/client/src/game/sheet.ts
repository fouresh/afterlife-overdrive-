import { silhouette, type RgbaImage } from '@ao/content';
import { CanvasSource, Rectangle, Texture } from 'pixi.js';
import type { AtlasEntry } from './atlas';

/**
 * A small standalone texture sheet for runtime-composed sprites (paper-doll characters).
 * Kept separate from the main atlas so re-equipping does not leak atlas space.
 */
export class Sheet {
  readonly entry: AtlasEntry;
  private source: CanvasSource;

  constructor(images: RgbaImage[], w: number, h: number, ox: number, oy: number) {
    const canvas = document.createElement('canvas');
    canvas.width = images.length * (w + 1);
    canvas.height = h * 2 + 1;
    const ctx = canvas.getContext('2d')!;
    images.forEach((img, i) => {
      ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), w, h), i * (w + 1), 0);
      const fl = silhouette(img);
      ctx.putImageData(new ImageData(new Uint8ClampedArray(fl.data), w, h), i * (w + 1), h + 1);
    });
    this.source = new CanvasSource({ resource: canvas, scaleMode: 'nearest' });
    const frames = images.map(
      (_, i) => new Texture({ source: this.source, frame: new Rectangle(i * (w + 1), 0, w, h) }),
    );
    const flash = images.map(
      (_, i) =>
        new Texture({ source: this.source, frame: new Rectangle(i * (w + 1), h + 1, w, h) }),
    );
    this.entry = {
      def: { w, h, ox, oy },
      frames,
      flash,
      rects: images.map((_, i) => ({ x: i * (w + 1), y: 0, w, h })),
    };
  }

  destroy(): void {
    this.source.destroy();
  }
}
