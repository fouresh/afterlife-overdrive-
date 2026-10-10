import { Btn } from '@ao/shared';
import { useEffect, useRef } from 'preact/hooks';
import type { GameHost } from '../game/host';
import type { InputManager } from '../game/input';
import { t, type TKey } from '../i18n';
import { useHud } from './hud/Hud';
import { PixelIcon, type ICONS } from './PixelIcon';

const JOY_RADIUS = 48;

/** setPointerCapture throws for synthetic or already-released pointers; capture is optional. */
function capture(el: Element, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    /* ignore */
  }
}

/**
 * Floating virtual joystick (left) + action buttons (right). Writes straight into the
 * InputManager: no Preact re-render per touch move. Button decorations (cooldowns, icons)
 * follow the HUD state.
 */
export function TouchControls({ host, hubMode }: { host: GameHost; hubMode?: boolean }) {
  const input = host.input;
  const hud = useHud(host);
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const z = zone.current!;
    const b = base.current!;
    const k = knob.current!;
    let active = -1;
    let ox = 0;
    let oy = 0;
    const idle = () => {
      const r = z.getBoundingClientRect();
      b.style.left = `${Math.max(72, r.width * 0.3)}px`;
      b.style.top = `${r.height - 92}px`;
      b.classList.add('joy-base--idle');
      k.style.transform = 'translate(0px, 0px)';
    };
    idle();
    const down = (e: PointerEvent) => {
      if (active !== -1) return;
      active = e.pointerId;
      capture(z, e.pointerId);
      const r = z.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      b.style.left = `${e.clientX - r.left}px`;
      b.style.top = `${e.clientY - r.top}px`;
      b.classList.remove('joy-base--idle');
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        // Drag the base along so direction changes stay responsive.
        const over = len - JOY_RADIUS;
        ox += (dx / len) * over;
        oy += (dy / len) * over;
        const r = z.getBoundingClientRect();
        b.style.left = `${ox - r.left}px`;
        b.style.top = `${oy - r.top}px`;
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      k.style.transform = `translate(${dx}px, ${dy}px)`;
      input.setStick(dx / JOY_RADIUS, dy / JOY_RADIUS);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== active) return;
      active = -1;
      input.setStick(0, 0);
      idle();
    };
    z.addEventListener('pointerdown', down);
    z.addEventListener('pointermove', move);
    z.addEventListener('pointerup', up);
    z.addEventListener('pointercancel', up);
    z.addEventListener('lostpointercapture', up);
    window.addEventListener('resize', idle);
    return () => {
      z.removeEventListener('pointerdown', down);
      z.removeEventListener('pointermove', move);
      z.removeEventListener('pointerup', up);
      z.removeEventListener('pointercancel', up);
      z.removeEventListener('lostpointercapture', up);
      window.removeEventListener('resize', idle);
      input.setStick(0, 0);
    };
  }, [input]);

  const skillImg = (s: 0 | 1) =>
    hud.skills[s].icon ? host.atlas.dataUrl(hud.skills[s].icon!, 0, 2) : undefined;
  return (
    <div class="controls">
      <div class="joy-zone" ref={zone} data-testid="joystick">
        <div class="joy-base" ref={base}>
          <div class="joy-knob" ref={knob} />
        </div>
      </div>
      {hud.interact && (
        <div class="interact-label" style={{ color: hud.interact.color }}>
          {hud.interact.label}
        </div>
      )}
      <div class={`cbtns${hubMode ? ' cbtns--hub' : ''}`}>
        {hubMode ? (
          <ActionButton
            input={input}
            bit={Btn.Interact}
            cls="interact"
            icon="hand"
            label="controls.interact"
            ready={!!hud.interact}
            off={!hud.interact}
          />
        ) : (
          <>
            <ActionButton
              input={input}
              bit={Btn.Attack}
              cls="attack"
              icon="sword"
              label="controls.attack"
            />
            <ActionButton
              input={input}
              bit={Btn.Dash}
              cls="dash"
              icon="dash"
              label="controls.dash"
              cd={1 - hud.dashReady}
            />
            <ActionButton
              input={input}
              bit={Btn.Skill1}
              cls="skill1"
              icon="orb"
              img={skillImg(0)}
              label="controls.skill1"
              cd={hud.skills[0].cd}
              off={!hud.skills[0].icon}
            />
            <ActionButton
              input={input}
              bit={Btn.Skill2}
              cls="skill2"
              icon="orb"
              img={skillImg(1)}
              label="controls.skill2"
              cd={hud.skills[1].cd}
              off={!hud.skills[1].icon}
            />
            <ActionButton
              input={input}
              bit={Btn.Potion}
              cls="potion"
              icon="potion"
              label="controls.potion"
              badge={hud.potions}
              off={hud.potions === 0}
            />
            <ActionButton
              input={input}
              bit={Btn.Interact}
              cls="interact"
              icon="hand"
              label="controls.interact"
              ready={!!hud.interact}
              off={!hud.interact}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** PC: compact bar with artifact cooldowns and hotkeys. */
export function DesktopBar({ host, hubMode }: { host: GameHost; hubMode?: boolean }) {
  const hud = useHud(host);
  const slot = (s: 0 | 1, key: string) => (
    <div class="dbar__slot">
      {hud.skills[s].icon ? (
        <img src={host.atlas.dataUrl(hud.skills[s].icon!, 0, 2)} alt="" />
      ) : (
        <span />
      )}
      <span class="cbtn__cd" style={{ '--cd': `${hud.skills[s].cd * 100}%` }} />
      <kbd>{key}</kbd>
    </div>
  );
  return (
    <div class="dbar">
      {hud.interact && (
        <div class="dbar__prompt" style={{ color: hud.interact.color }}>
          F — {hud.interact.label}
        </div>
      )}
      {!hubMode && (
        <div class="dbar__row">
          {slot(0, 'Q')}
          {slot(1, 'E')}
          <div class="dbar__slot">
            <PixelIcon name="potion" />
            <kbd>R ×{hud.potions}</kbd>
          </div>
          <span class="dbar__hint">
            WASD · мышь · ЛКМ атака · Пробел рывок · I сумка · Esc пауза
          </span>
        </div>
      )}
      {hubMode && <span class="dbar__hint">WASD — ходить · F — говорить · Esc — меню</span>}
    </div>
  );
}

function ActionButton(props: {
  input: InputManager;
  bit: number;
  cls: string;
  icon: keyof typeof ICONS;
  img?: string;
  label: TKey;
  cd?: number;
  badge?: number;
  ready?: boolean;
  off?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current!;
    let pointer = -1;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      pointer = e.pointerId;
      capture(el, e.pointerId);
      el.classList.add('cbtn--down');
      props.input.pressTouch(props.bit);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      pointer = -1;
      el.classList.remove('cbtn--down');
      props.input.releaseTouch(props.bit);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
  }, [props.input, props.bit]);
  const cls = `cbtn cbtn--${props.cls}${props.ready ? ' cbtn--ready' : ''}${props.off ? ' cbtn--off' : ''}`;
  return (
    <button
      ref={ref}
      type="button"
      class={cls}
      aria-label={t(props.label)}
      data-testid={`btn-${props.cls}`}
    >
      {props.img ? (
        <img class="cbtn__img" src={props.img} alt="" />
      ) : (
        <PixelIcon name={props.icon} />
      )}
      <span class="cbtn__cd" style={{ '--cd': `${Math.round((props.cd ?? 0) * 100)}%` }} />
      {props.badge !== undefined && <span class="cbtn__badge">{props.badge}</span>}
    </button>
  );
}
