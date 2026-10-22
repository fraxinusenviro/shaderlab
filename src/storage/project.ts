/**
 * Project construction, validation of untrusted imported data, and
 * serialisation to JSON / ZIP archives.
 */
import JSZip from 'jszip';
import { detectFormat } from '../glsl/adapter';
import { deriveParams, mergeParams } from '../params/parse';
import {
  SCHEMA_VERSION,
  type Asset,
  type ChannelBinding,
  type Collection,
  type Folder,
  type PresetDef,
  type Provenance,
  type ShaderFormat,
  type ShaderProject,
} from '../types/shader';

export const MAX_SOURCE_BYTES = 512 * 1024;
export const PROJECT_FILE_KIND = 'shader-forge-project';
export const LIBRARY_FILE_KIND = 'shader-forge-library';

export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + r;
}

export const defaultChannels = (): ChannelBinding[] =>
  Array.from({ length: 4 }, () => ({ assetId: null, filter: 'linear', wrap: 'repeat' }) as ChannelBinding);

export interface NewProjectInput {
  name: string;
  fragment: string;
  format?: ShaderFormat;
  vertex?: string;
  description?: string;
  tags?: string[];
  category?: string;
  provenance?: Provenance;
  channels?: ChannelBinding[];
}

export function createProject(input: NewProjectInput): ShaderProject {
  const now = Date.now();
  const params = deriveParams(input.fragment, input.format ?? 'auto');
  const { values } = mergeParams(params, [], {});
  return {
    id: uid('p_'),
    schemaVersion: SCHEMA_VERSION,
    name: input.name,
    description: input.description ?? '',
    tags: input.tags ?? [],
    category: input.category ?? 'Uncategorised',
    notes: '',
    format: input.format ?? 'auto',
    fragment: input.fragment,
    vertex: input.vertex,
    original: { fragment: input.fragment, vertex: input.vertex },
    params,
    values,
    locked: [],
    modulations: {},
    channels: input.channels ?? defaultChannels(),
    provenance: input.provenance ?? { kind: 'user' },
    history: [],
    revisions: [],
    favorite: false,
    folderId: null,
    collectionIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function projectFromPreset(preset: PresetDef): ShaderProject {
  const p = createProject({
    name: preset.name,
    fragment: preset.fragment,
    format: preset.format,
    description: preset.description,
    tags: preset.tags,
    category: preset.category,
    channels: preset.channels ? [...preset.channels, ...defaultChannels()].slice(0, 4) : undefined,
    provenance: {
      kind: 'preset',
      presetId: preset.id,
      author: preset.author,
      license: preset.license,
      sourceUrl: preset.sourceUrl,
      notice: preset.notice,
    },
  });
  p.id = `preset:${preset.id}`;
  p.modulations = structuredClone(preset.modulations ?? {});
  return p;
}

export function isPresetId(id: string): boolean {
  return id.startsWith('preset:');
}

/** Deep copy as a new user-owned project (Save As / duplicate / save variant). */
export function forkProject(p: ShaderProject, name: string, kind: Provenance['kind'] = 'user'): ShaderProject {
  const copy = structuredClone(p);
  const now = Date.now();
  copy.id = uid('p_');
  copy.name = name;
  copy.createdAt = now;
  copy.updatedAt = now;
  copy.favorite = false;
  copy.provenance = { ...p.provenance, kind: p.provenance.kind === 'preset' ? 'preset' : kind, parentId: p.id };
  if (kind === 'mutation') copy.provenance.kind = 'mutation';
  return copy;
}

// ---------------------------------------------------------------- validation

const str = (v: unknown, d = '', max = 10_000): string => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const FORMATS: ShaderFormat[] = ['auto', 'shadertoy', 'standard', 'gltransition'];

export class ImportError extends Error {}

/**
 * Validate and normalise an untrusted project object. Unknown fields are
 * dropped; sizes are bounded. Source code is kept as plain strings only.
 */
export function normalizeProject(raw: unknown): ShaderProject {
  if (!raw || typeof raw !== 'object') throw new ImportError('Project data is not an object.');
  const r = raw as Record<string, unknown>;
  const fragment = str(r.fragment, '', MAX_SOURCE_BYTES);
  if (!fragment.trim()) throw new ImportError('Project has no fragment shader source.');
  const base = createProject({ name: str(r.name, 'Imported shader', 200), fragment });
  const vertex = typeof r.vertex === 'string' ? r.vertex.slice(0, MAX_SOURCE_BYTES) : undefined;
  const format = FORMATS.includes(r.format as ShaderFormat) ? (r.format as ShaderFormat) : 'auto';
  const rawOriginal = (r.original ?? {}) as Record<string, unknown>;
  const prov = (r.provenance ?? {}) as Record<string, unknown>;
  const kinds = ['preset', 'user', 'import', 'mutation'];
  // Re-derive params from source, then layer stored overrides/values on top.
  const storedParams = arr<Record<string, unknown>>(r.params).filter((p) => p && typeof p.name === 'string');
  const parsed = deriveParams(fragment, format);
  const params = parsed.map((p) => {
    const s = storedParams.find((x) => x.name === p.name && x.type === p.type);
    if (!s || !s.userOverridden) return p;
    return { ...p, min: num(s.min, p.min), max: num(s.max, p.max), step: num(s.step, p.step), label: str(s.label, p.label, 200), group: str(s.group, p.group, 100), userOverridden: true };
  });
  const values = mergeParams(params, params, (r.values ?? {}) as ShaderProject['values']).values;

  const project: ShaderProject = {
    ...base,
    id: typeof r.id === 'string' && /^[\w:.-]{1,100}$/.test(r.id) ? r.id : base.id,
    schemaVersion: SCHEMA_VERSION,
    description: str(r.description, '', 5000),
    tags: arr<unknown>(r.tags).filter((t): t is string => typeof t === 'string').slice(0, 50).map((t) => t.slice(0, 50)),
    category: str(r.category, 'Uncategorised', 100),
    notes: str(r.notes, '', 50_000),
    format,
    vertex,
    original: { fragment: str(rawOriginal.fragment, fragment, MAX_SOURCE_BYTES), vertex: typeof rawOriginal.vertex === 'string' ? rawOriginal.vertex : vertex },
    params,
    values,
    locked: arr<unknown>(r.locked).filter((x): x is string => typeof x === 'string'),
    modulations: sanitizeModulations(r.modulations),
    channels: sanitizeChannels(r.channels),
    provenance: {
      kind: (kinds.includes(prov.kind as string) ? prov.kind : 'import') as Provenance['kind'],
      presetId: typeof prov.presetId === 'string' ? prov.presetId : undefined,
      parentId: typeof prov.parentId === 'string' ? prov.parentId : undefined,
      author: typeof prov.author === 'string' ? prov.author.slice(0, 200) : undefined,
      license: typeof prov.license === 'string' ? prov.license.slice(0, 200) : undefined,
      sourceUrl: typeof prov.sourceUrl === 'string' && /^https?:\/\//.test(prov.sourceUrl) ? prov.sourceUrl.slice(0, 500) : undefined,
      notice: typeof prov.notice === 'string' ? prov.notice.slice(0, 5000) : undefined,
      importedFrom: typeof prov.importedFrom === 'string' ? prov.importedFrom.slice(0, 300) : undefined,
      importedAt: typeof prov.importedAt === 'number' ? prov.importedAt : undefined,
    },
    history: arr<Record<string, unknown>>(r.history)
      .filter((h) => h && typeof h.fragment === 'string' && typeof h.id === 'string')
      .slice(0, 500)
      .map((h) => ({
        id: h.id as string,
        parentId: typeof h.parentId === 'string' ? h.parentId : null,
        name: str(h.name, 'Variant', 200),
        createdAt: num(h.createdAt, Date.now()),
        seed: num(h.seed),
        strength: num(h.strength),
        level: ([0, 1, 2, 3].includes(h.level as number) ? h.level : 0) as 0 | 1 | 2 | 3,
        ops: arr<Record<string, unknown>>(h.ops).slice(0, 200).map((o) => ({
          level: ([1, 2, 3].includes(o.level as number) ? o.level : 1) as 1 | 2 | 3,
          kind: str(o.kind, 'op', 50),
          description: str(o.description, '', 500),
          target: typeof o.target === 'string' ? o.target : undefined,
          from: typeof o.from === 'string' ? o.from : undefined,
          to: typeof o.to === 'string' ? o.to : undefined,
        })),
        fragment: str(h.fragment, '', MAX_SOURCE_BYTES),
        values: (h.values && typeof h.values === 'object' ? h.values : {}) as ShaderProject['values'],
        params: Array.isArray(h.params) ? (h.params as ShaderProject['params']) : deriveParams(h.fragment as string, format),
        valid: h.valid !== false,
        error: typeof h.error === 'string' ? h.error : undefined,
        favorite: h.favorite === true,
        thumbnail: typeof h.thumbnail === 'string' && h.thumbnail.startsWith('data:image/') ? h.thumbnail : undefined,
      })),
    revisions: arr<Record<string, unknown>>(r.revisions)
      .filter((v) => v && typeof v.fragment === 'string')
      .slice(0, 200)
      .map((v) => ({
        id: str(v.id, uid('r_'), 100),
        createdAt: num(v.createdAt, Date.now()),
        label: str(v.label, 'Revision', 200),
        fragment: str(v.fragment, '', MAX_SOURCE_BYTES),
        vertex: typeof v.vertex === 'string' ? v.vertex : undefined,
        values: (v.values && typeof v.values === 'object' ? v.values : {}) as ShaderProject['values'],
      })),
    thumbnail: typeof r.thumbnail === 'string' && r.thumbnail.startsWith('data:image/') && r.thumbnail.length < 2_000_000 ? r.thumbnail : undefined,
    favorite: r.favorite === true,
    folderId: typeof r.folderId === 'string' ? r.folderId : null,
    collectionIds: arr<unknown>(r.collectionIds).filter((x): x is string => typeof x === 'string'),
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
  };
  return project;
}

function sanitizeModulations(raw: unknown): ShaderProject['modulations'] {
  const out: ShaderProject['modulations'] = {};
  if (!raw || typeof raw !== 'object') return out;
  const kinds = ['constant', 'sine', 'triangle', 'saw', 'square', 'random', 'noise', 'keyframes', 'expression', 'link'];
  for (const [k, v] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!v || typeof v !== 'object' || !kinds.includes(v.kind as string)) continue;
    out[k] = {
      kind: v.kind as ShaderProject['modulations'][string]['kind'],
      enabled: v.enabled !== false,
      rate: num(v.rate, 0.25),
      depth: num(v.depth, 0.5),
      phase: num(v.phase, 0),
      duration: num(v.duration, 4),
      keyframes: arr<Record<string, unknown>>(v.keyframes).map((kf) => ({ t: num(kf.t), v: num(kf.v), ease: (['linear', 'smooth', 'step'].includes(kf.ease as string) ? kf.ease : 'smooth') as 'smooth' })),
      expression: typeof v.expression === 'string' ? v.expression.slice(0, 500) : undefined,
      source: typeof v.source === 'string' ? v.source : undefined,
      seed: num(v.seed, 1),
    };
  }
  return out;
}

function sanitizeChannels(raw: unknown): ChannelBinding[] {
  const list = arr<Record<string, unknown>>(raw);
  return defaultChannels().map((d, i) => {
    const c = list[i];
    if (!c || typeof c !== 'object') return d;
    return {
      assetId: typeof c.assetId === 'string' ? c.assetId : null,
      filter: c.filter === 'nearest' ? 'nearest' : 'linear',
      wrap: c.wrap === 'clamp' ? 'clamp' : c.wrap === 'mirror' ? 'mirror' : 'repeat',
    };
  });
}

// ---------------------------------------------------------------- serialise

export function projectToJSON(p: ShaderProject): string {
  return JSON.stringify({ kind: PROJECT_FILE_KIND, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), project: p }, null, 2);
}

