import {
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  STARTER_WEAPONS,
  contentRu,
  type Appearance,
  type HairStyle,
} from '@ao/content';
import { NAME_MAX, validateName, type NameError } from '@ao/shared';
import { useState } from 'preact/hooks';
import type { Atlas } from '../../game/atlas';
import { CharPreview } from './CharPreview';

export interface CreatorResult {
  name: string;
  appearance: Appearance;
  hardcore: boolean;
  weapon: string;
  artifact: string;
}

const STARTER_ARTIFACTS = ['art.fireball', 'art.frostNova', 'art.phantomDash'];
const HAIR_NAMES: Record<HairStyle, string> = {
  short: 'Короткая',
  spiky: 'Ёжик',
  long: 'Длинные',
  ponytail: 'Хвост',
  bob: 'Каре',
  bun: 'Пучок',
  bald: 'Лысый',
};
const NAME_ERRORS: Record<NameError, string> = {
  empty: 'Введите имя',
  short: 'Слишком короткое имя',
  long: `Не длиннее ${NAME_MAX} символов`,
  chars: 'Только буквы, цифры, пробел и дефис',
  profanity: 'Выберите другое имя',
};

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}

function randomAppearance(): Appearance {
  const gender = Math.random() < 0.5 ? 'm' : 'f';
  return {
    gender,
    skin: rnd(SKIN_TONES.length),
    hairStyle: HAIR_STYLES[rnd(HAIR_STYLES.length - (gender === 'f' ? 1 : 0))]!,
    hairColor: rnd(HAIR_COLORS.length),
    eyeColor: rnd(EYE_COLORS.length),
    clothColor: rnd(CLOTH_COLORS.length),
    pantsColor: rnd(CLOTH_COLORS.length),
  };
}

function Swatches(props: {
  colors: readonly string[];
  value: number;
  onChange: (i: number) => void;
  testid?: string;
}) {
  return (
    <div class="swatches" data-testid={props.testid}>
      {props.colors.map((c, i) => (
        <button
          type="button"
          key={c}
          class={`swatch${i === props.value ? ' swatch--sel' : ''}`}
          style={{ background: c }}
          aria-label={`цвет ${i + 1}`}
          onClick={() => props.onChange(i)}
        />
      ))}
    </div>
  );
}

