/**
 * Shader compatibility adapter.
 *
 * Takes user fragment source in one of several dialects (Shadertoy
 * mainImage, conventional main(), GL Transitions) and produces a complete,
 * compilable GLSL ES program for WebGL 1 or 2. The user source is never
 * rewritten in place — the adapter only builds a wrapper around a copy, and
 * records how compiled line numbers map back to the user's lines so that
 * diagnostics can tell user errors apart from wrapper errors.
 */
import type { ResolvedFormat, ShaderFormat } from '../types/shader';
import { stripComments, tokenize } from './tokenizer';

export type GLVersion = 1 | 2;
export type GLSLVersion = '100' | '300';

export interface AdaptResult {
  ok: true;
  fragment: string;
  vertex: string;
  format: ResolvedFormat;
  glsl: GLSLVersion;
  /** Lines of wrapper code before user line 1 in the compiled fragment. */
  userLineOffset: number;
  userLineCount: number;
  notes: string[];
}

export interface AdaptError {
  ok: false;
  message: string;
  format: ResolvedFormat;
}

export const SHADERTOY_UNIFORMS: Record<string, string> = {
  iResolution: 'vec3',
  iTime: 'float',
  iTimeDelta: 'float',
  iFrameRate: 'float',
  iFrame: 'int',
  iMouse: 'vec4',
  iDate: 'vec4',
  iSampleRate: 'float',
  iChannel0: 'sampler2D',
  iChannel1: 'sampler2D',
  iChannel2: 'sampler2D',
  iChannel3: 'sampler2D',
};
const SHADERTOY_ARRAYS = ['uniform float iChannelTime[4];', 'uniform vec3 iChannelResolution[4];'];

/** Uniform names the renderer drives automatically (never exposed as params). */
export const BUILTIN_UNIFORMS = new Set([
  ...Object.keys(SHADERTOY_UNIFORMS),
  'iChannelTime',
  'iChannelResolution',
  'time', 'u_time', 'uTime',
  'resolution', 'u_resolution', 'u_res', 'uResolution',
  'mouse', 'u_mouse', 'uMouse',
  'frame', 'u_frame',
  'ratio',
]);

