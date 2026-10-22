/**
 * Level 3 — structural mutation. Inserts coordinate-space transforms
 * (symmetry, repetition, warps, polar remaps), substitutes functions with
 * same-signature alternatives, and adds colour post-processing or
 * self-blending by wrapping the entry point. Helpers are injected as new,
 * clearly prefixed (sf_) functions so the transformation is legible.
 */
import { detectFormat } from '../glsl/adapter';
import { findFunctions, nextSignificant, prevSignificant, tokenize, type Token } from '../glsl/tokenizer';
import type { MutationOp, ResolvedFormat, ShaderFormat } from '../types/shader';
import { formatFloat, TIME_IDENTS } from './math';
import { createRng, type Rng } from './rng';

export type StructOpKind = 'symmetry' | 'repetition' | 'warp' | 'polar' | 'rotate' | 'fn-substitute' | 'color' | 'blend';

export const STRUCT_OPS: { id: StructOpKind; label: string }[] = [
  { id: 'symmetry', label: 'Mirror / kaleidoscope symmetry' },
  { id: 'repetition', label: 'Domain repetition (tiling)' },
  { id: 'warp', label: 'Insert wave / swirl distortion' },
  { id: 'polar', label: 'Polar coordinate remap' },
  { id: 'rotate', label: 'Rotate & zoom coordinates' },
  { id: 'fn-substitute', label: 'Substitute functions (fract, sin)' },
  { id: 'color', label: 'Colour post-process' },
  { id: 'blend', label: 'Blend with mirrored self' },
];

export interface StructMutationOptions {
  seed: number;
  strength: number;
  probability: number;
  ops: StructOpKind[];
  format: ShaderFormat;
}

const RES_IDENTS = ['iResolution', 'u_resolution', 'resolution', 'u_res', 'uResolution'];

function findIdent(tokens: Token[], names: string[]): string | null {
  for (const n of names) if (tokens.some((t) => t.type === 'ident' && t.text === n)) return n;
  return null;
}

function buildCoordOps(kinds: StructOpKind[], rng: Rng, s: number, timeExpr: string, ops: MutationOp[]): string[] {
  const lines: string[] = [];
  for (const k of kinds) {
    switch (k) {
      case 'symmetry': {
        if (rng.chance(0.4)) {
          lines.push('q.x = abs(q.x);');
          ops.push({ level: 3, kind: 'symmetry', description: 'Mirror symmetry across the vertical axis' });
        } else {
          const n = rng.int(3, 3 + Math.round(5 * s));
          lines.push(`{ float a = atan(q.y, q.x); float r = length(q); float sct = 6.2831853 / ${formatFloat(n)}; a = abs(mod(a, sct) - 0.5 * sct); q = r * vec2(cos(a), sin(a)); }`);
          ops.push({ level: 3, kind: 'symmetry', description: `${n}-fold kaleidoscope` });
        }
        break;
      }
      case 'repetition': {
        const c = formatFloat(rng.range(0.6, 1.6) / (0.5 + s));
        lines.push(`q = mod(q + 0.5 * ${c}, ${c}) - 0.5 * ${c};`);
        ops.push({ level: 3, kind: 'repetition', description: `Tile space every ${c} units` });
        break;
      }
      case 'warp': {
        if (rng.chance(0.5)) {
          const a = formatFloat(rng.range(0.03, 0.15) * (0.5 + s));
          const f = formatFloat(rng.range(2, 9));
          lines.push(`q += ${a} * sin(q.yx * ${f} + ${timeExpr});`);
          ops.push({ level: 3, kind: 'warp', description: `Wave displacement amp ${a}, freq ${f}` });
        } else {
          const k = formatFloat(rng.range(1, 4) * (0.4 + s) * (rng.chance(0.5) ? 1 : -1));
          lines.push(`{ float r = length(q); float a = ${k} * exp(-r * r * 2.0); float c = cos(a), sn = sin(a); q = mat2(c, -sn, sn, c) * q; }`);
          ops.push({ level: 3, kind: 'warp', description: `Swirl distortion ${k}` });
        }
        break;
      }
      case 'polar': {
        lines.push('q = vec2(atan(q.y, q.x) / 3.14159265, length(q) * 2.0 - 0.5);');
        ops.push({ level: 3, kind: 'polar', description: 'Polar remap (angle, radius)' });
        break;
      }
      case 'rotate': {
        const ang = formatFloat(rng.range(-Math.PI, Math.PI) * s);
        const z = formatFloat(Math.exp(rng.gauss() * 0.4 * s));
        lines.push(`{ float c = cos(${ang}), sn = sin(${ang}); q = mat2(c, -sn, sn, c) * q * ${z}; }`);
        ops.push({ level: 3, kind: 'rotate', description: `Rotate ${ang} rad, zoom ×${z}` });
        break;
      }
      default:
        break;
    }
  }
  return lines;
}

