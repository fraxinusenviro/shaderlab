/**
 * Uniform discovery and UI annotation parsing.
 *
 *   uniform float uFreq; // @param min=0 max=20 step=0.1 default=5 label="Frequency" group=Shape
 *   // @param widget=color
 *   uniform vec3 uTint;
 *   uniform float amplitude; // = 100.0          (GL Transitions default syntax)
 *
 * Every non-builtin float/int/bool/vecN uniform becomes a ParamDef. The
 * annotation is optional; sensible ranges are inferred from the name.
 */
import { BUILTIN_UNIFORMS, detectFormat } from '../glsl/adapter';
import type { ParamDef, ParamOption, ParamType, ParamValue, ParamWidget, ShaderFormat } from '../types/shader';

const SUPPORTED: ParamType[] = ['float', 'int', 'bool', 'vec2', 'vec3', 'vec4'];
const WIDGETS: ParamWidget[] = ['slider', 'number', 'toggle', 'select', 'color', 'vector', 'xy', 'angle', 'seed'];

export function componentCount(type: ParamType): number {
  return type === 'vec2' ? 2 : type === 'vec3' ? 3 : type === 'vec4' ? 4 : 1;
}

/** Parse `key=value key="quoted value"` pairs. */
export function parseAnnotation(text: string): { attrs: Record<string, string>; free: string } {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*("([^"]*)"|'([^']*)'|[^\s]+)/g;
  let m: RegExpExecArray | null;
  let consumed = text;
  while ((m = re.exec(text))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[2];
    consumed = consumed.replace(m[0], '');
  }
  return { attrs, free: consumed.trim() };
}

