import type { ItemInstance } from '@ao/sim';
import { itemBase } from '@ao/sim';
import { useEffect, useState } from 'preact/hooks';
import type { GameHost } from '../../game/host';
import { ItemIcon } from '../ItemIcon';
import { describeItem } from '../itemText';

type Sel = { from: 'bag'; index: number } | { from: 'slot'; slot: string } | null;

/** Equipment + run bag. Changes go through host commands (the sim applies them). */
export function Inventory({ host, onClose }: { host: GameHost; onClose: () => void }) {
  const [, force] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 150);
    return () => clearInterval(id);
  }, []);
  const p = host.me();
  if (!p) return null;
  const l = p.loadout;
  const atlas = host.atlas;
  const slots: [string, ItemInstance | null, string][] = [
    ['weapon', l.weapon, 'Оружие'],
    ['helmet', l.helmet, 'Шлем'],
    ['chest', l.chest, 'Тело'],
    ['boots', l.boots, 'Сапоги'],
    ['art0', l.artifacts[0], 'Арт. 1'],
    ['art1', l.artifacts[1], 'Арт. 2'],
  ];
  const selected: ItemInstance | null =
    sel?.from === 'bag'
      ? (p.bag[sel.index] ?? null)
      : sel?.from === 'slot'
        ? (slots.find((s) => s[0] === sel.slot)?.[1] ?? null)
        : null;
  const text = selected ? describeItem(selected) : null;
  const isArtifact = selected ? itemBase(selected).slot === 'artifact' : false;
  return (
    <div class="overlay" data-testid="inventory">
      <div class="panel inv">
        <div class="inv__cols">
          <div>
            <div class="inv__label">Надето</div>
            <div class="inv__slots">
              {slots.map(([id, item, label]) => (
                <div class="inv__slot" key={id}>
                  <ItemIcon
                    atlas={atlas}
                    item={item}
                    placeholder={label}
                    selected={sel?.from === 'slot' && sel.slot === id}
                    onClick={() => setSel({ from: 'slot', slot: id })}
                  />
                </div>
              ))}
            </div>
            <div class="inv__label">Сумка ({p.bag.length}/12)</div>
            <div class="inv__bag">
              {Array.from({ length: 12 }, (_, i) => (
                <ItemIcon
                  key={i}
                  atlas={atlas}
                  item={p.bag[i] ?? null}
                  selected={sel?.from === 'bag' && sel.index === i}
                  onClick={() => p.bag[i] && setSel({ from: 'bag', index: i })}
                  testid={`bag-${i}`}
                />
              ))}
            </div>
          </div>
          <div class="inv__details">
            {text ? (
              <>
                <div class="inv__name" style={{ color: text.color }}>
                  {text.name}
                </div>
                <div class="inv__rarity">{text.rarity}</div>
                {text.lines.map((s) => (
                  <div class="inv__line" key={s}>
                    {s}
                  </div>
                ))}
                {text.affixes.map((s) => (
                  <div class="inv__affix" key={s}>
                    {s}
                  </div>
                ))}
                {sel?.from === 'bag' && (
                  <div class="inv__actions">
                    {isArtifact ? (
                      <>
                        <button
                          class="btn btn--primary"
                          onClick={() => (
                            host.command({ type: 'equip', bag: sel.index, slot: 0 }),
                            setSel(null)
                          )}
                        >
                          В слот 1
                        </button>
                        <button
                          class="btn btn--primary"
                          onClick={() => (
                            host.command({ type: 'equip', bag: sel.index, slot: 1 }),
                            setSel(null)
                          )}
                        >
                          В слот 2
                        </button>
                      </>
                    ) : (
                      <button
                        class="btn btn--primary"
                        data-testid="btn-equip"
                        onClick={() => (
                          host.command({ type: 'equip', bag: sel.index, slot: 0 }),
                          setSel(null)
                        )}
                      >
                        Надеть
                      </button>
                    )}
                    <button
                      class="btn"
                      onClick={() => (host.command({ type: 'drop', bag: sel.index }), setSel(null))}
                    >
                      Выбросить
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div class="inv__hint">
                Нажмите на предмет, чтобы увидеть свойства. Найденное в забеге лежит в сумке —
                наденьте лучшее.
              </div>
            )}
          </div>
        </div>
        <button class="btn" data-testid="btn-inv-close" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
