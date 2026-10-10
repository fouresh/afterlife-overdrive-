import { Btn } from '@ao/shared';
import { useEffect, useRef } from 'preact/hooks';
import type { InputManager } from '../game/input';
import { t, type TKey } from '../i18n';
import type { ICONS } from './PixelIcon';
import { PixelIcon } from './PixelIcon';

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
 * InputManager: no Preact re-render per touch move.
 */
export function TouchControls({ input }: { input: InputManager }) {
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

  return (
    <div class="controls">
      <div class="joy-zone" ref={zone} data-testid="joystick">
        <div class="joy-base" ref={base}>
          <div class="joy-knob" ref={knob} />
        </div>
      </div>
      <div class="cbtns">
        <ActionButton
          input={input}
          bit={Btn.Attack}
          cls="attack"
          icon="sword"
          label="controls.attack"
        />
        <ActionButton input={input} bit={Btn.Dash} cls="dash" icon="dash" label="controls.dash" />
        <ActionButton
          input={input}
          bit={Btn.Skill1}
          cls="skill1"
          icon="orb"
          label="controls.skill1"
        />
        <ActionButton
          input={input}
          bit={Btn.Skill2}
          cls="skill2"
          icon="orb"
          label="controls.skill2"
        />
        <ActionButton
          input={input}
          bit={Btn.Potion}
          cls="potion"
          icon="potion"
          label="controls.potion"
        />
        <ActionButton
          input={input}
          bit={Btn.Interact}
          cls="interact"
          icon="hand"
          label="controls.interact"
        />
      </div>
    </div>
  );
}

function ActionButton(props: {
  input: InputManager;
  bit: number;
  cls: string;
  icon: keyof typeof ICONS;
  label: TKey;
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
  return (
    <button
      ref={ref}
      type="button"
      class={`cbtn cbtn--${props.cls}`}
      aria-label={t(props.label)}
      data-testid={`btn-${props.cls}`}
    >
      <PixelIcon name={props.icon} />
      <span class="cbtn__cd" />
    </button>
  );
}