export function attributionText(p: ShaderProject): string {
  const pv = p.provenance;
  const lines = [`Shader: ${p.name}`, `Origin: ${pv.kind}`];
  if (pv.author) lines.push(`Author: ${pv.author}`);
  if (pv.license) lines.push(`License: ${pv.license}`);
  if (pv.sourceUrl) lines.push(`Source: ${pv.sourceUrl}`);
  if (pv.notice) lines.push('', pv.notice);
  lines.push('', 'Exported from Shader Forge.');
  return lines.join('\n') + '\n';
}

const extFor = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'bin');

function dataUrlToBytes(d: string): Uint8Array | null {
  const m = /^data:[^;]+;base64,(.*)$/.exec(d);
  if (!m) return null;
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function projectToZip(p: ShaderProject, assets: Asset[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('project.json', projectToJSON(p));
  zip.file(p.format === 'shadertoy' ? 'shader.glsl' : 'shader.frag', p.fragment);
  if (p.vertex) zip.file('shader.vert', p.vertex);
  zip.file('original.frag', p.original.fragment);
  zip.file('ATTRIBUTION.txt', attributionText(p));
  zip.file('parameters.json', JSON.stringify({ params: p.params, values: p.values, modulations: p.modulations, locked: p.locked }, null, 2));
  if (p.history.length) zip.file('mutations.json', JSON.stringify(p.history.map(({ thumbnail: _t, ...h }) => h), null, 2));
  if (p.thumbnail) {
    const bytes = dataUrlToBytes(p.thumbnail);
    if (bytes) zip.file('thumbnail.' + (p.thumbnail.startsWith('data:image/png') ? 'png' : 'webp'), bytes);
  }
  for (const a of assets) zip.file(`assets/${a.id}.${extFor(a.mime)}`, a.blob);
  zip.file('assets/index.json', JSON.stringify(assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, file: `${a.id}.${extFor(a.mime)}` })), null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export interface LibraryBackup {
  projects: ShaderProject[];
  folders: Folder[];
  collections: Collection[];
  assets: Asset[];
}

export async function libraryToZip(lib: LibraryBackup): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'library.json',
    JSON.stringify(
      { kind: LIBRARY_FILE_KIND, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), folders: lib.folders, collections: lib.collections, projects: lib.projects.map((p) => p.id) },
      null,
      2,
    ),
  );
  for (const p of lib.projects) zip.file(`projects/${p.id.replace(/[^\w.-]/g, '_')}.json`, projectToJSON(p));
  for (const a of lib.assets) zip.file(`assets/${a.id}.${extFor(a.mime)}`, a.blob);
  zip.file('assets/index.json', JSON.stringify(lib.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, file: `${a.id}.${extFor(a.mime)}` })), null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

