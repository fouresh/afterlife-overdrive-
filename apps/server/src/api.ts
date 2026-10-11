import {
  AccountSaveSchema,
  NetCharSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
} from '@ao/sim';
import { z } from 'zod';
import {
  normalizeCode,
  randomId,
  randomSeed,
  randomToken,
  recoveryCode,
  sha256Hex,
} from './crypto';
import type { Env } from './env';
import { error, json } from './http';

declare const __BUILD_SHA__: string | undefined;

export const MAX_SAVE_BYTES = 256 * 1024;
/** Minimum time between two save uploads of one account. */
export const SAVE_INTERVAL_MS = 2000;

interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  now: number;
}

interface Account {
  id: string;
  rev: number;
  updated_at: number;
}

/** Fixed-window rate limit stored in D1. Returns true when the call is allowed. */
async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<boolean> {
  const start = now - (now % windowMs);
  const row = await env.DB.prepare('SELECT window_start, count FROM rate_limits WHERE key = ?')
    .bind(key)
    .first<{ window_start: number; count: number }>();
  if (!row || row.window_start !== start) {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)',
    )
      .bind(key, start)
      .run();
    return true;
  }
  if (row.count >= limit) return false;
  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').bind(key).run();
  return true;
}

async function clientKey(req: Request): Promise<string> {
  const ip = req.headers.get('CF-Connecting-IP') ?? req.headers.get('X-Forwarded-For') ?? 'local';
  return (await sha256Hex(`ip:${ip}`)).slice(0, 16);
}

async function readJson<T>(
  req: Request,
  schema: z.ZodType<T>,
  maxBytes = 4096,
): Promise<T | Response> {
  const len = Number(req.headers.get('Content-Length') ?? '0');
  if (len > maxBytes) return error(413, 'too_large');
  let text: string;
  try {
    text = await req.text();
  } catch {
    return error(400, 'bad_body');
  }
  if (text.length > maxBytes) return error(413, 'too_large');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return error(400, 'bad_json');
  }
  const r = schema.safeParse(data);
  if (!r.success)
    return error(
      400,
      'invalid',
      r.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  return r.data;
}

