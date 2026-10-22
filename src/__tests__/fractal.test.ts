import { describe, expect, it } from 'vitest';
import { fixedToNumber, formatFixed, numberToFixed, ONE, parseFixed } from '../fractal/bigfixed';
import { referenceOrbit } from '../fractal/orbit';
import { autoIterations } from '../fractal/store';
import { FRACTAL_TOURS } from '../fractal/tours';

describe('256-bit fixed point', () => {
  it('parses and formats decimals exactly enough for deep zooms', () => {
    expect(parseFixed('1')).toBe(ONE);
    expect(parseFixed('-0.5')).toBe(-(ONE >> 1n));
    expect(parseFixed('2.5e-1')).toBe(ONE >> 2n);
    const s = '-0.743643887037158870778064543493642575047609962321255060213887';
    expect(formatFixed(parseFixed(s), 60)).toBe(s);
    expect(formatFixed(parseFixed('0'), 10)).toBe('0');
    expect(() => parseFixed('abc')).toThrow();
  });
  it('converts to and from float64 including tiny offsets', () => {
    expect(fixedToNumber(parseFixed('0.1'))).toBeCloseTo(0.1, 15);
    expect(fixedToNumber(numberToFixed(1.25e-29))).toBeCloseTo(1.25e-29, 40);
    // Sub-float64 differences survive in fixed point.
    const a = parseFixed('0.1000000000000000000000000000001');
    const b = parseFixed('0.1');
    expect(fixedToNumber(a - b)).toBeCloseTo(1e-31, 44);
  });
});

describe('reference orbit', () => {
  it('matches direct iteration at shallow zoom', () => {
    const r = referenceOrbit('-0.75', '0.1', 50);
    let x = 0;
    let y = 0;
    for (let n = 0; n <= r.length; n++) {
      expect(r.orbit[2 * n]).toBeCloseTo(x, 4);
      expect(r.orbit[2 * n + 1]).toBeCloseTo(y, 4);
      [x, y] = [x * x - y * y - 0.75, 2 * x * y + 0.1];
    }
  });
  it('stops when the orbit escapes', () => {
    const r = referenceOrbit('1', '1', 100);
    expect(r.escaped).toBe(true);
    expect(r.length).toBeLessThan(5);
  });
});

describe('curated zoom targets', () => {
  const norm = (o: Float32Array, i: number) => Math.hypot(o[2 * i], o[2 * i + 1]);
  it.each(FRACTAL_TOURS.filter((t) => t.kind === 'minibrot').map((t) => [t.id, t] as const))('%s is a nucleus of the stated period', (_id, t) => {
    const p = Number(/period (\d+)/.exec(t.detail)![1]);
    const r = referenceOrbit(t.re, t.im, p * 3);
    expect(r.escaped).toBe(false);
    expect(norm(r.orbit, p)).toBeLessThan(1e-6);
    expect(norm(r.orbit, 2 * p)).toBeLessThan(1e-5);
    for (let j = 1; j < p; j++) expect(norm(r.orbit, j)).toBeGreaterThan(1e-6);
  });
  it.each(FRACTAL_TOURS.filter((t) => t.kind !== 'minibrot').map((t) => [t.id, t] as const))('%s is a Misiurewicz point', (_id, t) => {
    const [k, p] = /M\((\d+),(\d+)\)/.exec(t.detail)!.slice(1).map(Number);
    // The cycle is repelling, so finite precision eventually escapes; check the first loops.
    const r = referenceOrbit(t.re, t.im, k + 3 * p);
    expect(r.escaped).toBe(false);
    const d = Math.hypot(r.orbit[2 * (k + p)] - r.orbit[2 * k], r.orbit[2 * (k + p) + 1] - r.orbit[2 * k + 1]);
    expect(d).toBeLessThan(1e-5);
  });
  it('carries enough digits for its depth', () => {
    for (const t of FRACTAL_TOURS) {
      const digits = (s: string) => (s.split('.')[1] ?? '').length;
      if (t.re !== '0' || t.im !== '1') expect(Math.min(digits(t.re), digits(t.im)), t.id).toBeGreaterThan(t.depth + 10);
    }
  });
});

describe('iteration budget', () => {
  it('grows with depth and respects quality caps', () => {
    expect(autoIterations(0, 'balanced', 1)).toBe(250);
    expect(autoIterations(10, 'balanced', 1)).toBeGreaterThan(autoIterations(5, 'balanced', 1));
    expect(autoIterations(30, 'draft', 1)).toBe(6000);
    expect(autoIterations(1, 'high', 1, 6000)).toBe(6000);
    expect(autoIterations(30, 'draft', 1, 9000)).toBe(9000);
  });
});