function buildColorOp(rng: Rng, s: number, ops: MutationOp[]): string {
  const choice = rng.int(0, 5);
  switch (choice) {
    case 0: {
      const h = formatFloat(rng.range(0.5, 5.5) * Math.max(0.2, s));
      ops.push({ level: 3, kind: 'color', description: `Hue rotation ${h} rad` });
      return `{ const vec3 k = vec3(0.57735); float ca = cos(${h}); c = c * ca + cross(k, c) * sin(${h}) + k * dot(k, c) * (1.0 - ca); }`;
    }
    case 1:
      ops.push({ level: 3, kind: 'color', description: 'Channel rotation rgb → gbr' });
      return 'c = c.gbr;';
    case 2: {
      const n = formatFloat(rng.int(3, 8));
      ops.push({ level: 3, kind: 'color', description: `Posterize to ${n} levels` });
      return `c = floor(clamp(c, 0.0, 1.0) * ${n} + 0.5) / ${n};`;
    }
    case 3: {
      const g = formatFloat(Math.exp(rng.gauss() * 0.5 * (0.5 + s)));
      ops.push({ level: 3, kind: 'color', description: `Gamma ${g}` });
      return `c = pow(max(c, vec3(0.0)), vec3(${g}));`;
    }
    case 4: {
      const p = [rng(), rng(), rng()].map((x) => formatFloat(x));
      ops.push({ level: 3, kind: 'color', description: `Cosine palette remap (${p.join(', ')})` });
      return `{ float l = dot(c, vec3(0.299, 0.587, 0.114)); c = 0.5 + 0.5 * cos(6.2831853 * (l + vec3(${p.join(', ')}))); }`;
    }
    default:
      ops.push({ level: 3, kind: 'color', description: 'Invert colours' });
      return 'c = 1.0 - clamp(c, 0.0, 1.0);';
  }
}

const SUBST_HELPERS = `
float sf_tri(float x) { return abs(fract(x * 0.5) * 2.0 - 1.0) * 2.0 - 1.0; }
vec2 sf_tri(vec2 x) { return abs(fract(x * 0.5) * 2.0 - 1.0) * 2.0 - 1.0; }
vec3 sf_tri(vec3 x) { return abs(fract(x * 0.5) * 2.0 - 1.0) * 2.0 - 1.0; }
vec4 sf_tri(vec4 x) { return abs(fract(x * 0.5) * 2.0 - 1.0) * 2.0 - 1.0; }
float sf_tsin(float x) { return sf_tri(x / 3.14159265 - 0.5); }
vec2 sf_tsin(vec2 x) { return sf_tri(x / 3.14159265 - 0.5); }
vec3 sf_tsin(vec3 x) { return sf_tri(x / 3.14159265 - 0.5); }
vec4 sf_tsin(vec4 x) { return sf_tri(x / 3.14159265 - 0.5); }
float sf_sfract(float x) { return smoothstep(0.0, 1.0, fract(x)); }
vec2 sf_sfract(vec2 x) { return smoothstep(0.0, 1.0, fract(x)); }
vec3 sf_sfract(vec3 x) { return smoothstep(0.0, 1.0, fract(x)); }
vec4 sf_sfract(vec4 x) { return smoothstep(0.0, 1.0, fract(x)); }
`;

