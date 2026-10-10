import { HUB_STATIONS } from '@ao/content';
import { describe, expect, it } from 'vitest';
import { hubFloor } from './arena';
import { bfs } from './grid';
import { Tile } from './tiles';

describe('hub floor', () => {
  it('places every station and keeps them reachable from the spawn', () => {
    const letters: Record<string, number> = {};
    HUB_STATIONS.forEach((s, i) => (letters[s.letter] = i));
    const f = hubFloor(letters);
    const stations = f.props.filter((p) => p.kind === 'station');
    expect(stations).toHaveLength(HUB_STATIONS.length);
    const dist = bfs(f.w, f.h, [f.start.y * f.w + f.start.x], (i) => f.tiles[i] === Tile.Floor);
    for (const s of stations) {
      // A station is solid; one of its 4 neighbours must be reachable floor.
      const n = [s.x - 1, s.x + 1]
        .map((x) => s.y * f.w + x)
        .concat([(s.y - 1) * f.w + s.x, (s.y + 1) * f.w + s.x]);
      expect(n.some((i) => dist[i]! >= 0)).toBe(true);
    }
  });
});
