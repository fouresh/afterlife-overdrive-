import {
  BinReader,
  BinWriter,
  Btn,
  MsgType,
  TILE,
  angleToByte,
  emptyInput,
  readInputPacket,
  writeInputPacket,
  type PlayerInput,
} from '@ao/shared';
import { describe, expect, it } from 'vitest';
import { EF, Kind, PickupKind } from '../entities';
import { starterItem } from '../items';
import { createFloorWorld } from '../run';
import { emptyLoadout } from '../stats';
import { step } from '../step';
import type { World } from '../world';
import { InputQueue, Predictor } from './inputs';
import { createMirrorWorld } from './mirror';
import type { NetPlayerInfo, RunInfo } from './protocol';
import { EventLog, FieldCapture, SnapshotDecoder, SnapshotEncoder } from './snapshot';

const RUN: RunInfo = { seed: 4242, biome: 'crypt', floors: 3, difficulty: 'normal' };

function serverWorld(players: number): World {
  const setups = [];
  for (let k = 0; k < players; k++) {
    const loadout = emptyLoadout();
    loadout.weapon = starterItem(['sword.rusty', 'bow.short', 'staff.apprentice'][k % 3]!);
    loadout.artifacts[0] = starterItem(['art.frostNova', 'art.bladeFan', 'art.spiritWisp'][k % 3]!);
    setups.push({ loadout, potions: 2 });
  }
  const w = createFloorWorld(RUN, 0, setups);
  for (const p of w.players) {
    w.e.hp[p.ent] = 1e5;
    w.e.maxHp[p.ent] = 1e5;
  }
  return w;
}

function playerInfos(w: World): NetPlayerInfo[] {
  return w.players.map((p) => ({
    index: p.index,
    slot: p.index,
    name: `P${p.index}`,
    hardcore: p.hardcore,
    appearance: {
      gender: 'm',
      skin: 0,
      hairStyle: 'short',
      hairColor: 0,
      eyeColor: 0,
      clothColor: 0,
      pantsColor: 0,
    },
    loadout: p.loadout,
  }));
}

/** Move every player into the nearest uncleared combat room (lots of entities and events). */
function enterCombat(w: World): void {
  const room = w.floor.rooms.findIndex((r, i) => r.lockOnEnter && w.rooms[i]!.state === 0);
  if (room < 0) return;
  const r = w.floor.rooms[room]!.rect;
  let k = 0;
  for (let y = r.y + 2; y < r.y + r.h - 2 && k < w.players.length; y++) {
    for (let x = r.x + 2; x < r.x + r.w - 2 && k < w.players.length; x++) {
      if (w.map.tiles[y * w.map.w + x] !== 1) continue;
      const p = w.players[k++]!;
      w.e.x[p.ent] = (x + 0.5) * TILE;
      w.e.y[p.ent] = (y + 0.5) * TILE;
    }
  }
}

/** Deterministic pseudo-random scripted input (moves, attacks, dashes, skills). */
function script(t: number, k: number): PlayerInput {
  const phase = Math.floor(t / 25) + k * 3;
  const dirs = [
    [127, 0],
    [0, 127],
    [-127, 0],
    [0, -127],
    [90, 90],
    [0, 0],
  ];
  const d = dirs[phase % dirs.length]!;
  return {
    mx: d[0]!,
    my: d[1]!,
    aim: 0,
    buttons:
      Btn.Attack |
      (t % 41 === k ? Btn.Dash : 0) |
      (t % 97 === k * 5 ? Btn.Skill1 : 0) |
      (t % 60 === 7 ? Btn.Interact : 0),
  };
}

