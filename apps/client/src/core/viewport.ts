import { TILE } from '@ao/shared';

/**
 * Low internal resolution + integer upscale. The canvas backing store is tiny (≈ 240 px tall) and
 * the browser compositor scales it with nearest-neighbour, so a DPR-3 phone still renders only
 * ~120k pixels per frame. Each logical pixel is exactly `scale` device pixels.
 */
export interface Viewport {
  cssW: number;
  cssH: number;
  dpr: number;
  /** Device pixels per logical pixel (integer). */
  scale: number;
  logicalW: number;
  logicalH: number;
  portrait: boolean;
}

/** Target visible height in tiles (actual value lands within ~13.5–17). */
export const TARGET_TILES_H = 15;

export function computeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  const devW = Math.max(1, Math.round(cssW * dpr));
  const devH = Math.max(1, Math.round(cssH * dpr));
  const portrait = devH > devW;
  // In portrait we size by the short side so the rotate-hint background still looks right.
  const ref = portrait ? devW : devH;
  const scale = Math.max(1, Math.round(ref / (TARGET_TILES_H * TILE)));
  return {
    cssW,
    cssH,
    dpr,
    scale,
    logicalW: Math.ceil(devW / scale),
    logicalH: Math.ceil(devH / scale),
    portrait,
  };
}

export function readViewport(): Viewport {
  const vv = window.visualViewport;
  const w = vv ? vv.width * vv.scale : window.innerWidth;
  const h = vv ? vv.height * vv.scale : window.innerHeight;
  return computeViewport(Math.round(w), Math.round(h), window.devicePixelRatio || 1);
}

/** Apply the canvas CSS size so one logical pixel = `scale` device pixels. */
export function applyCanvasSize(canvas: HTMLCanvasElement, v: Viewport): void {
  canvas.style.width = `${(v.logicalW * v.scale) / v.dpr}px`;
  canvas.style.height = `${(v.logicalH * v.scale) / v.dpr}px`;
}

export function onViewportChange(fn: () => void): () => void {
  let raf = 0;
  const handler = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  };
  window.addEventListener('resize', handler);
  window.addEventListener('orientationchange', handler);
  window.visualViewport?.addEventListener('resize', handler);
  return () => {
    window.removeEventListener('resize', handler);
    window.removeEventListener('orientationchange', handler);
    window.visualViewport?.removeEventListener('resize', handler);
  };
}

/** Best effort: fullscreen + landscape lock on phones (Android Chrome; iOS ignores it). */
export async function enterImmersive(): Promise<void> {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    /* not allowed: fine */
  }
  try {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape');
  } catch {
    /* not supported: fine */
  }
}
