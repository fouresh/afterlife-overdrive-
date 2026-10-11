import {
  copyInput,
  emptyInput,
  sameInput,
  type InputChange,
  type InputPacket,
  type PlayerInput,
} from '@ao/shared';
import { predictPlayer } from '../player';
import type { SimPlayer, World } from '../world';
import { applyNetSelf, type NetSelf } from './snapshot';

/** Ticks of input buffered by the server against network jitter (adapted at runtime). */
export const INPUT_JITTER_TICKS = 2;
const MAX_STALL_TICKS = 6;
const QUEUE_CAP = 64;
/** Client sequence numbers start here (keeps every valid ack positive). */
export const FIRST_INPUT_SEQ = 1000;

/**
 * Server side: per-player input timeline. The client sends only *changes* ("from tick N the
 * input is X"); every server tick advances the timeline by one sequence number and applies the
 * latest change at or before it — so a held direction needs no traffic. A change that arrives
 * after its tick is applied at once (a small misprediction the client corrects) and its button
 * presses are kept, so a tap is never lost. `ack` = sequence number of the last simulated tick.
 */
export class InputQueue {
  private seqs = new Int32Array(QUEUE_CAP);
  private inputs: PlayerInput[] = [];
  private head = 0;
  private size = 0;
  /** Sequence number simulated next (valid once aligned). */
  next = 0;
  aligned = false;
  /** Last simulated sequence number (-1 = nothing yet). */
  ack = -1;
  private last = emptyInput();
  private pressed = 0;
  private stall = 0;
  private minSlack = 1e9;
  private slackTicks = 0;
  /** Stats for tests and the debug overlay. */
  late = 0;

  constructor() {
    for (let k = 0; k < QUEUE_CAP; k++) this.inputs.push(emptyInput());
  }

  /** Forget the alignment (reconnect, new floor). The player stands still until inputs arrive. */
  reset(): void {
    this.size = 0;
    this.head = 0;
    this.next = 0;
    this.aligned = false;
    this.ack = -1;
    this.last = emptyInput();
    this.pressed = 0;
    this.stall = 0;
    this.minSlack = 1e9;
    this.slackTicks = 0;
  }

  push(pkt: InputPacket): void {
    const first = pkt.changes[0];
    if (!first) return;
    if (!this.aligned) {
      this.aligned = true;
      this.next = first.seq - INPUT_JITTER_TICKS;
    }
    const slack = first.seq - this.next;
    if (slack < this.minSlack) this.minSlack = slack;
    if (slack < 0) {
      // Late: hold the timeline back a little to absorb this much jitter next time.
      this.late++;
      this.stall = Math.min(MAX_STALL_TICKS, this.stall + Math.min(-slack, 3));
    }
    for (const c of pkt.changes) {
      if (c.seq < this.next) {
        // Its tick is already simulated: apply now, keep the presses.
        copyInput(this.last, c.input);
        this.pressed |= c.input.buttons;
        continue;
      }
      this.enqueue(c);
    }
  }

  private enqueue(c: InputChange): void {
    if (this.size > 0) {
      const tail = (this.head + this.size - 1) % QUEUE_CAP;
      if (c.seq <= this.seqs[tail]!) return; // duplicate / out of order
    }
    if (this.size === QUEUE_CAP) this.pop();
    const k = (this.head + this.size) % QUEUE_CAP;
    this.seqs[k] = c.seq;
    copyInput(this.inputs[k]!, c.input);
    this.size++;
  }

  private pop(): void {
    copyInput(this.last, this.inputs[this.head]!);
    this.pressed |= this.last.buttons;
    this.head = (this.head + 1) % QUEUE_CAP;
    this.size--;
  }

  /** The input for this server tick (written into `out`). */
  take(out: PlayerInput): void {
    if (!this.aligned) {
      copyInput(out, this.last);
      return;
    }
    if (++this.slackTicks >= 60) {
      // Changes keep arriving much earlier than needed: shorten the buffer by one tick.
      if (this.minSlack !== 1e9 && this.minSlack > INPUT_JITTER_TICKS + 3) this.next++;
      this.minSlack = 1e9;
      this.slackTicks = 0;
    }
    if (this.stall > 0) {
      // Simulate a tick without advancing the client timeline (grows the jitter buffer).
      this.stall--;
    } else {
      while (this.size > 0 && this.seqs[this.head]! <= this.next) this.pop();
      this.ack = this.next;
      this.next++;
    }
    copyInput(out, this.last);
    // Buttons of changes that were never simulated on their own tick still count once.
    out.buttons |= this.pressed;
    this.pressed = 0;
  }

