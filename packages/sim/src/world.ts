import type { DungeonFloor } from '@ao/procgen';
import { Rng, TILE, type PlayerInput } from '@ao/shared';
import type { CollisionMap } from './collide';
import { Entities } from './entities';
import { EventBuffer } from './events';

export interface SimPlayer {
  index: number;
  ent: number;
  input: PlayerInput;
  prevButtons: number;
  /** Base movement speed in px/s. */
  speed: number;
  dashCharges: number;
  dashMaxCharges: number;
  dashRecharge: number;
  dashT: number;
  dashDx: number;
  dashDy: number;
  /** Ticks since the last input change (for idle/anim purposes). */
  moving: boolean;
}

export interface World {
  tick: number;
  seed: number;
  floor: DungeonFloor;
  map: CollisionMap;
  rng: Rng;
  e: Entities;
  events: EventBuffer;
  players: SimPlayer[];
}

export const PLAYER_RADIUS = 5;
export const PLAYER_SPEED = 80;
export const DASH_SPEED = 270;
export const DASH_TICKS = 6;
export const DASH_RECHARGE_TICKS = 27;
export const DASH_IFRAMES = 9;

export function createWorld(floor: DungeonFloor, seed = floor.seed): World {
  const n = floor.w * floor.h;
  return {
    tick: 0,
    seed,
    floor,
    map: { w: floor.w, h: floor.h, tiles: new Uint8Array(floor.tiles), dyn: new Uint8Array(n) },
    rng: new Rng(seed),
    e: new Entities(1024),
    events: new EventBuffer(512),
    players: [],
  };
}

export function tileCenter(t: number): number {
  return t * TILE + TILE / 2;
}
