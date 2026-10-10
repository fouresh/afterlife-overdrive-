import { getContent } from '@ao/content';
import { Rng, deriveSeed } from '@ao/shared';
import { bspLayout, type Layout } from './layout-bsp';
import { populate } from './populate';
import { assignRoles, buildGraph } from './roles';
import { Tile } from './tiles';
import type { DoorInfo, DungeonFloor, RoomInfo } from './types';
import { validateFloor } from './validate';

export interface FloorParams {
  /** Run seed (from the server in online play). */
  seed: number;
  biome: string;
  /** 0-based floor index. */
  depth: number;
  /** Total floors in the run (the last one has the boss). */
  floors: number;
}

/**
 * Deterministic floor generation: the same params always produce the same floor, on every
 * device and on the server. Retries internally (deterministically) until the floor validates.
 */
export function generateFloor(p: FloorParams): DungeonFloor {
  const biome = getContent().biomes.get(p.biome);
  if (!biome) throw new Error(`Unknown biome '${p.biome}'`);
  const isLast = p.depth >= p.floors - 1;
  let lastIssues: string[] = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = new Rng(deriveSeed(p.seed, 'floor', p.depth, attempt));
    const target = rng.int(biome.roomCount[0], biome.roomCount[1]) + Math.min(p.depth, 2);
    const layout = bspLayout(rng, target);
    if (!layout) continue;
    const graph = buildGraph(layout);
    const roles = assignRoles(rng, layout, graph, isLast);
    if (!roles) continue;
    const pop = populate(rng, layout, roles, biome, p.depth);
    const floor = toFloor(layout, roles, pop, p, isLast, attempt);
    lastIssues = validateFloor(floor);
    if (lastIssues.length === 0) return floor;
  }
  throw new Error(
    `Floor generation failed for seed ${p.seed} depth ${p.depth}: ${lastIssues.join('; ')}`,
  );
}

function toFloor(
  l: Layout,
  roles: NonNullable<ReturnType<typeof assignRoles>>,
  pop: ReturnType<typeof populate>,
  p: FloorParams,
  isLast: boolean,
  attempt: number,
): DungeonFloor {
  const { w, h, tiles } = l;
  const rooms: RoomInfo[] = l.rooms.map((r, i) => {
    const type = roles.types[i]!;
    return {
      id: i,
      type,
      rect: r.rect,
      depth: roles.depth[i]!,
      template: pop.templates[i],
      lockOnEnter: type === 'combat' || type === 'key' || type === 'miniboss' || type === 'boss',
    };
  });
  const doors: DoorInfo[] = [];
  for (const d of l.doors) {
    const locked = d.room === roles.treasure;
    for (const c of d.cells) {
      if (locked) tiles[c] = Tile.LockedDoor;
      if (!doors.some((x) => x.x === c % w && x.y === Math.floor(c / w)))
        doors.push({ x: c % w, y: Math.floor(c / w), room: d.room, locked });
    }
  }
  const roomOf = new Uint16Array(w * h);
  rooms.forEach((r, i) => {
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.w; x++) roomOf[y * w + x] = i + 1;
    }
  });
  const variant = new Uint8Array(w * h);
  const vr = new Rng(deriveSeed(p.seed, 'variant', p.depth, attempt));
  for (let i = 0; i < variant.length; i++) variant[i] = vr.nextU32() & 255;
  const s = rooms[roles.start]!.rect;
  const start = { x: s.x + (s.w >> 1), y: s.y + (s.h >> 1) };
  // Keep the start tile clean of decor/hazards.
  const props = pop.props.filter(
    (pr) => !(pr.x === start.x && pr.y === start.y && pr.kind === 'spikes'),
  );
  return {
    seed: p.seed,
    biome: p.biome,
    depth: p.depth,
    isLast,
    w,
    h,
    tiles,
    variant,
    roomOf,
    rooms,
    edges: [],
    doors,
    props,
    spawns: pop.spawns,
    start,
    keyRoom: roles.keyRoom,
    lastRoom: roles.last,
  };
}
