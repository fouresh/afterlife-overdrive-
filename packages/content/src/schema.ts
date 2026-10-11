import { z } from 'zod';

/**
 * Content schemas. Units: distances in pixels (1 tile = 16 px), speeds in px/s, times in seconds,
 * angles in degrees. Validated in tests (content.test.ts) and on the server — the client only
 * imports the inferred types, so zod is not in the game bundle.
 */

export const Stat = z.enum([
  'maxHp',
  'armor',
  'damagePct',
  'attackSpeedPct',
  'critChance',
  'critDamage',
  'moveSpeedPct',
  'hpRegen',
  'lifeSteal',
  'cooldownPct',
  'dashCharges',
  'pierce',
  'extraProjectiles',
  'thorns',
  'skillPowerPct',
  'goldFindPct',
]);
export type Stat = z.infer<typeof Stat>;

export const Slot = z.enum(['weapon', 'helmet', 'chest', 'boots', 'artifact']);
export type Slot = z.infer<typeof Slot>;

export const Attribute = z.enum(['str', 'dex', 'int']);

export const ProjectileDef = z.object({
  id: z.string(),
  sprite: z.string(),
  speed: z.number().positive(),
  range: z.number().positive(),
  radius: z.number().positive(),
  pierce: z.number().int().min(0).default(0),
  /** Turn rate toward the nearest target, deg/s. */
  homing: z.number().min(0).default(0),
  /** Glow color (additive light) as 0xRRGGBB. */
  glow: z.number().int().optional(),
  /** Particle trail color. */
  trail: z.number().int().optional(),
  /** Spin the sprite (deg/s) instead of pointing it along the velocity. */
  spin: z.number().default(0),
  /** Explodes on impact or at the end of range. */
  explode: z.object({ radius: z.number().positive(), damageMul: z.number().positive() }).optional(),
  /** Status applied on hit. */
  slow: z.number().min(0).default(0),
  burn: z.number().min(0).default(0),
});
export type ProjectileDef = z.infer<typeof ProjectileDef>;

const MeleeArc = z.object({
  kind: z.literal('melee_arc'),
  range: z.number().positive(),
  arc: z.number().positive().max(360),
  damage: z.number().positive(),
  cooldown: z.number().positive(),
  knockback: z.number().min(0),
  /** Melee swings destroy enemy projectiles inside the arc. */
  deflect: z.boolean().default(true),
});

const Thrust = z.object({
  kind: z.literal('thrust'),
  range: z.number().positive(),
  width: z.number().positive(),
  damage: z.number().positive(),
  cooldown: z.number().positive(),
  knockback: z.number().min(0),
  lunge: z.number().min(0).default(0),
});

const Shoot = z.object({
  kind: z.literal('projectile'),
  projectile: z.string(),
  damage: z.number().positive(),
  cooldown: z.number().positive(),
  count: z.number().int().positive().default(1),
  spread: z.number().min(0).default(0),
  knockback: z.number().min(0).default(40),
  /** Staff: hit in melee instead when an enemy is this close. */
  melee: z
    .object({
      range: z.number().positive(),
      arc: z.number().positive(),
      damage: z.number().positive(),
    })
    .optional(),
});

export const AttackDef = z.discriminatedUnion('kind', [MeleeArc, Thrust, Shoot]);
export type AttackDef = z.infer<typeof AttackDef>;

export const WeaponType = z.enum(['sword', 'axe', 'dagger', 'bow', 'crossbow', 'staff']);
export type WeaponType = z.infer<typeof WeaponType>;

export const WeaponBase = z.object({
  id: z.string(),
  type: WeaponType,
  nameKey: z.string(),
  /** Held sprite (points right, pivot at the grip). */
  sprite: z.string(),
  icon: z.string(),
  attribute: Attribute,
  attack: AttackDef,
  /** Minimum item level for this base to drop. */
  minLevel: z.number().int().min(1).default(1),
  weight: z.number().positive().default(1),
});
export type WeaponBase = z.infer<typeof WeaponBase>;

export const ArmorBase = z.object({
  id: z.string(),
  slot: z.enum(['helmet', 'chest', 'boots']),
  nameKey: z.string(),
  icon: z.string(),
  /** Paper-doll look: overlay shape (helmet/chest) and material ramp. */
  look: z.object({ shape: z.string().optional(), material: z.string() }),
  armor: z.number().min(0),
  maxHp: z.number().min(0).default(0),
  minLevel: z.number().int().min(1).default(1),
  weight: z.number().positive().default(1),
});
export type ArmorBase = z.infer<typeof ArmorBase>;

