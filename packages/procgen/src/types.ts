import type { Tile } from './tiles';

export type RoomType =
  'start' | 'combat' | 'key' | 'treasure' | 'shop' | 'miniboss' | 'boss' | 'exit' | 'corridor';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RoomInfo {
  id: number;
  type: RoomType;
  /** Bounding rectangle in tiles (interior floor area). */
  rect: Rect;
  /** Graph distance from the start room. */
  depth: number;
  /** Room template used for the interior, if any (for debugging). */
  template?: string;
  /** Closes its doors while enemies are alive. */
  lockOnEnter: boolean;
}

export interface DoorInfo {
  x: number;
  y: number;
  /** Room this doorway belongs to (doors close when that room is fighting). */
  room: number;
  locked: boolean;
}

export type PropKind =
  | 'torch'
  | 'bones'
  | 'skull'
  | 'cobweb'
  | 'rubble'
  | 'pillar'
  | 'chest'
  | 'key'
  | 'stairs'
  | 'spikes'
  | 'shop'
  | 'vase';

export interface PropInfo {
  kind: PropKind;
  /** Tile coordinates. */
  x: number;
  y: number;
  room: number;
  /** Visual variant / extra data. */
  v?: number;
}

export interface SpawnInfo {
  room: number;
  wave: number;
  enemy: string;
  /** Tile coordinates. */
  x: number;
  y: number;
}

export interface DungeonFloor {
  seed: number;
  biome: string;
  /** 0-based floor index inside the run. */
  depth: number;
  isLast: boolean;
  w: number;
  h: number;
  tiles: Uint8Array;
  /** Visual variant per tile (floor/wall variations), purely cosmetic. */
  variant: Uint8Array;
  /** Room index + 1 per tile, 0 = corridor / outside. */
  roomOf: Uint16Array;
  rooms: RoomInfo[];
  /** Room graph edges (indices into rooms). */
  edges: [number, number][];
  doors: DoorInfo[];
  props: PropInfo[];
  spawns: SpawnInfo[];
  /** Player spawn in tile coordinates. */
  start: { x: number; y: number };
  /** Index of the room that drops the key (cleared → key appears), -1 if none. */
  keyRoom: number;
  /** Index of the last room (miniboss with stairs, or the boss). */
  lastRoom: number;
}

export function tileAt(f: { w: number; h: number; tiles: Uint8Array }, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return 0 as Tile;
  return f.tiles[y * f.w + x] as Tile;
}
