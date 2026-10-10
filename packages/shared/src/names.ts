/**
 * Character name validation shared by client and server.
 * Basic profanity filter: normalizes look-alike Latin letters and digits to Cyrillic, strips
 * separators, then looks for banned roots. Deliberately conservative (roots, not whole words).
 */
export const NAME_MIN = 2;
export const NAME_MAX = 16;

const LOOKALIKE: Record<string, string> = {
  a: 'а',
  b: 'б',
  c: 'с',
  e: 'е',
  h: 'н',
  k: 'к',
  m: 'м',
  o: 'о',
  p: 'р',
  t: 'т',
  x: 'х',
  y: 'у',
  u: 'у',
  '0': 'о',
  '3': 'з',
  '4': 'ч',
  '6': 'б',
  '@': 'а',
  ё: 'е',
};

/** Banned roots (Russian mat + a few English slurs), already normalized. */
const BANNED = [
  'хуй',
  'хуе',
  'хуё',
  'хую',
  'хуя',
  'пизд',
  'пезд',
  'ебат',
  'ебан',
  'ебал',
  'ебло',
  'еблан',
  'ебу',
  'ебн',
  'уеб',
  'заеб',
  'выеб',
  'блят',
  'бляд',
  'сука',
  'суки',
  'мудак',
  'мудил',
  'гандон',
  'пидор',
  'пидар',
  'педик',
  'шлюх',
  'залуп',
  'дрочи',
  'fuck',
  'shit',
  'cunt',
  'nigg',
  'fagg',
  'whore',
  'bitch',
];

export function normalizeForFilter(s: string): string {
  const lower = s.toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (/[\s\-_.*'"`~!?,]/.test(ch)) continue;
    out += LOOKALIKE[ch] ?? ch;
  }
  return out;
}

/** Latin-only normalization (keeps English roots detectable). */
function latin(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_.*'"`~!?,]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/\$/g, 's');
}

export function containsProfanity(name: string): boolean {
  const cyr = normalizeForFilter(name);
  const lat = latin(name);
  return BANNED.some((root) => cyr.includes(root) || lat.includes(root));
}

export type NameError = 'empty' | 'short' | 'long' | 'chars' | 'profanity';

/** Returns null when valid. Allowed: Cyrillic, Latin, digits, single spaces and hyphens. */
export function validateName(raw: string): NameError | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return 'empty';
  if (name.length < NAME_MIN) return 'short';
  if (name.length > NAME_MAX) return 'long';
  if (!/^[A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 -]*$/.test(name)) return 'chars';
  if (containsProfanity(name)) return 'profanity';
  return null;
}

export function cleanName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}
