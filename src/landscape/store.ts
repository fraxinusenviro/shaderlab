/** Landscape studio state: current parameter values, persisted per browser. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createRng, randomSeed } from '../mutations/rng';
import { clampToDef, cloneValue, deriveParams, mergeParams, valuesEqualType } from '../params/parse';
import landscapeSource from '../presets/shaders/landscape.glsl?raw';
import type { ParamDef, ParamValue } from '../types/shader';
import { LANDSCAPE_SCENES, WORLD_PARAMS } from './scenes';

export const LANDSCAPE_SOURCE = landscapeSource;
export const LANDSCAPE_PARAMS: ParamDef[] = deriveParams(landscapeSource, 'shadertoy');
export const LANDSCAPE_DEFAULTS: Record<string, ParamValue> = mergeParams(LANDSCAPE_PARAMS, [], {}).values;
export const paramDef = (name: string) => LANDSCAPE_PARAMS.find((p) => p.name === name);

/** Scene values layered over shader defaults. */
export function sceneValues(sceneId: string): Record<string, ParamValue> {
  const scene = LANDSCAPE_SCENES.find((s) => s.id === sceneId) ?? LANDSCAPE_SCENES[0];
  return { ...structuredClone(LANDSCAPE_DEFAULTS), ...structuredClone(scene.values) };
}

/** Sensible ranges for "New world" (narrower than the full slider ranges). */
const WORLD_RANGES: Record<string, [number, number]> = {
  uScale: [0.7, 1.6],
  uHeight: [0.9, 2.4],
  uRoughness: [0.42, 0.56],
  uSnowLine: [1.0, 3.0],
  uVegetation: [0.2, 1.0],
  uWaveHeight: [0.05, 0.6],
  uClarity: [0.2, 0.95],
  uFoam: [0.3, 0.9],
  uSunElevation: [0.08, 1.0],
  uSunAzimuth: [0, 6.28],
  uClouds: [0.0, 0.8],
  uFog: [0.1, 0.55],
};

export function randomWorld(seed: number, current: Record<string, ParamValue>, opts: { water: 'auto' | 'land' | 'water' } = { water: 'auto' }): Record<string, ParamValue> {
  const rng = createRng(seed);
  const next = { ...current };
  next.uStyle = rng.int(0, 4);
  next.uSeed = rng.int(0, 999);
  for (const [k, [a, b]] of Object.entries(WORLD_RANGES)) {
    const def = paramDef(k);
    if (def) next[k] = clampToDef(def, rng.range(a, b));
  }
  const h = next.uHeight as number;
  const wantWater = opts.water === 'water' || (opts.water === 'auto' && rng.chance(next.uStyle === 4 || next.uStyle === 3 ? 0.25 : 0.8));
  next.uWaterLevel = wantWater ? Number((h * rng.range(0.12, 0.4)).toFixed(3)) : -0.5;
  return next;
}

/** Small perturbation of world parameters only (keeps style, seed and camera). */
export function varyWorld(current: Record<string, ParamValue>, amount = 0.15): Record<string, ParamValue> {
  const rng = createRng(randomSeed());
  const next = { ...current };
  for (const k of WORLD_PARAMS) {
    const def = paramDef(k);
    if (!def || def.type !== 'float') continue;
    next[k] = clampToDef(def, (current[k] as number) + rng.gauss() * amount * (def.max - def.min) * 0.3);
  }
  return next;
}

interface LandscapeState {
  values: Record<string, ParamValue>;
  sceneId: string | null;
  history: Record<string, ParamValue>[];
  set: (name: string, v: ParamValue) => void;
  setMany: (v: Record<string, ParamValue>, sceneId?: string | null) => void;
  applyScene: (id: string) => void;
  undo: () => void;
}

export const useLandscape = create<LandscapeState>()(
  persist(
    (set, get) => ({
      values: sceneValues(LANDSCAPE_SCENES[0].id),
      sceneId: LANDSCAPE_SCENES[0].id,
      history: [],
      set: (name, v) => {
        const prev = get().values;
        set({ values: { ...prev, [name]: cloneValue(v) }, history: [...get().history.slice(-49), prev] });
      },
      setMany: (v, sceneId = null) => set({ values: { ...get().values, ...v }, sceneId, history: [...get().history.slice(-49), get().values] }),
      applyScene: (id) => set({ values: sceneValues(id), sceneId: id, history: [...get().history.slice(-49), get().values] }),
      undo: () => {
        const h = get().history;
        if (!h.length) return;
        set({ values: h[h.length - 1], history: h.slice(0, -1), sceneId: null });
      },
    }),
    {
      name: 'shader-forge:landscape',
      version: 1,
      partialize: (s) => ({ values: s.values, sceneId: s.sceneId }),
      // Re-validate persisted values against the current shader's parameters.
      merge: (persisted, current) => {
        const p = persisted as Partial<LandscapeState> | undefined;
        const values = { ...LANDSCAPE_DEFAULTS };
        for (const d of LANDSCAPE_PARAMS) {
          const v = p?.values?.[d.name];
          if (valuesEqualType(d, v)) values[d.name] = v!;
        }
        return { ...current, values, sceneId: p?.sceneId ?? current.sceneId };
      },
    },
  ),
);
