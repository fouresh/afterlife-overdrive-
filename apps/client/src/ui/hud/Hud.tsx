import { contentRu, getContent } from '@ao/content';
import { useEffect, useState } from 'preact/hooks';
import type { GameHost, HudState } from '../../game/host';
import { Minimap } from './Minimap';

function snapshot(h: HudState): string {
  return JSON.stringify(h);
}

/** Polls the host's HUD state ~15×/s and re-renders only when something changed. */
export function useHud(host: GameHost): HudState {
  const [, set] = useState('');
  useEffect(() => {
    let last = '';
    const id = setInterval(() => {
      const s = snapshot(host.hud);
      if (s !== last) {
        last = s;
        set(s);
      }
    }, 66);
    return () => clearInterval(id);
  }, [host]);
  return host.hud;
}

export function Hud({
  host,
  toasts,
}: {
  host: GameHost;
  toasts: { id: number; text: string; kind: string }[];
}) {
  const h = useHud(host);
  const atlas = host.atlas;
  const biome = getContent().biomes.get(host.world.floor.biome);
  const hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
  const shieldPct = Math.min(100, (h.shield / h.maxHp) * 100);
  return (
    <div class="hud">
      <div class="hud__tl">
        <div class="hpbar" data-testid="hp">
          <div class="hpbar__fill" style={{ width: `${hpPct}%` }} />
          {h.shield > 0 && <div class="hpbar__shield" style={{ width: `${shieldPct}%` }} />}
          <div class="hpbar__text">
            {h.hp} / {h.maxHp}
          </div>
        </div>
        <div class="hud__row">
          <span class="hud__stat" data-testid="gold">
            <img src={atlas.dataUrl('prop.coin', 0, 2)} alt="" />
            {h.gold}
          </span>
          <span class="hud__stat">
            <img src={atlas.dataUrl('prop.potion', 0, 2)} alt="" />
            {h.potions}
          </span>
          {h.keys > 0 && (
            <span class="hud__stat">
              <img src={atlas.dataUrl('prop.key', 0, 2)} alt="" />
              {h.keys}
            </span>
          )}
        </div>
        <div class="hud__floor">
          {contentRu[biome?.nameKey ?? ''] ?? ''} · этаж {h.depth + 1}/{h.floors}
        </div>
      </div>
      <Minimap host={host} />
      {h.boss && (
        <div class="bossbar">
          <div class="bossbar__name">{h.boss.name}</div>
          <div class="bossbar__track">
            <div class="bossbar__fill" style={{ width: `${h.boss.frac * 100}%` }} />
          </div>
        </div>
      )}
      <div class="toasts">
        {toasts.map((t) => (
          <div key={t.id} class={`toast toast--${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
