import type { BinReader, BinWriter } from '@ao/shared';
import { MsgType, angleToByte, byteToAngle } from '@ao/shared';
import { Kind, PickupKind, type Entities } from '../entities';
import type { EventBuffer } from '../events';
import type { Outcome, SimPlayer, World } from '../world';

/**
 * Delta snapshots (server → client).
 *
 * The server keeps, per client, its *belief* of what the client knows (`belief[field][slot]`).
 * A snapshot sends only the fields whose actual value differs from that belief. Counters that
 * change predictably (timers counting down, `stateT` counting up) are advanced on both sides
 * by the same rule, so they cost nothing until something resets them. The WebSocket is reliable
 * and ordered, so every snapshot is a delta against the previous one; a reconnect starts with a
 * full snapshot. All values are integers (positions in 1/8 px, angles in bytes).
 */

/** Replicated entity fields (bit index in the change mask). */
export const F = {
  X: 0,
  Y: 1,
  Face: 2,
  State: 3,
  Hp: 4,
  MaxHp: 5,
  Flags: 6,
  StateT: 7,
  Life: 8,
  Timer: 9,
  Iframes: 10,
  HitFlash: 11,
  SlowT: 12,
  BurnT: 13,
  Cooldown: 14,
  Ref: 15,
  R: 16,
  Def: 17,
} as const;
export const NF = 18;

const ABS = 0;
const UP = 1;
const DOWN = 2;
const FIELD_RULE = [
  ABS, // X
  ABS, // Y
  ABS, // Face
  ABS, // State
  ABS, // Hp
  ABS, // MaxHp
  ABS, // Flags
  UP, // StateT
  DOWN, // Life
  DOWN, // Timer
  DOWN, // Iframes
  DOWN, // HitFlash
  DOWN, // SlowT
  DOWN, // BurnT
  ABS, // Cooldown
  ABS, // Ref
  ABS, // R
  ABS, // Def
];

const b = (...fields: number[]) => fields.reduce((m, f) => m | (1 << f), 0);
/** Fields the client actually uses per entity kind (others are not replicated). */
const KIND_FIELDS: Record<number, number> = {
  [Kind.Player]: b(
    F.X,
    F.Y,
    F.Face,
    F.Hp,
    F.MaxHp,
    F.Flags,
    F.Iframes,
    F.HitFlash,
    F.SlowT,
    F.BurnT,
    F.Ref,
    F.R,
  ),
  [Kind.Enemy]: b(
    F.X,
    F.Y,
    F.Face,
    F.State,
    F.Hp,
    F.MaxHp,
    F.Flags,
    F.StateT,
    F.Life,
    F.HitFlash,
    F.SlowT,
    F.BurnT,
    F.Cooldown,
    F.Ref,
    F.R,
    F.Def,
  ),
  [Kind.Projectile]: b(F.X, F.Y, F.Face, F.Def, F.R),
  [Kind.Pickup]: b(F.X, F.Y, F.Def, F.Ref, F.R),
  [Kind.Area]: b(F.X, F.Y, F.R, F.Life, F.Timer, F.Ref, F.Def),
  [Kind.Prop]: b(F.X, F.Y, F.State, F.Def, F.Ref, F.R),
  [Kind.Ally]: b(F.X, F.Y, F.Face, F.Def),
};

function expected(rule: number, prev: number, dt: number): number {
  if (rule === UP) return prev + dt;
  if (rule === DOWN) return prev > 0 ? Math.max(0, prev - dt) : prev;
  return prev;
}

function quantize(e: Entities, f: number, i: number): number {
  switch (f) {
    case F.X:
      return Math.round(e.x[i]! * 8);
    case F.Y:
      return Math.round(e.y[i]! * 8);
    case F.Face:
      return angleToByte(e.face[i]!);
    case F.State:
      return e.state[i]!;
    case F.Hp:
      return Math.ceil(e.hp[i]!);
    case F.MaxHp:
      return Math.ceil(e.maxHp[i]!);
    case F.Flags:
      return e.flags[i]! | 0;
    case F.StateT:
      return e.stateT[i]!;
    case F.Life:
      return e.life[i]!;
    case F.Timer:
      return e.timer[i]!;
    case F.Iframes:
      return e.iframes[i]!;
    case F.HitFlash:
      return e.hitFlash[i]!;
    case F.SlowT:
      return e.slowT[i]!;
    case F.BurnT:
      return e.burnT[i]!;
    case F.Cooldown:
      return e.cooldown[i]!;
    case F.Ref:
      return e.ref[i]!;
    case F.R:
      return Math.round(e.r[i]! * 4);
    case F.Def:
      return e.def[i]!;
    default:
      return 0;
  }
}

