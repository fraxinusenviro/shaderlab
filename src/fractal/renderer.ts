/**
 * Deep-zoom Mandelbrot renderer.
 *
 * WebGL 2: perturbation theory. Each pixel iterates only its difference dz
 * from a high-precision reference orbit Z (uploaded as an RG32F texture):
 *   dz' = 2·Z·dz + dz² + dc
 * with "rebasing" (dz ← Z + dz, restart the reference) whenever the pixel
 * orbit comes closer to 0 than its delta, which avoids glitches with a single
 * reference. Float32 deltas reach ~10^-30 before underflow.
 *
 * WebGL 1 fallback: classic float32 iteration, usable to ~10^5.
 */

export interface Palette {
  id: string;
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
}

// Cosine palettes: col = a + b * cos(2π (c·t + d)).
export const PALETTES: Palette[] = [
  { id: 'classic', name: 'Classic', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.0, 0.1, 0.2] },
  { id: 'electric', name: 'Electric', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.3, 0.2, 0.2] },
  { id: 'fire', name: 'Fire', a: [0.5, 0.25, 0.1], b: [0.5, 0.35, 0.15], c: [1, 1, 1], d: [0.0, 0.15, 0.2] },
  { id: 'ocean', name: 'Ocean', a: [0.2, 0.4, 0.55], b: [0.25, 0.35, 0.4], c: [1, 1, 1], d: [0.0, 0.1, 0.2] },
  { id: 'sunset', name: 'Sunset', a: [0.6, 0.35, 0.4], b: [0.4, 0.3, 0.3], c: [1, 1, 0.5], d: [0.8, 0.9, 0.3] },
  { id: 'ice', name: 'Ice', a: [0.65, 0.75, 0.85], b: [0.35, 0.3, 0.2], c: [1, 1, 1], d: [0.5, 0.5, 0.5] },
  { id: 'rainbow', name: 'Rainbow', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.0, 0.33, 0.67] },
  { id: 'mono', name: 'Mono', a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0, 0] },
];

export type ColorMap = 'linear' | 'sqrt' | 'log';

export interface FractalView {
  /** Offset of the view centre from the reference point (complex units). */
  offset: [number, number];
  /** Complex units per pixel at the current drawing-buffer size. */
  pixel: number;
  rotation: number;
  maxIter: number;
  /** Low-precision centre (WebGL 1 fallback only). */
  center: [number, number];
}

export interface FractalStyle {
  palette: Palette;
  density: number;
  phase: number;
  map: ColorMap;
  interior: [number, number, number];
  time: number;
}

const COMMON = `
uniform vec3 uPa, uPb, uPc, uPd;
uniform float uDensity, uPhase, uTime;
uniform int uMap;
uniform vec3 uInterior;
vec3 shade(float mu) {
  float v = mu;
  if (uMap == 1) v = sqrt(max(mu, 0.0)) * 6.0;
  else if (uMap == 2) v = log(mu + 1.0) * 14.0;
  float t = v * uDensity * 0.02 + uPhase + uTime;
  return clamp(uPa + uPb * cos(6.2831853 * (uPc * t + uPd)), 0.0, 1.0);
}
`;

