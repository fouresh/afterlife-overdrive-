import { expect, test } from '@playwright/test';
import { createHero, enterDungeon, hold, state, trackErrors } from './helpers';

test('new hero → hub → dungeon → move → kill an enemy → back to hub, no errors', async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1&e2e=1&seed=12345');
  await createHero(page, 'Тестер');
  await enterDungeon(page);
  await expect(page.getByTestId('debug-overlay')).toBeVisible();
  await expect(page.getByTestId('hp')).toBeVisible();

  // Walk with the joystick.
  const before = await state(page);
  const zone = page.getByTestId('joystick');
  const box = (await zone.boundingBox())!;
  const sx = box.x + box.width * 0.4;
  const sy = box.y + box.height * 0.6;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy + 10, { steps: 4 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  const moved = await state(page);
  expect(moved.tick).toBeGreaterThan(before.tick);
  expect(
    Math.hypot(moved.player.x - before.player.x, moved.player.y - before.player.y),
  ).toBeGreaterThan(10);

  // Enter a combat room (test hook) and fight with auto-aim until something dies.
  expect(await page.evaluate(() => window.__AO__!.enterCombat!())).toBe(true);
  await page.waitForTimeout(1200);
  for (let i = 0; i < 20; i++) {
    await hold(page, 'btn-attack', 700);
    if ((await state(page)).kills > 0) break;
  }
  expect((await state(page)).kills).toBeGreaterThan(0);
  await hold(page, 'btn-skill1', 100);
  await page.screenshot({ path: testInfo.outputPath('game.png') });

  // Leave with the loot → summary → hub.
  await page.evaluate(() => window.__AO__!.finishFloor!());
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('run-summary')).toBeVisible();
  await page.getByTestId('btn-summary-done').click();
  await expect(page.getByTestId('hub')).toBeVisible();
  expect(errors).toEqual([]);
});

test('error screen shows a copyable report', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error('test explosion');
    }, 0);
  });
  await expect(page.locator('.fatal')).toBeVisible();
  await expect(page.locator('.fatal__report')).toHaveValue(/test explosion/);
  await expect(page.locator('.fatal__report')).toHaveValue(/version:/);
});
