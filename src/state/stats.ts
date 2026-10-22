import { create } from 'zustand';
import type { RenderStats } from '../renderer/engine';

/** Kept separate so per-frame stats only re-render the stats readout. */
export const useStats = create<{ stats: RenderStats | null; set: (s: RenderStats) => void }>((set) => ({
  stats: null,
  set: (stats) => set({ stats }),
}));
