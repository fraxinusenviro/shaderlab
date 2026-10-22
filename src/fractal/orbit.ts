/**
 * Reference orbit for perturbation rendering: Z_{n+1} = Z_n^2 + C computed in
 * 256-bit fixed point, stored as float32 pairs (perturbation only needs the
 * reference rounded to float; the high precision is needed to *compute* it).
 */
import { FRAC, parseFixed, type Fixed } from './bigfixed';

export interface ReferenceOrbit {
  /** Interleaved [x0, y0, x1, y1, ...] for Z_0 .. Z_length. */
  orbit: Float32Array;
  /** Number of iterations available (index of the last stored Z). */
  length: number;
  escaped: boolean;
}

const TWO_POW = 2 ** 256;
const ESCAPE2 = 4n << (2n * FRAC); // |Z|^2 > 4 in 2*FRAC scale

export function referenceOrbitFixed(cr: Fixed, ci: Fixed, maxIter: number): ReferenceOrbit {
  const out = new Float32Array(2 * (maxIter + 2));
  let zr = 0n;
  let zi = 0n;
  let n = 0;
  let escaped = false;
  for (; n <= maxIter; n++) {
    out[2 * n] = Number(zr) / TWO_POW;
    out[2 * n + 1] = Number(zi) / TWO_POW;
    const zr2 = zr * zr;
    const zi2 = zi * zi;
    if (zr2 + zi2 > ESCAPE2) {
      escaped = true;
      break;
    }
    const zri = (zr * zi) >> (FRAC - 1n); // 2*zr*zi
    zr = ((zr2 - zi2) >> FRAC) + cr;
    zi = zri + ci;
  }
  const length = Math.min(n, maxIter);
  return { orbit: out.subarray(0, 2 * (length + 1)), length, escaped };
}

export function referenceOrbit(re: string, im: string, maxIter: number): ReferenceOrbit {
  return referenceOrbitFixed(parseFixed(re), parseFixed(im), maxIter);
}
