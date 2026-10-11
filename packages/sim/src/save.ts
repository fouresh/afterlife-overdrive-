import {
  CLOTH_COLORS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  SKIN_TONES,
  type Appearance,
} from '@ao/content';
import { SAVE_SCHEMA_VERSION, cleanName, deriveSeed, hashString, validateName } from '@ao/shared';
import { z } from 'zod';
import { CONTRACTS } from './progression';
import { emptyMarket, emptyMaterials } from './economy';
import { emptyLoadout, type Loadout } from './stats';
import type { ItemInstance } from './items';

/**
 * Versioned account save (client IndexedDB cache + D1 in the cloud). The server parses every
 * upload with these schemas: it never trusts the client's JSON.
 */
export const ItemSchema = z.object({
  uid: z.string().min(1).max(64),
  base: z.string().min(1).max(48),
  rarity: z.number().int().min(0).max(4),
  level: z.number().int().min(1).max(99),
  affixes: z
    .array(z.object({ id: z.string().max(32), v: z.number().finite().min(-1000).max(1000) }))
    .max(6),
  seed: z.number().int().min(0).max(0xffffffff),
});

const nullableItem = ItemSchema.nullable();

export const LoadoutSchema = z.object({
  weapon: nullableItem,
  helmet: nullableItem,
  chest: nullableItem,
  boots: nullableItem,
  artifacts: z.tuple([nullableItem, nullableItem]),
});

export const AppearanceSchema = z.object({
  gender: z.enum(['m', 'f']),
  skin: z
    .number()
    .int()
    .min(0)
    .max(SKIN_TONES.length - 1),
  hairStyle: z.enum(HAIR_STYLES),
  hairColor: z
    .number()
    .int()
    .min(0)
    .max(HAIR_COLORS.length - 1),
  eyeColor: z
    .number()
    .int()
    .min(0)
    .max(EYE_COLORS.length - 1),
  clothColor: z
    .number()
    .int()
    .min(0)
    .max(CLOTH_COLORS.length - 1),
  pantsColor: z
    .number()
    .int()
    .min(0)
    .max(CLOTH_COLORS.length - 1),
});

const MaterialsSchema = z.object({
  dust: z.number().int().min(0).max(1e7),
  essence: z.number().int().min(0).max(1e7),
  shard: z.number().int().min(0).max(1e7),
});

export const CharacterSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(2).max(16),
  appearance: AppearanceSchema,
  hardcore: z.boolean(),
  origin: z.string().max(16),
  level: z.number().int().min(1).max(60),
  xp: z.number().int().min(0).max(1e9),
  attrs: z.object({
    str: z.number().int().min(0).max(500),
    dex: z.number().int().min(0).max(500),
    int: z.number().int().min(0).max(500),
    vit: z.number().int().min(0).max(500),
  }),
  unspent: z.number().int().min(0).max(500),
  loadout: LoadoutSchema,
  potions: z.number().int().min(0).max(3),
  elixir: z.string().max(16).nullable(),
  dead: z.boolean(),
  death: z.object({ at: z.number(), depth: z.number().int(), by: z.string().max(32) }).nullable(),
  createdAt: z.number(),
  stats: z.object({
    runs: z.number().int().min(0),
    kills: z.number().int().min(0),
    victories: z.number().int().min(0),
    deaths: z.number().int().min(0),
    bestDepth: z.number().int().min(0),
    seconds: z.number().min(0),
  }),
  story: z.object({
    chapter: z.number().int().min(1).max(10),
    flags: z.array(z.string().max(32)).max(200),
    quests: z.record(z.string().max(32), z.number().int()),
  }),
  introSeen: z.boolean(),
});

export const ContractSchema = z.object({
  id: z.string().max(32),
  progress: z.number().int().min(0),
});

export const RealmSchema = z.object({
  seed: z.number().int().min(0).max(0xffffffff),
  stash: z.array(ItemSchema).max(200),
  gold: z.number().int().min(0).max(1e9),
  materials: MaterialsSchema,
  crafts: z.number().int().min(0),
  market: z.object({
    day: z.number().int().min(0),
    bought: z.array(z.number().int().min(0).max(20)).max(20),
    saturation: z.record(z.string(), z.number().min(0).max(1)),
    decayAt: z.number().min(0),
  }),
  contracts: z.array(ContractSchema).max(5),
  contractsDone: z.number().int().min(0),
});

export const AccountSaveSchema = z.object({
  v: z.literal(SAVE_SCHEMA_VERSION),
  rev: z.number().int().min(0),
  updatedAt: z.number().min(0),
  characters: z.array(CharacterSchema).max(24),
  realms: z.object({ standard: RealmSchema, hardcore: RealmSchema }),
  settings: z.object({ muted: z.boolean() }),
});

