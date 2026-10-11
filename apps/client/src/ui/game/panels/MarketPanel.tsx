import { contentRu } from '@ao/content';
import {
  MATERIAL_PRICES,
  MATERIALS,
  buyMaterial,
  marketBuy,
  marketOffers,
  marketSell,
  sellPrice,
  syncMarket,
} from '@ao/sim';
import { useEffect, useState } from 'preact/hooks';
import { ItemDetails, ItemGrid, Panel, Tabs, Wallet, act, useCtx, type PanelCtx } from './common';

type Tab = 'buy' | 'sell' | 'mats';

/**
 * NPC market with dynamic prices. It goes through account operations (marketBuy/marketSell),
 * which is the seam where the player-to-player auction will plug in (server-side listings).
 */
export function MarketPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const { c, realm } = useCtx(ctx);
  const [tab, setTab] = useState<Tab>('buy');
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    void ctx.store.mutate((save) => {
      const ch = save.characters.find((x) => x.id === ctx.charId)!;
      syncMarket(ch.hardcore ? save.realms.hardcore : save.realms.standard, Date.now());
    });
  }, []);
  const offers = marketOffers(ctx.store.save, c);
  const item =
    tab === 'buy'
      ? sel !== null
        ? (offers[sel]?.item ?? null)
        : null
      : sel !== null
        ? (realm.stash[sel] ?? null)
        : null;
  return (
    <Panel title="Рынок" subtitle={'Торговец Сай: "Цены честные. Почти"'} onClose={onClose} wide>
      <Wallet realm={realm} atlas={ctx.atlas} />
      <Tabs<Tab>
        tabs={[
          ['buy', 'Купить'],
          ['sell', 'Продать'],
          ['mats', 'Материалы'],
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSel(null);
        }}
      />
      {tab === 'mats' ? (
        <div>
          {MATERIALS.map((m) => (
            <div class="shoprow" key={m}>
              <span class="shoprow__icon">{m === 'dust' ? '◇' : m === 'essence' ? '◆' : '✦'}</span>
              <div class="shoprow__text">
                <div class="shoprow__name">{contentRu[`material.${m}`]}</div>
                <div class="shoprow__desc">{MATERIAL_PRICES[m]} з. за штуку</div>
              </div>
              <button
                class="btn"
                onClick={() => void act(ctx, (s, ch) => buyMaterial(s, ch, m, 1))}
              >
                ×1
              </button>
              <button
                class="btn"
                onClick={() => void act(ctx, (s, ch) => buyMaterial(s, ch, m, 10))}
              >
                ×10
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div class="inv__cols">
          <div>
            {tab === 'buy' ? (
              <>
                <div class="inv__label">Товар дня (обновляется раз в сутки)</div>
                <ItemGrid
                  atlas={ctx.atlas}
                  items={offers.map((o) => (o.sold ? null : o.item))}
                  selected={sel ?? undefined}
                  onSelect={setSel}
                  testid="offer"
                />
              </>
            ) : (
              <>
                <div class="inv__label">
                  Ваш склад — чем больше продаёте одного типа, тем ниже цена
                </div>
                <div class="scrollbox">
                  <ItemGrid
                    atlas={ctx.atlas}
                    items={realm.stash}
                    minSlots={12}
                    selected={sel ?? undefined}
                    onSelect={setSel}
                    testid="sell"
                  />
                </div>
              </>
            )}
          </div>
          <div class="inv__details">
            <ItemDetails item={item}>
              {item && tab === 'buy' && sel !== null && (
                <button
                  class="btn btn--primary"
                  data-testid="btn-buy"
                  onClick={() =>
                    void act(ctx, (s, ch) => marketBuy(s, ch, sel), 'Куплено — на складе').then(
                      () => setSel(null),
                    )
                  }
                >
                  Купить за {offers[sel]!.price} з.
                </button>
              )}
              {item && tab === 'sell' && sel !== null && (
                <button
                  class="btn btn--primary"
                  data-testid="btn-sell"
                  onClick={() =>
                    void act(ctx, (s, ch) => marketSell(s, ch, sel)).then(() => setSel(null))
                  }
                >
                  Продать за {sellPrice(item, realm.market)} з.
                </button>
              )}
            </ItemDetails>
          </div>
        </div>
      )}
    </Panel>
  );
}
