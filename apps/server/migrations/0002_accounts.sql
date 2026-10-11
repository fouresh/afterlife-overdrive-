-- Anonymous accounts with cloud saves (M2).
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  -- SHA-256 of the recovery code (the code itself is never stored).
  recovery_hash TEXT UNIQUE,
  rev INTEGER NOT NULL DEFAULT 0,
  save TEXT
);

-- One row per device token (SHA-256 of the token). Several devices may share an account.
CREATE TABLE IF NOT EXISTS devices (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS devices_account ON devices (account_id);

-- Server-issued run seeds (loot provenance for the future auction).
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  biome TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_account ON runs (account_id, created_at);

-- Fixed-window rate limits (key = action:subject).
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
