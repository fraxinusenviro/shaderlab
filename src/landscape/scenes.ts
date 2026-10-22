/**
 * Scene presets for the Landscape & Waterscape studio. Each scene is a
 * partial set of uniform values for shaders/landscape.glsl; anything not
 * listed keeps the shader's annotated default.
 */
import type { ParamValue } from '../types/shader';

export interface LandscapeScene {
  id: string;
  name: string;
  kind: 'land' | 'water' | 'both';
  description: string;
  values: Record<string, ParamValue>;
}

export const LANDSCAPE_SCENES: LandscapeScene[] = [
  {
    id: 'alpine-lake',
    name: 'Alpine lake',
    kind: 'both',
    description: 'Ridged snowy peaks around a clear mountain lake.',
    values: { uStyle: 0, uSeed: 17, uHeight: 1.8, uScale: 1, uWaterLevel: 0.32, uSnowLine: 1.25, uVegetation: 0.7, uClarity: 0.7, uWaveHeight: 0.15, uSunElevation: 0.45, uSunAzimuth: 0.9, uClouds: 0.4, uFog: 0.3, uAltitude: 1.3, uPitch: -0.2, uHeading: 2.2, uFlySpeed: 0.35, uWaterDeep: [0.02, 0.12, 0.2], uWaterShallow: [0.12, 0.42, 0.45] },
  },
  {
    id: 'archipelago',
    name: 'Tropical archipelago',
    kind: 'water',
    description: 'Scattered green islands in turquoise shallows.',
    values: { uStyle: 2, uSeed: 211, uHeight: 1.1, uScale: 1.2, uWaterLevel: 0.22, uSnowLine: 4, uVegetation: 0.95, uClarity: 0.95, uWaveHeight: 0.3, uFoam: 0.7, uSunElevation: 0.9, uSunAzimuth: 2.4, uClouds: 0.35, uFog: 0.15, uAltitude: 0.9, uPitch: -0.22, uFlySpeed: 0.5, uWaterDeep: [0.0, 0.2, 0.35], uWaterShallow: [0.1, 0.75, 0.7] },
  },
  {
    id: 'desert-canyon',
    name: 'Desert canyon',
    kind: 'land',
    description: 'Terraced mesas cut by dry river beds.',
    values: { uStyle: 3, uSeed: 64, uHeight: 1.6, uScale: 1.3, uWaterLevel: -0.4, uSnowLine: 4, uVegetation: 0.1, uRock: [0.62, 0.36, 0.22], uSunElevation: 0.3, uSunAzimuth: 4.1, uClouds: 0.1, uFog: 0.25, uAltitude: 0.7, uPitch: -0.12, uFlySpeed: 0.4 },
  },
  {
    id: 'dune-sea',
    name: 'Dune sea',
    kind: 'land',
    description: 'Wind-sculpted sand ridges under a hot sky.',
    values: { uStyle: 4, uSeed: 9, uHeight: 1.3, uScale: 1.4, uWaterLevel: -0.5, uSnowLine: 4, uVegetation: 0, uSunElevation: 0.25, uSunAzimuth: 1.6, uClouds: 0.05, uFog: 0.12, uAltitude: 0.45, uPitch: -0.1, uFlySpeed: 0.5 },
  },
  {
    id: 'stormy-coast',
    name: 'Stormy coast',
    kind: 'water',
    description: 'Dark rocky headlands, heavy surf and low cloud.',
    values: { uStyle: 2, uSeed: 403, uHeight: 1.7, uScale: 1.1, uWaterLevel: 0.3, uSnowLine: 4, uVegetation: 0.35, uRock: [0.3, 0.29, 0.28], uClarity: 0.15, uWaveHeight: 1, uWaveSpeed: 1.8, uFoam: 0.8, uSunElevation: 0.12, uSunAzimuth: 5.2, uClouds: 0.95, uFog: 0.7, uAltitude: 0.45, uPitch: -0.08, uFlySpeed: 0.6, uWaterDeep: [0.03, 0.07, 0.09], uWaterShallow: [0.12, 0.22, 0.22] },
  },
  {
    id: 'fjord-dusk',
    name: 'Fjord at dusk',
    kind: 'both',
    description: 'Steep valley walls over still water at sunset.',
    values: { uStyle: 0, uSeed: 128, uHeight: 2.6, uScale: 0.9, uWaterLevel: 0.6, uSnowLine: 1.9, uVegetation: 0.5, uClarity: 0.4, uWaveHeight: 0.08, uSunElevation: 0.05, uSunAzimuth: 1.3, uClouds: 0.5, uFog: 0.45, uAltitude: 0.35, uPitch: 0.0, uHeading: 0.3, uFlySpeed: 0.3 },
  },
  {
    id: 'rolling-hills',
    name: 'Rolling hills',
    kind: 'land',
    description: 'Soft green countryside with ponds.',
    values: { uStyle: 1, uSeed: 33, uHeight: 1.4, uScale: 1.2, uWaterLevel: 0.3, uSnowLine: 4, uVegetation: 1, uClarity: 0.5, uWaveHeight: 0.1, uSunElevation: 0.6, uSunAzimuth: 2.0, uClouds: 0.55, uFog: 0.3, uAltitude: 0.5, uPitch: -0.1, uFlySpeed: 0.35 },
  },
  {
    id: 'open-ocean',
    name: 'Open ocean',
    kind: 'water',
    description: 'Endless swell under a bright midday sky.',
    values: { uStyle: 2, uSeed: 5, uHeight: 0.3, uWaterLevel: 1.0, uWaveHeight: 0.7, uWaveSpeed: 1.2, uFoam: 0.6, uClarity: 0.3, uSunElevation: 0.7, uSunAzimuth: 3.0, uClouds: 0.5, uFog: 0.2, uAltitude: 0.35, uPitch: -0.04, uFlySpeed: 0.6, uWaterDeep: [0.01, 0.08, 0.18], uWaterShallow: [0.05, 0.3, 0.4] },
  },
  {
    id: 'moonlit-tarn',
    name: 'Moonlit tarn',
    kind: 'both',
    description: 'Night-time highland pool with faint twilight.',
    values: { uStyle: 0, uSeed: 777, uHeight: 1.5, uWaterLevel: 0.4, uSnowLine: 1.1, uVegetation: 0.3, uClarity: 0.5, uWaveHeight: 0.05, uSunElevation: -0.1, uSunAzimuth: 3.6, uClouds: 0.25, uFog: 0.15, uAltitude: 0.4, uPitch: 0.02, uFlySpeed: 0.15 },
  },
];

/** Parameters that define the world (vs. camera/view) — used by "New world". */
export const WORLD_PARAMS = ['uStyle', 'uSeed', 'uScale', 'uHeight', 'uRoughness', 'uSnowLine', 'uVegetation', 'uWaterLevel', 'uWaveHeight', 'uClarity', 'uFoam', 'uSunElevation', 'uSunAzimuth', 'uClouds', 'uFog'];
export const CAMERA_PARAMS = ['uAltitude', 'uPitch', 'uHeading', 'uFlySpeed', 'uFov', 'uQuality'];