function expectMirror(server: World, mirror: World, viewer: number, dec: SnapshotDecoder) {
  const s = server.e;
  const m = mirror.e;
  dec.flushRemovals(m, 1e9);
  for (let i = 0; i < Math.max(s.hi, m.hi); i++) {
    const visible =
      i < s.hi &&
      s.alive[i] === 1 &&
      !(s.kind[i] === Kind.Pickup && s.owner[i]! >= 0 && s.owner[i] !== viewer);
    if (!visible) {
      expect(m.alive[i] ?? 0, `slot ${i} should be gone`).toBe(0);
      continue;
    }
    expect(m.alive[i], `slot ${i} alive`).toBe(1);
    expect(m.kind[i]).toBe(s.kind[i]);
    expect(m.gen[i]).toBe(s.gen[i]);
    expect(Math.round(m.x[i]! * 8)).toBe(Math.round(s.x[i]! * 8));
    expect(Math.round(m.y[i]! * 8)).toBe(Math.round(s.y[i]! * 8));
    const k = s.kind[i];
    if (k === Kind.Enemy) {
      expect(m.state[i]).toBe(s.state[i]);
      expect(m.stateT[i]).toBe(s.stateT[i]);
      expect(m.hp[i]).toBe(Math.ceil(s.hp[i]!));
      expect(m.flags[i]).toBe(s.flags[i]);
      expect(m.def[i]).toBe(s.def[i]);
      expect(m.hitFlash[i]).toBe(s.hitFlash[i]);
      expect(m.life[i]).toBe(s.life[i]);
      expect(angleToByte(m.face[i]!)).toBe(angleToByte(s.face[i]!));
    } else if (k === Kind.Area) {
      expect(m.timer[i]).toBe(s.timer[i]);
      expect(m.life[i]).toBe(s.life[i]);
      expect(m.ref[i]).toBe(s.ref[i]);
    } else if (k === Kind.Pickup) {
      expect(m.def[i]).toBe(s.def[i]);
      if (s.def[i] === PickupKind.Item) {
        expect(mirror.drops[m.ref[i]!]?.item?.base).toBe(server.drops[s.ref[i]!]?.item?.base);
      }
    } else if (k === Kind.Player) {
      expect(m.hp[i]).toBe(Math.ceil(s.hp[i]!));
      expect(m.iframes[i]).toBe(s.iframes[i]);
    } else if (k === Kind.Prop) {
      expect(m.state[i]).toBe(s.state[i]);
      expect(m.def[i]).toBe(s.def[i]);
    }
  }
  expect(mirror.keys).toBe(server.keys);
  expect(mirror.stairsOpen).toBe(server.stairsOpen);
  expect(mirror.outcome).toBe(server.outcome);
  expect(mirror.rooms.map((r) => r.state)).toEqual(server.rooms.map((r) => r.state));
  expect(Array.from(mirror.map.dyn)).toEqual(Array.from(server.map.dyn));
  expect(Array.from(mirror.map.tiles)).toEqual(Array.from(server.map.tiles));
  for (const p of server.players) {
    const q = mirror.players[p.index]!;
    expect(q.ent).toBe(p.ent);
    expect(q.dead).toBe(p.dead);
    expect(q.lookVersion).toBe(p.lookVersion);
    expect(angleToByte(q.aim)).toBe(angleToByte(p.aim));
  }
  const me = server.players[viewer]!;
  expect(dec.self.x).toBe(server.e.x[me.ent]);
  expect(dec.self.gold).toBe(me.gold);
  expect(dec.self.potions).toBe(me.potions);
}

