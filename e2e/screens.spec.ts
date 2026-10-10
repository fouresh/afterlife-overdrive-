import { expect, test } from '@playwright/test';

/**
 * Screenshot tour of the main screens (artifacts in CI; open with the Read tool in a session).
 * Also checks the run flow: inventory → floor choice → leave → summary → menu.
 */
test('screens tour: pick, inventory, floor choice, summary', async ({ page }, testInfo) => {
  const shot = (name: string) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await page.goto('/?e2e=1&seed=777');
  await shot('01-menu');
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('weapon-pick')).toBeVisible();
  await page.getByTestId('pick-staff.apprentice').click();
  await page.getByTestId('pick-art.frostNova').click();
  await shot('02-pick');
  await page.getByTestId('btn-start-run').click();
  await page.waitForFunction(() => typeof window.__AO__?.grant === 'function', null, {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await shot('03-start-room');

  await page.evaluate(() => window.__AO__!.grant!());
  await page.getByTestId('btn-bag').click();
  await expect(page.getByTestId('inventory')).toBeVisible();
  await page.getByTestId('bag-3').click();
  await shot('04-inventory');
  await page.getByTestId('btn-equip').click();
  await page.getByTestId('btn-inv-close').click();

  await page.evaluate(() => window.__AO__!.finishFloor!());
  await expect(page.getByTestId('floor-choice')).toBeVisible();
  await shot('05-floor-choice');
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await shot('06-summary');
  await page.getByTestId('btn-summary-done').click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  // Second run skips the weapon pick (profile saved) and keeps the equipped gear.
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('game')).toBeVisible();
});
