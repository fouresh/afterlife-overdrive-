import { emptyLoadout, starterItem } from '@ao/sim';
import type { ProfileV1 } from './profile';

export function newProfile(weapon: string, artifact: string): ProfileV1 {
  const loadout = emptyLoadout();
  loadout.weapon = starterItem(weapon);
  loadout.artifacts[0] = starterItem(artifact);
  return { v: 1, loadout, stash: [], gold: 0, runs: 0, deaths: 0, victories: 0, bestDepth: 0 };
}
