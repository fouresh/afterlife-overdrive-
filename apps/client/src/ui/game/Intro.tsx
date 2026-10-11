import { contentRu } from '@ao/content';
import { ORIGINS } from '@ao/sim';
import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';

const BEFORE = [
  'Вы помните визг тормозов.',
  'Или запах дыма.',
  'Или гул серверов в три часа ночи.',
  'Как вы погибли?',
];
const AFTER = [
  'Темнота.',
  'Где-то далеко щёлкает реле. Безжизненный голос: "Сосуд не найден. Перезапуск".',
  'Вы открываете глаза на холодном камне посреди леса. По древнему алтарю бегут голубые линии — и гаснут.',
  '— Ещё один Возрождённый, — шепчет склонившаяся над вами женщина. — Тише… Пойдём, тебе нужно в тепло.',
];

/** Death & rebirth intro. The choice of death gives a small permanent bonus. */
export function Intro(props: { name: string; onDone: (origin: string) => void }) {
  const [stage, setStage] = useState<'before' | 'choose' | 'after'>('before');
  const [line, setLine] = useState(0);
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => {
    if (stage === 'choose') return;
    const lines = stage === 'before' ? BEFORE : AFTER;
    if (line >= lines.length - (stage === 'before' ? 1 : 0)) {
      if (stage === 'before') setStage('choose');
      return;
    }
    const id = setTimeout(() => setLine((l) => l + 1), stage === 'before' ? 1100 : 1700);
    return () => clearTimeout(id);
  }, [stage, line]);
  const lines = stage === 'after' ? AFTER : BEFORE;
  return (
    <div
      class="screen intro"
      data-testid="intro"
      onClick={() => stage !== 'choose' && setLine((l) => Math.min(lines.length, l + 1))}
    >
      <div class="intro__text">
        {lines.slice(0, line + 1).map((s, i) => (
          <p key={`${stage}${i}`} class="intro__line">
            {s}
          </p>
        ))}
      </div>
      {stage === 'choose' && (
        <div class="intro__choices">
          {ORIGINS.map((o) => (
            <button
              type="button"
              key={o.id}
              class="origin"
              data-testid={`origin-${o.id}`}
              onClick={() => {
                sfx.play('ui');
                setOrigin(o.id);
                setStage('after');
                setLine(0);
              }}
            >
              <div class="origin__name">{contentRu[`origin.${o.id}`]}</div>
              <div class="origin__desc">{contentRu[`origin.${o.id}.desc`]}</div>
            </button>
          ))}
        </div>
      )}
      {stage === 'after' && line >= AFTER.length - 1 && (
        <button
          class="btn btn--primary intro__go"
          data-testid="btn-intro-done"
          onClick={() => props.onDone(origin ?? 'truck')}
        >
          Встать, {props.name}
        </button>
      )}
      {stage !== 'choose' && !(stage === 'after' && line >= AFTER.length - 1) && (
        <div class="intro__hint">нажмите, чтобы продолжить</div>
      )}
    </div>
  );
}
