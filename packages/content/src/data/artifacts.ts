import type { z } from 'zod';
import type { ArtifactBase } from '../schema';

type A = z.input<typeof ArtifactBase>;

/** Artifacts are the only source of active skills: a skill is a list of effect primitives. */
export const ARTIFACTS: A[] = [
  {
    id: 'art.fireball',
    nameKey: 'art.fireball',
    descKey: 'art.fireball.desc',
    icon: 'icon.art.fireball',
    cooldown: 4,
    color: 0xf08b5c,
    effects: [{ type: 'projectile', projectile: 'fireball', damage: 28 }],
  },
  {
    id: 'art.frostNova',
    nameKey: 'art.frostNova',
    descKey: 'art.frostNova.desc',
    icon: 'icon.art.frost',
    cooldown: 7,
    color: 0x8ad1f5,
    effects: [
      {
        type: 'area',
        at: 'self',
        radius: 52,
        damage: 16,
        knockback: 160,
        slow: 2.5,
        color: 0x8ad1f5,
      },
    ],
  },
  {
    id: 'art.phantomDash',
    nameKey: 'art.phantomDash',
    descKey: 'art.phantomDash.desc',
    icon: 'icon.art.dash',
    cooldown: 5,
    color: 0xd89cf2,
    effects: [{ type: 'dash', distance: 84, damage: 18, iframes: 0.45 }],
  },
  {
    id: 'art.bloodlust',
    nameKey: 'art.bloodlust',
    descKey: 'art.bloodlust.desc',
    icon: 'icon.art.blood',
    cooldown: 14,
    color: 0xcf4440,
    effects: [{ type: 'buff', damagePct: 40, attackSpeedPct: 25, duration: 5, color: 0xcf4440 }],
  },
  {
    id: 'art.holyLight',
    nameKey: 'art.holyLight',
    descKey: 'art.holyLight.desc',
    icon: 'icon.art.holy',
    cooldown: 16,
    color: 0xf2c94c,
    effects: [
      { type: 'heal', pctMaxHp: 30 },
      { type: 'area', at: 'self', radius: 36, damage: 0, knockback: 120, color: 0xf2c94c },
    ],
  },
  {
    id: 'art.boneShield',
    nameKey: 'art.boneShield',
    descKey: 'art.boneShield.desc',
    icon: 'icon.art.shield',
    cooldown: 12,
    color: 0xece4c8,
    effects: [{ type: 'shield', amount: 30, duration: 6 }],
  },
  {
    id: 'art.spiritWisp',
    nameKey: 'art.spiritWisp',
    descKey: 'art.spiritWisp.desc',
    icon: 'icon.art.wisp',
    cooldown: 15,
    color: 0xaaf6ec,
    effects: [{ type: 'summon', ally: 'wisp', count: 2, duration: 9 }],
  },
  {
    id: 'art.bladeFan',
    nameKey: 'art.bladeFan',
    descKey: 'art.bladeFan.desc',
    icon: 'icon.art.blades',
    cooldown: 6,
    color: 0xece4c8,
    effects: [{ type: 'projectile', projectile: 'blade', damage: 9, count: 12, aim: 'radial' }],
  },
  {
    id: 'art.meteor',
    nameKey: 'art.meteor',
    descKey: 'art.meteor.desc',
    icon: 'icon.art.meteor',
    cooldown: 9,
    color: 0xf08b5c,
    minLevel: 2,
    effects: [
      {
        type: 'area',
        at: 'target',
        radius: 40,
        damage: 45,
        delay: 0.7,
        knockback: 200,
        color: 0xf08b5c,
      },
    ],
  },
];

export const ALLIES = [
  { id: 'wisp', sprite: 'ally.wisp', projectile: 'wisp', damage: 6, cooldown: 0.55, range: 120 },
];
