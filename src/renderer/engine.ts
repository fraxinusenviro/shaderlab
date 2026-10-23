/**
 * ShaderRenderer — framework-independent WebGL engine.
 *
 * Owns one GL context, compiles adapted shaders (keeping the last good
 * program when a new one fails), drives built-in uniforms, binds channel
 * textures, enforces resolution and frame-rate limits and recovers from
 * context loss. React never re-renders per frame: values are pulled through
 * a callback each frame.
 */
import { adaptShader, parseShaderLog, type Diagnostic, type GLVersion } from '../glsl/adapter';
import { componentCount } from '../params/parse';
import type { ParamDef, ParamValue, ResolvedFormat, ShaderFormat } from '../types/shader';
import { Clock } from './clock';

type GL = WebGLRenderingContext | WebGL2RenderingContext;

export interface CompileOutcome {
  ok: boolean;
  diagnostics: Diagnostic[];
  format: ResolvedFormat;
  glsl: '100' | '300' | null;
  compileMs: number;
  /** True when the renderer is still showing a previous successful program. */
  keptPrevious: boolean;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  frame: number;
  time: number;
  width: number;
  height: number;
  glVersion: GLVersion;
  playing: boolean;
}

export interface RendererSettings {
  /** Multiplier on devicePixelRatio. */
  pixelRatio: number;
  /** Hard cap on drawing-buffer pixels (width*height). */
  maxPixels: number;
  /** 0 = uncapped. */
  fpsCap: number;
  /**
   * Adaptive resolution: while animating or interacting, lower the drawing
   * buffer resolution to hold ~30 fps, then draw one full-resolution frame
   * once the view has been still for a moment.
   */
  adaptive?: boolean;
}

/** Lowest adaptive scale (fraction of the configured resolution, per axis). */
const MIN_ADAPTIVE_SCALE = 0.35;
/** Frame interval the adaptive scale aims for (ms). */
const ADAPTIVE_TARGET_MS = 34;
/** Redraws closer together than this count as continuous motion (ms). */
const MOTION_GAP_MS = 1500;
/** Stillness before the full-resolution frame (ms). */
const SHARPEN_DELAY_MS = 220;

export interface ShaderInput {
  fragment: string;
  format: ShaderFormat;
  vertex?: string;
  params: ParamDef[];
}

interface UniformInfo {
  loc: WebGLUniformLocation;
  type: number;
  size: number;
}

interface CompiledProgram {
  program: WebGLProgram;
  uniforms: Map<string, UniformInfo>;
  params: ParamDef[];
  format: ResolvedFormat;
}

interface ChannelState {
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface ChannelOptions {
  filter: 'linear' | 'nearest';
  wrap: 'repeat' | 'clamp' | 'mirror';
}

const isPow2 = (n: number) => (n & (n - 1)) === 0;

export function createContext(canvas: HTMLCanvasElement, preferWebGL2 = true, preserve = false): { gl: GL; version: GLVersion } | null {
  const attrs: WebGLContextAttributes = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' };
  if (preferWebGL2) {
    const gl2 = canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null;
    if (gl2) return { gl: gl2, version: 2 };
  }
  const gl1 = (canvas.getContext('webgl', attrs) ?? canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
  if (gl1) {
    gl1.getExtension('OES_standard_derivatives');
    return { gl: gl1, version: 1 };
  }
  return null;
}

export class ShaderRenderer {
  readonly canvas: HTMLCanvasElement;
  gl!: GL;
  glVersion: GLVersion = 2;
  clock: Clock;
  settings: RendererSettings = { pixelRatio: 1, maxPixels: 2560 * 1440, fpsCap: 0 };

  /** Called every frame to obtain final (modulated) parameter values. */
  valueSource: (time: number) => Record<string, ParamValue> = () => ({});
  onStats: ((s: RenderStats) => void) | null = null;
  onContextLost: ((recovering: boolean) => void) | null = null;
  onSlowFrame: ((ms: number) => void) | null = null;
  /** Fired after each frame is drawn (used by the recorder). */
  onFrame: (() => void) | null = null;

  private current: CompiledProgram | null = null;
  private lastInput: ShaderInput | null = null;
  private buffer: WebGLBuffer | null = null;
  private channels: (ChannelState | null)[] = [null, null, null, null];
  private channelSources: ({ source: TexImageSource; opts: ChannelOptions } | null)[] = [null, null, null, null];
  private blank: WebGLTexture | null = null;
  private raf = 0;
  private running = false;
  private disposed = false;
  private lastDraw = 0;
  private fpsEma = 0;
  private frameMsEma = 0;
  private lastStats = 0;
  private dirty = true;
  /** Current adaptive resolution scale (1 = configured resolution). */
  private dynScale = 1;
  /** Scale used for the frame currently on screen. */
  private drawnScale = 1;
  /** Time of the last frame that was part of continuous motion. */
  private lastMotion = 0;
  private slowCount = 0;
  private lostTimes: number[] = [];
  private contextLost = false;
  /** Shadertoy iMouse: xy = current position while pressed, zw = click position (negated when released). */
  mouse = [0, 0, 0, 0];
  /** Position of the pointer over the canvas in drawing-buffer pixels (for u_mouse/mouse). */
  pointer = [0, 0];
  /** Drawing-buffer width that `mouse`/`pointer` were recorded at (0 = the current one). */
  pointerRefWidth = 0;
  private resizeObserver: ResizeObserver | null = null;
  private fixedSize: { w: number; h: number } | null = null;

  constructor(canvas: HTMLCanvasElement, opts: { preferWebGL2?: boolean; clock?: Clock; preserveDrawingBuffer?: boolean; observeResize?: boolean } = {}) {
    this.canvas = canvas;
    this.clock = opts.clock ?? new Clock();
    const ctx = createContext(canvas, opts.preferWebGL2 ?? true, opts.preserveDrawingBuffer ?? false);
    if (!ctx) throw new Error('WebGL is not available in this browser or has been disabled.');
    this.gl = ctx.gl;
    this.glVersion = ctx.version;
    this.initResources();
    canvas.addEventListener('webglcontextlost', this.handleLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleRestored, false);
    if (opts.observeResize !== false && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.dirty = true;
      });
      this.resizeObserver.observe(canvas);
    }
  }

