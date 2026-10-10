import { Tile } from '@ao/procgen';
import { TILE } from '@ao/shared';
import { useEffect, useRef } from 'preact/hooks';
import type { GameHost } from '../../game/host';

const COLORS: Record<string, string> = {
  start: '#4c9e47',
  combat: '#4f4d66',
  key: '#4f4d66',
  treasure: '#c08427',
  shop: '#2a6435',
  miniboss: '#8a2337',
  boss: '#cf4440',
};

/** Fog-of-war minimap: visited rooms and nearby corridors, drawn 1 px per tile. */
export function Minimap({ host }: { host: GameHost }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let revealed = new Uint8Array(0);
    let worldRef = host.world;
    const draw = () => {
      const w = host.world;
      const c = ref.current;
      if (!c) return;
      const f = w.floor;
      if (worldRef !== w || revealed.length !== f.w * f.h) {
        revealed = new Uint8Array(f.w * f.h);
        worldRef = w;
      }
      if (c.width !== f.w || c.height !== f.h) {
        c.width = f.w;
        c.height = f.h;
      }
      const e = w.e;
      const p = w.players[0]!;
      const ptx = Math.floor(e.x[p.ent]! / TILE);
      const pty = Math.floor(e.y[p.ent]! / TILE);
      for (let y = Math.max(0, pty - 5); y < Math.min(f.h, pty + 6); y++)
        for (let x = Math.max(0, ptx - 5); x < Math.min(f.w, ptx + 6); x++)
          revealed[y * f.w + x] = 1;
      w.rooms.forEach((rs, ri) => {
        if (!rs.visited) return;
        const r = f.rooms[ri]!.rect;
        for (let y = r.y - 1; y <= r.y + r.h; y++)
          for (let x = r.x - 1; x <= r.x + r.w; x++) revealed[y * f.w + x] = 1;
      });
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, f.w, f.h);
      for (let y = 0; y < f.h; y++) {
        for (let x = 0; x < f.w; x++) {
          const i = y * f.w + x;
          if (!revealed[i]) continue;
          const t = w.map.tiles[i]!;
          if (t === Tile.Wall || t === Tile.Void) continue;
          const room = f.roomOf[i]! - 1;
          let col = '#3b2f5c';
          if (t === Tile.Door) col = w.map.dyn[i] ? '#cf4440' : '#875934';
          else if (t === Tile.LockedDoor) col = '#f2c94c';
          else if (t === Tile.Pit) col = '#0d0a12';
          else if (room >= 0) col = COLORS[f.rooms[room]!.type] ?? '#4f4d66';
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      if (w.stairsOpen) {
        for (const pr of f.props) {
          if (pr.kind !== 'stairs' || !revealed[pr.y * f.w + pr.x]) continue;
          ctx.fillStyle = '#36c4b4';
          ctx.fillRect(pr.x - 1, pr.y - 1, 3, 3);
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ptx - 1, pty - 1, 3, 3);
    };
    draw();
    const id = setInterval(draw, 300);
    return () => clearInterval(id);
  }, [host]);
  return <canvas class="minimap" ref={ref} aria-hidden="true" />;
}
