import { contentRu } from '@ao/content';
import { lookOf } from '../../../game/host';
import { CharPreview } from '../CharPreview';
import { Panel, useCtx, type PanelCtx } from './common';

export function MemorialPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  useCtx(ctx);
  const fallen = ctx.store.save.characters.filter((c) => c.dead);
  return (
    <Panel title="Зал памяти" subtitle="Здесь помнят тех, кто ушёл навсегда" onClose={onClose}>
      {fallen.length === 0 && <p class="runend__text">Пока здесь пусто. Пусть так и остаётся.</p>}
      {fallen.map((c) => (
        <div class="shoprow" key={c.id}>
          <CharPreview appearance={c.appearance} look={lookOf(c.loadout)} scale={2} />
          <div class="shoprow__text">
            <div class="shoprow__name">☠ {c.name}</div>
            <div class="shoprow__desc">
              Ур. {c.level} · пал на этаже {c.death?.depth ?? '?'}
              {c.death?.by ? ` · ${contentRu[`enemy.${c.death.by}`] ?? c.death.by}` : ''} · убил
              врагов: {c.stats.kills}
            </div>
          </div>
        </div>
      ))}
    </Panel>
  );
}
