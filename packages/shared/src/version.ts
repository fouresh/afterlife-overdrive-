/** Bump when the binary network protocol changes incompatibly. */
export const PROTOCOL_VERSION = 1;
/** Bump when the save format changes; add a migration in the client/server save code. */
export const SAVE_SCHEMA_VERSION = 2;
/** Simulation rate. Sim, client prediction and server all step at this fixed rate. */
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;
/** World tile size in pixels. */
export const TILE = 16;

export function secToTicks(sec: number): number {
  return Math.max(0, Math.round(sec * TICK_RATE));
}