describe('net snapshots', () => {
  it('delta snapshots rebuild an exact mirror for every viewer (and after a reconnect)', () => {
    const w = serverWorld(2);
    enterCombat(w);
    const cap = new FieldCapture();
    const log = new EventLog();
    const viewers = [0, 1].map((v) => ({
      v,
      enc: new SnapshotEncoder(),
      dec: new SnapshotDecoder(),
      mirror: createMirrorWorld(RUN, 0, playerInfos(w), w.shop),
    }));
    const out = new BinWriter(4096);
    let bytes = 0;
    let snaps = 0;
    let events = 0;
    for (let t = 0; t < 900; t++) {
      step(
        w,
        w.players.map((p) => script(t, p.index)),
      );
      log.append(w.events, w.tick - 1);
      if (t === 300) enterCombat(w);
      if (t % 2 !== 1) continue;
      cap.capture(w.e);
      for (const c of viewers) {
        if (t === 501 && c.v === 1) {
          // Reconnect: fresh client state, full snapshot.
          c.enc.reset();
          c.dec = new SnapshotDecoder();
          c.mirror = createMirrorWorld(RUN, 0, playerInfos(w), w.shop);
        }
        out.reset();
        c.enc.encode(out, w, cap, c.v, t, log);
        bytes += out.pos;
        snaps++;
        const r = new BinReader(out.toBytes());
        expect(r.u8()).toBe(MsgType.Snapshot);
        c.dec.apply(r, c.mirror);
        expect(r.remaining).toBe(0);
        events += c.dec.events.length;
        c.dec.events.length = 0;
        expectMirror(w, c.mirror, c.v, c.dec);
        expect(c.dec.self.ack).toBe(t);
      }
      log.clear();
    }
    expect(events).toBeGreaterThan(100);
    // Bandwidth budget: well under 2 KB per snapshot on average (≈ 15–25 KB/s at 15 Hz).
    expect(bytes / snaps).toBeLessThan(2000);
  });
});

describe('net inputs', () => {
  it('input packets round-trip and malformed ones are rejected', () => {
    const w = new BinWriter();
    writeInputPacket(w, [
      { seq: 1234, input: { mx: 127, my: -127, aim: 200, buttons: Btn.Attack } },
      { seq: 1237, input: emptyInput() },
    ]);
    const r = new BinReader(w.toBytes());
    expect(r.u8()).toBe(MsgType.Input);
    const pkt = readInputPacket(r)!;
    expect(pkt.changes.map((c) => c.seq)).toEqual([1234, 1237]);
    expect(pkt.changes[0]!.input).toEqual({ mx: 127, my: -127, aim: 200, buttons: Btn.Attack });
    expect(readInputPacket(new BinReader(new Uint8Array([5])))).toBeNull();
    const big = new BinWriter();
    writeInputPacket(big, [
      { seq: 1, input: emptyInput() },
      { seq: 500, input: emptyInput() },
    ]);
    const rb = new BinReader(big.toBytes());
    rb.u8();
    expect(readInputPacket(rb)).toBeNull();
  });

  /**
   * Full loop with latency: client predicts, batches inputs, the server applies them through
   * the InputQueue, snapshots come back late and the client reconciles. Without knockback the
   * prediction must match the server exactly; with jitter it must stay close.
   */
  function simulateLoop(jitter: number) {
    const server = createFloorWorld(RUN, 0, [{ loadout: emptyLoadout() }]);
    const q = new InputQueue();
    const enc = new SnapshotEncoder();
    const cap = new FieldCapture();
    const log = new EventLog();
    const infos = playerInfos(server);
    const mirror = createMirrorWorld(RUN, 0, infos, server.shop);
    const dec = new SnapshotDecoder();
    const pred = new Predictor();
    const me = () => mirror.players[0]!;
    let rnd = 7;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const toServer: { at: number; bytes: Uint8Array }[] = [];
    const toClient: { at: number; bytes: Uint8Array }[] = [];
    let lastSend = -1e9;
    let packets = 0;
    const errors: number[] = [];
    const inputs: PlayerInput[] = [emptyInput()];
    let started = false;
    for (let t = 0; t < 600; t++) {
      const now = t * (1000 / 30);
      // --- client tick
      for (let k = toClient.length - 1; k >= 0; k--) {
        if (toClient[k]!.at > t) continue;
        const r = new BinReader(toClient[k]!.bytes);
        r.u8();
        dec.apply(r, mirror);
        if (!started) {
          // First snapshot: start predicting from the authoritative position.
          started = true;
        }
        if (dec.hasSelf && started) errors.push(pred.reconcile(mirror, me(), dec.self));
        dec.localSlot = me().ent;
        toClient.splice(k, 1);
      }
      if (started) {
        const inp = t % 90 < 70 ? script(t, 0) : emptyInput();
        inp.buttons &= Btn.Dash; // movement + dashes only (no knockback from attacks)
        pred.tick(mirror, me(), inp);
        const pkt = pred.flush(now, lastSend);
        if (pkt) {
          lastSend = now;
          packets++;
          const bw = new BinWriter();
          writeInputPacket(bw, pkt);
          const delay = 3 + Math.floor(rand() * (jitter + 1));
          toServer.push({ at: t + delay, bytes: bw.toBytes() });
        }
      }
      // --- server tick
      for (let k = 0; k < toServer.length; k++) {
        if (toServer[k]!.at > t) continue;
        const r = new BinReader(toServer[k]!.bytes);
        r.u8();
        q.push(readInputPacket(r)!);
        toServer.splice(k--, 1);
      }
      q.take(inputs[0]!);
      step(server, inputs);
      log.append(server.events, server.tick - 1);
      if (t % 2 === 1) {
        cap.capture(server.e);
        const bw = new BinWriter();
        enc.encode(bw, server, cap, 0, q.ack, log);
        log.clear();
        toClient.push({ at: t + 3, bytes: bw.toBytes() });
      }
    }
    return { errors, q, packets };
  }

  it('prediction matches the server exactly with steady latency', () => {
    const { errors, q, packets } = simulateLoop(0);
    expect(errors.length).toBeGreaterThan(100);
    // Only changes are sent: far fewer packets than the 10/s cap over 20 s.
    expect(packets).toBeLessThan(80);
    // The first reconciliations align the timelines; after that, no correction at all.
    const tail = errors.slice(20);
    expect(Math.max(...tail)).toBeLessThan(0.001);
    expect(q.late).toBe(0);
  });

  it('jitter: late packets are absorbed, corrections stay small', () => {
    const { errors, q } = simulateLoop(4);
    const tail = errors.slice(40);
    const big = tail.filter((e) => e > 6).length;
    expect(big).toBeLessThan(tail.length * 0.05);
    expect(q.ack).toBeGreaterThan(400);
  });
});

