import { QUEST_HINTS, contentRu } from '@ao/content';
import {
  ELIXIRS,
  MAX_CARRIED_POTIONS,
  POTION_PRICE,
  buyElixir,
  buyPotion,
  currentMainQuest,
} from '@ao/sim';
import { Panel, Wallet, act, useCtx, type PanelCtx } from './common';

export function AlchemistPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const q = currentMainQuest(c);
  const hint = q ? QUEST_HINTS[q.id] : undefined;
  return (
    <Panel
      title="Алхимик"
      subtitle={'Ведунья Мира: "Сварить тебе что-нибудь от смерти? Почти помогает"'}
      onClose={onClose}
    >
      <Wallet realm={realm} atlas={ctx.atlas} />
      {hint && ctx.say && (
        <button class="btn" data-testid="btn-ask-mira" onClick={() => (onClose(), ctx.say?.(hint))}>
          Спросить совета
        </button>
      )}
      <div class="shoprow">
        <img src={ctx.atlas.dataUrl('prop.potion', 0, 4)} alt="" />
        <div class="shoprow__text">
          <div class="shoprow__name">Зелье лечения</div>
          <div class="shoprow__desc">
            Восстанавливает 40% здоровья. С собой: {c.potions}/{MAX_CARRIED_POTIONS}
          </div>
        </div>
        <button
          class="btn btn--primary"
          data-testid="btn-buy-potion"
          onClick={() => void act(ctx, (s, ch) => buyPotion(s, ch))}
        >
          {POTION_PRICE} з.
        </button>
      </div>
      <div class="inv__label">Эликсиры (действуют один следующий забег, одновременно один)</div>
      {ELIXIRS.map((e) => (
        <div class="shoprow" key={e.id}>
          <span class="shoprow__icon">⚗</span>
          <div class="shoprow__text">
            <div class="shoprow__name">
              {contentRu[`elixir.${e.id}`]} {c.elixir === e.id && <b class="badge">выпит</b>}
            </div>
            <div class="shoprow__desc">{contentRu[`elixir.${e.id}.desc`]}</div>
          </div>
          <button
            class="btn"
            disabled={!!c.elixir}
            onClick={() => void act(ctx, (s, ch) => buyElixir(s, ch, e.id), 'Эликсир выпит')}
          >
            {e.price} з.
          </button>
        </div>
      ))}
    </Panel>
  );
}
