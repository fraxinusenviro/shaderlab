// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../presets/catalog';
import { ShaderForgeDB, setDB } from '../storage/db';
import { createProject, forkProject, importFiles, libraryToZip, normalizeProject, projectFromPreset, projectToJSON, projectToZip, shaderFromText } from '../storage/project';
import { LocalRepository } from '../storage/repository';

setDB(new ShaderForgeDB(`test-${Math.random()}`));
const repo = new LocalRepository();

function richProject() {
  const p = createProject({ name: 'Rich', fragment: 'uniform float uA; // @param min=0 max=4 default=1\nvoid mainImage(out vec4 c, in vec2 f){ c = vec4(uA); }', format: 'shadertoy' });
  p.values.uA = 2.5;
  p.params = p.params.map((d) => ({ ...d, max: 8, userOverridden: true }));
  p.modulations = { uA: { kind: 'sine', enabled: true, rate: 0.5, depth: 0.3, phase: 0.1 } };
  p.locked = ['uA'];
  p.tags = ['a', 'b'];
  p.provenance = { kind: 'preset', presetId: 'x', author: 'Someone', license: 'MIT', sourceUrl: 'https://example.com/x' };
  p.history = [
    { id: 'm_1', parentId: null, name: 'Original', createdAt: 1, seed: 0, strength: 0, level: 0, ops: [], fragment: p.fragment, values: { uA: 1 }, params: p.params, valid: true },
    { id: 'm_2', parentId: 'm_1', name: 'Mutation 1', createdAt: 2, seed: 99, strength: 0.4, level: 1, ops: [{ level: 1, kind: 'perturb', description: 'uA: 1 → 2.5', target: 'uA' }], fragment: p.fragment, values: { uA: 2.5 }, params: p.params, valid: true },
    { id: 'm_3', parentId: 'm_2', name: 'Broken', createdAt: 3, seed: 7, strength: 0.9, level: 2, ops: [], fragment: 'oops', values: {}, params: [], valid: false, error: 'syntax error' },
  ];
  return p;
}

const strip = (p: ReturnType<typeof richProject>) => ({ ...p, updatedAt: 0 });

describe('repository', () => {
  it('stores, lists, updates and deletes projects', async () => {
    const p = createProject({ name: 'One', fragment: 'void main(){ gl_FragColor = vec4(1.0); }' });
    await repo.put(p);
    expect((await repo.get(p.id))?.name).toBe('One');
    expect((await repo.listSummaries()).map((s) => s.id)).toContain(p.id);
    await repo.delete(p.id);
    expect(await repo.get(p.id)).toBeUndefined();
  });
  it('keeps a recoverable session record', async () => {
    const p = createProject({ name: 'Sess', fragment: 'void main(){}' });
    await repo.saveSession({ key: 'workspace', savedAt: 5, project: p, dirty: true });
    expect((await repo.loadSession())?.project.id).toBe(p.id);
  });
  it('deleting a folder keeps its shaders', async () => {
    const p = createProject({ name: 'In folder', fragment: 'void main(){}' });
    p.folderId = 'f1';
    await repo.putFolder({ id: 'f1', name: 'F', parentId: null, createdAt: 0 });
    await repo.put(p);
    await repo.deleteFolder('f1');
    expect((await repo.get(p.id))?.folderId).toBeNull();
  });
});

describe('project model', () => {
  it('presets become read-only working copies with provenance', () => {
    const p = projectFromPreset(PRESETS.find((x) => x.id === 'glt-ripple')!);
    expect(p.id).toBe('preset:glt-ripple');
    expect(p.provenance).toMatchObject({ kind: 'preset', license: 'MIT', author: 'gre' });
    expect(p.params[0].name).toBe('progress');
    expect(p.modulations.progress.kind).toBe('triangle');
    const fork = forkProject(p, 'Mine');
    expect(fork.id).not.toBe(p.id);
    expect(fork.provenance.parentId).toBe(p.id);
  });
  it('imports raw GLSL without modifying it', () => {
    const src = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0); }\n';
    const p = shaderFromText('thing.frag', src);
    expect(p.fragment).toBe(src);
    expect(p.original.fragment).toBe(src);
    expect(p.provenance.kind).toBe('import');
    expect(p.name).toBe('thing');
  });
  it('rejects binary and oversized input', () => {
    expect(() => shaderFromText('x.glsl', '\u0000\u0001\u0002\u0003\u0004\u0005abc')).toThrow();
    expect(() => shaderFromText('x.glsl', 'a'.repeat(600 * 1024))).toThrow();
  });
});

describe('export / import round trips', () => {
  it('JSON preserves parameters, provenance and mutation history', async () => {
    const p = richProject();
    const r = await importFiles([new File([projectToJSON(p)], 'rich.shaderforge.json', { type: 'application/json' })]);
    expect(r.kind).toBe('project');
    expect(strip(r.projects[0])).toMatchObject(strip(JSON.parse(JSON.stringify(p))));
  });
  it('normalisation drops unknown fields and unsafe URLs', () => {
    const p = normalizeProject({ ...richProject(), evil: '<script>', provenance: { kind: 'import', sourceUrl: 'javascript:alert(1)' } });
    expect((p as unknown as Record<string, unknown>).evil).toBeUndefined();
    expect(p.provenance.sourceUrl).toBeUndefined();
  });
  it('project ZIP round-trips with assets', async () => {
    const p = richProject();
    p.channels[0] = { assetId: 'a_1', filter: 'linear', wrap: 'repeat' };
    const asset = { id: 'a_1', name: 'img.png', mime: 'image/png', blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), createdAt: 0 };
    const zip = await projectToZip(p, [asset]);
    const r = await importFiles([new File([zip], 'rich.zip', { type: 'application/zip' })]);
    expect(r.projects).toHaveLength(1);
    expect(strip(r.projects[0])).toMatchObject(strip(JSON.parse(JSON.stringify(p))));
    expect(r.assets.map((a) => a.id)).toEqual(['a_1']);
  });
  it('library backup restores every project, folder and collection', async () => {
    const a = richProject();
    const b = createProject({ name: 'B', fragment: 'void main(){ gl_FragColor = vec4(0.0); }' });
    const zip = await libraryToZip({ projects: [a, b], folders: [{ id: 'f', name: 'F', parentId: null, createdAt: 0 }], collections: [{ id: 'c', name: 'C', color: '#fff', createdAt: 0 }], assets: [] });
    const r = await importFiles([new File([zip], 'backup.zip')]);
    expect(r.kind).toBe('library');
    expect(r.projects.map((p) => p.name).sort()).toEqual(['B', 'Rich']);
    expect(r.folders).toHaveLength(1);
    expect(r.collections).toHaveLength(1);
  });
  it('pairs .frag and .vert files by basename', async () => {
    const r = await importFiles([
      new File(['precision highp float; void main(){ gl_FragColor = vec4(1.0); }'], 'pair.frag'),
      new File(['attribute vec2 a_position; void main(){ gl_Position = vec4(a_position, 0.0, 1.0); }'], 'pair.vert'),
      new File(['hello'], 'notes.md'),
    ]);
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0].vertex).toContain('a_position');
    expect(r.warnings.some((w) => w.includes('notes.md'))).toBe(true);
  });
});
