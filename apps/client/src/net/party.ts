import {
  RECONNECT_GRACE_S,
  normalizeRoomCode,
  type ClientMsg,
  type LobbyMember,
  type NetChar,
  type RunInfo,
  type ServerMsg,
} from '@ao/sim';
import { diagLog, diagSet } from '../core/diagnostics';
import { api } from '../state/api';

export type PartyStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'lost';

export interface PartyState {
  status: PartyStatus;
  code: string | null;
  slot: number;
  leader: number;
  isPublic: boolean;
  phase: 'lobby' | 'run';
  run: RunInfo | null;
  members: LobbyMember[];
  /** Hero id this seat belongs to. */
  charId: string | null;
  /** Last error code from the server or the API. */
  error: string | null;
  /** Round trip time in ms (ping/pong answered by the edge without waking the room). */
  ping: number;
}

export interface PublicRoom {
  code: string;
  players: number;
  state: string;
  leaderName: string;
  leaderLevel: number;
}

/** Messages of the current run, consumed by NetRun every frame (order matters: deltas). */
export type RunMessage = ServerMsg | Uint8Array;

const RUN_TYPES = new Set(['floor', 'look', 'inv', 'vote', 'result', 'runEnd']);
const LOBBY_PING_MS = 30_000;
const RUN_PING_MS = 2_000;

function initial(): PartyState {
  return {
    status: 'idle',
    code: null,
    slot: -1,
    leader: -1,
    isPublic: false,
    phase: 'lobby',
    run: null,
    members: [],
    charId: null,
    error: null,
    ping: 0,
  };
}

/**
 * The player's membership in a multiplayer room: HTTP create/join, one WebSocket, automatic
 * reconnection within the server's grace period (Wi-Fi ↔ LTE switches, tunnels, app switches).
 * Lives outside the scenes so the connection survives hub ⇄ run transitions.
 */
