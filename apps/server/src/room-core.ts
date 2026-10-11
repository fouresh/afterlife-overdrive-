import { getContent } from '@ao/content';
import {
  BinReader,
  BinWriter,
  MsgType,
  PROTOCOL_VERSION,
  TICK_RATE,
  emptyInput,
  readInputPacket,
  type PlayerInput,
} from '@ao/shared';
import {
  ClientMsgSchema,
  DIFFICULTIES,
  EF,
  Ev,
  EventLog,
  FieldCapture,
  InputQueue,
  Kind,
  PickupKind,
  RECONNECT_GRACE_S,
  ROOM_SIZE,
  SnapshotEncoder,
  VOTE_S,
  carryOut,
  checkNetChar,
  createFloorWorld,
  equipFromBag,
  recomputeStats,
  removePlayer,
  setupOfNetChar,
  spawnPickup,
  step,
  type ClientMsg,
  type LobbyMember,
  type NetChar,
  type NetRunResult,
  type PlayerSetup,
  type RunInfo,
  type ServerMsg,
  type VoteChoice,
  type World,
} from '@ao/sim';

/**
 * Authoritative logic of one multiplayer room, independent of the Durable Object runtime
 * (unit-tested in Node). The DO feeds it connections, messages and the clock, and gives it a
 * transport to answer. Lobby state is serializable (survives hibernation); the run world lives
 * in memory while the DO is awake (a run keeps it awake with its tick timer).
 */

export interface RoomTransport {
  send(seat: string, data: string | Uint8Array): void;
  close(seat: string, code: number, reason: string): void;
}

export interface DirectoryInfo {
  code: string;
  public: boolean;
  players: number;
  state: 'lobby' | 'run';
  leaderName: string;
  leaderLevel: number;
}

export interface RoomHooks {
  /** Lobby state changed: persist it (hibernation). */
  persist(saved: SavedRoom): void;
  /** Public room directory (D1). `null` = room closed. */
  directory(info: DirectoryInfo | null): void;
  /** A run started/ended: start/stop the tick timer. */
  ticking(on: boolean): void;
  /** Random u32 (run seeds). */
  random(): number;
  /** Random secret (seat tokens). */
  token(): string;
  log?(msg: string): void;
}

interface Member {
  slot: number;
  seat: string;
  accountId: string;
  char: NetChar;
  online: boolean;
  /** ms timestamp when the socket closed (0 = online). */
  offlineSince: number;
  inRun: boolean;
  /** Result not yet acknowledged by the client (re-sent on reconnect). */
  pending: NetRunResult | null;
  /** Token bucket against message floods. */
  budget: number;
  budgetAt: number;
}

export interface SavedRoom {
  v: 1;
  code: string;
  public: boolean;
  leader: number;
  createdAt: number;
  members: Omit<Member, 'budget' | 'budgetAt'>[];
  running: boolean;
}

interface RunPlayer {
  slot: number;
  index: number;
  queue: InputQueue;
  enc: SnapshotEncoder;
  ready: boolean;
  vote: VoteChoice | null;
  inv: string;
  killedBy: string;
  /** Result already sent for this player (left the run). */
  done: boolean;
}

interface RunState {
  info: RunInfo;
  world: World;
  phase: 'loading' | 'playing' | 'vote';
  phaseAt: number;
  clock: number;
  ticks: number;
  secondsBefore: number;
  players: RunPlayer[];
  inputs: PlayerInput[];
}

const TICK_MS = 1000 / TICK_RATE;
const LOAD_TIMEOUT_MS = 10_000;
const MAX_STEPS_PER_UPDATE = 4;
const SNAPSHOT_EVERY = 2;
/** Messages per second a socket may send (inputs are ≤ ~30/s). */
const MSG_RATE = 60;

export class RoomCore {
  code: string;
  isPublic = false;
  leader = 0;
  createdAt: number;
  members: Member[] = [];
  run: RunState | null = null;
  private cap = new FieldCapture();
  private log = new EventLog();
  private out = new BinWriter(8192);
  private closed = false;

  constructor(
    code: string,
    private transport: RoomTransport,
    private hooks: RoomHooks,
    now: number,
  ) {
    this.code = code;
    this.createdAt = now;
  }

