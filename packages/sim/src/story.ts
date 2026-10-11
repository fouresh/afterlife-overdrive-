import {
  getContent,
  type BiomeDef,
  type DialogDef,
  type QuestDef,
  type StoryRule,
} from '@ao/content';
import type { Character } from './save';
import type { World } from './world';

/**
 * Story progress: quests are completed by story events earned in runs (data in
 * packages/content/src/data/story.ts). Quest state per character: 1 = active, 2 = done.
 */
export const QUEST_ACTIVE = 1;
export const QUEST_DONE = 2;

/** Record a story event for everyone still in the run (a party shares the moment). */
export function storyEvent(w: World, ev: string): void {
  for (const p of w.players) if (!p.gone && !p.story.includes(ev)) p.story.push(ev);
}

export function questState(c: Character, id: string): number {
  return c.story.quests[id] ?? 0;
}

export function hasFlag(c: Character, flag: string): boolean {
  return c.story.flags.includes(flag);
}

function addFlag(c: Character, flag: string): void {
  if (!c.story.flags.includes(flag)) c.story.flags.push(flag);
}

export function startQuest(c: Character, id: string): void {
  if (!questState(c, id)) c.story.quests[id] = QUEST_ACTIVE;
}

/** Goals of the active quests (sent with the hero into a run). */
export function activeGoals(c: Character): string[] {
  const out: string[] = [];
  for (const q of getContent().quests) if (questState(c, q.id) === QUEST_ACTIVE) out.push(q.goal);
  return out;
}

export function activeQuests(c: Character): QuestDef[] {
  return getContent().quests.filter((q) => questState(c, q.id) === QUEST_ACTIVE);
}

/** The main quest to show in the journal line (null when the chapter is done). */
export function currentMainQuest(c: Character): QuestDef | null {
  return activeQuests(c).find((q) => q.main) ?? null;
}

export function biomeUnlocked(c: Character, b: BiomeDef): boolean {
  return !b.requires || hasFlag(c, b.requires);
}

/** The dialog an NPC (or the hub itself: 'hub') plays now, if any. */
export function storyDialog(
  c: Character,
  npc: string,
): { rule: StoryRule; dialog: DialogDef } | null {
  const content = getContent();
  for (const r of content.storyRules) {
    if (r.npc !== npc) continue;
    if (!r.when.flags.every((f) => hasFlag(c, f))) continue;
    if (r.when.notFlags.some((f) => hasFlag(c, f))) continue;
    if (!r.when.questDone.every((q) => questState(c, q) === QUEST_DONE)) continue;
    const dialog = content.dialogs.get(r.dialog);
    if (dialog) return { rule: r, dialog };
  }
  return null;
}

/** Apply a played dialog's effects (flags, new quests). */
export function applyStoryRule(c: Character, rule: StoryRule): void {
  for (const f of rule.effects.flags) addFlag(c, f);
  for (const q of rule.effects.startQuests) startQuest(c, q);
}

export interface QuestCompletion {
  quest: QuestDef;
  xp: number;
  gold: number;
}

/**
 * Complete every active quest whose goal is among `events` (and quests they unlock, if those
 * goals are also met). Mutates the character; returns rewards for the caller to pay out.
 */
export function completeQuests(c: Character, events: readonly string[]): QuestCompletion[] {
  const done: QuestCompletion[] = [];
  const content = getContent();
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    for (const q of content.quests) {
      if (questState(c, q.id) !== QUEST_ACTIVE || !events.includes(q.goal)) continue;
      c.story.quests[q.id] = QUEST_DONE;
      for (const f of q.reward.flags) addFlag(c, f);
      for (const n of q.next) startQuest(c, n);
      done.push({ quest: q, xp: q.reward.xp, gold: q.reward.gold });
      changed = true;
    }
    if (!changed) break;
  }
  return done;
}

/**
 * Heroes created before the story existed (M1/M2 saves) keep what they had: the forge, the
 * market and the crypt stay open, the chapter continues from the Warden.
 */
export function upgradeStory(c: Character): void {
  if (hasFlag(c, 'ch1.met') || c.stats.runs === 0) return;
  for (const f of [
    'ch1.met',
    'ch1.chapel',
    'ch1.cryptTalk',
    'npc.borgan',
    'npc.trader',
    'ch1.borganTalk',
    'ch1.saiTalk',
  ])
    addFlag(c, f);
  for (const q of ['ch1.forest', 'ch1.sai', 'ch1.borgan']) c.story.quests[q] = QUEST_DONE;
  if (c.stats.victories > 0) {
    c.story.quests['ch1.warden'] = QUEST_DONE;
    addFlag(c, 'ch1.done');
    addFlag(c, 'ch1.finale');
  } else startQuest(c, 'ch1.warden');
}
