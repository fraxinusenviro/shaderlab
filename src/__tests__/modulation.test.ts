import { describe, expect, it } from 'vitest';
import { compileExpression, validateExpression } from '../modulation/expr';
import { applyModulations, oscillator, sampleKeyframes } from '../modulation/modulate';
import { parseParams } from '../params/parse';

describe('expression evaluator (no eval)', () => {
  it('evaluates arithmetic, functions and variables', () => {
    const f = compileExpression('base + 0.5 * sin(t * pi) * (max - min)');
    expect(f({ t: 0.5, base: 1, min: 0, max: 2 })).toBeCloseTo(2);
    expect(compileExpression('2 ^ 3 + -1')({ t: 0, base: 0, min: 0, max: 1 })).toBe(7);
    expect(compileExpression('clamp(t, 0, 1)')({ t: 5, base: 0, min: 0, max: 1 })).toBe(1);
  });
  it('rejects anything outside the whitelist', () => {
    expect(validateExpression('alert(1)')).toMatch(/Unknown function/);
    expect(validateExpression('constructor')).toMatch(/Unknown variable/);
    expect(validateExpression('window.location')).not.toBeNull();
    expect(validateExpression('t; 1')).not.toBeNull();
    expect(validateExpression('sin(t')).not.toBeNull();
  });
});

describe('oscillators and keyframes', () => {
  it('stay bipolar', () => {
    for (const k of ['sine', 'triangle', 'saw', 'square', 'random', 'noise'] as const) {
      for (let x = 0; x < 3; x += 0.07) {
        const v = oscillator(k, x, 1);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(oscillator('triangle', 0)).toBeCloseTo(0);
    expect(oscillator('triangle', 0.25)).toBeCloseTo(1);
  });
  it('interpolates and loops keyframes', () => {
    const k = [
      { t: 0, v: 0, ease: 'linear' as const },
      { t: 2, v: 10, ease: 'linear' as const },
    ];
    expect(sampleKeyframes(k, 1, 4)).toBeCloseTo(5);
    expect(sampleKeyframes(k, 5, 4)).toBeCloseTo(5);
    expect(sampleKeyframes(k, 3, 4)).toBe(10);
  });
});

describe('applyModulations', () => {
  const params = parseParams('uniform float a; // @param min=0 max=10 default=5\nuniform float b; // @param min=0 max=1 default=0');
  const values = { a: 5, b: 0 };
  it('is a no-op without active modulation', () => {
    expect(applyModulations(params, values, {}, 1)).toBe(values);
  });
  it('modulates within range and links parameters', () => {
    const mods = { a: { kind: 'sine' as const, enabled: true, rate: 1, depth: 1, phase: 0 }, b: { kind: 'link' as const, enabled: true, rate: 0, depth: 1, phase: 0, source: 'a' } };
    const out = applyModulations(params, values, mods, 0.25);
    expect(out.a).toBeCloseTo(10);
    expect(out.b).toBeCloseTo(1);
    expect(values.a).toBe(5);
  });
});