  /** Client went away: stop moving (buttons released). */
  release(): void {
    this.last = emptyInput();
    this.size = 0;
    this.pressed = 0;
  }
}

const HISTORY = 256;

/**
 * Client side: assigns sequence numbers to local ticks, predicts the local player, collects input
 * changes into packets and re-simulates unacknowledged ticks when an authoritative state arrives.
 */
export class Predictor {
  /** Next sequence number. */
  seq = FIRST_INPUT_SEQ;
  private hist: PlayerInput[] = [];
  private histSeq = new Int32Array(HISTORY).fill(-1);
  private pending: InputChange[] = [];
  private pendingPress = false;
  private prev: PlayerInput | null = null;
  /** Smoothed visual correction (px) applied after a misprediction. */
  errX = 0;
  errY = 0;
  /** Last reconciliation error (px), for the debug overlay. */
  lastError = 0;

  constructor() {
    for (let k = 0; k < HISTORY; k++) this.hist.push(emptyInput());
  }

  /** The server lost our input state (reconnect, new floor): send the current input again. */
  resend(): void {
    this.prev = null;
  }

  /** Record this tick's input, predict the local player and queue a change if any. */
  tick(w: World, p: SimPlayer, input: PlayerInput): void {
    const s = this.seq++;
    const k = s % HISTORY;
    copyInput(this.hist[k]!, input);
    this.histSeq[k] = s;
    predictPlayer(w, p, input);
    if (this.prev && sameInput(this.prev, input)) return;
    if (input.buttons & ~(this.prev?.buttons ?? 0)) this.pendingPress = true;
    this.prev = { ...input };
    this.pending.push({ seq: s, input: { ...input } });
  }

  /**
   * Take the pending changes if it is time to send: at most every `intervalMs` (default 100),
   * sooner (≥ `pressMs`) when a button was just pressed, or when the packet is getting big.
   */
  flush(nowMs: number, lastSendMs: number, intervalMs = 100, pressMs = 33): InputChange[] | null {
    if (this.pending.length === 0) return null;
    const since = nowMs - lastSendMs;
    const first = this.pending[0]!.seq;
    const big = this.pending.length >= 12 || this.seq - first >= 60;
    if (since < intervalMs && !(this.pendingPress && since >= pressMs) && !big) return null;
    const out = this.pending;
    this.pending = [];
    this.pendingPress = false;
    return out;
  }

  /**
   * Snap to the authoritative state and replay inputs after `self.ack`. The visual jump is
   * hidden by an error offset that decays over a few frames. Returns the error in px.
   */
  reconcile(w: World, p: SimPlayer, self: NetSelf): number {
    const e = w.e;
    if (self.ack < 0) {
      // The server has not simulated any of our inputs yet: only take the HUD fields.
      const x = e.x[p.ent]!;
      const y = e.y[p.ent]!;
      applyNetSelf(w, p, self);
      e.x[p.ent] = x;
      e.y[p.ent] = y;
      return 0;
    }
    const oldX = e.x[p.ent]!;
    const oldY = e.y[p.ent]!;
    applyNetSelf(w, p, self);
    for (let s = Math.max(self.ack + 1, this.seq - HISTORY + 1); s < this.seq; s++) {
      const k = s % HISTORY;
      if (this.histSeq[k] !== s) continue;
      predictPlayer(w, p, this.hist[k]!);
    }
    const dx = oldX - e.x[p.ent]!;
    const dy = oldY - e.y[p.ent]!;
    const err = Math.sqrt(dx * dx + dy * dy);
    this.lastError = err;
    if (err > 48) {
      // Teleport (doors closing, pulled into a room): no smoothing.
      this.errX = 0;
      this.errY = 0;
    } else {
      this.errX += dx;
      this.errY += dy;
    }
    return err;
  }

  /** Decay the visual error offset (call once per rendered frame). */
  decay(dt: number): void {
    const k = Math.max(0, 1 - dt * 12);
    this.errX *= k;
    this.errY *= k;
    if (Math.abs(this.errX) < 0.05) this.errX = 0;
    if (Math.abs(this.errY) < 0.05) this.errY = 0;
  }
}