/** Server: quantized field values of the current tick, computed once for all clients. */
export class FieldCapture {
  readonly v: Int32Array[];
  hi = 0;
  constructor(readonly cap = 1024) {
    this.v = [];
    for (let f = 0; f < NF; f++) this.v.push(new Int32Array(cap));
  }
  capture(e: Entities): void {
    this.hi = e.hi;
    for (let i = 0; i < e.hi; i++) {
      if (!e.alive[i]) continue;
      const mask = KIND_FIELDS[e.kind[i]!] ?? 0;
      for (let f = 0; f < NF; f++) if (mask & (1 << f)) this.v[f]![i] = quantize(e, f, i);
    }
  }
}

/** Server: sim events accumulated between two snapshots (shared by all clients). */
export class EventLog {
  n = 0;
  tick = new Int32Array(1024);
  type = new Uint8Array(1024);
  x = new Float32Array(1024);
  y = new Float32Array(1024);
  a = new Int32Array(1024);
  b = new Int32Array(1024);
  v = new Float32Array(1024);
  append(ev: EventBuffer, tick: number): void {
    for (let k = 0; k < ev.n && this.n < this.tick.length; k++) {
      const j = this.n++;
      this.tick[j] = tick;
      this.type[j] = ev.type[k]!;
      this.x[j] = ev.x[k]!;
      this.y[j] = ev.y[k]!;
      this.a[j] = ev.a[k]!;
      this.b[j] = ev.b[k]!;
      this.v[j] = ev.v[k]!;
    }
  }
  clear(): void {
    this.n = 0;
  }
}

const OUTCOMES: Outcome[] = ['playing', 'exit', 'victory', 'dead'];

/** Private per-player state the owner needs (HUD + prediction/reconciliation). */
export interface NetSelf {
  /** Last input sequence number the server applied (-1 = none yet). */
  ack: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  dashT: number;
  dashDx: number;
  dashDy: number;
  dashSpeed: number;
  dashCharges: number;
  dashRecharge: number;
  slowT: number;
  prevButtons: number;
  /** Move speed bonus of active buffs (stats come from the loadout). */
  buffSpeed: number;
  gold: number;
  potions: number;
  skillCd: [number, number];
  skillCdMax: [number, number];
  interact: number;
  shield: number;
  xp: number;
  kills: number;
}

export function emptyNetSelf(): NetSelf {
  return {
    ack: -1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    dashT: 0,
    dashDx: 0,
    dashDy: 0,
    dashSpeed: 0,
    dashCharges: 0,
    dashRecharge: 0,
    slowT: 0,
    prevButtons: 0,
    buffSpeed: 0,
    gold: 0,
    potions: 0,
    skillCd: [0, 0],
    skillCdMax: [1, 1],
    interact: -1,
    shield: 0,
    xp: 0,
    kills: 0,
  };
}

const PB_DEAD = 1;
const PB_GONE = 2;
const PB_MOVING = 4;
const PB_DASH = 8;
const PB_DASHDMG = 16;
const PB_SHIELD = 32;
const PB_HARDCORE = 64;

const OP_UPDATE = 0;
const OP_CREATE = 1;
const OP_REMOVE = 2;

/** Server: one per connected client. */
export class SnapshotEncoder {
  private belief: Int32Array[] = [];
  private known: Uint8Array;
  private knownGen: Uint16Array;
  private knownKind: Uint8Array;
  private hi = 0;
  private lastTick = 0;
  private full = true;
  private rooms: Uint8Array | null = null;
  private dyn: Uint8Array | null = null;
  private tiles: Uint8Array | null = null;
  private shopSold: Uint8Array | null = null;

