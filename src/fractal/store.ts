/** Fractal Zoom settings and last view, persisted per browser. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ColorMap } from './renderer';

export type Quality = 'draft' | 'balanced' | 'high';
export type LoopMode = 'bounce' | 'restart' | 'stop';

export interface Bookmark {
  id: string;
  name: string;
  re: string;
  im: string;
  zoom: number;
  palette: string;
  createdAt: number;
}

export interface FractalSettings {
  re: string;
  im: string;
  zoom: number; // log10 magnification
  rotation: number;
  palette: string;
  density: number;
  phase: number;
  cycle: number; // palette cycles per second
  map: ColorMap;
  interior: [number, number, number];
  quality: Quality;
  iterBoost: number;
  speed: number; // decades of zoom per second
  direction: 1 | -1;
  targetDepth: number;
  loop: LoopMode;
  spin: number; // radians per second
  tourId: string | null;
  bookmarks: Bookmark[];
}

export const FRACTAL_DEFAULTS: FractalSettings = {
  re: '-0.75',
  im: '0',
  zoom: 0,
  rotation: 0,
  palette: 'classic',
  density: 1,
  phase: 0,
  cycle: 0,
  map: 'sqrt',
  interior: [0, 0, 0],
  quality: 'balanced',
  iterBoost: 1,
  speed: 0.35,
  direction: 1,
  targetDepth: 15,
  loop: 'bounce',
  spin: 0,
  tourId: null,
  bookmarks: [],
};

export const QUALITY: Record<Quality, { label: string; moving: number; still: number; cap: number }> = {
  draft: { label: 'Draft', moving: 0.35, still: 0.7, cap: 6000 },
  balanced: { label: 'Balanced', moving: 0.5, still: 1, cap: 15000 },
  high: { label: 'High', moving: 0.75, still: 1.5, cap: 40000 },
};

/** Deepest zoom float32 perturbation renders reliably. */
export const MAX_DEEP_ZOOM = 30;
/** Plain float32 iteration (WebGL 1 fallback) breaks down beyond this. */
export const MAX_SHALLOW_ZOOM = 5;

export function autoIterations(zoom: number, quality: Quality, boost: number, minIter = 0): number {
  const base = 250 + 380 * Math.max(0, zoom);
  // A tour's minimum (e.g. several times a minibrot's period) wins over the cap,
  // otherwise the destination would render as solid interior.
  return Math.round(Math.max(Math.min(QUALITY[quality].cap, base * boost), minIter));
}

interface FractalStore extends FractalSettings {
  set: (patch: Partial<FractalSettings>) => void;
}

export const useFractal = create<FractalStore>()(
  persist(
    (set) => ({
      ...FRACTAL_DEFAULTS,
      set: (patch) => set(patch),
    }),
    { name: 'shader-forge:fractal', version: 1, partialize: ({ set: _s, ...rest }) => rest },
  ),
);
