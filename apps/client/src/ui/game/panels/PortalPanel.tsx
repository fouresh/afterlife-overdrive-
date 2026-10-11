import { contentRu, getContent } from '@ao/content';
import { DIFFICULTIES, biomeUnlocked, currentMainQuest, type Difficulty } from '@ao/sim';
import { useState } from 'preact/hooks';
import { party } from '../../../net/party';
import { Panel, useCtx, type PanelCtx } from './common';
import { useParty } from './PartyPanel';

const NAMES: Record<Difficulty, string> = {
  normal: 'Обычная',
  hard: 'Сложная',
  nightmare: 'Кошмар',
};
const DESC: Record<Difficulty, string> = {
  normal: 'Для знакомства с миром.',
  hard: 'Враги крепче, добыча лучше (+3 к уровню предметов).',
  nightmare: 'Для бывалых. +6 к уровню предметов, редкие вещи чаще.',
};

const BIOME_ORDER = ['forest', 'crypt'];

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
  const content = getContent();
  const biomes = BIOME_ORDER.map((id) => content.biomes.get(id)!).filter(Boolean);
  const quest = currentMainQuest(c);
  const [biome, setBiome] = useState(() => {
    // The biome of the current main quest, else the deepest one open.
    const want = quest?.goal.startsWith('clear:forest') ? 'forest' : 'crypt';
    const b = content.biomes.get(want);
    return b && biomeUnlocked(c, b) ? want : 'forest';
  });
  const sel = content.biomes.get(biome)!;
  const pst = useParty();
  const inParty = pst.code !== null && pst.status === 'online';
  // A party is limited by its lowest level.
  const minLevel = inParty ? Math.min(c.level, ...pst.members.map((m) => m.level)) : c.level;
  const leader = pst.members.find((m) => m.slot === pst.leader);
  return (
    <Panel title="Портал" subtitle={'Глава 1 · "Пробуждение"'} onClose={onClose}>
      <div class="inv__label">Куда</div>
      <div class="chips">
        {biomes.map((b) => {
          const open = biomeUnlocked(c, b);
          return (
            <button
              key={b.id}
              type="button"
              class={`chip${biome === b.id ? ' chip--sel' : ''}`}
              disabled={!open}
              onClick={() => setBiome(b.id)}
              data-testid={`biome-${b.id}`}
            >
              {contentRu[b.nameKey]}
              {open ? '' : ' 🔒'}
            </button>
          );
        })}
      </div>
      <div class="statline">
        {contentRu[`biome.${sel.id}.desc`]} Этажей: {sel.floors}.
        {biomes.some((b) => !biomeUnlocked(c, b)) &&
          ' Склеп откроется, когда вы пройдёте лес до часовни.'}
      </div>
      <div class="inv__label">Сложность</div>
      {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
        const locked = minLevel < DIFFICULTIES[d].minLevel;
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
      {!inParty && (
        <button class="btn btn--primary" data-testid="btn-go" onClick={() => onStart(biome, diff)}>
          Отправиться
        </button>
      )}
      {inParty && party.isLeader && (
        <button
          class="btn btn--primary"
          data-testid="btn-go-party"
          disabled={pst.phase === 'run'}
          onClick={() => {
            party.send({ t: 'start', biome, difficulty: diff });
            onClose();
          }}
        >
          {pst.phase === 'run'
            ? 'Отряд уже в забеге'
            : `Отправиться отрядом (${pst.members.filter((m) => m.online).length})`}
        </button>
      )}
      {inParty && !party.isLeader && (
        <div class="statline">
          Портал откроет лидер — {leader?.name ?? '?'}. Чтобы пойти одному, покиньте отряд.
        </div>
      )}
    </Panel>
  );
}