  constructor(readonly cap = 1024) {
    for (let f = 0; f < NF; f++) this.belief.push(new Int32Array(cap));
    this.known = new Uint8Array(cap);
    this.knownGen = new Uint16Array(cap);
    this.knownKind = new Uint8Array(cap);
  }

  /** Next snapshot will be complete (new floor or reconnect). */
  reset(): void {
    this.full = true;
    this.known.fill(0);
    this.hi = 0;
    this.rooms = null;
    this.dyn = null;
    this.tiles = null;
    this.shopSold = null;
  }

  /**
   * Write a snapshot of `w` for player `viewer` (-1 = spectator without a body).
   * `cap` must have captured the current tick; `log` holds the events since the last snapshot.
   */
  encode(out: BinWriter, w: World, cap: FieldCapture, viewer: number, ack: number, log: EventLog) {
    const e = w.e;
    const full = this.full;
    const dt = full ? 0 : w.tick - this.lastTick;
    out
      .u8(MsgType.Snapshot)
      .u8(full ? 1 : 0)
      .varu(w.tick);

    // --- Entities
    let lastSlot = -1;
    const hi = Math.max(e.hi, this.hi);
    for (let i = 0; i < hi; i++) {
      const visible =
        i < e.hi &&
        e.alive[i] === 1 &&
        !(e.kind[i] === Kind.Pickup && e.owner[i]! >= 0 && e.owner[i] !== viewer);
      const was = this.known[i] === 1;
      if (!visible) {
        if (was) {
          out.varu(i - lastSlot).u8(OP_REMOVE);
          lastSlot = i;
          this.known[i] = 0;
        }
        continue;
      }
      const kind = e.kind[i]!;
      const fields = KIND_FIELDS[kind] ?? 0;
      const create = !was || this.knownGen[i] !== e.gen[i] || this.knownKind[i] !== kind;
      let mask = 0;
      for (let f = 0; f < NF; f++) {
        if (!(fields & (1 << f))) continue;
        const bel = create ? 0 : expected(FIELD_RULE[f]!, this.belief[f]![i]!, dt);
        this.belief[f]![i] = bel;
        if (cap.v[f]![i] !== bel) mask |= 1 << f;
      }
      if (!create && mask === 0) continue;
      out.varu(i - lastSlot);
      lastSlot = i;
      if (create) {
        out.u8(OP_CREATE).u8(kind).varu(e.gen[i]!);
        if (kind === Kind.Pickup) {
          out.vari(e.owner[i]!);
          const item = e.def[i] === PickupKind.Item ? w.drops[e.ref[i]!]?.item : null;
          if (item) out.u8(1).str(item.base).u8(item.rarity).varu(item.level);
          else out.u8(0);
        }
        this.known[i] = 1;
        this.knownGen[i] = e.gen[i]!;
        this.knownKind[i] = kind;
      } else out.u8(OP_UPDATE);
      out.varu(mask);
      for (let f = 0; f < NF; f++) {
        if (!(mask & (1 << f))) continue;
        const v = cap.v[f]![i]!;
        out.vari(v - this.belief[f]![i]!);
        this.belief[f]![i] = v;
      }
    }
    out.varu(0);
    this.hi = e.hi;

    // --- World
    const m = w.map;
    out.u8(w.keys);
    out.u8((w.stairsOpen ? 1 : 0) | (w.bossKilled ? 2 : 0) | (OUTCOMES.indexOf(w.outcome) << 2));
    out.vari(w.bossEnt);
    this.rooms ??= new Uint8Array(w.rooms.length).fill(255);
    this.dyn ??= new Uint8Array(m.dyn.length);
    this.tiles ??= new Uint8Array(w.floor.tiles);
    this.shopSold ??= new Uint8Array(w.shop.length);
    let n = 0;
    for (let k = 0; k < w.rooms.length; k++) if (this.rooms[k] !== w.rooms[k]!.state) n++;
    out.varu(n);
    for (let k = 0; k < w.rooms.length; k++) {
      const s = w.rooms[k]!.state;
      if (this.rooms[k] === s) continue;
      out.varu(k).u8(s);
      this.rooms[k] = s;
    }
    diffBytes(out, this.dyn, m.dyn);
    diffBytes(out, this.tiles, m.tiles);
    n = 0;
    for (let k = 0; k < w.shop.length; k++) if (w.shop[k]!.sold && !this.shopSold[k]) n++;
    out.varu(n);
    for (let k = 0; k < w.shop.length; k++) {
      if (!w.shop[k]!.sold || this.shopSold[k]) continue;
      out.varu(k);
      this.shopSold[k] = 1;
    }

    // --- Players (small: always complete)
    out.u8(w.players.length);
    for (const p of w.players) writePlayer(out, p);

    // --- Self
    const me = viewer >= 0 ? w.players[viewer] : undefined;
    if (me) {
      out.u8(1);
      writeSelf(out, w, me, ack);
    } else out.u8(0);

    // --- Events
    out.varu(log.n);
    for (let k = 0; k < log.n; k++) {
      out
        .varu(Math.max(0, w.tick - log.tick[k]!))
        .u8(log.type[k]!)
        .vari(Math.round(log.x[k]! * 2))
        .vari(Math.round(log.y[k]! * 2))
        .vari(log.a[k]!)
        .vari(log.b[k]!)
        .f32(log.v[k]!);
    }
    this.lastTick = w.tick;
    this.full = false;
  }
}

