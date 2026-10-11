import { DEFAULT_APPEARANCE } from '@ao/content';
import { BinReader, BinWriter, Btn, MsgType, writeInputPacket, type PlayerInput } from '@ao/shared';
import {
  SnapshotDecoder,
  createCharacter,
  createMirrorWorld,
  netCharOf,
  starterItem,
  type NetChar,
  type ServerMsg,
  type World,
} from '@ao/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { RoomCore, type DirectoryInfo, type SavedRoom } from '../src/room-core';

let now = 1_800_000_000_000;

function hero(name: string, opts: { hardcore?: boolean; weapon?: string } = {}): NetChar {
  const c = createCharacter(
    {
      name,
      appearance: DEFAULT_APPEARANCE,
      hardcore: opts.hardcore ?? false,
      origin: 'truck',
      weapon: starterItem(opts.weapon ?? 'sword.rusty'),
      artifact: starterItem('art.frostNova'),
    },
    `c-${name}`,
    now,
  );
  return netCharOf(c);
}

/** A fake client: collects messages and keeps a mirror world from floor + snapshots. */
class Client {
  json: ServerMsg[] = [];
  snaps = 0;
  dec = new SnapshotDecoder();
  world: World | null = null;
  you = -1;
  seq = 1000;
  constructor(readonly seat: string) {}
  order: string[] = [];
  receive(data: string | Uint8Array) {
    if (typeof data === 'string') {
      const m = JSON.parse(data) as ServerMsg;
      this.json.push(m);
      this.order.push(m.t);
      if (m.t === 'floor') {
        this.world = createMirrorWorld(m.run, m.depth, m.players, m.shop);
        this.dec = new SnapshotDecoder();
        this.you = m.you;
      }
      if (m.t === 'look') this.world!.players[m.index]!.loadout = m.loadout;
      return;
    }
    const r = new BinReader(data);
    expect(r.u8()).toBe(MsgType.Snapshot);
    this.dec.apply(r, this.world!);
    this.dec.events.length = 0;
    this.snaps++;
    this.order.push('snap');
  }
  last<T extends ServerMsg['t']>(t: T): Extract<ServerMsg, { t: T }> | undefined {
    for (let k = this.json.length - 1; k >= 0; k--)
      if (this.json[k]!.t === t) return this.json[k] as Extract<ServerMsg, { t: T }>;
    return undefined;
  }
  /** A change to `input`, then `ticks` ticks pass on the client. */
  inputPacket(input: PlayerInput, ticks = 3): Uint8Array {
    const w = new BinWriter();
    writeInputPacket(w, [{ seq: this.seq, input }]);
    this.seq += ticks;
    return w.toBytes();
  }
}

let clients: Map<string, Client>;
let closed: string[];
let directory: (DirectoryInfo | null)[];
let saved: SavedRoom | null;
let ticking: boolean;
let tokenN: number;

function makeRoom(): RoomCore {
  return new RoomCore(
    'ABCDE',
    {
      send: (seat, data) => clients.get(seat)?.receive(data),
      close: (seat) => closed.push(seat),
    },
    {
      persist: (s) => (saved = s),
      directory: (d) => directory.push(d),
      ticking: (on) => (ticking = on),
      random: () => 0xc0ffee,
      token: () => `seat-${++tokenN}`,
    },
    now,
  );
}

function join(room: RoomCore, account: string, char: NetChar): Client {
  const r = room.admit(account, char, now);
  if ('error' in r) throw new Error(r.error);
  const c = new Client(r.seat);
  clients.set(r.seat, c);
  expect(room.connect(r.seat, now)).toBe(true);
  return c;
}

function send(room: RoomCore, c: Client, msg: object | Uint8Array) {
  room.message(c.seat, msg instanceof Uint8Array ? msg : JSON.stringify(msg), now);
}

/** Advance the room clock (and the run) by `ms`. */
function advance(room: RoomCore, ms: number) {
  const end = now + ms;
  while (now < end) {
    now += 33;
    room.update(now);
  }
}

beforeEach(() => {
  clients = new Map();
  closed = [];
  directory = [];
  saved = null;
  ticking = false;
  tokenN = 0;
});