function humanize(name: string): string {
  const base = name.replace(/^(u_|u(?=[A-Z])|i(?=[A-Z]))/, '');
  return base
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function parseNumberList(s: string): number[] {
  return s
    .replace(/^(vec\d)?\(|\)$/g, '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function parseOptions(s: string): ParamOption[] {
  return s.split(',').map((part, i) => {
    const [label, v] = part.split(':');
    return { label: label.trim(), value: v !== undefined ? Number(v) : i };
  });
}

export function defaultValueFor(type: ParamType, fallback = 0): ParamValue {
  if (type === 'bool') return false;
  const n = componentCount(type);
  if (n === 1) return fallback;
  return Array.from({ length: n }, () => fallback);
}

interface Inferred {
  min: number;
  max: number;
  step: number;
  def: number;
  widget: ParamWidget;
  group: string;
}

function infer(name: string, type: ParamType): Inferred {
  const n = name.toLowerCase();
  if (type === 'bool') return { min: 0, max: 1, step: 1, def: 0, widget: 'toggle', group: 'Switches' };
  if (/seed/.test(n)) return { min: 0, max: 1000, step: 1, def: 1, widget: 'seed', group: 'Random' };
  if ((type === 'vec3' || type === 'vec4') && /col|colour|tint|hue|palette|bg|fg|light/.test(n)) {
    return { min: 0, max: 1, step: 0.001, def: 0.5, widget: 'color', group: 'Color' };
  }
  if (type === 'vec2') {
    if (/center|centre|offset|pos|origin|pan|dir/.test(n)) return { min: -1, max: 1, step: 0.001, def: 0, widget: 'xy', group: 'Transform' };
    return { min: 0, max: 1, step: 0.001, def: 0.5, widget: 'xy', group: 'Transform' };
  }
  if (type === 'vec3' || type === 'vec4') return { min: 0, max: 1, step: 0.001, def: 0.5, widget: 'vector', group: 'Vectors' };
  if (/angle|rot|theta|phase/.test(n)) return { min: 0, max: 6.2832, step: 0.001, def: 0, widget: 'angle', group: 'Transform' };
  if (/speed|rate/.test(n)) return { min: 0, max: 4, step: 0.01, def: 1, widget: 'slider', group: 'Animation' };
  if (/freq|scale|zoom|repeat|tile|count|iter|octave|steps/.test(n)) {
    return { min: type === 'int' ? 1 : 0, max: type === 'int' ? 16 : 10, step: type === 'int' ? 1 : 0.01, def: type === 'int' ? 4 : 1, widget: 'slider', group: 'Shape' };
  }
  if (/amp|strength|intensity|amount|warp|distort|gain/.test(n)) return { min: 0, max: 2, step: 0.001, def: 0.5, widget: 'slider', group: 'Shape' };
  if (type === 'int') return { min: 0, max: 10, step: 1, def: 1, widget: 'slider', group: 'Parameters' };
  return { min: 0, max: 1, step: 0.001, def: 0.5, widget: 'slider', group: 'Parameters' };
}

function buildDef(name: string, type: ParamType, annotation: string | null, glTransitionDefault: string | null): ParamDef {
  const inf = infer(name, type);
  const { attrs, free } = annotation !== null ? parseAnnotation(annotation) : { attrs: {} as Record<string, string>, free: '' };
  const num = (k: string, d: number) => (attrs[k] !== undefined && Number.isFinite(Number(attrs[k])) ? Number(attrs[k]) : d);

  let widget = (attrs.widget ?? attrs.ui) as ParamWidget | undefined;
  if (!widget || !WIDGETS.includes(widget)) widget = inf.widget;
  if (attrs.options && componentCount(type) === 1 && type !== 'bool') widget = 'select';
  if (type === 'bool') widget = 'toggle';

  let defValue: ParamValue;
  const rawDefault = attrs.default ?? attrs.value ?? glTransitionDefault ?? undefined;
  if (type === 'bool') {
    defValue = rawDefault !== undefined ? /^(true|1|on|yes)$/i.test(rawDefault.trim()) : false;
  } else if (componentCount(type) === 1) {
    const d = rawDefault !== undefined ? parseNumberList(rawDefault)[0] : undefined;
    defValue = d ?? inf.def;
  } else {
    const list = rawDefault !== undefined ? parseNumberList(rawDefault) : [];
    const n = componentCount(type);
    const filled = list.length === 1 ? Array(n).fill(list[0]) : list;
    defValue = Array.from({ length: n }, (_, i) => filled[i] ?? (type === 'vec4' && i === 3 && widget === 'color' ? 1 : inf.def));
  }

  let min = num('min', inf.min);
  let max = num('max', inf.max);
  // Expand inferred ranges to contain the declared default.
  if (attrs.min === undefined || attrs.max === undefined) {
    const vals = typeof defValue === 'number' ? [defValue] : Array.isArray(defValue) ? defValue : [];
    for (const v of vals) {
      if (attrs.max === undefined && v > max) max = v <= 0 ? 1 : v * 2;
      if (attrs.min === undefined && v < min) min = v >= 0 ? 0 : v * 2;
    }
  }
  if (min > max) [min, max] = [max, min];
  const step = num('step', type === 'int' ? 1 : inf.step);
  const options = attrs.options ? parseOptions(attrs.options) : undefined;

  return {
    name,
    type,
    label: attrs.label ?? humanize(name),
    widget,
    min,
    max,
    step: step > 0 ? step : type === 'int' ? 1 : 0.001,
    default: defValue,
    group: attrs.group ?? inf.group,
    options,
    description: attrs.description ?? attrs.desc ?? (free || undefined),
  };
}

const UNIFORM_RE = /^\s*uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+([^;]+);(.*)$/;

/**
 * Scans the source line-by-line. Annotations come from a trailing `// @param`
 * comment on the declaration line, or a `// @param` comment on the line
 * directly above it.
 */
export function parseParams(source: string): ParamDef[] {
  const lines = source.split('\n');
  const defs: ParamDef[] = [];
  const seen = new Set<string>();
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    if (/^\s*\/\*/.test(line) && !line.includes('*/')) {
      inBlockComment = true;
      continue;
    }
    const m = UNIFORM_RE.exec(line);
    if (!m) continue;
    const type = m[1] as ParamType;
    if (!SUPPORTED.includes(type)) continue;
    const trailing = m[3];
    let annotation: string | null = null;
    let gltDefault: string | null = null;
    const tm = /\/\/\s*@(?:param|ui)\b(.*)$/.exec(trailing);
    if (tm) annotation = tm[1];
    else {
      const gm = /\/\/\s*=\s*([^/]+)/.exec(trailing);
      if (gm) gltDefault = gm[1].trim();
    }
    if (annotation === null && i > 0) {
      const pm = /^\s*\/\/\s*@(?:param|ui)\b(.*)$/.exec(lines[i - 1]);
      if (pm) annotation = pm[1];
    }
    for (const rawName of m[2].split(',')) {
      const name = rawName.trim();
      if (!/^\w+$/.test(name)) continue; // arrays and initialisers are not exposed
      if (BUILTIN_UNIFORMS.has(name) || seen.has(name)) continue;
      seen.add(name);
      const def = buildDef(name, type, annotation, gltDefault);
      const promoted = /promoted="([^"]*)"/.exec(annotation ?? '');
      if (promoted) def.promoted = { literal: promoted[1], line: i + 1 };
      defs.push(def);
    }
  }
  return defs;
}

