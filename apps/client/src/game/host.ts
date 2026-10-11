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
  type Appearance,
  type EquipLook,
  type HubStation,
} from '@ao/content';
import type { DungeonFloor } from '@ao/procgen';
import { TICK_DT, TILE, emptyInput, type PlayerInput } from '@ao/shared';
import {
  EF,
  Kind,
  PickupKind,
  PropKind,
  carryOut,
  createFloorWorld,
  createWorld,
  equipFromBag,
  initFloorEntities,
  addPlayer,
  itemBase,
  recomputeStats,
  rollItem,
  spawnPickup,
  step,
  storyEvent,
  type ItemInstance,
  type Loadout,
  type Outcome,
  type PlayerSetup,
  type RunConfig,
  type World,
} from '@ao/sim';
import { diagSet } from '../core/diagnostics';
import { flags } from '../core/flags';
import type { NetRun } from '../net/netrun';
import { party } from '../net/party';
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
  /** Network line for the debug overlay ('' when solo). */
  net: string;
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
  /** Hub: the player talked to a station (index into the active station list). */
  onTalk?(station: number): void;
}

let atlasPromise: Promise<Atlas> | null = null;
/** The static atlas is built once per page and shared by all game sessions. */
export function getAtlas(): Promise<Atlas> {
  atlasPromise ??= Atlas.build();
  return atlasPromise;
}