describe('room lobby', () => {
  it('admits up to 4 members, validates heroes, assigns a leader', () => {
    const room = makeRoom();
    const a = join(room, 'acc-a', hero('Анна'));
    join(room, 'acc-b', hero('Борис'));
    const lobby = a.last('lobby')!;
    expect(lobby.members.map((m) => m.name)).toEqual(['Анна', 'Борис']);
    expect(lobby.leader).toBe(0);
    expect(room.admit('acc-x', { ...hero('Хулиган'), name: 'хуй' }, now)).toEqual({
      error: 'bad_name',
    });
    expect(
      room.admit('acc-y', { ...hero('Читер'), attrs: { str: 50, dex: 0, int: 0, vit: 0 } }, now),
    ).toEqual({ error: 'bad_attrs' });
    join(room, 'acc-c', hero('Вера'));
    join(room, 'acc-d', hero('Глеб'));
    expect(room.admit('acc-e', hero('Дина'), now)).toEqual({ error: 'full' });
    // The same account re-joining gets its seat back.
    const again = room.admit('acc-b', hero('Борис'), now);
    expect('seat' in again && again.slot).toBe(1);
    expect(directory.at(-1)).toMatchObject({ code: 'ABCDE', players: 4, state: 'lobby' });
  });

  it('leader leaves → next member leads; kick; empty room closes', () => {
    const room = makeRoom();
    const a = join(room, 'acc-a', hero('Анна'));
    const b = join(room, 'acc-b', hero('Борис'));
    const c = join(room, 'acc-c', hero('Вера'));
    send(room, b, { t: 'kick', slot: 2 }); // not the leader: ignored
    expect(room.members).toHaveLength(3);
    send(room, a, { t: 'kick', slot: 2 });
    expect(c.last('kicked')).toBeDefined();
    expect(closed).toContain(c.seat);
    send(room, a, { t: 'leave' });
    expect(b.last('lobby')!.leader).toBe(1);
    send(room, b, { t: 'leave' });
    expect(room.isClosed).toBe(true);
    expect(directory.at(-1)).toBeNull();
  });

  it('keeps a disconnected seat for the grace period, then frees it', () => {
    const room = makeRoom();
    const a = join(room, 'acc-a', hero('Анна'));
    const b = join(room, 'acc-b', hero('Борис'));
    room.disconnect(b.seat, now);
    expect(a.last('lobby')!.members[1]!.online).toBe(false);
    room.housekeeping(now + 30_000);
    expect(room.members).toHaveLength(2);
    expect(room.connect(b.seat, now + 31_000)).toBe(true);
    room.disconnect(b.seat, now + 32_000);
    expect(room.nextAlarm()).toBeGreaterThan(now + 32_000);
    room.housekeeping(now + 32_000 + 46_000);
    expect(room.members).toHaveLength(1);
  });

  it('survives hibernation (serialize/restore); a restart mid-run reports a lost run', () => {
    const room = makeRoom();
    const a = join(room, 'acc-a', hero('Анна'));
    join(room, 'acc-b', hero('Борис'));
    send(room, a, { t: 'start', biome: 'crypt', difficulty: 'normal' });
    const s = saved!;
    expect(s.running).toBe(true);
    const restored = RoomCore.restore(
      s,
      { send: () => undefined, close: () => undefined },
      {
        persist: () => undefined,
        directory: () => undefined,
        ticking: () => undefined,
        random: () => 1,
        token: () => 't',
      },
      now,
    );
    expect(restored.members.map((m) => m.char.name)).toEqual(['Анна', 'Борис']);
    expect(restored.members.every((m) => !m.inRun && m.pending?.outcome === 'lost')).toBe(true);
  });
});