export function detectFormat(source: string): ResolvedFormat {
  const s = stripComments(source);
  if (/\bvoid\s+mainImage\s*\(/.test(s)) return 'shadertoy';
  if (/\bvec4\s+transition\s*\(/.test(s) && /\bgetFromColor\b/.test(s)) return 'gltransition';
  if (/\bvoid\s+main\s*\(/.test(s)) return 'standard';
  if (/\bmainImage\b/.test(s)) return 'shadertoy';
  return 'standard';
}

export function detectGLSLVersion(source: string): GLSLVersion | null {
  const m = /^\s*#\s*version\s+(\d+)/m.exec(stripComments(source));
  if (!m) return null;
  return m[1] === '300' ? '300' : '100';
}

export function defaultVertex(glsl: GLSLVersion): string {
  return glsl === '300'
    ? '#version 300 es\nin vec2 a_position;\nvoid main() { gl_Position = vec4(a_position, 0.0, 1.0); }\n'
    : 'attribute vec2 a_position;\nvoid main() { gl_Position = vec4(a_position, 0.0, 1.0); }\n';
}

function declaresUniform(stripped: string, name: string): boolean {
  return new RegExp(`\\buniform\\s+(?:(?:lowp|mediump|highp)\\s+)?\\w+\\s+(?:[\\w\\[\\]\\s]*,\\s*)*${name}\\b`).test(stripped);
}

/**
 * Removes #version / #extension lines from user code (they are hoisted into
 * the wrapper prefix) while keeping the line count identical.
 */
function hoistDirectives(source: string): { body: string; extensions: string[] } {
  const extensions: string[] = [];
  const lines = source.split('\n');
  const stripped = stripComments(source).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const s = stripped[i] ?? '';
    if (/^\s*#\s*version\b/.test(s)) lines[i] = '';
    else if (/^\s*#\s*extension\b/.test(s)) {
      extensions.push(lines[i].trim());
      lines[i] = '';
    }
  }
  return { body: lines.join('\n'), extensions };
}

export interface AdaptOptions {
  format: ShaderFormat;
  glVersion: GLVersion;
  vertex?: string;
}

export function adaptShader(source: string, opts: AdaptOptions): AdaptResult | AdaptError {
  const format: ResolvedFormat = opts.format === 'auto' ? detectFormat(source) : opts.format;
  const stripped = stripComments(source);
  const declared = detectGLSLVersion(source);
  const notes: string[] = [];

  let glsl: GLSLVersion;
  if (declared === '300') glsl = '300';
  else if (declared === '100') glsl = '100';
  else if (format === 'standard') {
    // Conventional WebGL shaders without #version are GLSL ES 1.00 unless
    // they use ES 3.00 constructs.
    glsl = opts.glVersion === 2 && /\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\b/.test(stripped) && !/gl_FragColor/.test(stripped) ? '300' : '100';
  } else glsl = opts.glVersion === 2 ? '300' : '100';

  if (glsl === '300' && opts.glVersion === 1) {
    return {
      ok: false,
      format,
      message:
        'This shader requires GLSL ES 3.00 (WebGL 2), which is not available in this browser. ' +
        'Remove "#version 300 es" and use GLSL ES 1.00 syntax to run it under WebGL 1.',
    };
  }

  // GLSL ES 1.00 cannot use derivatives under WebGL 2 (the extension is not
  // exposed there), so such shaders are translated token-wise to ES 3.00.
  let src = source;
  if (glsl === '100' && opts.glVersion === 2 && format === 'standard' && /\b(dFdx|dFdy|fwidth)\b/.test(stripped)) {
    src = upgradeToEssl3(source);
    glsl = '300';
    notes.push('Translated GLSL ES 1.00 to 3.00 so derivative functions work under WebGL 2.');
  }
  const hoisted = hoistDirectives(src);
  const body = hoisted.body;
  const extensions = glsl === '300' ? hoisted.extensions.filter((e) => !e.includes('standard_derivatives')) : hoisted.extensions;
  const prefix: string[] = [];
  const suffix: string[] = [];
  if (glsl === '300') prefix.push('#version 300 es');
  if (src !== source) prefix.push('precision highp float;', 'out vec4 sf_FragColor;');
  prefix.push(...extensions);
  if (glsl === '100' && /\b(dFdx|dFdy|fwidth)\b/.test(stripped) && !extensions.some((e) => e.includes('standard_derivatives'))) {
    prefix.push('#extension GL_OES_standard_derivatives : enable');
    notes.push('Enabled GL_OES_standard_derivatives for GLSL ES 1.00.');
  }
  if (!/\bprecision\s+(lowp|mediump|highp)\s+float\s*;/.test(stripped)) {
    prefix.push('precision highp float;');
  }
  if (glsl === '300' && !/\bprecision\s+(lowp|mediump|highp)\s+int\s*;/.test(stripped) && format !== 'standard') {
    prefix.push('precision highp int;');
  }

  if (format === 'shadertoy' || format === 'gltransition') {
    for (const [name, type] of Object.entries(SHADERTOY_UNIFORMS)) {
      if (!declaresUniform(stripped, name)) prefix.push(`uniform ${type} ${name};`);
    }
    if (!declaresUniform(stripped, 'iChannelTime')) prefix.push(SHADERTOY_ARRAYS[0]);
    if (!declaresUniform(stripped, 'iChannelResolution')) prefix.push(SHADERTOY_ARRAYS[1]);
    if (glsl === '100') {
      prefix.push('#define texture texture2D');
      notes.push('Mapped texture() to texture2D() for GLSL ES 1.00.');
    }
  }

  if (format === 'gltransition') {
    if (!declaresUniform(stripped, 'ratio')) prefix.push('uniform float ratio;');
    if (!declaresUniform(stripped, 'progress')) {
      prefix.push('uniform float progress;');
      notes.push('Declared "progress" uniform for GL Transition.');
    }
    prefix.push('vec4 getFromColor(vec2 uv) { return texture(iChannel0, uv); }');
    prefix.push('vec4 getToColor(vec2 uv) { return texture(iChannel1, uv); }');
  }

  if (format === 'shadertoy') {
    if (glsl === '300') {
      prefix.push('out vec4 sf_FragColor;');
      suffix.push('void main() {', '  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);', '  mainImage(c, gl_FragCoord.xy);', '  sf_FragColor = vec4(c.rgb, 1.0);', '}');
    } else {
      suffix.push('void main() {', '  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);', '  mainImage(c, gl_FragCoord.xy);', '  gl_FragColor = vec4(c.rgb, 1.0);', '}');
    }
    if (/\bvoid\s+main\s*\(/.test(stripped)) {
      return { ok: false, format, message: 'Shadertoy-format shaders must not define main(); define mainImage(out vec4, in vec2) instead, or switch the format to "Standard".' };
    }
    if (!/\bmainImage\s*\(/.test(stripped)) {
      return { ok: false, format, message: 'No mainImage(out vec4 fragColor, in vec2 fragCoord) function found.' };
    }
  } else if (format === 'gltransition') {
    if (glsl === '300') {
      prefix.push('out vec4 sf_FragColor;');
      suffix.push('void main() {', '  vec2 uv = gl_FragCoord.xy / iResolution.xy;', '  sf_FragColor = transition(uv);', '}');
    } else {
      suffix.push('void main() {', '  vec2 uv = gl_FragCoord.xy / iResolution.xy;', '  gl_FragColor = transition(uv);', '}');
    }
  } else if (!/\bvoid\s+main\s*\(/.test(stripped)) {
    return { ok: false, format, message: 'No main() function found. For Shadertoy code, define mainImage() or set the format to "Shadertoy".' };
  }

  const prefixText = prefix.length ? prefix.join('\n') + '\n' : '';
  const userBody = body.endsWith('\n') ? body : body + '\n';
  const fragment = prefixText + userBody + (suffix.length ? suffix.join('\n') + '\n' : '');
  const custom = opts.vertex?.trim() ? opts.vertex : undefined;
  if (custom && (detectGLSLVersion(custom) === '300') !== (glsl === '300')) {
    notes.push('Custom vertex shader GLSL version differs from the fragment shader; linking may fail.');
  }
  const vertex = custom ?? defaultVertex(glsl);

  return {
    ok: true,
    fragment,
    vertex,
    format,
    glsl,
    userLineOffset: prefix.length,
    userLineCount: source.split('\n').length,
    notes,
  };
}

/** Token-level ESSL 1.00 → 3.00 translation for fragment shaders (line count preserved). */
export function upgradeToEssl3(source: string): string {
  const map: Record<string, string> = { gl_FragColor: 'sf_FragColor', texture2D: 'texture', textureCube: 'texture', varying: 'in', texture2DLodEXT: 'textureLod' };
  return tokenize(source)
    .map((t) => (t.type === 'ident' && map[t.text] ? map[t.text] : t.text))
    .join('');
}

export interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  /** Line number in the user's source, when the message maps there. */
  line: number | null;
  message: string;
  origin: 'user' | 'wrapper' | 'vertex' | 'link' | 'adapter' | 'runtime';
  /** Line in the compiled (wrapped) source, for wrapper diagnostics. */
  compiledLine?: number;
}

const LOG_RE = /^\s*(ERROR|WARNING):\s*(\d+):(\d+):\s*(.*)$/;

export function parseShaderLog(
  log: string,
  stage: 'fragment' | 'vertex',
  userLineOffset: number,
  userLineCount: number,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const raw of log.split('\n')) {
    const lineText = raw.replace(/\0/g, '').trim();
    if (!lineText) continue;
    const m = LOG_RE.exec(lineText);
    if (!m) {
      if (/compilation errors|^\d+ errors?/i.test(lineText)) continue;
      out.push({ severity: 'error', line: null, message: lineText, origin: stage === 'vertex' ? 'vertex' : 'wrapper' });
      continue;
    }
    const severity = m[1] === 'ERROR' ? 'error' : 'warning';
    const compiledLine = Number(m[3]);
    if (stage === 'vertex') {
      out.push({ severity, line: compiledLine, message: m[4], origin: 'vertex', compiledLine });
      continue;
    }
    const userLine = compiledLine - userLineOffset;
    if (userLine >= 1 && userLine <= userLineCount) {
      out.push({ severity, line: userLine, message: m[4], origin: 'user', compiledLine });
    } else {
      out.push({ severity, line: null, message: m[4], origin: 'wrapper', compiledLine });
    }
  }
  return out;
}
