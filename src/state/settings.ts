import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Settings {
  theme: 'dark' | 'light';
  preferWebGL2: boolean;
  /** Multiplier on devicePixelRatio for the main viewport. */
  pixelRatio: number;
  /** Max drawing-buffer pixels for the main viewport. */
  maxPixels: number;
  /** 0 = uncapped. */
  fpsCap: number;
  thumbQuality: 'low' | 'medium' | 'high';
  autoCompile: boolean;
  compileDelay: number;
  autosaveLibrary: boolean;
  autosaveDelay: number;
  editorFontSize: number;
  compactControls: boolean;
  showStats: boolean;
  /** Page shown when the app is opened without a route. */
  startPage: 'workspace' | 'view' | 'landscape' | 'fractal';
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  preferWebGL2: true,
  pixelRatio: 1,
  maxPixels: 2560 * 1440,
  fpsCap: 0,
  thumbQuality: 'medium',
  autoCompile: true,
  compileDelay: 350,
  autosaveLibrary: true,
  autosaveDelay: 1200,
  editorFontSize: 13,
  compactControls: false,
  showStats: true,
  startPage: 'workspace',
};

export const THUMB_SIZES: Record<Settings['thumbQuality'], [number, number]> = {
  low: [160, 90],
  medium: [256, 144],
  high: [384, 216],
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    { name: 'shader-forge:settings', version: 1 },
  ),
);
