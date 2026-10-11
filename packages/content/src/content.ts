import { ALLIES, ARTIFACTS } from './data/artifacts';
import { ARMOR } from './data/armor';
import { AFFIXES } from './data/affixes';
import { BIOMES } from './data/biomes';
import { ENEMIES } from './data/enemies';
import { PROJECTILES } from './data/projectiles';
import { NPC_LIST, NPCS, type NpcDef } from './data/npcs';
import { ROOM_TEMPLATES } from './data/rooms';
import { DIALOGS, QUESTS, STORY_RULES } from './data/story';
import { WEAPONS } from './data/weapons';
import {
  AffixDef,
  AllyDef,
  ArmorBase,
  ArtifactBase,
  BiomeDef,
  DialogDef,
  EnemyDef,
  ProjectileDef,
  QuestDef,
  RoomTemplate,
  StoryRule,
  WeaponBase,
  type Slot,
} from './schema';
import { spriteById } from './registry';

export type ItemBase =
  | { kind: 'weapon'; slot: 'weapon'; def: WeaponBase }
  | { kind: 'armor'; slot: 'helmet' | 'chest' | 'boots'; def: ArmorBase }
  | { kind: 'artifact'; slot: 'artifact'; def: ArtifactBase };

export interface Content {
  projectiles: ProjectileDef[];
  projectileIndex: Map<string, number>;
  weapons: WeaponBase[];
  armor: ArmorBase[];
  artifacts: ArtifactBase[];
  affixes: AffixDef[];
  affixById: Map<string, AffixDef>;
  enemies: EnemyDef[];
  enemyIndex: Map<string, number>;
  allies: AllyDef[];
  allyIndex: Map<string, number>;
  biomes: Map<string, BiomeDef>;
  rooms: RoomTemplate[];
  bases: Map<string, ItemBase>;
  basesBySlot: Map<Slot, ItemBase[]>;
  quests: QuestDef[];
  questById: Map<string, QuestDef>;
  dialogs: Map<string, DialogDef>;
  storyRules: StoryRule[];
  npcs: NpcDef[];
}

let cached: Content | undefined;

/**
 * Parsed (defaults applied) and cross-checked content. Throws with a readable message when data
 * is broken — the content test runs this, so broken data never reaches main.
 */
