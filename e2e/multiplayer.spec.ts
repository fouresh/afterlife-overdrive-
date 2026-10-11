import { devices, expect, test, type Page } from '@playwright/test';
import { createHero, hold, trackErrors } from './helpers';

interface NetState {
  tick: number;
  local: number;
  players: { x: number; y: number; dead: boolean }[];
  player: { x: number; y: number };
  net: string;
}

async function netState(page: Page): Promise<NetState> {
  return page.evaluate(() => window.__AO__!.state!() as NetState);
}

async function waitNetRun(page: Page): Promise<void> {
  await expect(page.getByTestId('game')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const ao = window.__AO__;
      if (ao?.screen !== 'netrun' || !ao.state) return false;
      const s = ao.state() as { players: unknown[]; tick: number };
      return s.players.length === 2 && s.tick > 5;
    },
    null,
    { timeout: 30_000 },
  );
}

test('two phones: party by invite link, co-op run on the server, both return to the hub', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const phone = devices['Pixel 7 landscape'];
  const ctxA = await browser.newContext({ ...phone, baseURL: testInfo.project.use.baseURL });
  const ctxB = await browser.newContext({ ...phone, baseURL: testInfo.project.use.baseURL });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errA = trackErrors(a);
  const errB = trackErrors(b);

  // A creates a hero and a party.
  await a.goto('/?e2e=1&debug=1');
  await createHero(a, 'Анна', 'sword.rusty');
  await a.getByTestId('btn-party').click();
  await a.getByTestId('btn-party-create').click();
  await expect(a.getByTestId('party-code')).toHaveText(/^[A-Z2-9]{5}$/, { timeout: 20_000 });
  const code = (await a.getByTestId('party-code').textContent())!.trim();

  // B opens the invite link, creates a hero and lands in A's party automatically.
  await b.goto(`/?room=${code}&e2e=1&debug=1`);
  await expect(b.getByTestId('invite-line')).toContainText(code);
  await createHero(b, 'Борис', 'bow.short');
  await expect(b.getByTestId('party-chip')).toContainText(code, { timeout: 20_000 });
  await expect(a.getByTestId('party-members')).toContainText('Борис');
  await a.screenshot({ path: testInfo.outputPath('mp-01-party.png') });
  await a.getByTestId('btn-panel-close').click();

  // The leader opens the portal for everyone.
  await a.evaluate(() => window.__AO__!.talk!('portal'));
  await a.getByTestId('btn-go-party').click();
  await waitNetRun(a);
  await waitNetRun(b);

  // A walks; B sees A move (interpolated), A's own view is predicted.
  const a0 = await netState(a);
  const zone = a.getByTestId('joystick');
  const box = (await zone.boundingBox())!;
  const sx = box.x + box.width * 0.4;
  const sy = box.y + box.height * 0.6;
  await a.mouse.move(sx, sy);
  await a.mouse.down();
  await a.mouse.move(sx + 40, sy + 4, { steps: 4 });
  await a.waitForTimeout(900);
  await a.mouse.up();
  await a.waitForTimeout(800);
  const a1 = await netState(a);
  expect(Math.hypot(a1.player.x - a0.player.x, a1.player.y - a0.player.y)).toBeGreaterThan(20);
  const b1 = await netState(b);
  const seen = b1.players[a1.local]!;
  expect(Math.hypot(seen.x - a1.player.x, seen.y - a1.player.y)).toBeLessThan(12);
  expect(a1.net).toMatch(/snap\/s/);

  // B shoots a few arrows (server-side projectiles, mirrored to both).
  await hold(b, 'btn-attack', 600);

  // B's connection drops (Wi-Fi → LTE): reconnect banner, then the run goes on.
  await b.evaluate(() => window.__AO__!.dropNet!());
  await expect(b.getByTestId('reconnecting')).toBeVisible();
  await expect(b.getByTestId('reconnecting')).toBeHidden({ timeout: 15_000 });
  const t0 = (await netState(b)).tick;
  await b.waitForTimeout(700);
  expect((await netState(b)).tick).toBeGreaterThan(t0);
  await expect(a.getByTestId('party-hud')).toContainText('Борис');
  await a.screenshot({ path: testInfo.outputPath('mp-02-run-a.png') });
  await b.screenshot({ path: testInfo.outputPath('mp-03-run-b.png') });

  // A leaves the run (loot lost), B is alone, then B leaves → run over, both in the hub.
  await a.getByTestId('btn-pause').click();
  await a.getByTestId('btn-quit').click();
  await expect(a.getByTestId('run-summary')).toBeVisible({ timeout: 15_000 });
  await a.getByTestId('btn-summary-done').click();
  await expect(a.getByTestId('hub')).toBeVisible();
  await expect(a.getByTestId('party-chip')).toContainText('в забеге');

  await b.getByTestId('btn-pause').click();
  await b.getByTestId('btn-quit').click();
  await expect(b.getByTestId('run-summary')).toBeVisible({ timeout: 15_000 });
  await b.getByTestId('btn-summary-done').click();
  await expect(b.getByTestId('hub')).toBeVisible();
  await expect(a.getByTestId('party-chip')).not.toContainText('в забеге', { timeout: 15_000 });

  expect(errA).toEqual([]);
  expect(errB).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
