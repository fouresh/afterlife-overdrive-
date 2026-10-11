import { AccountSaveSchema, migrateSave, newSave, type AccountSave, type Character } from '@ao/sim';
import { diagLog, diagSet } from '../core/diagnostics';
import { api } from './api';
import { kvGet, kvSet } from './db';

/**
 * Local-first account store: the save lives in IndexedDB and syncs to the cloud (D1) in the
 * background when the server is reachable. Conflicts: the server keeps a revision counter; if
 * both sides changed, the most recently updated save wins (simple and predictable).
 */
export type CloudStatus = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

interface Meta {
  token?: string;
  accountId?: string;
  /** Local changes not yet uploaded. */
  dirty: boolean;
}

const SAVE_KEY = 'save';
const META_KEY = 'meta';
const V1_KEY = 'ao.profile.v1';

type Listener = () => void;

export class AccountStore {
  save!: AccountSave;
  cloud: CloudStatus = 'off';
  private meta: Meta = { dirty: false };
  private listeners = new Set<Listener>();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private syncing = false;
  private backoff = 2000;

  async load(): Promise<void> {
    const now = Date.now();
    this.meta = (await kvGet<Meta>(META_KEY)) ?? { dirty: false };
    const raw = await kvGet<unknown>(SAVE_KEY);
    if (raw) {
      try {
        this.save = migrateSave(raw, now);
      } catch (err) {
        diagLog('error', 'save corrupted, starting fresh', err);
        await kvSet('save-corrupted', raw);
        this.save = newSave(randomSeed(), now);
      }
    } else {
      // M1 profile → migrate once.
      let v1: unknown;
      try {
        const s = localStorage.getItem(V1_KEY);
        v1 = s ? JSON.parse(s) : null;
      } catch {
        v1 = null;
      }
      this.save = v1 ? migrateSave(v1, now) : newSave(randomSeed(), now);
      this.meta.dirty = true;
      await this.writeLocal();
    }
    diagSet('account', this.meta.accountId ?? 'local');
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  get accountId(): string | undefined {
    return this.meta.accountId;
  }

  character(id: string): Character | undefined {
    return this.save.characters.find((c) => c.id === id);
  }

  /** Apply a change, persist locally, schedule a cloud upload. */
  async mutate(fn: (s: AccountSave) => void): Promise<void> {
    fn(this.save);
    this.save.updatedAt = Date.now();
    this.meta.dirty = true;
    this.emit();
    await this.writeLocal();
    this.scheduleSync(2500);
  }

  private async writeLocal(): Promise<void> {
    await kvSet(SAVE_KEY, this.save);
    await kvSet(META_KEY, this.meta);
  }

  private setCloud(s: CloudStatus): void {
    if (this.cloud !== s) {
      this.cloud = s;
      diagSet('cloud', s);
      this.emit();
    }
  }

  scheduleSync(delay: number): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.sync(), delay);
  }

  /** Device token for authenticated calls (creates the account on first use); null offline. */
  async authToken(): Promise<string | null> {
    return (await this.ensureToken()) ? (this.meta.token ?? null) : null;
  }

  /** Ensure a device token exists (creates an anonymous account on first use). */
  private async ensureToken(): Promise<boolean> {
    if (this.meta.token) return true;
    const r = await api<{ accountId: string; token: string }>('POST', '/api/account');
    if (!r.ok || !r.data) return false;
    this.meta.token = r.data.token;
    this.meta.accountId = r.data.accountId;
    this.meta.dirty = true;
    await kvSet(META_KEY, this.meta);
    diagSet('account', r.data.accountId);
    return true;
  }

  async sync(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.setCloud('syncing');
    try {
      if (!(await this.ensureToken())) {
        this.setCloud('offline');
        this.retryLater();
        return;
      }
      const token = this.meta.token!;
      const remote = await api<{ rev: number; updatedAt: number; save: unknown }>(
        'GET',
        '/api/save',
        { token },
      );
      if (!remote.ok || !remote.data) {
        this.setCloud(remote.status === 401 ? 'error' : 'offline');
        this.retryLater();
        return;
      }
      const r = remote.data;
      const remoteSave = r.save ? safeParse(r.save) : null;
      if (
        remoteSave &&
        r.rev > this.save.rev &&
        (!this.meta.dirty || remoteSave.updatedAt >= this.save.updatedAt)
      ) {
        // Remote is newer: adopt it.
        this.save = remoteSave;
        this.meta.dirty = false;
        await this.writeLocal();
        this.emit();
      } else if (this.meta.dirty || !remoteSave) {
        const put = await api<{ rev: number; updatedAt: number }>('PUT', '/api/save', {
          token,
          body: { baseRev: r.rev, save: { ...this.save, rev: r.rev } },
        });
        if (put.ok && put.data) {
          this.save.rev = put.data.rev;
          this.meta.dirty = false;
          await this.writeLocal();
        } else if (put.status === 429 || put.status === 409) {
          this.retryLater();
        } else {
          diagLog('warn', 'save upload failed', put.status, put.error);
          this.setCloud(put.status === 0 ? 'offline' : 'error');
          this.retryLater();
          return;
        }
      }
      this.backoff = 2000;
      this.setCloud(this.meta.dirty ? 'syncing' : 'synced');
    } finally {
      this.syncing = false;
    }
  }

  private retryLater(): void {
    this.backoff = Math.min(120_000, this.backoff * 2);
    this.scheduleSync(this.backoff);
  }

  /** New recovery code for this account (server keeps only its hash). */
  async recoveryCode(): Promise<string | null> {
    if (!(await this.ensureToken())) return null;
    const r = await api<{ code: string }>('POST', '/api/account/recovery', {
      token: this.meta.token,
      body: {},
    });
    return r.ok && r.data ? r.data.code : null;
  }

  /** Move this device onto the account behind a recovery code (replaces local progress). */
  async recover(code: string): Promise<'ok' | 'not_found' | 'offline' | 'rate_limited'> {
    const r = await api<{ accountId: string; token: string }>('POST', '/api/account/recover', {
      body: { code },
    });
    if (r.status === 404) return 'not_found';
    if (r.status === 429) return 'rate_limited';
    if (!r.ok || !r.data) return 'offline';
    this.meta = { token: r.data.token, accountId: r.data.accountId, dirty: false };
    await kvSet(META_KEY, this.meta);
    const remote = await api<{ rev: number; save: unknown }>('GET', '/api/save', {
      token: r.data.token,
    });
    const s = remote.data?.save ? safeParse(remote.data.save) : null;
    if (s) this.save = s;
    else {
      // The recovered account has no cloud save yet: upload this device's progress into it.
      this.save.rev = remote.data?.rev ?? 0;
      this.meta.dirty = true;
      this.scheduleSync(500);
    }
    await this.writeLocal();
    this.emit();
    return 'ok';
  }

  /** Server-issued run seed (provenance); falls back to a local seed offline. */
  async runSeed(biome: string): Promise<{ seed: number; online: boolean }> {
    if (this.meta.token) {
      const r = await api<{ seed: number }>('POST', '/api/runs', {
        token: this.meta.token,
        body: { biome },
        timeoutMs: 2500,
      });
      if (r.ok && r.data) return { seed: r.data.seed >>> 0, online: true };
    }
    return { seed: randomSeed(), online: false };
  }
}

function safeParse(data: unknown): AccountSave | null {
  const r = AccountSaveSchema.safeParse(data);
  return r.success ? r.data : null;
}

function randomSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0]!;
}

let store: AccountStore | null = null;
let loading: Promise<AccountStore> | null = null;

export function getStore(): Promise<AccountStore> {
  loading ??= (async () => {
    const s = new AccountStore();
    await s.load();
    store = s;
    s.scheduleSync(300);
    return s;
  })();
  return loading;
}

export function storeIfLoaded(): AccountStore | null {
  return store;
}
