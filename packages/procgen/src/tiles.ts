/** Tile ids stored in DungeonFloor.tiles. */
export const Tile = {
  Void: 0,
  Floor: 1,
  Wall: 2,
  /** Doorway between a room and a corridor. Open by default; the sim closes it during fights. */
  Door: 3,
  /** Door that needs a key. */
  LockedDoor: 4,
  Pit: 5,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

/** Tile collision flags. */
export const TF = {
  BlockWalk: 1,
  BlockShot: 2,
} as const;

/** Static collision flags per tile id (doors are dynamic, handled by the sim). */
export const TILE_FLAGS: Record<number, number> = {
  [Tile.Void]: TF.BlockWalk | TF.BlockShot,
  [Tile.Floor]: 0,
  [Tile.Wall]: TF.BlockWalk | TF.BlockShot,
  [Tile.Door]: 0,
  [Tile.LockedDoor]: TF.BlockWalk | TF.BlockShot,
  [Tile.Pit]: TF.BlockWalk,
};

export function isWalkableTile(t: number): boolean {
  return t === Tile.Floor || t === Tile.Door;
}