function diffBytes(out: BinWriter, belief: Uint8Array, actual: Uint8Array): void {
  let n = 0;
  for (let k = 0; k < actual.length; k++) if (belief[k] !== actual[k]) n++;
  out.varu(n);
  let last = 0;
  for (let k = 0; k < actual.length; k++) {
    if (belief[k] === actual[k]) continue;
    out.varu(k - last).u8(actual[k]!);
    last = k;
    belief[k] = actual[k]!;
  }
}

function readDiffBytes(r: BinReader, target: Uint8Array): number {
  const n = r.varu();
  let last = 0;
  for (let k = 0; k < n; k++) {
    last += r.varu();
    const v = r.u8();
    if (last < target.length) target[last] = v;
  }
  return n;
}

function writePlayer(out: BinWriter, p: SimPlayer): void {
  const bits =
    (p.dead ? PB_DEAD : 0) |
    (p.gone ? PB_GONE : 0) |
    (p.moving ? PB_MOVING : 0) |
    (p.dashT > 0 ? PB_DASH : 0) |
    (p.dashDamage > 0 ? PB_DASHDMG : 0) |
    (p.shield > 0 ? PB_SHIELD : 0) |
    (p.hardcore ? PB_HARDCORE : 0);
  out
    .varu(p.ent)
    .u8(bits)
    .u8(angleToByte(p.aim))
    .varu(Math.min(255, p.deathT))
    .u8(p.swingT)
    .u8(p.swingMax)
    .u8(Math.min(255, p.revive))
    .varu(p.buffs.length > 0 ? p.buffs[p.buffs.length - 1]!.color + 1 : 0)
    .varu(p.lookVersion);
}

function writeSelf(out: BinWriter, w: World, p: SimPlayer, ack: number): void {
  const e = w.e;
  const i = p.ent;
  out
    .vari(ack)
    .f64(e.x[i]!)
    .f64(e.y[i]!)
    .f64(e.vx[i]!)
    .f64(e.vy[i]!)
    .f32(e.kx[i]!)
    .f32(e.ky[i]!)
    .u8(p.dashT)
    .f32(p.dashDx)
    .f32(p.dashDy)
    .f32(p.dashSpeed)
    .u8(p.dashCharges)
    .u8(p.dashRecharge)
    .varu(Math.max(0, e.slowT[i]!))
    .u8(p.prevButtons)
    .f32(p.buffSpeed)
    .varu(p.gold)
    .u8(p.potions)
    .varu(p.skillCd[0])
    .varu(p.skillCd[1])
    .varu(p.skillCdMax[0])
    .varu(p.skillCdMax[1])
    .vari(p.interact)
    .varu(Math.ceil(p.shield))
    .varu(p.xp)
    .varu(p.kills);
}

/** A sim event received over the network (tick = server tick it happened on). */
export interface NetEvent {
  tick: number;
  type: number;
  x: number;
  y: number;
  a: number;
  b: number;
  v: number;
}

