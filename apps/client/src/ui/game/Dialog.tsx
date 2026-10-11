import { NPCS, contentRu, type Appearance, type DialogDef, type EquipLook } from '@ao/content';
import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { CharPreview } from './CharPreview';

const CHARS_PER_SEC = 45;

/**
 * Story dialog / text cutscene: speaker portrait (paper-doll), name and a typewriter line.
 * Tap anywhere: finish the line, then go to the next one. "Пропустить" ends it at once.
 * Speaker 'core' (the Overdrive core) and 'narrator' get a full-screen cutscene look.
 */
export function DialogOverlay(props: {
  dialog: DialogDef;
  hero: { name: string; appearance: Appearance; look?: EquipLook };
  onDone: () => void;
}) {
  const [line, setLine] = useState(0);
  const [shown, setShown] = useState(0);
  const lines = props.dialog.lines;
  const [who, key] = lines[Math.min(line, lines.length - 1)]!;
  const text = contentRu[key] ?? key;
  const cutscene = lines.every(([w]) => w === 'core' || w === 'narrator');

  useEffect(() => {
    setShown(0);
    const t0 = performance.now();
    const id = setInterval(() => {
      const n = Math.floor(((performance.now() - t0) / 1000) * CHARS_PER_SEC);
      setShown(Math.min(text.length, n));
      if (n >= text.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [line, text]);

  const next = () => {
    if (shown < text.length) {
      setShown(text.length);
      return;
    }
    sfx.play('ui', { pitch: 1.3, vol: 0.5 });
    if (line + 1 >= lines.length) props.onDone();
    else setLine(line + 1);
  };

  const npc = NPCS[who];
  const name =
    who === 'hero'
      ? props.hero.name
      : npc
        ? (contentRu[npc.nameKey] ?? who)
        : (contentRu[`speaker.${who}`] ?? '');
  return (
    <div
      class={`dialog${cutscene ? ' dialog--cutscene' : ''}`}
      data-testid="dialog"
      data-dialog={props.dialog.id}
      onClick={next}
    >
      <div class={`dialog__box dialog__box--${who}`}>
        {(npc || who === 'hero') && (
          <div class="dialog__portrait">
            <CharPreview
              appearance={who === 'hero' ? props.hero.appearance : npc!.appearance}
              look={who === 'hero' ? props.hero.look : npc!.look}
              scale={3}
              flip={who === 'hero'}
            />
          </div>
        )}
        {who === 'core' && <div class="dialog__core" aria-hidden="true" />}
        <div class="dialog__body">
          {name && <div class="dialog__name">{name}</div>}
          <div class="dialog__text">
            {text.slice(0, shown)}
            <span class="dialog__rest">{text.slice(shown)}</span>
          </div>
        </div>
      </div>
      <div class="dialog__bar">
        <span class="dialog__hint">
          {line + 1}/{lines.length} · нажмите, чтобы продолжить
        </span>
        <button
          class="btn btn--small"
          data-testid="dialog-skip"
          onClick={(e) => {
            e.stopPropagation();
            sfx.play('ui');
            props.onDone();
          }}
        >
          Пропустить
        </button>
      </div>
    </div>
  );
}
