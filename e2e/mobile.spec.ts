import { expect, test } from '@playwright/test';
import { boot, waitForProject, ws } from './helpers';

test('mobile layout: viewport, bottom toolbar and slide-out panels', async ({ page }) => {
  page.on('dialog', (d) => void d.accept()); // "discard unsaved changes?" when switching shaders
  await boot(page, '#/shader/preset%3Acaustics');
  const nav = page.getByRole('navigation', { name: 'Main actions' });
  await expect(nav).toBeVisible();
  const canvas = await page.getByTestId('main-canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThan(300);

  await nav.getByRole('button', { name: 'Controls' }).click();
  const slider = page.locator('[data-param="uScale"] input[type="range"]').first();
  await expect(slider).toBeVisible();
  const box = await slider.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(30); // touch-friendly target
  await slider.fill('6');
  expect(await ws(page, 'ws.project.values.uScale')).toBe(6);
  await page.getByRole('button', { name: 'Close panel' }).click();

  await nav.getByRole('button', { name: 'Library' }).click();
  await page.locator('[data-preset="plasma"]').click();
  await waitForProject(page, 'preset:plasma');

  await nav.getByRole('button', { name: 'Code' }).click();
  await expect(page.locator('.cm-content').first()).toBeVisible();
});

test('mobile landscape studio: stacked viewport and tabbed controls', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => localStorage.setItem('shader-forge:settings', JSON.stringify({ state: { pixelRatio: 0.35 }, version: 1 })));
  await page.goto('./#/landscape');
  await expect(page.getByTestId('shader-canvas')).toBeVisible();
  await expect(page.getByTestId('scene-card').first()).toBeVisible();
  // The studio starts still: the viewport only redraws on changes.
  await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
  await page.getByRole('tab', { name: 'Sky' }).click();
  await page.getByRole('button', { name: 'Night' }).click();
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:landscape') ?? '{}').state.values.uSunElevation);
  expect(v).toBeLessThan(0);
});
