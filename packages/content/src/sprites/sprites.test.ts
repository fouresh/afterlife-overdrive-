import { describe, expect, it } from 'vitest';
import { allSprites } from '../registry';
import {
  CHARACTER_LAYERS,
  CHAR_FRAME_COUNT,
  DEFAULT_APPEARANCE,
  HAIR_STYLES,
  composeCharacter,
} from './character';
import type { SpriteDef } from './types';

function validate(def: SpriteDef): string[] {
  const errors: string[] = [];
  if (def.frames.length === 0) errors.push(`${def.id}: no frames`);
  def.frames.forEach((rows, f) => {
    if (rows.length !== def.h)
      errors.push(`${def.id}[${f}]: ${rows.length} rows, expected ${def.h}`);
    rows.forEach((row, y) => {
      if (row.length !== def.w)
        errors.push(`${def.id}[${f}] row ${y}: ${row.length} cols, expected ${def.w}`);
      for (const ch of row) {
        if (ch !== '.' && def.pal[ch] === undefined)
          errors.push(`${def.id}[${f}] row ${y}: unknown palette key '${ch}'`);
      }
    });
  });
  return errors;
}

describe('sprites', () => {
  const all = [...allSprites(), ...CHARACTER_LAYERS];

  it('all sprites have consistent dimensions and palette keys', () => {
    const errors = all.flatMap(validate);
    expect(errors).toEqual([]);
  });

  it('sprite ids are unique', () => {
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('composes every hair style for both genders', () => {
    for (const hairStyle of HAIR_STYLES) {
      for (const gender of ['m', 'f'] as const) {
        const frames = composeCharacter({ ...DEFAULT_APPEARANCE, hairStyle, gender });
        expect(frames).toHaveLength(CHAR_FRAME_COUNT);
        // Some pixels must be opaque and the outline must not touch the left/right edge columns
        // in a way that clips (sanity check of layout).
        const opaque = frames[0]!.data.filter((_, i) => i % 4 === 3 && frames[0]!.data[i]! > 0);
        expect(opaque.length).toBeGreaterThan(80);
      }
    }
  });

  it('keeps the ink outline of every composed frame (nothing but ink on the frame edge)', () => {
    // The run bounce lifts the body 1px: without a spare row on top the head outline was clipped.
    const INK = [0x1b, 0x13, 0x25];
    for (const hairStyle of HAIR_STYLES) {
      for (const helmet of [undefined, { shape: 'cap', material: 'leather' }]) {
        const frames = composeCharacter(
          { ...DEFAULT_APPEARANCE, hairStyle },
          helmet ? { helmet } : {},
        );
        frames.forEach((img, f) => {
          for (let y = 0; y < img.h; y++) {
            for (let x = 0; x < img.w; x++) {
              if (x > 0 && y > 0 && x < img.w - 1 && y < img.h - 1) continue;
              const i = (y * img.w + x) * 4;
              if (img.data[i + 3] === 0) continue;
              const ink = INK.every((c, k) => img.data[i + k] === c);
              expect(`${hairStyle}[${f}] (${x},${y}) ink=${ink}`).toBe(
                `${hairStyle}[${f}] (${x},${y}) ink=true`,
              );
            }
          }
        });
      }
    }
  });

  it('composes armor looks', () => {
    const frames = composeCharacter(DEFAULT_APPEARANCE, {
      helmet: { shape: 'helm', material: 'iron' },
      chest: { shape: 'robe', material: 'arcane' },
      boots: { material: 'gold' },
    });
    expect(frames).toHaveLength(CHAR_FRAME_COUNT);
  });
});
