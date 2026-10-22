/** Deterministic random numbers: the same seed always yields the same variant. */
export interface Rng {
  (): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  gauss(): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
}

export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (min, max) => min + (max - min) * next();
  next.int = (min, max) => Math.floor(min + (max - min + 1) * next());
  next.gauss = () => {
    const u = Math.max(1e-9, next());
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  next.chance = (p) => next() < p;
  return next;
}

/** Derive a stable child seed (e.g. variant i of a batch). */
export function deriveSeed(seed: number, salt: number | string): number {
  return hashSeed(`${seed}:${salt}`);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
