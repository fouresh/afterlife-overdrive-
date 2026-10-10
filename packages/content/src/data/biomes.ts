import type { z } from 'zod';
import type { BiomeDef } from '../schema';

type B = z.input<typeof BiomeDef>;

export const BIOMES: B[] = [
  {
    id: 'crypt',
    nameKey: 'biome.crypt',
    tileset: 'crypt',
    generator: 'bsp',
    enemies: [
      { id: 'skeleton', weight: 10 },
      { id: 'skeletonArcher', weight: 7 },
      { id: 'bat', weight: 6 },
      { id: 'slime', weight: 6 },
      { id: 'cultist', weight: 4, minDepth: 1 },
      { id: 'ghost', weight: 4, minDepth: 1 },
    ],
    minibosses: ['boneKnight'],
    bosses: ['cryptWarden'],
    decor: { bones: 0.022, skull: 0.01, rubble: 0.02, cobweb: 0.5 },
    torchSpacing: 5,
    spikeChance: 0.3,
    roomCount: [8, 10],
  },
];
