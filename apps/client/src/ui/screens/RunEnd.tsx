import type { ItemInstance } from '@ao/sim';
import type { Atlas } from '../../game/atlas';
import { ItemIcon } from '../ItemIcon';

export interface RunStats {
  gold: number;
  kills: number;
  items: ItemInstance[];
  depth: number;
  floors: number;
  seconds: number;
}

/** Between floors: leave with the loot or go deeper. */
export function FloorChoice(props: {
  atlas: Atlas;
  stats: RunStats;
  onDeeper: () => void;
  onLeave: () => void;
}) {
  const s = props.stats;
  return (
    <div class="overlay" data-testid="floor-choice">
      <div class="panel runend">
        <h2>Этаж {s.depth + 1} пройден</h2>
        <p class="runend__text">
          Добыча: {s.gold} золота, предметов: {s.items.length}. Если погибнете глубже — потеряете
          всё, что нашли за забег.
        </p>
        <div class="runend__items">
          {s.items.slice(0, 12).map((it) => (
            <ItemIcon key={it.uid} atlas={props.atlas} item={it} />
          ))}
        </div>
        <button class="btn btn--primary" data-testid="btn-deeper" onClick={props.onDeeper}>
          Глубже — этаж {s.depth + 2}/{s.floors}
        </button>
        <button class="btn" data-testid="btn-leave" onClick={props.onLeave}>
          Уйти с добычей
        </button>
      </div>
    </div>
  );
}
