-- Schema bookkeeping. Tables for accounts/characters arrive in later migrations (M2).
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('created', strftime('%s', 'now'));
