import { contentRu } from '@ao/content';
import { MAX_LIVING_CHARACTERS, type Character } from '@ao/sim';
import { lookOf } from '../../game/host';
import type { AccountStore } from '../../state/account';
import { CharPreview } from './CharPreview';

export function CharacterSelect(props: {
  store: AccountStore;
  onPlay: (id: string) => void;
  onCreate: () => void;
  onBack: () => void;
}) {
  const chars = props.store.save.characters;
  const living = chars.filter((c) => !c.dead);
  const fallen = chars.filter((c) => c.dead);
  const card = (c: Character) => (
    <button
      type="button"
      key={c.id}
      class={`charcard${c.dead ? ' charcard--dead' : ''}`}
      disabled={c.dead}
      onClick={() => props.onPlay(c.id)}
      data-testid={`char-${c.name}`}
    >
      <CharPreview appearance={c.appearance} look={lookOf(c.loadout)} scale={3} />
      <div class="charcard__info">
        <div class="charcard__name">
          {c.hardcore && (
            <span class="skull" title="Хардкор">
              ☠
            </span>
          )}
          {c.name}
        </div>
        <div class="charcard__meta">
          Ур. {c.level} · {c.hardcore ? 'хардкор' : 'обычный'}
        </div>
        {c.dead && c.death && (
          <div class="charcard__meta">
            Пал на этаже {c.death.depth}
            {c.death.by ? ` · ${contentRu[`enemy.${c.death.by}`] ?? c.death.by}` : ''}
          </div>
        )}
      </div>
    </button>
  );
  return (
    <div class="screen charsel" data-testid="char-select">
      <h2 class="charsel__title">Выберите героя</h2>
      <div class="charsel__list">
        {living.map(card)}
        {living.length < MAX_LIVING_CHARACTERS && (
          <button
            type="button"
            class="charcard charcard--new"
            onClick={props.onCreate}
            data-testid="btn-new-char"
          >
            <span class="charcard__plus">+</span>
            <div class="charcard__name">Новый герой</div>
          </button>
        )}
      </div>
      {fallen.length > 0 && (
        <>
          <div class="charsel__label">Зал памяти</div>
          <div class="charsel__list">{fallen.map(card)}</div>
        </>
      )}
      <button class="btn btn--ghost" onClick={props.onBack}>
        Назад
      </button>
    </div>
  );
}
