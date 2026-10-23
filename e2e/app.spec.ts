import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { boot, meanColor, waitFor, waitForProject, ws } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

test.describe('deployment shape (GitHub Pages subpath)', () => {
  test('loads under the repository subpath with a valid manifest', async ({ page, baseURL }) => {
    await boot(page);
    expect(new URL(page.url()).pathname).toBe(new URL(baseURL!).pathname);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe(`${new URL(baseURL!).pathname}manifest.webmanifest`);
    const res = await page.request.get(new URL(href!, baseURL).toString());
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone', short_name: 'Shader Forge' });
    for (const icon of manifest.icons) expect((await page.request.get(new URL(icon.src, new URL(href!, baseURL)).toString())).ok()).toBe(true);
  });

  test('registers a service worker scoped to the subpath', async ({ page, baseURL }) => {
    await boot(page);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe(baseURL);
  });
});

test.describe('rendering & editing', () => {
  test('every bundled preset compiles', async ({ page }) => {
    await boot(page);
    const results: { id: string; ok: boolean; errors: string[] }[] = await page.evaluate(() => (window as any).__shaderForge.validatePresets());
    const failed = results.filter((r) => !r.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
    expect(results.length).toBeGreaterThanOrEqual(12);
  });

  test('presets render non-trivial output when opened from the library', async ({ page }) => {
    await boot(page);
    for (const id of ['mandelbrot', 'caustics', 'plasma', 'truchet', 'glt-ripple']) {
      await page.locator(`[data-preset="${id}"]`).click();
      await waitForProject(page, `preset:${id}`);
      const [r, g, b] = await meanColor(page, 2);
      expect(r + g + b, `${id} should not be black`).toBeGreaterThan(10);
    }
  });

  test('pasted GLSL compiles; errors keep the last working shader; revert works', async ({ page }) => {
    await boot(page);
    const editor = page.locator('[data-testid="code-editor"] .cm-content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(1.0, 0.0, 0.0, 1.0);\n}\n');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByTestId('compile-status')).toContainText('Compiled');
    expect(await meanColor(page)).toEqual([255, 0, 0]);

    // Introduce an error on a known line: the viewport must keep showing red.
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  fragColor = vec4(undefinedThing, 0.0, 0.0, 1.0);\n}\n');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.getByTestId('compile-status')).toContainText('error');
    await expect(page.getByTestId('compile-error-banner')).toBeVisible();
    expect(await meanColor(page)).toEqual([255, 0, 0]);
    const diag = await ws(page, 'ws.compile.diagnostics.find(d => d.severity === "error")');
    expect(diag.origin).toBe('user');
    expect(diag.line).toBe(2);

    await page.getByTestId('revert-working').click();
    await expect(page.getByTestId('compile-status')).toContainText('Compiled');
    expect(await ws(page, 'ws.project.fragment')).not.toContain('undefinedThing');
  });

  test('parameter controls change the rendering', async ({ page }) => {
    await boot(page, '#/shader/preset%3Aplasma');
    await waitForProject(page, 'preset:plasma');
    await page.evaluate(() => (window as any).__shaderForge.clock.pause());
    const before = await meanColor(page, 1);
    const slider = page.locator('[data-param="uPhase"] input[type="range"]').first();
    await slider.fill('0.8');
    expect(await ws(page, 'ws.project.values.uPhase[0]')).toBeCloseTo(0.8);
    const after = await meanColor(page, 1);
    expect(after).not.toEqual(before);
  });
});

test.describe('mutation laboratory', () => {
  test('fixed seeds reproduce identical variants', async ({ page }) => {
    await boot(page, '#/shader/preset%3Akaleido');
    await waitForProject(page, 'preset:kaleido');
    const run = () =>
      page.evaluate(() => {
        const lab = (window as any).__shaderForge.lab.getState();
        lab.setSettings({ seed: 4242, levels: { uniform: true, math: true, structural: true } });
        (window as any).__shaderForge.lab.getState().generate();
        return (window as any).__shaderForge.lab.getState().variants.map((v: any) => ({ f: v.spec.fragment, v: v.spec.values, ops: v.spec.ops }));
      });
    const a = await run();
    const b = await run();
    expect(a.length).toBe(9);
    expect(a).toEqual(b);
    await page.getByTestId('btn-gallery').click();
    await expect(page.getByTestId('variant-card')).toHaveCount(9);
    await expect(page.locator('[data-testid="variant-card"][data-status="pending"]')).toHaveCount(0, { timeout: 30_000 });
  });

  test('an invalid mutation is recorded but never replaces the working shader', async ({ page }) => {
    await boot(page);
    const before = await ws(page, 'ws.project.fragment');
    await ws(page, `ws.recordMutation({ name: 'bad', seed: 1, strength: 1, level: 2, ops: [], fragment: 'garbage', values: {}, params: [], valid: false, error: 'x' }, true)`);
    expect(await ws(page, 'ws.project.fragment')).toBe(before);
    expect(await ws(page, 'ws.project.history.some(h => h.name === "bad" && !h.valid)')).toBe(true);
    expect(await ws(page, 'ws.compile.status')).toBe('ok');
  });

  test('mutate button applies a recorded, undoable change', async ({ page }) => {
    await boot(page);
    const before = await ws(page, 'JSON.stringify(ws.project.values)');
    await page.getByTestId('btn-randomize').click();
    await expect.poll(() => ws(page, 'ws.project.history.length')).toBeGreaterThan(0);
    expect(await ws(page, 'JSON.stringify(ws.project.values)')).not.toBe(before);
    await ws(page, 'ws.undo()');
    expect(await ws(page, 'JSON.stringify(ws.project.values)')).toBe(before);
  });
});

