import { expect, type Page } from '@playwright/test';

/** Collect console errors and page errors; tests fail if any appear. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    // e2e runs without the Worker: /api calls fail by design and the game goes offline.
    if (msg.type() === 'error' && !msg.location().url.includes('/api/'))
      errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

export interface State {
  tick: number;
  player: { x: number; y: number; hp: number };
  kills: number;
  enemies: number;
  rooms: string;
  outcome: string;
}

export async function state(page: Page): Promise<State> {
  return page.evaluate(() => window.__AO__!.state!() as State);
}

export async function hold(page: Page, testid: string, ms: number): Promise<void> {
  const btn = page.getByTestId(testid);
  await btn.dispatchEvent('pointerdown', { pointerId: 11, isPrimary: false, pointerType: 'touch' });
  await page.waitForTimeout(ms);
  await btn.dispatchEvent('pointerup', { pointerId: 11, isPrimary: false, pointerType: 'touch' });
}

/** Menu → Play → character creator → intro → hub. */
export async function createHero(
  page: Page,
  name: string,
  weapon = 'bow.short',
  shot?: (n: string) => Promise<unknown>,
): Promise<void> {
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('btn-play').click();
  await expect(page.getByTestId('creator')).toBeVisible();
  await page.getByTestId('name-input').fill(name);
  await page.getByTestId(`pick-${weapon}`).click();
  await shot?.('creator');
  await page.getByTestId('btn-create').click();
  await expect(page.getByTestId('intro')).toBeVisible();
  await page.getByTestId('origin-shock').waitFor({ timeout: 15_000 });
  await shot?.('intro');
  await page.getByTestId('origin-shock').click();
  // Skip the text by tapping.
  for (let i = 0; i < 6; i++) await page.getByTestId('intro').click({ position: { x: 20, y: 20 } });
  await page.getByTestId('btn-intro-done').click();
  await expect(page.getByTestId('hub')).toBeVisible();
  await page.waitForFunction(
    () => window.__AO__?.screen === 'hub' && typeof window.__AO__?.talk === 'function',
    null,
    {
      timeout: 30_000,
    },
  );
}

/** Hub → portal panel → go → run screen ready. */
export async function enterDungeon(page: Page): Promise<void> {
  await page.evaluate(() => window.__AO__!.talk!('portal'));
  await page.getByTestId('btn-go').click();
  await expect(page.getByTestId('game')).toBeVisible();
  await page.waitForFunction(
    () => window.__AO__?.screen === 'run' && typeof window.__AO__?.enterCombat === 'function',
    null,
    {
      timeout: 30_000,
    },
  );
}
