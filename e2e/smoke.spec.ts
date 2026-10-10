import { expect, test, type Page } from '@playwright/test';

/** Collect console errors and page errors; the test fails if any appear. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

interface State {
  tick: number;
  player: { x: number; y: number; hp: number };
  kills: number;
  enemies: number;
  rooms: string;
  outcome: string;
}

async function state(page: Page): Promise<State> {
  return page.evaluate(() => window.__AO__!.state!() as State);
}

async function hold(page: Page, testid: string, ms: number): Promise<void> {
  const btn = page.getByTestId(testid);
  await btn.dispatchEvent('pointerdown', { pointerId: 11, isPrimary: false, pointerType: 'touch' });
  await page.waitForTimeout(ms);
  await btn.dispatchEvent('pointerup', { pointerId: 11, isPrimary: false, pointerType: 'touch' });
}

test('menu → pick weapon → dungeon → move → kill an enemy, no errors', async ({
  page,
}, testInfo) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1&e2e=1&seed=12345');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('weapon-pick')).toBeVisible();
  await page.getByTestId('pick-bow.short').click();
  await page.getByTestId('btn-start-run').click();
  await expect(page.getByTestId('game')).toBeVisible();
  await page.waitForFunction(() => typeof window.__AO__?.state === 'function', null, {
    timeout: 30_000,
  });
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
  await page.screenshot({ path: testInfo.outputPath('fight.png') });
  for (let i = 0; i < 20; i++) {
    await hold(page, 'btn-attack', 700);
    if ((await state(page)).kills > 0) break;
  }
  const after = await state(page);
  expect(after.kills).toBeGreaterThan(0);
  await hold(page, 'btn-skill1', 100);
  await page.screenshot({ path: testInfo.outputPath('game.png') });

  // Inventory opens and closes.
  await page.getByTestId('btn-bag').click();
  await expect(page.getByTestId('inventory')).toBeVisible();
  await page.getByTestId('btn-inv-close').click();
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
