import { bfs } from './grid';
import { Tile } from './tiles';
import type { DungeonFloor } from './types';

/**
 * Structural checks that guarantee a playable floor (run over 1000 seeds in tests):
 * every room reachable, key reachable without the locked door, treasure reachable with it,
 * spawns/props on reachable floor, doorways open on both sides, no softlocks.
 */
export function validateFloor(f: DungeonFloor): string[] {
  const issues: string[] = [];
  const { w, h, tiles } = f;
  const idx = (x: number, y: number) => y * w + x;
  const spikes = new Set(f.props.filter((p) => p.kind === 'spikes').map((p) => idx(p.x, p.y)));
  const walkable = (i: number, keyUsed: boolean) => {
    const t = tiles[i]!;
    return t === Tile.Floor || t === Tile.Door || (keyUsed && t === Tile.LockedDoor);
  };
  const start = idx(f.start.x, f.start.y);
  if (!walkable(start, false)) issues.push('start not walkable');
  if (spikes.has(start)) issues.push('start on spikes');
  const noKey = bfs(w, h, [start], (i) => walkable(i, false));
  const withKey = bfs(w, h, [start], (i) => walkable(i, true));

  const roomReach = (ri: number, dist: Int32Array) => {
    const r = f.rooms[ri]!.rect;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) if (dist[idx(x, y)]! >= 0) return true;
    return false;
  };
  const types = f.rooms.map((r) => r.type);
  if (types.filter((t) => t === 'start').length !== 1) issues.push('need exactly one start room');
  if (f.lastRoom < 0) issues.push('no last room');
  else if (!roomReach(f.lastRoom, noKey)) issues.push('last room unreachable');
  if (f.keyRoom >= 0 && !roomReach(f.keyRoom, noKey))
    issues.push('key room unreachable without key');
  const hasLock = f.doors.some((d) => d.locked);
  if (hasLock && f.keyRoom < 0) issues.push('locked door without key');
  f.rooms.forEach((r, ri) => {
    const dist = r.type === 'treasure' ? withKey : noKey;
    if (!roomReach(ri, dist)) issues.push(`room ${ri} (${r.type}) unreachable`);
    // Every walkable cell of the room must be reachable (no sealed pockets → no softlock).
    for (let y = r.rect.y; y < r.rect.y + r.rect.h; y++) {
      for (let x = r.rect.x; x < r.rect.x + r.rect.h && x < r.rect.x + r.rect.w; x++) {
        const i = idx(x, y);
        if ((tiles[i] === Tile.Floor || tiles[i] === Tile.Door) && withKey[i]! < 0) {
          issues.push(`room ${ri} has an unreachable pocket at ${x},${y}`);
          return;
        }
      }
    }
  });
  for (const s of f.spawns) {
    const i = idx(s.x, s.y);
    if (tiles[i] !== Tile.Floor) issues.push(`spawn ${s.enemy} not on floor at ${s.x},${s.y}`);
    else if (withKey[i]! < 0) issues.push(`spawn ${s.enemy} unreachable at ${s.x},${s.y}`);
    else if (spikes.has(i)) issues.push(`spawn ${s.enemy} on spikes`);
    const r = f.rooms[s.room]!.rect;
    if (s.x < r.x || s.y < r.y || s.x >= r.x + r.w || s.y >= r.y + r.h)
      issues.push(`spawn outside its room`);
  }
  for (const p of f.props) {
    if (p.kind === 'chest' || p.kind === 'stairs' || p.kind === 'shop') {
      const i = idx(p.x, p.y);
      if (tiles[i] !== Tile.Floor || withKey[i]! < 0)
        issues.push(`${p.kind} not reachable at ${p.x},${p.y}`);
    }
  }
  for (const d of f.doors) {
    const i = idx(d.x, d.y);
    const horiz =
      tiles[i - 1] !== undefined &&
      (walkable(i - 1, true) || walkable(i + 1, true)) &&
      walkable(i - 1, true) &&
      walkable(i + 1, true);
    const vert = walkable(i - w, true) && walkable(i + w, true);
    if (!horiz && !vert) issues.push(`door at ${d.x},${d.y} is not passable`);
  }
  if (!f.rooms.some((r) => r.type === 'boss') && !f.props.some((p) => p.kind === 'stairs'))
    issues.push('no stairs and no boss');
  if (h * w !== tiles.length) issues.push('size mismatch');
  return issues;
}