  static restore(saved: SavedRoom, transport: RoomTransport, hooks: RoomHooks, now: number) {
    const r = new RoomCore(saved.code, transport, hooks, saved.createdAt);
    r.isPublic = saved.public;
    r.leader = saved.leader;
    r.members = saved.members.map((m) => ({ ...m, budget: MSG_RATE, budgetAt: now }));
    if (saved.running) {
      // The object restarted mid-run (deploy, eviction): the world is gone.
      for (const m of r.members) {
        if (!m.inRun) continue;
        m.inRun = false;
        m.pending ??= lostResult();
      }
      r.persist();
    }
    return r;
  }

  serialize(): SavedRoom {
    return {
      v: 1,
      code: this.code,
      public: this.isPublic,
      leader: this.leader,
      createdAt: this.createdAt,
      members: this.members.map(({ budget: _b, budgetAt: _a, ...m }) => m),
      running: this.run !== null,
    };
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /** Called by the Worker (HTTP join) before the WebSocket: reserve a seat. */
  admit(
    accountId: string,
    char: NetChar,
    now: number,
    makePublic?: boolean,
  ): { seat: string; slot: number } | { error: string } {
    if (this.closed) return { error: 'closed' };
    const bad = checkNetChar(char);
    if (bad) return { error: bad };
    const existing = this.members.find((m) => m.accountId === accountId);
    if (existing) {
      if (!existing.inRun) existing.char = char;
      this.persist();
      return { seat: existing.seat, slot: existing.slot };
    }
    if (this.members.length >= ROOM_SIZE) return { error: 'full' };
    const used = new Set(this.members.map((m) => m.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const m: Member = {
      slot,
      seat: this.hooks.token(),
      accountId,
      char,
      online: false,
      offlineSince: now,
      inRun: false,
      pending: null,
      budget: MSG_RATE,
      budgetAt: now,
    };
    this.members.push(m);
    if (this.members.length === 1) {
      this.leader = slot;
      if (makePublic !== undefined) this.isPublic = makePublic;
    }
    this.changed();
    return { seat: m.seat, slot };
  }

  memberBySeat(seat: string): Member | undefined {
    return this.members.find((m) => m.seat === seat);
  }

  /** A WebSocket with this seat token was accepted. Returns false to reject it. */
  connect(seat: string, now: number): boolean {
    const m = this.memberBySeat(seat);
    if (!m || this.closed) return false;
    m.online = true;
    m.offlineSince = 0;
    m.budget = MSG_RATE;
    m.budgetAt = now;
    this.sendTo(m, { t: 'welcome', code: this.code, slot: m.slot, protocol: PROTOCOL_VERSION });
    this.changed();
    if (m.pending) this.sendTo(m, { t: 'result', result: m.pending });
    const rp = this.runPlayer(m.slot);
    if (this.run && rp && m.inRun) {
      // Back in the middle of a run: resend the floor, restart deltas and input alignment.
      rp.queue.reset();
      rp.enc.reset();
      this.sendFloor(rp);
      if (this.run.phase === 'vote') this.sendVote(now);
    }
    return true;
  }

  disconnect(seat: string, now: number): void {
    const m = this.memberBySeat(seat);
    if (!m) return;
    m.online = false;
    m.offlineSince = now;
    this.runPlayer(m.slot)?.queue.release();
    this.changed();
  }

  /** Text (JSON control) or binary (inputs) message from a member. */
  message(seat: string, data: string | ArrayBuffer | Uint8Array, now: number): void {
    const m = this.memberBySeat(seat);
    if (!m || !m.online) return;
    // Token bucket: refill MSG_RATE per second, burst MSG_RATE.
    m.budget = Math.min(MSG_RATE, m.budget + ((now - m.budgetAt) / 1000) * MSG_RATE);
    m.budgetAt = now;
    if (m.budget < 1) return;
    m.budget--;
    if (typeof data === 'string') {
      if (data.length > 16_384) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      const r = ClientMsgSchema.safeParse(parsed);
      if (!r.success) {
        this.sendTo(m, { t: 'error', code: 'bad_message' });
        return;
      }
      this.control(m, r.data, now);
      return;
    }
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length === 0 || bytes.length > 512) return;
    const rd = new BinReader(bytes);
    if (rd.u8() !== MsgType.Input) return;
    const pkt = readInputPacket(rd);
    const rp = this.runPlayer(m.slot);
    if (pkt && rp && this.run?.phase === 'playing') rp.queue.push(pkt);
  }

  private control(m: Member, msg: ClientMsg, now: number): void {
    switch (msg.t) {
      case 'char':
        if (m.inRun || checkNetChar(msg.char)) return;
        m.char = msg.char;
        this.changed();
        return;
      case 'public':
        if (m.slot !== this.leader) return;
        this.isPublic = msg.value;
        this.changed();
        return;
      case 'kick': {
        if (m.slot !== this.leader || this.run || msg.slot === m.slot) return;
        const k = this.members.find((x) => x.slot === msg.slot);
        if (!k) return;
        this.sendTo(k, { t: 'kicked' });
        this.removeMember(k);
        this.transport.close(k.seat, 4001, 'kicked');
        return;
      }
      case 'leave':
        if (this.run && m.inRun) this.quit(m);
        this.removeMember(m);
        this.transport.close(m.seat, 1000, 'left');
        return;
      case 'start':
        this.start(m, msg.biome, msg.difficulty, now);
        return;
      case 'ready': {
        const rp = this.runPlayer(m.slot);
        if (rp) rp.ready = true;
        return;
      }
      case 'vote': {
        const rp = this.runPlayer(m.slot);
        if (!this.run || this.run.phase !== 'vote' || !rp || rp.done) return;
        const p = this.run.world.players[rp.index];
        if (!p || p.dead) return;
        rp.vote = msg.choice;
        this.sendVote(now);
        return;
      }
      case 'equip':
      case 'drop':
        this.command(m, msg);
        return;
      case 'quit':
        if (this.run && m.inRun) this.quit(m);
        return;
      case 'ack':
        m.pending = null;
        this.persist();
        return;
    }
  }

  // --- Lobby ------------------------------------------------------------------------------

  private removeMember(m: Member): void {
    this.members = this.members.filter((x) => x !== m);
    const rp = this.runPlayer(m.slot);
    if (this.run && rp && !rp.done) {
      const p = this.run.world.players[rp.index];
      if (p) removePlayer(this.run.world, p);
      rp.done = true;
    }
    if (this.leader === m.slot && this.members.length > 0) {
      this.leader = Math.min(...this.members.map((x) => x.slot));
    }
    if (this.members.length === 0) {
      this.close();
      return;
    }
    this.changed();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.run) {
      this.run = null;
      this.hooks.ticking(false);
    }
    this.hooks.directory(null);
    this.hooks.persist(this.serialize());
  }

  /** Lobby housekeeping (alarm): drop members offline for longer than the grace period. */
  housekeeping(now: number): void {
    for (const m of [...this.members]) {
      if (m.online || now - m.offlineSince < RECONNECT_GRACE_S * 1000) continue;
      if (this.run && m.inRun) this.quit(m, 'lost');
      this.removeMember(m);
    }
  }

  /** When the DO should wake up for housekeeping (ms timestamp) or null. */
  nextAlarm(): number | null {
    let t: number | null = null;
    for (const m of this.members) {
      if (m.online) continue;
      const due = m.offlineSince + RECONNECT_GRACE_S * 1000 + 500;
      t = t === null ? due : Math.min(t, due);
    }
    return t;
  }

  lobbyMsg(): ServerMsg {
    return {
      t: 'lobby',
      code: this.code,
      public: this.isPublic,
      leader: this.leader,
      state: this.run ? 'run' : 'lobby',
      run: this.run ? this.run.info : null,
      members: this.members
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((m): LobbyMember => ({
          slot: m.slot,
          name: m.char.name,
          level: m.char.level,
          hardcore: m.char.hardcore,
          appearance: m.char.appearance,
          online: m.online,
          inRun: m.inRun,
        })),
    };
  }

  private changed(): void {
    if (this.closed) return;
    this.broadcast(this.lobbyMsg());
    this.persist();
    const leader = this.members.find((m) => m.slot === this.leader);
    this.hooks.directory({
      code: this.code,
      public: this.isPublic,
      players: this.members.length,
      state: this.run ? 'run' : 'lobby',
      leaderName: leader?.char.name ?? '',
      leaderLevel: leader?.char.level ?? 1,
    });
  }

  private persist(): void {
    this.hooks.persist(this.serialize());
  }

  private sendTo(m: Member, msg: ServerMsg): void {
    if (m.online) this.transport.send(m.seat, JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg): void {
    const s = JSON.stringify(msg);
    for (const m of this.members) if (m.online) this.transport.send(m.seat, s);
  }

  // --- Run --------------------------------------------------------------------------------

  private runPlayer(slot: number): RunPlayer | undefined {
    return this.run?.players.find((p) => p.slot === slot);
  }

  private start(m: Member, biome: string, difficulty: RunInfo['difficulty'], now: number): void {
    if (this.run || m.slot !== this.leader) return;
    if (!getContent().biomes.has(biome)) return this.sendTo(m, { t: 'error', code: 'bad_biome' });
    const party = this.members
      .filter((x) => x.online && !x.pending)
      .sort((a, b) => a.slot - b.slot);
    if (party.length === 0) return;
    const min = DIFFICULTIES[difficulty].minLevel;
    if (party.some((x) => x.char.level < min))
      return this.sendTo(m, { t: 'error', code: 'level_too_low' });
    const info: RunInfo = { seed: this.hooks.random() >>> 0, biome, floors: 3, difficulty };
    this.run = {
      info,
      world: null as unknown as World,
      phase: 'loading',
      phaseAt: now,
      clock: now,
      ticks: 0,
      secondsBefore: 0,
      players: [],
      inputs: [],
    };
    for (const x of party) x.inRun = true;
    this.startFloor(
      0,
      party.map((x) => ({ slot: x.slot, setup: setupOfNetChar(x.char) })),
      now,
    );
    this.hooks.ticking(true);
    this.changed();
  }

  private startFloor(depth: number, party: { slot: number; setup: PlayerSetup }[], now: number) {
    const run = this.run!;
    if (run.world) run.secondsBefore += run.world.ticksPlayed / TICK_RATE;
    run.world = createFloorWorld(
      run.info,
      depth,
      party.map((p) => p.setup),
    );
    run.players = party.map((p, index) => ({
      slot: p.slot,
      index,
      queue: new InputQueue(),
      enc: new SnapshotEncoder(),
      ready: false,
      vote: null,
      inv: '',
      killedBy: run.players.find((q) => q.slot === p.slot)?.killedBy ?? '',
      done: false,
    }));
    run.inputs = run.players.map(() => emptyInput());
    run.phase = 'loading';
    run.phaseAt = now;
    run.ticks = 0;
    this.log.clear();
    this.lookSent.clear();
    for (const rp of run.players) this.sendFloor(rp);
  }

  private sendFloor(rp: RunPlayer): void {
    const run = this.run!;
    const m = this.members.find((x) => x.slot === rp.slot);
    if (!m) return;
    const w = run.world;
    this.sendTo(m, {
      t: 'floor',
      run: run.info,
      depth: w.depth,
      you: rp.index,
      players: run.players.map((q) => {
        const mm = this.members.find((x) => x.slot === q.slot);
        return {
          index: q.index,
          slot: q.slot,
          name: mm?.char.name ?? '?',
          hardcore: mm?.char.hardcore ?? false,
          appearance: mm?.char.appearance ?? DEFAULT_LOOK,
          loadout: w.players[q.index]!.loadout,
        };
      }),
      shop: w.shop,
    });
    rp.inv = '';
  }

  wantsTicking(): boolean {
    return this.run !== null;
  }

  /** Advance the run to `now` (call ~30 times per second while ticking). */
  update(now: number): void {
    const run = this.run;
    if (!run) return;
    if (run.phase === 'loading') {
      const waiting = run.players.some((rp) => {
        const m = this.members.find((x) => x.slot === rp.slot);
        return !rp.done && m?.online && !rp.ready;
      });
      if (waiting && now - run.phaseAt < LOAD_TIMEOUT_MS) return;
      run.phase = 'playing';
      run.clock = now;
      run.ticks = 0;
    }
    if (run.phase === 'vote') {
      if (now - run.phaseAt >= VOTE_S * 1000 || this.voteComplete()) this.resolveVote(now);
      return;
    }
    const due = Math.floor((now - run.clock) / TICK_MS) - run.ticks;
    if (due > MAX_STEPS_PER_UPDATE * 3) {
      // We fell far behind (CPU hiccup): drop the backlog instead of fast-forwarding.
      run.clock = now - run.ticks * TICK_MS;
    }
    for (let k = 0; k < Math.min(due, MAX_STEPS_PER_UPDATE) && this.run === run; k++) {
      this.stepRun(now);
      if (run.phase !== 'playing') break;
    }
  }

  private stepRun(now: number): void {
    const run = this.run!;
    const w = run.world;
    for (const rp of run.players) {
      const m = this.members.find((x) => x.slot === rp.slot);
      const input = run.inputs[rp.index]!;
      const p = w.players[rp.index]!;
      if (m?.online && !rp.done) rp.queue.take(input);
      else {
        input.mx = 0;
        input.my = 0;
        input.buttons = 0;
        // Disconnected players cannot be hurt while they try to come back.
        if (!p.dead && w.e.alive[p.ent]) w.e.iframes[p.ent] = 30;
      }
    }
    step(w, run.inputs);
    run.ticks++;
    this.log.append(w.events, w.tick - 1);
    this.trackKillers(w);
    if (run.ticks % SNAPSHOT_EVERY === 0 || w.outcome !== 'playing') this.sendSnapshots();
    if (w.outcome === 'exit') {
      run.phase = 'vote';
      run.phaseAt = now;
      for (const rp of run.players) rp.vote = null;
      this.sendVote(now);
    } else if (w.outcome === 'victory' || w.outcome === 'dead') {
      this.finishRun(w.outcome);
    }
  }

  private trackKillers(w: World): void {
    const ev = w.events;
    const e = w.e;
    for (let k = 0; k < ev.n; k++) {
      if (ev.type[k] !== Ev.PlayerHurt) continue;
      const rp = this.run!.players.find((p) => p.index === ev.a[k]);
      if (!rp) continue;
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < e.hi; i++) {
        if (!e.alive[i] || e.kind[i] !== Kind.Enemy || e.flags[i]! & EF.Dying) continue;
        const d = (e.x[i]! - ev.x[k]!) ** 2 + (e.y[i]! - ev.y[k]!) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best >= 0) rp.killedBy = w.content.enemies[e.def[best]!]?.id ?? '';
    }
  }

  private sendSnapshots(): void {
    const run = this.run!;
    const w = run.world;
    // Loadouts first: the snapshot carries the new look version that triggers the redraw.
    this.broadcastLooks();
    this.cap.capture(w.e);
    for (const rp of run.players) {
      const m = this.members.find((x) => x.slot === rp.slot);
      if (!m?.online || rp.done) continue;
      const p = w.players[rp.index]!;
      // Inventory changes go first as JSON (rare), then the binary delta.
      const inv = invSignature(p);
      if (inv !== rp.inv) {
        rp.inv = inv;
        this.sendTo(m, { t: 'inv', bag: p.bag, loadout: p.loadout, potions: p.potions });
      }
      this.out.reset();
      rp.enc.encode(this.out, w, this.cap, rp.index, rp.queue.ack, this.log);
      this.transport.send(m.seat, this.out.toBytes());
    }
    this.log.clear();
  }

  /** Loadout changes of any player (paper-doll) → everyone in the run. */
  private lookSent = new Map<number, number>();
  private broadcastLooks(): void {
    const run = this.run!;
    const w = run.world;
    for (const rp of run.players) {
      const p = w.players[rp.index]!;
      if (this.lookSent.get(rp.index) === p.lookVersion) continue;
      this.lookSent.set(rp.index, p.lookVersion);
      if (p.lookVersion === 0) continue;
      const msg: ServerMsg = { t: 'look', index: rp.index, loadout: p.loadout };
      for (const q of run.players) {
        const m = this.members.find((x) => x.slot === q.slot);
        if (m && !q.done) this.sendTo(m, msg);
      }
    }
  }

  private command(m: Member, msg: Extract<ClientMsg, { t: 'equip' | 'drop' }>): void {
    const run = this.run;
    const rp = this.runPlayer(m.slot);
    if (!run || !rp || rp.done) return;
    const w = run.world;
    const p = w.players[rp.index]!;
    if (p.dead) return;
    if (msg.t === 'equip') equipFromBag(w, p, msg.bag, msg.slot);
    else {
      const item = p.bag.splice(msg.bag, 1)[0];
      if (!item) return;
      spawnPickup(w, PickupKind.Item, w.e.x[p.ent]!, w.e.y[p.ent]! + 8, {
        item,
        amount: 1,
        owner: p.index,
      });
      recomputeStats(w, p);
    }
  }

  // --- Votes and results --------------------------------------------------------------------

  private voteComplete(): boolean {
    const run = this.run!;
    return run.players.every((rp) => {
      const p = run.world.players[rp.index]!;
      const m = this.members.find((x) => x.slot === rp.slot);
      return rp.done || p.dead || p.gone || rp.vote !== null || !m?.online;
    });
  }

  private sendVote(now: number): void {
    const run = this.run!;
    const leftMs = Math.max(0, VOTE_S * 1000 - (now - run.phaseAt));
    const choices = run.players.map((rp) => {
      const p = run.world.players[rp.index]!;
      return rp.done || p.gone ? null : p.dead ? ('dead' as const) : rp.vote;
    });
    for (const rp of run.players) {
      const m = this.members.find((x) => x.slot === rp.slot);
      if (m && !rp.done) this.sendTo(m, { t: 'vote', leftMs, choices });
    }
  }

  private resolveVote(now: number): void {
    const run = this.run!;
    const w = run.world;
    const carry = carryOut(w);
    const deeper: { slot: number; setup: PlayerSetup }[] = [];
    for (const rp of run.players) {
      if (rp.done) continue;
      const p = w.players[rp.index]!;
      if (p.gone) continue;
      if (p.dead) this.giveResult(rp, 'dead');
      else if (rp.vote === 'deeper') {
        const m = this.members.find((x) => x.slot === rp.slot);
        const setup = carry[rp.index]!;
        setup.hardcore = m?.char.hardcore ?? false;
        deeper.push({ slot: rp.slot, setup });
      } else this.giveResult(rp, 'left');
    }
    if (deeper.length === 0) return this.endRun();
    this.startFloor(w.depth + 1, deeper, now);
    this.changed();
  }

  private finishRun(outcome: 'victory' | 'dead'): void {
    const run = this.run!;
    const w = run.world;
    for (const rp of run.players) {
      if (rp.done) continue;
      const p = w.players[rp.index]!;
      if (p.gone) continue;
      this.giveResult(rp, outcome === 'victory' && !p.dead ? 'victory' : 'dead');
    }
    this.endRun();
  }

  /** A player leaves the run early (surrender, kicked out by the grace timeout). */
  private quit(m: Member, outcome: 'dead' | 'lost' = 'dead'): void {
    const run = this.run;
    const rp = this.runPlayer(m.slot);
    if (!run || !rp || rp.done) {
      m.inRun = false;
      return;
    }
    this.giveResult(rp, outcome);
    const p = run.world.players[rp.index];
    if (p) removePlayer(run.world, p);
    if (run.players.every((q) => q.done)) this.endRun();
    else this.changed();
  }

  private giveResult(rp: RunPlayer, outcome: NetRunResult['outcome']): void {
    const run = this.run!;
    const w = run.world;
    const p = w.players[rp.index]!;
    const carry = carryOut(w)[rp.index]!;
    const result: NetRunResult = {
      outcome,
      carry,
      depth: w.depth + 1,
      bossKilled: w.bossKilled,
      seconds: run.secondsBefore + w.ticksPlayed / TICK_RATE,
      killedBy: rp.killedBy,
    };
    rp.done = true;
    if (!p.gone) removePlayer(w, p);
    const m = this.members.find((x) => x.slot === rp.slot);
    if (!m) return;
    m.inRun = false;
    m.pending = result;
    this.sendTo(m, { t: 'result', result });
  }

  private endRun(): void {
    if (!this.run) return;
    for (const rp of this.run.players) {
      const m = this.members.find((x) => x.slot === rp.slot);
      if (m) m.inRun = false;
    }
    this.run = null;
    this.lookSent.clear();
    this.hooks.ticking(false);
    this.broadcast({ t: 'runEnd' });
    this.changed();
  }
}

function invSignature(p: World['players'][number]): string {
  let s = `${p.lookVersion}|${p.potions}|`;
  for (const it of p.bag) s += `${it.uid},`;
  return s;
}

function lostResult(): NetRunResult {
  return { outcome: 'lost', carry: {}, depth: 1, bossKilled: false, seconds: 0, killedBy: '' };
}

const DEFAULT_LOOK: NetChar['appearance'] = {
  gender: 'm',
  skin: 0,
  hairStyle: 'short',
  hairColor: 0,
  eyeColor: 0,
  clothColor: 0,
  pantsColor: 0,
};
