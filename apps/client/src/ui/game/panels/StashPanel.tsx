import { equipFromStash, itemBase, statsFor, unequip, type LoadoutSlot } from '@ao/sim';
import { useState } from 'preact/hooks';
import { ItemIcon } from '../../ItemIcon';
import { ItemDetails, ItemGrid, Panel, act, useCtx, type PanelCtx } from './common';

const SLOTS: [LoadoutSlot, string][] = [
  ['weapon', 'Оружие'],
  ['helmet', 'Шлем'],
  ['chest', 'Тело'],
  ['boots', 'Сапоги'],
  ['art0', 'Арт. 1'],
  ['art1', 'Арт. 2'],
];

type Sel = { stash: number } | { slot: LoadoutSlot } | null;

export function StashPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const [sel, setSel] = useState<Sel>(null);
  const l = c.loadout;
  const slotItem = (s: LoadoutSlot) =>
    s === 'art0' ? l.artifacts[0] : s === 'art1' ? l.artifacts[1] : l[s];
  const item = sel
    ? 'stash' in sel
      ? (realm.stash[sel.stash] ?? null)
      : slotItem(sel.slot)
    : null;
  const st = statsFor(c.loadout, {
    level: c.level,
    attrs: c.attrs,
    origin: c.origin,
    elixir: c.elixir,
  });
  const isArt = item ? itemBase(item).slot === 'artifact' : false;
  return (
    <Panel
      title="Склад и снаряжение"
      subtitle={`${c.name} · ур. ${c.level}`}
      onClose={onClose}
      wide
    >
      <div class="inv__cols">
        <div>
          <div class="inv__label">Надето</div>
          <div class="inv__slots">
            {SLOTS.map(([s, label]) => (
              <ItemIcon
                key={s}
                atlas={ctx.atlas}
                item={slotItem(s)}
                placeholder={label}
                selected={!!sel && 'slot' in sel && sel.slot === s}
                onClick={() => setSel({ slot: s })}
              />
            ))}
          </div>
          <div class="statline">
            ❤ {st.maxHp} · 🛡 {st.armor} · урон +{Math.round(st.damagePct)}% · крит{' '}
            {Math.round(st.critChance)}% · бег +{Math.round(st.moveSpeedPct)}%
          </div>
          <div class="inv__label">
            Склад ({realm.stash.length}/120){c.hardcore ? ' · хардкор' : ''}
          </div>
          <div class="scrollbox">
            <ItemGrid
              atlas={ctx.atlas}
              items={realm.stash}
              minSlots={18}
              selected={sel && 'stash' in sel ? sel.stash : undefined}
              onSelect={(i) => setSel({ stash: i })}
              testid="stash"
            />
          </div>
        </div>
        <div class="inv__details">
          <ItemDetails item={item}>
            {sel && 'stash' in sel && item && !isArt && (
              <button
                class="btn btn--primary"
                data-testid="btn-equip"
                onClick={() =>
                  void act(ctx, (s, ch) => equipFromStash(s, ch, sel.stash)).then(() =>
                    setSel(null),
                  )
                }
              >
                Надеть
              </button>
            )}
            {sel && 'stash' in sel && item && isArt && (
              <>
                <button
                  class="btn btn--primary"
                  onClick={() =>
                    void act(ctx, (s, ch) => equipFromStash(s, ch, sel.stash, 0)).then(() =>
                      setSel(null),
                    )
                  }
                >
                  В слот 1
                </button>
                <button
                  class="btn btn--primary"
                  onClick={() =>
                    void act(ctx, (s, ch) => equipFromStash(s, ch, sel.stash, 1)).then(() =>
                      setSel(null),
                    )
                  }
                >
                  В слот 2
                </button>
              </>
            )}
            {sel && 'slot' in sel && item && sel.slot !== 'weapon' && (
              <button
                class="btn"
                onClick={() =>
                  void act(ctx, (s, ch) => unequip(s, ch, sel.slot)).then(() => setSel(null))
                }
              >
                Снять
              </button>
            )}
          </ItemDetails>
        </div>
      </div>
    </Panel>
  );
}
