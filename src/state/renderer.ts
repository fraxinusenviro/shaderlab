/**
 * Holds the main viewport renderer instance outside React state so the
 * workspace store can drive it without causing re-renders.
 */
import { Clock } from '../renderer/clock';
import type { ShaderRenderer } from '../renderer/engine';

export const mainClock = new Clock();
let main: ShaderRenderer | null = null;
const listeners = new Set<(r: ShaderRenderer | null) => void>();

export function setMainRenderer(r: ShaderRenderer | null): void {
  main = r;
  listeners.forEach((l) => l(r));
}

export function getMainRenderer(): ShaderRenderer | null {
  return main;
}

export function onMainRenderer(fn: (r: ShaderRenderer | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
