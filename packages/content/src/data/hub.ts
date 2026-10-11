import type { Appearance, EquipLook } from '../sprites/character';
import { NPCS } from './npcs';

/**
 * The personal hub ("Убежище" under the old chapel of Тихий Брод). Every station is an NPC
 * and/or an object; letters in HUB_MAP place them. Stations can require story flags: rescued NPCs
 * move in (Borgan → forge, Sai → market).
 */
export interface HubStation {
  id: 'forge' | 'alchemist' | 'market' | 'stash' | 'altar' | 'board' | 'portal' | 'memorial';
  letter: string;
  nameKey: string;
  object?: string;
  npc?: { id?: string; nameKey: string; appearance: Appearance; look: EquipLook };
  /** Story flag required for the station to appear (undefined = always). */
  requires?: string;
}

export const HUB_STATIONS: HubStation[] = [
  {
    id: 'forge',
    letter: 'F',
    nameKey: 'hub.forge',
    object: 'hub.anvil',
    npc: NPCS.borgan!,
    requires: 'npc.borgan',
  },
  {
    id: 'alchemist',
    letter: 'A',
    nameKey: 'hub.alchemist',
    object: 'hub.cauldron',
    npc: NPCS.mira!,
  },
  {
    id: 'market',
    letter: 'M',
    nameKey: 'hub.market',
    object: 'hub.stall',
    npc: NPCS.trader!,
    requires: 'npc.trader',
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
