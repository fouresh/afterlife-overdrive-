/**
 * Biome tilesets: which sprites draw the static map. The renderer bakes the floor into chunks
 * using these ids; frames are picked by the per-tile variant with the given weights.
 */
export interface TilesetDef {
  id: string;
  floor: string;
  floorWeights: number[];
  wallTop: string;
  wallFace: string;
  wallFaceWeights: number[];
  door: string;
  doorLocked: string;
  /** Sprite id per decor prop kind (baked into the floor). */
  decor: Record<string, string>;
  /** Wall top rim highlight color. */
  rim: string;
  /** Background clear color (seen outside the map). */
  background: string;
  /** Warm light color for torches/glows. */
  light: number;
}

export const TILESETS: Record<string, TilesetDef> = {
  crypt: {
    id: 'crypt',
    floor: 'crypt.floor',
    floorWeights: [6, 2, 3, 1],
    wallTop: 'crypt.wallTop',
    wallFace: 'crypt.wallFace',
    wallFaceWeights: [5, 1],
    door: 'crypt.door',
    doorLocked: 'crypt.doorLocked',
    decor: {
      bones: 'crypt.bones',
      skull: 'crypt.skull',
      cobweb: 'crypt.cobweb',
      rubble: 'crypt.rubble',
    },
    rim: '#4f4d66',
    background: '#0d0a12',
    light: 0xf2a14c,
  },
};

/** Weighted pick by an integer variant (deterministic, cosmetic). */
export function pickWeighted(weights: readonly number[], variant: number): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = variant % total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r < 0) return i;
  }
  return 0;
}
