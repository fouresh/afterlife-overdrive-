/**
 * Master palette. Every sprite uses these colors (or customization slots) so the whole game
 * shares one coherent look. Biome tilesets pick ramps from here.
 */
export const C = {
  clear: '',
  black: '#0d0a12',
  ink: '#1b1325',
  night: '#2a2140',
  dusk: '#3b2f5c',

  stone0: '#25232f',
  stone1: '#36344a',
  stone2: '#4f4d66',
  stone3: '#73718f',
  stone4: '#a3a1bd',

  moss0: '#22301f',
  moss1: '#36502e',

  bone0: '#7f7764',
  bone1: '#bdb497',
  bone2: '#ece4c8',

  red0: '#45142a',
  red1: '#8a2337',
  red2: '#cf4440',
  red3: '#f08b5c',

  gold0: '#6e4218',
  gold1: '#c08427',
  gold2: '#f2c94c',
  gold3: '#fff2ad',

  green0: '#183524',
  green1: '#2a6435',
  green2: '#4c9e47',
  green3: '#a3d65b',

  blue0: '#182250',
  blue1: '#294995',
  blue2: '#3d84d1',
  blue3: '#8ad1f5',

  violet0: '#2c1846',
  violet1: '#5a2c80',
  violet2: '#9a4dc4',
  violet3: '#d89cf2',

  wood0: '#33201a',
  wood1: '#5a3824',
  wood2: '#875934',
  wood3: '#b98549',

  cyan0: '#113a44',
  cyan1: '#1d7778',
  cyan2: '#36c4b4',
  cyan3: '#aaf6ec',

  white: '#f6f2e9',
} as const;

export type ColorName = keyof typeof C;

/** Parse '#rrggbb' into [r,g,b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Darken/lighten a hex color by factor (0.8 = 20% darker). */
export function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * factor)));
  return rgbToHex(f(r), f(g), f(b));
}

/** Mix a hex color towards white by `t` (0 = unchanged, 1 = white). */
export function tint(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(c + (255 - c) * t);
  return rgbToHex(f(r), f(g), f(b));
}
