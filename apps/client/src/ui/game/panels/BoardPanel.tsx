import { contentRu, getContent } from '@ao/content';
import { CONTRACTS, QUEST_DONE, claimContract, questState } from '@ao/sim';
import { Panel, Wallet, act, useCtx, type PanelCtx } from './common';

export function BoardPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const story = getContent().quests.filter((q) => questState(c, q.id) > 0);
  return (
    <Panel
      title="Доска заданий"
      subtitle="Сюжет героя и контракты для всех героев этого режима"
      onClose={onClose}
    >
      <div class="inv__label">Сюжет — глава 1 «Пробуждение»</div>
      {story.length === 0 && <div class="statline">Поговорите с Мирой.</div>}
      {story.map((q) => {
        const done = questState(c, q.id) === QUEST_DONE;
        return (
          <div
            class={`questrow${done ? ' questrow--done' : ''}`}
            key={q.id}
            data-testid={`quest-${q.id}`}
          >
            <div class="shoprow__name">
              {done ? '✓ ' : q.main ? '▸ ' : '◦ '}
              {contentRu[q.titleKey]}
            </div>
            {!done && <div class="shoprow__desc">{contentRu[q.descKey]}</div>}
          </div>
        );
      })}
      <div class="inv__label">Контракты</div>
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