/**
 * parseParams plus format-specific synthetic parameters: GL Transitions get
 * a "progress" control even though the wrapper, not the user, declares it.
 */
export function deriveParams(source: string, format: ShaderFormat): ParamDef[] {
  const defs = parseParams(source);
  const resolved = format === 'auto' ? detectFormat(source) : format;
  if (resolved === 'gltransition' && !defs.some((d) => d.name === 'progress')) {
    defs.unshift({
      name: 'progress',
      type: 'float',
      label: 'Progress',
      widget: 'slider',
      min: 0,
      max: 1,
      step: 0.001,
      default: 0.5,
      group: 'Transition',
      description: 'Transition progress: 0 shows iChannel0 (from), 1 shows iChannel1 (to).',
    });
  }
  return defs;
}

export function valuesEqualType(def: ParamDef, v: ParamValue | undefined): boolean {
  if (v === undefined) return false;
  if (def.type === 'bool') return typeof v === 'boolean';
  const n = componentCount(def.type);
  if (n === 1) return typeof v === 'number' && Number.isFinite(v);
  return Array.isArray(v) && v.length === n && v.every((x) => Number.isFinite(x));
}

export function cloneValue(v: ParamValue): ParamValue {
  return Array.isArray(v) ? [...v] : v;
}

/**
 * Merge freshly parsed definitions with the previous set: user-overridden
 * ranges survive, values are preserved where the type still matches.
 */
export function mergeParams(
  parsed: ParamDef[],
  prevDefs: ParamDef[],
  prevValues: Record<string, ParamValue>,
): { params: ParamDef[]; values: Record<string, ParamValue> } {
  const prevByName = new Map(prevDefs.map((d) => [d.name, d]));
  const params = parsed.map((p) => {
    const old = prevByName.get(p.name);
    if (old && old.type === p.type && old.userOverridden) {
      return { ...p, min: old.min, max: old.max, step: old.step, default: old.default, label: old.label, widget: old.widget, group: old.group, userOverridden: true };
    }
    return p;
  });
  const values: Record<string, ParamValue> = {};
  for (const p of params) {
    const v = prevValues[p.name];
    values[p.name] = valuesEqualType(p, v) ? cloneValue(v) : cloneValue(p.default);
  }
  return { params, values };
}

export function clampToDef(def: ParamDef, v: number): number {
  let x = Math.min(def.max, Math.max(def.min, v));
  if (def.type === 'int' || def.widget === 'seed') x = Math.round(x);
  return x;
}

/** Serialise a value as a GLSL literal of the parameter's type. */
export function glslLiteral(def: ParamDef, v: ParamValue): string {
  const f = (x: number) => {
    const s = Number(x.toPrecision(6)).toString();
    return /[.e]/.test(s) ? s : s + '.0';
  };
  if (def.type === 'bool') return v ? 'true' : 'false';
  if (def.type === 'int') return String(Math.round(v as number));
  if (def.type === 'float') return f(v as number);
  return `${def.type}(${(v as number[]).map(f).join(', ')})`;
}
