import { expect, test } from '@playwright/test';
import { createHero, enterDungeon, trackErrors } from './helpers';

/**
 * Chapter 1 flow: awakening dialog → journal → Whispering Forest (2 floors) → the trader is
 * freed and the forest is cleared → quests complete, the crypt opens, Sai moves into the hub.
 */
test('chapter 1: forest run completes the first quests and opens the crypt', async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await page.goto('/?e2e=1&seed=2024');
  await createHero(page, 'Ветер', 'sword.rusty', (n) => shot(`s-01-${n}`));

  // The portal only offers the forest so far.
  await page.evaluate(() => window.__AO__!.talk!('portal'));
  await expect(page.getByTestId('biome-forest')).toHaveClass(/chip--sel/);
  await expect(page.getByTestId('biome-crypt')).toBeDisabled();
  await page.getByTestId('btn-panel-close').click();

  await enterDungeon(page);
  await page.waitForTimeout(600);
  await shot('s-02-forest');
  await page.evaluate(() => window.__AO__!.finishFloor!());
  await page.getByTestId('btn-deeper').click();
  await page.waitForFunction(() => (window.__AO__!.state!() as { depth: number }).depth === 1);
  // Floor 2 holds the trader in a cage (he is on our quest list).
  expect(await page.evaluate(() => window.__AO__!.rescue!())).toBe('trader');
  await page.evaluate(() => window.__AO__!.finishFloor!());
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await expect(page.getByTestId('quest-done')).toHaveCount(2);
  await shot('s-03-summary');
  await page.getByTestId('btn-summary-done').click();

  await expect(page.getByTestId('hub')).toBeVisible();
  await expect(page.getByTestId('journal')).toContainText('Голос из-под земли');
  await page.evaluate(() => window.__AO__!.talk!('portal'));
  await expect(page.getByTestId('biome-crypt')).toBeEnabled();
  await page.getByTestId('btn-panel-close').click();
  await page.evaluate(() => window.__AO__!.talk!('board'));
  await expect(page.getByTestId('quest-ch1.forest')).toHaveClass(/questrow--done/);
  await shot('s-04-board');
  expect(errors).toEqual([]);
});
