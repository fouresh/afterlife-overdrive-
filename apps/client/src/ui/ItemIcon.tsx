import { RARITY_COLORS } from '@ao/content';
import type { ItemInstance } from '@ao/sim';
import type { Atlas } from '../game/atlas';

export function ItemIcon(props: {
  atlas: Atlas;
  item: ItemInstance | null;
  placeholder?: string;
  selected?: boolean;
  onClick?: () => void;
  testid?: string;
}) {
  const { item, atlas } = props;
  const color = item ? RARITY_COLORS[item.rarity] : '#3b2f5c';
  return (
    <button
      type="button"
      class={`itemicon${props.selected ? ' itemicon--sel' : ''}`}
      style={{ borderColor: color }}
      onClick={props.onClick}
      data-testid={props.testid}
    >
      {item ? (
        <img src={atlas.dataUrl(`item:${item.base}`, 0, 2)} alt="" />
      ) : (
        <span class="itemicon__ph">{props.placeholder ?? ''}</span>
      )}
    </button>
  );
}