  private initResources(): void {
    const gl = this.gl;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    // One oversized triangle covers the viewport.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.blank = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blank);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.channels = [null, null, null, null];
    this.channelSources.forEach((c, i) => {
      if (c) this.uploadChannel(i, c.source, c.opts);
    });
  }

  private handleLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    this.current = null;
    const now = performance.now();
    this.lostTimes = [...this.lostTimes.filter((t) => now - t < 15000), now];
    const recovering = this.lostTimes.length < 2;
    this.onContextLost?.(recovering);
  };

  private handleRestored = () => {
    this.contextLost = false;
    this.initResources();
    // If the context was lost repeatedly the shader is probably hanging the
    // GPU: do not recompile it automatically.
    if (this.lastInput && this.lostTimes.length < 2) this.setShader(this.lastInput);
    this.dirty = true;
  };

  get isContextLost(): boolean {
    return this.contextLost;
  }

  get hasProgram(): boolean {
    return this.current !== null;
  }

  /** Compile and link. On failure the previous program keeps rendering. */
  setShader(input: ShaderInput): CompileOutcome {
    const t0 = performance.now();
    const adapted = adaptShader(input.fragment, { format: input.format, glVersion: this.glVersion, vertex: input.vertex });
    if (!adapted.ok) {
      return {
        ok: false,
        diagnostics: [{ severity: 'error', line: null, message: adapted.message, origin: 'adapter' }],
        format: adapted.format,
        glsl: null,
        compileMs: performance.now() - t0,
        keptPrevious: this.current !== null,
      };
    }
    const result = this.compileProgram(adapted.vertex, adapted.fragment, adapted.userLineOffset, adapted.userLineCount);
    const diagnostics: Diagnostic[] = [
      ...adapted.notes.map((n): Diagnostic => ({ severity: 'info', line: null, message: n, origin: 'adapter' })),
      ...result.diagnostics,
    ];
    if (!result.program) {
      return { ok: false, diagnostics, format: adapted.format, glsl: adapted.glsl, compileMs: performance.now() - t0, keptPrevious: this.current !== null };
    }
    if (this.current) this.gl.deleteProgram(this.current.program);
    this.current = { program: result.program, uniforms: this.collectUniforms(result.program), params: input.params, format: adapted.format };
    this.lastInput = input;
    this.dirty = true;
    return { ok: true, diagnostics, format: adapted.format, glsl: adapted.glsl, compileMs: performance.now() - t0, keptPrevious: false };
  }

  /** Update parameter definitions without recompiling (e.g. range edits). */
  setParams(params: ParamDef[]): void {
    if (this.current) this.current.params = params;
    if (this.lastInput) this.lastInput = { ...this.lastInput, params };
    this.dirty = true;
  }

  private compileProgram(vsrc: string, fsrc: string, offset: number, userLines: number): { program: WebGLProgram | null; diagnostics: Diagnostic[] } {
    const gl = this.gl;
    const diagnostics: Diagnostic[] = [];
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsrc);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      diagnostics.push(...parseShaderLog(gl.getShaderInfoLog(vs) ?? 'Vertex shader failed to compile.', 'vertex', 0, 0));
    }
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsrc);
    gl.compileShader(fs);
    const fsOk = gl.getShaderParameter(fs, gl.COMPILE_STATUS);
    const fsLog = gl.getShaderInfoLog(fs) ?? '';
    if (!fsOk || /WARNING/.test(fsLog)) {
      const parsed = parseShaderLog(fsLog || 'Fragment shader failed to compile.', 'fragment', offset, userLines);
      diagnostics.push(...parsed);
    }
    if (diagnostics.some((d) => d.severity === 'error') || !fsOk) {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!diagnostics.some((d) => d.severity === 'error')) diagnostics.push({ severity: 'error', line: null, message: 'Compilation failed.', origin: 'wrapper' });
      return { program: null, diagnostics };
    }
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = (gl.getProgramInfoLog(program) ?? 'Link failed.').trim();
      diagnostics.push({ severity: 'error', line: null, message: log || 'Program failed to link.', origin: 'link' });
      gl.deleteProgram(program);
      return { program: null, diagnostics };
    }
    return { program, diagnostics };
  }

  private collectUniforms(program: WebGLProgram): Map<string, UniformInfo> {
    const gl = this.gl;
    const map = new Map<string, UniformInfo>();
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(program, i);
      if (!info) continue;
      const name = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(program, info.name);
      if (loc) map.set(name, { loc, type: info.type, size: info.size });
    }
    return map;
  }

  setChannel(index: number, source: TexImageSource | null, opts: ChannelOptions = { filter: 'linear', wrap: 'repeat' }): void {
    if (index < 0 || index > 3) return;
    const old = this.channels[index];
    if (old) this.gl.deleteTexture(old.texture);
    this.channels[index] = null;
    this.channelSources[index] = source ? { source, opts } : null;
    if (source) this.uploadChannel(index, source, opts);
    this.dirty = true;
  }

  private uploadChannel(index: number, source: TexImageSource, opts: ChannelOptions): void {
    const gl = this.gl;
    const tex = gl.createTexture();
    if (!tex) return;
    const w = (source as { width: number }).width;
    const h = (source as { height: number }).height;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const pot = isPow2(w) && isPow2(h);
    const canMip = this.glVersion === 2 || pot;
    const canRepeat = this.glVersion === 2 || pot;
    const wrap = !canRepeat || opts.wrap === 'clamp' ? gl.CLAMP_TO_EDGE : opts.wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.REPEAT;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    if (opts.filter === 'nearest') {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    } else {
      if (canMip) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, canMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    this.channels[index] = { texture: tex, width: w, height: h };
  }

  /** Force a fixed drawing-buffer size (offscreen thumbnails). */
  setFixedSize(w: number, h: number): void {
    this.fixedSize = { w, h };
    this.dirty = true;
  }

  private resize(): void {
    const c = this.canvas;
    let w: number;
    let h: number;
    if (this.fixedSize) {
      ({ w, h } = this.fixedSize);
    } else {
      const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) * this.settings.pixelRatio * this.drawnScale;
      w = Math.max(1, Math.round(c.clientWidth * dpr));
      h = Math.max(1, Math.round(c.clientHeight * dpr));
      const px = w * h;
      if (px > this.settings.maxPixels) {
        const k = Math.sqrt(this.settings.maxPixels / px);
        w = Math.max(1, Math.floor(w * k));
        h = Math.max(1, Math.floor(h * k));
      }
    }
    const maxDims = this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS) as Int32Array;
    w = Math.min(w, maxDims[0]);
    h = Math.min(h, maxDims[1]);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.resync();
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  requestRender(): void {
    this.dirty = true;
  }

  /** True when the current program reads the hover position (so pointer moves need a redraw). */
  get usesHover(): boolean {
    const u = this.current?.uniforms;
    return !!u && (u.has('u_mouse') || u.has('uMouse') || u.has('mouse'));
  }

  /** Resolution scale of the frame on screen (below 1 while adaptive resolution is active). */
  get resolutionScale(): number {
    return this.drawnScale;
  }

  private tick(now: number): void {
    const cap = this.settings.fpsCap;
    if (cap > 0 && now - this.lastDraw < 1000 / cap - 1) return;
    const advanced = this.clock.advance(now);
    const adaptive = !!this.settings.adaptive && !this.fixedSize;
    if (!advanced && !this.dirty) {
      // Still: replace a reduced-resolution frame with a full one.
      if (adaptive && this.drawnScale < 1 && now - this.lastDraw > SHARPEN_DELAY_MS) {
        this.drawnScale = 1;
        this.lastDraw = now;
        this.draw();
        this.onFrame?.();
        this.emitStats(now, true);
      } else this.emitStats(now, false);
      return;
    }
    const interval = this.lastDraw ? now - this.lastDraw : 16;
    // Frames that follow each other closely are motion (playback, dragging, slider scrubbing).
    const moving = advanced || now - this.lastMotion < MOTION_GAP_MS;
    this.lastMotion = now;
    if (adaptive) {
      if (moving && interval < MOTION_GAP_MS) {
        if (interval > ADAPTIVE_TARGET_MS * 1.3) this.dynScale = Math.max(MIN_ADAPTIVE_SCALE, this.dynScale * Math.sqrt(ADAPTIVE_TARGET_MS / interval));
        else if (interval < ADAPTIVE_TARGET_MS * 0.75) this.dynScale = Math.min(1, this.dynScale * 1.06);
      }
      this.drawnScale = moving ? this.dynScale : 1;
    } else this.drawnScale = 1;
    this.lastDraw = now;
    const t0 = performance.now();
    this.draw();
    const cost = performance.now() - t0;
    this.onFrame?.();
    this.dirty = false;
    if (advanced) {
      this.fpsEma = this.fpsEma ? this.fpsEma * 0.9 + (1000 / Math.max(1, interval)) * 0.1 : 1000 / Math.max(1, interval);
    }
    this.frameMsEma = this.frameMsEma * 0.9 + Math.max(cost, interval > 200 ? interval : 0) * 0.1;
    // GPU safeguard: sustained very long frames pause playback.
    if (interval > 400 && this.clock.playing) {
      this.slowCount++;
      if (this.slowCount >= 4) {
        this.slowCount = 0;
        this.clock.pause();
        this.onSlowFrame?.(interval);
      }
    } else this.slowCount = 0;
    this.emitStats(now, true);
  }

  private emitStats(now: number, force: boolean): void {
    if (!this.onStats || (!force && now - this.lastStats < 500) || now - this.lastStats < 250) return;
    this.lastStats = now;
    this.onStats({
      fps: this.clock.playing ? this.fpsEma : 0,
      frameMs: this.frameMsEma,
      frame: this.clock.frame,
      time: this.clock.time,
      width: this.canvas.width,
      height: this.canvas.height,
      glVersion: this.glVersion,
      playing: this.clock.playing,
    });
  }

  /** Draw one frame with the current program at the current clock time. */
  draw(target?: { fbo: WebGLFramebuffer; w: number; h: number }): void {
    if (this.contextLost) return;
    const gl = this.gl;
    if (!target) this.resize();
    const w = target ? target.w : this.canvas.width;
    const h = target ? target.h : this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    const cur = this.current;
    if (!cur) {
      gl.clearColor(0.03, 0.03, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(cur.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.applyBuiltins(cur, w, h);
    this.applyParams(cur);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private applyBuiltins(cur: CompiledProgram, w: number, h: number): void {
    const gl = this.gl;
    const u = cur.uniforms;
    const t = this.clock.time;
    const setF = (name: string, v: number) => {
      const x = u.get(name);
      if (x) gl.uniform1f(x.loc, v);
    };
    const setRes = (name: string) => {
      const x = u.get(name);
      if (!x) return;
      if (x.type === gl.FLOAT_VEC3) gl.uniform3f(x.loc, w, h, 1);
      else if (x.type === gl.FLOAT_VEC2) gl.uniform2f(x.loc, w, h);
    };
    for (const n of ['iTime', 'time', 'u_time', 'uTime']) setF(n, t);
    setF('iTimeDelta', this.clock.delta);
    setF('iFrameRate', this.fpsEma || 60);
    setF('iSampleRate', 44100);
    setF('ratio', w / h);
    for (const n of ['iFrame', 'frame', 'u_frame']) {
      const x = u.get(n);
      if (x) {
        if (x.type === gl.INT) gl.uniform1i(x.loc, this.clock.frame);
        else gl.uniform1f(x.loc, this.clock.frame);
      }
    }
    for (const n of ['iResolution', 'resolution', 'u_resolution', 'u_res', 'uResolution']) setRes(n);
    // Pointer coordinates are kept in the buffer size they were recorded at; rescale to this frame's size.
    const sx = w / Math.max(1, this.pointerRefWidth || this.canvas.width);
    const im = u.get('iMouse');
    if (im) gl.uniform4f(im.loc, this.mouse[0] * sx, this.mouse[1] * sx, this.mouse[2] * sx, this.mouse[3] * sx);
    for (const n of ['u_mouse', 'uMouse']) {
      const x = u.get(n);
      if (x && x.type === gl.FLOAT_VEC2) gl.uniform2f(x.loc, this.pointer[0] * sx, this.pointer[1] * sx);
    }
    const m = u.get('mouse');
    if (m && m.type === gl.FLOAT_VEC2) gl.uniform2f(m.loc, (this.pointer[0] * sx) / Math.max(1, w), (this.pointer[1] * sx) / Math.max(1, h));
    const date = u.get('iDate');
    if (date) {
      const d = new Date();
      gl.uniform4f(date.loc, d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000);
    }
    const cres = u.get('iChannelResolution');
    if (cres) {
      const arr = new Float32Array(12);
      this.channels.forEach((c, i) => {
        arr[i * 3] = c?.width ?? 1;
        arr[i * 3 + 1] = c?.height ?? 1;
        arr[i * 3 + 2] = 1;
      });
      gl.uniform3fv(cres.loc, arr);
    }
    const ctime = u.get('iChannelTime');
    if (ctime) gl.uniform1fv(ctime.loc, new Float32Array([t, t, t, t]));
    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.channels[i]?.texture ?? this.blank);
      const s = u.get(`iChannel${i}`);
      if (s) gl.uniform1i(s.loc, i);
    }
  }

  private applyParams(cur: CompiledProgram): void {
    const gl = this.gl;
    const values = this.valueSource(this.clock.time);
    for (const p of cur.params) {
      const x = cur.uniforms.get(p.name);
      if (!x) continue;
      const v = values[p.name] ?? p.default;
      if (p.type === 'bool') gl.uniform1i(x.loc, v ? 1 : 0);
      else if (p.type === 'int') gl.uniform1i(x.loc, Math.round(v as number));
      else if (p.type === 'float') gl.uniform1f(x.loc, v as number);
      else {
        const arr = Array.isArray(v) ? v : [Number(v)];
        const n = componentCount(p.type);
        const data = new Float32Array(n);
        for (let i = 0; i < n; i++) data[i] = arr[i] ?? 0;
        if (n === 2) gl.uniform2fv(x.loc, data);
        else if (n === 3) gl.uniform3fv(x.loc, data);
        else gl.uniform4fv(x.loc, data);
      }
    }
  }

  /** Render once at an arbitrary resolution into an offscreen framebuffer. */
  renderToPixels(w: number, h: number, time?: number): ImageData {
    const gl = this.gl;
    const max = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number, (gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array)[0]);
    w = Math.max(1, Math.min(Math.round(w), max));
    h = Math.max(1, Math.min(Math.round(h), max));
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const savedTime = this.clock.time;
    if (time !== undefined) this.clock.time = time;
    try {
      this.draw({ fbo, w, h });
      const px = new Uint8ClampedArray(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      // Flip rows: GL origin is bottom-left.
      const row = w * 4;
      const flipped = new Uint8ClampedArray(px.length);
      for (let y = 0; y < h; y++) flipped.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
      return new ImageData(flipped, w, h);
    } finally {
      this.clock.time = savedTime;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      this.dirty = true;
    }
  }

  /** Sample the drawing buffer's centre pixel(s) — used by tests/diagnostics. */
  readCenter(): [number, number, number, number] {
    const img = this.renderToPixels(8, 8);
    const i = (4 * 8 + 4) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
  }

  dispose(): void {
    this.stop();
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.handleLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleRestored);
    const gl = this.gl;
    if (!gl.isContextLost()) {
      if (this.current) gl.deleteProgram(this.current.program);
      this.channels.forEach((c) => c && gl.deleteTexture(c.texture));
      if (this.blank) gl.deleteTexture(this.blank);
      if (this.buffer) gl.deleteBuffer(this.buffer);
    }
    this.current = null;
    // Release the context promptly so mobile browsers do not hit context limits.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
