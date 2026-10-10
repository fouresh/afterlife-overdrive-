// Type-only import: this module is used by the main menu and must not pull the sim into the
// initial bundle. Creating profiles lives in ./newProfile.ts (game chunk).
import type { ItemInstance, Loadout } from '@ao/sim';

/**
 * M1 local profile (localStorage). M2 replaces it with versioned IndexedDB + cloud saves and
 * migrates this data.
 */
export interface ProfileV1 {
  v: 1;
  loadout: Loadout;
  stash: ItemInstance[];
  gold: number;
  runs: number;
  deaths: number;
  victories: number;
  bestDepth: number;
}

const KEY = 'ao.profile.v1';
export const STASH_LIMIT = 100;

export function loadProfile(): ProfileV1 | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProfileV1;
    return p.v === 1 ? p : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: ProfileV1): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch (err) {
    console.warn('profile save failed', err);
  }
}

export function cloneLoadout(l: Loadout): Loadout {
  return JSON.parse(JSON.stringify(l)) as Loadout;
}