// ---------------------------------------------------------------- import

export interface ImportResult {
  projects: ShaderProject[];
  folders: Folder[];
  collections: Collection[];
  assets: Asset[];
  kind: 'shader' | 'project' | 'library';
  warnings: string[];
}

const empty = (kind: ImportResult['kind']): ImportResult => ({ projects: [], folders: [], collections: [], assets: [], kind, warnings: [] });

function looksBinary(text: string): boolean {
  // NUL bytes or a high share of control characters → not GLSL text.
  // eslint-disable-next-line no-control-regex
  const ctrl = (text.slice(0, 4000).match(/[\u0000-\u0008\u000e-\u001f]/g) ?? []).length;
  return ctrl > 4;
}

export function shaderFromText(name: string, text: string, vertex?: string): ShaderProject {
  if (text.length > MAX_SOURCE_BYTES) throw new ImportError(`${name} is larger than ${MAX_SOURCE_BYTES / 1024} KB.`);
  if (looksBinary(text)) throw new ImportError(`${name} does not look like GLSL text.`);
  const format = detectFormat(text);
  return createProject({
    name: name.replace(/\.(glsl|frag|fs|vert|vs|txt)$/i, '') || 'Imported shader',
    fragment: text,
    vertex,
    format: 'auto',
    category: 'Imported',
    tags: ['imported', format],
    provenance: { kind: 'import', importedFrom: name, importedAt: Date.now() },
  });
}