export type Character = z.infer<typeof CharacterSchema>;
export type Realm = z.infer<typeof RealmSchema>;
export type AccountSave = z.infer<typeof AccountSaveSchema>;

export const MAX_LIVING_CHARACTERS = 6;
export const STASH_SIZE = 120;

export function newRealm(seed: number): Realm {
  return {
    seed: seed >>> 0,
    stash: [],
    gold: 0,
    materials: emptyMaterials(),
    crafts: 0,
    market: { ...emptyMarket() },
    contracts: CONTRACTS.slice(0, 3).map((c) => ({ id: c.id, progress: 0 })),
    contractsDone: 0,
  };
}

export function newSave(seed: number, now: number): AccountSave {
  return {
    v: SAVE_SCHEMA_VERSION,
    rev: 0,
    updatedAt: now,
    characters: [],
    realms: {
      standard: newRealm(deriveSeed(seed, 'std')),
      hardcore: newRealm(deriveSeed(seed, 'hc')),
    },
    settings: { muted: false },
  };
}

export interface NewCharacter {
  name: string;
  appearance: Appearance;
  hardcore: boolean;
  origin: string;
  weapon: ItemInstance;
  artifact: ItemInstance;
}

export function createCharacter(n: NewCharacter, id: string, now: number): Character {
  const name = cleanName(n.name);
  if (validateName(name)) throw new Error('invalid name');
  const loadout: Loadout = emptyLoadout();
  loadout.weapon = n.weapon;
  loadout.artifacts[0] = n.artifact;
  return {
    id,
    name,
    appearance: n.appearance,
    hardcore: n.hardcore,
    origin: n.origin,
    level: 1,
    xp: 0,
    attrs: { str: 0, dex: 0, int: 0, vit: 0 },
    unspent: 0,
    loadout,
    potions: 1,
    elixir: null,
    dead: false,
    death: null,
    createdAt: now,
    stats: { runs: 0, kills: 0, victories: 0, deaths: 0, bestDepth: 0, seconds: 0 },
    story: { chapter: 1, flags: [], quests: {} },
    introSeen: false,
  };
}

export function realmOf(save: AccountSave, c: Character): Realm {
  return c.hardcore ? save.realms.hardcore : save.realms.standard;
}

/** M1 local profile (localStorage `ao.profile.v1`). */
export interface ProfileV1 {
  v: 1;
  loadout: Loadout;
  stash: ItemInstance[];
  gold: number;
  runs: number;
  deaths: number;
  victories: number;
  bestDepth: number;
}

/**
 * Migrate anything older into the current save format. v1 (M1 profile) becomes a standard
 * character "Странник" with the same gear, plus its stash and gold in the standard realm.
 */
export function migrateSave(data: unknown, now: number): AccountSave {
  const d = data as { v?: number } | null;
  if (d && d.v === SAVE_SCHEMA_VERSION) return AccountSaveSchema.parse(d);
  if (d && d.v === 1) {
    const p = d as ProfileV1;
    const save = newSave(hashString(JSON.stringify(p.loadout)) ^ 0x5a17, now);
    const c = createCharacter(
      {
        name: 'Странник',
        appearance: {
          gender: 'm',
          skin: 1,
          hairStyle: 'short',
          hairColor: 1,
          eyeColor: 1,
          clothColor: 1,
          pantsColor: 7,
        },
        hardcore: false,
        origin: 'truck',
        weapon: p.loadout.weapon ?? {
          uid: 'starter-sword.rusty',
          base: 'sword.rusty',
          rarity: 0,
          level: 1,
          affixes: [],
          seed: 0,
        },
        artifact: p.loadout.artifacts[0] ?? {
          uid: 'starter-art.fireball',
          base: 'art.fireball',
          rarity: 0,
          level: 1,
          affixes: [],
          seed: 0,
        },
      },
      'c-migrated',
      now,
    );
    c.loadout = p.loadout;
    c.introSeen = true;
    c.stats.runs = p.runs;
    c.stats.deaths = p.deaths;
    c.stats.victories = p.victories;
    c.stats.bestDepth = p.bestDepth;
    save.characters.push(c);
    save.realms.standard.stash = p.stash.slice(0, STASH_SIZE);
    save.realms.standard.gold = p.gold;
    return AccountSaveSchema.parse(save);
  }
  throw new Error(`Unknown save version ${String(d?.v)}`);
}

export { emptyMarket };
