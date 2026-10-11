import type { z } from 'zod';
import type { DialogDef, QuestDef, StoryRule } from '../schema';

/**
 * Chapter 1 "Пробуждение" as data: quests (completed by story events from runs), dialogs and
 * the rules that decide which dialog an NPC plays. Texts live in i18n/story-ru.ts.
 *
 * Story events (sim → run result): 'clear:<biome>' (exit portal of the last floor),
 * 'rescue:<npc>' (freed a captive), 'boss:<enemy>' (killed a boss). A quest counts for every
 * party member who has it active.
 */
export const QUESTS: z.input<typeof QuestDef>[] = [
  {
    id: 'ch1.forest',
    chapter: 1,
    main: true,
    titleKey: 'quest.ch1.forest',
    descKey: 'quest.ch1.forest.desc',
    goal: 'clear:forest',
    reward: { xp: 120, gold: 40, flags: ['ch1.chapel'] },
    next: ['ch1.borgan'],
  },
  {
    id: 'ch1.sai',
    chapter: 1,
    titleKey: 'quest.ch1.sai',
    descKey: 'quest.ch1.sai.desc',
    goal: 'rescue:trader',
    reward: { xp: 60, gold: 60, flags: ['npc.trader'] },
  },
  {
    id: 'ch1.borgan',
    chapter: 1,
    main: true,
    titleKey: 'quest.ch1.borgan',
    descKey: 'quest.ch1.borgan.desc',
    goal: 'rescue:borgan',
    reward: { xp: 200, gold: 0, flags: ['npc.borgan'] },
    next: ['ch1.warden'],
  },
  {
    id: 'ch1.warden',
    chapter: 1,
    main: true,
    titleKey: 'quest.ch1.warden',
    descKey: 'quest.ch1.warden.desc',
    goal: 'boss:cryptWarden',
    reward: { xp: 400, gold: 200, flags: ['ch1.done'] },
    cutscene: 'ch1.core',
  },
];

const lines = (id: string, who: z.input<typeof DialogDef>['lines'][number][0][]) =>
  who.map((w, i) => [w, `dlg.${id}.${i}`] as [typeof w, string]);

export const DIALOGS: z.input<typeof DialogDef>[] = [
  {
    id: 'ch1.awaken',
    lines: lines('ch1.awaken', ['mira', 'mira', 'hero', 'mira', 'mira', 'mira', 'mira']),
  },
  { id: 'ch1.forestDone', lines: lines('ch1.forestDone', ['mira', 'mira', 'hero', 'mira']) },
  { id: 'ch1.saiHome', lines: lines('ch1.saiHome', ['trader', 'trader', 'trader']) },
  { id: 'ch1.borganHome', lines: lines('ch1.borganHome', ['borgan', 'borgan', 'hero', 'borgan']) },
  {
    id: 'ch1.core',
    lines: lines('ch1.core', ['narrator', 'narrator', 'core', 'core', 'narrator']),
  },
  {
    id: 'ch1.finale',
    lines: lines('ch1.finale', ['mira', 'hero', 'mira', 'mira', 'mira', 'narrator']),
  },
  { id: 'mira.hint.forest', lines: lines('mira.hint.forest', ['mira']) },
  { id: 'mira.hint.crypt', lines: lines('mira.hint.crypt', ['mira']) },
  { id: 'mira.hint.warden', lines: lines('mira.hint.warden', ['mira']) },
];

export const STORY_RULES: z.input<typeof StoryRule>[] = [
  // First time in the hub: Mira found you on the forest altar.
  {
    npc: 'hub',
    when: { notFlags: ['ch1.met'] },
    dialog: 'ch1.awaken',
    effects: { flags: ['ch1.met'], startQuests: ['ch1.forest', 'ch1.sai'] },
  },
  {
    npc: 'hub',
    when: { flags: ['ch1.done'], notFlags: ['ch1.finale'] },
    dialog: 'ch1.finale',
    effects: { flags: ['ch1.finale'] },
  },
  {
    npc: 'mira',
    when: { questDone: ['ch1.forest'], notFlags: ['ch1.cryptTalk'] },
    dialog: 'ch1.forestDone',
    effects: { flags: ['ch1.cryptTalk'] },
  },
  {
    npc: 'trader',
    when: { flags: ['npc.trader'], notFlags: ['ch1.saiTalk'] },
    dialog: 'ch1.saiHome',
    effects: { flags: ['ch1.saiTalk'] },
  },
  {
    npc: 'borgan',
    when: { flags: ['npc.borgan'], notFlags: ['ch1.borganTalk'] },
    dialog: 'ch1.borganHome',
    effects: { flags: ['ch1.borganTalk'] },
  },
];

/** Mira's one-line hint for the current main quest (shown when talking to her otherwise). */
export const QUEST_HINTS: Record<string, string> = {
  'ch1.forest': 'mira.hint.forest',
  'ch1.borgan': 'mira.hint.crypt',
  'ch1.warden': 'mira.hint.warden',
};
