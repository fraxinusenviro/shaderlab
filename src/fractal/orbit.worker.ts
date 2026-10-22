/// <reference lib="webworker" />
import { referenceOrbitFixed } from './orbit';

self.onmessage = (e: MessageEvent<{ id: number; re: string; im: string; maxIter: number }>) => {
  const { id, re, im, maxIter } = e.data;
  const r = referenceOrbitFixed(BigInt(re), BigInt(im), maxIter);
  const copy = new Float32Array(r.orbit);
  (self as unknown as Worker).postMessage({ id, orbit: copy, length: r.length, escaped: r.escaped }, [copy.buffer]);
};
