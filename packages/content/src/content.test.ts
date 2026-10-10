import { describe, expect, it } from 'vitest';
import { getContent } from './content';
import { contentRu } from './i18n/ru';

describe('content', () => {
  it('parses and cross-references without errors', () => {
    const c = getContent();
    expect(c.weapons.length).toBeGreaterThanOrEqual(3);
    expect(c.artifacts.length).toBeGreaterThanOrEqual(6);
    expect(c.enemies.filter((e) => e.rank === 'normal').length).toBeGreaterThanOrEqual(5);
  });

  it('has Russian strings for every name key', () => {
    const c = getContent();
    const keys = [
      ...c.weapons.map((w) => w.nameKey),
      ...c.armor.map((a) => a.nameKey),
      ...c.artifacts.flatMap((a) => [a.nameKey, a.descKey]),
      ...c.affixes.map((a) => a.nameKey),
      ...c.enemies.map((e) => e.nameKey),
      ...[...c.biomes.values()].map((b) => b.nameKey),
    ];
    const missing = keys.filter((k) => !(k in contentRu));
    expect(missing).toEqual([]);
  });

  it('every slot has at least one item base', () => {
    const c = getContent();
    for (const slot of ['weapon', 'helmet', 'chest', 'boots', 'artifact'] as const) {
      expect(c.basesBySlot.get(slot)?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
