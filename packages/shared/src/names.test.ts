import { describe, expect, it } from 'vitest';
import { validateName } from './names';

describe('name validation', () => {
  it('accepts normal names', () => {
    for (const n of ['Арина', 'Vlad', 'Тёмный Рыцарь', 'Kira-7', 'Ёж'])
      expect(validateName(n)).toBeNull();
  });
  it('rejects bad lengths and characters', () => {
    expect(validateName('')).toBe('empty');
    expect(validateName('А')).toBe('short');
    expect(validateName('Оченьдлинноеимягероя')).toBe('long');
    expect(validateName('<script>')).toBe('chars');
    expect(validateName('-abc')).toBe('chars');
  });
  it('catches obfuscated profanity', () => {
    for (const n of ['Хуй', 'x y й', 'пи3да', 'Fuck', 'f u c k', 'Сука', 'cyka', 'бл@дь']) {
      expect(validateName(n), n).not.toBeNull();
    }
  });
  it('does not flag innocent names with similar letters', () => {
    for (const n of ['Скубидубидуб', 'Ястреб', 'Hunter', 'Психея', 'Застрахуйся'.slice(0, 4)]) {
      expect(validateName(n), n).toBeNull();
    }
  });
});
