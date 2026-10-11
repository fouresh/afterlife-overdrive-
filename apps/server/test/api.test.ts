import { DEFAULT_APPEARANCE } from '@ao/content';
import { createCharacter, netCharOf, newSave, starterItem, type NetChar } from '@ao/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../src/api';
import type { Env } from '../src/env';
import { RoomCore } from '../src/room-core';
import { createTestD1 } from './d1';

/** Durable Object namespace stand-in: one RoomCore per code, same admit() contract as RoomDO. */
function fakeRooms(db: D1Database) {
  const cores = new Map<string, RoomCore>();
  const hooks = (code: string) => ({
    persist: () => undefined,
    directory: (d: { public: boolean; players: number; state: string } | null) => {
      if (!d) void db.prepare('DELETE FROM rooms WHERE code = ?').bind(code).run();
      else
        void db
          .prepare('UPDATE rooms SET players = ?, public = ?, state = ? WHERE code = ?')
          .bind(d.players, d.public ? 1 : 0, d.state, code)
          .run();
    },
    ticking: () => undefined,
    random: () => 42,
    token: () => `seat-${Math.random().toString(36).slice(2)}`,
  });
  const transport = { send: () => undefined, close: () => undefined };
  return {
    idFromName: (name: string) => name,
    get: (code: string) => ({
      admit: async (c: string, acc: string, char: NetChar, create: boolean, pub: boolean) => {
        let core = cores.get(c);
        if (create) {
          if (core && !core.isClosed) return { error: 'exists' };
          core = new RoomCore(c, transport, hooks(c), now);
          cores.set(c, core);
          return core.admit(acc, char, now, pub);
        }
        if (!core || core.isClosed) return { error: 'not_found' };
        return core.admit(acc, char, now);
      },
      fetch: async () => new Response(null, { status: 200, headers: { 'X-Room': code } }),
    }),
  };
}

function heroChar(name: string): NetChar {
  return netCharOf(
    createCharacter(
      {
        name,
        appearance: DEFAULT_APPEARANCE,
        hardcore: false,
        origin: 'truck',
        weapon: starterItem('sword.rusty'),
        artifact: starterItem('art.frostNova'),
      },
      `id-${name}`,
      now,
    ),
  );
}

let env: Env;
let now = 1_800_000_000_000;

