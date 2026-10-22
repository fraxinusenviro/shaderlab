/**
 * Workspace store: the open project (working copy), compile state,
 * undo/redo, mutation-history tree and save/autosave orchestration.
 */
import { create } from 'zustand';
import type { Diagnostic } from '../glsl/adapter';
import { applyModulations } from '../modulation/modulate';
import { demoteConstant, promoteConstant, type ConstantCandidate } from '../params/constants';
import { cloneValue, deriveParams, mergeParams } from '../params/parse';
import { resolveChannel } from '../renderer/channels';
import type { CompileOutcome } from '../renderer/engine';
import { validateShader } from '../renderer/offscreen';
import { forkProject, isPresetId, uid } from '../storage/project';
import { repository } from '../storage/repository';
import type {
  ChannelBinding,
  Modulation,
  MutationLevel,
  MutationNode,
  MutationOp,
  ParamDef,
  ParamValue,
  ResolvedFormat,
  ShaderFormat,
  ShaderProject,
} from '../types/shader';
import { getMainRenderer, mainClock } from './renderer';
import { useSettings } from './settings';
import { toast } from './ui';

export interface EditSnapshot {
  fragment: string;
  vertex?: string;
  format: ShaderFormat;
  params: ParamDef[];
  values: Record<string, ParamValue>;
  modulations: Record<string, Modulation>;
  locked: string[];
  channels: ChannelBinding[];
}

export interface CompileState {
  status: 'idle' | 'ok' | 'error';
  diagnostics: Diagnostic[];
  format: ResolvedFormat | null;
  glsl: '100' | '300' | null;
  compileMs: number;
  keptPrevious: boolean;
  at: number;
}

interface WorkspaceState {
  project: ShaderProject | null;
  dirty: boolean;
  compile: CompileState;
  lastGood: { fragment: string; vertex?: string } | null;
  undoStack: EditSnapshot[];
  redoStack: EditSnapshot[];
  selectedParam: string | null;
  headNodeId: string | null;
  recovered: { savedAt: number } | null;
  /** Variant used as "B" in A/B comparison. */
  compareWith: { name: string; fragment: string; values: Record<string, ParamValue>; params: ParamDef[] } | null;

  openProject: (p: ShaderProject, opts?: { keepDirty?: boolean }) => Promise<void>;
  setFragment: (text: string) => void;
  setVertex: (text: string | undefined) => void;
  setFormat: (f: ShaderFormat) => void;
  compileNow: () => CompileOutcome | null;
  revertToWorking: () => void;
  revertToOriginal: () => void;
  setValue: (name: string, v: ParamValue, opts?: { coalesce?: boolean }) => void;
  setValues: (values: Record<string, ParamValue>, label?: string) => void;
  resetParam: (name: string) => void;
  resetAllParams: () => void;
  updateParamDef: (name: string, patch: Partial<ParamDef>) => void;
  toggleLock: (name: string) => void;
  setModulation: (name: string, m: Modulation | null) => void;
  setChannel: (index: number, binding: ChannelBinding) => Promise<void>;
  promote: (c: ConstantCandidate) => void;
  demote: (name: string, bake?: boolean) => void;
  setMeta: (patch: Partial<Pick<ShaderProject, 'name' | 'description' | 'notes' | 'tags' | 'category'>>) => void;
  undo: () => void;
  redo: () => void;
  select: (name: string | null) => void;
  snapshotNode: (name?: string) => MutationNode | null;
  recordMutation: (input: { name: string; seed: number; strength: number; level: MutationLevel | 0; ops: MutationOp[]; fragment: string; values: Record<string, ParamValue>; params: ParamDef[]; valid: boolean; error?: string; thumbnail?: string }, apply: boolean) => MutationNode | null;
  restoreNode: (id: string) => void;
  renameNode: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  toggleNodeFavorite: (id: string) => void;
  save: () => Promise<ShaderProject | null>;
  saveAs: (name: string) => Promise<ShaderProject | null>;
  saveNodeAsProject: (id: string) => Promise<ShaderProject | null>;
  dismissRecovered: () => void;
  setCompare: (c: WorkspaceState['compareWith']) => void;
}

const idleCompile: CompileState = { status: 'idle', diagnostics: [], format: null, glsl: null, compileMs: 0, keptPrevious: false, at: 0 };

