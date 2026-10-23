import { expect, test } from '@playwright/test';
import { float32GeoTiff } from './geotiff';
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
    test.setTimeout(300_000);
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

test('landscape studio: vegetation generator', async ({ page }) => {
  test.setTimeout(150_000);
  await lowRes(page);
  await page.goto('./#/landscape');
  await expect(page.getByTestId('landscape')).toBeVisible();
  // The studio starts still: the viewport only redraws on changes.
  await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:landscape') ?? '{}').state);
  await page.getByRole('tab', { name: 'Vegetation' }).click();
  await page.getByTestId('biome-autumn').click();
  await expect.poll(async () => (await state()).values.uLeafColor).toEqual([0.62, 0.28, 0.07]);
  expect((await state()).values.uConifer).toBe(0.15);
  const seed = (await state()).values.uVegSeed;
  await page.getByTestId('regrow').click();
  await expect.poll(async () => (await state()).values.uVegSeed).not.toBe(seed);
  await page.locator('[data-field="uFlowers"] input[type="range"]').fill('0.9');
  await expect.poll(async () => (await state()).values.uFlowers).toBe(0.9);
  const before = JSON.stringify((await state()).values);
  await page.getByTestId('random-biome').click();
  await expect.poll(async () => JSON.stringify((await state()).values)).not.toBe(before);
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
  await page.getByRole('tab', { name: 'Vegetation' }).click();
  await page.locator('[data-field="uForest"] input[type="range"]').fill('1');
  await expect.poll(async () => (await state()).values.uForest).toBe(1);
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

test.describe('fractal zoom', () => {
  test('deep zoom tour, controls, bookmarks and share links', async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => localStorage.setItem('shader-forge:fractal', JSON.stringify({ state: { quality: 'draft' }, version: 1 })));
    await page.goto('./#/fractal');
    await expect(page.getByTestId('fractal-canvas')).toBeVisible();
    await expect(page.getByTestId('fractal-readout')).toContainText('×10^0.00');
    await expect(page.getByTestId('fractal-tour')).toHaveCount(7);
    // Start a tour: autoplay zooms in, centred on the computed target.
    await page.locator('[data-tour="seahorse-minibrot"]').click();
    await expect.poll(async () => Number(/×10\^([\d.]+)/.exec((await page.getByTestId('fractal-readout').textContent()) ?? '')?.[1] ?? 0), { timeout: 60_000 }).toBeGreaterThan(0.5);
    await expect(page.getByTestId('fractal-readout')).toContainText('-0.7436438870');
    await page.getByTestId('fractal-play').click(); // pause
    // Wheel zoom works and the view persists.
    const box = (await page.getByTestId('fractal-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const z0 = await page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:fractal')!).state.zoom);
    await page.mouse.wheel(0, -600);
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:fractal')!).state.zoom), { timeout: 10_000 }).toBeGreaterThan(z0 + 0.3);
    // Bookmark the view.
    page.once('dialog', (d) => void d.accept('Test spot'));
    await page.getByRole('tab', { name: 'saved' }).click();
    await page.getByTestId('fractal-bookmark').click();
    await expect(page.getByTestId('fractal-bookmark-item')).toHaveCount(1);
    // A share link restores an exact deep view.
    const re = '-0.7746724469356738080461171765322245435665009634996757197';
    await page.goto(`${baseURL}#/landscape`);
    await page.goto(`${baseURL}#/fractal?re=${re}&im=0.137429292340916890591543464097869529007304705906938161&z=20&p=fire`);
    await page.reload();
    await expect(page.getByTestId('fractal-readout')).toContainText('×10^20.00', { timeout: 30_000 });
    await expect(page.getByTestId('fractal-readout')).toContainText('-0.77467244693567380804611717');
    await expect(page.getByTestId('fractal-readout')).not.toContainText('computing', { timeout: 30_000 });
  });
});

test('landscape studio: elevation data from a GeoTIFF', async ({ page }) => {
  test.setTimeout(150_000);
  await lowRes(page);
  await page.goto('./#/landscape');
  await expect(page.getByTestId('landscape')).toBeVisible();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('shader-forge:landscape') ?? '{}').state);
  // The studio starts still: the viewport only redraws on changes.
  await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
  await page.getByRole('tab', { name: 'Elevation' }).click();
  await expect(page.getByTestId('elevation-panel')).toBeVisible();
  await expect(page.getByTestId('dem-place').first()).toBeVisible();
  // A synthetic 80 x 60 projected (EPSG:3979) DEM: a ridge rising from the sea.
  const w = 80, h = 60;
  const values = Float32Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    return Math.max(-5, 400 * Math.exp(-(((x - 40) / 18) ** 2) - (((y - 30) / 14) ** 2)) - 5);
  });
  values[0] = -32767;
  const buffer = Buffer.from(float32GeoTiff(values, w, h, 10, 2700000, 300000, '-32767'));
  await page.locator('input[type="file"][accept*="tif"]').setInputFiles({ name: 'ridge.tif', mimeType: 'image/tiff', buffer });
  await expect(page.getByTestId('dem-info')).toContainText('ridge.tif', { timeout: 30_000 });
  await expect(page.getByTestId('source-dem')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await state()).values.uTerrainSource).toBe(1);
  const s = await state();
  expect(s.dem.sizeM[0]).toBeCloseTo(800, 0);
  expect(s.dem.max).toBeGreaterThan(380);
  expect(s.values.uCamMode).toBe(1);
  // The DEM texture is persisted and rendered through the landscape shader.
  await page.getByTestId('landscape-edit').click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await waitFor(page, () => (window as any).__shaderForge.workspace.getState().compile.status === 'ok', undefined, 60_000);
  expect(await ws(page, 'ws.project.values.uTerrainSource')).toBe(1);
  expect(await ws(page, 'ws.project.channels?.[0]?.assetId ?? null')).toMatch(/^dem_/);
});

test('landscape studio: renders on demand, adaptive resolution while dragging', async ({ page }) => {
  test.setTimeout(150_000);
  await lowRes(page);
  await page.goto('./#/landscape');
  const canvas = page.getByTestId('shader-canvas');
  await expect(canvas).toBeVisible();
  // Still by default.
  await expect(page.getByRole('button', { name: 'Animate' })).toBeVisible();
  await expect(page.getByTestId('landscape-view')).toContainText('still');
  const width = () => canvas.evaluate((c: HTMLCanvasElement) => c.width);
  await expect.poll(width).toBeGreaterThan(50);
  const full = await width();
  // Dragging is continuous motion: on a slow (software) GPU the buffer shrinks...
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  let smallest = full;
  for (let i = 0; i < 25; i++) {
    await page.mouse.move(box.x + box.width / 2 + (i % 2 ? 40 : -40), box.y + box.height / 2);
    smallest = Math.min(smallest, await width());
  }
  await page.mouse.up();
  expect(smallest).toBeLessThan(full);
  // ...and is restored to full resolution once the view is still.
  await expect.poll(width, { timeout: 30_000 }).toBe(full);
  // Animation is opt-in and remembered.
  await page.getByRole('button', { name: 'Animate' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
});