function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  ip = '1.2.3.4',
): Request {
  const headers: Record<string, string> = { 'CF-Connecting-IP': ip };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://game.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(method: string, path: string, body?: unknown, token?: string, ip?: string) {
  now += 5000;
  const res = await handleApi(req(method, path, body, token, ip), env, now);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function newAccount() {
  const r = await call('POST', '/api/account');
  expect(r.status).toBe(201);
  return r.body as { accountId: string; token: string };
}

beforeEach(() => {
  const DB = createTestD1();
  env = { DB, ROOMS: fakeRooms(DB), ENVIRONMENT: 'test' } as unknown as Env;
});

describe('api', () => {
  it('health', async () => {
    const r = await call('GET', '/api/health');
    expect(r.body.ok).toBe(true);
    expect(r.body.db).toBe('ok');
  });

  it('creates an account and rejects bad tokens', async () => {
    const a = await newAccount();
    expect(a.token.length).toBeGreaterThan(30);
    expect((await call('GET', '/api/save', undefined, a.token)).status).toBe(200);
    expect((await call('GET', '/api/save', undefined, 'x'.repeat(40))).status).toBe(401);
    expect((await call('GET', '/api/save')).status).toBe(401);
  });

  it('saves with revisions, detects conflicts, validates the schema', async () => {
    const a = await newAccount();
    const save = newSave(1, now);
    const r1 = await call('PUT', '/api/save', { baseRev: 0, save }, a.token);
    expect(r1.status).toBe(200);
    expect(r1.body.rev).toBe(1);
    const stale = await call('PUT', '/api/save', { baseRev: 0, save }, a.token);
    expect(stale.status).toBe(409);
    expect(stale.body.rev).toBe(1);
    const got = await call('GET', '/api/save', undefined, a.token);
    expect((got.body.save as { rev: number }).rev).toBe(1);
    const bad = await call(
      'PUT',
      '/api/save',
      { baseRev: 1, save: { ...save, realms: { standard: { gold: -5 } } } },
      a.token,
    );
    expect(bad.status).toBe(400);
    const cheat = structuredClone(save);
    cheat.realms.standard.gold = 1e12;
    expect((await call('PUT', '/api/save', { baseRev: 1, save: cheat }, a.token)).status).toBe(400);
  });

  it('rate-limits save uploads that are too frequent', async () => {
    const a = await newAccount();
    const save = newSave(1, now);
    expect((await call('PUT', '/api/save', { baseRev: 0, save }, a.token)).status).toBe(200);
    // Same timestamp window: call handleApi directly without advancing time.
    const res = await handleApi(
      req('PUT', '/api/save', { baseRev: 1, save }, a.token),
      env,
      now + 100,
    );
    expect(res.status).toBe(429);
  });

  it('recovery code moves the account to a new device', async () => {
    const a = await newAccount();
    const save = newSave(7, now);
    await call('PUT', '/api/save', { baseRev: 0, save }, a.token);
    const rc = await call('POST', '/api/account/recovery', {}, a.token);
    const code = rc.body.code as string;
    expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const rec = await call(
      'POST',
      '/api/account/recover',
      { code: code.toLowerCase().replace(/-/g, ' ') },
      undefined,
      '9.9.9.9',
    );
    expect(rec.status).toBe(200);
    expect(rec.body.accountId).toBe(a.accountId);
    const got = await call('GET', '/api/save', undefined, rec.body.token as string);
    expect(got.body.rev).toBe(1);
    expect((await call('POST', '/api/account/recover', { code: 'AAAA-BBBB-CCCC' })).status).toBe(
      404,
    );
  });

  it('limits account creation per IP', async () => {
    let last = 0;
    for (let i = 0; i < 12; i++)
      last = (await call('POST', '/api/account', undefined, undefined, '5.5.5.5')).status;
    expect(last).toBe(429);
  });

  it('issues run seeds', async () => {
    const a = await newAccount();
    const r = await call('POST', '/api/runs', { biome: 'crypt' }, a.token);
    expect(r.status).toBe(200);
    expect(typeof r.body.seed).toBe('number');
    expect(String(r.body.runId)).toMatch(/^r/);
  });

  it('rooms: create, join by code, list public rooms, reject bad heroes', async () => {
    const a = await newAccount();
    const b = await newAccount();
    const created = await call(
      'POST',
      '/api/rooms',
      { public: true, char: heroChar('Анна') },
      a.token,
    );
    expect(created.status).toBe(201);
    const code = created.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(created.body.slot).toBe(0);
    const joined = await call(
      'POST',
      `/api/rooms/${code.toLowerCase()}/join`,
      { char: heroChar('Борис') },
      b.token,
    );
    expect(joined.status).toBe(200);
    expect(joined.body.slot).toBe(1);
    expect(typeof joined.body.seat).toBe('string');
    const list = await call('GET', '/api/rooms');
    expect((list.body.rooms as { code: string }[]).map((r) => r.code)).toContain(code);
    expect(
      (await call('POST', '/api/rooms/ZZZZZ/join', { char: heroChar('Вера') }, b.token)).status,
    ).toBe(404);
    expect(
      (await call('POST', '/api/rooms/BAD/join', { char: heroChar('Вера') }, b.token)).status,
    ).toBe(404);
    const cheat = { ...heroChar('Глеб'), level: 999 };
    expect((await call('POST', `/api/rooms/${code}/join`, { char: cheat }, b.token)).status).toBe(
      400,
    );
    expect(
      (await call('POST', '/api/rooms', { public: false, char: heroChar('Анна') })).status,
    ).toBe(401);
    // WebSocket upgrade is routed to the room object (no auth: the seat is the credential).
    const ws = await handleApi(
      new Request(`https://game.test/api/rooms/${code}/ws?seat=x`, {
        headers: { Upgrade: 'websocket' },
      }),
      env,
      now,
    );
    expect(ws.headers.get('X-Room')).toBe(code);
  });
});
