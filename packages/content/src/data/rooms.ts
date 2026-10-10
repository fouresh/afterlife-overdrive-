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
    rows: ['##.....', '#......', '.......', '......#', '.....##'],
    weight: 2,
  },
  {
    id: 'ossuary',
    types: ['combat', 'key', 'start'],
    rows: ['b..b..b', '.......', 'b..b..b'],
    weight: 1,
  },
  {
    id: 'treasure',
    types: ['treasure'],
    rows: ['.......', '.P...P.', '...c...', '.P...P.', '.......'],
  },
  { id: 'shop', types: ['shop'], rows: ['.......', '.c.c.c.', '.......'] },
  {
    id: 'arena',
    types: ['boss'],
    rows: ['P.........P', '...........', '.....c.....', '...........', 'P.........P'],
  },
];