/** Info the client needs to draw an item pickup (the full item stays on the server). */
export interface NetDropInfo {
  base: string;
  rarity: number;
  level: number;
}

/**
 * Client: applies snapshots to a mirror World. Entity slots mirror the server's slots, so
 * events that reference entities work unchanged. Positions are kept as a two-sample history
 * per slot; `interpolate()` writes render positions for a given (fractional) tick.
 */
export class SnapshotDecoder {
  private belief: Int32Array[] = [];
  readonly known: Uint8Array;
  /** Interpolation history: older (a) and newer (b) samples. */
  readonly ax: Float64Array;
  readonly ay: Float64Array;
  readonly at: Float64Array;
  readonly bx: Float64Array;
  readonly by: Float64Array;
  readonly bt: Float64Array;
  /** Tick at which a removed entity should disappear (render time catches up), -1 = none. */
  readonly removeAt: Int32Array;
  tick = -1;
  prevTick = -1;
  readonly self: NetSelf = emptyNetSelf();
  hasSelf = false;
  readonly events: NetEvent[] = [];
  fullCount = 0;
  /** Entity slot of the locally predicted player: its position is never overwritten. */
  localSlot = -1;

  constructor(readonly cap = 1024) {
    for (let f = 0; f < NF; f++) this.belief.push(new Int32Array(cap));
    this.known = new Uint8Array(cap);
    this.ax = new Float64Array(cap);
    this.ay = new Float64Array(cap);
    this.at = new Float64Array(cap);
    this.bx = new Float64Array(cap);
    this.by = new Float64Array(cap);
    this.bt = new Float64Array(cap);
    this.removeAt = new Int32Array(cap).fill(-1);
  }