async function auth(c: Ctx): Promise<Account | Response> {
  const h = c.req.headers.get('Authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (token.length < 20 || token.length > 100) return error(401, 'unauthorized');
  const hash = await sha256Hex(token);
  const row = await c.env.DB.prepare(
    'SELECT a.id AS id, a.rev AS rev, a.updated_at AS updated_at, d.last_seen AS last_seen FROM devices d JOIN accounts a ON a.id = d.account_id WHERE d.token_hash = ?',
  )
    .bind(hash)
    .first<Account & { last_seen: number }>();
  if (!row) return error(401, 'unauthorized');
  // Touch last_seen at most once per hour (saves D1 writes).
  if (c.now - row.last_seen > 3_600_000) {
    await c.env.DB.prepare('UPDATE devices SET last_seen = ? WHERE token_hash = ?')
      .bind(c.now, hash)
      .run();
  }
  return { id: row.id, rev: row.rev, updated_at: row.updated_at };
}

async function createDevice(env: Env, accountId: string, now: number): Promise<string> {
  const token = randomToken(32);
  await env.DB.prepare(
    'INSERT INTO devices (token_hash, account_id, created_at, last_seen) VALUES (?, ?, ?, ?)',
  )
    .bind(await sha256Hex(token), accountId, now, now)
    .run();
  return token;
}

const SaveBody = z.object({ baseRev: z.number().int().min(0), save: AccountSaveSchema });
const RecoverBody = z.object({ code: z.string().min(12).max(20) });
const RunBody = z.object({ biome: z.string().min(1).max(24) });
const RoomCreateBody = z.object({ public: z.boolean(), char: NetCharSchema });
const RoomJoinBody = z.object({ char: NetCharSchema });
const ROOM_LIST_MAX_AGE_MS = 6 * 3_600_000;

function roomCode(): string {
  const b = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += ROOM_CODE_ALPHABET[x % ROOM_CODE_ALPHABET.length];
  return s;
}

function roomStub(env: Env, code: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

export async function handleApi(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const c: Ctx = { req, env, url, now };
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/health' && method === 'GET') {
    let db = 'ok';
    try {
      await env.DB.prepare('SELECT 1').first();
    } catch {
      db = 'unavailable';
    }
    return json({
      ok: true,
      env: env.ENVIRONMENT,
      build: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev',
      db,
      time: now,
    });
  }

  // Create an anonymous account + device token.
  if (path === '/api/account' && method === 'POST') {
    if (!(await rateLimit(env, `acc:${await clientKey(req)}`, 10, 3_600_000, now)))
      return error(429, 'rate_limited');
    const id = randomId('a');
    await env.DB.prepare(
      'INSERT INTO accounts (id, created_at, updated_at, rev) VALUES (?, ?, ?, 0)',
    )
      .bind(id, now, now)
      .run();
    const token = await createDevice(env, id, now);
    return json({ accountId: id, token }, { status: 201 });
  }

  // Exchange a recovery code for a new device token (move to another phone).
  if (path === '/api/account/recover' && method === 'POST') {
    if (!(await rateLimit(env, `rec:${await clientKey(req)}`, 10, 3_600_000, now)))
      return error(429, 'rate_limited');
    const body = await readJson(req, RecoverBody);
    if (body instanceof Response) return body;
    const hash = await sha256Hex(`rc:${normalizeCode(body.code)}`);
    const acc = await env.DB.prepare('SELECT id FROM accounts WHERE recovery_hash = ?')
      .bind(hash)
      .first<{ id: string }>();
    if (!acc) return error(404, 'not_found');
    const token = await createDevice(env, acc.id, now);
    return json({ accountId: acc.id, token });
  }

  // Public rooms (no auth: read-only, one D1 query, fetched only when the list is opened).
  if (path === '/api/rooms' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT code, players, state, leader_name AS leaderName, leader_level AS leaderLevel
       FROM rooms WHERE public = 1 AND players > 0 AND players < 4 AND updated_at > ?
       ORDER BY updated_at DESC LIMIT 20`,
    )
      .bind(now - ROOM_LIST_MAX_AGE_MS)
      .all<{
        code: string;
        players: number;
        state: string;
        leaderName: string;
        leaderLevel: number;
      }>();
    return json({ rooms: rows.results });
  }

  // WebSocket into a room: the seat token (from create/join) is the credential.
  const ws = /^\/api\/rooms\/([A-Za-z0-9]+)\/ws$/.exec(path);
  if (ws && method === 'GET') {
    const code = normalizeRoomCode(ws[1]!);
    if (!code) return error(404, 'not_found');
    if (req.headers.get('Upgrade') !== 'websocket') return error(426, 'websocket_required');
    return roomStub(env, code).fetch(req);
  }

  const a = await auth(c);
  if (a instanceof Response) return a;

  if (path === '/api/rooms' && method === 'POST') {
    if (!(await rateLimit(env, `room:${a.id}`, 20, 3_600_000, now)))
      return error(429, 'rate_limited');
    const body = await readJson(req, RoomCreateBody, 32_768);
    if (body instanceof Response) return body;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = roomCode();
      const ins = await env.DB.prepare(
        `INSERT OR IGNORE INTO rooms (code, public, players, state, leader_name, leader_level, created_at, updated_at)
         VALUES (?, ?, 0, 'lobby', ?, ?, ?, ?)`,
      )
        .bind(code, body.public ? 1 : 0, body.char.name, body.char.level, now, now)
        .run();
      if (!ins.meta.changes) continue;
      const r = await roomStub(env, code).admit(code, a.id, body.char, true, body.public);
      if ('error' in r) {
        if (r.error === 'exists') continue;
        await env.DB.prepare('DELETE FROM rooms WHERE code = ?').bind(code).run();
        return error(400, r.error);
      }
      return json({ code, seat: r.seat, slot: r.slot }, { status: 201 });
    }
    return error(503, 'no_code');
  }

  const join = /^\/api\/rooms\/([A-Za-z0-9]+)\/join$/.exec(path);
  if (join && method === 'POST') {
    if (!(await rateLimit(env, `join:${a.id}`, 60, 3_600_000, now)))
      return error(429, 'rate_limited');
    const code = normalizeRoomCode(join[1]!);
    if (!code) return error(404, 'not_found');
    const body = await readJson(req, RoomJoinBody, 32_768);
    if (body instanceof Response) return body;
    const r = await roomStub(env, code).admit(code, a.id, body.char, false, false);
    if ('error' in r) {
      const status = r.error === 'not_found' ? 404 : r.error === 'full' ? 409 : 400;
      return error(status, r.error);
    }
    return json({ code, seat: r.seat, slot: r.slot });
  }

  if (path === '/api/account/recovery' && method === 'POST') {
    if (!(await rateLimit(env, `rcgen:${a.id}`, 5, 3_600_000, now)))
      return error(429, 'rate_limited');
    const code = recoveryCode();
    await env.DB.prepare('UPDATE accounts SET recovery_hash = ? WHERE id = ?')
      .bind(await sha256Hex(`rc:${normalizeCode(code)}`), a.id)
      .run();
    return json({ code });
  }

  if (path === '/api/save' && method === 'GET') {
    const row = await env.DB.prepare('SELECT rev, updated_at, save FROM accounts WHERE id = ?')
      .bind(a.id)
      .first<{ rev: number; updated_at: number; save: string | null }>();
    return json({
      rev: row?.rev ?? 0,
      updatedAt: row?.updated_at ?? 0,
      save: row?.save ? (JSON.parse(row.save) as unknown) : null,
    });
  }

  if (path === '/api/save' && method === 'PUT') {
    if (now - a.updated_at < SAVE_INTERVAL_MS && a.rev > 0) return error(429, 'rate_limited');
    const body = await readJson(req, SaveBody, MAX_SAVE_BYTES);
    if (body instanceof Response) return body;
    if (body.baseRev !== a.rev) {
      const row = await env.DB.prepare('SELECT rev, updated_at, save FROM accounts WHERE id = ?')
        .bind(a.id)
        .first<{ rev: number; updated_at: number; save: string | null }>();
      return json(
        {
          error: 'conflict',
          rev: row?.rev ?? 0,
          updatedAt: row?.updated_at ?? 0,
          save: row?.save ? (JSON.parse(row.save) as unknown) : null,
        },
        { status: 409 },
      );
    }
    const rev = a.rev + 1;
    const save = { ...body.save, rev, updatedAt: now };
    // Optimistic concurrency: only succeeds if nobody wrote in between.
    const res = await env.DB.prepare(
      'UPDATE accounts SET save = ?, rev = ?, updated_at = ? WHERE id = ? AND rev = ?',
    )
      .bind(JSON.stringify(save), rev, now, a.id, a.rev)
      .run();
    if (!res.meta.changes) return error(409, 'conflict');
    return json({ rev, updatedAt: now });
  }

  if (path === '/api/runs' && method === 'POST') {
    if (!(await rateLimit(env, `run:${a.id}`, 60, 3_600_000, now)))
      return error(429, 'rate_limited');
    const body = await readJson(req, RunBody);
    if (body instanceof Response) return body;
    const id = randomId('r');
    const seed = randomSeed();
    await env.DB.prepare(
      'INSERT INTO runs (id, account_id, seed, biome, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(id, a.id, seed, body.biome, now)
      .run();
    return json({ runId: id, seed });
  }

  return error(404, 'not_found');
}