export class Party {
  state: PartyState = initial();
  private ws: WebSocket | null = null;
  private seat: string | null = null;
  private listeners = new Set<() => void>();
  private queue: RunMessage[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingSent = 0;
  private lostSince = 0;
  private attempts = 0;
  private wired = false;
  /** Called when a run floor arrives (the game switches to the run scene). */
  onRunStart: (() => void) | null = null;

  get inParty(): boolean {
    return this.state.code !== null;
  }

  get me(): LobbyMember | undefined {
    return this.state.members.find((m) => m.slot === this.state.slot);
  }

  get isLeader(): boolean {
    return this.inParty && this.state.leader === this.state.slot;
  }

  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private set(patch: Partial<PartyState>): void {
    this.state = { ...this.state, ...patch };
    diagSet('party', `${this.state.code ?? '-'} ${this.state.status} slot ${this.state.slot}`);
    this.emit();
  }

  async create(token: string, char: NetChar, isPublic: boolean): Promise<string | null> {
    if (this.inParty) this.leave();
    this.set({ status: 'connecting', error: null });
    const r = await api<{ code: string; seat: string; slot: number }>('POST', '/api/rooms', {
      token,
      body: { public: isPublic, char },
    });
    if (!r.ok || !r.data) {
      this.set({ status: 'idle', error: r.error ?? 'offline' });
      return r.error ?? 'offline';
    }
    this.enter(r.data.code, r.data.seat, r.data.slot, char.id);
    return null;
  }

  async join(token: string, rawCode: string, char: NetChar): Promise<string | null> {
    const code = normalizeRoomCode(rawCode);
    if (!code) return 'bad_code';
    if (this.inParty && this.state.code === code) return null;
    if (this.inParty) this.leave();
    this.set({ status: 'connecting', error: null });
    const r = await api<{ code: string; seat: string; slot: number }>(
      'POST',
      `/api/rooms/${code}/join`,
      { token, body: { char } },
    );
    if (!r.ok || !r.data) {
      this.set({ status: 'idle', error: r.error ?? 'offline' });
      return r.error ?? 'offline';
    }
    this.enter(code, r.data.seat, r.data.slot, char.id);
    return null;
  }

  async listPublic(): Promise<PublicRoom[] | null> {
    const r = await api<{ rooms: PublicRoom[] }>('GET', '/api/rooms', { timeoutMs: 5000 });
    return r.ok && r.data ? r.data.rooms : null;
  }

  private enter(code: string, seat: string, slot: number, charId: string): void {
    this.seat = seat;
    this.queue = [];
    this.set({ ...initial(), status: 'connecting', code, slot, charId });
    this.wire();
    this.open();
  }

  /** Browser hooks: reconnect at once when the network comes back or the app is shown. */
  private wire(): void {
    if (this.wired) return;
    this.wired = true;
    const kick = () => {
      if (this.state.status === 'reconnecting') this.open();
    };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) kick();
    });
  }

  private url(): string {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/api/rooms/${this.state.code}/ws?seat=${encodeURIComponent(this.seat ?? '')}`;
  }

  private open(): void {
    if (!this.seat || !this.state.code) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url());
    } catch (err) {
      diagLog('warn', 'ws open failed', err);
      this.scheduleRetry();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.lostSince = 0;
      this.set({ status: 'online', error: null });
      this.startPing();
    };
    ws.onmessage = (ev: MessageEvent<string | ArrayBuffer>) => {
      if (this.ws !== ws) return;
      if (typeof ev.data !== 'string') {
        this.queue.push(new Uint8Array(ev.data));
        return;
      }
      if (ev.data === 'pong') {
        if (this.pingSent) this.set({ ping: Math.round(performance.now() - this.pingSent) });
        this.pingSent = 0;
        return;
      }
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data) as ServerMsg;
      } catch {
        return;
      }
      this.onJson(msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (ev.code === 4001 || ev.code === 4004 || ev.code === 4000 || ev.code === 1000) {
        // Kicked, seat expired, the seat moved to another tab, or we left.
        if (ev.code === 4004 && this.state.code) this.lose('no_seat');
        else if (this.state.code)
          this.reset(ev.code === 4001 ? 'kicked' : ev.code === 4000 ? 'replaced' : null);
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (!this.state.code) return;
    const now = Date.now();
    if (!this.lostSince) this.lostSince = now;
    // Give up a few seconds before the server frees the seat.
    if (now - this.lostSince > (RECONNECT_GRACE_S - 3) * 1000) return this.lose('timeout');
    if (this.state.status !== 'reconnecting') this.set({ status: 'reconnecting' });
    const delay = [300, 800, 1500, 2500, 4000][Math.min(this.attempts++, 4)]!;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  /** The seat is gone for good: the run (if any) is lost; back to solo. */
  private lose(reason: string): void {
    diagLog('warn', 'party lost', reason);
    this.queue = [];
    this.ws?.close();
    this.ws = null;
    this.seat = null;
    this.set({ ...initial(), status: 'lost', error: reason });
  }

  private reset(error: string | null): void {
    this.queue = [];
    this.seat = null;
    this.set({ ...initial(), error });
  }

  private onJson(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.set({ slot: msg.slot, code: msg.code });
        return;
      case 'lobby':
        this.set({
          leader: msg.leader,
          isPublic: msg.public,
          phase: msg.state,
          run: msg.run,
          members: msg.members,
        });
        return;
      case 'kicked':
        this.reset('kicked');
        this.ws?.close();
        return;
      case 'error':
        this.set({ error: msg.code });
        if (this.state.phase === 'run') this.queue.push(msg);
        return;
      default:
        if (RUN_TYPES.has(msg.t)) {
          // A new run starts: anything left over from a previous one (its runEnd) is stale.
          if (msg.t === 'floor' && msg.depth === 0) this.queue = [];
          this.queue.push(msg);
          if (msg.t === 'floor' && msg.depth === 0) this.onRunStart?.();
          else if (msg.t === 'floor') this.emit();
        }
    }
  }

  /** NetRun drains this every frame. */
  takeRunMessages(): RunMessage[] {
    if (this.queue.length === 0) return EMPTY;
    const q = this.queue;
    this.queue = [];
    return q;
  }

  /** Is there an undelivered run start (scene switch pending)? */
  hasPendingFloor(): boolean {
    return this.queue.some((m) => !(m instanceof Uint8Array) && m.t === 'floor');
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  sendBinary(bytes: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(bytes);
  }

  /** Hero changed in the hub (equipment, level): keep the room's copy fresh. */
  updateChar(char: NetChar): void {
    if (this.inParty && this.state.charId === char.id) this.send({ t: 'char', char });
  }

  leave(): void {
    if (!this.inParty) return;
    this.send({ t: 'leave' });
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    setTimeout(() => ws?.close(1000, 'left'), 50);
    this.reset(null);
  }

  /** Test hook (?e2e=1): drop the connection as if the phone switched networks. */
  debugDrop(): void {
    this.ws?.close(4999, 'test drop');
  }

  /** Clear a 'lost' status after the UI handled it. */
  acknowledgeLost(): void {
    if (this.state.status === 'lost') this.set({ status: 'idle' });
  }

  private runMode = false;

  /**
   * Keep-alive + RTT. Cloudflare drops WebSockets idle for ~100 s, so the lobby pings every
   * 30 s; a run on screen pings every 2 s for the lag display.
   */
  private startPing(): void {
    this.stopPing();
    const tick = () => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      this.pingSent = performance.now();
      this.ws.send('ping');
    };
    tick();
    this.pingTimer = setInterval(tick, this.runMode ? RUN_PING_MS : LOBBY_PING_MS);
  }

  setRunMode(on: boolean): void {
    this.runMode = on;
    if (this.ws?.readyState === WebSocket.OPEN) this.startPing();
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}

const EMPTY: RunMessage[] = [];

export const party = new Party();

/** Invite link for a room code. */
export function inviteUrl(code: string): string {
  return `${location.origin}/?room=${code}`;
}
