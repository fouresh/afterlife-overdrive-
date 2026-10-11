import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { contentRu } from '@ao/content';
import { realmOf, type Character, type ItemInstance, type OpError, type Realm } from '@ao/sim';
import { sfx } from '../../../audio/sfx';
import type { Atlas } from '../../../game/atlas';
import type { AccountStore } from '../../../state/account';
import { ItemIcon } from '../../ItemIcon';
import { describeItem } from '../../itemText';

/** Re-render on store changes. */
export function useStore(store: AccountStore): number {
  const [n, set] = useState(0);
  useEffect(() => store.subscribe(() => set((x) => x + 1)), [store]);
  return n;
}

export interface PanelCtx {
  store: AccountStore;
  atlas: Atlas;
  charId: string;
  toast: (text: string, kind?: 'info' | 'warn' | 'good') => void;
}

export function useCtx(ctx: PanelCtx): { c: Character; realm: Realm } {
  useStore(ctx.store);
  const c = ctx.store.character(ctx.charId)!;
  return { c, realm: realmOf(ctx.store.save, c) };
}

const ERR: Record<OpError, string> = {
  gold: 'Не хватает золота',
  materials: 'Не хватает материалов',
  full: 'Склад переполнен',
  invalid: 'Нельзя',
  max: 'Достигнут предел',
  dead: 'Герой мёртв',
};

/** Run an account operation through the store; plays a sound and toasts errors. */
export async function act(
  ctx: PanelCtx,
  op: (save: AccountStore['save'], c: Character) => OpError | null,
  ok?: string,
): Promise<boolean> {
  const out: { res: OpError | null } = { res: null };
  await ctx.store.mutate((save) => {
    const c = save.characters.find((x) => x.id === ctx.charId)!;
    out.res = op(save, c);
  });
  if (out.res) {
    sfx.play('deny');
    ctx.toast(ERR[out.res], 'warn');
    return false;
  }
  sfx.play('coin');
  if (ok) ctx.toast(ok, 'good');
  return true;
}

export function Panel(props: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}) {
  return (
    <div class="overlay" data-testid="panel">
      <div class={`panel hubpanel${props.wide ? ' hubpanel--wide' : ''}`}>
        <div class="hubpanel__head">
          <div>
            <h2>{props.title}</h2>
            {props.subtitle && <div class="hubpanel__sub">{props.subtitle}</div>}
          </div>
          <button class="btn btn--small" onClick={props.onClose} data-testid="btn-panel-close">
            ✕
          </button>
        </div>
        <div class="hubpanel__body">{props.children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>(props: {
  tabs: [T, string][];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div class="tabs">
      {props.tabs.map(([id, label]) => (
        <button
          type="button"
          key={id}
          class={`tab${id === props.value ? ' tab--sel' : ''}`}
          onClick={() => props.onChange(id)}
          data-testid={`tab-${id}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Wallet({ realm, atlas }: { realm: Realm; atlas: Atlas }) {
  return (
    <div class="wallet">
      <span>
        <img src={atlas.dataUrl('prop.coin', 0, 2)} alt="" />
        {realm.gold}
      </span>
      <span title={contentRu['material.dust']}>◇ {realm.materials.dust}</span>
      <span title={contentRu['material.essence']}>◆ {realm.materials.essence}</span>
      <span title={contentRu['material.shard']}>✦ {realm.materials.shard}</span>
    </div>
  );
}

export function CostLine({
  cost,
}: {
  cost: { gold: number; dust?: number; essence?: number; shard?: number };
}) {
  return (
    <span class="cost">
      {cost.gold} з.{cost.dust ? ` · ◇${cost.dust}` : ''}
      {cost.essence ? ` · ◆${cost.essence}` : ''}
      {cost.shard ? ` · ✦${cost.shard}` : ''}
    </span>
  );
}

export function ItemGrid(props: {
  atlas: Atlas;
  items: (ItemInstance | null)[];
  selected?: number;
  onSelect: (i: number) => void;
  cols?: number;
  minSlots?: number;
  testid?: string;
}) {
  const n = Math.max(props.items.length, props.minSlots ?? 0);
  return (
    <div class="itemgrid" style={{ gridTemplateColumns: `repeat(${props.cols ?? 6}, 44px)` }}>
      {Array.from({ length: n }, (_, i) => (
        <ItemIcon
          key={i}
          atlas={props.atlas}
          item={props.items[i] ?? null}
          selected={props.selected === i}
          onClick={() => props.items[i] && props.onSelect(i)}
          testid={props.testid ? `${props.testid}-${i}` : undefined}
        />
      ))}
    </div>
  );
}

export function ItemDetails({
  item,
  children,
  extra,
}: {
  item: ItemInstance | null;
  children?: ComponentChildren;
  extra?: ComponentChildren;
}) {
  if (!item) return <div class="inv__hint">Выберите предмет.</div>;
  const t = describeItem(item);
  return (
    <div class="itemdetails">
      <div class="inv__name" style={{ color: t.color }}>
        {t.name}
      </div>
      <div class="inv__rarity">{t.rarity}</div>
      {t.lines.map((s) => (
        <div class="inv__line" key={s}>
          {s}
        </div>
      ))}
      {t.affixes.map((s) => (
        <div class="inv__affix" key={s}>
          {s}
        </div>
      ))}
      {extra}
      {children && <div class="inv__actions">{children}</div>}
    </div>
  );
}
