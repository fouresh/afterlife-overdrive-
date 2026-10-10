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

async function state(page: Page): Promise<{ tick: number; player: { x: number; y: number } }> {
  return page.evaluate(() => window.__AO__!.state!() as never);
}

test('menu → game → move with the joystick, no errors', async ({ page }, testInfo) => {
  const errors = trackErrors(page);
  await page.goto('/?debug=1');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('game')).toBeVisible();
  await page.waitForFunction(() => typeof window.__AO__?.state === 'function', null, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('debug-overlay')).toBeVisible();

  const before = await state(page);
  // Drag the joystick to the right with a touch-like pointer.
  const zone = page.getByTestId('joystick');
  const box = (await zone.boundingBox())!;
  const sx = box.x + box.width * 0.4;
  const sy = box.y + box.height * 0.6;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 40, sy, { steps: 4 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  const after = await state(page);
  expect(after.tick).toBeGreaterThan(before.tick);
  expect(after.player.x).toBeGreaterThan(before.player.x + 20);

  // Dash button works too.
  await page
    .getByTestId('btn-dash')
    .dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true });
  await page.waitForTimeout(100);
  await page.getByTestId('btn-dash').dispatchEvent('pointerup', { pointerId: 7, isPrimary: true });

  await page.screenshot({ path: testInfo.outputPath('game.png') });
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
