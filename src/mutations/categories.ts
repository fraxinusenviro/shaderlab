import type { ParamDef } from '../types/shader';

/** Semantic groups the mutation lab can target. */
export const MUTATION_CATEGORIES = [
  { id: 'frequency', label: 'Frequency / scale', color: '#38bdf8' },
  { id: 'amplitude', label: 'Amplitude / intensity', color: '#f472b6' },
  { id: 'coordinates', label: 'Coordinates / transform', color: '#a78bfa' },
  { id: 'color', label: 'Colour / palette', color: '#fb923c' },
  { id: 'symmetry', label: 'Symmetry / repetition', color: '#4ade80' },
  { id: 'noise', label: 'Noise character', color: '#facc15' },
  { id: 'warp', label: 'Warp / distortion', color: '#f87171' },
  { id: 'animation', label: 'Animation speed / direction', color: '#2dd4bf' },
  { id: 'other', label: 'Other', color: '#94a3b8' },
] as const;

export type MutationCategory = (typeof MUTATION_CATEGORIES)[number]['id'];

export function categorizeParam(def: ParamDef): MutationCategory {
  const s = `${def.name} ${def.group} ${def.label}`.toLowerCase();
  if (def.widget === 'color' || /colou?r|hue|palette|tint|sat|bright|contrast|gamma|glow/.test(s)) return 'color';
  if (/speed|rate|tempo|anim|dir(ection)?\b|flow/.test(s)) return 'animation';
  if (/sym|fold|segment|mirror|kaleid|repeat|tile|count|petal|arms/.test(s)) return 'symmetry';
  if (/warp|distort|displace|swirl|twist|bend|ripple/.test(s)) return 'warp';
  if (/octave|noise|rough|lacun|persist|gain|detail|turb|grain/.test(s)) return 'noise';
  if (/freq|scale|zoom|size|density|wavelength/.test(s)) return 'frequency';
  if (/amp|strength|intens|amount|height|depth|power/.test(s)) return 'amplitude';
  if (/offset|center|centre|pos|rot|angle|pan|origin|camera|view/.test(s) || def.widget === 'xy' || def.widget === 'angle') return 'coordinates';
  return 'other';
}