  /**
   * Apply one snapshot (reader positioned after the type byte). Players must already exist in
   * `w.players` (from the floor message). Returns the server tick.
   */
  apply(r: BinReader, w: World): number {
    const e = w.e;
    const flags = r.u8();
    const full = (flags & 1) !== 0;
    const tick = r.varu();
    const dt = this.tick < 0 || full ? 0 : tick - this.tick;
    this.prevTick = this.tick;
    this.tick = tick;
    if (full) {
      this.fullCount++;
      for (let i = 0; i < this.cap; i++) {
        if (this.known[i]) this.finishRemove(e, i);
        this.known[i] = 0;
        this.removeAt[i] = -1;
      }
    }

    // Advance predictable counters of every known entity.
    if (dt > 0) {
      for (let i = 0; i < e.hi; i++) {
        if (!this.known[i]) continue;
        const fields = KIND_FIELDS[e.kind[i]!] ?? 0;
        for (let f = 0; f < NF; f++) {
          if (!(fields & (1 << f)) || FIELD_RULE[f] === ABS) continue;
          this.belief[f]![i] = expected(FIELD_RULE[f]!, this.belief[f]![i]!, dt);
        }
      }
    }
    const touched = this.touchedScratch(e.hi);

    // --- Entities
    let slot = -1;
    for (;;) {
      const d = r.varu();
      if (d === 0) break;
      slot += d;
      const i = slot;
      if (i >= this.cap) throw new RangeError('snapshot slot out of range');
      const op = r.u8();
      if (op === OP_REMOVE) {
        if (this.known[i]) {
          this.known[i] = 0;
          this.removeAt[i] = tick;
        }
        continue;
      }
      if (op === OP_CREATE) {
        if (this.known[i] || this.removeAt[i]! >= 0) this.finishRemove(e, i);
        const kind = r.u8();
        const gen = r.varu();
        e.alive[i] = 1;
        e.kind[i] = kind;
        e.gen[i] = gen;
        if (i >= e.hi) e.hi = i + 1;
        resetEntity(e, i);
        for (let f = 0; f < NF; f++) this.belief[f]![i] = 0;
        let info: NetDropInfo | null = null;
        if (kind === Kind.Pickup) {
          e.owner[i] = r.vari();
          if (r.u8() === 1) info = { base: r.str(), rarity: r.u8(), level: r.varu() };
        }
        this.known[i] = 1;
        this.removeAt[i] = -1;
        const mask = r.varu();
        this.readFields(r, i, mask);
        this.writeEntity(e, i, mask | (1 << F.X) | (1 << F.Y));
        if (info) {
          w.drops[e.ref[i]!] = {
            item: {
              uid: `net${i}`,
              base: info.base,
              rarity: info.rarity,
              level: info.level,
              affixes: [],
              seed: 0,
            },
            amount: 1,
            owner: e.owner[i]!,
          };
        }
        this.ax[i] = this.bx[i] = e.x[i]!;
        this.ay[i] = this.by[i] = e.y[i]!;
        this.at[i] = this.bt[i] = tick;
        touched[i] = 1;
        continue;
      }
      const mask = r.varu();
      this.readFields(r, i, mask);
      this.writeEntity(e, i, mask);
    }
    // Shift interpolation history for every known entity (positions of untouched ones repeat).
    for (let i = 0; i < e.hi; i++) {
      if (!this.known[i] || touched[i]) continue;
      this.ax[i] = this.bx[i]!;
      this.ay[i] = this.by[i]!;
      this.at[i] = this.bt[i]!;
      this.bx[i] = this.belief[F.X]![i]! / 8;
      this.by[i] = this.belief[F.Y]![i]! / 8;
      this.bt[i] = tick;
    }
    // Counters of known entities follow the beliefs (render copy).
    for (let i = 0; i < e.hi; i++) {
      if (!this.known[i]) continue;
      this.writeEntity(e, i, COUNTER_MASK);
    }

    // --- World
    w.keys = r.u8();
    const wb = r.u8();
    w.stairsOpen = (wb & 1) !== 0;
    w.bossKilled = (wb & 2) !== 0;
    w.outcome = OUTCOMES[(wb >> 2) & 3] ?? 'playing';
    w.bossEnt = r.vari();
    const nr = r.varu();
    for (let k = 0; k < nr; k++) {
      const idx = r.varu();
      const s = r.u8();
      const rs = w.rooms[idx];
      if (rs) rs.state = s;
    }
    readDiffBytes(r, w.map.dyn);
    readDiffBytes(r, w.map.tiles);
    const ns = r.varu();
    for (let k = 0; k < ns; k++) {
      const s = w.shop[r.varu()];
      if (s) s.sold = true;
    }

    // --- Players
    const np = r.u8();
    for (let k = 0; k < np; k++) {
      const p = w.players[k];
      readPlayer(r, p);
    }

    // --- Self
    this.hasSelf = r.u8() === 1;
    if (this.hasSelf) readSelf(r, this.self);

    // --- Events
    const ne = r.varu();
    for (let k = 0; k < ne; k++) {
      const ago = r.varu();
      this.events.push({
        tick: tick - ago,
        type: r.u8(),
        x: r.vari() / 2,
        y: r.vari() / 2,
        a: r.vari(),
        b: r.vari(),
        v: r.f32(),
      });
    }
    w.tick = tick;
    return tick;
  }

  private touched = new Uint8Array(0);
  private touchedScratch(n: number): Uint8Array {
    if (this.touched.length < this.cap) this.touched = new Uint8Array(this.cap);
    this.touched.fill(0, 0, Math.max(n, this.cap));
    return this.touched;
  }

  private readFields(r: BinReader, i: number, mask: number): void {
    for (let f = 0; f < NF; f++) {
      if (!(mask & (1 << f))) continue;
      this.belief[f]![i] = this.belief[f]![i]! + r.vari();
    }
  }

