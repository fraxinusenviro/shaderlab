/** Landscape studio state: current parameter values, persisted per browser. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createRng, randomSeed } from '../mutations/rng';
import { clampToDef, cloneValue, deriveParams, mergeParams, valuesEqualType } from '../params/parse';
import landscapeSource from '../presets/shaders/landscape.glsl?raw';
import voxelSource from '../presets/shaders/voxel.glsl?raw';
import type { ParamDef, ParamValue } from '../types/shader';
import { randomBiome } from './biomes';
import { LANDSCAPE_SCENES, WORLD_PARAMS } from './scenes';

export const LANDSCAPE_SOURCE = landscapeSource;
export const LANDSCAPE_PARAMS: ParamDef[] = deriveParams(landscapeSource, 'shadertoy');
export const LANDSCAPE_DEFAULTS: Record<string, ParamValue> = mergeParams(LANDSCAPE_PARAMS, [], {}).values;

/** Block (voxel) render style: same world parameters plus block-specific ones. */
export const VOXEL_SOURCE = voxelSource;
export const VOXEL_PARAMS: ParamDef[] = deriveParams(voxelSource, 'shadertoy');
export const STUDIO_DEFAULTS: Record<string, ParamValue> = { ...mergeParams(VOXEL_PARAMS, [], {}).values, ...LANDSCAPE_DEFAULTS };
const ALL_PARAMS: ParamDef[] = [...LANDSCAPE_PARAMS, ...VOXEL_PARAMS.filter((v) => !LANDSCAPE_PARAMS.some((l) => l.name === v.name))];
export const paramDef = (name: string) => ALL_PARAMS.find((p) => p.name === name);

export type RenderMode = 'smooth' | 'blocks';
export const RENDER_MODES: { id: RenderMode; label: string; presetId: string; source: string; params: ParamDef[] }[] = [
  { id: 'smooth', label: 'Realistic', presetId: 'landscape', source: landscapeSource, params: LANDSCAPE_PARAMS },
  { id: 'blocks', label: 'Blocks', presetId: 'voxel', source: voxelSource, params: VOXEL_PARAMS },
];
export const renderMode = (m: RenderMode) => RENDER_MODES.find((x) => x.id === m) ?? RENDER_MODES[0];

/** Scene values layered over shader defaults. */
export function sceneValues(sceneId: string): Record<string, ParamValue> {
  const scene = LANDSCAPE_SCENES.find((s) => s.id === sceneId) ?? LANDSCAPE_SCENES[0];
  return { ...structuredClone(STUDIO_DEFAULTS), ...structuredClone(scene.values) };
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
  Object.assign(next, randomBiome(rng.int(0, 1_000_000)));
  if (next.uStyle === 3 || next.uStyle === 4) next.uCacti = rng.range(0.3, 0.9);
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

export interface DemInfo {
  assetId: string;
  label: string;
  source: string;
  min: number;
  max: number;
  sizeM: [number, number];
  pixelM: number;
  validFraction: number;
  attribution: string;
  center: [number, number] | null;
  layer: 'dtm' | 'dsm' | 'file';
  width: number;
}

/** World-space height of a real elevation (metres) under the current DEM mapping. */
export function demWorldHeight(v: Record<string, ParamValue>, elevM: number): number {
  return ((elevM - (v.uDemMin as number)) / (v.uDemSizeM as number)) * (v.uDemSpan as number) * (v.uDemExaggeration as number);
}

/** Exaggeration, camera, water, snow and tree lines that suit a DEM. */
export function fitDemValues(v: Record<string, ParamValue>, dem: DemInfo): Record<string, ParamValue> {
  const span = v.uDemSpan as number;
  const relief = ((dem.max - dem.min) / dem.sizeM[0]) * span;
  const exag = Math.min(12, Math.max(1, 1.4 / Math.max(relief, 1e-6)));
  const next: Record<string, ParamValue> = {
    ...v,
    uTerrainSource: 1,
    uDemMin: dem.min,
    uDemMax: Math.max(dem.max, dem.min + 0.1),
    uDemSizeM: dem.sizeM[0],
    uDemAspect: dem.sizeM[1] / dem.sizeM[0],
    uDemExaggeration: Number(exag.toFixed(2)),
    uCamMode: 1,
    uOrbitRadius: Number((span * 0.42).toFixed(2)),
    uAltitude: Number((relief * exag * 0.55 + 0.5).toFixed(2)),
    uPitch: -0.3,
    uHeading: 0.6,
    uFlySpeed: 0.25,
  };
  // Coastal data (reaching sea level) gets a sea; inland data none.
  next.uWaterLevel = dem.min <= 2 ? demWorldHeight(next, 0.3) : -0.6;
  // Snow and trees by real altitude: snow above ~2,600 m, trees below ~2,000 m.
  next.uSnowLine = dem.max > 2600 ? demWorldHeight(next, 2600) : 4;
  next.uTreeLine = dem.max > 2000 ? Math.max(0.05, demWorldHeight(next, 2000)) : 4;
  return next;
}

interface LandscapeState {
  dem: DemInfo | null;
  applyDem: (d: DemInfo) => void;
  fitDem: () => void;
  setWaterElevation: (m: number) => void;
  mode: RenderMode;
  setMode: (m: RenderMode) => void;
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
      dem: null,
      applyDem: (d) => set({ dem: d, values: fitDemValues(get().values, d), sceneId: null, history: [...get().history.slice(-49), get().values] }),
      fitDem: () => {
        const d = get().dem;
        if (d) set({ values: fitDemValues(get().values, d), history: [...get().history.slice(-49), get().values] });
      },
      setWaterElevation: (m) => get().setMany({ uWaterLevel: demWorldHeight(get().values, m) }),
      mode: 'smooth',
      setMode: (mode) => set({ mode }),
      values: sceneValues(LANDSCAPE_SCENES[0].id),
      sceneId: LANDSCAPE_SCENES[0].id,
      history: [],
      set: (name, v) => {
        const prev = get().values;
        set({ values: { ...prev, [name]: cloneValue(v) }, history: [...get().history.slice(-49), prev] });
      },
      setMany: (v, sceneId = null) => set({ values: { ...get().values, ...v }, sceneId, history: [...get().history.slice(-49), get().values] }),
      // Render quality is a performance preference, not part of a scene.
      applyScene: (id) => set({ values: { ...sceneValues(id), uQuality: get().values.uQuality, uTerrainSource: 0 }, sceneId: id, history: [...get().history.slice(-49), get().values] }),
      undo: () => {
        const h = get().history;
        if (!h.length) return;
        set({ values: h[h.length - 1], history: h.slice(0, -1), sceneId: null });
      },
    }),
    {
      name: 'shader-forge:landscape',
      version: 1,
      partialize: (s) => ({ values: s.values, sceneId: s.sceneId, mode: s.mode, dem: s.dem }),
      // Re-validate persisted values against the current shader's parameters.
      merge: (persisted, current) => {
        const p = persisted as Partial<LandscapeState> | undefined;
        const values = { ...STUDIO_DEFAULTS };
        for (const d of ALL_PARAMS) {
          const v = p?.values?.[d.name];
          if (valuesEqualType(d, v)) values[d.name] = v!;
        }
        return { ...current, values, sceneId: p?.sceneId ?? current.sceneId, mode: p?.mode === 'blocks' ? 'blocks' : 'smooth', dem: p?.dem && typeof p.dem.assetId === 'string' ? p.dem : null };
      },
    },
  ),
);
