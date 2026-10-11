import type { Appearance } from '@ao/content';
import {
  BinReader,
  BinWriter,
  MsgType,
  TICK_RATE,
  writeInputPacket,
  type PlayerInput,
} from '@ao/shared';
import {
  Ev,
  Predictor,
  SnapshotDecoder,
  createMirrorWorld,
  statsFor,
  type EventBuffer,
  type NetEvent,
  type NetRunResult,
  type Progress,
  type ServerMsg,
  type SimPlayer,
  type World,
} from '@ao/sim';
import type { Party } from './party';

/** Render this many ticks behind the newest server state (snapshots come every 2 ticks). */
const INTERP_TICKS = 4;

type FloorMsg = Extract<ServerMsg, { t: 'floor' }>;
type VoteMsg = Extract<ServerMsg, { t: 'vote' }>;

export interface NetRunHooks {
  floor(world: World, msg: FloorMsg): void;
  vote(msg: VoteMsg): void;
  result(result: NetRunResult): void;
  runEnd(): void;
  error(code: string): void;
}

export interface NetStats {
  ping: number;
  /** Received bytes per second (snapshots). */
  kbps: number;
  /** Last prediction correction (px). */
  err: number;
  snapsPerSec: number;
}

/** Own-player events played as soon as they arrive (feel), the rest at render time. */
const OWN_EVENTS = new Set<number>([
  Ev.Swing,
  Ev.Shoot,
  Ev.Dash,
  Ev.Skill,
  Ev.PlayerHurt,
  Ev.Heal,
  Ev.Pickup,
  Ev.Coin,
]);

/**
 * Client side of a networked run: mirrors the server world from snapshots, predicts the local
 * player, sends input changes and keeps a render clock a few ticks behind the server so other
 * entities interpolate smoothly. The GameHost renders `world` exactly like a local one.
 */
export class NetRun {
  world: World | null = null;
  floorMsg: FloorMsg | null = null;
  local = -1;
  names: string[] = [];
  appearances: Appearance[] = [];
  dec = new SnapshotDecoder();
  pred = new Predictor();
  readonly stats: NetStats = { ping: 0, kbps: 0, err: 0, snapsPerSec: 0 };
  /** Fractional server tick being rendered. */
  renderTick = 0;
  private offset: number | null = null;
  private events: NetEvent[] = [];
  private lastSend = 0;
  private out = new BinWriter(256);
  private started = false;
  private bytes = 0;
  private snaps = 0;
  private statAt = 0;

  constructor(
    private party: Party,
    private progress: Progress,
    private hooks: NetRunHooks,
  ) {}

  get me(): SimPlayer | undefined {
    return this.world?.players[this.local];
  }

  /** Apply everything received since the last frame. */
  pump(nowMs: number): void {
    for (const m of this.party.takeRunMessages()) {
      if (m instanceof Uint8Array) this.onSnapshot(m, nowMs);
      else this.onJson(m);
    }
    if (nowMs - this.statAt >= 1000) {
      const sec = (nowMs - this.statAt) / 1000;
      this.stats.kbps = this.bytes / 1024 / sec;
      this.stats.snapsPerSec = this.snaps / sec;
      this.bytes = 0;
      this.snaps = 0;
      this.statAt = nowMs;
    }
    this.stats.ping = this.party.state.ping;
    this.stats.err = this.pred.lastError;
  }

  private onJson(m: ServerMsg): void {
    switch (m.t) {
      case 'floor': {
        const w = createMirrorWorld(m.run, m.depth, m.players, m.shop);
        this.world = w;
        this.floorMsg = m;
        this.local = m.you;
        this.names = [];
        this.appearances = [];
        for (const p of m.players) {
          this.names[p.index] = p.name;
          this.appearances[p.index] = p.appearance;
        }
        this.dec = new SnapshotDecoder();
        this.events = [];
        this.offset = null;
        this.renderTick = 0;
        this.started = false;
        this.pred.resend();
        const me = w.players[this.local];
        if (me) {
          me.progress = this.progress;
          me.stats = statsFor(me.loadout, this.progress);
        }
        this.hooks.floor(w, m);
        this.party.send({ t: 'ready' });
        return;
      }
      case 'look': {
        const p = this.world?.players[m.index];
        if (p) p.loadout = m.loadout;
        return;
      }
      case 'inv': {
        const p = this.me;
        if (!p) return;
        p.bag = m.bag;
        p.loadout = m.loadout;
        p.potions = m.potions;
        p.stats = statsFor(m.loadout, this.progress);
        return;
      }
      case 'vote':
        this.hooks.vote(m);
        return;
      case 'result':
        this.party.send({ t: 'ack' });
        this.hooks.result(m.result);
        return;
      case 'runEnd':
        this.hooks.runEnd();
        return;
      case 'error':
        this.hooks.error(m.code);
        return;
      default:
        return;
    }
  }

