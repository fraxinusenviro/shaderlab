/**
 * Variant generation: composes the three mutation levels deterministically.
 * Pure (no WebGL); callers validate the resulting fragment source.
 */
import { deriveParams, mergeParams } from '../params/parse';
import type { MutationLevel, MutationOp, ParamDef, ParamValue, ShaderFormat } from '../types/shader';
import type { MutationCategory } from './categories';
import { mutateMath, type MathOpKind } from './math';
import { deriveSeed } from './rng';
import { mutateStructure, type StructOpKind } from './structural';
import { mutateUniforms } from './uniform';

export interface MutationSettings {
  seed: number;
  strength: number;
  probability: number;
  count: number;
  levels: { uniform: boolean; math: boolean; structural: boolean };
  uniformMode: 'perturb' | 'randomize';
  categories: MutationCategory[];
  scope: 'all' | 'selected';
  selected: string[];
  mathOps: MathOpKind[];
  structOps: StructOpKind[];
  allowReverse: boolean;
}

export const DEFAULT_MUTATION_SETTINGS: MutationSettings = {
  seed: 1,
  strength: 0.35,
  probability: 0.6,
  count: 9,
  levels: { uniform: true, math: false, structural: false },
  uniformMode: 'perturb',
  categories: [],
  scope: 'all',
  selected: [],
  mathOps: ['literals', 'frequency', 'time-scale'],
  structOps: ['symmetry', 'warp', 'rotate', 'color'],
  allowReverse: true,
};

export interface MutationBase {
  fragment: string;
  format: ShaderFormat;
  params: ParamDef[];
  values: Record<string, ParamValue>;
  locked: string[];
}

export interface VariantSpec {
  index: number;
  seed: number;
  strength: number;
  level: MutationLevel | 0;
  ops: MutationOp[];
  fragment: string;
  params: ParamDef[];
  values: Record<string, ParamValue>;
  sourceChanged: boolean;
  notes: string[];
}

export function generateVariant(base: MutationBase, settings: MutationSettings, index: number): VariantSpec {
  const seed = deriveSeed(settings.seed, index);
  const ops: MutationOp[] = [];
  const notes: string[] = [];
  let fragment = base.fragment;
  let level: MutationLevel | 0 = 0;

  if (settings.levels.structural && settings.structOps.length) {
    const r = mutateStructure(fragment, { seed: deriveSeed(seed, 'L3'), strength: settings.strength, probability: settings.probability, ops: settings.structOps, format: base.format });
    fragment = r.source;
    ops.push(...r.ops);
    notes.push(...r.skipped);
    if (r.ops.length) level = 3;
  }
  if (settings.levels.math && settings.mathOps.length) {
    const r = mutateMath(fragment, { seed: deriveSeed(seed, 'L2'), strength: settings.strength, probability: settings.probability, ops: settings.mathOps });
    fragment = r.source;
    ops.push(...r.ops);
    if (r.ops.length && level < 2) level = 2;
  }

  let params = base.params;
  let values = base.values;
  const sourceChanged = fragment !== base.fragment;
  if (sourceChanged) {
    const merged = mergeParams(deriveParams(fragment, base.format), base.params, base.values);
    params = merged.params;
    values = merged.values;
  }
  if (settings.levels.uniform) {
    const r = mutateUniforms(params, values, {
      seed: deriveSeed(seed, 'L1'),
      strength: settings.strength,
      probability: settings.probability,
      locked: base.locked,
      categories: settings.categories,
      only: settings.scope === 'selected' ? settings.selected : undefined,
      mode: settings.uniformMode,
      allowReverse: settings.allowReverse,
    });
    values = r.values;
    ops.push(...r.ops);
    if (r.ops.length && level < 1) level = 1;
  }
  return { index, seed, strength: settings.strength, level, ops, fragment, params, values, sourceChanged, notes };
}

export function generateVariants(base: MutationBase, settings: MutationSettings): VariantSpec[] {
  return Array.from({ length: settings.count }, (_, i) => generateVariant(base, settings, i));
}
