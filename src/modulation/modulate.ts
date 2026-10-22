/**
 * Synth-style parameter modulation. Evaluated every frame by the renderer's
 * value source; pure and allocation-light.
 */
import { componentCount } from '../params/parse';
import type { Keyframe, Modulation, ModulationKind, ParamDef, ParamValue } from '../types/shader';
import { compileExpression, hash1, valueNoise1 } from './expr';

export const MODULATION_KINDS: { id: ModulationKind; label: string }[] = [
  { id: 'constant', label: 'Constant' },
  { id: 'sine', label: 'Sine LFO' },
  { id: 'triangle', label: 'Triangle LFO' },
  { id: 'saw', label: 'Sawtooth LFO' },
  { id: 'square', label: 'Square LFO' },
  { id: 'random', label: 'Random steps' },
  { id: 'noise', label: 'Smooth noise' },
  { id: 'keyframes', label: 'Keyframes' },
  { id: 'expression', label: 'Expression' },
  { id: 'link', label: 'Link to parameter' },
];

export function defaultModulation(kind: ModulationKind = 'sine'): Modulation {
  return { kind, enabled: true, rate: 0.25, depth: 0.5, phase: 0, duration: 4, keyframes: [], expression: 'base + 0.25 * (max - min) * sin(t)', seed: 1 };
}

const fract = (x: number) => x - Math.floor(x);

/** Bipolar waveform in [-1, 1]. */
export function oscillator(kind: ModulationKind, x: number, seed = 0): number {
  switch (kind) {
    case 'sine':
      return Math.sin(2 * Math.PI * x);
    case 'triangle':
      return 1 - 4 * Math.abs(fract(x + 0.25) - 0.5);
    case 'saw':
      return 2 * fract(x) - 1;
    case 'square':
      return fract(x) < 0.5 ? 1 : -1;
    case 'random':
      return hash1(Math.floor(x) + seed * 17.13) * 2 - 1;
    case 'noise':
      return valueNoise1(x + seed * 31.7) * 2 - 1;
    default:
      return 0;
  }
}

export function sampleKeyframes(kfs: Keyframe[], t: number, duration: number): number | null {
  if (!kfs.length) return null;
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  const tt = duration > 0 ? t - duration * Math.floor(t / duration) : t;
  if (tt <= sorted[0].t) return sorted[0].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (tt >= a.t && tt <= b.t) {
      const span = b.t - a.t || 1;
      let u = (tt - a.t) / span;
      if (b.ease === 'step') u = 0;
      else if (b.ease === 'smooth' || b.ease === undefined) u = u * u * (3 - 2 * u);
      return a.v + (b.v - a.v) * u;
    }
  }
  return sorted[sorted.length - 1].v;
}

function modScalar(def: ParamDef, base: number, m: Modulation, t: number, resolved: Record<string, ParamValue>, params: Map<string, ParamDef>): number {
  const span = def.max - def.min;
  const amp = m.depth * span * 0.5;
  let v = base;
  switch (m.kind) {
    case 'constant':
      break;
    case 'sine':
    case 'triangle':
    case 'saw':
    case 'square':
    case 'random':
    case 'noise':
      v = base + amp * oscillator(m.kind, m.rate * t + m.phase, m.seed ?? 0);
      break;
    case 'keyframes': {
      const k = sampleKeyframes(m.keyframes ?? [], t, m.duration ?? 4);
      if (k !== null) v = k;
      break;
    }
    case 'expression':
      try {
        v = compileExpression(m.expression ?? 'base')({ t, base, min: def.min, max: def.max });
      } catch {
        v = base;
      }
      break;
    case 'link': {
      const src = m.source ? params.get(m.source) : undefined;
      const sv = m.source ? resolved[m.source] : undefined;
      if (src && typeof sv === 'number') {
        const norm = (sv - src.min) / (src.max - src.min || 1);
        const target = def.min + norm * span;
        v = base + (target - base) * m.depth;
      }
      break;
    }
  }
  if (!Number.isFinite(v)) v = base;
  v = Math.min(def.max, Math.max(def.min, v));
  return def.type === 'int' ? Math.round(v) : v;
}

/**
 * Apply modulations to base values at time t. Returns the original object
 * when nothing is modulated (cheap fast path).
 */
export function applyModulations(
  params: ParamDef[],
  values: Record<string, ParamValue>,
  modulations: Record<string, Modulation>,
  t: number,
): Record<string, ParamValue> {
  const active = params.filter((p) => modulations[p.name]?.enabled && modulations[p.name].kind !== 'constant');
  if (!active.length) return values;
  const out: Record<string, ParamValue> = { ...values };
  const byName = new Map(params.map((p) => [p.name, p]));
  // Two passes so links can follow other modulated params.
  const order = [...active.filter((p) => modulations[p.name].kind !== 'link'), ...active.filter((p) => modulations[p.name].kind === 'link')];
  for (const def of order) {
    const m = modulations[def.name];
    const base = values[def.name] ?? def.default;
    if (def.type === 'bool') {
      const osc = m.kind === 'keyframes' ? (sampleKeyframes(m.keyframes ?? [], t, m.duration ?? 4) ?? 0) - 0.5 : oscillator(m.kind === 'link' || m.kind === 'expression' ? 'square' : m.kind, m.rate * t + m.phase, m.seed ?? 0);
      out[def.name] = osc > 0;
    } else if (componentCount(def.type) === 1) {
      out[def.name] = modScalar(def, base as number, m, t, out, byName);
    } else {
      out[def.name] = (base as number[]).map((c, i) =>
        def.widget === 'color' && i === 3 ? c : modScalar(def, c, m, t, out, byName),
      );
    }
  }
  return out;
}
