import { contentRu } from '@ao/content';
import { CONTRACTS, claimContract } from '@ao/sim';
import { Panel, Wallet, act, useCtx, type PanelCtx } from './common';

export function BoardPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { realm } = useCtx(ctx);
  return (
    <Panel
      title="Доска заданий"
      subtitle="Контракты общие для героев этого режима"
      onClose={onClose}
    >
      <Wallet realm={realm} atlas={ctx.atlas} />
      {realm.contracts.map((k, i) => {
        const def = CONTRACTS.find((x) => x.id === k.id);
        if (!def) return null;
        const done = k.progress >= def.count;
        const r = def.reward;
        return (
          <div class="shoprow" key={`${k.id}${i}`}>
            <div class="shoprow__text">
              <div class="shoprow__name">
                {contentRu[`contract.${k.id}`]} — {Math.min(k.progress, def.count)}/{def.count}
              </div>
              <div class="xpbar xpbar--thin">
                <div
                  class="xpbar__fill"
                  style={{ width: `${(Math.min(k.progress, def.count) / def.count) * 100}%` }}
                />
              </div>
              <div class="shoprow__desc">
                Награда: {r.gold} з.{r.dust ? ` · ◇${r.dust}` : ''}
                {r.essence ? ` · ◆${r.essence}` : ''}
                {r.shard ? ` · ✦${r.shard}` : ''}
              </div>
            </div>
            <button
              class="btn btn--primary"
              disabled={!done}
              onClick={() => void act(ctx, (s, ch) => claimContract(s, ch, i), 'Награда получена')}
            >
              Забрать
            </button>
          </div>
        );
      })}
    </Panel>
  );
}
