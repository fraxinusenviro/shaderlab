import { EMPTY_ARR, EMPTY_OBJ } from '../utils/empty';
import { AlertCircle, AlertTriangle, ArrowUpFromLine, Bookmark, CheckCircle2, Copy, GitBranch, Info, Pencil, Play, Plus, RotateCcw, Save, Star, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Empty, Tabs } from '../components/ui';
import { CodeEditor } from '../editor/CodeEditor';
import { defaultModulation, sampleKeyframes } from '../modulation/modulate';
import { findConstantCandidates } from '../params/constants';
import { componentCount } from '../params/parse';
import { mainClock } from '../state/renderer';
import { useSettings } from '../state/settings';
import { toast, useUI, type BottomTab } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import { useLibrary } from '../state/library';
import type { Keyframe, MutationNode, ShaderFormat } from '../types/shader';

// ---------------------------------------------------------------- code

const FORMATS: { id: ShaderFormat; label: string }[] = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'shadertoy', label: 'Shadertoy (mainImage)' },
  { id: 'standard', label: 'Standard main()' },
  { id: 'gltransition', label: 'GL Transition' },
];

let revealNonce = 0;
export function useReveal() {
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);
  return [reveal, (line: number) => setReveal({ line, nonce: ++revealNonce })] as const;
}