const PERTURB_FS = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uRes;
uniform float uPixel;
uniform vec2 uRot;
uniform vec2 uOffset;
uniform int uMaxIter;
uniform int uRefLen;
uniform int uOrbitW;
uniform highp sampler2D uOrbit;
out vec4 outColor;
${COMMON}
vec2 refZ(int i) { return texelFetch(uOrbit, ivec2(i % uOrbitW, i / uOrbitW), 0).rg; }
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) * uPixel;
  vec2 dc = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x) + uOffset;
  vec2 dz = vec2(0.0);
  vec2 z = vec2(0.0);
  int m = 0;
  int n = 0;
  bool escaped = false;
  for (n = 0; n < uMaxIter; n++) {
    vec2 Z = refZ(m);
    dz = vec2(2.0 * (Z.x * dz.x - Z.y * dz.y) + (dz.x * dz.x - dz.y * dz.y),
              2.0 * (Z.x * dz.y + Z.y * dz.x) + 2.0 * dz.x * dz.y) + dc;
    m++;
    z = refZ(m) + dz;
    float r2 = dot(z, z);
    if (r2 > 1.0e4) { escaped = true; break; }
    // Rebase when the orbit passes closer to 0 than its delta, or the
    // reference runs out: keeps a single reference glitch-free.
    if (r2 < dot(dz, dz) || m >= uRefLen) { dz = z; m = 0; }
  }
  if (!escaped) { outColor = vec4(uInterior, 1.0); return; }
  float mu = float(n) + 1.0 - log2(log2(dot(z, z)) * 0.5);
  outColor = vec4(shade(mu), 1.0);
}
`;

const DIRECT_FS = `
precision highp float;
uniform vec2 uRes;
uniform float uPixel;
uniform vec2 uRot;
uniform vec2 uCenter;
uniform int uMaxIter;
${COMMON}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) * uPixel;
  vec2 c = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x) + uCenter;
  vec2 z = vec2(0.0);
  float n = 0.0;
  bool escaped = false;
  for (int i = 0; i < 8192; i++) {
    if (i >= uMaxIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 1.0e4) { escaped = true; break; }
    n += 1.0;
  }
  if (!escaped) { gl_FragColor = vec4(uInterior, 1.0); return; }
  float mu = n + 2.0 - log2(log2(dot(z, z)) * 0.5);
  gl_FragColor = vec4(shade(mu), 1.0);
}
`;

const VS2 = '#version 300 es\nin vec2 a;\nvoid main(){ gl_Position = vec4(a, 0.0, 1.0); }';
const VS1 = 'attribute vec2 a;\nvoid main(){ gl_Position = vec4(a, 0.0, 1.0); }';

export const ORBIT_TEX_W = 4096;

export class FractalRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext | WebGLRenderingContext;
  readonly deep: boolean;
  private program: WebGLProgram;
  private loc = new Map<string, WebGLUniformLocation | null>();
  private orbitTex: WebGLTexture | null = null;
  private refLen = 0;
  lost = false;

  constructor(canvas: HTMLCanvasElement, preferWebGL2 = true) {
    this.canvas = canvas;
    const attrs: WebGLContextAttributes = { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    const gl2 = preferWebGL2 ? (canvas.getContext('webgl2', attrs) as WebGL2RenderingContext | null) : null;
    const gl = gl2 ?? (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null);
    if (!gl) throw new Error('WebGL is not available.');
    this.gl = gl;
    this.deep = !!gl2;
    this.program = this.build(gl2 ? VS2 : VS1, gl2 ? PERTURB_FS : DIRECT_FS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  private build(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Fractal shader failed to compile: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Fractal program failed to link: ${gl.getProgramInfoLog(p)}`);
    return p;
  }

  private u(name: string) {
    if (!this.loc.has(name)) this.loc.set(name, this.gl.getUniformLocation(this.program, name));
    return this.loc.get(name)!;
  }

  /** Upload a reference orbit (interleaved float pairs) as an RG32F texture. */
  setOrbit(orbit: Float32Array, length: number): void {
    if (!this.deep) return;
    const gl = this.gl as WebGL2RenderingContext;
    const texels = length + 1;
    const rows = Math.ceil(texels / ORBIT_TEX_W);
    const data = new Float32Array(ORBIT_TEX_W * rows * 2);
    data.set(orbit.subarray(0, texels * 2));
    if (!this.orbitTex) this.orbitTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, ORBIT_TEX_W, rows, 0, gl.RG, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.refLen = length;
  }

  get hasOrbit(): boolean {
    return !this.deep || this.refLen > 0;
  }

  draw(view: FractalView, style: FractalStyle, target?: { fbo: WebGLFramebuffer; w: number; h: number }): void {
    if (this.lost) return;
    const gl = this.gl;
    const w = target ? target.w : this.canvas.width;
    const h = target ? target.h : this.canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(this.u('uRes'), w, h);
    gl.uniform1f(this.u('uPixel'), view.pixel);
    gl.uniform2f(this.u('uRot'), Math.cos(view.rotation), Math.sin(view.rotation));
    gl.uniform1i(this.u('uMaxIter'), Math.max(1, Math.round(view.maxIter)));
    const p = style.palette;
    gl.uniform3fv(this.u('uPa'), p.a);
    gl.uniform3fv(this.u('uPb'), p.b);
    gl.uniform3fv(this.u('uPc'), p.c);
    gl.uniform3fv(this.u('uPd'), p.d);
    gl.uniform1f(this.u('uDensity'), style.density);
    gl.uniform1f(this.u('uPhase'), style.phase);
    gl.uniform1f(this.u('uTime'), style.time);
    gl.uniform1i(this.u('uMap'), style.map === 'sqrt' ? 1 : style.map === 'log' ? 2 : 0);
    gl.uniform3fv(this.u('uInterior'), style.interior);
    if (this.deep) {
      gl.uniform2f(this.u('uOffset'), view.offset[0], view.offset[1]);
      gl.uniform1i(this.u('uRefLen'), Math.max(1, this.refLen));
      gl.uniform1i(this.u('uOrbitW'), ORBIT_TEX_W);
      gl.uniform1i(this.u('uOrbit'), 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.orbitTex);
    } else {
      gl.uniform2f(this.u('uCenter'), view.center[0], view.center[1]);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Render offscreen at an arbitrary size (PNG export). */
  renderToPixels(view: FractalView, style: FractalStyle, w: number, h: number): ImageData {
    const gl = this.gl;
    const max = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
    const k = Math.min(1, max / Math.max(w, h));
    w = Math.max(1, Math.floor(w * k));
    h = Math.max(1, Math.floor(h * k));
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    try {
      this.draw(view, style, { fbo, w, h });
      const px = new Uint8ClampedArray(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const row = w * 4;
      const flipped = new Uint8ClampedArray(px.length);
      for (let y = 0; y < h; y++) flipped.set(px.subarray(y * row, (y + 1) * row), (h - 1 - y) * row);
      return new ImageData(flipped, w, h);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (this.orbitTex) gl.deleteTexture(this.orbitTex);
    gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
