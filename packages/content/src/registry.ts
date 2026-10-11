import { ENEMY_SPRITES } from './sprites/enemies';
import { FOREST_ENEMY_SPRITES } from './sprites/enemies-forest';
import { HUB_SPRITES } from './sprites/hub';
import { ITEM_SPRITES } from './sprites/items';
import { CRYPT_TILES } from './sprites/tiles-crypt';
import { FOREST_TILES } from './sprites/tiles-forest';
import type { SpriteDef } from './sprites/types';

/** Every static sprite that goes into the texture atlas. */
export function allSprites(): SpriteDef[] {
  return [
    ...CRYPT_TILES,
    ...FOREST_TILES,
    ...ENEMY_SPRITES,
    ...FOREST_ENEMY_SPRITES,
    ...ITEM_SPRITES,
    ...HUB_SPRITES,
  ];
}

let byId: Map<string, SpriteDef> | undefined;
export function spriteById(id: string): SpriteDef | undefined {
  byId ??= new Map(allSprites().map((s) => [s.id, s]));
  return byId.get(id);
}
