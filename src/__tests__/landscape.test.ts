import { describe, expect, it } from 'vitest';
import { valuesEqualType } from '../params/parse';
import { CAMERA_PARAMS, LANDSCAPE_SCENES, WORLD_PARAMS } from '../landscape/scenes';
import { LANDSCAPE_DEFAULTS, LANDSCAPE_PARAMS, paramDef, randomWorld, sceneValues, varyWorld } from '../landscape/store';
import { parseHash } from '../hooks/useHashRoute';

describe('landscape shader parameters', () => {
  it('exposes grouped terrain / water / sky / camera controls', () => {
    const groups = new Set(LANDSCAPE_PARAMS.map((d) => d.group));
    expect([...groups].sort()).toEqual(['Camera', 'Sky', 'Terrain', 'Water']);
    expect(paramDef('uStyle')!.options!.map((o) => o.label)).toEqual(['Mountains', 'Rolling hills', 'Archipelago', 'Canyons', 'Dunes']);
    for (const k of [...WORLD_PARAMS, ...CAMERA_PARAMS]) expect(paramDef(k), k).toBeDefined();
  });

  it.each(LANDSCAPE_SCENES.map((s) => [s.id, s] as const))('scene %s only sets valid, in-range parameters', (_id, scene) => {
    for (const [k, v] of Object.entries(scene.values)) {
      const def = paramDef(k);
      expect(def, `${scene.id}.${k}`).toBeDefined();
      expect(valuesEqualType(def!, v), `${scene.id}.${k} type`).toBe(true);
      for (const x of Array.isArray(v) ? v : typeof v === 'number' ? [v] : []) {
        expect(x).toBeGreaterThanOrEqual(def!.min);
        expect(x).toBeLessThanOrEqual(def!.max);
      }
    }
    const all = sceneValues(scene.id);
    expect(Object.keys(all).sort()).toEqual(Object.keys(LANDSCAPE_DEFAULTS).sort());
  });

  it('generates reproducible, in-range worlds and respects land/water intent', () => {
    const a = randomWorld(42, LANDSCAPE_DEFAULTS);
    expect(randomWorld(42, LANDSCAPE_DEFAULTS)).toEqual(a);
    for (const d of LANDSCAPE_PARAMS) {
      const v = a[d.name];
      if (typeof v === 'number') {
        expect(v).toBeGreaterThanOrEqual(d.min);
        expect(v).toBeLessThanOrEqual(d.max);
      }
    }
    expect(randomWorld(7, LANDSCAPE_DEFAULTS, { water: 'land' }).uWaterLevel).toBe(-0.5);
    expect(randomWorld(7, LANDSCAPE_DEFAULTS, { water: 'water' }).uWaterLevel as number).toBeGreaterThan(0);
    // Camera is untouched by world generation and variation.
    const v = varyWorld(a);
    for (const k of CAMERA_PARAMS) expect(v[k]).toEqual(a[k]);
    expect(v.uStyle).toBe(a.uStyle);
  });
});

describe('routes', () => {
  it('parses viewer and landscape routes with query options', () => {
    expect(parseHash('#/view/preset%3Aplasma?slideshow=20&ui=off')).toEqual({ view: 'view', shaderId: 'preset:plasma', query: { slideshow: '20', ui: 'off' } });
    expect(parseHash('#/view')).toEqual({ view: 'view', shaderId: undefined, query: {} });
    expect(parseHash('#/landscape').view).toBe('landscape');
    expect(parseHash('#/shader/p_1')).toMatchObject({ view: 'workspace', shaderId: 'p_1' });
    expect(parseHash('')).toMatchObject({ view: 'workspace' });
  });
});
