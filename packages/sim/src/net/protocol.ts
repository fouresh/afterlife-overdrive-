import { validateName } from '@ao/shared';
import { z } from 'zod';
import type { RunResult } from '../account';
import type { PlayerSetup } from '../player';
import type { Difficulty } from '../run';
import {
  AppearanceSchema,
  CharacterSchema,
  ItemSchema,
  LoadoutSchema,
  type Character,
} from '../save';
import type { ItemInstance } from '../items';
import { activeGoals } from '../story';
import type { Loadout } from '../stats';
import type { ShopSlot } from '../world';

/**
 * Control messages of a multiplayer room (JSON text frames: rare, so readability wins).
 * Hot traffic — inputs and snapshots — is binary (see @ao/shared net.ts and snapshot.ts).
 * The server parses every client message with these schemas.
 */

/** What a client tells the room about its hero (validated like a cloud save). */
export const NetCharSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(2).max(16),
  appearance: AppearanceSchema,
  hardcore: z.boolean(),
  origin: z.string().max(16),
  level: z.number().int().min(1).max(60),
  attrs: CharacterSchema.shape.attrs,
  loadout: LoadoutSchema,
  potions: z.number().int().min(0).max(3),
  elixir: z.string().max(16).nullable(),
  /** Goals of active story quests (captives spawn only while someone needs them). */
  quests: z.array(z.string().max(48)).max(20).default([]),
});
export type NetChar = z.infer<typeof NetCharSchema>;

/** Extra checks a schema cannot express. Returns an error code or null. */
export function checkNetChar(c: NetChar): string | null {
  if (validateName(c.name)) return 'bad_name';
  const a = c.attrs;
  if (a.str + a.dex + a.int + a.vit > 3 * (c.level - 1)) return 'bad_attrs';
  return null;
}

export function netCharOf(c: Character): NetChar {
  return {
    id: c.id,
    name: c.name,
    appearance: c.appearance,
    hardcore: c.hardcore,
    origin: c.origin,
    level: c.level,
    attrs: { ...c.attrs },
    loadout: JSON.parse(JSON.stringify(c.loadout)) as Loadout,
    potions: c.potions,
    elixir: c.elixir,
    quests: activeGoals(c),
  };
}

/** Same as runSetup() but from the network snapshot of the hero. */
export function setupOfNetChar(c: NetChar): PlayerSetup {
  return {
    loadout: JSON.parse(JSON.stringify(c.loadout)) as Loadout,
    potions: c.potions,
    hardcore: c.hardcore,
    quests: [...c.quests],
    progress: { level: c.level, attrs: { ...c.attrs }, origin: c.origin, elixir: c.elixir },
  };
}

export const DifficultySchema = z.enum(['normal', 'hard', 'nightmare']);
export const VoteChoiceSchema = z.enum(['deeper', 'leave']);
export type VoteChoice = z.infer<typeof VoteChoiceSchema>;

export const ClientMsgSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('char'), char: NetCharSchema }),
  z.object({
    t: z.literal('start'),
    biome: z.string().min(1).max(24),
    difficulty: DifficultySchema,
  }),
  z.object({ t: z.literal('kick'), slot: z.number().int().min(0).max(7) }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('public'), value: z.boolean() }),
  z.object({ t: z.literal('ready') }),
  z.object({ t: z.literal('vote'), choice: VoteChoiceSchema }),
  z.object({
    t: z.literal('equip'),
    bag: z.number().int().min(0).max(63),
    slot: z.union([z.literal(0), z.literal(1)]),
  }),
  z.object({ t: z.literal('drop'), bag: z.number().int().min(0).max(63) }),
  z.object({ t: z.literal('quit') }),
  z.object({ t: z.literal('ack') }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export interface LobbyMember {
  slot: number;
  name: string;
  level: number;
  hardcore: boolean;
  appearance: NetChar['appearance'];
  online: boolean;
  inRun: boolean;
}

export type RoomPhase = 'lobby' | 'run';

export interface RunInfo {
  seed: number;
  biome: string;
  floors: number;
  difficulty: Difficulty;
}

export interface NetPlayerInfo {
  index: number;
  slot: number;
  name: string;
  hardcore: boolean;
  appearance: NetChar['appearance'];
  loadout: Loadout;
}

export interface NetRunResult {
  outcome: RunResult['outcome'];
  carry: PlayerSetup;
  depth: number;
  bossKilled: boolean;
  seconds: number;
  killedBy: string;
}

export type ServerMsg =
  | { t: 'welcome'; code: string; slot: number; protocol: number }
  | {
      t: 'lobby';
      code: string;
      public: boolean;
      leader: number;
      state: RoomPhase;
      run: RunInfo | null;
      members: LobbyMember[];
    }
  | {
      t: 'floor';
      run: RunInfo;
      depth: number;
      you: number;
      players: NetPlayerInfo[];
      shop: ShopSlot[];
    }
  | { t: 'look'; index: number; loadout: Loadout }
  | { t: 'inv'; bag: ItemInstance[]; loadout: Loadout; potions: number }
  | { t: 'vote'; leftMs: number; choices: (VoteChoice | 'dead' | null)[] }
  | { t: 'result'; result: NetRunResult }
  | { t: 'runEnd' }
  | { t: 'kicked' }
  | { t: 'error'; code: string };

/** Max members per room (and players per run). */
export const ROOM_SIZE = 4;
/** Seconds a disconnected player keeps their seat (Wi-Fi ↔ LTE switch, tunnel, app switch). */
export const RECONNECT_GRACE_S = 45;
/** Seconds to choose "deeper / leave" at the stairs. */
export const VOTE_S = 30;

/** Room codes: 5 characters without look-alikes (no 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;

export function normalizeRoomCode(s: string): string | null {
  const c = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of c) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return c;
}

export { ItemSchema };
