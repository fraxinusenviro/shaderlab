import { describe, expect, it } from 'vitest';
import { mutateMath } from '../mutations/math';
import { createRng, deriveSeed } from '../mutations/rng';
import { mutateStructure } from '../mutations/structural';
import { mutateUniforms } from '../mutations/uniform';
import { DEFAULT_MUTATION_SETTINGS, generateVariants, type MutationSettings } from '../mutations/variants';
import { mergeParams, parseParams } from '../params/parse';
import { findFunctions, tokenize } from '../glsl/tokenizer';

const SRC = `uniform float uFreq; // @param min=0 max=20 default=5
uniform float uSpeed; // @param min=-2 max=2 default=1
uniform vec3 uColor; // @param widget=color default=0.2,0.4,0.8
uniform float uAmp; // @param min=0 max=1 default=0.5
float f(float x) { return sin(x * 3.0) * 0.5 + floor(x * 0.25); }
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float v = 0.0;
  for (int i = 0; i < 8; i++) { v += f(uv.x * uFreq + float(i) * 1.5 + iTime * uSpeed); }
  fragColor = vec4(uColor * v * uAmp, 1.0);
}
`;
const params = parseParams(SRC);
const { values } = mergeParams(params, [], {});

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(createRng(43)()).not.toBe(createRng(42)());
    expect(deriveSeed(1, 0)).toBe(deriveSeed(1, 0));
  });
});

describe('level 1 — uniform mutation', () => {
  const opts = { seed: 7, strength: 0.5, probability: 1, locked: [] as string[], mode: 'perturb' as const };
  it('is reproducible and stays in range', () => {
    const a = mutateUniforms(params, values, opts);
    const b = mutateUniforms(params, values, opts);
    expect(a).toEqual(b);
    for (const d of params) {
      const v = a.values[d.name];
      for (const x of Array.isArray(v) ? v : [v as number]) {
        expect(x).toBeGreaterThanOrEqual(d.min);
        expect(x).toBeLessThanOrEqual(d.max);
      }
    }
    expect(a.ops.length).toBeGreaterThan(0);
    expect(values.uFreq).toBe(5); // input not mutated
  });
  it('respects locks, categories and scope', () => {
    const locked = mutateUniforms(params, values, { ...opts, locked: ['uFreq', 'uColor'] });
    expect(locked.values.uFreq).toBe(5);
    expect(locked.values.uColor).toEqual([0.2, 0.4, 0.8]);
    const colourOnly = mutateUniforms(params, values, { ...opts, categories: ['color'] });
    expect(colourOnly.ops.every((o) => o.target === 'uColor')).toBe(true);
    const only = mutateUniforms(params, values, { ...opts, only: ['uAmp'] });
    expect(only.ops.every((o) => o.target === 'uAmp')).toBe(true);
  });
  it('probability 0 changes nothing', () => {
    expect(mutateUniforms(params, values, { ...opts, probability: 0 }).ops).toHaveLength(0);
  });
});

describe('level 2 — math mutation', () => {
  it('is reproducible and leaves loop headers and declarations alone', () => {
    const o = { seed: 11, strength: 0.6, probability: 1, ops: ['literals', 'frequency', 'time-scale', 'trig-swap', 'fn-swap'] as const };
    const a = mutateMath(SRC, { ...o, ops: [...o.ops] });
    const b = mutateMath(SRC, { ...o, ops: [...o.ops] });
    expect(a).toEqual(b);
    expect(a.source).not.toBe(SRC);
    expect(a.source).toContain('for (int i = 0; i < 8; i++)');
    expect(a.source.split('\n').slice(0, 4).join('\n')).toBe(SRC.split('\n').slice(0, 4).join('\n'));
    expect(a.ops.length).toBeGreaterThan(0);
    // Function structure remains intact.
    expect(findFunctions(tokenize(a.source)).map((f) => f.name)).toEqual(['f', 'mainImage']);
  });
  it('time scaling rewrites every use of iTime consistently', () => {
    const r = mutateMath(SRC, { seed: 3, strength: 1, probability: 1, ops: ['time-scale'] });
    const op = r.ops.find((x) => x.kind.startsWith('time'));
    if (op) expect(r.source).toContain(`(iTime*${op.to})`);
  });
});

describe('level 3 — structural mutation', () => {
  it('injects a coordinate transform and colour wrapper deterministically', () => {
    const o = { seed: 5, strength: 0.7, probability: 1, ops: ['symmetry', 'rotate', 'color'] as ('symmetry' | 'rotate' | 'color')[], format: 'shadertoy' as const };
    const a = mutateStructure(SRC, o);
    expect(mutateStructure(SRC, o)).toEqual(a);
    expect(a.source).toContain('vec2 sf_xform(vec2 p)');
    expect(a.source).toContain('fragCoord = sf_xform(fragCoord);');
    expect(a.source).toContain('sf_mainImage0(fragColor, fragCoord);');
    const fns = findFunctions(tokenize(a.source)).map((f) => f.name);
    expect(fns).toEqual(expect.arrayContaining(['sf_xform', 'sf_mainImage0', 'mainImage']));
  });
  it('handles standard main() shaders via sf_FragCoord', () => {
    const std = 'precision highp float;\nuniform vec2 u_resolution;\nvoid main(){ vec2 uv = gl_FragCoord.xy / u_resolution; gl_FragColor = vec4(uv, 0.0, 1.0); }';
    const r = mutateStructure(std, { seed: 2, strength: 0.5, probability: 1, ops: ['warp'], format: 'standard' });
    expect(r.source).toContain('sf_FragCoord = vec4(sf_xform(gl_FragCoord.xy), gl_FragCoord.zw);');
    expect(r.source).toContain('vec2 uv = sf_FragCoord.xy / u_resolution');
  });
});

describe('variant generation', () => {
  const settings: MutationSettings = { ...DEFAULT_MUTATION_SETTINGS, seed: 1234, count: 4, levels: { uniform: true, math: true, structural: true } };
  const base = { fragment: SRC, format: 'shadertoy' as const, params, values, locked: [] };
  it('reproduces identical variants from a fixed seed', () => {
    expect(generateVariants(base, settings)).toEqual(generateVariants(base, settings));
  });
  it('different seeds give different variants', () => {
    const a = generateVariants(base, settings).map((v) => v.fragment + JSON.stringify(v.values));
    const b = generateVariants(base, { ...settings, seed: 999 }).map((v) => v.fragment + JSON.stringify(v.values));
    expect(a).not.toEqual(b);
  });
  it('never mutates the source object', () => {
    const before = JSON.stringify(base);
    generateVariants(base, settings);
    expect(JSON.stringify(base)).toBe(before);
  });
});
