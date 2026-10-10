/**
 * Struct-of-arrays entity storage. Fixed capacity, free-list reuse, zero allocations per tick.
 * An entity "handle" is its index; `gen` changes on reuse so stale references can be detected.
 */
export const Kind = {
  None: 0,
  Player: 1,
  Enemy: 2,
  Projectile: 3,
  Pickup: 4,
  Area: 5,
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export const Team = {
  Players: 0,
  Enemies: 1,
  Neutral: 2,
} as const;

export const EF = {
  /** Ignores pits (bats, ghosts, projectiles). */
  Flying: 1 << 0,
  /** Passes through walls. */
  Phasing: 1 << 1,
  /** Cannot take damage. */
  Invulnerable: 1 << 2,
  /** Pushes other bodies (enemies/players separate from each other). */
  Body: 1 << 3,
  /** Boss/miniboss (UI bar, knockback resistance). */
  Boss: 1 << 4,
  /** Dead but kept for the death animation. */
  Dying: 1 << 5,
} as const;

export class Entities {
  readonly cap: number;
  /** Highest used index + 1 (iterate 0..hi). */
  hi = 0;
  alive: Uint8Array;
  kind: Uint8Array;
  gen: Uint16Array;
  def: Uint16Array;
  team: Uint8Array;
  flags: Uint32Array;
  x: Float64Array;
  y: Float64Array;
  /** Position at the previous tick (render interpolation). */
  px: Float64Array;
  py: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Knockback velocity, decays every tick. */
  kx: Float32Array;
  ky: Float32Array;
  r: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  face: Float32Array;
  state: Uint8Array;
  stateT: Int32Array;
  timer: Int32Array;
  cooldown: Int32Array;
  life: Int32Array;
  iframes: Int16Array;
  hitFlash: Uint8Array;
  owner: Int32Array;
  room: Int16Array;
  dmg: Float32Array;
  pierce: Uint8Array;
  aux0: Float32Array;
  aux1: Float32Array;
  aux2: Float32Array;
  slowT: Int16Array;
  burnT: Int16Array;
  stunT: Int16Array;
  /** Index into a per-kind side table (player index, attack slot, etc.). */
  ref: Int16Array;
  private freeList: Int32Array;
  private freeCount = 0;

  constructor(cap = 1024) {
    this.cap = cap;
    this.alive = new Uint8Array(cap);
    this.kind = new Uint8Array(cap);
    this.gen = new Uint16Array(cap);
    this.def = new Uint16Array(cap);
    this.team = new Uint8Array(cap);
    this.flags = new Uint32Array(cap);
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.px = new Float64Array(cap);
    this.py = new Float64Array(cap);
    this.vx = new Float64Array(cap);
    this.vy = new Float64Array(cap);
    this.kx = new Float32Array(cap);
    this.ky = new Float32Array(cap);
    this.r = new Float32Array(cap);
    this.hp = new Float32Array(cap);
    this.maxHp = new Float32Array(cap);
    this.face = new Float32Array(cap);
    this.state = new Uint8Array(cap);
    this.stateT = new Int32Array(cap);
    this.timer = new Int32Array(cap);
    this.cooldown = new Int32Array(cap);
    this.life = new Int32Array(cap);
    this.iframes = new Int16Array(cap);
    this.hitFlash = new Uint8Array(cap);
    this.owner = new Int32Array(cap);
    this.room = new Int16Array(cap);
    this.dmg = new Float32Array(cap);
    this.pierce = new Uint8Array(cap);
    this.aux0 = new Float32Array(cap);
    this.aux1 = new Float32Array(cap);
    this.aux2 = new Float32Array(cap);
    this.slowT = new Int16Array(cap);
    this.burnT = new Int16Array(cap);
    this.stunT = new Int16Array(cap);
    this.ref = new Int16Array(cap);
    this.freeList = new Int32Array(cap);
  }

  /** Allocate an entity; returns -1 when full (callers must tolerate it, e.g. drop a particle). */
  spawn(kind: Kind, x: number, y: number): number {
    let i: number;
    if (this.freeCount > 0) i = this.freeList[--this.freeCount]!;
    else if (this.hi < this.cap) i = this.hi++;
    else return -1;
    this.alive[i] = 1;
    this.kind[i] = kind;
    this.gen[i] = (this.gen[i]! + 1) & 0xffff;
    this.def[i] = 0;
    this.team[i] = Team.Neutral;
    this.flags[i] = 0;
    this.x[i] = x;
    this.y[i] = y;
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.kx[i] = 0;
    this.ky[i] = 0;
    this.r[i] = 4;
    this.hp[i] = 1;
    this.maxHp[i] = 1;
    this.face[i] = 0;
    this.state[i] = 0;
    this.stateT[i] = 0;
    this.timer[i] = 0;
    this.cooldown[i] = 0;
    this.life[i] = -1;
    this.iframes[i] = 0;
    this.hitFlash[i] = 0;
    this.owner[i] = -1;
    this.room[i] = -1;
    this.dmg[i] = 0;
    this.pierce[i] = 0;
    this.aux0[i] = 0;
    this.aux1[i] = 0;
    this.aux2[i] = 0;
    this.slowT[i] = 0;
    this.burnT[i] = 0;
    this.stunT[i] = 0;
    this.ref[i] = -1;
    return i;
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.kind[i] = Kind.None;
    this.freeList[this.freeCount++] = i;
  }

  /** Number of live entities (O(n), for debug overlay only). */
  countAlive(): number {
    let n = 0;
    for (let i = 0; i < this.hi; i++) n += this.alive[i]!;
    return n;
  }
}