test.describe('persistence & files', () => {
  test('saved shaders persist after reload', async ({ page }) => {
    await boot(page, '#/shader/preset%3Ajulia');
    await waitForProject(page, 'preset:julia');
    await ws(page, 'ws.setValue("uScale", 2.25, { coalesce: false })');
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    const id = await ws(page, 'ws.project.id');
    expect(id).not.toContain('preset:');
    await page.reload();
    await expect(page.getByTestId('library-item')).toHaveCount(1);
    await waitForProject(page, id);
    expect(await ws(page, 'ws.project.values.uScale')).toBe(2.25);
  });

  test('unsaved edits are recovered after an interrupted session', async ({ page }) => {
    await boot(page);
    await ws(page, 'ws.setFragment(ws.project.fragment + "\\n// recovered-marker\\n")');
    // Wait until the autosaved session is *committed* to IndexedDB, then "crash". Read it over a
    // separate raw connection: Dexie's in-page cache can report a write before it has committed.
    const committed = () =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('shader-forge');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const db = open.result;
              const get = db.transaction('session', 'readonly').objectStore('session').get('workspace');
              get.onsuccess = () => {
                db.close();
                resolve(!!get.result?.dirty && String(get.result.project.fragment).includes('recovered-marker'));
              };
              get.onerror = () => resolve(false);
            };
          }),
      );
    await expect.poll(committed, { timeout: 60_000 }).toBe(true);
    await page.reload();
    await waitFor(page, () => (window as any).__shaderForge?.workspace.getState().project?.fragment.includes('recovered-marker'));
    await expect(page.getByText('Recovered unsaved changes')).toBeVisible();
  });

  test('project export → import preserves parameters, provenance and history', async ({ page }) => {
    await boot(page, '#/shader/preset%3Aglt-ripple');
    await waitForProject(page, 'preset:glt-ripple');
    await page.getByTestId('btn-randomize').click();
    await expect.poll(() => ws(page, 'ws.project.history.length')).toBeGreaterThan(0);
    const original = await ws(page, '({ values: ws.project.values, history: ws.project.history.map(h => h.id), prov: ws.project.provenance, params: ws.project.params.map(p => p.name) })');
    await page.getByTestId('btn-export').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
    const path = await download.path();
    const text = readFileSync(path!, 'utf8');
    await page.keyboard.press('Escape');
    await page.getByTestId('import-input').setInputFiles({ name: 'roundtrip.shaderforge.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect.poll(() => ws(page, 'ws.project.id.startsWith("p_")')).toBe(true);
    const imported = await ws(page, '({ values: ws.project.values, history: ws.project.history.map(h => h.id), prov: ws.project.provenance, params: ws.project.params.map(p => p.name) })');
    expect(imported.values).toEqual(original.values);
    expect(imported.history).toEqual(original.history);
    expect(imported.params).toEqual(original.params);
    expect(imported.prov).toMatchObject({ author: 'gre', license: 'MIT', sourceUrl: original.prov.sourceUrl });
  });

  test('raw .frag import keeps the source untouched', async ({ page }) => {
    await boot(page);
    const src = 'precision mediump float;\nuniform vec2 u_resolution;\nvoid main() { gl_FragColor = vec4(gl_FragCoord.xy / u_resolution, 0.0, 1.0); }\n';
    await page.getByTestId('import-input').setInputFiles({ name: 'gradient.frag', mimeType: 'text/plain', buffer: Buffer.from(src) });
    await expect.poll(() => ws(page, 'ws.project.name')).toBe('gradient');
    expect(await ws(page, 'ws.project.fragment')).toBe(src);
    expect(await ws(page, 'ws.project.original.fragment')).toBe(src);
    await expect(page.getByTestId('compile-status')).toContainText('Compiled');
  });

  test('works offline after the first visit', async ({ page, context }) => {
    await boot(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Reload so the page is controlled by the service worker.
    await page.reload();
    await waitFor(page, () => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('main-canvas')).toBeVisible();
    await waitFor(page, () => (window as any).__shaderForge?.workspace.getState().compile.status === 'ok');
    await page.locator('[data-preset="clouds"]').click();
    await waitForProject(page, 'preset:clouds');
    await context.setOffline(false);
  });
});
