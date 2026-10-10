import type { z } from 'zod';
import type { WeaponBase } from '../schema';

type W = z.input<typeof WeaponBase>;

/** Weapon bases. The attack archetype is pure data; the sim knows only the archetypes. */
export const WEAPONS: W[] = [
  {
    id: 'sword.rusty',
    type: 'sword',
    nameKey: 'item.sword.rusty',
    sprite: 'wpn.sword',
    icon: 'wpn.sword',
    attribute: 'str',
    attack: { kind: 'melee_arc', range: 27, arc: 120, damage: 10, cooldown: 0.36, knockback: 140 },
  },
  {
    id: 'sword.knight',
    type: 'sword',
    nameKey: 'item.sword.knight',
    sprite: 'wpn.swordKnight',
    icon: 'wpn.swordKnight',
    attribute: 'str',
    minLevel: 3,
    attack: { kind: 'melee_arc', range: 30, arc: 130, damage: 13, cooldown: 0.38, knockback: 150 },
  },
  {
    id: 'axe.wood',
    type: 'axe',
    nameKey: 'item.axe.wood',
    sprite: 'wpn.axe',
    icon: 'wpn.axe',
    attribute: 'str',
    attack: { kind: 'melee_arc', range: 31, arc: 160, damage: 17, cooldown: 0.62, knockback: 230 },
  },
  {
    id: 'dagger.iron',
    type: 'dagger',
    nameKey: 'item.dagger.iron',
    sprite: 'wpn.dagger',
    icon: 'wpn.dagger',
    attribute: 'dex',
    attack: {
      kind: 'thrust',
      range: 26,
      width: 12,
      damage: 6,
      cooldown: 0.17,
      knockback: 60,
      lunge: 6,
    },
  },
  {
    id: 'bow.short',
    type: 'bow',
    nameKey: 'item.bow.short',
    sprite: 'wpn.bow',
    icon: 'wpn.bow',
    attribute: 'dex',
    attack: { kind: 'projectile', projectile: 'arrow', damage: 7, cooldown: 0.3 },
  },
  {
    id: 'bow.hunter',
    type: 'bow',
    nameKey: 'item.bow.hunter',
    sprite: 'wpn.bowHunter',
    icon: 'wpn.bowHunter',
    attribute: 'dex',
    minLevel: 3,
    attack: {
      kind: 'projectile',
      projectile: 'arrow',
      damage: 6,
      cooldown: 0.34,
      count: 2,
      spread: 10,
    },
  },
  {
    id: 'crossbow.light',
    type: 'crossbow',
    nameKey: 'item.crossbow.light',
    sprite: 'wpn.crossbow',
    icon: 'wpn.crossbow',
    attribute: 'dex',
    attack: { kind: 'projectile', projectile: 'bolt', damage: 15, cooldown: 0.7, knockback: 120 },
  },
  {
    id: 'staff.apprentice',
    type: 'staff',
    nameKey: 'item.staff.apprentice',
    sprite: 'wpn.staff',
    icon: 'wpn.staff',
    attribute: 'int',
    attack: {
      kind: 'projectile',
      projectile: 'magic',
      damage: 9,
      cooldown: 0.42,
      melee: { range: 22, arc: 120, damage: 7 },
    },
  },
  {
    id: 'staff.ember',
    type: 'staff',
    nameKey: 'item.staff.ember',
    sprite: 'wpn.staffEmber',
    icon: 'wpn.staffEmber',
    attribute: 'int',
    minLevel: 3,
    attack: {
      kind: 'projectile',
      projectile: 'fireball',
      damage: 9,
      cooldown: 0.55,
      melee: { range: 22, arc: 120, damage: 8 },
    },
  },
];

/** Starting weapons offered before the first run. */
export const STARTER_WEAPONS = ['sword.rusty', 'bow.short', 'staff.apprentice'];