export function CodeTab({ reveal }: { reveal: { line: number; nonce: number } | null }) {
  const fragment = useWorkspace((s) => s.project?.fragment ?? '');
  const vertex = useWorkspace((s) => s.project?.vertex);
  const format = useWorkspace((s) => s.project?.format ?? 'auto');
  const compile = useWorkspace((s) => s.compile);
  const hasLastGood = useWorkspace((s) => !!s.lastGood && s.lastGood.fragment !== s.project?.fragment);
  const { setFragment, setVertex, setFormat, compileNow, revertToWorking, revertToOriginal } = useWorkspace.getState();
  const fontSize = useSettings((s) => s.editorFontSize);
  const autoCompile = useSettings((s) => s.autoCompile);
  const setSettings = useSettings((s) => s.set);
  const [stage, setStage] = useState<'fragment' | 'vertex'>('fragment');
  const errors = compile.diagnostics.filter((d) => d.severity === 'error').length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1">
        <div className="flex rounded-md border border-line p-0.5" role="group" aria-label="Shader stage">
          {(['fragment', 'vertex'] as const).map((s) => (
            <button key={s} className={`rounded px-2 py-0.5 text-2xs ${stage === s ? 'bg-panel2 text-fg' : 'text-muted'}`} onClick={() => setStage(s)} aria-pressed={stage === s}>
              {s === 'fragment' ? 'Fragment' : `Vertex${vertex ? ' •' : ''}`}
            </button>
          ))}
        </div>
        <select className="rounded border border-line bg-bg px-1 py-0.5 text-2xs" value={format} onChange={(e) => setFormat(e.target.value as ShaderFormat)} aria-label="Shader format" title="Shader format / compatibility mode">
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
              {f.id === 'auto' && compile.format ? ` → ${compile.format}` : ''}
            </option>
          ))}
        </select>
        <span className={`ml-1 flex items-center gap-1 text-2xs ${compile.status === 'error' ? 'text-danger' : compile.status === 'ok' ? 'text-ok' : 'text-muted'}`} data-testid="compile-status">
          {compile.status === 'error' ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}
          {compile.status === 'error' ? `${errors} error${errors === 1 ? '' : 's'}` : compile.status === 'ok' ? `Compiled · GLSL ${compile.glsl === '300' ? 'ES 3.00' : 'ES 1.00'} · ${compile.compileMs.toFixed(0)} ms` : 'Not compiled'}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1 text-2xs text-muted" title="Compile automatically while typing">
            <input type="checkbox" checked={autoCompile} onChange={(e) => setSettings({ autoCompile: e.target.checked })} /> Auto
          </label>
          <button className="btn py-0.5" onClick={() => compileNow()} title="Compile (Ctrl+Enter)" data-testid="compile-button">
            <Play size={12} /> Compile
          </button>
          <button className="btn py-0.5" onClick={revertToWorking} disabled={!hasLastGood} title="Revert source to the last version that compiled" data-testid="revert-working">
            <Undo2 size={12} /> Revert to working
          </button>
          <button className="btn py-0.5" onClick={() => confirm('Replace the current source with the original imported/created source? (Undo is available.)') && revertToOriginal()} title="Restore original source">
            <RotateCcw size={12} /> Original
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1" data-testid="code-editor">
        {stage === 'fragment' ? (
          <CodeEditor key="frag" value={fragment} onChange={setFragment} diagnostics={compile.diagnostics} fontSize={fontSize} ariaLabel="Fragment shader source" revealLine={reveal} />
        ) : (
          <div className="flex h-full flex-col">
            <p className="border-b border-line px-3 py-1 text-2xs text-muted">
              Optional custom vertex shader. Leave empty to use the built-in full-screen triangle. The position attribute must be named <code className="font-mono">a_position</code> (vec2) and the GLSL version must match the fragment shader.
            </p>
            <div className="min-h-0 flex-1">
              <CodeEditor key="vert" value={vertex ?? ''} onChange={(v) => setVertex(v)} diagnostics={compile.diagnostics.filter((d) => d.origin === 'vertex').map((d) => ({ ...d, origin: 'user' }))} fontSize={fontSize} ariaLabel="Vertex shader source" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- console

function ConsoleTab({ onReveal }: { onReveal: (line: number) => void }) {
  const compile = useWorkspace((s) => s.compile);
  const set = useUI((s) => s.set);
  if (compile.status === 'idle') return <Empty>No compilation yet.</Empty>;
  const icon = { error: <AlertCircle size={13} className="text-danger" />, warning: <AlertTriangle size={13} className="text-warn" />, info: <Info size={13} className="text-muted" /> };
  const originLabel = { user: 'your code', wrapper: 'compatibility wrapper', vertex: 'vertex shader', link: 'linker', adapter: 'format adapter', runtime: 'runtime' };
  return (
    <div className="flex flex-col font-mono text-xs" data-testid="console">
      <div className={`px-3 py-1.5 ${compile.status === 'ok' ? 'text-ok' : 'text-danger'}`}>
        {compile.status === 'ok' ? '✓ Compiled and linked' : '✗ Compilation failed'} · format {compile.format ?? '?'} · GLSL {compile.glsl ?? '?'} · {new Date(compile.at).toLocaleTimeString()}
        {compile.status === 'error' && compile.keptPrevious && <span className="text-muted"> · the viewport keeps showing the last working version</span>}
      </div>
      {compile.diagnostics.map((d, i) => (
        <button
          key={i}
          className="flex items-start gap-2 border-t border-line/60 px-3 py-1.5 text-left hover:bg-panel2 disabled:cursor-default"
          disabled={d.line === null || d.origin !== 'user'}
          onClick={() => {
            if (d.line) {
              set({ bottomTab: 'code' });
              onReveal(d.line);
            }
          }}
        >
          {icon[d.severity]}
          <span className="w-16 shrink-0 text-muted">{d.line !== null && d.origin === 'user' ? `line ${d.line}` : ''}</span>
          <span className="flex-1 whitespace-pre-wrap">{d.message}</span>
          <span className={`chip shrink-0 ${d.origin === 'user' ? '' : 'border-warn/50 text-warn'}`}>{originLabel[d.origin]}</span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- history

function HistoryTab() {
  const history = useWorkspace((s) => s.project?.history ?? EMPTY_ARR);
  const revisions = useWorkspace((s) => s.project?.revisions ?? EMPTY_ARR);
  const head = useWorkspace((s) => s.headNodeId);
  const undoCount = useWorkspace((s) => s.undoStack.length);
  const redoCount = useWorkspace((s) => s.redoStack.length);
  const ws = useWorkspace.getState();
  const tree = useMemo(() => {
    const children = new Map<string | null, MutationNode[]>();
    const ids = new Set(history.map((h) => h.id));
    for (const h of history) {
      const pid = h.parentId && ids.has(h.parentId) ? h.parentId : null;
      children.set(pid, [...(children.get(pid) ?? []), h]);
    }
    const out: { node: MutationNode; depth: number }[] = [];
    const walk = (pid: string | null, depth: number) => {
      for (const n of children.get(pid) ?? []) {
        out.push({ node: n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [history]);

  return (
    <div className="flex flex-col" data-testid="history">
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1">
        <button className="btn py-0.5" onClick={() => ws.undo()} disabled={!undoCount}>
          Undo ({undoCount})
        </button>
        <button className="btn py-0.5" onClick={() => ws.redo()} disabled={!redoCount}>
          Redo ({redoCount})
        </button>
        <button
          className="btn py-0.5"
          onClick={() => {
            const name = prompt('Snapshot name', `Snapshot ${history.length + 1}`);
            if (name !== null) ws.snapshotNode(name || undefined);
          }}
          data-testid="snapshot"
        >
          <Bookmark size={12} /> Named snapshot
        </button>
        <span className="ml-auto text-2xs text-muted">{history.length} node(s) · parent → child</span>
      </div>
      {tree.length === 0 && <Empty>No mutations or snapshots yet. Use the Mutate tab, the variant gallery, or take a named snapshot.</Empty>}
      {tree.map(({ node, depth }) => (
        <div key={node.id} className={`flex items-center gap-2 border-b border-line/50 py-1 pr-2 text-xs ${node.id === head ? 'bg-accent/10' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {node.thumbnail ? <img src={node.thumbnail} alt="" className="h-8 w-14 rounded object-cover" /> : <GitBranch size={13} className="text-muted" />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className={`truncate font-medium ${node.valid ? '' : 'text-danger line-through'}`}>{node.name}</span>
              {node.level > 0 && <span className="chip">L{node.level}</span>}
              {!node.valid && <span className="chip border-danger/60 text-danger">invalid</span>}
              {node.id === head && <span className="chip border-accent/60 text-accent">current</span>}
            </div>
            <div className="truncate text-2xs text-muted" title={node.ops.map((o) => o.description).join('\n') + (node.error ? `\n${node.error}` : '')}>
              {node.seed ? `seed ${node.seed} · strength ${node.strength.toFixed(2)} · ` : ''}
              {node.ops.length ? `${node.ops.length} op(s): ${node.ops.slice(0, 2).map((o) => o.description).join('; ')}` : 'snapshot'} · {new Date(node.createdAt).toLocaleTimeString()}
            </div>
          </div>
          <button className="btn-icon h-6 w-6" title="Restore this version" aria-label="Restore" onClick={() => ws.restoreNode(node.id)}>
            <Undo2 size={13} />
          </button>
          <button className={`btn-icon h-6 w-6 ${node.favorite ? 'text-warn' : ''}`} title="Favourite" aria-label="Favourite" onClick={() => ws.toggleNodeFavorite(node.id)}>
            <Star size={13} fill={node.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            className="btn-icon h-6 w-6"
            title="Rename"
            aria-label="Rename"
            onClick={() => {
              const n = prompt('Name', node.name);
              if (n) ws.renameNode(node.id, n);
            }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="btn-icon h-6 w-6"
            title="Save as a separate library item"
            aria-label="Save as new shader"
            onClick={async () => {
              const p = await ws.saveNodeAsProject(node.id);
              if (p) {
                await useLibrary.getState().refresh();
                toast('success', `Saved "${p.name}" to your library.`);
              }
            }}
          >
            <Save size={13} />
          </button>
          <button className="btn-icon h-6 w-6" title="Delete node" aria-label="Delete node" onClick={() => ws.deleteNode(node.id)}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {revisions.length > 0 && (
        <>
          <h3 className="panel-title mt-2">Saved revisions</h3>
          {revisions
            .slice()
            .reverse()
            .map((r) => (
              <div key={r.id} className="flex items-center gap-2 border-b border-line/50 px-3 py-1 text-xs">
                <span className="flex-1 truncate">{r.label}</span>
                <button
                  className="btn py-0.5"
                  onClick={() => {
                    ws.setFragment(r.fragment);
                    ws.setValues(r.values, 'revision');
                    ws.compileNow();
                  }}
                >
                  Load
                </button>
              </div>
            ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- timeline

function TimelineTab() {
  const params = useWorkspace((s) => s.project?.params ?? EMPTY_ARR);
  const modulations = useWorkspace((s) => s.project?.modulations ?? EMPTY_OBJ);
  const values = useWorkspace((s) => s.project?.values ?? EMPTY_OBJ);
  const { setModulation } = useWorkspace.getState();
  const [now, setNow] = useState(0);
  const scalars = params.filter((p) => componentCount(p.type) === 1 && p.type !== 'bool');
  const tracks = scalars.filter((p) => modulations[p.name]?.kind === 'keyframes');
  const [addName, setAddName] = useState('');
  const duration = Math.max(1, ...tracks.map((p) => modulations[p.name].duration ?? 4));
  // Poll the clock rather than re-rendering per frame.
  useEffect(() => {
    const id = setInterval(() => setNow(mainClock.time), 100);
    return () => clearInterval(id);
  }, []);
  const loopT = now % duration;

  const addKey = (name: string) => {
    const m = modulations[name];
    const p = scalars.find((x) => x.name === name);
    if (!m || !p) return;
    const t = Number((mainClock.time % (m.duration ?? 4)).toFixed(2));
    const kfs = [...(m.keyframes ?? []).filter((k) => Math.abs(k.t - t) > 0.01), { t, v: values[name] as number, ease: 'smooth' as const }].sort((a, b) => a.t - b.t);
    setModulation(name, { ...m, keyframes: kfs });
  };

  return (
    <div className="flex flex-col gap-2 p-2" data-testid="timeline">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted">t = {now.toFixed(2)}s</span>
        <button className="btn py-0.5" onClick={() => mainClock.restart()}>
          Reset
        </button>
        <button className="btn py-0.5" onClick={() => (mainClock.playing ? mainClock.pause() : mainClock.play())}>
          Play / pause
        </button>
        <select className="input w-auto" value={addName} onChange={(e) => setAddName(e.target.value)} aria-label="Parameter to animate">
          <option value="">Animate parameter…</option>
          {scalars
            .filter((p) => modulations[p.name]?.kind !== 'keyframes')
            .map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
        </select>
        <button
          className="btn py-0.5"
          disabled={!addName}
          onClick={() => {
            const p = scalars.find((x) => x.name === addName)!;
            const v = values[addName] as number;
            const span = p.max - p.min;
            const far = v - p.min > span / 2 ? p.min + span * 0.15 : p.max - span * 0.15;
            setModulation(addName, { ...defaultModulation('keyframes'), keyframes: [{ t: 0, v }, { t: 2, v: far }, { t: 4, v }], duration: 4 });
            setAddName('');
          }}
        >
          <Plus size={12} /> Add track
        </button>
      </div>
      {tracks.length === 0 && <Empty>No keyframe tracks. Add a track to animate a parameter over a looping timeline; the playhead follows the viewport clock.</Empty>}
      {tracks.map((p) => {
        const m = modulations[p.name];
        const d = m.duration ?? 4;
        const kfs = m.keyframes ?? [];
        const span = p.max - p.min || 1;
        const pts = Array.from({ length: 60 }, (_, i) => {
          const t = (i / 59) * d;
          const v = sampleKeyframes(kfs, t, d) ?? p.min;
          return `${(t / d) * 100},${100 - ((v - p.min) / span) * 100}`;
        }).join(' ');
        return (
          <div key={p.name} className="rounded-md border border-line p-2">
            <div className="mb-1 flex items-center gap-2 text-xs">
              <span className="flex-1 font-medium">{p.label}</span>
              <label className="flex items-center gap-1 text-2xs text-muted">
                Loop
                <input className="input w-16 py-0.5" type="number" min={0.5} step={0.5} value={d} onChange={(e) => setModulation(p.name, { ...m, duration: Math.max(0.5, Number(e.target.value) || 4) })} />s
              </label>
              <button className="btn py-0.5" onClick={() => addKey(p.name)} title="Insert a keyframe at the playhead using the current slider value">
                <Plus size={12} /> Key @ playhead
              </button>
              <button className="btn-icon h-6 w-6" onClick={() => setModulation(p.name, null)} title="Remove track" aria-label="Remove track">
                <Trash2 size={13} />
              </button>
            </div>
            <div className="relative h-16 rounded bg-bg">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <polyline points={pts} fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${((now % d) / d) * 100}%` }} />
              {kfs.map((k: Keyframe, i) => (
                <button
                  key={i}
                  className="absolute h-3 w-3 -translate-x-1/2 translate-y-1/2 rotate-45 border border-white bg-accent"
                  style={{ left: `${(k.t / d) * 100}%`, bottom: `${((k.v - p.min) / span) * 100}%` }}
                  title={`t=${k.t}s v=${k.v.toFixed(3)} — click to delete`}
                  onClick={() => setModulation(p.name, { ...m, keyframes: kfs.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          </div>
        );
      })}
      {tracks.length > 0 && <p className="text-2xs text-muted">Loop position {loopT.toFixed(2)}s. Set a slider, move the playhead (pause + step) and press “Key @ playhead”. Click a diamond to delete it.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- constants

function ConstantsTab({ onReveal }: { onReveal: (line: number) => void }) {
  const fragment = useWorkspace((s) => s.project?.fragment ?? '');
  const params = useWorkspace((s) => s.project?.params ?? EMPTY_ARR);
  const { promote, demote } = useWorkspace.getState();
  const [showCaution, setShowCaution] = useState(false);
  const cands = useMemo(() => findConstantCandidates(fragment), [fragment]);
  const shown = cands.filter((c) => showCaution || c.safety === 'safe');
  const promoted = params.filter((p) => p.promoted);
  return (
    <div className="flex flex-col" data-testid="constants">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-2xs text-muted">
        <span className="flex-1">
          Float literals inside functions that may be safely turned into uniforms. Loop bounds, array sizes, <code>const</code> and global initialisers, and integers are excluded.
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showCaution} onChange={(e) => setShowCaution(e.target.checked)} /> show cautionary
        </label>
      </div>
      {promoted.length > 0 && (
        <div className="border-b border-line px-3 py-2">
          <div className="label mb-1">Promoted</div>
          {promoted.map((p) => (
            <div key={p.name} className="flex items-center gap-2 py-0.5 text-xs">
              <code className="font-mono">{p.name}</code>
              <span className="text-muted">was {p.promoted!.literal}</span>
              <button className="btn ml-auto py-0.5" onClick={() => demote(p.name)} title="Remove the uniform and restore the original literal">
                Restore literal
              </button>
              <button className="btn py-0.5" onClick={() => demote(p.name, true)} title="Remove the uniform and write the current value as a literal">
                Bake value
              </button>
            </div>
          ))}
        </div>
      )}
      {shown.length === 0 && <Empty>No promotable constants found.</Empty>}
      {shown.map((c) => (
        <div key={`${c.start}`} className="flex items-center gap-2 border-b border-line/50 px-3 py-1 text-xs hover:bg-panel2">
          <button className="w-14 shrink-0 text-left font-mono text-muted hover:text-fg" onClick={() => onReveal(c.line)} title="Show in editor">
            L{c.line}
          </button>
          <code className="w-16 shrink-0 font-mono text-accent">{c.text}</code>
          <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted" title={c.lineText.trim()}>
            {c.fn ? `${c.fn}(): ` : ''}
            {c.lineText.trim()}
          </span>
          {c.safety === 'caution' && (
            <span className="chip border-warn/50 text-warn" title={c.reason}>
              caution
            </span>
          )}
          <button className="btn py-0.5" onClick={() => promote(c)} title="Replace this literal with a new editable uniform" data-testid="promote">
            <ArrowUpFromLine size={12} /> Promote
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- info

function InfoTab() {
  const p = useWorkspace((s) => s.project);
  const { setMeta } = useWorkspace.getState();
  if (!p) return null;
  const pv = p.provenance;
  return (
    <div className="grid gap-3 p-3 md:grid-cols-2" key={p.id}>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="label">Name</span>
          <input className="input" defaultValue={p.name} onBlur={(e) => e.target.value.trim() && setMeta({ name: e.target.value.trim() })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Category</span>
          <input className="input" defaultValue={p.category} onBlur={(e) => setMeta({ category: e.target.value.trim() || 'Uncategorised' })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Tags (comma separated)</span>
          <input className="input" defaultValue={p.tags.join(', ')} onBlur={(e) => setMeta({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Description</span>
          <textarea className="input min-h-[60px]" defaultValue={p.description} onBlur={(e) => setMeta({ description: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Notes</span>
          <textarea className="input min-h-[80px]" defaultValue={p.notes} onBlur={(e) => setMeta({ notes: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-col gap-2 text-xs">
        <div className="label">Provenance</div>
        <dl className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1">
          <dt className="text-muted">Origin</dt>
          <dd>{pv.kind === 'preset' ? 'Bundled preset' : pv.kind === 'import' ? 'Imported' : pv.kind === 'mutation' ? 'Mutation variant' : 'User created'}</dd>
          {pv.author && (
            <>
              <dt className="text-muted">Author</dt>
              <dd>{pv.author}</dd>
            </>
          )}
          {pv.license && (
            <>
              <dt className="text-muted">License</dt>
              <dd>{pv.license}</dd>
            </>
          )}
          {pv.sourceUrl && (
            <>
              <dt className="text-muted">Source</dt>
              <dd className="truncate">
                <a className="text-accent underline" href={pv.sourceUrl} target="_blank" rel="noreferrer noopener">
                  {pv.sourceUrl}
                </a>
              </dd>
            </>
          )}
          {pv.importedFrom && (
            <>
              <dt className="text-muted">Imported from</dt>
              <dd>{pv.importedFrom}</dd>
            </>
          )}
          {pv.parentId && (
            <>
              <dt className="text-muted">Derived from</dt>
              <dd className="font-mono text-2xs">{pv.parentId}</dd>
            </>
          )}
          <dt className="text-muted">Created</dt>
          <dd>{new Date(p.createdAt).toLocaleString()}</dd>
          <dt className="text-muted">Modified</dt>
          <dd>{new Date(p.updatedAt).toLocaleString()}</dd>
          <dt className="text-muted">ID</dt>
          <dd className="flex items-center gap-1 font-mono text-2xs">
            {p.id}
            <button className="btn-icon h-5 w-5" onClick={() => void navigator.clipboard?.writeText(p.id)} aria-label="Copy id">
              <Copy size={11} />
            </button>
          </dd>
        </dl>
        {pv.notice && (
          <details>
            <summary className="cursor-pointer text-muted">License notice</summary>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 font-mono text-2xs">{pv.notice}</pre>
          </details>
        )}
        {p.original.fragment !== p.fragment && <p className="text-2xs text-muted">The source has been modified; the original is preserved and can be restored from the Code tab.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- dock

export function BottomDock() {
  const tab = useUI((s) => s.bottomTab);
  const set = useUI((s) => s.set);
  const errors = useWorkspace((s) => s.compile.diagnostics.filter((d) => d.severity === 'error').length);
  const historyCount = useWorkspace((s) => s.project?.history.length ?? 0);
  const [reveal, setReveal] = useReveal();
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" data-testid="bottom-dock">
      <Tabs<BottomTab>
        value={tab}
        onChange={(t) => set({ bottomTab: t })}
        tabs={[
          { id: 'code', label: 'GLSL' },
          { id: 'console', label: <span className={errors ? 'text-danger' : ''}>Console{errors ? ` (${errors})` : ''}</span> },
          { id: 'history', label: `History${historyCount ? ` (${historyCount})` : ''}` },
          { id: 'timeline', label: 'Timeline' },
          { id: 'constants', label: 'Constants' },
          { id: 'info', label: 'Info' },
        ]}
      />
      <div className={`min-h-0 flex-1 ${tab === 'code' ? '' : 'scroll-thin overflow-y-auto'}`}>
        {tab === 'code' && <CodeTab reveal={reveal} />}
        {tab === 'console' && <ConsoleTab onReveal={setReveal} />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'timeline' && <TimelineTab />}
        {tab === 'constants' && (
          <ConstantsTab
            onReveal={(l) => {
              set({ bottomTab: 'code' });
              setReveal(l);
            }}
          />
        )}
        {tab === 'info' && <InfoTab />}
      </div>
    </div>
  );
}
