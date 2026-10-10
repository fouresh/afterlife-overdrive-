import { STARTER_WEAPONS, contentRu, getContent } from '@ao/content';
import { starterItem } from '@ao/sim';
import { useState } from 'preact/hooks';
import type { Atlas } from '../../game/atlas';
import { describeItem } from '../itemText';

const STARTER_ARTIFACTS = ['art.fireball', 'art.frostNova', 'art.phantomDash'];

/** First run: choose a starting weapon and artifact (classes come from equipment). */
export function WeaponPick({
  atlas,
  onPick,
}: {
  atlas: Atlas;
  onPick: (weapon: string, artifact: string) => void;
}) {
  const [weapon, setWeapon] = useState(STARTER_WEAPONS[0]!);
  const [artifact, setArtifact] = useState(STARTER_ARTIFACTS[0]!);
  const c = getContent();
  const card = (id: string, sel: boolean, on: () => void, testid: string) => {
    const text = describeItem(starterItem(id));
    const base = c.bases.get(id)!;
    return (
      <button
        type="button"
        class={`pickcard${sel ? ' pickcard--sel' : ''}`}
        onClick={on}
        data-testid={testid}
      >
        <img src={atlas.dataUrl(`item:${id}`, 0, 3)} alt="" />
        <div class="pickcard__name">{contentRu[base.def.nameKey]}</div>
        <div class="pickcard__desc">{text.lines[base.kind === 'artifact' ? 1 : 0]}</div>
      </button>
    );
  };
  return (
    <div class="screen pick" data-testid="weapon-pick">
      <h2 class="pick__title">Классов нет — вы то, что держите в руках</h2>
      <div class="pick__label">Оружие</div>
      <div class="pick__row">
        {STARTER_WEAPONS.map((id) => card(id, id === weapon, () => setWeapon(id), `pick-${id}`))}
      </div>
      <div class="pick__label">Артефакт</div>
      <div class="pick__row">
        {STARTER_ARTIFACTS.map((id) =>
          card(id, id === artifact, () => setArtifact(id), `pick-${id}`),
        )}
      </div>
      <button
        class="btn btn--primary"
        data-testid="btn-start-run"
        onClick={() => onPick(weapon, artifact)}
      >
        В склеп
      </button>
    </div>
  );
}
