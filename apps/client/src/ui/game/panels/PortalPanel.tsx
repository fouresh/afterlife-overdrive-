import { contentRu } from '@ao/content';
import { DIFFICULTIES, type Difficulty } from '@ao/sim';
import { useState } from 'preact/hooks';
import { Panel, useCtx, type PanelCtx } from './common';

const NAMES: Record<Difficulty, string> = {
  normal: 'Обычная',
  hard: 'Сложная',
  nightmare: 'Кошмар',
};
const DESC: Record<Difficulty, string> = {
  normal: 'Для знакомства со склепом.',
  hard: 'Враги крепче, добыча лучше (+3 к уровню предметов).',
  nightmare: 'Для бывалых. +6 к уровню предметов, редкие вещи чаще.',
};

export function PortalPanel({
  ctx,
  onClose,
  onStart,
}: {
  ctx: PanelCtx;
  onClose: () => void;
  onStart: (biome: string, difficulty: Difficulty) => void;
}) {
  const { c } = useCtx(ctx);
  const [diff, setDiff] = useState<Difficulty>('normal');
  return (
    <Panel title="Портал" subtitle={'Глава 1 · "Пробуждение"'} onClose={onClose}>
      <div class="inv__label">Куда</div>
      <div class="chips">
        <button class="chip chip--sel">{contentRu['biome.crypt']}</button>
        <button class="chip" disabled title="Откроется по сюжету">
          Шепчущий лес 🔒
        </button>
      </div>
      <div class="inv__label">Сложность</div>
      {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
        const locked = c.level < DIFFICULTIES[d].minLevel;
        return (
          <button
            key={d}
            type="button"
            class={`shoprow shoprow--btn${diff === d ? ' shoprow--sel' : ''}`}
            disabled={locked}
            onClick={() => setDiff(d)}
            data-testid={`diff-${d}`}
          >
            <div class="shoprow__text">
              <div class="shoprow__name">
                {NAMES[d]} {locked && `🔒 с ${DIFFICULTIES[d].minLevel} уровня`}
              </div>
              <div class="shoprow__desc">{DESC[d]}</div>
            </div>
          </button>
        );
      })}
      <div class="statline">
        С собой: зелий {c.potions}/3{c.elixir ? ` · ${contentRu[`elixir.${c.elixir}`]}` : ''}
        {c.hardcore ? ' · ☠ смерть навсегда' : ''}
      </div>
      <button class="btn btn--primary" data-testid="btn-go" onClick={() => onStart('crypt', diff)}>
        Отправиться
      </button>
    </Panel>
  );
}
