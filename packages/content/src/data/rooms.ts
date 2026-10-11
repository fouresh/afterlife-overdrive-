import type { z } from 'zod';
import type { RoomTemplate } from '../schema';

type R = z.input<typeof RoomTemplate>;

/**
 * Interior templates, stamped centered into a room's floor rectangle. Legend:
 * '.' floor, '#' wall block, 'P' pillar, 'O' pit, 'S' spikes, 'b' bones,
 * 'e' preferred enemy spawn, 'c' feature spot (chest / shop pedestal / boss), '?' keep as is.
 * The generator rejects a template if it would disconnect the room.
 */
export const ROOM_TEMPLATES: R[] = [
  { id: 'empty', types: ['combat', 'key', 'start', 'exit'], rows: ['?'], weight: 2 },
  {
    id: 'pillars4',
    types: ['combat', 'key', 'miniboss', 'exit'],
    rows: ['P.....P', '.......', '...e...', '.......', 'P.....P'],
    weight: 3,
  },
  {
    id: 'pillars6',
    types: ['combat', 'key'],
    rows: ['P...P...P', '.........', '..e...e..', '.........', 'P...P...P'],
    weight: 2,
  },
  { id: 'centerPit', types: ['combat', 'key'], rows: ['..OOO..', '.OOOOO.', '..OOO..'], weight: 2 },
  {
    id: 'centerBlock',
    types: ['combat', 'key'],
    biomes: ['crypt'],
    rows: ['.##.', '####', '####', '.##.'],
    weight: 2,
  },
  {
    id: 'spikeX',
    types: ['combat'],
    rows: ['S...S', '.S.S.', '..S..', '.S.S.', 'S...S'],
    weight: 1,
  },
  { id: 'spikeLane', types: ['combat'], rows: ['.......', 'SSSSSSS', '.......'], weight: 1 },
  {
    id: 'pitCorners',
    types: ['combat', 'key'],
    rows: ['OO.....OO', 'O.......O', '....e....', 'O.......O', 'OO.....OO'],
    weight: 2,
  },
  {
    id: 'walls',
    types: ['combat', 'key'],
    biomes: ['crypt'],
    rows: ['##.....', '#......', '.......', '......#', '.....##'],
    weight: 2,
  },
  {
    id: 'ossuary',
    types: ['combat', 'key', 'start'],
    rows: ['b..b..b', '.......', 'b..b..b'],
    weight: 1,
    biomes: ['crypt'],
  },
  // Large interiors for the bigger rooms (picked only where they fit).
  {
    id: 'colonnade',
    types: ['combat', 'key', 'exit'],
    biomes: ['crypt'],
    rows: ['P..P..P..P..P', '.............', '...e.....e...', '.............', 'P..P..P..P..P'],
    weight: 3,
  },
  {
    id: 'blocks4',
    types: ['combat', 'key'],
    biomes: ['crypt'],
    rows: [
      '##.......##',
      '##.......##',
      '...........',
      '.....e.....',
      '...........',
      '##.......##',
      '##.......##',
    ],
    weight: 3,
  },
  {
    id: 'spikeField',
    types: ['combat'],
    rows: ['S...S...S...S', '..S...S...S..', '.....e.e.....', '..S...S...S..', 'S...S...S...S'],
    weight: 2,
  },
  {
    id: 'pitTwins',
    types: ['combat', 'key'],
    rows: ['.OOO.....OOO.', 'OOOOO...OOOOO', '.OOO..e..OOO.', '......e......'],
    weight: 2,
  },
  {
    id: 'crypts',
    types: ['combat', 'key', 'start'],
    biomes: ['crypt'],
    rows: ['b..P.....P..b', '...P..e..P...', '.............', '...P..e..P...', 'b..P.....P..b'],
    weight: 2,
  },
  {
    id: 'thicket',
    types: ['combat', 'key', 'start'],
    biomes: ['forest'],
    rows: [
      '.P.........P.',
      'PP....e....PP',
      '.............',
      '.....P.P.....',
      '.............',
      'PP....e....PP',
      '.P.........P.',
    ],
    weight: 3,
  },
  {
    id: 'twinPonds',
    types: ['combat', 'key', 'start'],
    biomes: ['forest'],
    rows: ['.OO.......OO.', 'OOOO..e..OOOO', 'OOOO.....OOOO', '.OO...e...OO.'],
    weight: 2,
  },
  {
    id: 'hall',
    types: ['miniboss'],
    rows: ['P.....P.....P', '.............', '......e......', '.............', 'P.....P.....P'],
    weight: 3,
  },
  // Forest glades: 'P' = tree, 'O' = pond.
  {
    id: 'grove',
    types: ['combat', 'key', 'start'],
    rows: ['.P.....', 'PP.....', '.......', '...e...', '.......', '.....PP', '.....P.'],
    weight: 3,
    biomes: ['forest'],
  },
  {
    id: 'pond',
    types: ['combat', 'key', 'start', 'shop'],
    rows: ['..OO..', '.OOOO.', '.OOOO.', '..OO..'],
    weight: 2,
    biomes: ['forest'],
  },
  {
    id: 'oldOak',
    types: ['combat', 'key', 'miniboss'],
    rows: ['.......', '.......', '...P...', '.......', '.e...e.'],
    weight: 2,
    biomes: ['forest'],
  },
  {
    id: 'treasure',
    types: ['treasure'],
    rows: ['.......', '.P...P.', '...c...', '.P...P.', '.......'],
  },
  { id: 'shop', types: ['shop'], rows: ['.......', '.c.c.c.', '.......'] },
  {
    id: 'arenaGrand',
    types: ['boss'],
    rows: [
      'P.............P',
      '...............',
      '...P.......P...',
      '.......c.......',
      '...P.......P...',
      '...............',
      'P.............P',
    ],
    weight: 3,
  },
  {
    id: 'arena',
    types: ['boss'],
    rows: ['P.........P', '...........', '.....c.....', '...........', 'P.........P'],
  },
];
