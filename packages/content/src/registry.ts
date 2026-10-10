import { CRYPT_TILES } from './sprites/tiles-crypt';
import type { SpriteDef } from './sprites/types';

/** Every static sprite that goes into the texture atlas. */
export function allSprites(): SpriteDef[] {
  return [...CRYPT_TILES];
}