export function mutateStructure(source: string, opts: StructMutationOptions): { source: string; ops: MutationOp[]; skipped: string[] } {
  const rng = createRng(opts.seed);
  const s = Math.max(0, Math.min(1, opts.strength));
  const ops: MutationOp[] = [];
  const skipped: string[] = [];
  const format: ResolvedFormat = opts.format === 'auto' ? detectFormat(source) : opts.format;
  let tokens = tokenize(source);
  const fns = findFunctions(tokens);
  if (!fns.length) return { source, ops, skipped: ['No function definitions found.'] };

  // Decide which operations fire for this variant.
  const want = opts.ops.filter(() => rng.chance(Math.max(0.25, opts.probability)));
  if (!want.length && opts.ops.length) want.push(rng.pick(opts.ops));
  const coordKinds = want.filter((k): k is StructOpKind => ['symmetry', 'repetition', 'warp', 'polar', 'rotate'].includes(k));
  const timeIdent = findIdent(tokens, TIME_IDENTS);
  const timeExpr = timeIdent ? timeIdent : '0.0';

  const replace = new Map<number, string>();
  let helpers = '';
  let entryPrelude = '';
  let entryTarget: { fnIdx: number; kind: 'shadertoy' | 'standard' | 'gltransition'; param?: string } | null = null;

  if (format === 'shadertoy') {
    const f = fns.find((x) => x.name === 'mainImage');
    if (f) entryTarget = { fnIdx: fns.indexOf(f), kind: 'shadertoy', param: f.params[1]?.name ?? 'fragCoord' };
  } else if (format === 'gltransition') {
    const f = fns.find((x) => x.name === 'transition');
    if (f) entryTarget = { fnIdx: fns.indexOf(f), kind: 'gltransition', param: f.params[0]?.name ?? 'uv' };
  } else {
    const f = fns.find((x) => x.name === 'main');
    if (f) entryTarget = { fnIdx: fns.indexOf(f), kind: 'standard' };
  }
  if (!entryTarget) return { source, ops, skipped: ['Entry point not found.'] };

  const resIdent = format === 'standard' ? findIdent(tokens, RES_IDENTS) : 'iResolution';
  if (coordKinds.length) {
    if (!resIdent) {
      skipped.push('Coordinate transforms need a resolution uniform (iResolution, u_resolution or resolution).');
    } else {
      const lines = buildCoordOps(coordKinds, rng, s, timeExpr, ops);
      helpers += `\nvec2 sf_xform(vec2 p) {\n  vec2 sf_R = ${resIdent}.xy;\n  vec2 q = (p - 0.5 * sf_R) / sf_R.y;\n  ${lines.join('\n  ')}\n  return q * sf_R.y + 0.5 * sf_R;\n}\n`;
      if (entryTarget.kind === 'shadertoy') {
        entryPrelude = `\n  ${entryTarget.param} = sf_xform(${entryTarget.param});`;
      } else if (entryTarget.kind === 'gltransition') {
        entryPrelude = `\n  ${entryTarget.param} = sf_xform(${entryTarget.param} * iResolution.xy) / iResolution.xy;`;
      } else {
        helpers = `\nvec4 sf_FragCoord;\n` + helpers;
        for (let i = 0; i < tokens.length; i++) if (tokens[i].type === 'ident' && tokens[i].text === 'gl_FragCoord') replace.set(i, 'sf_FragCoord');
        entryPrelude = '\n  sf_FragCoord = vec4(sf_xform(gl_FragCoord.xy), gl_FragCoord.zw);';
      }
    }
  }

  if (want.includes('fn-substitute')) {
    const candidates: { idx: number; to: string; from: string }[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type !== 'ident' || (t.text !== 'fract' && t.text !== 'sin')) continue;
      const n = nextSignificant(tokens, i + 1);
      const p = prevSignificant(tokens, i - 1);
      if (n < 0 || tokens[n].text !== '(' || (p >= 0 && tokens[p].text === '.')) continue;
      candidates.push({ idx: i, from: t.text, to: t.text === 'fract' ? rng.pick(['sf_tri', 'sf_sfract']) : 'sf_tsin' });
    }
    const chosen = candidates.filter(() => rng.chance(0.25 + 0.5 * s)).slice(0, 6);
    if (chosen.length) {
      helpers = SUBST_HELPERS + helpers;
      for (const c of chosen) {
        replace.set(c.idx, c.to);
        ops.push({ level: 3, kind: 'fn-substitute', description: `L${tokens[c.idx].line}: ${c.from}() → ${c.to}()`, from: c.from, to: c.to });
      }
    } else skipped.push('No fract()/sin() calls to substitute.');
  }

  const wantColor = want.includes('color');
  const wantBlend = want.includes('blend');
  let colorCode = '';
  if (wantColor) colorCode = buildColorOp(rng, s, ops);

  // Re-emit source with replacements and the entry prelude.
  const entry = fns[entryTarget.fnIdx];
  let out = '';
  const firstFn = fns.reduce((a, b) => (a.nameIdx < b.nameIdx ? a : b));
  // Insert helpers right before the first function's return type.
  let helperAt = prevSignificant(tokens, firstFn.nameIdx - 1);
  while (helperAt > 0 && tokens[helperAt - 1].type !== 'newline') helperAt--;
  for (let i = 0; i < tokens.length; i++) {
    if (i === helperAt && helpers) out += `// ---- Shader Forge structural mutation helpers ----${helpers}// ----\n`;
    out += replace.get(i) ?? tokens[i].text;
    if (i === entry.bodyOpen && entryPrelude) out += entryPrelude;
  }

  if (wantColor || wantBlend) {
    tokens = tokenize(out);
    const fns2 = findFunctions(tokens);
    const name = entryTarget.kind === 'shadertoy' ? 'mainImage' : entryTarget.kind === 'gltransition' ? 'transition' : 'main';
    const e2 = fns2.find((f) => f.name === name);
    if (e2) {
      const renamed = `sf_${name}0`;
      tokens[e2.nameIdx] = { ...tokens[e2.nameIdx], text: renamed };
      let wrapper = '';
      if (wantBlend) ops.push({ level: 3, kind: 'blend', description: 'Blend with horizontally mirrored self (50%)' });
      if (entryTarget.kind === 'shadertoy') {
        const blend = wantBlend
          ? `  vec4 sf_b; ${renamed}(sf_b, vec2(iResolution.x - fragCoord.x, fragCoord.y));\n  fragColor = mix(fragColor, sf_b, 0.5);\n`
          : '';
        wrapper = `\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  ${renamed}(fragColor, fragCoord);\n${blend}  vec3 c = fragColor.rgb;\n  ${colorCode}\n  fragColor.rgb = c;\n}\n`;
      } else if (entryTarget.kind === 'gltransition') {
        const blend = wantBlend ? `  r = mix(r, ${renamed}(vec2(1.0 - uv.x, uv.y)), 0.5);\n` : '';
        wrapper = `\nvec4 transition(vec2 uv) {\n  vec4 r = ${renamed}(uv);\n${blend}  vec3 c = r.rgb;\n  ${colorCode}\n  return vec4(c, r.a);\n}\n`;
      } else {
        const outVar = /\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)\s*;/.exec(out)?.[1] ?? 'gl_FragColor';
        if (wantBlend) skipped.push('Self-blend is only available for Shadertoy and GL Transition formats.');
        wrapper = colorCode ? `\nvoid main() {\n  ${renamed}();\n  vec3 c = ${outVar}.rgb;\n  ${colorCode}\n  ${outVar}.rgb = c;\n}\n` : '';
        if (!colorCode) tokens[e2.nameIdx] = { ...tokens[e2.nameIdx], text: name };
      }
      out = tokens.map((t) => t.text).join('') + wrapper;
    }
  }

  return { source: out, ops, skipped };
}