export const EffectDef = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('projectile'),
    projectile: z.string(),
    damage: z.number().positive(),
    count: z.number().int().positive().default(1),
    spread: z.number().min(0).default(0),
    aim: z.enum(['target', 'radial']).default('target'),
  }),
  z.object({
    type: z.literal('area'),
    at: z.enum(['self', 'target']),
    radius: z.number().positive(),
    damage: z.number().min(0),
    delay: z.number().min(0).default(0),
    knockback: z.number().min(0).default(0),
    slow: z.number().min(0).default(0),
    color: z.number().int(),
  }),
  z.object({
    type: z.literal('dash'),
    distance: z.number().positive(),
    damage: z.number().min(0).default(0),
    iframes: z.number().min(0),
  }),
  z.object({
    type: z.literal('buff'),
    damagePct: z.number().default(0),
    attackSpeedPct: z.number().default(0),
    moveSpeedPct: z.number().default(0),
    duration: z.number().positive(),
    color: z.number().int(),
  }),
  z.object({ type: z.literal('heal'), pctMaxHp: z.number().positive() }),
  z.object({
    type: z.literal('shield'),
    amount: z.number().positive(),
    duration: z.number().positive(),
  }),
  z.object({
    type: z.literal('summon'),
    ally: z.string(),
    count: z.number().int().positive(),
    duration: z.number().positive(),
  }),
]);
export type EffectDef = z.infer<typeof EffectDef>;

export const ArtifactBase = z.object({
  id: z.string(),
  nameKey: z.string(),
  descKey: z.string(),
  icon: z.string(),
  cooldown: z.number().positive(),
  effects: z.array(EffectDef).min(1),
  color: z.number().int(),
  minLevel: z.number().int().min(1).default(1),
  weight: z.number().positive().default(1),
});
export type ArtifactBase = z.infer<typeof ArtifactBase>;

export const AffixDef = z.object({
  id: z.string(),
  nameKey: z.string(),
  stat: Stat,
  slots: z.array(Slot).min(1),
  /** Value range at item level 1 and the per-level growth. */
  min: z.number(),
  max: z.number(),
  perLevel: z.number().min(0).default(0),
  /** Integer-valued stat (rounded). */
  integer: z.boolean().default(false),
  minLevel: z.number().int().min(1).default(1),
  weight: z.number().positive().default(10),
});
export type AffixDef = z.infer<typeof AffixDef>;

export const EnemyAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('melee'),
    range: z.number().positive(),
    arc: z.number().positive(),
    damage: z.number().positive(),
    knockback: z.number().min(0).default(100),
  }),
  z.object({
    type: z.literal('projectile'),
    projectile: z.string(),
    damage: z.number().positive(),
    count: z.number().int().positive().default(1),
    spread: z.number().min(0).default(0),
    aim: z.enum(['target', 'radial', 'spiral']).default('target'),
    /** Repeat the volley this many times during the action (bursts). */
    bursts: z.number().int().positive().default(1),
    burstInterval: z.number().min(0).default(0.15),
  }),
  z.object({
    type: z.literal('charge'),
    speed: z.number().positive(),
    duration: z.number().positive(),
    damage: z.number().positive(),
  }),
  z.object({
    type: z.literal('hop'),
    distance: z.number().positive(),
    duration: z.number().positive(),
    damage: z.number().positive(),
    radius: z.number().positive(),
  }),
  z.object({
    type: z.literal('summon'),
    enemy: z.string(),
    count: z.number().int().positive(),
    max: z.number().int().positive().default(6),
  }),
  z.object({
    type: z.literal('area'),
    at: z.enum(['self', 'target']),
    radius: z.number().positive(),
    damage: z.number().positive(),
    delay: z.number().min(0),
    count: z.number().int().positive().default(1),
    scatter: z.number().min(0).default(0),
  }),
  z.object({ type: z.literal('blink'), distance: z.number().positive() }),
]);
export type EnemyAction = z.infer<typeof EnemyAction>;

export const EnemyAttack = z.object({
  id: z.string(),
  minRange: z.number().min(0).default(0),
  maxRange: z.number().positive(),
  cooldown: z.number().positive(),
  windup: z.number().min(0),
  recover: z.number().min(0),
  los: z.boolean().default(true),
  action: EnemyAction,
});
export type EnemyAttack = z.infer<typeof EnemyAttack>;

export const MoveBehavior = z.enum([
  'chase',
  'keepDistance',
  'wander',
  'erratic',
  'still',
  'orbit',
]);
export type MoveBehavior = z.infer<typeof MoveBehavior>;

export const EnemyDef = z.object({
  id: z.string(),
  nameKey: z.string(),
  sprite: z.string(),
  hp: z.number().positive(),
  speed: z.number().min(0),
  radius: z.number().positive(),
  contactDamage: z.number().min(0).default(0),
  move: MoveBehavior,
  preferredRange: z.number().min(0).default(0),
  flying: z.boolean().default(false),
  phasing: z.boolean().default(false),
  knockbackResist: z.number().min(0).max(1).default(0),
  xp: z.number().min(0),
  gold: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  rank: z.enum(['normal', 'elite', 'miniboss', 'boss']).default('normal'),
  /** Particle color when hit. */
  blood: z.number().int(),
  attacks: z.array(EnemyAttack).default([]),
  /** Boss phases: attack lists that replace `attacks` below an HP fraction. */
  phases: z
    .array(
      z.object({
        below: z.number().min(0).max(1),
        attacks: z.array(EnemyAttack),
        speedMul: z.number().default(1),
      }),
    )
    .default([]),
});
export type EnemyDef = z.infer<typeof EnemyDef>;

