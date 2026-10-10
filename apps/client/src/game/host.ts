import {
  CHAR_H,
  CHAR_OX,
  CHAR_OY,
  CHAR_W,
  composeCharacter,
  DEFAULT_APPEARANCE,
} from '@ao/content';
import { arenaFloor } from '@ao/procgen';
import { TICK_DT, emptyInput, type PlayerInput } from '@ao/shared';
import { addPlayer, createWorld, step, type World } from '@ao/sim';
import { diagSet } from '../core/diagnostics';
import { onViewportChange, readViewport } from '../core/viewport';
import { Atlas } from './atlas';
import { InputManager } from './input';
import { Renderer } from './renderer';
import { Sheet } from './sheet';
import { TilemapView } from './tilemap';
import { WorldView } from './worldView';

export interface HostStats {
  fps: number;
  frameMs: number;
  worstFrameMs: number;
  simMs: number;
  entities: number;
  seed: number;
  tick: number;
  res: string;
}

/**
 * Owns one running game: sim world + renderer + input + fixed-step loop.
 * The sim advances at TICK_RATE; rendering interpolates between the last two ticks.
 */
export class GameHost {
  readonly input = new InputManager();
  readonly stats: HostStats = {
    fps: 0,
    frameMs: 0,
    worstFrameMs: 0,
    simMs: 0,
    entities: 0,
    seed: 0,
    tick: 0,
    res: '',
  };
  paused = false;
  private renderer = new Renderer();
  private atlas!: Atlas;
  private world!: World;
  private tilemap!: TilemapView;
  private view!: WorldView;
  private sheets: Sheet[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private frames = 0;
  private fpsTime = 0;
  private worst = 0;
  private inputs: PlayerInput[] = [emptyInput()];
  private disposers: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement) {}

  async start(): Promise<void> {
    const vp = readViewport();
    this.atlas = await Atlas.build();
    const floor = arenaFloor();
    this.world = createWorld(floor, floor.seed);
    addPlayer(this.world);
    this.sheets.push(
      new Sheet(composeCharacter(DEFAULT_APPEARANCE), CHAR_W, CHAR_H, CHAR_OX, CHAR_OY),
    );
    await this.renderer.init(this.canvas, vp, '#0d0a12');
    this.tilemap = new TilemapView(this.atlas, floor);
    this.renderer.floorLayer.addChild(this.tilemap.container);
    this.view = new WorldView(
      this.renderer,
      this.atlas,
      this.world,
      this.sheets.map((s) => s.entry),
    );
    const p = this.world.players[0]!;
    this.renderer.camX = this.world.e.x[p.ent]!;
    this.renderer.camY = this.world.e.y[p.ent]!;
    this.input.attach(this.canvas);
    this.stats.seed = this.world.seed;
    diagSet('seed', this.world.seed);
    diagSet('screen', 'game');
    this.updateResStat();

    this.disposers.push(
      onViewportChange(() => {
        this.renderer.resize(readViewport());
        this.updateResStat();
      }),
    );
    const vis = () => {
      if (document.hidden) this.paused = true;
      this.last = performance.now();
    };
    document.addEventListener('visibilitychange', vis);
    this.disposers.push(() => document.removeEventListener('visibilitychange', vis));

    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private updateResStat(): void {
    const v = this.renderer.viewport;
    this.stats.res = `${v.logicalW}×${v.logicalH} ×${v.scale} (dpr ${v.dpr})`;
    diagSet('viewport', this.stats.res);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dtMs = Math.min(250, now - this.last);
    this.last = now;
    const dt = dtMs / 1000;

    // FPS stats (once per second)
    this.frames++;
    this.fpsTime += dtMs;
    this.worst = Math.max(this.worst, dtMs);
    if (this.fpsTime >= 1000) {
      this.stats.fps = Math.round((this.frames * 1000) / this.fpsTime);
      this.stats.frameMs = this.fpsTime / this.frames;
      this.stats.worstFrameMs = this.worst;
      this.frames = 0;
      this.fpsTime = 0;
      this.worst = 0;
    }

    const w = this.world;
    const p = w.players[0]!;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (this.acc >= TICK_DT && steps < 5) {
        const v = this.renderer.viewport;
        const sx = (w.e.x[p.ent]! + this.renderer.world.x) / v.logicalW;
        const sy = (w.e.y[p.ent]! - 10 + this.renderer.world.y) / v.logicalH;
        this.input.sample(this.inputs[0]!, { x: sx, y: sy }, v.logicalW / v.logicalH);
        step(w, this.inputs);
        this.acc -= TICK_DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.stats.simMs = performance.now() - t0;
    }
    const alpha = this.paused ? 1 : this.acc / TICK_DT;
    const px = w.e.px[p.ent]! + (w.e.x[p.ent]! - w.e.px[p.ent]!) * alpha;
    const py = w.e.py[p.ent]! + (w.e.y[p.ent]! - w.e.py[p.ent]!) * alpha;
    this.renderer.updateCamera(px, py - 6, w.floor.w * 16, w.floor.h * 16, dt);
    const vr = this.renderer.visibleRect();
    this.tilemap.cull(vr.x, vr.y, vr.w, vr.h);
    this.view.sync(alpha, this.paused ? 0 : dt);
    this.renderer.render();
    this.stats.tick = w.tick;
    this.stats.entities = w.e.countAlive();
  };

  /** Snapshot for tests and the debug overlay. */
  debugState(): { tick: number; player: { x: number; y: number } } {
    const p = this.world.players[0]!;
    return {
      tick: this.world.tick,
      player: { x: this.world.e.x[p.ent]!, y: this.world.e.y[p.ent]! },
    };
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    for (const d of this.disposers) d();
    this.input.dispose();
    this.view?.destroy();
    this.tilemap?.destroy();
    for (const s of this.sheets) s.destroy();
    this.renderer.destroy();
    this.atlas?.destroy();
  }
}