  /** Copy believed fields into the render entity (positions only on create; see interpolate). */
  private writeEntity(e: Entities, i: number, mask: number): void {
    const v = this.belief;
    for (let f = 0; f < NF; f++) {
      if (!(mask & (1 << f))) continue;
      const x = v[f]![i]!;
      switch (f) {
        case F.X:
          if (i === this.localSlot) break;
          e.x[i] = x / 8;
          e.px[i] = e.x[i]!;
          break;
        case F.Y:
          if (i === this.localSlot) break;
          e.y[i] = x / 8;
          e.py[i] = e.y[i]!;
          break;
        case F.Face:
          e.face[i] = byteToAngle(x);
          break;
        case F.State:
          e.state[i] = x;
          break;
        case F.Hp:
          e.hp[i] = x;
          break;
        case F.MaxHp:
          e.maxHp[i] = x;
          break;
        case F.Flags:
          e.flags[i] = x >>> 0;
          break;
        case F.StateT:
          e.stateT[i] = x;
          break;
        case F.Life:
          e.life[i] = x;
          break;
        case F.Timer:
          e.timer[i] = x;
          break;
        case F.Iframes:
          e.iframes[i] = x;
          break;
        case F.HitFlash:
          e.hitFlash[i] = x;
          break;
        case F.SlowT:
          e.slowT[i] = x;
          break;
        case F.BurnT:
          e.burnT[i] = x;
          break;
        case F.Cooldown:
          e.cooldown[i] = x;
          break;
        case F.Ref:
          e.ref[i] = x;
          break;
        case F.R:
          e.r[i] = x / 4;
          break;
        case F.Def:
          e.def[i] = x;
          break;
      }
    }
  }

  private finishRemove(e: Entities, i: number): void {
    this.removeAt[i] = -1;
    if (e.alive[i]) {
      e.alive[i] = 0;
      // Keep kind/def: late events (e.g. a hit on something that just died) still resolve.
    }
  }

  /** Remove entities whose removal tick has been reached by the render clock. */
  flushRemovals(e: Entities, renderTick: number): void {
    for (let i = 0; i < e.hi; i++) {
      const t = this.removeAt[i]!;
      if (t >= 0 && renderTick >= t - 1) this.finishRemove(e, i);
    }
  }

  /** Write interpolated positions for `renderTick` into x/px (skip = predicted local entity). */
  interpolate(e: Entities, renderTick: number, skip: number): void {
    for (let i = 0; i < e.hi; i++) {
      if (!e.alive[i] || i === skip) continue;
      const t0 = this.at[i]!;
      const t1 = this.bt[i]!;
      let x: number;
      let y: number;
      if (t1 <= t0 || renderTick >= t1) {
        x = this.bx[i]!;
        y = this.by[i]!;
      } else if (renderTick <= t0) {
        x = this.ax[i]!;
        y = this.ay[i]!;
      } else {
        const k = (renderTick - t0) / (t1 - t0);
        x = this.ax[i]! + (this.bx[i]! - this.ax[i]!) * k;
        y = this.ay[i]! + (this.by[i]! - this.ay[i]!) * k;
      }
      // Velocity estimate for animations (px/s).
      const span = (t1 - t0) / 30;
      e.vx[i] = span > 0 ? (this.bx[i]! - this.ax[i]!) / span : 0;
      e.vy[i] = span > 0 ? (this.by[i]! - this.ay[i]!) / span : 0;
      e.x[i] = x;
      e.y[i] = y;
      e.px[i] = x;
      e.py[i] = y;
    }
  }

  /** Advance render counters by one tick between snapshots (animations keep running). */
  tickCounters(e: Entities): void {
    for (let i = 0; i < e.hi; i++) {
      if (!e.alive[i]) continue;
      e.stateT[i]!++;
      if (e.life[i]! > 0) e.life[i]!--;
      if (e.timer[i]! > 0) e.timer[i]!--;
      if (e.iframes[i]! > 0) e.iframes[i]!--;
      if (e.hitFlash[i]! > 0) e.hitFlash[i]!--;
      if (e.slowT[i]! > 0) e.slowT[i]!--;
      if (e.burnT[i]! > 0) e.burnT[i]!--;
    }
  }
}

const COUNTER_MASK =
  (1 << F.StateT) |
  (1 << F.Life) |
  (1 << F.Timer) |
  (1 << F.Iframes) |
  (1 << F.HitFlash) |
  (1 << F.SlowT) |
  (1 << F.BurnT);