describe('room run', () => {
  function startRun() {
    const room = makeRoom();
    const a = join(room, 'acc-a', hero('Анна'));
    const b = join(room, 'acc-b', hero('Борис', { weapon: 'bow.short' }));
    send(room, b, { t: 'start', biome: 'crypt', difficulty: 'normal' }); // not leader
    expect(room.run).toBeNull();
    send(room, a, { t: 'start', biome: 'crypt', difficulty: 'nightmare' }); // level too low
    expect(a.last('error')?.code).toBe('level_too_low');
    send(room, a, { t: 'start', biome: 'crypt', difficulty: 'normal' });
    expect(ticking).toBe(true);
    expect(a.world && b.world).toBeTruthy();
    send(room, a, { t: 'ready' });
    send(room, b, { t: 'ready' });
    return { room, a, b };
  }

  it('runs the authoritative sim: inputs move players, snapshots mirror the world', () => {
    const { room, a, b } = startRun();
    const w = room.run!.world;
    const pa = w.players[a.you]!;
    const x0 = w.e.x[pa.ent]!;
    advance(room, 200);
    // Hold "right" for ~1 s: one change, the server repeats it.
    send(room, a, a.inputPacket({ mx: 127, my: 0, aim: 0, buttons: 0 }, 30));
    advance(room, 1000);
    // Stop (the server keeps repeating the last input until told otherwise).
    send(room, a, a.inputPacket({ mx: 0, my: 0, aim: 0, buttons: 0 }));
    advance(room, 500);
    expect(w.e.x[pa.ent]!).toBeGreaterThan(x0 + 30);
    expect(a.snaps).toBeGreaterThan(15);
    expect(b.snaps).toBeGreaterThan(15);
    // B's mirror sees A where the server has it.
    const mirror = b.world!;
    expect(mirror.e.alive[pa.ent]).toBe(1);
    expect(Math.round(b.dec.bx[pa.ent]! * 8)).toBe(Math.round(w.e.x[pa.ent]! * 8));
    expect(a.dec.self.ack).toBeGreaterThan(20);
    expect(a.last('inv')).toBeDefined();
  });

  it('stairs vote: one goes home with loot, the other goes deeper alone', () => {
    const { room, a, b } = startRun();
    advance(room, 200);
    const w = room.run!.world;
    w.players[a.you]!.gold = 77;
    w.outcome = 'exit';
    advance(room, 100);
    expect(room.run!.phase).toBe('vote');
    expect(a.last('vote')).toBeDefined();
    send(room, a, { t: 'vote', choice: 'leave' });
    send(room, b, { t: 'vote', choice: 'deeper' });
    advance(room, 100);
    const res = a.last('result')!.result;
    expect(res.outcome).toBe('left');
    expect(res.carry.gold).toBe(77);
    expect(room.members.find((m) => m.seat === a.seat)!.inRun).toBe(false);
    expect(b.last('floor')!.depth).toBe(1);
    expect(b.last('floor')!.players).toHaveLength(1);
    expect(room.run!.world.players).toHaveLength(1);
    // A acknowledges the result; it is not re-sent on reconnect.
    send(room, a, { t: 'ack' });
    room.disconnect(a.seat, now);
    a.json = [];
    room.connect(a.seat, now);
    expect(a.last('result')).toBeUndefined();
    expect(a.last('lobby')!.state).toBe('run');
  });

  it('victory ends the run for everyone; the dead get a death result', () => {
    const { room, a, b } = startRun();
    advance(room, 200);
    const w = room.run!.world;
    const pb = w.players[b.you]!;
    pb.dead = true;
    w.e.hp[pb.ent] = 0;
    w.outcome = 'victory';
    advance(room, 100);
    expect(a.last('result')!.result.outcome).toBe('victory');
    expect(b.last('result')!.result.outcome).toBe('dead');
    expect(a.last('runEnd')).toBeDefined();
    expect(room.run).toBeNull();
    expect(ticking).toBe(false);
    expect(a.last('lobby')!.state).toBe('lobby');
  });

  it('surrender and disconnect timeout remove a player; the last one leaving ends the run', () => {
    const { room, a, b } = startRun();
    advance(room, 300);
    send(room, b, { t: 'quit' });
    expect(b.last('result')!.result.outcome).toBe('dead');
    expect(room.run).not.toBeNull();
    room.disconnect(a.seat, now);
    // While offline A cannot be hurt and stands still.
    advance(room, 1000);
    const w = room.run!.world;
    expect(w.e.iframes[w.players[a.you]!.ent]).toBeGreaterThan(0);
    room.housekeeping(now + 46_000);
    expect(room.run).toBeNull();
    expect(room.members.some((m) => m.seat === a.seat)).toBe(false);
  });

  it('reconnect mid-run resends the floor and a full snapshot', () => {
    const { room, a } = startRun();
    advance(room, 300);
    room.disconnect(a.seat, now);
    advance(room, 500);
    a.json = [];
    room.connect(a.seat, now);
    expect(a.last('floor')).toBeDefined();
    const before = a.dec.fullCount;
    advance(room, 100);
    expect(a.dec.fullCount).toBe(before + 1);
    send(room, a, a.inputPacket({ mx: 0, my: 0, aim: 0, buttons: Btn.Attack }));
    advance(room, 200);
    expect(a.dec.self.ack).toBeGreaterThan(0);
  });

  it('equipping in the run: everyone gets the new loadout before the snapshot that shows it', () => {
    const { room, a, b } = startRun();
    advance(room, 300);
    const w = room.run!.world;
    const pa = w.players[a.you]!;
    pa.bag.push(starterItem('sword.knight'));
    b.order = [];
    send(room, a, { t: 'equip', bag: 0, slot: 0 });
    advance(room, 200);
    expect(pa.loadout.weapon?.base).toBe('sword.knight');
    const look = b.order.indexOf('look');
    expect(look).toBeGreaterThanOrEqual(0);
    expect(b.order.indexOf('snap')).toBeGreaterThan(look);
    expect(b.world!.players[a.you]!.loadout.weapon?.base).toBe('sword.knight');
    expect(b.world!.players[a.you]!.lookVersion).toBe(pa.lookVersion);
    expect(a.last('inv')!.loadout.weapon?.base).toBe('sword.knight');
  });

  it('rejects garbage without crashing', () => {
    const { room, a } = startRun();
    room.message(a.seat, '{not json', now);
    room.message(a.seat, JSON.stringify({ t: 'equip', bag: -5, slot: 3 }), now);
    room.message(a.seat, new Uint8Array([2, 255, 255, 255, 255, 255, 255]), now);
    room.message(a.seat, new Uint8Array(4000), now);
    room.message('nobody', 'x', now);
    advance(room, 200);
    expect(a.last('error')?.code).toBe('bad_message');
    expect(room.run).not.toBeNull();
  });
});
