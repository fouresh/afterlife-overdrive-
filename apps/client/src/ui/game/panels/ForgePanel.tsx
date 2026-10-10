import type { Slot } from '@ao/content';
import {
  craft,
  craftCost,
  getRef,
  maxItemLevel,
  reroll,
  rerollCost,
  salvage,
  salvageYield,
  upgrade,
  upgradeCost,
  type ItemRef,
  type LoadoutSlot,
} from '@ao/sim';
import { useState } from 'preact/hooks';
import { ItemIcon } from '../../ItemIcon';
import {
  CostLine,
  ItemDetails,
  ItemGrid,
  Panel,
  Tabs,
  Wallet,
  act,
  useCtx,
  type PanelCtx,
} from './common';

type Tab = 'salvage' | 'craft' | 'upgrade' | 'reroll';
const CRAFT_SLOTS: [Slot, string][] = [
  ['weapon', 'Оружие'],
  ['helmet', 'Шлем'],
  ['chest', 'Нагрудник'],
  ['boots', 'Сапоги'],
  ['artifact', 'Артефакт'],
];
const EQUIP: LoadoutSlot[] = ['weapon', 'helmet', 'chest', 'boots', 'art0', 'art1'];

export function ForgePanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const [tab, setTab] = useState<Tab>('upgrade');
  const [ref, setRef] = useState<ItemRef | null>(null);
  const item = ref ? getRef(ctx.store.save, c, ref) : null;
  const equipped = EQUIP.map((s) =>
    s === 'art0' ? c.loadout.artifacts[0] : s === 'art1' ? c.loadout.artifacts[1] : c.loadout[s],
  );
  const picker = (allowEquipped: boolean) => (
    <div>
      {allowEquipped && (
        <>
          <div class="inv__label">Надето</div>
          <div class="inv__slots">
            {EQUIP.map((s, i) => (
              <ItemIcon
                key={s}
                atlas={ctx.atlas}
                item={equipped[i] ?? null}
                selected={!!ref && 'slot' in ref && ref.slot === s}
                onClick={() => equipped[i] && setRef({ slot: s })}
              />
            ))}
          </div>
        </>
      )}
      <div class="inv__label">Склад</div>
      <div class="scrollbox">
        <ItemGrid
          atlas={ctx.atlas}
          items={realm.stash}
          minSlots={12}
          selected={ref && 'stash' in ref ? ref.stash : undefined}
          onSelect={(i) => setRef({ stash: i })}
          testid="forge"
        />
      </div>
    </div>
  );
  return (
    <Panel
      title="Кузница"
      subtitle={'Кузнец Борган: "Из старого железа — новая судьба"'}
      onClose={onClose}
      wide
    >
      <Wallet realm={realm} atlas={ctx.atlas} />
      <Tabs<Tab>
        tabs={[
          ['upgrade', 'Улучшить'],
          ['reroll', 'Перековать'],
          ['craft', 'Создать'],
          ['salvage', 'Разобрать'],
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setRef(null);
        }}
      />
      {tab === 'craft' ? (
        <div class="forge-craft">
          <p class="runend__text">
            Борган выкует случайный предмет вашего уровня (ур. {c.level}) не ниже необычного.
            Стоимость: <CostLine cost={craftCost(c.level)} />
          </p>
          <div class="chips">
            {CRAFT_SLOTS.map(([s, label]) => (
              <button
                key={s}
                class="btn"
                data-testid={`craft-${s}`}
                onClick={() =>
                  void act(ctx, (save, ch) => craft(save, ch, s), 'Готово! Предмет на складе')
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div class="inv__cols">
          {picker(tab !== 'salvage')}
          <div class="inv__details">
            <ItemDetails
              item={item}
              extra={
                item && (
                  <div class="forge-info">
                    {tab === 'upgrade' && (
                      <>
                        Уровень {item.level} → {item.level + 1} (макс. {maxItemLevel(c.level)})
                        <br />
                        <CostLine cost={upgradeCost(item)} />
                      </>
                    )}
                    {tab === 'reroll' &&
                      (item.rarity === 0 ? (
                        'У обычных предметов нет свойств'
                      ) : (
                        <CostLine cost={rerollCost(item)} />
                      ))}
                    {tab === 'salvage' &&
                      (() => {
                        const y = salvageYield(item);
                        return `Получите: ◇${y.dust}${y.essence ? ` ◆${y.essence}` : ''}${y.shard ? ` ✦${y.shard}` : ''}`;
                      })()}
                  </div>
                )
              }
            >
              {item && ref && tab === 'upgrade' && (
                <button
                  class="btn btn--primary"
                  data-testid="btn-upgrade"
                  onClick={() => void act(ctx, (s, ch) => upgrade(s, ch, ref), 'Улучшено')}
                >
                  Улучшить
                </button>
              )}
              {item && ref && tab === 'reroll' && item.rarity > 0 && (
                <button
                  class="btn btn--primary"
                  onClick={() =>
                    void act(ctx, (s, ch) => reroll(s, ch, ref), 'Свойства перекованы')
                  }
                >
                  Перековать
                </button>
              )}
              {item && ref && 'stash' in ref && tab === 'salvage' && (
                <button
                  class="btn btn--primary"
                  data-testid="btn-salvage"
                  onClick={() =>
                    void act(ctx, (s, ch) => salvage(s, ch, ref.stash)).then(() => setRef(null))
                  }
                >
                  Разобрать
                </button>
              )}
            </ItemDetails>
          </div>
        </div>
      )}
    </Panel>
  );
}
