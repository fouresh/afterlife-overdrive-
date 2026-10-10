import { newSave } from '@ao/sim';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../src/api';
import type { Env } from '../src/env';
import { createTestD1 } from './d1';

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
  env = { DB: createTestD1(), ENVIRONMENT: 'test' } as unknown as Env;
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
});