export const AllyDef = z.object({
  id: z.string(),
  sprite: z.string(),
  projectile: z.string(),
  damage: z.number().positive(),
  cooldown: z.number().positive(),
  range: z.number().positive(),
});
export type AllyDef = z.infer<typeof AllyDef>;

export const RoomTemplate = z.object({
  id: z.string(),
  /** Room types the template can be stamped into. */
  types: z.array(z.string()).min(1),
  /**
   * Interior pattern, centered in the room. Legend: '.' keep floor, '#' wall block,
   * 'P' pillar, 'O' pit, 'S' spikes, 'b' bones, 'e' preferred enemy spawn, 'c' chest/feature spot.
   * Any other char = don't care.
   */
  rows: z.array(z.string()).min(1),
  weight: z.number().positive().default(1),
  /** Only in these biomes (undefined = every biome). */
  biomes: z.array(z.string()).optional(),
});
export type RoomTemplate = z.infer<typeof RoomTemplate>;

export const BiomeDef = z.object({
  id: z.string(),
  nameKey: z.string(),
  tileset: z.string(),
  generator: z.enum(['bsp', 'glades', 'caves', 'modules']),
  enemies: z.array(
    z.object({
      id: z.string(),
      weight: z.number().positive(),
      minDepth: z.number().int().min(0).default(0),
    }),
  ),
  minibosses: z.array(z.string()).min(1),
  bosses: z.array(z.string()).min(1),
  /** Decor props per floor tile chance. */
  decor: z.record(z.string(), z.number().min(0).max(1)),
  /** Torches on room walls every N tiles (0 = none). */
  torchSpacing: z.number().int().min(0),
  spikeChance: z.number().min(0).max(1),
  roomCount: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  /** Floors in a run of this biome (the last one has the boss). */
  floors: z.number().int().min(1).max(6).default(3),
  /** Story flag that unlocks the biome in the portal (undefined = always open). */
  requires: z.string().optional(),
  /** Story NPCs held captive on a floor (appear while someone in the run looks for them). */
  captives: z.array(z.object({ npc: z.string(), depth: z.number().int().min(0) })).default([]),
  /** Floor tiles that get a glowing light prop (forest mushrooms), per tile chance. */
  lights: z.number().min(0).max(1).default(0),
});
export type BiomeDef = z.infer<typeof BiomeDef>;

export const QuestDef = z.object({
  id: z.string(),
  chapter: z.number().int().min(1),
  /** Main story quest (shown in the HUD journal line) or a side quest. */
  main: z.boolean().default(false),
  titleKey: z.string(),
  descKey: z.string(),
  /** Story event that completes the quest (e.g. 'clear:forest', 'rescue:borgan'). */
  goal: z.string(),
  reward: z
    .object({
      xp: z.number().int().min(0).default(0),
      gold: z.number().int().min(0).default(0),
      flags: z.array(z.string()).default([]),
    })
    .default({ xp: 0, gold: 0, flags: [] }),
  /** Quests started when this one completes. */
  next: z.array(z.string()).default([]),
  /** Cutscene shown after the run that completed the quest. */
  cutscene: z.string().optional(),
});
export type QuestDef = z.infer<typeof QuestDef>;

export const Speaker = z.enum(['mira', 'borgan', 'trader', 'hero', 'core', 'narrator']);
export type Speaker = z.infer<typeof Speaker>;

export const DialogDef = z.object({
  id: z.string(),
  /** [speaker, text key] */
  lines: z.array(z.tuple([Speaker, z.string()])).min(1),
});
export type DialogDef = z.infer<typeof DialogDef>;

/**
 * When a dialog plays: talking to an NPC (or entering the hub, npc = 'hub') with the character's
 * story state matching `when`. The first matching rule wins; then its effects apply.
 */
export const StoryRule = z.object({
  npc: z.string(),
  when: z
    .object({
      flags: z.array(z.string()).default([]),
      notFlags: z.array(z.string()).default([]),
      questDone: z.array(z.string()).default([]),
    })
    .default({ flags: [], notFlags: [], questDone: [] }),
  dialog: z.string(),
  effects: z
    .object({
      flags: z.array(z.string()).default([]),
      startQuests: z.array(z.string()).default([]),
    })
    .default({ flags: [], startQuests: [] }),
});
export type StoryRule = z.infer<typeof StoryRule>;
