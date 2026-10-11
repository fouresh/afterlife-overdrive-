import { HUB_STATIONS } from '@ao/content';
import { describe, expect, it } from 'vitest';
import { hubFloor } from './arena';
import { bfs } from './grid';
import { Tile } from './tiles';

describe('hub floor', () => {
  it('is a mirror-symmetric open plaza with a clear route from the spawn to the portal', () => {
    const letters: Record<string, number> = {};
    HUB_STATIONS.forEach((s, i) => (letters[s.letter] = i));
    const f = hubFloor(letters);
    const at = (x: number, y: number) => f.tiles[y * f.w + x];

    // Spawn sits on the centre column, with open floor around it.
    expect(f.start.x).toBe((f.w - 1) / 2);
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      expect(at(f.start.x + dx, f.start.y + dy)).toBe(Tile.Floor);
    }

    // The map and its decor mirror left/right.
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) expect(at(x, y)).toBe(at(f.w - 1 - x, y));
    }
    const key = (p: { kind: string; x: number; y: number }) => `${p.kind}:${p.x},${p.y}`;
    const props = new Set(f.props.map(key));
    for (const p of f.props) expect(props.has(key({ ...p, x: f.w - 1 - p.x }))).toBe(true);

    // Torches only decorate the top wall (row 1), never the south wall.
    for (const p of f.props) if (p.kind === 'torch') expect(p.y).toBeLessThan(f.h / 2);

    // The portal is reachable from the spawn.
    const portal = f.props.find(
      (p) => p.kind === 'station' && p.v === HUB_STATIONS.findIndex((s) => s.id === 'portal'),
    );
    expect(portal).toBeDefined();
    const dist = bfs(f.w, f.h, [f.start.y * f.w + f.start.x], (i) => f.tiles[i] === Tile.Floor);
    expect(dist[(portal!.y - 1) * f.w + portal!.x]).toBeGreaterThanOrEqual(0);
  });

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
