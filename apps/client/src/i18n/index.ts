import { ru, type TKey } from './ru';

export type { TKey };

const dict: Record<string, string> = ru;

/** Translate a key; `{name}` placeholders are replaced from vars. Unknown keys return the key. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s = dict[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** For content-provided keys (items, enemies) that are not statically known. */
export function tDyn(key: string, vars?: Record<string, string | number>): string {
  return t(key as TKey, vars);
}