function parseJSONProjectFile(text: string, name: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError(`${name} is not valid JSON.`);
  }
  const d = data as Record<string, unknown>;
  if (d && d.kind === PROJECT_FILE_KIND) {
    const r = empty('project');
    r.projects.push(normalizeProject(d.project));
    return r;
  }
  if (d && typeof d.fragment === 'string') {
    const r = empty('project');
    r.projects.push(normalizeProject(d));
    return r;
  }
  throw new ImportError(`${name} is not a Shader Forge project file.`);
}

async function importZip(file: Blob, name: string): Promise<ImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportError(`${name} is not a readable ZIP archive.`);
  }
  const readAssets = async (prefix: string): Promise<Asset[]> => {
    const idx = zip.file(`${prefix}assets/index.json`);
    if (!idx) return [];
    const list = JSON.parse(await idx.async('string')) as { id: string; name: string; mime: string; file: string }[];
    const out: Asset[] = [];
    for (const a of list.slice(0, 64)) {
      const f = zip.file(`${prefix}assets/${a.file}`);
      if (!f || !/^image\//.test(a.mime)) continue;
      out.push({ id: String(a.id), name: String(a.name).slice(0, 200), mime: a.mime, blob: new Blob([await f.async('arraybuffer')], { type: a.mime }), createdAt: Date.now() });
    }
    return out;
  };
  const lib = zip.file('library.json');
  if (lib) {
    const meta = JSON.parse(await lib.async('string')) as Record<string, unknown>;
    if (meta.kind !== LIBRARY_FILE_KIND) throw new ImportError('Unrecognised library archive.');
    const r = empty('library');
    r.folders = arr<Folder>(meta.folders).filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string');
    r.collections = arr<Collection>(meta.collections).filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string');
    const files = zip.file(/^projects\/.*\.json$/);
    for (const f of files) {
      try {
        r.projects.push(...parseJSONProjectFile(await f.async('string'), f.name).projects);
      } catch (e) {
        r.warnings.push(`${f.name}: ${(e as Error).message}`);
      }
    }
    r.assets = await readAssets('');
    return r;
  }
  const pj = zip.file('project.json');
  if (pj) {
    const r = parseJSONProjectFile(await pj.async('string'), name);
    r.assets = await readAssets('');
    return r;
  }
  const glsl = zip.file(/\.(glsl|frag|fs)$/i);
  if (glsl.length) {
    const r = empty('shader');
    for (const f of glsl.slice(0, 50)) r.projects.push(shaderFromText(f.name.split('/').pop()!, await f.async('string')));
    return r;
  }
  throw new ImportError(`${name} contains no Shader Forge project or GLSL files.`);
}