export function CharacterCreator(props: {
  atlas: Atlas;
  onDone: (r: CreatorResult) => void;
  onCancel: () => void;
}) {
  const [a, setA] = useState<Appearance>(randomAppearance);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [hardcore, setHardcore] = useState(false);
  const [confirmHc, setConfirmHc] = useState(false);
  const [weapon, setWeapon] = useState(STARTER_WEAPONS[0]!);
  const [artifact, setArtifact] = useState(STARTER_ARTIFACTS[0]!);
  const [anim, setAnim] = useState<'idle' | 'run'>('idle');
  const err = validateName(name);
  const set = <K extends keyof Appearance>(k: K, v: Appearance[K]) =>
    setA((x) => ({ ...x, [k]: v }));
  const submit = () => {
    setTouched(true);
    if (err) return;
    props.onDone({
      name: name.trim().replace(/\s+/g, ' '),
      appearance: a,
      hardcore,
      weapon,
      artifact,
    });
  };
  const pick = (ids: string[], value: string, on: (id: string) => void, prefix: string) => (
    <div class="chips">
      {ids.map((id) => (
        <button
          type="button"
          key={id}
          class={`chip chip--icon${id === value ? ' chip--sel' : ''}`}
          onClick={() => on(id)}
          data-testid={`${prefix}-${id}`}
        >
          <img src={props.atlas.dataUrl(`item:${id}`, 0, 2)} alt="" />
          {contentRu[`item.${id}`] ?? contentRu[id] ?? id}
        </button>
      ))}
    </div>
  );
  return (
    <div class="screen creator" data-testid="creator">
      <div class="creator__preview">
        <CharPreview appearance={a} scale={6} anim={anim} />
        <div class="creator__row">
          <button class="btn btn--small" onClick={() => setAnim(anim === 'idle' ? 'run' : 'idle')}>
            {anim === 'idle' ? 'Бег' : 'Стойка'}
          </button>
          <button
            class="btn btn--small"
            onClick={() => setA(randomAppearance())}
            data-testid="btn-random"
          >
            Случайно
          </button>
        </div>
      </div>
      <div class="creator__form">
        <label class="field">
          <span>Имя</span>
          <input
            class="input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="Имя героя"
            data-testid="name-input"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onBlur={() => setTouched(true)}
          />
          {touched && err && <span class="field__err">{NAME_ERRORS[err]}</span>}
        </label>
        <div class="field">
          <span>Пол</span>
          <div class="chips">
            <button
              type="button"
              class={`chip${a.gender === 'm' ? ' chip--sel' : ''}`}
              onClick={() => set('gender', 'm')}
            >
              Парень
            </button>
            <button
              type="button"
              class={`chip${a.gender === 'f' ? ' chip--sel' : ''}`}
              onClick={() => set('gender', 'f')}
            >
              Девушка
            </button>
          </div>
        </div>
        <div class="field">
          <span>Кожа</span>
          <Swatches colors={SKIN_TONES} value={a.skin} onChange={(i) => set('skin', i)} />
        </div>
        <div class="field">
          <span>Причёска</span>
          <div class="chips">
            {HAIR_STYLES.map((h) => (
              <button
                type="button"
                key={h}
                class={`chip${a.hairStyle === h ? ' chip--sel' : ''}`}
                onClick={() => set('hairStyle', h)}
              >
                {HAIR_NAMES[h]}
              </button>
            ))}
          </div>
        </div>
        <div class="field">
          <span>Цвет волос</span>
          <Swatches
            colors={HAIR_COLORS}
            value={a.hairColor}
            onChange={(i) => set('hairColor', i)}
          />
        </div>
        <div class="field">
          <span>Глаза</span>
          <Swatches colors={EYE_COLORS} value={a.eyeColor} onChange={(i) => set('eyeColor', i)} />
        </div>
        <div class="field">
          <span>Рубаха</span>
          <Swatches
            colors={CLOTH_COLORS}
            value={a.clothColor}
            onChange={(i) => set('clothColor', i)}
          />
        </div>
        <div class="field">
          <span>Штаны</span>
          <Swatches
            colors={CLOTH_COLORS}
            value={a.pantsColor}
            onChange={(i) => set('pantsColor', i)}
          />
        </div>
        <div class="field">
          <span>Оружие</span>
          {pick(STARTER_WEAPONS, weapon, setWeapon, 'pick')}
        </div>
        <div class="field">
          <span>Артефакт</span>
          {pick(STARTER_ARTIFACTS, artifact, setArtifact, 'pick')}
        </div>
        <label class="field field--check">
          <input
            type="checkbox"
            checked={hardcore}
            data-testid="hardcore"
            onChange={(e) => {
              const on = (e.target as HTMLInputElement).checked;
              if (on) setConfirmHc(true);
              else setHardcore(false);
            }}
          />
          <span>
            <b>☠ Хардкор</b> — смерть навсегда
          </span>
        </label>
        <div class="creator__actions">
          <button class="btn" onClick={props.onCancel}>
            Отмена
          </button>
          <button class="btn btn--primary" onClick={submit} data-testid="btn-create">
            Создать
          </button>
        </div>
      </div>
      {confirmHc && (
        <div class="overlay">
          <div class="panel">
            <h2>☠ Хардкор</h2>
            <p class="runend__text">
              Если герой погибнет — он погибнет навсегда и попадёт в Зал памяти. У хардкор-героев
              отдельный склад и золото. Обычные и хардкор-герои могут играть вместе, каждый по своим
              правилам.
            </p>
            <button
              class="btn btn--primary"
              data-testid="btn-hc-yes"
              onClick={() => {
                setHardcore(true);
                setConfirmHc(false);
              }}
            >
              Я понимаю риск
            </button>
            <button class="btn" onClick={() => setConfirmHc(false)}>
              Нет, обычный режим
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
