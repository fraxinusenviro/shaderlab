import { expect, test } from '@playwright/test';
import { lowRes, waitFor, ws } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

test.describe('simple viewer', () => {
  test('shows a shader full-screen and browses without the editor', async ({ page }) => {
    await lowRes(page);
    await page.goto('./#/view/preset%3Aplasma');
    await expect(page.getByTestId('viewer')).toBeVisible();
    await expect(page.getByTestId('shader-canvas')).toBeVisible();
    await expect(page.getByTestId('code-editor')).toHaveCount(0);
    await expect(page.getByTestId('viewer-picker')).toHaveValue('preset:plasma');
    await page.getByTestId('viewer-next').click();
    await expect(page).toHaveURL(/#\/view\/preset%3A/);
    expect(page.url()).not.toContain('plasma');
    await page.getByTestId('viewer-picker').selectOption('preset:kaleido');
    await expect(page).toHaveURL(/#\/view\/preset%3Akaleido/);
    await page.getByRole('button', { name: 'Adjust parameters' }).click();
    await expect(page.getByTestId('viewer-tweak')).toBeVisible();
    await page.getByTestId('viewer-shuffle').click();
  });

  test('kiosk mode hides the chrome and Edit hands the shader to the editor', async ({ page }) => {
    await lowRes(page);
    await page.goto('./#/view/preset%3Acaustics?ui=off');
    await expect(page.getByTestId('shader-canvas')).toBeVisible();
    await expect(page.getByTestId('viewer-chrome')).toHaveClass(/opacity-0/);
    await page.goto('./#/view/preset%3Acaustics');
    await page.getByTestId('viewer-edit').click();
    await expect(page.getByTestId('code-editor')).toBeVisible();
    await waitFor(page, () => (window as any).__shaderForge.workspace.getState().project?.id === 'preset:caustics');
  });

  test('start page setting opens the viewer on launch', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('shader-forge:settings', JSON.stringify({ state: { startPage: 'view', pixelRatio: 0.35 }, version: 1 })));
    await page.goto('./');
    await expect(page.getByTestId('viewer')).toBeVisible();
  });
});

test.describe('landscape & waterscape studio', () => {
  test('applies scenes, edits grouped controls, generates worlds, saves and opens in the editor', async ({ page: first, context }) => {
    test.setTimeout(150_000);
    let page = first;
    page.on('dialog', (d) => void d.accept('My test world'));
    await lowRes(page);
    await page.goto('./#/landscape');
    await expect(page.getByTestId('landscape')).toBeVisible();
    await expect(page.getByTestId('shader-canvas')).toBeVisible();
    await expect(page.getByTestId('scene-card')).toHaveCount(9);

    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:landscape') ?? '{}').state);
    await page.locator('[data-scene="archipelago"]').click();
    await expect.poll(async () => (await state()).sceneId).toBe('archipelago');
    expect((await state()).values.uStyle).toBe(2);

    await page.getByRole('tab', { name: 'Water' }).click();
    await page.getByRole('button', { name: 'None (dry land)' }).click();
    await expect.poll(async () => (await state()).values.uWaterLevel).toBe(-0.5);
    await page.locator('[data-field="uWaveHeight"] input[type="range"]').fill('0.9');
    await expect.poll(async () => (await state()).values.uWaveHeight).toBe(0.9);

    await page.getByRole('tab', { name: 'Terrain' }).click();
    await page.getByRole('radio', { name: 'Canyons' }).click();
    await expect.poll(async () => (await state()).values.uStyle).toBe(3);

    const before = JSON.stringify((await state()).values);
    await page.getByTestId('new-world').click();
    await expect.poll(async () => JSON.stringify((await state()).values)).not.toBe(before);

    // Persists across sessions (fresh tab, same browser profile).
    const saved = (await state()).values;
    await page.close();
    page = await context.newPage();
    page.on('dialog', (d) => void d.accept('My test world'));
    await page.goto('./#/landscape');
    await expect(page.getByTestId('landscape')).toBeVisible();
    expect((await state()).values).toEqual(saved);

    await page.getByTestId('landscape-save').click();
    await expect(page.getByText('Saved "My test world"')).toBeVisible();

    await page.getByTestId('landscape-edit').click();
    await expect(page.getByTestId('code-editor')).toBeVisible();
    await waitFor(page, () => (window as any).__shaderForge.workspace.getState().compile.status === 'ok');
    expect(await ws(page, 'ws.project.values.uStyle')).toBe(saved.uStyle);
    expect(await ws(page, 'ws.project.provenance.presetId')).toBe('landscape');
    await expect(page.getByTestId('library-item')).toHaveCount(1);
  });
});

test('landscape studio: Blocks render style', async ({ page }) => {
  test.setTimeout(150_000);
  await lowRes(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('shader-forge:landscape')) localStorage.setItem('shader-forge:landscape', JSON.stringify({ state: { values: { uQuality: 0 }, sceneId: null, mode: 'smooth' }, version: 1 }));
  });
  await page.goto('./#/landscape');
  await expect(page.getByTestId('landscape')).toBeVisible();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:landscape') ?? '{}').state);
  await expect(page.getByRole('tab', { name: 'Blocks' })).toHaveCount(0);
  await page.getByTestId('mode-blocks').click();
  await expect(page.getByTestId('mode-blocks')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await state()).mode).toBe('blocks');
  await page.getByRole('tab', { name: 'Blocks' }).click();
  await page.getByRole('button', { name: 'Chunky blocks' }).click();
  await expect.poll(async () => (await state()).values.uBlockSize).toBe(0.2);
  await page.locator('[data-field="uTrees"] input[type="range"]').fill('1');
  await expect.poll(async () => (await state()).values.uTrees).toBe(1);
  // World parameters are shared with the realistic style.
  await page.getByRole('tab', { name: 'Terrain' }).click();
  await page.getByRole('radio', { name: 'Archipelago' }).click();
  await page.getByTestId('mode-smooth').click();
  await expect.poll(async () => (await state()).values.uStyle).toBe(2);
  await page.getByTestId('mode-blocks').click();
  await page.getByTestId('landscape-edit').click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await waitFor(page, () => (window as any).__shaderForge.workspace.getState().compile.status === 'ok', undefined, 60_000);
  expect(await ws(page, 'ws.project.provenance.presetId')).toBe('voxel');
  expect(await ws(page, 'ws.project.values.uBlockSize')).toBe(0.2);
});