export function lookOf(l: Loadout): EquipLook {
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
    net: '',
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

  /** Player appearances by player index (paper-doll). */
  appearances: Appearance[] = [DEFAULT_APPEARANCE];
  /** Player names by index (co-op: revive prompts, party HUD). */
  names: string[] = [];
  /** Index of the player this device controls. */
  localIndex = 0;
  /** Networked run driver (null = local simulation). */
  net: NetRun | null = null;
  /** Hub stations (by station prop ref) when in hub mode. */
  stations: HubStation[] = [];
  private npcSheets = new Map<number, Sheet>();
  /** DOM label of the current interaction, floated over the object (see updatePrompt). */
  private promptEl: HTMLElement | null = null;
  private promptPrefix = '';
  private promptText = '';
  private promptW = 0;
  private promptH = 0;
  private anchor = { x: 0, y: 0 };
  private cfg: RunConfig = { seed: 1, biome: 'crypt', floors: 3 };

  constructor(
    private canvas: HTMLCanvasElement,
    private cb: HostCallbacks,
  ) {}

  /** Start a dungeon run at `depth`. */
  async start(cfg: RunConfig, depth: number, players: PlayerSetup[]): Promise<void> {
    this.cfg = cfg;
    await this.init();
    this.loadFloor(depth, players);
    this.begin();
  }

  /** Start a networked run: the world comes from the server (floor message + snapshots). */
  async startNet(net: NetRun): Promise<void> {
    this.net = net;
    await this.init();
    const t0 = performance.now();
    while (!net.world) {
      net.pump(performance.now());
      if (net.world) break;
      if (performance.now() - t0 > 15000) throw new Error('No floor from the server');
      await new Promise((r) => setTimeout(r, 30));
    }
    this.begin();
  }

  /** NetRun hook: a (new) floor arrived. */
  netFloor(world: World): void {
    const net = this.net!;
    this.localIndex = net.local;
    this.appearances = net.appearances.map((a) => a ?? DEFAULT_APPEARANCE);
    this.names = net.names;
    for (const s of this.sheets) s?.destroy();
    this.sheets = [];
    this.sheetLook = [];
    this.setWorld(world);
    diagSet('seed', `${world.runSeed} floor ${world.depth} (net)`);
  }

  /** Start the personal hub scene. */
  async startHub(floor: DungeonFloor, stations: HubStation[], player: PlayerSetup): Promise<void> {
    this.stations = stations;
    await this.init();
    const w = createWorld(floor, floor.seed, { runSeed: floor.seed });
    addPlayer(w, player);
    initFloorEntities(w);
    this.setWorld(w);
    this.begin();
  }

  private async init(): Promise<void> {
    const vp = readViewport();
    this.atlas = await getAtlas();
    await this.renderer.init(this.canvas, vp, TILESETS.crypt!.background);
    this.fx = new Fx(this.atlas);
    this.renderer.fxLayer.addChild(this.fx.layer);
    this.renderer.glowLayer.addChild(this.fx.glow);
  }

  private begin(): void {
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
    this.setWorld(createFloorWorld(this.cfg, depth, players));
    diagSet('seed', `${this.cfg.seed} floor ${depth}`);
  }

  private setWorld(world: World): void {
    this.view?.destroy();
    this.tilemap?.destroy();
    this.world = world;
    if (flags.e2e && !this.net) {
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
      (station) => this.npcSheet(station),
      (npc) => this.npcSheetByIndex(npc),
      this.stations,
      {
        hitStop: (s) => {
          if (!this.net) this.hitStopT = Math.max(this.hitStopT, s);
        },
        toast: (t, k) => this.cb.toast(t, k),
        hurtFlash: () => this.cb.hurtFlash(),
        talk: (station) => this.cb.onTalk?.(station),
      },
      tileset,
      this.localIndex,
    );
    const p = this.world.players[this.localIndex];
    if (p) {
      this.renderer.camX = this.world.e.x[p.ent]!;
      this.renderer.camY = this.world.e.y[p.ent]!;
    }
    this.stats.seed = this.world.seed;
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
      const appearance = this.appearances[index] ?? DEFAULT_APPEARANCE;
      s = new Sheet(composeCharacter(appearance, look), CHAR_W, CHAR_H, CHAR_OX, CHAR_OY);
      this.sheets[index] = s;
      this.sheetLook[index] = version;
    }
    return s.entry;
  }

  private npcSheet(station: number): AtlasEntry | null {
    const st = this.stations[station];
    if (!st?.npc) return null;
    let s = this.npcSheets.get(station);
    if (!s) {
      s = new Sheet(
        composeCharacter(st.npc.appearance, st.npc.look),
        CHAR_W,
        CHAR_H,
        CHAR_OX,
        CHAR_OY,
      );
      this.npcSheets.set(station, s);
    }
    return s.entry;
  }

  private npcByIndex = new Map<number, Sheet>();
  /** Paper-doll of a story NPC by index (captives in dungeons). */
  private npcSheetByIndex(index: number): AtlasEntry | null {
    const npc = getContent().npcs[index];
    if (!npc) return null;
    let s = this.npcByIndex.get(index);
    if (!s) {
      s = new Sheet(composeCharacter(npc.appearance, npc.look), CHAR_W, CHAR_H, CHAR_OX, CHAR_OY);
      this.npcByIndex.set(index, s);
    }
    return s.entry;
  }

  /** Rebuild the local player's paper-doll (appearance or equipment changed outside the sim). */
  refreshLook(): void {
    const p = this.world.players[this.localIndex];
    if (p) p.lookVersion++;
  }

  /**
   * Element that shows the interaction label over the object in the world. The host positions
   * it every frame (no Preact render per frame). `prefix` = key hint on desktop ("F — ").
   */
  setPromptElement(el: HTMLElement | null, prefix = ''): void {
    this.promptEl = el;
    this.promptPrefix = prefix;
    this.promptText = '';
    if (el) el.hidden = true;
  }

  private updatePrompt(): void {
    const el = this.promptEl;
    if (!el) return;
    const it = this.hud.interact;
    const p = this.world.players[this.localIndex];
    if (!it || !p || p.interact < 0 || !this.view?.anchorAbove(p.interact, this.anchor)) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    const text = this.promptPrefix + it.label;
    if (el.hidden) el.hidden = false;
    if (text !== this.promptText) {
      this.promptText = text;
      el.textContent = text;
      el.style.color = it.color;
      this.promptW = el.offsetWidth;
      this.promptH = el.offsetHeight;
    }
    const v = this.renderer.viewport;
    const k = v.scale / v.dpr; // CSS px per world px
    const sw = window.innerWidth;
    const half = this.promptW / 2;
    const x = Math.min(
      sw - half - 6,
      Math.max(half + 6, (this.anchor.x + this.renderer.world.x) * k),
    );
    const y = Math.max(this.promptH + 52, (this.anchor.y + this.renderer.world.y) * k - 4);
    el.style.transform = `translate(${Math.round(x - half)}px, ${Math.round(y - this.promptH)}px)`;
  }

  /** The player this device controls. */
  me() {
    return this.world.players[this.localIndex];
  }

  command(c: Command): void {
    if (this.net) {
      party.send(
        c.type === 'equip' ? { t: 'equip', bag: c.bag, slot: c.slot } : { t: 'drop', bag: c.bag },
      );
      return;
    }
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
    // rAF timestamps can be slightly older than the start time: never step backwards.
    const dtMs = Math.max(0, Math.min(250, now - this.last));
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
    if (this.net) {
      this.netFrame(now, dt);
      return;
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
        this.trackAttacker();
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
    // During hit-stop dt is 0 but `acc` is untouched: keep the same sub-tick alpha so the frozen
    // frame does not jump forward (alpha 1) and back again when the stop ends.
    const alpha = this.paused ? 1 : Math.min(1, this.acc / TICK_DT);
    const px = w.e.px[p.ent]! + (w.e.x[p.ent]! - w.e.px[p.ent]!) * alpha;
    const py = w.e.py[p.ent]! + (w.e.y[p.ent]! - w.e.py[p.ent]!) * alpha;
    this.renderer.updateCamera(
      px,
      py - 6,
      w.floor.w * TILE,
      w.floor.h * TILE,
      dtMs / 1000,
      w.e.x[p.ent]! - w.e.px[p.ent]!,
      w.e.y[p.ent]! - w.e.py[p.ent]!,
    );
    const vr = this.renderer.visibleRect();
    this.tilemap!.cull(vr.x, vr.y, vr.w, vr.h);
    this.view!.sync(alpha, this.paused ? 0 : dt);
    this.fx.update(this.paused ? 0 : dt);
    this.renderer.render();
    this.updateHud();
    this.updatePrompt();
    this.stats.tick = w.tick;
    this.stats.entities = w.e.countAlive();
    if (w.outcome !== this.reportedOutcome) {
      this.reportedOutcome = w.outcome;
      this.cb.onOutcome(w.outcome);
    }
  };

  private idleInput = emptyInput();

  /** Networked frame: pump snapshots, predict the local player, render remote ones in the past. */
  private netFrame(now: number, dt: number): void {
    const net = this.net!;
    const t0 = performance.now();
    net.pump(now);
    const w = this.world;
    const me = w.players[this.localIndex];
    const e = w.e;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 5) {
      if (this.paused || !me) {
        net.localTick(this.idleInput);
      } else {
        const v = this.renderer.viewport;
        const sx = (e.x[me.ent]! + this.renderer.world.x) / v.logicalW;
        const sy = (e.y[me.ent]! - 10 + this.renderer.world.y) / v.logicalH;
        this.input.sample(this.inputs[0]!, { x: sx, y: sy }, v.logicalW / v.logicalH);
        net.localTick(this.inputs[0]!);
      }
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    net.flushInput(now);
    net.prepareRender(now, dt, w.events);
    this.view!.handleEvents();
    this.stats.simMs = performance.now() - t0;
    const alpha = Math.min(1, this.acc / TICK_DT);
    // Camera: own (predicted) hero, or a living teammate while dead (spectating).
    let cx = this.renderer.camX;
    let cy = this.renderer.camY + 6;
    let target = me && !me.dead && !me.gone ? me : undefined;
    if (!target) target = w.players.find((p) => !p.dead && !p.gone);
    if (me && !me.gone) {
      // Hide prediction corrections: render with the decaying error offset.
      e.px[me.ent] = e.px[me.ent]! + net.pred.errX;
      e.py[me.ent] = e.py[me.ent]! + net.pred.errY;
      e.x[me.ent] = e.x[me.ent]! + net.pred.errX;
      e.y[me.ent] = e.y[me.ent]! + net.pred.errY;
    }
    if (target) {
      const i = target.ent;
      cx = target === me ? e.px[i]! + (e.x[i]! - e.px[i]!) * alpha : e.x[i]!;
      cy = target === me ? e.py[i]! + (e.y[i]! - e.py[i]!) * alpha : e.y[i]!;
    }
    this.renderer.updateCamera(
      cx,
      cy - 6,
      w.floor.w * TILE,
      w.floor.h * TILE,
      dt,
      target ? e.x[target.ent]! - e.px[target.ent]! : 0,
      target ? e.y[target.ent]! - e.py[target.ent]! : 0,
    );
    const vr = this.renderer.visibleRect();
    this.tilemap!.cull(vr.x, vr.y, vr.w, vr.h);
    this.view!.sync(alpha, dt);
    if (me && !me.gone) {
      e.px[me.ent] = e.px[me.ent]! - net.pred.errX;
      e.py[me.ent] = e.py[me.ent]! - net.pred.errY;
      e.x[me.ent] = e.x[me.ent]! - net.pred.errX;
      e.y[me.ent] = e.y[me.ent]! - net.pred.errY;
    }
    this.fx.update(dt);
    this.renderer.render();
    this.updateHud();
    this.updatePrompt();
    this.stats.tick = w.tick;
    this.stats.entities = e.countAlive();
    const s = net.stats;
    this.stats.net = `ping ${s.ping}ms  ${s.snapsPerSec.toFixed(0)} snap/s  ${s.kbps.toFixed(1)} KB/s  corr ${s.err.toFixed(1)}px`;
  }

  private trackAttacker(): void {
    // Remember the closest live enemy when we get hurt (cheap heuristic for "killed by").
    const w = this.world;
    const ev = w.events;
    for (let k = 0; k < ev.n; k++) {
      if (ev.type[k] !== 10 || ev.a[k] !== 0) continue;
      const e = w.e;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < e.hi; i++) {
        if (!e.alive[i] || e.kind[i] !== Kind.Enemy) continue;
        const d = (e.x[i]! - ev.x[k]!) ** 2 + (e.y[i]! - ev.y[k]!) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) this.lastAttacker = getContent().enemies[e.def[best]!]?.id ?? '';
    }
  }

  private updateHud(): void {
    const w = this.world;
    const e = w.e;
    const p = w.players[this.localIndex];
    if (!p) return;
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
      if (e.kind[j] === Kind.Player) {
        const name = this.names[e.ref[j]!] ?? 'союзника';
        h.interact = { label: `Держите «руку»: поднять ${name}`, color: '#7fe3a0' };
      } else if (e.kind[j] === Kind.Pickup) {
        const item = w.drops[e.ref[j]!]?.item;
        if (item)
          h.interact = { label: `Взять: ${itemName(item)}`, color: RARITY_COLORS[item.rarity]! };
      } else if (e.kind[j] === Kind.Prop) {
        const k = e.def[j];
        if (k === PropKind.Chest) h.interact = { label: 'Открыть сундук', color: '#f2c94c' };
        else if (k === PropKind.Stairs) h.interact = { label: 'Спуститься', color: '#36c4b4' };
        else if (k === PropKind.Portal) h.interact = { label: 'Войти в портал', color: '#36c4b4' };
        else if (k === PropKind.Captive) {
          const npc = getContent().npcs[e.ref[j]!];
          const name = npc ? (contentRu[npc.nameKey] ?? npc.id) : '';
          h.interact = { label: `Освободить: ${name}`, color: '#f2c94c' };
        } else if (k === PropKind.Station) {
          const st = this.stations[e.ref[j]!];
          if (st) {
            const who = st.npc ? contentRu[st.npc.nameKey] : contentRu[st.nameKey];
            h.interact = { label: st.npc ? `Говорить: ${who}` : (who ?? ''), color: '#aaf6ec' };
          }
        } else if (k === PropKind.Shop) {
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
    const p = w.players[this.localIndex]!;
    let enemies = 0;
    for (let i = 0; i < e.hi; i++)
      if (e.alive[i] && e.kind[i] === Kind.Enemy && !(e.flags[i]! & EF.Dying)) enemies++;
    return {
      tick: w.tick,
      depth: w.depth,
      outcome: w.outcome,
      local: this.localIndex,
      players: w.players.map((q) => ({ x: e.x[q.ent]!, y: e.y[q.ent]!, dead: q.dead })),
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

  /** e2e/debug helper: finish the floor as if the stairs (or the exit portal) were used. */
  e2eFinishFloor(): void {
    const w = this.world;
    if (w.floor.isLast) storyEvent(w, `clear:${w.floor.biome}`);
    w.outcome = w.floor.isLast ? 'victory' : 'exit';
  }

  /** e2e/debug helper: free the captive of this floor (if one is here). Returns its NPC id. */
  e2eRescue(): string | null {
    const w = this.world;
    const e = w.e;
    for (let i = 0; i < e.hi; i++) {
      if (!e.alive[i] || e.kind[i] !== Kind.Prop || e.def[i] !== PropKind.Captive) continue;
      const npc = getContent().npcs[e.ref[i]!];
      if (!npc) return null;
      e.state[i] = 1;
      storyEvent(w, `rescue:${npc.id}`);
      return npc.id;
    }
    return null;
  }

  /** Enemy id that last damaged the local player (hardcore memorial). */
  lastHitBy(): string {
    return this.lastAttacker;
  }

  private lastAttacker = '';

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
    for (const s of this.npcSheets.values()) s.destroy();
    for (const s of this.npcByIndex.values()) s.destroy();
    this.renderer.destroy();
  }
}

export { Kind };
