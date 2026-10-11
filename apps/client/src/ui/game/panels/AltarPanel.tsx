import { contentRu } from '@ao/content';
import { ATTRIBUTE_KEYS, respec, spendPoint, statsFor, xpToNext } from '@ao/sim';
import { Panel, act, useCtx, type PanelCtx } from './common';

export function AltarPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const need = xpToNext(c.level);
  const st = statsFor(c.loadout, {
    level: c.level,
    attrs: c.attrs,
    origin: c.origin,
    elixir: c.elixir,
  });
  return (
    <Panel
      title="Статуя перерождения"
      subtitle="Камень помнит каждую вашу смерть — и делает сильнее"
      onClose={onClose}
    >
      <div class="levelline">
        Уровень <b>{c.level}</b>
        <div class="xpbar">
          <div class="xpbar__fill" style={{ width: `${Math.min(100, (c.xp / need) * 100)}%` }} />
          <span>
            {c.xp} / {need} опыта
          </span>
        </div>
      </div>
      <div class="inv__label">Очки характеристик: {c.unspent}</div>
      {ATTRIBUTE_KEYS.map((k) => (
        <div class="shoprow" key={k}>
          <div class="shoprow__text">
            <div class="shoprow__name">
              {contentRu[`attr.${k}`]}: {c.attrs[k]}
            </div>
            <div class="shoprow__desc">{contentRu[`attr.${k}.desc`]}</div>
          </div>
          <button
            class="btn btn--primary"
            disabled={c.unspent <= 0}
            data-testid={`btn-attr-${k}`}
            onClick={() => void act(ctx, (_s, ch) => spendPoint(ch, k))}
          >
            +
          </button>
        </div>
      ))}
      <div class="statline">
        ❤ {st.maxHp} · 🛡 {st.armor} · урон +{Math.round(st.damagePct)}% · крит{' '}
        {Math.round(st.critChance)}% · сила артефактов +{Math.round(st.skillPowerPct)}% ·
        перезарядка −{Math.round(st.cooldownPct)}%
      </div>
      <button class="btn" onClick={() => void act(ctx, (s, ch) => respec(s, ch), 'Очки сброшены')}>
        Сбросить очки ({50 * c.level} з., у вас {realm.gold})
      </button>
    </Panel>
  );
}