export function getContent(): Content {
  if (cached) return cached;
  const errors: string[] = [];
  const parseAll = <T>(
    name: string,
    schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } },
    list: unknown[],
  ): T[] =>
    list.map((item, i) => {
      const r = schema.safeParse(item);
      if (!r.success) {
        errors.push(`${name}[${i}] ${(item as { id?: string }).id ?? ''}: ${String(r.error)}`);
        return item as T;
      }
      return r.data as T;
    });

  const projectiles = parseAll<ProjectileDef>('projectile', ProjectileDef, PROJECTILES);
  const weapons = parseAll<WeaponBase>('weapon', WeaponBase, WEAPONS);
  const armor = parseAll<ArmorBase>('armor', ArmorBase, ARMOR);
  const artifacts = parseAll<ArtifactBase>('artifact', ArtifactBase, ARTIFACTS);
  const affixes = parseAll<AffixDef>('affix', AffixDef, AFFIXES);
  const enemies = parseAll<EnemyDef>('enemy', EnemyDef, ENEMIES);
  const allies = parseAll<AllyDef>('ally', AllyDef, ALLIES);
  const biomeList = parseAll<BiomeDef>('biome', BiomeDef, BIOMES);
  const rooms = parseAll<RoomTemplate>('room', RoomTemplate, ROOM_TEMPLATES);
  const quests = parseAll<QuestDef>('quest', QuestDef, QUESTS);
  const dialogList = parseAll<DialogDef>('dialog', DialogDef, DIALOGS);
  const storyRules = parseAll<StoryRule>('storyRule', StoryRule, STORY_RULES);

  const index = <T extends { id: string }>(name: string, list: T[]) => {
    const m = new Map<string, number>();
    list.forEach((x, i) => {
      if (m.has(x.id)) errors.push(`duplicate ${name} id '${x.id}'`);
      m.set(x.id, i);
    });
    return m;
  };
  const projectileIndex = index('projectile', projectiles);
  const enemyIndex = index('enemy', enemies);
  const allyIndex = index('ally', allies);
  index('affix', affixes);
  index('room', rooms);

  const needSprite = (where: string, id: string) => {
    if (!spriteById(id)) errors.push(`${where}: unknown sprite '${id}'`);
  };
  const needProj = (where: string, id: string) => {
    if (!projectileIndex.has(id)) errors.push(`${where}: unknown projectile '${id}'`);
  };

  for (const p of projectiles) needSprite(`projectile ${p.id}`, p.sprite);
  for (const w of weapons) {
    needSprite(`weapon ${w.id}`, w.sprite);
    needSprite(`weapon ${w.id} icon`, w.icon);
    if (w.attack.kind === 'projectile') needProj(`weapon ${w.id}`, w.attack.projectile);
  }
  for (const a of armor) needSprite(`armor ${a.id} icon`, a.icon);
  for (const a of artifacts) {
    needSprite(`artifact ${a.id} icon`, a.icon);
    for (const e of a.effects) {
      if (e.type === 'projectile') needProj(`artifact ${a.id}`, e.projectile);
      if (e.type === 'summon' && !allyIndex.has(e.ally))
        errors.push(`artifact ${a.id}: unknown ally '${e.ally}'`);
    }
  }
  for (const al of allies) {
    needSprite(`ally ${al.id}`, al.sprite);
    needProj(`ally ${al.id}`, al.projectile);
  }
  for (const e of enemies) {
    needSprite(`enemy ${e.id}`, e.sprite);
    for (const atk of [...e.attacks, ...e.phases.flatMap((p) => p.attacks)]) {
      const act = atk.action;
      if (act.type === 'projectile') needProj(`enemy ${e.id}.${atk.id}`, act.projectile);
      if (act.type === 'summon' && !enemyIndex.has(act.enemy))
        errors.push(`enemy ${e.id}.${atk.id}: unknown summon '${act.enemy}'`);
    }
  }
  const biomes = new Map<string, BiomeDef>();
  for (const b of biomeList) {
    biomes.set(b.id, b);
    for (const e of [...b.enemies.map((x) => x.id), ...b.minibosses, ...b.bosses]) {
      if (!enemyIndex.has(e)) errors.push(`biome ${b.id}: unknown enemy '${e}'`);
    }
    for (const c of b.captives)
      if (!NPCS[c.npc]) errors.push(`biome ${b.id}: unknown captive '${c.npc}'`);
  }

  // Story graph: every reference resolves.
  index('quest', quests);
  index('dialog', dialogList);
  const questById = new Map(quests.map((q) => [q.id, q]));
  const dialogs = new Map(dialogList.map((d) => [d.id, d]));
  for (const q of quests) {
    for (const n of q.next)
      if (!questById.has(n)) errors.push(`quest ${q.id}: unknown next '${n}'`);
    if (q.cutscene && !dialogs.has(q.cutscene))
      errors.push(`quest ${q.id}: unknown cutscene '${q.cutscene}'`);
  }
  for (const r of storyRules) {
    if (!dialogs.has(r.dialog)) errors.push(`story rule ${r.npc}: unknown dialog '${r.dialog}'`);
    for (const q of [...r.effects.startQuests, ...r.when.questDone])
      if (!questById.has(q)) errors.push(`story rule ${r.npc}: unknown quest '${q}'`);
    if (r.npc !== 'hub' && !NPCS[r.npc]) errors.push(`story rule: unknown npc '${r.npc}'`);
  }

  const bases = new Map<string, ItemBase>();
  const basesBySlot = new Map<Slot, ItemBase[]>();
  const addBase = (b: ItemBase) => {
    if (bases.has(b.def.id)) errors.push(`duplicate item base '${b.def.id}'`);
    bases.set(b.def.id, b);
    const list = basesBySlot.get(b.slot) ?? [];
    list.push(b);
    basesBySlot.set(b.slot, list);
  };
  for (const w of weapons) addBase({ kind: 'weapon', slot: 'weapon', def: w });
  for (const a of armor) addBase({ kind: 'armor', slot: a.slot, def: a });
  for (const a of artifacts) addBase({ kind: 'artifact', slot: 'artifact', def: a });

  if (errors.length) throw new Error(`Content errors:\n${errors.join('\n')}`);

  cached = {
    projectiles,
    projectileIndex,
    weapons,
    armor,
    artifacts,
    affixes,
    affixById: new Map(affixes.map((a) => [a.id, a])),
    enemies,
    enemyIndex,
    allies,
    allyIndex,
    biomes,
    rooms,
    bases,
    basesBySlot,
    quests,
    questById,
    dialogs,
    storyRules,
    npcs: NPC_LIST,
  };
  return cached;
}