describe('co-op rules', () => {
  it('a fallen ally is revived by holding Interact; hardcore heroes are not', () => {
    const w = serverWorld(2);
    const [a, b] = w.players as [
      NonNullable<World['players'][0]>,
      NonNullable<World['players'][1]>,
    ];
    // Kill B next to A.
    w.e.hp[b.ent] = 0;
    b.dead = true;
    w.e.flags[b.ent] = w.e.flags[b.ent]! | EF.Dying;
    w.e.x[b.ent] = w.e.x[a.ent]! + 8;
    w.e.y[b.ent] = w.e.y[a.ent]!;
    const hold: PlayerInput = { mx: 0, my: 0, aim: 0, buttons: Btn.Interact };
    for (let t = 0; t < 60 && b.dead; t++) step(w, [hold, emptyInput()]);
    expect(b.dead).toBe(false);
    expect(w.e.hp[b.ent]).toBeGreaterThan(0);
    expect(w.e.flags[b.ent]! & EF.Dying).toBe(0);

    b.hardcore = true;
    b.dead = true;
    w.e.hp[b.ent] = 0;
    for (let t = 0; t < 90; t++) step(w, [hold, emptyInput()]);
    expect(b.dead).toBe(true);
  });

  it('the run ends when every remaining player is dead or gone', () => {
    const w = serverWorld(2);
    const [a, b] = w.players as [
      NonNullable<World['players'][0]>,
      NonNullable<World['players'][1]>,
    ];
    w.e.hp[a.ent] = 0;
    a.dead = true;
    for (let t = 0; t < 80; t++) step(w, [emptyInput(), emptyInput()]);
    expect(w.outcome).toBe('playing');
    b.gone = true;
    b.dead = true;
    for (let t = 0; t < 3; t++) step(w, [emptyInput(), emptyInput()]);
    expect(w.outcome).toBe('dead');
  });
});
