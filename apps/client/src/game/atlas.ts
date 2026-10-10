import {
  allSprites,
  blitImage,
  createImage,
  getContent,
  materialSlots,
  rasterize,
  silhouette,
  spriteById,
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
  {
    // Melee slash crescent pointing right (rotated to the aim).
    id: 'fx.slash',
    w: 40,
    h: 40,
    draw: (c) => {
      c.translate(20, 20);
      for (let k = 0; k < 6; k++) {
        c.beginPath();
        c.strokeStyle = `rgba(255,255,255,${0.15 + k * 0.15})`;
        c.lineWidth = 6 - k;
        c.arc(-6, 0, 22 - k * 0.6, -1.05 + k * 0.05, 1.05 - k * 0.05);
        c.stroke();
      }
    },
  },
  {
    id: 'fx.ring',
    w: 32,
    h: 32,
    draw: (c) => {
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(16, 16, 14.5, 0, Math.PI * 2);
      c.stroke();
    },
  },
  {
    id: 'fx.disc',
    w: 32,
    h: 32,
    draw: (c) => {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(16, 16, 15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.stroke();
    },
  },
  {
    id: 'fx.beam',
    w: 8,
    h: 40,
    draw: (c) => {
      const g = c.createLinearGradient(0, 0, 0, 40);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0.8)');
      c.fillStyle = g;
      c.fillRect(2, 0, 4, 40);
    },
  },
];

/** Item icons per base id (armor icons recolored by material). Ids: `item:<baseId>`. */
function itemIconImages(): { id: string; def: SpriteDef; img: RgbaImage }[] {
  const out: { id: string; def: SpriteDef; img: RgbaImage }[] = [];
  for (const [id, base] of getContent().bases) {
    const def = spriteById(base.def.icon);
    if (!def) continue;
    const slots = base.kind === 'armor' ? materialSlots(base.def.look.material) : undefined;
    out.push({ id: `item:${id}`, def, img: rasterize(def, 0, slots) });
  }
  return out;
}

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
    for (const ic of itemIconImages()) {
      atlas.addImages(ic.id, ic.def.w, ic.def.h, ic.def.w / 2, ic.def.h / 2, [ic.img], false);
    }
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

  /** PNG data URL of one frame (for DOM UI icons), scaled by an integer factor. Cached. */
  dataUrl(id: string, frame = 0, scale = 3): string {
    const key = `${id}#${frame}@${scale}`;
    let url = this.urls.get(key);
    if (url) return url;
    const e = this.get(id);
    const r = e.rects[frame % e.rects.length]!;
    const c = document.createElement('canvas');
    c.width = r.w * scale;
    c.height = r.h * scale;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, r.x, r.y, r.w, r.h, 0, 0, r.w * scale, r.h * scale);
    url = c.toDataURL();
    this.urls.set(key, url);
    return url;
  }

  private urls = new Map<string, string>();

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
