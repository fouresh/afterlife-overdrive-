import type { Appearance, EquipLook } from '../sprites/character';

/**
 * The personal hub ("Убежище" under the old chapel of Тихий Брод). Every station is an NPC
 * and/or an object; letters in HUB_MAP place them. Stations can require story flags (NPCs move in
 * as they are rescued — chapter 1 in M4); in M2 everything is open.
 */
export interface HubStation {
  id: 'forge' | 'alchemist' | 'market' | 'stash' | 'altar' | 'board' | 'portal' | 'memorial';
  letter: string;
  nameKey: string;
  object?: string;
  npc?: { nameKey: string; appearance: Appearance; look: EquipLook };
  /** Story flag required for the station to appear (undefined = always). */
  requires?: string;
}

export const HUB_STATIONS: HubStation[] = [
  {
    id: 'forge',
    letter: 'F',
    nameKey: 'hub.forge',
    object: 'hub.anvil',
    npc: {
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
  },
  {
    id: 'alchemist',
    letter: 'A',
    nameKey: 'hub.alchemist',
    object: 'hub.cauldron',
    npc: {
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
  },
  {
    id: 'market',
    letter: 'M',
    nameKey: 'hub.market',
    object: 'hub.stall',
    npc: {
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
  },
  { id: 'stash', letter: 'C', nameKey: 'hub.stash', object: 'prop.chest' },
  { id: 'altar', letter: 'S', nameKey: 'hub.altar', object: 'hub.statue' },
  { id: 'board', letter: 'B', nameKey: 'hub.board', object: 'hub.board' },
  { id: 'portal', letter: 'O', nameKey: 'hub.portal', object: 'prop.portal' },
  { id: 'memorial', letter: 'L', nameKey: 'hub.memorial', object: 'hub.grave' },
];

/** '#' wall, 'T' torch wall, 'P' pillar, '.' floor, '@' spawn, letters = stations. */
export const HUB_MAP = `
##################################
#T#####T#####T######T#####T#####T#
#................................#
#...A..........S............B....#
#................................#
#.......P..............P.........#
#................................#
#...F..........@............M....#
#................................#
#................................#
#.......P..............P.........#
#................................#
#...C..........O............L....#
#................................#
##################################
`;
