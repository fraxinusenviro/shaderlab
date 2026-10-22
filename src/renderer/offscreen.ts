/**
 * Shared offscreen renderer used for compile validation, library and
 * variant thumbnails. A single GL context renders jobs one at a time on a
 * scheduled queue, so generating a 4×4 variant grid never creates sixteen
 * concurrent render loops.
 */
import type { ChannelBinding, ParamValue } from '../types/shader';
import { ShaderRenderer, type CompileOutcome, type ShaderInput } from './engine';
import { resolveChannel } from './channels';

let shared: ShaderRenderer | null = null;
let sharedFailed = false;

function getShared(): ShaderRenderer | null {
  if (shared && !shared.isContextLost) return shared;
  if (sharedFailed) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    shared = new ShaderRenderer(canvas, { observeResize: false, preferWebGL2: preferredGL2 });
    shared.setFixedSize(64, 64);
  } catch {
    sharedFailed = true;
    shared = null;
  }
  return shared;
}

let preferredGL2 = true;
export function setOffscreenPreference(preferWebGL2: boolean): void {
  if (preferWebGL2 !== preferredGL2) {
    preferredGL2 = preferWebGL2;
    shared?.dispose();
    shared = null;
  }
}

/** Compile without displaying. Safe to call synchronously. */
export function validateShader(input: ShaderInput): CompileOutcome {
  const r = getShared();
  if (!r) {
    return { ok: false, diagnostics: [{ severity: 'error', line: null, message: 'WebGL unavailable for validation.', origin: 'runtime' }], format: 'standard', glsl: null, compileMs: 0, keptPrevious: false };
  }
  return r.setShader(input);
}

export interface ThumbJob {
  input: ShaderInput;
  values: Record<string, ParamValue>;
  channels?: ChannelBinding[];
  time?: number;
  width?: number;
  height?: number;
  /** Lower numbers run first. */
  priority?: number;
}

export interface ThumbResult {
  ok: boolean;
  dataUrl?: string;
  compile: CompileOutcome;
}

interface Pending {
  job: ThumbJob;
  resolve: (r: ThumbResult) => void;
  cancelled: boolean;
}

const queue: Pending[] = [];
let pumping = false;

const idle = (): Promise<void> =>
  new Promise((res) => {
    const w = globalThis as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(() => res(), { timeout: 120 });
    else setTimeout(res, 16);
  });

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      queue.sort((a, b) => (a.job.priority ?? 5) - (b.job.priority ?? 5));
      const next = queue.shift()!;
      if (next.cancelled) continue;
      next.resolve(await runJob(next.job));
      await idle();
    }
  } finally {
    pumping = false;
  }
}

const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;

async function runJob(job: ThumbJob): Promise<ThumbResult> {
  const r = getShared();
  if (!r) {
    return { ok: false, compile: { ok: false, diagnostics: [{ severity: 'error', line: null, message: 'WebGL unavailable.', origin: 'runtime' }], format: 'standard', glsl: null, compileMs: 0, keptPrevious: false } };
  }
  const w = job.width ?? 192;
  const h = job.height ?? 108;
  for (let i = 0; i < 4; i++) {
    const b = job.channels?.[i];
    r.setChannel(i, b?.assetId ? await resolveChannel(b.assetId) : null, b ?? undefined);
  }
  const compile = r.setShader(job.input);
  if (!compile.ok) return { ok: false, compile };
  r.setFixedSize(w, h);
  r.valueSource = () => job.values;
  r.mouse = [w / 2, h / 2, 0, 0];
  r.pointer = [w / 2, h / 2];
  const img = r.renderToPixels(w, h, job.time ?? 2);
  if (!scratch) return { ok: true, compile };
  scratch.width = w;
  scratch.height = h;
  scratch.getContext('2d')!.putImageData(img, 0, 0);
  return { ok: true, compile, dataUrl: scratch.toDataURL('image/webp', 0.8) };
}

/** Queue a thumbnail render. Returns a promise and a cancel function. */
export function requestThumbnail(job: ThumbJob): { promise: Promise<ThumbResult>; cancel: () => void } {
  let entry!: Pending;
  const promise = new Promise<ThumbResult>((resolve) => {
    entry = { job, resolve, cancelled: false };
    queue.push(entry);
  });
  void pump();
  return {
    promise,
    cancel: () => {
      entry.cancelled = true;
    },
  };
}
