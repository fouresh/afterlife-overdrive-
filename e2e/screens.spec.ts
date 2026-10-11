import { expect, test } from '@playwright/test';
import { createHero, enterDungeon, trackErrors } from './helpers';

/**
 * Screenshot tour of the main screens (artifacts in CI; open with the Read tool in a session).
 * Also checks the flow: creator → intro → hub panels → run → floor choice → summary → hub.
 */
test('screens tour', async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await page.goto('/?e2e=1&seed=777');
  await shot('01-menu');
  await createHero(page, 'Мира-2', 'staff.apprentice', (n) => shot(`02-${n}`));
  await page.waitForTimeout(400);
  await shot('03-hub');

  for (const [station, name] of [
    ['stash', '04-stash'],
    ['forge', '05-forge'],
    ['market', '06-market'],
    ['altar', '07-altar'],
    ['alchemist', '08-alchemist'],
    ['board', '09-board'],
    ['portal', '10-portal'],
  ] as const) {
    await page.evaluate((s) => window.__AO__!.talk!(s), station);
    await expect(page.getByTestId('panel')).toBeVisible();
    await shot(name);
    await page.getByTestId('btn-panel-close').click();
  }

  await enterDungeon(page);
  await page.evaluate(() => window.__AO__!.grant!());
  await page.getByTestId('btn-bag').click();
  await expect(page.getByTestId('inventory')).toBeVisible();
  await page.getByTestId('bag-3').click();
  await shot('11-inventory');
  await page.getByTestId('btn-equip').click();
  await page.getByTestId('btn-inv-close').click();

  await page.evaluate(() => window.__AO__!.finishFloor!());
  await expect(page.getByTestId('floor-choice')).toBeVisible();
  await shot('12-floor-choice');
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await shot('13-summary');
  await page.getByTestId('btn-summary-done').click();
  await expect(page.getByTestId('hub')).toBeVisible();

  // The found items are now in the stash.
  await page.evaluate(() => window.__AO__!.talk!('stash'));
  await expect(page.getByTestId('stash-0')).toBeVisible();
  await page.getByTestId('btn-panel-close').click();

  // Character select shows the hero.
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('btn-change-hero').click();
  await expect(page.getByTestId('char-select')).toBeVisible();
  await shot('14-char-select');
  expect(errors).toEqual([]);
});
