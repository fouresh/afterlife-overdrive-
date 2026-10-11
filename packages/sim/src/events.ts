/**
 * Fixed-size event buffer filled during a tick and drained by the client (sound, particles,
 * screen shake) or serialized by the server. No allocations.
 */
export const Ev = {
  Hit: 1,
  Death: 2,
  Shoot: 3,
  Swing: 4,
  Dash: 5,
  Pickup: 6,
  DoorsClose: 7,
  DoorsOpen: 8,
  RoomCleared: 9,
  PlayerHurt: 10,
  PlayerDown: 11,
  Skill: 12,
  Explosion: 13,
  Telegraph: 14,
  ChestOpen: 15,
  KeyPickup: 16,
  Unlock: 17,
  Heal: 18,
  LevelUp: 19,
  Spawn: 20,
  FloorExit: 21,
  Coin: 22,
  Crit: 23,
  Trap: 24,
  /** Player interacted with a hub station (a = station index). */
  Talk: 25,
  /** A fallen player was revived (a = revived player, b = reviver). */
  Revive: 26,
  /** A captive NPC was freed (a = NPC index, b = player). */
  Rescue: 27,
} as const;
export type Ev = (typeof Ev)[keyof typeof Ev];

export class EventBuffer {
  n = 0;
  readonly type: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly a: Int32Array;
  readonly b: Int32Array;
  readonly v: Float32Array;

  constructor(readonly cap = 512) {
    this.type = new Uint8Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.a = new Int32Array(cap);
    this.b = new Int32Array(cap);
    this.v = new Float32Array(cap);
  }

  clear(): void {
    this.n = 0;
  }

  push(type: Ev, x: number, y: number, a = 0, b = 0, v = 0): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.type[i] = type;
    this.x[i] = x;
    this.y[i] = y;
    this.a[i] = a;
    this.b[i] = b;
    this.v[i] = v;
  }
}
