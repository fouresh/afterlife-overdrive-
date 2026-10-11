import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type Val = string | number | null;

/** Minimal D1Database implementation over node:sqlite for unit tests. */
export function createTestD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, '..', 'migrations');
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (sql: string, args: Val[] = []) => ({
    bind: (...a: Val[]) => stmt(sql, a),
    first: async <T>(col?: string) => {
      const row = db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
      if (!row) return null;
      return (col ? row[col] : { ...row }) as T;
    },
    all: async <T>() => ({
      results: db
        .prepare(sql)
        .all(...args)
        .map((r) => ({ ...r })) as T[],
      success: true,
      meta: {},
    }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return {
        success: true,
        meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
      };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async () => [],
  } as unknown as D1Database;
}