  private onSnapshot(bytes: Uint8Array, nowMs: number): void {
    const w = this.world;
    if (!w) return;
    this.bytes += bytes.length;
    this.snaps++;
    const r = new BinReader(bytes);
    if (r.u8() !== MsgType.Snapshot) return;
    const tick = this.dec.apply(r, w);
    const me = this.me;
    if (me) {
      if (!this.started) {
        // First snapshot of the floor: start predicting from the server position.
        this.started = true;
        this.dec.localSlot = me.ent;
        w.e.px[me.ent] = w.e.x[me.ent]!;
        w.e.py[me.ent] = w.e.y[me.ent]!;
      } else if (this.dec.hasSelf) {
        this.pred.reconcile(w, me, this.dec.self);
      }
      this.dec.localSlot = me.ent;
    }
    for (const ev of this.dec.events) this.events.push(ev);
    this.dec.events.length = 0;
    // Server clock estimate: the least delayed snapshot wins; drift down slowly.
    const sample = tick - (nowMs * TICK_RATE) / 1000;
    if (this.offset === null || sample > this.offset) this.offset = sample;
  }

  /** Estimated current server tick. */
  serverTick(nowMs: number): number {
    if (this.offset === null) return 0;
    return (nowMs * TICK_RATE) / 1000 + this.offset;
  }

  /** One local 30 Hz tick: predict the local player with this input, queue changes. */
  localTick(input: PlayerInput): void {
    const w = this.world;
    const me = this.me;
    if (!w || !me || !this.started) return;
    this.pred.tick(w, me, input);
    this.dec.tickCounters(w.e);
    // Keep the clock offset honest when snapshots stall (decays half a tick per second).
    if (this.offset !== null) this.offset -= 0.5 / TICK_RATE;
  }

  /** Send pending input changes when it is time (≤ 10 packets/s, presses sooner). */
  flushInput(nowMs: number): void {
    const changes = this.pred.flush(nowMs, this.lastSend);
    if (!changes) return;
    this.lastSend = nowMs;
    this.out.reset();
    writeInputPacket(this.out, changes);
    this.party.sendBinary(this.out.toBytes());
  }

  /** Before rendering: interpolate remote entities and collect due events into `ev`. */
  prepareRender(nowMs: number, dt: number, ev: EventBuffer): void {
    const w = this.world;
    if (!w) return;
    const target = this.serverTick(nowMs) - INTERP_TICKS;
    // Never go backwards; catch up smoothly if far behind.
    this.renderTick = Math.max(this.renderTick, Math.min(target, this.dec.tick));
    if (target - this.renderTick > 15) this.renderTick = target;
    const me = this.me;
    this.dec.flushRemovals(w.e, this.renderTick);
    this.dec.interpolate(w.e, this.renderTick, me ? me.ent : -1);
    this.pred.decay(dt);
    ev.clear();
    let keep = 0;
    for (let k = 0; k < this.events.length; k++) {
      const e = this.events[k]!;
      const own = e.a === this.local && OWN_EVENTS.has(e.type);
      if (own || e.tick <= this.renderTick + 0.5) ev.push(e.type as Ev, e.x, e.y, e.a, e.b, e.v);
      else this.events[keep++] = e;
    }
    this.events.length = keep;
  }

  /** Tab hidden / overlay opened: tell the server we stopped (it repeats the last input). */
  sendIdle(nowMs: number): void {
    this.localTick({ mx: 0, my: 0, aim: 0, buttons: 0 });
    this.lastSend = 0;
    this.flushInput(nowMs);
  }
}
