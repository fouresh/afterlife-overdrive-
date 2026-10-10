import { Tile } from './tiles';
import type { DungeonFloor, PropInfo } from './types';

/**
 * Hand-made test arena (used by the M0 empty scene and by sim tests).
 * Legend: # wall, . floor, T wall with torch, P pillar, b bones, s skull, c cobweb, r rubble, @ start.
 */
const ARENA = `
############################
#T####T######T#####T#####T##
#..........................#
#.c......b.................#
#....P........r.......P....#
#..........................#
#......s...........b.......#
#.............@............#
#.........#####............#
#.........#T###......r.....#
#....P....#..........P.....#
#..........................#
#..r..............s........#
#..........................#
############################
`;

export function parseAsciiFloor(src: string, seed = 1): DungeonFloor {
  const rows = src
    .split('\n')
    .map((r) => r.trimEnd())
    .filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const tiles = new Uint8Array(w * h);
  const variant = new Uint8Array(w * h);
  const props: PropInfo[] = [];
  let start = { x: 1, y: 1 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y]![x] ?? '#';
      const i = y * w + x;
      variant[i] = (x * 7 + y * 13 + ((x * y) % 5)) & 255;
      switch (ch) {
        case '#':
          tiles[i] = Tile.Wall;
          break;
        case 'T':
          tiles[i] = Tile.Wall;
          props.push({ kind: 'torch', x, y, room: 0 });
          break;
        case 'P':
          tiles[i] = Tile.Wall;
          props.push({ kind: 'pillar', x, y, room: 0 });
          break;
        case '@':
          tiles[i] = Tile.Floor;
          start = { x, y };
          break;
        case 'b':
        case 's':
        case 'c':
        case 'r':
          tiles[i] = Tile.Floor;
          props.push({
            kind: ({ b: 'bones', s: 'skull', c: 'cobweb', r: 'rubble' } as const)[ch],
            x,
            y,
            room: 0,
          });
          break;
        default:
          tiles[i] = Tile.Floor;
      }
    }
  }
  return {
    seed,
    biome: 'crypt',
    depth: 0,
    isLast: false,
    w,
    h,
    tiles,
    variant,
    roomOf: new Uint16Array(w * h),
    rooms: [
      {
        id: 0,
        type: 'start',
        rect: { x: 1, y: 1, w: w - 2, h: h - 2 },
        depth: 0,
        lockOnEnter: false,
      },
    ],
    edges: [],
    doors: [],
    props,
    spawns: [],
    start,
    keyRoom: -1,
    lastRoom: 0,
  };
}

export function arenaFloor(): DungeonFloor {
  return parseAsciiFloor(ARENA);
}
