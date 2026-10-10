import {
  CHAR_H,
  CHAR_OX,
  CHAR_OY,
  CHAR_W,
  DEFAULT_APPEARANCE,
  RARITY_COLORS,
  TILESETS,
  composeCharacter,
  contentRu,
  getContent,
  type EquipLook,
} from '@ao/content';
import { TICK_DT, TILE, emptyInput, type PlayerInput } from '@ao/shared';
import {
  EF,
  Kind,
  PickupKind,
  PropKind,
  carryOut,
  createFloorWorld,
  equipFromBag,
  itemBase,
  recomputeStats,
  rollItem,
  spawnPickup,
  step,
  type ItemInstance,
  type Loadout,
  type Outcome,
  type PlayerSetup,
  type RunConfig,
  type World,
} from '@ao/sim';
import { diagSet } from '../core/diagnostics';
import { flags } from '../core/flags';
import { onViewportChange, readViewport } from '../core/viewport';
import { Atlas, type AtlasEntry } from './atlas';
import { Fx } from './fx';
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

export interface HudSkill {
  icon: string | null;
  cd: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  shield: number;
  gold: number;
  potions: number;
  keys: number;
  depth: number;
  floors: number;
  skills: [HudSkill, HudSkill];
  dashReady: number;
  interact: { label: string; color: string } | null;
  boss: { name: string; frac: number } | null;
  bag: number;
}

export type Command = { type: 'equip'; bag: number; slot: 0 | 1 } | { type: 'drop'; bag: number };

export interface HostCallbacks {
  onOutcome(outcome: Outcome): void;
  toast(text: string, kind?: 'info' | 'warn' | 'good'): void;
  hurtFlash(): void;
}

let atlasPromise: Promise<Atlas> | null = null;
/** The static atlas is built once per page and shared by all game sessions. */
export function getAtlas(): Promise<Atlas> {
  atlasPromise ??= Atlas.build();
  return atlasPromise;
}

function lookOf(l: Loadout): EquipLook {
  const look: EquipLook = {};
  const mat = (it: ItemInstance | null) => {
    if (!it) return undefined;
    const b = itemBase(it);
    return b.kind === 'armor' ? b.def.look : undefined;
  };
  const h = mat(l.helmet);
  const c = mat(l.chest);
  const b = mat(l.boots);
  if (h?.shape) look.helmet = { shape: h.shape, material: h.material };
  if (c?.shape) look.chest = { shape: c.shape, material: c.material };
  if (b) look.boots = { material: b.material };
  return look;
}

export function itemName(item: ItemInstance): string {
  return contentRu[itemBase(item).def.nameKey] ?? item.base;
}

