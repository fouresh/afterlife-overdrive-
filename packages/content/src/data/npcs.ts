import type { Appearance, EquipLook } from '../sprites/character';

/** Story NPCs: hub residents, captives in dungeons, dialog speakers (paper-doll looks). */
export interface NpcDef {
  id: string;
  nameKey: string;
  appearance: Appearance;
  look: EquipLook;
}

export const NPC_LIST: NpcDef[] = [
  {
    id: 'mira',
    nameKey: 'npc.mira',
    appearance: {
      gender: 'f',
      skin: 0,
      hairStyle: 'long',
      hairColor: 6,
      eyeColor: 2,
      clothColor: 2,
      pantsColor: 9,
    },
    look: { chest: { shape: 'robe', material: 'forest' } },
  },
  {
    id: 'borgan',
    nameKey: 'npc.borgan',
    appearance: {
      gender: 'm',
      skin: 2,
      hairStyle: 'spiky',
      hairColor: 5,
      eyeColor: 3,
      clothColor: 6,
      pantsColor: 9,
    },
    look: { chest: { shape: 'vest', material: 'leather' }, boots: { material: 'iron' } },
  },
  {
    id: 'trader',
    nameKey: 'npc.trader',
    appearance: {
      gender: 'm',
      skin: 4,
      hairStyle: 'short',
      hairColor: 0,
      eyeColor: 0,
      clothColor: 11,
      pantsColor: 9,
    },
    look: { helmet: { shape: 'hood', material: 'crimson' } },
  },
];

export const NPCS: Record<string, NpcDef> = Object.fromEntries(NPC_LIST.map((n) => [n.id, n]));

/** Index of an NPC in NPC_LIST (network/entity ref), -1 if unknown. */
export function npcIndex(id: string): number {
  return NPC_LIST.findIndex((n) => n.id === id);
}
