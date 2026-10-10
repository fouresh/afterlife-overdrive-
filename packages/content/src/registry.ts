import { ENEMY_SPRITES } from './sprites/enemies';
import { ITEM_SPRITES } from './sprites/items';
import { CRYPT_TILES } from './sprites/tiles-crypt';
import type { SpriteDef } from './sprites/types';

/** Every static sprite that goes into the texture atlas. */
export function allSprites(): SpriteDef[] {
  return [...CRYPT_TILES, ...ENEMY_SPRITES, ...ITEM_SPRITES];
}

let byId: Map<string, SpriteDef> | undefined;
export function spriteById(id: string): SpriteDef | undefined {
  byId ??= new Map(allSprites().map((s) => [s.id, s]));
  return byId.get(id);
}