function snapshot(p: ShaderProject): EditSnapshot {
  return {
    fragment: p.fragment,
    vertex: p.vertex,
    format: p.format,
    params: p.params,
    values: structuredClone(p.values),
    modulations: structuredClone(p.modulations),
    locked: [...p.locked],
    channels: structuredClone(p.channels),
  };
}

let lastUndoKind = '';
let lastUndoAt = 0;
let compileTimer: ReturnType<typeof setTimeout> | null = null;

/** Current modulated values at time t — read by the renderer each frame. */
export function currentValues(t: number): Record<string, ParamValue> {
  const p = useWorkspace.getState().project;
  if (!p) return {};
  return applyModulations(p.params, p.values, p.modulations, t);
}

export async function captureThumbnail(w = 320, h = 180): Promise<string | undefined> {
  const r = getMainRenderer();
  if (!r || !r.hasProgram) return undefined;
  try {
    const img = r.renderToPixels(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.putImageData(img, 0, 0);
    return c.toDataURL('image/webp', 0.82);
  } catch {
    return undefined;
  }
}

export async function applyChannelsToRenderer(channels: ChannelBinding[]): Promise<void> {
  const r = getMainRenderer();
  if (!r) return;
  for (let i = 0; i < 4; i++) {
    const b = channels[i];
    const src = b?.assetId ? await resolveChannel(b.assetId) : null;
    r.setChannel(i, src, b ?? undefined);
  }
}

export const useWorkspace = create<WorkspaceState>()((set, get) => {
  /** Record an undo point. Rapid edits of the same kind coalesce. */
  const pushUndo = (kind: string, coalesce = false) => {
    const p = get().project;
    if (!p) return;
    const now = Date.now();
    if (coalesce && kind === lastUndoKind && now - lastUndoAt < 1200) {
      lastUndoAt = now;
      return;
    }
    lastUndoKind = kind;
    lastUndoAt = now;
    set({ undoStack: [...get().undoStack.slice(-199), snapshot(p)], redoStack: [] });
  };

  const patchProject = (patch: Partial<ShaderProject>, markDirty = true) => {
    const p = get().project;
    if (!p) return;
    set({ project: { ...p, ...patch, updatedAt: Date.now() }, dirty: markDirty ? true : get().dirty });
  };

  const scheduleCompile = () => {
    if (!useSettings.getState().autoCompile) return;
    if (compileTimer) clearTimeout(compileTimer);
    compileTimer = setTimeout(() => get().compileNow(), useSettings.getState().compileDelay);
  };

  const applySnapshot = (s: EditSnapshot) => {
    const p = get().project;
    if (!p) return;
    const channelsChanged = JSON.stringify(s.channels) !== JSON.stringify(p.channels);
    set({ project: { ...p, ...s, updatedAt: Date.now() }, dirty: true });
    if (channelsChanged) void applyChannelsToRenderer(s.channels);
    get().compileNow();
  };

  return {
    project: null,
    dirty: false,
    compile: idleCompile,
    lastGood: null,
    undoStack: [],
    redoStack: [],
    selectedParam: null,
    headNodeId: null,
    recovered: null,
    compareWith: null,

    openProject: async (p, opts) => {
      if (compileTimer) clearTimeout(compileTimer);
      // Update the URL first so route observers never see a stale shader id.
      if (/^#?\/?(shader\/.*)?$/.test(location.hash) && location.hash !== `#/shader/${encodeURIComponent(p.id)}`) history.replaceState(null, '', `#/shader/${encodeURIComponent(p.id)}`);
      set({ project: p, dirty: opts?.keepDirty ?? false, undoStack: [], redoStack: [], compile: idleCompile, lastGood: null, selectedParam: null, headNodeId: p.history.length ? p.history[p.history.length - 1].id : null });
      mainClock.restart();
      await applyChannelsToRenderer(p.channels);
      get().compileNow();
    },

    setFragment: (text) => {
      const p = get().project;
      if (!p || p.fragment === text) return;
      pushUndo('text', true);
      patchProject({ fragment: text });
      scheduleCompile();
    },

    setVertex: (text) => {
      pushUndo('vertex', true);
      patchProject({ vertex: text && text.trim() ? text : undefined });
      scheduleCompile();
    },

    setFormat: (f) => {
      pushUndo('format');
      patchProject({ format: f });
      get().compileNow();
    },

    compileNow: () => {
      const p = get().project;
      if (!p) return null;
      if (compileTimer) clearTimeout(compileTimer);
      const derived = mergeParams(deriveParams(p.fragment, p.format), p.params, p.values);
      const input = { fragment: p.fragment, vertex: p.vertex, format: p.format, params: derived.params };
      const r = getMainRenderer();
      const outcome = r ? r.setShader(input) : validateShader(input);
      const compile: CompileState = { status: outcome.ok ? 'ok' : 'error', diagnostics: outcome.diagnostics, format: outcome.format, glsl: outcome.glsl, compileMs: outcome.compileMs, keptPrevious: outcome.keptPrevious, at: Date.now() };
      if (outcome.ok) {
        // Drop modulations/locks for parameters that no longer exist.
        const names = new Set(derived.params.map((d) => d.name));
        const modulations = Object.fromEntries(Object.entries(p.modulations).filter(([k]) => names.has(k)));
        set({
          compile,
          lastGood: { fragment: p.fragment, vertex: p.vertex },
          project: { ...p, params: derived.params, values: derived.values, modulations, locked: p.locked.filter((l) => names.has(l)) },
        });
        r?.requestRender();
      } else {
        set({ compile });
      }
      return outcome;
    },

    revertToWorking: () => {
      const lg = get().lastGood;
      if (!lg) return;
      pushUndo('revert');
      patchProject({ fragment: lg.fragment, vertex: lg.vertex });
      get().compileNow();
    },

    revertToOriginal: () => {
      const p = get().project;
      if (!p) return;
      pushUndo('revert');
      patchProject({ fragment: p.original.fragment, vertex: p.original.vertex });
      get().compileNow();
    },

    setValue: (name, v, opts) => {
      const p = get().project;
      if (!p) return;
      pushUndo(`value:${name}`, opts?.coalesce ?? true);
      patchProject({ values: { ...p.values, [name]: cloneValue(v) } });
      getMainRenderer()?.requestRender();
    },

    setValues: (values, label = 'values') => {
      const p = get().project;
      if (!p) return;
      pushUndo(label);
      patchProject({ values: { ...p.values, ...values } });
      getMainRenderer()?.requestRender();
    },

    resetParam: (name) => {
      const p = get().project;
      const def = p?.params.find((d) => d.name === name);
      if (!p || !def) return;
      pushUndo('reset');
      patchProject({ values: { ...p.values, [name]: cloneValue(def.default) } });
      getMainRenderer()?.requestRender();
    },

    resetAllParams: () => {
      const p = get().project;
      if (!p) return;
      pushUndo('reset-all');
      const values = { ...p.values };
      for (const d of p.params) if (!p.locked.includes(d.name)) values[d.name] = cloneValue(d.default);
      patchProject({ values });
      getMainRenderer()?.requestRender();
    },

    updateParamDef: (name, patch) => {
      const p = get().project;
      if (!p) return;
      pushUndo(`def:${name}`, true);
      const params = p.params.map((d) => (d.name === name ? { ...d, ...patch, userOverridden: true } : d));
      patchProject({ params });
      getMainRenderer()?.setParams(params);
    },

    toggleLock: (name) => {
      const p = get().project;
      if (!p) return;
      const locked = p.locked.includes(name) ? p.locked.filter((l) => l !== name) : [...p.locked, name];
      patchProject({ locked });
    },

    setModulation: (name, m) => {
      const p = get().project;
      if (!p) return;
      pushUndo(`mod:${name}`, true);
      const modulations = { ...p.modulations };
      if (m) modulations[name] = m;
      else delete modulations[name];
      patchProject({ modulations });
      getMainRenderer()?.requestRender();
    },

    setChannel: async (index, binding) => {
      const p = get().project;
      if (!p) return;
      pushUndo('channel');
      const channels = p.channels.map((c, i) => (i === index ? binding : c));
      patchProject({ channels });
      const r = getMainRenderer();
      if (r) r.setChannel(index, binding.assetId ? await resolveChannel(binding.assetId) : null, binding);
    },

    promote: (c) => {
      const p = get().project;
      if (!p) return;
      try {
        const { source, name } = promoteConstant(p.fragment, c);
        pushUndo('promote');
        patchProject({ fragment: source });
        const out = get().compileNow();
        if (out?.ok) {
          set({ selectedParam: name });
          toast('success', `Promoted ${c.text} (line ${c.line}) to uniform ${name}.`);
        } else {
          toast('error', 'Promotion produced invalid GLSL; reverted.');
          get().undo();
        }
      } catch (e) {
        toast('error', (e as Error).message);
      }
    },

    demote: (name, bake) => {
      const p = get().project;
      if (!p) return;
      try {
        const def = p.params.find((d) => d.name === name);
        const v = p.values[name];
        const lit = bake && typeof v === 'number' ? (Number.isInteger(v) ? `${v}.0` : String(Number(v.toPrecision(6)))) : undefined;
        const source = demoteConstant(p.fragment, name, lit);
        pushUndo('demote');
        patchProject({ fragment: source });
        get().compileNow();
        toast('info', `${def?.label ?? name} ${bake ? 'baked into' : 'restored to'} a literal.`);
      } catch (e) {
        toast('error', (e as Error).message);
      }
    },

    setMeta: (patch) => {
      patchProject(patch);
    },

    undo: () => {
      const { undoStack, project } = get();
      if (!undoStack.length || !project) return;
      const prev = undoStack[undoStack.length - 1];
      set({ undoStack: undoStack.slice(0, -1), redoStack: [...get().redoStack, snapshot(project)] });
      lastUndoKind = '';
      applySnapshot(prev);
    },

    redo: () => {
      const { redoStack, project } = get();
      if (!redoStack.length || !project) return;
      const next = redoStack[redoStack.length - 1];
      set({ redoStack: redoStack.slice(0, -1), undoStack: [...get().undoStack, snapshot(project)] });
      lastUndoKind = '';
      applySnapshot(next);
    },

    select: (name) => set({ selectedParam: name }),

    snapshotNode: (name) => {
      const p = get().project;
      if (!p) return null;
      const node: MutationNode = {
        id: uid('m_'),
        parentId: get().headNodeId,
        name: name ?? `Snapshot ${p.history.length + 1}`,
        createdAt: Date.now(),
        seed: 0,
        strength: 0,
        level: 0,
        ops: [],
        fragment: p.fragment,
        values: structuredClone(p.values),
        params: p.params,
        valid: get().compile.status !== 'error',
      };
      patchProject({ history: [...p.history, node] });
      set({ headNodeId: node.id });
      return node;
    },

    recordMutation: (input, apply) => {
      let p = get().project;
      if (!p) return null;
      // Ensure the pre-mutation state exists as a root to return to.
      if (!get().headNodeId) {
        get().snapshotNode('Original');
        p = get().project!;
      }
      const node: MutationNode = { id: uid('m_'), parentId: get().headNodeId, createdAt: Date.now(), ...structuredClone(input) };
      if (apply && input.valid) {
        pushUndo('mutation');
        const names = new Set(input.params.map((d) => d.name));
        set({
          project: { ...p, fragment: input.fragment, params: input.params, values: structuredClone(input.values), modulations: Object.fromEntries(Object.entries(p.modulations).filter(([k]) => names.has(k))), history: [...p.history, node], updatedAt: Date.now() },
          dirty: true,
          headNodeId: node.id,
        });
        if (input.fragment !== p.fragment) get().compileNow();
        else getMainRenderer()?.requestRender();
      } else {
        set({ project: { ...p, history: [...p.history, node], updatedAt: Date.now() }, dirty: true });
      }
      return node;
    },

    restoreNode: (id) => {
      const p = get().project;
      const node = p?.history.find((h) => h.id === id);
      if (!p || !node) return;
      if (!node.valid) {
        toast('warn', 'That variant failed to compile; restoring its source for inspection.');
      }
      pushUndo('restore');
      set({ project: { ...p, fragment: node.fragment, params: node.params, values: structuredClone(node.values), updatedAt: Date.now() }, dirty: true, headNodeId: node.id });
      get().compileNow();
    },

    renameNode: (id, name) => {
      const p = get().project;
      if (!p) return;
      patchProject({ history: p.history.map((h) => (h.id === id ? { ...h, name } : h)) });
    },

    deleteNode: (id) => {
      const p = get().project;
      if (!p) return;
      const target = p.history.find((h) => h.id === id);
      // Re-parent children so the tree stays connected.
      const history = p.history.filter((h) => h.id !== id).map((h) => (h.parentId === id ? { ...h, parentId: target?.parentId ?? null } : h));
      patchProject({ history });
      if (get().headNodeId === id) set({ headNodeId: target?.parentId ?? null });
    },

    toggleNodeFavorite: (id) => {
      const p = get().project;
      if (!p) return;
      patchProject({ history: p.history.map((h) => (h.id === id ? { ...h, favorite: !h.favorite } : h)) });
    },

    save: async () => {
      let p = get().project;
      if (!p) return null;
      const thumb = await captureThumbnail();
      if (isPresetId(p.id)) {
        // Presets are read-only: saving creates a user-owned copy.
        p = forkProject(p, `${p.name}`, 'user');
        p.provenance = { ...p.provenance, kind: 'preset' };
      }
      const rev = { id: uid('r_'), createdAt: Date.now(), label: `Saved ${new Date().toLocaleString()}`, fragment: p.fragment, vertex: p.vertex, values: structuredClone(p.values) };
      const last = p.revisions[p.revisions.length - 1];
      const revisions = last && last.fragment === rev.fragment && JSON.stringify(last.values) === JSON.stringify(rev.values) ? p.revisions : [...p.revisions.slice(-49), rev];
      const saved: ShaderProject = { ...p, thumbnail: thumb ?? p.thumbnail, revisions, updatedAt: Date.now() };
      await repository.put(saved);
      set({ project: saved, dirty: false });
      history.replaceState(null, '', `#/shader/${encodeURIComponent(saved.id)}`);
      return saved;
    },

    saveAs: async (name) => {
      const p = get().project;
      if (!p) return null;
      const copy = forkProject(p, name, 'user');
      copy.thumbnail = (await captureThumbnail()) ?? p.thumbnail;
      await repository.put(copy);
      set({ project: copy, dirty: false });
      history.replaceState(null, '', `#/shader/${encodeURIComponent(copy.id)}`);
      return copy;
    },

    saveNodeAsProject: async (id) => {
      const p = get().project;
      const node = p?.history.find((h) => h.id === id);
      if (!p || !node) return null;
      const copy = forkProject(p, `${p.name} · ${node.name}`, 'mutation');
      copy.fragment = node.fragment;
      copy.params = node.params;
      copy.values = structuredClone(node.values);
      copy.thumbnail = node.thumbnail ?? p.thumbnail;
      copy.history = [];
      copy.tags = Array.from(new Set([...copy.tags, 'variant']));
      copy.notes = `Mutation of "${p.name}" (seed ${node.seed}, strength ${node.strength.toFixed(2)}).\n${node.ops.map((o) => `• ${o.description}`).join('\n')}`;
      await repository.put(copy);
      return copy;
    },

    dismissRecovered: () => set({ recovered: null }),
    setCompare: (c) => set({ compareWith: c }),
  };
});

// ---------------------------------------------------------------- autosave

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSessionWrite = '';

export function startAutosave(onLibraryChange: () => void): () => void {
  return useWorkspace.subscribe((state, prev) => {
    if (state.project === prev.project || !state.project) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const { project, dirty } = useWorkspace.getState();
      if (!project) return;
      try {
        const key = `${project.id}:${project.updatedAt}`;
        if (key !== lastSessionWrite) {
          await repository.saveSession({ key: 'workspace', savedAt: Date.now(), project, dirty });
          lastSessionWrite = key;
        }
        const { autosaveLibrary } = useSettings.getState();
        if (dirty && autosaveLibrary && !isPresetId(project.id)) {
          await repository.put(project);
          // Only clear dirty if nothing changed while writing.
          if (useWorkspace.getState().project === project) useWorkspace.setState({ dirty: false });
          onLibraryChange();
        }
      } catch (e) {
        console.warn('Autosave failed', e);
      }
    }, useSettings.getState().autosaveDelay);
  });
}

/** Flush the working copy synchronously-ish before the page goes away. */
export function flushSession(): void {
  const { project, dirty } = useWorkspace.getState();
  if (project) void repository.saveSession({ key: 'workspace', savedAt: Date.now(), project, dirty });
}
