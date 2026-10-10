import { getContent } from '@ao/content';
import { itemBase, levelScale, type ItemInstance } from './items';

export interface PlayerStats {
  maxHp: number;
  armor: number;
  damagePct: number;
  attackSpeedPct: number;
  critChance: number;
  critDamage: number;
  moveSpeedPct: number;
  hpRegen: number;
  lifeSteal: number;
  cooldownPct: number;
  dashCharges: number;
  pierce: number;
  extraProjectiles: number;
  thorns: number;
  skillPowerPct: number;
  goldFindPct: number;
}

export interface Loadout {
  weapon: ItemInstance | null;
  helmet: ItemInstance | null;
  chest: ItemInstance | null;
  boots: ItemInstance | null;
  artifacts: [ItemInstance | null, ItemInstance | null];
}

export function emptyLoadout(): Loadout {
  return { weapon: null, helmet: null, chest: null, boots: null, artifacts: [null, null] };
}

export function baseStats(): PlayerStats {
  return {
    maxHp: 100,
    armor: 0,
    damagePct: 0,
    attackSpeedPct: 0,
    critChance: 5,
    critDamage: 50,
    moveSpeedPct: 0,
    hpRegen: 0,
    lifeSteal: 0,
    cooldownPct: 0,
    dashCharges: 1,
    pierce: 0,
    extraProjectiles: 0,
    thorns: 0,
    skillPowerPct: 0,
    goldFindPct: 0,
  };
}

export function loadoutItems(l: Loadout): ItemInstance[] {
  return [l.weapon, l.helmet, l.chest, l.boots, ...l.artifacts].filter(
    (x): x is ItemInstance => !!x,
  );
}

/** Derive stats from equipment (+ M2: level and attributes via `bonus`). */
export function computeStats(l: Loadout, bonus?: Partial<PlayerStats>): PlayerStats {
  const s = baseStats();
  const affixes = getContent().affixById;
  for (const item of loadoutItems(l)) {
    const b = itemBase(item);
    if (b.kind === 'armor') {
      s.armor += Math.round(b.def.armor * levelScale(item.level));
      s.maxHp += b.def.maxHp;
    }
    for (const a of item.affixes) {
      const def = affixes.get(a.id);
      if (def) s[def.stat] += a.v;
    }
  }
  if (bonus) for (const [k, v] of Object.entries(bonus)) s[k as keyof PlayerStats] += v ?? 0;
  s.cooldownPct = Math.min(50, s.cooldownPct);
  s.critChance = Math.min(75, s.critChance);
  s.moveSpeedPct = Math.min(60, s.moveSpeedPct);
  s.dashCharges = Math.min(3, s.dashCharges);
  return s;
}
