import {
  allSprites,
  blitImage,
  createImage,
  rasterize,
  silhouette,
  type RgbaImage,
  type SpriteDef,
} from '@ao/content';
import { CanvasSource, Rectangle, Texture } from 'pixi.js';

/** PNG overrides: drop `<sprite id>.png` into src/assets/sprite-overrides/ (see README there). */
const overrideUrls = import.meta.glob<string>('../assets/sprite-overrides/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function overrideFor(id: string): string | undefined {
  for (const [path, url] of Object.entries(overrideUrls)) {
    if (path.endsWith(`/${id}.png`)) return url;
  }
  return undefined;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasEntry {
  def: { w: number; h: number; ox: number; oy: number };
  frames: Texture[];
  flash: Texture[];
  rects: Frame[];
}

/** Procedural sprites (soft shapes with alpha) drawn with canvas 2D. */
const PROCEDURAL: {
  id: string;
  w: number;
  h: number;
  draw: (c: CanvasRenderingContext2D) => void;
}[] = [
  {
    id: 'fx.shadow',
    w: 12,
    h: 5,
    draw: (c) => {
      c.fillStyle = 'rgba(8,5,14,0.45)';
      c.fillRect(2, 0, 8, 5);
      c.fillRect(0, 1, 12, 3);
    },
  },
  {
    id: 'fx.glow',
    w: 64,
    h: 64,
    draw: (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    },
  },
  {
    id: 'fx.px',
    w: 2,
    h: 2,
    draw: (c) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 2, 2);
    },
  },
  {
    id: 'fx.white',
    w: 4,
    h: 4,
    draw: (c) => {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, 4, 4);
    },
  },
];

/**
 * One texture atlas for every static sprite (+ white "hit flash" variants), built at startup on a
 * canvas from the palette pixel maps. One texture = one batch for nearly the whole scene.
 */
export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly source: CanvasSource;
  private entries = new Map<string, AtlasEntry>();
  private ctx: CanvasRenderingContext2D;
  private cursorX = 1;
  private cursorY = 1;
  private rowH = 0;

  private constructor(size: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.source = new CanvasSource({ resource: this.canvas, scaleMode: 'nearest' });
  }

  static async build(extra: SpriteDef[] = []): Promise<Atlas> {
    const atlas = new Atlas(1024);
    const defs = [...allSprites(), ...extra].sort((a, b) => b.h - a.h);
    for (const def of defs) {
      const url = overrideFor(def.id);
      const images = url ? await loadOverride(url, def) : null;
      const frames = images ?? def.frames.map((_, f) => rasterize(def, f));
      atlas.addImages(def.id, def.w, def.h, def.ox ?? def.w / 2, def.oy ?? def.h - 1, frames, true);
    }
    for (const p of PROCEDURAL) atlas.addProcedural(p.id, p.w, p.h, p.draw);
    atlas.source.update();
    return atlas;
  }

  private alloc(w: number, h: number): Frame {
    if (this.cursorX + w + 1 > this.canvas.width) {
      this.cursorX = 1;
      this.cursorY += this.rowH + 1;
      this.rowH = 0;
    }
    if (this.cursorY + h + 1 > this.canvas.height) throw new Error('Atlas is full');
    const f = { x: this.cursorX, y: this.cursorY, w, h };
    this.cursorX += w + 1;
    this.rowH = Math.max(this.rowH, h);
    return f;
  }

  private putImage(img: RgbaImage, f: Frame): void {
    const data = new ImageData(new Uint8ClampedArray(img.data), img.w, img.h);
    this.ctx.putImageData(data, f.x, f.y);
  }

  private tex(f: Frame): Texture {
    return new Texture({ source: this.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
  }

  addImages(
    id: string,
    w: number,
    h: number,
    ox: number,
    oy: number,
    images: RgbaImage[],
    withFlash: boolean,
  ): AtlasEntry {
    const rects: Frame[] = [];
    const frames: Texture[] = [];
    const flash: Texture[] = [];
    for (const img of images) {
      const r = this.alloc(w, h);
      this.putImage(img, r);
      rects.push(r);
      frames.push(this.tex(r));
      if (withFlash) {
        const fr = this.alloc(w, h);
        this.putImage(silhouette(img), fr);
        flash.push(this.tex(fr));
      }
    }
    const entry: AtlasEntry = {
      def: { w, h, ox, oy },
      frames,
      flash: withFlash ? flash : frames,
      rects,
    };
    this.entries.set(id, entry);
    return entry;
  }

  private addProcedural(
    id: string,
    w: number,
    h: number,
    draw: (c: CanvasRenderingContext2D) => void,
  ) {
    const r = this.alloc(w, h);
    this.ctx.save();
    this.ctx.translate(r.x, r.y);
    this.ctx.beginPath();
    this.ctx.rect(0, 0, w, h);
    this.ctx.clip();
    draw(this.ctx);
    this.ctx.restore();
    const t = this.tex(r);
    this.entries.set(id, {
      def: { w, h, ox: w / 2, oy: h / 2 },
      frames: [t],
      flash: [t],
      rects: [r],
    });
  }

  get(id: string): AtlasEntry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`Unknown sprite '${id}'`);
    return e;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Draw a frame onto a 2D canvas (used to bake the static tilemap). */
  drawTo(c: CanvasRenderingContext2D, id: string, frame: number, dx: number, dy: number): void {
    const e = this.get(id);
    const r = e.rects[frame % e.rects.length]!;
    c.drawImage(this.canvas, r.x, r.y, r.w, r.h, dx, dy, r.w, r.h);
  }

  destroy(): void {
    this.source.destroy();
  }
}

async function loadOverride(url: string, def: SpriteDef): Promise<RgbaImage[] | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const count = Math.max(1, Math.floor(img.width / def.w));
    const out: RgbaImage[] = [];
    for (let f = 0; f < count; f++) {
      const data = ctx.getImageData(f * def.w, 0, def.w, Math.min(def.h, img.height));
      const im = createImage(def.w, def.h);
      blitImage(im, { w: data.width, h: data.height, data: data.data }, 0, 0);
      out.push(im);
    }
    return out;
  } catch (err) {
    console.warn(`Sprite override ${url} failed, using pixel map`, err);
    return null;
  }
}
