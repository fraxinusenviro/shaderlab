/**
 * Owns the high-precision view (centre in 256-bit fixed point + log zoom),
 * pointer/wheel/pinch interaction, autoplay zoom, the render loop, and
 * scheduling of reference-orbit computation in a Web Worker.
 */
import { fixedToNumber, formatFixed, numberToFixed, parseFixed, type Fixed } from './bigfixed';
import { referenceOrbitFixed } from './orbit';
import { FractalRenderer, PALETTES, type FractalStyle, type FractalView } from './renderer';
import { autoIterations, MAX_DEEP_ZOOM, MAX_SHALLOW_ZOOM, QUALITY, type FractalSettings } from './store';

export interface FractalReadout {
  zoom: number;
  maxIter: number;
  re: string;
  im: string;
  reference: 'computing' | 'ready' | 'shallow';
  fps: number;
  playing: boolean;
  width: number;
  height: number;
}

const BASE_HALF_HEIGHT = 1.5;

export class FractalController {
  readonly renderer: FractalRenderer;
  readonly canvas: HTMLCanvasElement;
  settings: FractalSettings;
  re: Fixed;
  im: Fixed;
  zoom: number;
  rotation: number;
  playing = false;
  minIter = 0;
  /** Depth at which `minIter` must be fully applied (tour destination). */
  minIterDepth = 0;
  onReadout: ((r: FractalReadout) => void) | null = null;
  onViewChange: ((v: { re: string; im: string; zoom: number; rotation: number }) => void) | null = null;
  onAutoplayEnd: (() => void) | null = null;

  private refRe: Fixed = 0n;
  private refIm: Fixed = 0n;
  private refLen = 0;
  private refEscaped = false;
  private pendingId = 0;
  private computing = false;
  private worker: Worker | null = null;
  private raf = 0;
  private last = 0;
  private dirty = true;
  private lastInteraction = 0;
  private stillDrawn = false;
  private time = 0;
  private fps = 0;
  private lastReadout = 0;
  private lastViewEmit = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private disposed = false;

