import { ART_RES } from '@ao/content';
import { TILE } from '@ao/shared';

/**
 * Low internal resolution + integer upscale. The world is ~15 tiles (≈ 240 world px) tall and is
 * drawn at ART_RES canvas pixels per world pixel (one canvas pixel = one sprite texel), so the
 * canvas is ≈ 480 px tall; the browser compositor scales it with nearest-neighbour. Every texel
 * is exactly `scale / ART_RES` device pixels — a whole number, so pixel art never shimmers.
 */
export interface Viewport {
  cssW: number;
  cssH: number;
  dpr: number;
  /** Device pixels per world pixel (a whole multiple of ART_RES). */
  scale: number;
  /** Visible world size in world pixels (the canvas is ART_RES times larger). */
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
  // Device pixels per texel: a whole number, chosen geometrically closest to the target height
  // (a 720 px screen gets 11 tiles rather than 22, a 1170 px one 18 rather than 12).
  const ideal = ref / (TARGET_TILES_H * TILE * ART_RES);
  const lo = Math.max(1, Math.floor(ideal));
  const texel = ideal / lo <= (lo + 1) / ideal ? lo : lo + 1;
  const scale = texel * ART_RES;
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
