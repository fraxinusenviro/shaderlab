import { describe, expect, it } from 'vitest';
import { valuesEqualType } from '../params/parse';
import { CAMERA_PARAMS, LANDSCAPE_SCENES, WORLD_PARAMS } from '../landscape/scenes';
import { LANDSCAPE_DEFAULTS, LANDSCAPE_PARAMS, paramDef, randomWorld, sceneValues, STUDIO_DEFAULTS, varyWorld, VOXEL_PARAMS } from '../landscape/store';
import { parseHash } from '../hooks/useHashRoute';
import { BIOMES, randomBiome, VEGETATION_PARAMS } from '../landscape/biomes';

describe('landscape shader parameters', () => {
  it('exposes grouped terrain / water / sky / camera controls', () => {
    const groups = new Set(LANDSCAPE_PARAMS.map((d) => d.group));
    expect([...groups].sort()).toEqual(['Camera', 'Elevation', 'Sky', 'Terrain', 'Vegetation', 'Water']);
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
    expect(Object.keys(all).sort()).toEqual(Object.keys(STUDIO_DEFAULTS).sort());
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

describe('block (voxel) render style', () => {
  it('shares the world generator parameters so both styles show the same world', () => {
    const shared = ['uStyle', 'uSeed', 'uScale', 'uHeight', 'uRoughness', 'uOctaves', 'uSnowLine', 'uVegetation', 'uWaterLevel', 'uSunElevation', 'uSunAzimuth', 'uClouds', 'uFog', ...CAMERA_PARAMS];
    for (const k of shared) {
      const a = LANDSCAPE_PARAMS.find((d) => d.name === k)!;
      const b = VOXEL_PARAMS.find((d) => d.name === k);
      expect(b, k).toBeDefined();
      expect({ type: b!.type, min: b!.min, max: b!.max, default: b!.default }).toEqual({ type: a.type, min: a.min, max: a.max, default: a.default });
    }
    expect(VOXEL_PARAMS.filter((d) => d.group === 'Blocks').map((d) => d.name)).toEqual(['uBlockSize', 'uPixelTexture', 'uEdges']);
  });
});

describe('vegetation generator', () => {
  it('both render styles expose identical vegetation controls', () => {
    const veg = (list: typeof LANDSCAPE_PARAMS) => list.filter((d) => d.group === 'Vegetation').map(({ name, type, min, max, default: def, widget }) => ({ name, type, min, max, def, widget }));
    expect(veg(LANDSCAPE_PARAMS)).toEqual(veg(VOXEL_PARAMS));
    expect(veg(LANDSCAPE_PARAMS).map((d) => d.name)).toEqual(VEGETATION_PARAMS);
  });
  it.each(BIOMES.map((b) => [b.id, b] as const))('biome %s sets valid, in-range parameters', (_id, b) => {
    for (const [k, v] of Object.entries(b.values)) {
      const def = paramDef(k)!;
      expect(def, k).toBeDefined();
      expect(def.group).toBe('Vegetation');
      expect(valuesEqualType(def, v)).toBe(true);
      for (const x of Array.isArray(v) ? v : [v as number]) {
        expect(x).toBeGreaterThanOrEqual(def.min);
        expect(x).toBeLessThanOrEqual(def.max);
      }
    }
  });
  it('random biomes are reproducible blends', () => {
    expect(randomBiome(5)).toEqual(randomBiome(5));
    const b = randomBiome(9);
    for (const [k, v] of Object.entries(b)) expect(valuesEqualType(paramDef(k)!, v), k).toBe(true);
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