  constructor(holder: HTMLElement, settings: FractalSettings, preferWebGL2 = true) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'block h-full w-full touch-none cursor-grab';
    this.canvas.dataset.testid = 'fractal-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Mandelbrot set');
    holder.appendChild(this.canvas);
    this.renderer = new FractalRenderer(this.canvas, preferWebGL2);
    this.settings = settings;
    this.re = parseFixed(settings.re);
    this.im = parseFixed(settings.im);
    this.zoom = settings.zoom;
    this.rotation = settings.rotation;
    try {
      this.worker = new Worker(new URL('./orbit.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.receiveOrbit(e.data);
    } catch {
      this.worker = null;
    }
    this.bindInput();
    this.requestReference(true);
    this.raf = requestAnimationFrame(this.loop);
  }

  get maxZoom(): number {
    return this.renderer.deep ? MAX_DEEP_ZOOM : MAX_SHALLOW_ZOOM;
  }

  get maxIter(): number {
    // A tour's minimum only ramps in over the last few decades before its
    // destination; at shallow zoom it would just waste time on interior pixels.
    const ramp = this.minIterDepth > 0 ? Math.min(1, Math.max(0, (this.zoom - (this.minIterDepth - 4)) / 4)) : 1;
    return autoIterations(this.zoom, this.settings.quality, this.settings.iterBoost, this.minIter * ramp);
  }

  private halfHeight(): number {
    return BASE_HALF_HEIGHT * 10 ** -this.zoom;
  }

  // ------------------------------------------------------------ view API

  setSettings(s: FractalSettings): void {
    this.settings = s;
    this.invalidate(false);
  }

  setView(re: string, im: string, zoom: number, rotation = this.rotation): void {
    this.re = parseFixed(re);
    this.im = parseFixed(im);
    this.zoom = Math.max(0, Math.min(this.maxZoom, zoom));
    this.rotation = rotation;
    this.requestReference(true);
    this.invalidate(true);
  }

  centerStrings(): { re: string; im: string } {
    const digits = Math.min(75, Math.max(8, Math.ceil(this.zoom) + 12));
    return { re: formatFixed(this.re, digits), im: formatFixed(this.im, digits) };
  }

  /** Move the centre by a screen-space offset in CSS pixels. */
  panBy(dxCss: number, dyCss: number): void {
    const per = this.complexPerCssPixel();
    const [cx, cy] = this.rotate(-dxCss * per, dyCss * per);
    this.re += numberToFixed(cx);
    this.im += numberToFixed(cy);
    this.afterMove();
  }

  /** Zoom by `factor` (>1 = in) keeping the point under (xCss, yCss) fixed. */
  zoomAt(xCss: number, yCss: number, factor: number): void {
    const target = Math.max(0, Math.min(this.maxZoom, this.zoom + Math.log10(factor)));
    const actual = 10 ** (target - this.zoom);
    const r = this.canvas.getBoundingClientRect();
    const per = this.complexPerCssPixel();
    const [ox, oy] = this.rotate((xCss - r.width / 2) * per, -(yCss - r.height / 2) * per);
    const k = 1 - 1 / actual;
    this.re += numberToFixed(ox * k);
    this.im += numberToFixed(oy * k);
    this.zoom = target;
    this.afterMove();
  }

  zoomBy(factor: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(r.width / 2, r.height / 2, factor);
  }

  play(): void {
    this.playing = true;
    this.last = 0;
    this.invalidate(false);
  }

  pause(): void {
    this.playing = false;
    this.invalidate(true);
  }

  private complexPerCssPixel(): number {
    const r = this.canvas.getBoundingClientRect();
    return (2 * this.halfHeight()) / Math.max(1, r.height);
  }

  private rotate(x: number, y: number): [number, number] {
    const c = Math.cos(this.rotation);
    const s = Math.sin(this.rotation);
    return [x * c - y * s, x * s + y * c];
  }

  private afterMove(): void {
    this.lastInteraction = performance.now();
    const off = Math.hypot(fixedToNumber(this.re - this.refRe), fixedToNumber(this.im - this.refIm));
    if (off > 2 * this.halfHeight()) this.requestReference(false);
    this.invalidate(true);
  }

  private invalidate(interactive: boolean): void {
    this.dirty = true;
    this.stillDrawn = false;
    if (interactive) this.lastInteraction = performance.now();
  }

  // ------------------------------------------------------------ reference orbit

  private requestReference(force: boolean): void {
    if (!this.renderer.deep) {
      this.refRe = this.re;
      this.refIm = this.im;
      return;
    }
    const want = Math.ceil((this.maxIter + 64) / 1024) * 1024;
    const sameCentre = this.refRe === this.re && this.refIm === this.im;
    if (!force && sameCentre && (this.refLen >= this.maxIter || this.refEscaped)) return;
    const id = ++this.pendingId;
    const re = this.re;
    const im = this.im;
    this.computing = true;
    if (this.worker) {
      this.worker.postMessage({ id, re: re.toString(), im: im.toString(), maxIter: want });
      this.pendingCentre = { re, im };
    } else {
      const r = referenceOrbitFixed(re, im, want);
      this.pendingCentre = { re, im };
      this.receiveOrbit({ id, orbit: r.orbit, length: r.length, escaped: r.escaped });
    }
  }

  private pendingCentre: { re: Fixed; im: Fixed } = { re: 0n, im: 0n };

  private receiveOrbit(d: { id: number; orbit: Float32Array; length: number; escaped: boolean }): void {
    if (this.disposed || d.id !== this.pendingId) return;
    this.renderer.setOrbit(d.orbit, d.length);
    this.refRe = this.pendingCentre.re;
    this.refIm = this.pendingCentre.im;
    this.refLen = d.length;
    this.refEscaped = d.escaped;
    this.computing = false;
    this.invalidate(false);
  }

  // ------------------------------------------------------------ rendering

  private style(): FractalStyle {
    const s = this.settings;
    return {
      palette: PALETTES.find((p) => p.id === s.palette) ?? PALETTES[0],
      density: s.density,
      phase: s.phase,
      map: s.map,
      interior: s.interior,
      time: this.time,
    };
  }

  view(bufferHeight: number): FractalView {
    return {
      offset: [fixedToNumber(this.re - this.refRe), fixedToNumber(this.im - this.refIm)],
      pixel: (2 * this.halfHeight()) / Math.max(1, bufferHeight),
      rotation: this.rotation,
      maxIter: this.maxIter,
      center: [fixedToNumber(this.re), fixedToNumber(this.im)],
    };
  }

  private resize(scale: number): void {
    const dpr = window.devicePixelRatio || 1;
    let w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * scale));
    let h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * scale));
    const maxPx = 4.2e6;
    if (w * h > maxPx) {
      const k = Math.sqrt(maxPx / (w * h));
      w = Math.floor(w * k);
      h = Math.floor(h * k);
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const s = this.settings;
    let animating = false;
    if (this.playing) {
      animating = true;
      const top = Math.min(this.maxZoom, s.targetDepth);
      this.zoom += s.direction * s.speed * dt;
      this.rotation += s.spin * dt;
      if (this.zoom >= top) {
        this.zoom = top;
        if (s.loop === 'bounce') this.settings = { ...s, direction: -1 };
        else if (s.loop === 'restart') this.zoom = 0;
        else {
          this.playing = false;
          this.onAutoplayEnd?.();
        }
      } else if (this.zoom <= 0 && s.direction < 0) {
        this.zoom = 0;
        if (s.loop === 'stop') {
          this.playing = false;
          this.onAutoplayEnd?.();
        } else this.settings = { ...s, direction: 1 };
      }
      if (this.refLen < this.maxIter && !this.refEscaped && !this.computing) this.requestReference(false);
    }
    if (s.cycle) {
      this.time += s.cycle * dt;
      animating = true;
    }
    const q = QUALITY[s.quality];
    const moving = animating || now - this.lastInteraction < 350;
    if (!moving && this.stillDrawn && !this.dirty) return this.emit(now);
    if (!moving) {
      // Idle: settle the reference on the exact centre, then render sharp.
      if ((this.refRe !== this.re || this.refIm !== this.im || this.refLen < this.maxIter) && !this.computing && this.renderer.deep) this.requestReference(false);
    }
    if (this.renderer.deep && !this.renderer.hasOrbit) return;
    this.resize(moving ? q.moving : q.still);
    const t0 = performance.now();
    this.renderer.draw(this.view(this.canvas.height), this.style());
    const cost = performance.now() - t0;
    this.fps = dt ? this.fps * 0.85 + (1 / dt) * 0.15 : this.fps;
    void cost;
    this.dirty = false;
    if (!moving) this.stillDrawn = true;
    this.emit(now);
  };

  private emit(now: number): void {
    if (now - this.lastReadout > 200 && this.onReadout) {
      this.lastReadout = now;
      const { re, im } = this.centerStrings();
      this.onReadout({
        zoom: this.zoom,
        maxIter: this.maxIter,
        re,
        im,
        reference: !this.renderer.deep ? 'shallow' : this.computing ? 'computing' : 'ready',
        fps: this.playing ? this.fps : 0,
        playing: this.playing,
        width: this.canvas.width,
        height: this.canvas.height,
      });
    }
    if (now - this.lastViewEmit > 600 && this.onViewChange) {
      this.lastViewEmit = now;
      this.onViewChange({ ...this.centerStrings(), zoom: this.zoom, rotation: this.rotation });
    }
  }

  snapshot(w: number, h: number): ImageData {
    return this.renderer.renderToPixels(this.view(h), this.style(), w, h);
  }

  // ------------------------------------------------------------ input

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDbl);
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.canvas.style.cursor = 'grabbing';
  };

  private onMove = (e: PointerEvent) => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (this.pointers.size === 1) {
      this.panBy(cur.x - prev.x, cur.y - prev.y);
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.entries()];
      const other = a[0] === e.pointerId ? b[1] : a[1];
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const r = this.canvas.getBoundingClientRect();
      if (d0 > 0 && d1 > 0) this.zoomAt((cur.x + other.x) / 2 - r.left, (cur.y + other.y) / 2 - r.top, d1 / d0);
    }
    this.pointers.set(e.pointerId, cur);
  };

  private onUp = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) this.canvas.style.cursor = 'grab';
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
  };

  private onDbl = (e: MouseEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.shiftKey ? 0.25 : 4);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.worker?.terminate();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
