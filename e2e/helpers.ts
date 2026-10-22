import { expect, type Page } from '@playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Software-rendered CI GPUs are slow: render the viewport at reduced resolution. */
export async function lowRes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('shader-forge:settings')) {
      localStorage.setItem('shader-forge:settings', JSON.stringify({ state: { pixelRatio: 0.35, thumbQuality: 'low' }, version: 1 }));
    }
  });
}

export async function boot(page: Page, hash = ''): Promise<void> {
  await lowRes(page);
  await page.goto(`./${hash}`);
  await expect(page.getByTestId('main-canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__shaderForge?.workspace.getState().compile.status === 'ok', undefined, { polling: 200 });
}

/** waitForFunction with interval polling (rAF polling starves under heavy shaders). */
export function waitFor<T>(page: Page, fn: (arg: T) => unknown, arg?: T, timeout = 30_000) {
  return page.waitForFunction(fn as any, arg as any, { polling: 200, timeout });
}

export function waitForProject(page: Page, id: string) {
  return waitFor(page, (pid: string) => {
    const s = (window as any).__shaderForge.workspace.getState();
    return s.project?.id === pid && s.compile.status === 'ok';
  }, id);
}

export function ws(page: Page, fn: string): Promise<any> {
  return page.evaluate(`(() => { const sf = window.__shaderForge; const ws = sf.workspace.getState(); return (${fn}); })()`);
}

/** Mean RGB of the main renderer's output rendered offscreen at time t. */
export function meanColor(page: Page, t = 1): Promise<number[]> {
  return page.evaluate((time) => {
    const r = (window as any).__shaderForge.renderer();
    const img = r.renderToPixels(32, 32, time);
    const s = [0, 0, 0];
    for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) s[c] += img.data[i + c];
    return s.map((x: number) => x / (img.data.length / 4));
  }, t);
}
