/**
 * Level 1 — uniform mutation. Alters parameter values only; GLSL source is
 * untouched, so every result is guaranteed to compile.
 */
import { clampToDef, cloneValue, componentCount } from '../params/parse';
import type { MutationOp, ParamDef, ParamValue } from '../types/shader';
import { categorizeParam, type MutationCategory } from './categories';
import { createRng, type Rng } from './rng';

export interface UniformMutationOptions {
  seed: number;
  /** 0..1 — fraction of each parameter's range used as the perturbation scale. */
  strength: number;
  /** 0..1 — chance that an eligible parameter is touched at all. */
  probability: number;
  locked: string[];
  /** Restrict to these semantic categories (empty/undefined = all). */
  categories?: MutationCategory[];
  /** Restrict to these parameter names (randomisation scope "selected"). */
  only?: string[];
  /** 'perturb' nudges from the current value; 'randomize' picks anywhere in range. */
  mode: 'perturb' | 'randomize';
  /** Allow sign flips on animation-speed parameters (direction changes). */
  allowReverse?: boolean;
}

const fmt = (v: ParamValue): string =>
  Array.isArray(v) ? `(${v.map((x) => Number(x.toFixed(3))).join(', ')})` : typeof v === 'number' ? String(Number(v.toFixed(4))) : String(v);

function mutateScalar(def: ParamDef, cur: number, rng: Rng, opts: UniformMutationOptions, min = def.min, max = def.max): number {
  if (def.widget === 'seed') return rng.int(Math.max(0, Math.round(min)), Math.max(1, Math.round(max)));
  if (def.widget === 'select' && def.options?.length) return rng.pick(def.options).value;
  const span = max - min || 1;
  let next: number;
  if (opts.mode === 'randomize') {
    // Blend toward a uniformly random value; strength 1 = fully random.
    const target = rng.range(min, max);
    next = cur + (target - cur) * Math.min(1, opts.strength * 1.5);
  } else {
    next = cur + rng.gauss() * opts.strength * span * 0.35;
  }
  return clampToDef({ ...def, min, max }, next);
}

export function eligibleParams(params: ParamDef[], opts: Pick<UniformMutationOptions, 'locked' | 'categories' | 'only'>): ParamDef[] {
  return params.filter((p) => {
    if (opts.locked.includes(p.name)) return false;
    if (opts.only?.length && !opts.only.includes(p.name)) return false;
    if (opts.categories?.length && !opts.categories.includes(categorizeParam(p))) return false;
    return true;
  });
}

export function mutateUniforms(
  params: ParamDef[],
  values: Record<string, ParamValue>,
  opts: UniformMutationOptions,
): { values: Record<string, ParamValue>; ops: MutationOp[] } {
  const rng = createRng(opts.seed);
  const next: Record<string, ParamValue> = {};
  for (const [k, v] of Object.entries(values)) next[k] = cloneValue(v);
  const ops: MutationOp[] = [];
  const eligible = new Set(eligibleParams(params, opts).map((p) => p.name));

  // Iterate over all params in declaration order so the RNG stream is stable
  // regardless of which subset is eligible.
  for (const def of params) {
    const roll = rng();
    const sub = createRng(rng.int(0, 2 ** 31));
    if (!eligible.has(def.name) || roll > opts.probability) continue;
    const before = next[def.name] ?? def.default;
    let after: ParamValue;
    if (def.type === 'bool') {
      after = sub.chance(Math.max(0.15, opts.strength)) ? !before : before;
    } else if (componentCount(def.type) === 1) {
      after = mutateScalar(def, before as number, sub, opts);
      const cat = categorizeParam(def);
      if (opts.allowReverse && cat === 'animation' && def.min < 0 && sub.chance(opts.strength * 0.3)) after = -after;
    } else {
      after = (before as number[]).map((c, i) => {
        // Keep alpha of colours stable.
        if (def.widget === 'color' && i === 3) return c;
        return mutateScalar(def, c, sub, opts);
      });
    }
    if (fmt(after) === fmt(before)) continue;
    next[def.name] = after;
    ops.push({
      level: 1,
      kind: opts.mode === 'randomize' ? 'randomize' : 'perturb',
      description: `${def.label}: ${fmt(before)} → ${fmt(after)}`,
      target: def.name,
      from: fmt(before),
      to: fmt(after),
    });
  }
  return { values: next, ops };
}

/** Randomise a single parameter (the per-control dice button). */
export function randomizeParam(def: ParamDef, seed: number): ParamValue {
  const rng = createRng(seed);
  const opts: UniformMutationOptions = { seed, strength: 1, probability: 1, locked: [], mode: 'randomize' };
  if (def.type === 'bool') return rng.chance(0.5);
  if (componentCount(def.type) === 1) return mutateScalar(def, rng.range(def.min, def.max), rng, opts);
  return Array.from({ length: componentCount(def.type) }, (_, i) => (def.widget === 'color' && i === 3 ? 1 : clampToDef(def, rng.range(def.min, def.max))));
}
