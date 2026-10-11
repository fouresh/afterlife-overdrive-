/**
 * Biome tilesets: which sprites draw the static map. The renderer bakes the floor into chunks
 * using these ids; frames are picked by the per-tile variant with the given weights.
 */
export interface TilesetDef {
  id: string;
  floor: string;
  floorWeights: number[];
  wallTop: string;
  /** Wall top frame weights (default: frame 0 only). */
  wallTopWeights?: number[];
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
  /** Sprites of interactive/animated props. */
  torch: string;
  pillar: string;
  stairs: string;
  spikes: string;
  /** Pit fill and edge colors (crypt: void, forest: water). */
  pit: string;
  pitEdge: string;
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
    torch: 'crypt.torch',
    pillar: 'crypt.pillar',
    stairs: 'crypt.stairs',
    spikes: 'crypt.spikes',
    pit: '#05030a',
    pitEdge: '#4f4d66',
  },
  forest: {
    id: 'forest',
    floor: 'forest.floor',
    floorWeights: [7, 3, 1, 2],
    wallTop: 'forest.wallTop',
    wallTopWeights: [1, 1],
    wallFace: 'forest.wallFace',
    wallFaceWeights: [3, 2],
    door: 'forest.door',
    doorLocked: 'crypt.doorLocked',
    decor: {
      flowers: 'forest.flowers',
      mushroom: 'forest.mushroom',
      tuft: 'forest.tuft',
      stone: 'forest.stone',
    },
    rim: '#2a6435',
    background: '#0b140e',
    light: 0x36c4b4,
    torch: 'forest.glow',
    pillar: 'forest.tree',
    stairs: 'forest.burrow',
    spikes: 'forest.thorns',
    pit: '#113a44',
    pitEdge: '#36c4b4',
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
