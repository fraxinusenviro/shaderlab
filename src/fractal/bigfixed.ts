/**
 * Signed fixed-point numbers in BigInt with 256 fractional bits (~77 decimal
 * digits) — enough to locate a view far deeper than float32 perturbation can
 * render. Used for the zoom centre and the reference orbit.
 */
export const FRAC = 256n;
export const ONE = 1n << FRAC;
const TWO_POW = 2 ** 256;

export type Fixed = bigint;

/** Parse a decimal string ("-0.7436", "1e-5", "12") exactly (rounded to 2^-256). */
export function parseFixed(s: string): Fixed {
  const m = /^\s*([+-])?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/.exec(s);
  if (!m || (!m[2] && !m[3])) throw new Error(`Not a number: "${s}"`);
  const neg = m[1] === '-';
  let digits = (m[2] || '0') + (m[3] || '');
  let scale = (m[3] || '').length - (m[4] ? Number(m[4]) : 0);
  if (scale < 0) {
    digits += '0'.repeat(-scale);
    scale = 0;
  }
  const num = BigInt(digits) << FRAC;
  const den = 10n ** BigInt(scale);
  const v = (num + den / 2n) / den;
  return neg ? -v : v;
}

/** Format with a fixed number of fractional decimal digits (trailing zeros trimmed). */
export function formatFixed(v: Fixed, digits: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const scale = 10n ** BigInt(digits);
  let rounded = (a * scale + (ONE >> 1n)) >> FRAC;
  const intPart = rounded / scale;
  rounded -= intPart * scale;
  let frac = rounded.toString().padStart(digits, '0').replace(/0+$/, '');
  if (frac) frac = '.' + frac;
  const out = intPart.toString() + frac;
  return neg && out !== '0' ? '-' + out : out;
}

export function fixedToNumber(v: Fixed): number {
  return Number(v) / TWO_POW;
}

export function numberToFixed(x: number): Fixed {
  if (!Number.isFinite(x)) throw new Error('Non-finite value');
  return BigInt(Math.round(x * TWO_POW));
}

export const mulFixed = (a: Fixed, b: Fixed): Fixed => (a * b) >> FRAC;
