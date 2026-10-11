import type { BinReader, BinWriter } from './binary';
import type { PlayerInput } from './input';

/**
 * Binary message types (first byte of every binary WebSocket frame). Rare control messages
 * (lobby, results) are JSON text frames instead — see packages/sim/src/net/protocol.ts.
 */
export const MsgType = {
  /** Server → client: delta snapshot. */
  Snapshot: 1,
  /** Client → server: input changes. */
  Input: 2,
} as const;

/**
 * "From tick `seq` on, the input is `input`". Clients only send changes: the server keeps
 * applying the last input until the next change arrives (holding a direction costs nothing).
 */
export interface InputChange {
  seq: number;
  input: PlayerInput;
}

export interface InputPacket {
  changes: InputChange[];
}

/** Limits enforced by the server parser. */
export const INPUT_MAX_CHANGES = 16;
export const INPUT_MAX_SPAN = 90;

export function writeInputPacket(w: BinWriter, changes: readonly InputChange[]): void {
  w.u8(MsgType.Input)
    .varu(changes[0]?.seq ?? 0)
    .u8(changes.length);
  let prev = changes[0]?.seq ?? 0;
  for (const c of changes) {
    w.varu(c.seq - prev)
      .i8(c.input.mx)
      .i8(c.input.my)
      .u8(c.input.aim)
      .u8(c.input.buttons);
    prev = c.seq;
  }
}

/** Parse an input packet (after the type byte). Returns null when malformed. */
export function readInputPacket(r: BinReader): InputPacket | null {
  try {
    const first = r.varu();
    const n = r.u8();
    if (n === 0 || n > INPUT_MAX_CHANGES) return null;
    const changes: InputChange[] = [];
    let seq = first;
    for (let k = 0; k < n; k++) {
      const d = r.varu();
      if (k > 0 && d === 0) return null;
      seq += d;
      if (seq - first > INPUT_MAX_SPAN) return null;
      const mx = r.i8();
      const my = r.i8();
      const aim = r.u8();
      const buttons = r.u8() & 0x7f;
      changes.push({ seq, input: { mx: clampAxis(mx), my: clampAxis(my), aim, buttons } });
    }
    return { changes };
  } catch {
    return null;
  }
}

function clampAxis(v: number): number {
  return v < -127 ? -127 : v;
}

export function sameInput(a: PlayerInput, b: PlayerInput): boolean {
  return a.mx === b.mx && a.my === b.my && a.aim === b.aim && a.buttons === b.buttons;
}
