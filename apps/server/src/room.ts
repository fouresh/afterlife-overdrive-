import { DurableObject } from 'cloudflare:workers';
import type { NetChar } from '@ao/sim';
import { randomSeed, randomToken } from './crypto';
import type { Env } from './env';
import { RoomCore, type DirectoryInfo, type RoomHooks, type SavedRoom } from './room-core';

interface Attachment {
  seat: string;
}

const TICK_INTERVAL_MS = 33;

/**
 * One multiplayer room (party of up to 4) = one Durable Object, named by the room code.
 *
 * - Lobby: WebSocket Hibernation API. Nothing runs between messages, so an idle lobby costs no
 *   duration; the lobby state is persisted to the object's storage and restored on wake-up.
 * - Run: a 30 Hz timer drives RoomCore (the authoritative sim) and keeps the object awake;
 *   it stops when the run ends.
 * - `ping` text frames are answered by the runtime without waking the object.
 */
export class RoomDO extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastDirectory = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<SavedRoom>('room');
      if (saved) this.core = RoomCore.restore(saved, this.transport, this.hooks, Date.now());
    });
  }

  private transport = {
    send: (seat: string, data: string | Uint8Array) => {
      for (const ws of this.ctx.getWebSockets(seat)) {
        try {
          ws.send(data);
        } catch {
          /* closing socket */
        }
      }
    },
    close: (seat: string, code: number, reason: string) => {
      for (const ws of this.ctx.getWebSockets(seat)) {
        try {
          ws.close(code, reason);
        } catch {
          /* already closed */
        }
      }
    },
  };

  private hooks: RoomHooks = {
    persist: (saved: SavedRoom) => {
      if (this.core?.isClosed) void this.ctx.storage.deleteAll();
      else void this.ctx.storage.put('room', saved);
    },
    directory: (info: DirectoryInfo | null) => this.directory(info),
    ticking: (on: boolean) => {
      if (on && !this.timer) {
        this.timer = setInterval(() => this.onTimer(), TICK_INTERVAL_MS);
      } else if (!on && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    random: () => randomSeed(),
    token: () => randomToken(18),
    log: (m: string) => console.info(m),
  };

  private onTimer(): void {
    try {
      this.core?.update(Date.now());
    } catch (err) {
      console.error('room tick failed', err);
    }
  }

  private directory(info: DirectoryInfo | null): void {
    const db = this.env.DB;
    const now = Date.now();
    if (!info) {
      this.lastDirectory = '';
      this.ctx.waitUntil(
        db
          .prepare('DELETE FROM rooms WHERE code = ?')
          .bind(this.core?.code ?? '')
          .run(),
      );
      return;
    }
    const key = JSON.stringify(info);
    if (key === this.lastDirectory) return;
    this.lastDirectory = key;
    this.ctx.waitUntil(
      db
        .prepare(
          `INSERT INTO rooms (code, public, players, state, leader_name, leader_level, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET public = excluded.public, players = excluded.players,
             state = excluded.state, leader_name = excluded.leader_name,
             leader_level = excluded.leader_level, updated_at = excluded.updated_at`,
        )
        .bind(
          info.code,
          info.public ? 1 : 0,
          info.players,
          info.state,
          info.leaderName,
          info.leaderLevel,
          now,
          now,
        )
        .run()
        .catch((err: unknown) => console.error('room directory write failed', err)),
    );
  }

  /**
   * RPC from the Worker (HTTP join/create): reserve a seat for an authenticated account.
   * `create` = this code was just allocated for a new room.
   */
  async admit(
    code: string,
    accountId: string,
    char: NetChar,
    create: boolean,
    isPublic: boolean,
  ): Promise<{ seat: string; slot: number } | { error: string }> {
    const now = Date.now();
    if (create) {
      if (this.core && !this.core.isClosed) return { error: 'exists' };
      this.core = new RoomCore(code, this.transport, this.hooks, now);
      return this.core.admit(accountId, char, now, isPublic);
    }
    if (!this.core || this.core.isClosed) return { error: 'not_found' };
    const r = this.core.admit(accountId, char, now);
    this.scheduleAlarm();
    return r;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const seat = new URL(request.url).searchParams.get('seat') ?? '';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const core = this.core;
    if (!core || core.isClosed || !core.memberBySeat(seat)) {
      // Accept, explain, close: browsers hide HTTP errors of failed WebSocket upgrades.
      server.accept();
      server.send(JSON.stringify({ t: 'error', code: 'no_seat' }));
      server.close(4004, 'no seat');
      return new Response(null, { status: 101, webSocket: client });
    }
    // One socket per seat: a reconnect replaces the stale one.
    for (const old of this.ctx.getWebSockets(seat)) {
      try {
        old.serializeAttachment({ seat: '' });
        old.close(4000, 'replaced');
      } catch {
        /* ignore */
      }
    }
    this.ctx.acceptWebSocket(server, [seat]);
    server.serializeAttachment({ seat } satisfies Attachment);
    core.connect(seat, Date.now());
    return new Response(null, { status: 101, webSocket: client });
  }

  private seatOf(ws: WebSocket): string {
    const a = ws.deserializeAttachment() as Attachment | null;
    return a?.seat ?? '';
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const seat = this.seatOf(ws);
    if (!seat || !this.core) return;
    this.core.message(seat, message, Date.now());
    if (this.core.isClosed) this.core = null;
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.gone(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, 'closing');
    } catch {
      /* already closed */
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.gone(ws);
  }

  private gone(ws: WebSocket): void {
    const seat = this.seatOf(ws);
    if (!seat || !this.core) return;
    const others = this.ctx.getWebSockets(seat).filter((s) => s !== ws);
    if (others.length > 0) return;
    this.core.disconnect(seat, Date.now());
    this.scheduleAlarm();
  }

  private scheduleAlarm(): void {
    const t = this.core?.nextAlarm();
    if (t) void this.ctx.storage.setAlarm(t);
  }

  override async alarm(): Promise<void> {
    if (!this.core) return;
    this.core.housekeeping(Date.now());
    if (this.core.isClosed) this.core = null;
    else this.scheduleAlarm();
  }
}
