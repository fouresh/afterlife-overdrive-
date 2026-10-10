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

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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

export function RunSummary(props: {
  atlas: Atlas;
  outcome: 'victory' | 'left' | 'dead';
  stats: RunStats;
  onDone: () => void;
}) {
  const s = props.stats;
  const title =
    props.outcome === 'victory'
      ? 'Победа!'
      : props.outcome === 'left'
        ? 'Вы вернулись живым'
        : 'Вы погибли';
  const text =
    props.outcome === 'dead'
      ? 'Добыча этого забега потеряна. Снаряжение, с которым вы пришли, осталось с вами.'
      : 'Добыча сохранена: надетое осталось на вас, остальное — на складе.';
  return (
    <div class="overlay" data-testid="run-summary">
      <div class={`panel runend runend--${props.outcome}`}>
        <h2>{title}</h2>
        <p class="runend__text">{text}</p>
        <div class="runend__stats">
          <span>
            Этаж: {s.depth + 1}/{s.floors}
          </span>
          <span>Убито: {s.kills}</span>
          <span>Золото: {props.outcome === 'dead' ? 0 : s.gold}</span>
          <span>Время: {fmtTime(s.seconds)}</span>
        </div>
        {s.items.length > 0 && (
          <div class={`runend__items${props.outcome === 'dead' ? ' runend__items--lost' : ''}`}>
            {s.items.slice(0, 16).map((it) => (
              <ItemIcon key={it.uid} atlas={props.atlas} item={it} />
            ))}
          </div>
        )}
        <button class="btn btn--primary" data-testid="btn-summary-done" onClick={props.onDone}>
          В главное меню
        </button>
      </div>
    </div>
  );
}
