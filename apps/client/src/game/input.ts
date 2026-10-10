import { Btn, angleToByte, quantizeMove, type PlayerInput } from '@ao/shared';

const KEY_BUTTONS: Record<string, number> = {
  Space: Btn.Dash,
  ShiftLeft: Btn.Dash,
  KeyQ: Btn.Skill1,
  KeyE: Btn.Skill2,
  KeyR: Btn.Potion,
  KeyF: Btn.Interact,
  KeyJ: Btn.Attack,
  KeyK: Btn.Dash,
};

/**
 * Merges touch controls, keyboard and mouse into one PlayerInput per tick.
 * Touch controls write stickX/stickY and touchButtons directly (no re-renders).
 */
export class InputManager {
  stickX = 0;
  stickY = 0;
  touchButtons = 0;
  private keys = new Set<string>();
  private keyButtons = 0;
  private mouseButtons = 0;
  private mouseX = 0;
  private mouseY = 0;
  /** Mouse was used recently → aim follows the cursor. */
  private mouseAim = false;
  /** Buttons pressed and released between two ticks still count once. */
  private latched = 0;
  private detach: (() => void)[] = [];
  onPause?: () => void;
  onInventory?: () => void;

  attach(canvas: HTMLCanvasElement): void {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
        return;
      }
      if (e.code === 'KeyI' || e.code === 'Tab') {
        e.preventDefault();
        this.onInventory?.();
        return;
      }
      this.keys.add(e.code);
      const b = KEY_BUTTONS[e.code];
      if (b) {
        this.keyButtons |= b;
        this.latched |= b;
      }
    };
    const up = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      const b = KEY_BUTTONS[e.code];
      if (b) this.keyButtons &= ~b;
    };
    const blur = () => {
      this.keys.clear();
      this.keyButtons = 0;
      this.mouseButtons = 0;
      this.touchButtons = 0;
      this.stickX = 0;
      this.stickY = 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = (e.clientY - r.top) / r.height;
      this.mouseAim = true;
    };
    const mdown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      move(e);
      const b = e.button === 2 ? Btn.Dash : Btn.Attack;
      this.mouseButtons |= b;
      this.latched |= b;
    };
    const mup = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      this.mouseButtons &= ~(e.button === 2 ? Btn.Dash : Btn.Attack);
    };
    const ctx = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', mdown);
    window.addEventListener('pointerup', mup);
    canvas.addEventListener('contextmenu', ctx);
    this.detach.push(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', mdown);
      window.removeEventListener('pointerup', mup);
      canvas.removeEventListener('contextmenu', ctx);
    });
  }

  /** Touch: a button went down (latched so very short taps are not lost between ticks). */
  pressTouch(b: number): void {
    this.touchButtons |= b;
    this.latched |= b;
    this.mouseAim = false;
  }

  releaseTouch(b: number): void {
    this.touchButtons &= ~b;
  }

  setStick(x: number, y: number): void {
    this.stickX = x;
    this.stickY = y;
    if (x !== 0 || y !== 0) this.mouseAim = false;
  }

  /**
   * Fill `out` for the next tick. `playerScreen` is the player position in normalized canvas
   * coordinates (0..1), used for mouse aiming.
   */
  sample(out: PlayerInput, playerScreen: { x: number; y: number }, aspect: number): void {
    let kx = 0;
    let ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;
    const useKeys = kx !== 0 || ky !== 0;
    quantizeMove(useKeys ? kx : this.stickX, useKeys ? ky : this.stickY, out);
    let buttons = this.touchButtons | this.keyButtons | this.mouseButtons | this.latched;
    this.latched = 0;
    if (this.mouseAim) {
      const dx = (this.mouseX - playerScreen.x) * aspect;
      const dy = this.mouseY - playerScreen.y;
      out.aim = angleToByte(Math.atan2(dy, dx));
      buttons |= Btn.ManualAim;
    } else {
      out.aim = 0;
    }
    out.buttons = buttons;
  }

  dispose(): void {
    for (const d of this.detach) d();
    this.detach = [];
  }
}
