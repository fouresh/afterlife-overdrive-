/** Random tokens and hashes with WebCrypto (available in workerd and Node). */
export function randomToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** 12-char recovery code (60 bits), shown as XXXX-XXXX-XXXX. */
export function recoveryCode(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 12; i++) {
    s += CODE_ALPHABET[b[i]! & 31];
    if (i === 3 || i === 7) s += '-';
  }
  return s;
}

/** Normalize user input: uppercase, drop separators, map ambiguous letters (O→0, I/L→1). */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export function randomId(prefix: string): string {
  return `${prefix}${randomToken(9)}`;
}

export function randomSeed(): number {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0]!;
}