function resetEntity(e: Entities, i: number): void {
  e.def[i] = 0;
  e.flags[i] = 0;
  e.x[i] = 0;
  e.y[i] = 0;
  e.px[i] = 0;
  e.py[i] = 0;
  e.vx[i] = 0;
  e.vy[i] = 0;
  e.kx[i] = 0;
  e.ky[i] = 0;
  e.r[i] = 0;
  e.hp[i] = 0;
  e.maxHp[i] = 0;
  e.face[i] = 0;
  e.state[i] = 0;
  e.stateT[i] = 0;
  e.timer[i] = 0;
  e.cooldown[i] = 0;
  e.life[i] = 0;
  e.iframes[i] = 0;
  e.hitFlash[i] = 0;
  e.owner[i] = -1;
  e.room[i] = -1;
  e.slowT[i] = 0;
  e.burnT[i] = 0;
  e.ref[i] = 0;
}

function readPlayer(r: BinReader, p: SimPlayer | undefined): void {
  const ent = r.varu();
  const bits = r.u8();
  const aim = byteToAngle(r.u8());
  const deathT = r.varu();
  const swingT = r.u8();
  const swingMax = r.u8();
  const revive = r.u8();
  const buff = r.varu();
  const look = r.varu();
  if (!p) return;
  p.ent = ent;
  p.dead = (bits & PB_DEAD) !== 0;
  p.gone = (bits & PB_GONE) !== 0;
  p.moving = (bits & PB_MOVING) !== 0;
  p.dashT = bits & PB_DASH ? Math.max(1, p.dashT) : 0;
  p.dashDamage = bits & PB_DASHDMG ? 1 : 0;
  p.hardcore = (bits & PB_HARDCORE) !== 0;
  if (!(bits & PB_SHIELD)) p.shield = 0;
  else if (p.shield <= 0) p.shield = 1;
  p.aim = aim;
  p.deathT = deathT;
  p.swingT = swingT;
  p.swingMax = Math.max(1, swingMax);
  p.revive = revive;
  if (buff > 0) {
    if (p.buffs.length === 0)
      p.buffs.push({ damagePct: 0, attackSpeedPct: 0, moveSpeedPct: 0, ticks: 1, color: 0 });
    p.buffs[0]!.color = buff - 1;
  } else p.buffs.length = 0;
  p.lookVersion = look;
}

function readSelf(r: BinReader, s: NetSelf): void {
  s.ack = r.vari();
  s.x = r.f64();
  s.y = r.f64();
  s.vx = r.f64();
  s.vy = r.f64();
  s.kx = r.f32();
  s.ky = r.f32();
  s.dashT = r.u8();
  s.dashDx = r.f32();
  s.dashDy = r.f32();
  s.dashSpeed = r.f32();
  s.dashCharges = r.u8();
  s.dashRecharge = r.u8();
  s.slowT = r.varu();
  s.prevButtons = r.u8();
  s.buffSpeed = r.f32();
  s.gold = r.varu();
  s.potions = r.u8();
  s.skillCd[0] = r.varu();
  s.skillCd[1] = r.varu();
  s.skillCdMax[0] = r.varu();
  s.skillCdMax[1] = r.varu();
  s.interact = r.vari();
  s.shield = r.varu();
  s.xp = r.varu();
  s.kills = r.varu();
}

/** Copy authoritative self state into the mirror player (before replaying unacked inputs). */
export function applyNetSelf(w: World, p: SimPlayer, s: NetSelf): void {
  const e = w.e;
  const i = p.ent;
  e.x[i] = s.x;
  e.y[i] = s.y;
  e.vx[i] = s.vx;
  e.vy[i] = s.vy;
  e.kx[i] = s.kx;
  e.ky[i] = s.ky;
  e.slowT[i] = s.slowT;
  p.dashT = s.dashT;
  p.dashDx = s.dashDx;
  p.dashDy = s.dashDy;
  p.dashSpeed = s.dashSpeed;
  p.dashCharges = s.dashCharges;
  p.dashRecharge = s.dashRecharge;
  p.prevButtons = s.prevButtons;
  p.buffSpeed = s.buffSpeed;
  p.gold = s.gold;
  p.potions = s.potions;
  p.skillCd[0] = s.skillCd[0];
  p.skillCd[1] = s.skillCd[1];
  p.skillCdMax[0] = s.skillCdMax[0];
  p.skillCdMax[1] = s.skillCdMax[1];
  p.interact = s.interact;
  p.shield = s.shield;
  p.xp = s.xp;
  p.kills = s.kills;
}
