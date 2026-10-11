import { Btn, emptyInput, type PlayerInput } from '@ao/shared';
import { describe, expect, it } from 'vitest';
import { applyRunResult, runSetup } from './account';
import { Ev } from './events';
import { Kind, PropKind } from './entities';
import { starterItem } from './items';
import { createFloorWorld } from './run';
import { createCharacter, migrateSave, newSave } from './save';
import { step } from './step';
import {
  QUEST_DONE,
  activeGoals,
  applyStoryRule,
  biomeUnlocked,
  currentMainQuest,
  questState,
  storyDialog,
} from './story';
import { getContent } from '@ao/content';

const NOW = 1_800_000_000_000;

function hero() {
  const save = newSave(9, NOW);
  const c = createCharacter(
    {
      name: 'Ника',
      appearance: {
        gender: 'f',
        skin: 1,
        hairStyle: 'bob',
        hairColor: 2,
        eyeColor: 1,
        clothColor: 3,
        pantsColor: 7,
      },
      hardcore: false,
      origin: 'fire',
      weapon: starterItem('sword.rusty'),
      artifact: starterItem('art.frostNova'),
    },
    'c-nika',
    NOW,
  );
  save.characters.push(c);
  return { save, c };
}

function findCaptive(w: ReturnType<typeof createFloorWorld>): number {
  for (let i = 0; i < w.e.hi; i++)
    if (w.e.alive[i] && w.e.kind[i] === Kind.Prop && w.e.def[i] === PropKind.Captive) return i;
  return -1;
}

describe('chapter 1 story', () => {
  it('first hub visit plays the awakening and starts the forest quests; crypt is locked', () => {
    const { c } = hero();
    const d = storyDialog(c, 'hub');
    expect(d?.dialog.id).toBe('ch1.awaken');
    applyStoryRule(c, d!.rule);
    expect(storyDialog(c, 'hub')).toBeNull();
    expect(currentMainQuest(c)?.id).toBe('ch1.forest');
    expect(activeGoals(c)).toEqual(['clear:forest', 'rescue:trader']);
    const biomes = getContent().biomes;
    expect(biomeUnlocked(c, biomes.get('forest')!)).toBe(true);
    expect(biomeUnlocked(c, biomes.get('crypt')!)).toBe(false);
  });

  it('a captive appears only for heroes who look for them; freeing them is a story event', () => {
    const cfg = { seed: 4242, biome: 'forest', floors: 2 };
    const without = createFloorWorld(cfg, 1, [{ loadout: undefined }]);
    expect(findCaptive(without)).toBe(-1);
    const w = createFloorWorld(cfg, 1, [{ quests: ['rescue:trader'] }, {}]);
    const cap = findCaptive(w);
    expect(cap).toBeGreaterThanOrEqual(0);
    const [a, b] = w.players;
    w.e.x[a!.ent] = w.e.x[cap]! + 10;
    w.e.y[a!.ent] = w.e.y[cap]!;
    const press: PlayerInput = { mx: 0, my: 0, aim: 0, buttons: Btn.Interact };
    let rescued = false;
    for (let t = 0; t < 4 && !rescued; t++) {
      step(w, [t % 2 ? emptyInput() : press, emptyInput()]);
      for (let k = 0; k < w.events.n; k++) if (w.events.type[k] === Ev.Rescue) rescued = true;
    }
    expect(rescued).toBe(true);
    expect(w.e.state[cap]).toBe(1);
    // The whole party shares the moment (each hero's quest counts if active).
    expect(a!.story).toContain('rescue:trader');
    expect(b!.story).toContain('rescue:trader');
  });

  it('run results complete active quests, unlock the next ones and pay rewards', () => {
    const { save, c } = hero();
    applyStoryRule(c, storyDialog(c, 'hub')!.rule);
    const gold0 = save.realms.standard.gold;
    const setup = runSetup(c);
    expect(setup.quests).toContain('clear:forest');
    const reward = applyRunResult(
      save,
      c,
      {
        outcome: 'victory',
        carry: { ...setup, story: ['rescue:trader', 'clear:forest', 'boss:alphaWolf'] },
        depth: 2,
        bossKilled: true,
        seconds: 300,
      },
      NOW,
    );
    expect(reward.quests).toEqual(['ch1.forest', 'ch1.sai']);
    expect(questState(c, 'ch1.forest')).toBe(QUEST_DONE);
    expect(c.story.flags).toEqual(expect.arrayContaining(['ch1.chapel', 'npc.trader']));
    expect(currentMainQuest(c)?.id).toBe('ch1.borgan');
    expect(save.realms.standard.gold).toBe(gold0 + 40 + 60);
    expect(biomeUnlocked(c, getContent().biomes.get('crypt')!)).toBe(true);
    expect(storyDialog(c, 'mira')?.dialog.id).toBe('ch1.forestDone');
    expect(storyDialog(c, 'trader')?.dialog.id).toBe('ch1.saiHome');

    // Death: the run's story does not count.
    const dead = applyRunResult(
      save,
      c,
      {
        outcome: 'dead',
        carry: { story: ['rescue:borgan'] },
        depth: 2,
        bossKilled: false,
        seconds: 1,
      },
      NOW,
    );
    expect(dead.quests ?? []).toEqual([]);
    expect(questState(c, 'ch1.borgan')).toBe(1);

    // Borgan, then the Warden: the chapter ends with the core cutscene.
    applyRunResult(
      save,
      c,
      {
        outcome: 'left',
        carry: { story: ['rescue:borgan'] },
        depth: 2,
        bossKilled: false,
        seconds: 1,
      },
      NOW,
    );
    expect(c.story.flags).toContain('npc.borgan');
    const fin = applyRunResult(
      save,
      c,
      {
        outcome: 'victory',
        carry: { story: ['boss:cryptWarden', 'clear:crypt'] },
        depth: 3,
        bossKilled: true,
        seconds: 1,
      },
      NOW,
    );
    expect(fin.quests).toEqual(['ch1.warden']);
    expect(fin.cutscenes).toEqual(['ch1.core']);
    expect(storyDialog(c, 'hub')?.dialog.id).toBe('ch1.finale');
    expect(currentMainQuest(c)).toBeNull();
  });

  it('veterans from older saves keep the forge, the market and the crypt', () => {
    const { save, c } = hero();
    c.stats.runs = 5;
    const migrated = migrateSave(JSON.parse(JSON.stringify(save)), NOW);
    const v = migrated.characters[0]!;
    expect(v.story.flags).toEqual(
      expect.arrayContaining(['ch1.met', 'npc.borgan', 'npc.trader', 'ch1.chapel']),
    );
    expect(currentMainQuest(v)?.id).toBe('ch1.warden');
    expect(storyDialog(v, 'hub')).toBeNull();
    // A brand-new hero is untouched.
    const fresh = migrateSave(JSON.parse(JSON.stringify(hero().save)), NOW).characters[0]!;
    expect(fresh.story.flags).toEqual([]);
  });
});
