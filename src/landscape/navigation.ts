/**
 * Map-style camera navigation for the Landscape studio when it is still:
 * drag pans over the ground, the wheel / pinch dollies along the view
 * direction, and right-drag (or Shift-drag) turns the camera. Pure functions
 * of the current values so they can be unit tested.
 */
import type { ParamValue } from '../types/shader';

type Values = Record<string, ParamValue>;

const ALT_MIN = 0.05;
const ALT_MAX = 4;
const PITCH_MIN = -0.9;
const PITCH_MAX = 0.5;
const TAU = Math.PI * 2;

const num = (v: ParamValue | undefined, d: number) => (typeof v === 'number' ? v : d);
const pan = (v: Values): [number, number] => (Array.isArray(v.uPan) ? [v.uPan[0], v.uPan[1]] : [0, 0]);
const round = (x: number) => Math.round(x * 1e4) / 1e4;

/** Drag the ground by (dx, dy) screen pixels in a view `viewH` pixels tall. */
export function panBy(v: Values, dx: number, dy: number, viewH: number): Values {
  const h = num(v.uHeading, 0);
  // World units per pixel grows with altitude, like a map.
  const k = ((num(v.uAltitude, 0.6) + 0.35) * 2.4) / Math.max(1, viewH);
  const [px, pz] = pan(v);
  // Screen-right in world XZ is (-cos h, sin h); forward is (sin h, cos h).
  const rx = -Math.cos(h), rz = Math.sin(h);
  const fx = Math.sin(h), fz = Math.cos(h);
  return { uPan: [round(px - rx * dx * k + fx * dy * k), round(pz - rz * dx * k + fz * dy * k)] };
}

/** Dolly along the view direction; `amount` > 0 moves in. */
export function zoomBy(v: Values, amount: number): Values {
  const h = num(v.uHeading, 0);
  const pitch = num(v.uPitch, -0.12);
  const alt = num(v.uAltitude, 0.6);
  const len = Math.hypot(1, pitch);
  const step = Math.max(-0.6, Math.min(0.6, amount)) * (alt + 0.4) * 1.5;
  const [px, pz] = pan(v);
  const nextAlt = Math.max(ALT_MIN, Math.min(ALT_MAX, alt + (pitch / len) * step));
  return {
    uPan: [round(px + (Math.sin(h) / len) * step), round(pz + (Math.cos(h) / len) * step)],
    uAltitude: round(nextAlt),
  };
}

/** Zoom by changing the lens (focal length); `amount` > 0 zooms in. */
export function lensZoomBy(v: Values, amount: number): Values {
  const f = num(v.uFov, 1.4) * Math.exp(Math.max(-0.6, Math.min(0.6, amount)));
  return { uFov: round(Math.max(0.6, Math.min(3, f))) };
}

/** Turn the camera by a drag of (dx, dy) pixels. */
export function lookBy(v: Values, dx: number, dy: number, viewW: number, viewH: number): Values {
  let h = num(v.uHeading, 0) + (dx / Math.max(1, viewW)) * 3;
  h = ((h % TAU) + TAU) % TAU;
  const p = Math.max(PITCH_MIN, Math.min(PITCH_MAX, num(v.uPitch, -0.12) - (dy / Math.max(1, viewH)) * 1.2));
  return { uHeading: round(h), uPitch: round(p) };
}

/**
 * Attach still-mode navigation to the viewport element. Listeners run in the
 * capture phase and stop propagation, so the canvas's own drag-to-look
 * (iMouse) only sees events while the view is animating.
 */
export function bindNavigation(
  el: HTMLElement,
  isActive: () => boolean,
  api: { values: () => Values; setLive: (v: Values) => void; checkpoint: () => void; flat?: () => boolean },
): () => void {
  const pts = new Map<number, { x: number; y: number }>();
  let mode: 'pan' | 'look' = 'pan';
  let lastWheel = 0;
  const size = () => el.getBoundingClientRect();
  const apply = (f: (v: Values) => Values) => api.setLive(f(api.values()));
  // Flat (2D) styles zoom with the lens; 3D styles dolly the camera.
  const zoom = (v: Values, amount: number) => (api.flat?.() ? lensZoomBy(v, amount) : zoomBy(v, amount));

  // Only gestures on the picture itself; the overlay's buttons and menus keep working.
  const onCanvas = (e: Event) => e.target instanceof HTMLCanvasElement;
  const down = (e: PointerEvent) => {
    if (!isActive() || !onCanvas(e)) return;
    e.stopPropagation();
    if (pts.size === 0) {
      api.checkpoint();
      mode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'look' : 'pan';
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    el.focus({ preventScroll: true });
  };
  const move = (e: PointerEvent) => {
    if (!isActive() || !pts.has(e.pointerId)) return;
    e.stopPropagation();
    const prev = pts.get(e.pointerId)!;
    const r = size();
    if (pts.size >= 2) {
      // Pinch: zoom by the change in finger spread, pan by the midpoint.
      const [a, b] = [...pts.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 0) apply((v) => zoom(v, Math.log(after / before) * 1.5));
      apply((v) => panBy(v, (e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2, r.height));
    } else if (mode === 'look') apply((v) => lookBy(v, e.clientX - prev.x, e.clientY - prev.y, r.width, r.height));
    else apply((v) => panBy(v, e.clientX - prev.x, e.clientY - prev.y, r.height));
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    e.stopPropagation();
    pts.delete(e.pointerId);
  };
  const wheel = (e: WheelEvent) => {
    if (!isActive() || !onCanvas(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastWheel > 700) api.checkpoint();
    lastWheel = now;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    apply((v) => zoom(v, (-e.deltaY * unit) / 600));
  };
  const key = (e: KeyboardEvent) => {
    if (!isActive() || e.target !== el) return;
    const r = size();
    const step = r.height * 0.08;
    const moves: Record<string, () => Values> = {
      ArrowLeft: () => panBy(api.values(), step, 0, r.height),
      ArrowRight: () => panBy(api.values(), -step, 0, r.height),
      ArrowUp: () => panBy(api.values(), 0, step, r.height),
      ArrowDown: () => panBy(api.values(), 0, -step, r.height),
      '+': () => zoom(api.values(), 0.25),
      '=': () => zoom(api.values(), 0.25),
      '-': () => zoom(api.values(), -0.25),
    };
    const f = moves[e.key];
    if (!f) return;
    e.preventDefault();
    api.checkpoint();
    api.setLive(f());
  };
  const menu = (e: Event) => {
    if (isActive() && onCanvas(e)) e.preventDefault();
  };
  el.addEventListener('pointerdown', down, true);
  el.addEventListener('pointermove', move, true);
  el.addEventListener('pointerup', up, true);
  el.addEventListener('pointercancel', up, true);
  el.addEventListener('wheel', wheel, { capture: true, passive: false });
  el.addEventListener('keydown', key);
  el.addEventListener('contextmenu', menu);
  return () => {
    el.removeEventListener('pointerdown', down, true);
    el.removeEventListener('pointermove', move, true);
    el.removeEventListener('pointerup', up, true);
    el.removeEventListener('pointercancel', up, true);
    el.removeEventListener('wheel', wheel, true);
    el.removeEventListener('keydown', key);
    el.removeEventListener('contextmenu', menu);
  };
}