/**
 * Owns one running floor: sim world + renderer + input + fixed-step loop.
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
  readonly hud: HudState = {
    hp: 0,
    maxHp: 1,
    shield: 0,
    gold: 0,
    potions: 0,
    keys: 0,
    depth: 0,
    floors: 1,
    skills: [
      { icon: null, cd: 0 },
      { icon: null, cd: 0 },
    ],
    dashReady: 1,
    interact: null,
    boss: null,
    bag: 0,
  };
  paused = false;
  /** Uids of items equipped when the run started (not counted as run loot). */
  startUids = new Set<string>();
  /** Seconds played on previous floors. */
  elapsedBefore = 0;
  world!: World;
  atlas!: Atlas;
  private renderer = new Renderer();
  private fx!: Fx;
  private tilemap?: TilemapView;
  private view?: WorldView;
  private sheets: (Sheet | undefined)[] = [];
  private sheetLook: number[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private frames = 0;
  private fpsTime = 0;
  private worst = 0;
  private hitStopT = 0;
  private inputs: PlayerInput[] = [emptyInput()];
  private commands: Command[] = [];
  private disposers: (() => void)[] = [];
  private reportedOutcome: Outcome = 'playing';

  constructor(
    private canvas: HTMLCanvasElement,
    private cfg: RunConfig,
    private cb: HostCallbacks,
  ) {}

  async start(depth: number, players: PlayerSetup[]): Promise<void> {
    const vp = readViewport();
    this.atlas = await getAtlas();
    await this.renderer.init(this.canvas, vp, TILESETS.crypt!.background);
    this.fx = new Fx(this.atlas);
    this.renderer.fxLayer.addChild(this.fx.layer);
    this.renderer.glowLayer.addChild(this.fx.glow);
    this.loadFloor(depth, players);
    this.input.attach(this.canvas);
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

  /** Build the world and its views for a floor. */
  private loadFloor(depth: number, players: PlayerSetup[]): void {
    this.view?.destroy();
    this.tilemap?.destroy();
    this.world = createFloorWorld(this.cfg, depth, players);
    if (flags.e2e) {
      const p = this.world.players[0]!;
      this.world.e.maxHp[p.ent] = 1e6;
      this.world.e.hp[p.ent] = 1e6;
    }
    this.reportedOutcome = 'playing';
    const tileset = TILESETS[this.world.floor.biome] ?? TILESETS.crypt!;
    this.tilemap = new TilemapView(this.atlas, this.world.floor);
    this.renderer.floorLayer.addChild(this.tilemap.container);
    this.view = new WorldView(
      this.renderer,
      this.atlas,
      this.fx,
      this.world,
      (i) => this.playerSheet(i),
      {
        hitStop: (s) => (this.hitStopT = Math.max(this.hitStopT, s)),
        toast: (t, k) => this.cb.toast(t, k),
        hurtFlash: () => this.cb.hurtFlash(),
      },
      tileset,
    );
    const p = this.world.players[0]!;
    this.renderer.camX = this.world.e.x[p.ent]!;
    this.renderer.camY = this.world.e.y[p.ent]!;
    this.stats.seed = this.world.seed;
    diagSet('seed', `${this.cfg.seed} floor ${depth}`);
    diagSet('screen', 'game');
    this.acc = 0;
  }

  nextFloor(): void {
    const carry = carryOut(this.world);
    this.loadFloor(this.world.depth + 1, carry);
  }

  private playerSheet(index: number): AtlasEntry {
    const p = this.world.players[index];
    const version = p?.lookVersion ?? 0;
    let s = this.sheets[index];
    if (!s || this.sheetLook[index] !== version) {
      s?.destroy();
      const look = p ? lookOf(p.loadout) : {};
      s = new Sheet(composeCharacter(DEFAULT_APPEARANCE, look), CHAR_W, CHAR_H, CHAR_OX, CHAR_OY);
      this.sheets[index] = s;
      this.sheetLook[index] = version;
    }
    return s.entry;
  }

  command(c: Command): void {
    this.commands.push(c);
  }

  private applyCommands(): void {
    const w = this.world;
    const p = w.players[0]!;
    for (const c of this.commands) {
      if (c.type === 'equip') equipFromBag(w, p, c.bag, c.slot);
      else if (c.type === 'drop') {
        const item = p.bag.splice(c.bag, 1)[0];
        if (item) {
          spawnPickup(w, PickupKind.Item, w.e.x[p.ent]!, w.e.y[p.ent]! + 8, {
            item,
            amount: 1,
            owner: p.index,
          });
          recomputeStats(w, p);
        }
      }
    }
    this.commands.length = 0;
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
    let dt = dtMs / 1000;
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
    // Hit-stop: freeze the simulation (and particles) for a few frames on impacts.
    if (this.hitStopT > 0) {
      this.hitStopT -= dt;
      dt = 0;
    }
    if (!this.paused && dt > 0) {
      this.acc += dt;
      let steps = 0;
      const t0 = performance.now();
      while (this.acc >= TICK_DT && steps < 5) {
        if (this.commands.length) this.applyCommands();
        const v = this.renderer.viewport;
        const sx = (w.e.x[p.ent]! + this.renderer.world.x) / v.logicalW;
        const sy = (w.e.y[p.ent]! - 10 + this.renderer.world.y) / v.logicalH;
        this.input.sample(this.inputs[0]!, { x: sx, y: sy }, v.logicalW / v.logicalH);
        step(w, this.inputs);
        this.view!.handleEvents();
        this.acc -= TICK_DT;
        steps++;
        if (this.hitStopT > 0) break;
      }
      if (steps === 5) this.acc = 0;
      this.stats.simMs = performance.now() - t0;
    } else if (this.paused && this.commands.length) {
      this.applyCommands();
    }
    const alpha = this.paused || dt === 0 ? 1 : Math.min(1, this.acc / TICK_DT);
    const px = w.e.px[p.ent]! + (w.e.x[p.ent]! - w.e.px[p.ent]!) * alpha;
    const py = w.e.py[p.ent]! + (w.e.y[p.ent]! - w.e.py[p.ent]!) * alpha;
    this.renderer.updateCamera(px, py - 6, w.floor.w * TILE, w.floor.h * TILE, dtMs / 1000);
    const vr = this.renderer.visibleRect();
    this.tilemap!.cull(vr.x, vr.y, vr.w, vr.h);
    this.view!.sync(alpha, this.paused ? 0 : dt);
    this.fx.update(this.paused ? 0 : dt);
    this.renderer.render();
    this.updateHud();
    this.stats.tick = w.tick;
    this.stats.entities = w.e.countAlive();
    if (w.outcome !== this.reportedOutcome) {
      this.reportedOutcome = w.outcome;
      this.cb.onOutcome(w.outcome);
    }
  };

  private updateHud(): void {
    const w = this.world;
    const e = w.e;
    const p = w.players[0]!;
    const h = this.hud;
    h.hp = Math.ceil(e.hp[p.ent]!);
    h.maxHp = e.maxHp[p.ent]!;
    h.shield = Math.ceil(p.shield);
    h.gold = p.gold;
    h.potions = p.potions;
    h.keys = w.keys;
    h.depth = w.depth;
    h.floors = w.floors;
    h.bag = p.bag.length;
    for (const s of [0, 1] as const) {
      const art = p.loadout.artifacts[s];
      h.skills[s].icon = art ? `item:${art.base}` : null;
      h.skills[s].cd = p.skillCd[s] > 0 ? p.skillCd[s] / Math.max(1, p.skillCdMax[s]) : 0;
    }
    h.dashReady = p.dashCharges > 0 ? 1 : p.dashRecharge / 27;
    // Interact prompt
    const j = p.interact;
    h.interact = null;
    if (j >= 0 && e.alive[j]) {
      if (e.kind[j] === Kind.Pickup) {
        const item = w.drops[e.ref[j]!]?.item;
        if (item)
          h.interact = { label: `Взять: ${itemName(item)}`, color: RARITY_COLORS[item.rarity]! };
      } else if (e.kind[j] === Kind.Prop) {
        const k = e.def[j];
        if (k === PropKind.Chest) h.interact = { label: 'Открыть сундук', color: '#f2c94c' };
        else if (k === PropKind.Stairs) h.interact = { label: 'Спуститься', color: '#36c4b4' };
        else if (k === PropKind.Portal) h.interact = { label: 'Войти в портал', color: '#36c4b4' };
        else if (k === PropKind.Shop) {
          const slot = w.shop[e.ref[j]!];
          if (slot && !slot.sold) {
            const name = slot.potion ? 'Зелье лечения' : slot.item ? itemName(slot.item) : '?';
            h.interact = {
              label: `Купить: ${name} — ${slot.price} з.`,
              color: slot.item ? RARITY_COLORS[slot.item.rarity]! : '#cf4440',
            };
          }
        }
      }
    }
    // Boss bar
    h.boss = null;
    const b = w.bossEnt;
    if (
      b >= 0 &&
      e.alive[b] &&
      e.kind[b] === Kind.Enemy &&
      !(e.flags[b]! & EF.Dying) &&
      w.rooms[e.room[b]!]?.state === 1
    ) {
      const def = getContent().enemies[e.def[b]!]!;
      h.boss = {
        name: contentRu[def.nameKey] ?? def.id,
        frac: Math.max(0, e.hp[b]! / e.maxHp[b]!),
      };
    } else {
      // Minibosses also get a bar while fighting.
      for (let i = 0; i < e.hi; i++) {
        if (
          !e.alive[i] ||
          e.kind[i] !== Kind.Enemy ||
          !(e.flags[i]! & EF.Boss) ||
          e.flags[i]! & EF.Dying
        )
          continue;
        if (w.rooms[e.room[i]!]?.state !== 1) continue;
        const def = getContent().enemies[e.def[i]!]!;
        h.boss = {
          name: contentRu[def.nameKey] ?? def.id,
          frac: Math.max(0, e.hp[i]! / e.maxHp[i]!),
        };
        break;
      }
    }
  }

  /** Snapshot for tests and the debug overlay. */
  debugState() {
    const w = this.world;
    const e = w.e;
    const p = w.players[0]!;
    let enemies = 0;
    for (let i = 0; i < e.hi; i++)
      if (e.alive[i] && e.kind[i] === Kind.Enemy && !(e.flags[i]! & EF.Dying)) enemies++;
    return {
      tick: w.tick,
      depth: w.depth,
      outcome: w.outcome,
      player: { x: e.x[p.ent]!, y: e.y[p.ent]!, hp: e.hp[p.ent]! },
      kills: p.kills,
      gold: p.gold,
      enemies,
      rooms: w.rooms.map((r) => r.state).join(''),
    };
  }

  /** e2e/debug helper (?e2e=1 only): teleport into the nearest uncleared combat room. */
  e2eEnterCombat(): boolean {
    const w = this.world;
    const e = w.e;
    const p = w.players[0]!;
    const room = w.floor.rooms.findIndex(
      (r, i) => r.lockOnEnter && w.rooms[i]!.state === 0 && r.type === 'combat',
    );
    if (room < 0) return false;
    const r = w.floor.rooms[room]!.rect;
    for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
      for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (w.map.tiles[y * w.map.w + x] !== 1) continue;
        e.x[p.ent] = (x + 0.5) * TILE;
        e.y[p.ent] = (y + 0.5) * TILE;
        e.px[p.ent] = e.x[p.ent]!;
        e.py[p.ent] = e.y[p.ent]!;
        return true;
      }
    }
    return false;
  }

  /** e2e/debug helper: put some rolled items into the bag. */
  e2eGrant(count = 5): void {
    const w = this.world;
    const p = w.players[0]!;
    for (let k = 0; k < count; k++) {
      p.bag.push(rollItem(w.runSeed + k * 977, 3 + k, Math.min(4, k), undefined, `e2e-${k}`));
    }
    p.gold += 120;
  }

  /** e2e/debug helper: finish the floor as if the stairs were used. */
  e2eFinishFloor(): void {
    this.world.outcome = this.world.floor.isLast ? 'victory' : 'exit';
  }

  /** Current run carry (for summaries and saving). */
  carry(): PlayerSetup[] {
    return carryOut(this.world);
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
    for (const s of this.sheets) s?.destroy();
    this.renderer.destroy();
  }
}

export { Kind };