/** Import a set of user-selected files. Never executes their content. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const result = empty('shader');
  const byBase = new Map<string, { frag?: File; vert?: File }>();
  for (const f of files) {
    const lower = f.name.toLowerCase();
    try {
      if (lower.endsWith('.zip')) {
        const r = await importZip(f, f.name);
        merge(result, r);
      } else if (lower.endsWith('.json')) {
        merge(result, parseJSONProjectFile(await f.text(), f.name));
      } else if (/\.(glsl|frag|fs|txt|vert|vs)$/.test(lower)) {
        const base = lower.replace(/\.[^.]+$/, '');
        const entry = byBase.get(base) ?? {};
        if (/\.(vert|vs)$/.test(lower)) entry.vert = f;
        else entry.frag = f;
        byBase.set(base, entry);
      } else {
        result.warnings.push(`${f.name}: unsupported file type.`);
      }
    } catch (e) {
      result.warnings.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  for (const { frag, vert } of byBase.values()) {
    try {
      if (frag) {
        result.projects.push(shaderFromText(frag.name, await frag.text(), vert ? await vert.text() : undefined));
      } else if (vert) {
        const p = shaderFromText(vert.name, DEFAULT_STANDARD_FRAGMENT, await vert.text());
        p.format = 'standard';
        result.projects.push(p);
        result.warnings.push(`${vert.name}: imported as a vertex shader with a default fragment shader.`);
      }
    } catch (e) {
      result.warnings.push(`${(frag ?? vert)!.name}: ${(e as Error).message}`);
    }
  }
  return result;
}

function merge(into: ImportResult, r: ImportResult) {
  into.projects.push(...r.projects);
  into.folders.push(...r.folders);
  into.collections.push(...r.collections);
  into.assets.push(...r.assets);
  into.warnings.push(...r.warnings);
  if (r.kind === 'library') into.kind = 'library';
  else if (r.kind === 'project' && into.kind !== 'library') into.kind = 'project';
}

export const DEFAULT_STANDARD_FRAGMENT = `precision highp float;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}
`;
