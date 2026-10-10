import type { RoomDO } from './room';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ROOMS: DurableObjectNamespace<RoomDO>;
  ENVIRONMENT: string;
}
