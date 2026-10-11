-- Multiplayer rooms directory (M3). The Durable Object of a room keeps the real state;
-- this table only lists open rooms and reserves codes.
CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  public INTEGER NOT NULL DEFAULT 0,
  players INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'lobby',
  leader_name TEXT NOT NULL DEFAULT '',
  leader_level INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rooms_public ON rooms (public, updated_at);
