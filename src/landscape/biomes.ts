/**
 * Vegetation biome presets for the Landscape studio. Each sets the shared
 * vegetation parameters understood by both render styles.
 */
import { createRng } from '../mutations/rng';
import type { ParamValue } from '../types/shader';

export interface Biome {
  id: string;
  name: string;
  description: string;
  values: Record<string, ParamValue>;
}

export const VEGETATION_PARAMS = ['uPlants', 'uVegetation', 'uForest', 'uForestPatch', 'uConifer', 'uTreeSize', 'uTreeVariety', 'uTreeLine', 'uShrubs', 'uFlowers', 'uCacti', 'uLeafColor', 'uGrassColor', 'uFlowerColor', 'uVegSeed'];

export const BIOMES: Biome[] = [
  { id: 'boreal', name: 'Boreal forest', description: 'Dense dark conifers up to a high tree line.', values: { uVegetation: 0.7, uForest: 0.8, uForestPatch: 0.35, uConifer: 0.92, uTreeSize: 1.1, uTreeVariety: 0.5, uTreeLine: 1.6, uShrubs: 0.2, uFlowers: 0.03, uLeafColor: [0.09, 0.2, 0.1], uGrassColor: [0.22, 0.27, 0.12] } },
  { id: 'temperate', name: 'Temperate woodland', description: 'Mixed broadleaf woods with open glades.', values: { uVegetation: 0.85, uForest: 0.55, uForestPatch: 0.65, uConifer: 0.25, uTreeSize: 1.0, uTreeVariety: 0.6, uTreeLine: 1.4, uShrubs: 0.35, uFlowers: 0.2, uLeafColor: [0.17, 0.33, 0.09], uGrassColor: [0.25, 0.34, 0.1] } },
  { id: 'autumn', name: 'Autumn', description: 'Broadleaf woods in red, orange and gold.', values: { uVegetation: 0.8, uForest: 0.6, uForestPatch: 0.55, uConifer: 0.15, uTreeSize: 1.0, uTreeVariety: 0.6, uTreeLine: 1.4, uShrubs: 0.3, uFlowers: 0.0, uLeafColor: [0.62, 0.28, 0.07], uGrassColor: [0.38, 0.34, 0.14] } },
  { id: 'meadow', name: 'Spring meadow', description: 'Rolling grassland full of wildflowers, scattered trees.', values: { uVegetation: 1.0, uForest: 0.12, uForestPatch: 0.8, uConifer: 0.2, uTreeSize: 1.0, uTreeVariety: 0.5, uTreeLine: 1.6, uShrubs: 0.25, uFlowers: 0.85, uLeafColor: [0.2, 0.4, 0.1], uGrassColor: [0.3, 0.42, 0.1], uFlowerColor: [0.95, 0.55, 0.75] } },
  { id: 'tropical', name: 'Tropical rainforest', description: 'Lush, tall, closed canopy right down to the shore.', values: { uVegetation: 1.0, uForest: 0.85, uForestPatch: 0.25, uConifer: 0.0, uTreeSize: 1.45, uTreeVariety: 0.7, uTreeLine: 2.5, uShrubs: 0.7, uFlowers: 0.1, uLeafColor: [0.08, 0.38, 0.1], uGrassColor: [0.2, 0.38, 0.08], uFlowerColor: [0.95, 0.3, 0.25] } },
  { id: 'savanna', name: 'Savanna', description: 'Dry golden grass with lone trees and bushes.', values: { uVegetation: 0.9, uForest: 0.07, uForestPatch: 0.2, uConifer: 0.0, uTreeSize: 1.35, uTreeVariety: 0.4, uTreeLine: 2.5, uShrubs: 0.45, uFlowers: 0.05, uLeafColor: [0.25, 0.32, 0.1], uGrassColor: [0.52, 0.46, 0.22] } },
  { id: 'desert-bloom', name: 'Desert bloom', description: 'Cacti and flowering scrub (canyons and dunes).', values: { uCacti: 0.85, uShrubs: 0.5, uFlowers: 0.4, uFlowerColor: [0.95, 0.35, 0.55], uVegetation: 0.3 } },
  { id: 'barren', name: 'Barren', description: 'Bare rock and sparse grass — no trees.', values: { uVegetation: 0.2, uForest: 0, uShrubs: 0.05, uFlowers: 0, uCacti: 0.05 } },
];

/** A random but coherent biome: interpolates between two presets. */
export function randomBiome(seed: number): Record<string, ParamValue> {
  const rng = createRng(seed);
  const pool = BIOMES.filter((b) => b.id !== 'barren' && b.id !== 'desert-bloom');
  const a = rng.pick(pool).values;
  const b = rng.pick(pool).values;
  const t = rng();
  const out: Record<string, ParamValue> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k] ?? b[k];
    const vb = b[k] ?? a[k];
    out[k] = Array.isArray(va) && Array.isArray(vb) ? va.map((x, i) => x + ((vb[i] as number) - x) * t) : typeof va === 'number' && typeof vb === 'number' ? va + (vb - va) * t : va;
  }
  out.uVegSeed = rng.int(0, 999);
  return out;
}
