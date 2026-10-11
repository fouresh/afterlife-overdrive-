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
      ...c.quests.flatMap((q) => [q.titleKey, q.descKey]),
      ...[...c.dialogs.values()].flatMap((d) => d.lines.map((l) => l[1])),
      ...c.npcs.map((n) => n.nameKey),
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

  it('chapter 1 story is complete: every main quest leads on, hints exist', () => {
    const c = getContent();
    const main = c.quests.filter((q) => q.chapter === 1 && q.main);
    expect(main.map((q) => q.id)).toEqual(['ch1.forest', 'ch1.borgan', 'ch1.warden']);
    // The first hub visit starts the chapter.
    expect(c.storyRules.find((r) => r.npc === 'hub')?.effects.startQuests).toContain('ch1.forest');
    // Every rescue goal has a biome holding that captive.
    for (const q of c.quests.filter((x) => x.goal.startsWith('rescue:'))) {
      const npc = q.goal.slice(7);
      expect([...c.biomes.values()].some((b) => b.captives.some((x) => x.npc === npc))).toBe(true);
    }
    for (const q of c.quests.filter((x) => x.goal.startsWith('boss:'))) {
      expect(c.enemyIndex.has(q.goal.slice(5))).toBe(true);
    }
  });
});
