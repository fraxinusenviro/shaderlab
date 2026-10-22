import { EMPTY_ARR, EMPTY_OBJ } from '../utils/empty';
import { Dice5, FlaskConical, LayoutGrid, X, Lock, RotateCcw, Search, SlidersHorizontal, Upload, Waves } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Empty, Field, Tabs, Toggle } from '../components/ui';
import { ParamControl } from '../components/ParamControl';
import { navigate } from '../hooks/useHashRoute';
import { validateExpression } from '../modulation/expr';
import { defaultModulation, MODULATION_KINDS } from '../modulation/modulate';
import { MUTATION_CATEGORIES, categorizeParam, type MutationCategory } from '../mutations/categories';
import { MATH_OPS } from '../mutations/math';
import { randomSeed } from '../mutations/rng';
import { STRUCT_OPS } from '../mutations/structural';
import { generateVariant } from '../mutations/variants';
import { componentCount } from '../params/parse';
import { BUILTIN_TEXTURES } from '../renderer/textures';
import { forgetChannel } from '../renderer/channels';
import { validateShader } from '../renderer/offscreen';
import { useLab } from '../state/lab';
import { mainClock } from '../state/renderer';
import { useSettings } from '../state/settings';
import { toast, useUI, type RightTab } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import { uid } from '../storage/project';
import { repository } from '../storage/repository';
import type { ModulationKind, ParamDef } from '../types/shader';

// ---------------------------------------------------------------- parameters

function ParamsTab() {
  const params = useWorkspace((s) => s.project?.params ?? EMPTY_ARR);
  const [q, setQ] = useState('');
  const compact = useSettings((s) => s.compactControls);
  const setSettings = useSettings((s) => s.set);
  const { resetAllParams } = useWorkspace.getState();
  const groups = useMemo(() => {
    const filtered = params.filter((p) => !q || `${p.label} ${p.name} ${p.group}`.toLowerCase().includes(q.toLowerCase()));
    const m = new Map<string, ParamDef[]>();
    for (const p of filtered) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [params, q]);

  if (!params.length) {
    return (
      <Empty>
        No editable uniforms detected.
        <br />
        Declare one such as <code className="font-mono">uniform float uFreq; // @param min=0 max=20</code>, or promote a constant from the <b>Constants</b> tab.
      </Empty>
    );
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        <Search size={13} className="text-muted" />
        <input className="flex-1 bg-transparent text-xs outline-none" placeholder={`Filter ${params.length} parameters`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter parameters" />
        <button className={`btn-icon h-6 w-6 ${compact ? 'text-accent' : ''}`} title={compact ? 'Expanded controls' : 'Compact controls'} aria-label="Toggle compact controls" onClick={() => setSettings({ compactControls: !compact })}>
          <SlidersHorizontal size={13} />
        </button>
        <button className="btn-icon h-6 w-6" title="Reset all unlocked parameters" aria-label="Reset all parameters" onClick={resetAllParams}>
          <RotateCcw size={13} />
        </button>
      </div>
      {groups.map(([group, defs]) => (
        <section key={group}>
          <h3 className="panel-title sticky top-0 z-[1] bg-panel/95 backdrop-blur">{group}</h3>
          {defs.map((d) => (
            <ParamControl key={d.name} def={d} />
          ))}
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- mutation

function Pct({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={`${label} · ${Math.round(value * 100)}%`} hint={hint}>
      <input type="range" min={0} max={1} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ ['--fill' as string]: `${value * 100}%` }} aria-label={label} />
    </Field>
  );
}

export function MutationSettingsForm({ showAll = true }: { showAll?: boolean }) {
  const s = useLab((x) => x.settings);
  const set = useLab((x) => x.setSettings);
  const params = useWorkspace((x) => x.project?.params ?? EMPTY_ARR);
  const locked = useWorkspace((x) => x.project?.locked ?? EMPTY_ARR);
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const presentCats = useMemo(() => new Set(params.map(categorizeParam)), [params]);
  return (
    <div className="flex flex-col gap-3">
      <Pct label="Strength" value={s.strength} onChange={(v) => set({ strength: v })} hint="How far values and expressions move from the source." />
      <Pct label="Probability" value={s.probability} onChange={(v) => set({ probability: v })} hint="Chance that each eligible target is mutated." />
      <Field label="Seed">
        <div className="flex gap-1">
          <input className="input font-mono" type="number" value={s.seed} onChange={(e) => set({ seed: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Mutation seed" />
          <button className="btn" onClick={() => set({ seed: randomSeed() })} title="Random seed">
            <Dice5 size={13} />
          </button>
        </div>
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="label mb-1">Levels</legend>
        <Toggle checked={s.levels.uniform} onChange={(v) => set({ levels: { ...s.levels, uniform: v } })} label={<span>1 · Uniform values <span className="text-muted">(always compiles)</span></span>} />
        <Toggle checked={s.levels.math} onChange={(v) => set({ levels: { ...s.levels, math: v } })} label={<span>2 · Mathematical <span className="text-muted">(validated source edits)</span></span>} />
        <Toggle checked={s.levels.structural} onChange={(v) => set({ levels: { ...s.levels, structural: v } })} label={<span>3 · Structural <span className="text-muted">(experimental)</span></span>} />
      </fieldset>
      {s.levels.uniform && (
        <>
          <Field label="Uniform mode">
            <select className="input" value={s.uniformMode} onChange={(e) => set({ uniformMode: e.target.value as 'perturb' | 'randomize' })}>
              <option value="perturb">Perturb (bounded nudge from current)</option>
              <option value="randomize">Randomise (anywhere in range)</option>
            </select>
          </Field>
          <Field label="Randomisation scope">
            <select className="input" value={s.scope} onChange={(e) => set({ scope: e.target.value as 'all' | 'selected' })}>
              <option value="all">All unlocked parameters</option>
              <option value="selected">Only parameters ticked below</option>
            </select>
          </Field>
          {s.scope === 'selected' && (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded border border-line p-2">
              {params.map((p) => (
                <label key={p.name} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={s.selected.includes(p.name)} onChange={() => set({ selected: toggle(s.selected, p.name) })} />
                  {p.label}
                  {locked.includes(p.name) && <Lock size={10} className="text-muted" />}
                </label>
              ))}
            </div>
          )}
          <div>
            <div className="label mb-1">Parameter groups to affect {s.categories.length === 0 && <span className="normal-case">(all)</span>}</div>
            <div className="flex flex-wrap gap-1">
              {MUTATION_CATEGORIES.filter((c) => presentCats.has(c.id)).map((c) => {
                const on = s.categories.includes(c.id as MutationCategory);
                return (
                  <button key={c.id} className={`chip ${on ? 'text-fg' : ''}`} style={{ borderColor: on ? c.color : undefined }} onClick={() => set({ categories: toggle(s.categories, c.id as MutationCategory) })} aria-pressed={on}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Toggle checked={s.allowReverse} onChange={(v) => set({ allowReverse: v })} label="Allow animation direction reversal" />
        </>
      )}
      {showAll && s.levels.math && (
        <div>
          <div className="label mb-1">Mathematical operations</div>
          {MATH_OPS.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={s.mathOps.includes(o.id)} onChange={() => set({ mathOps: toggle(s.mathOps, o.id) })} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {showAll && s.levels.structural && (
        <div>
          <div className="label mb-1">Structural operations</div>
          {STRUCT_OPS.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={s.structOps.includes(o.id)} onChange={() => set({ structOps: toggle(s.structOps, o.id) })} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {locked.length > 0 && (
        <p className="text-2xs text-muted">
          <Lock size={10} className="inline" /> {locked.length} locked parameter{locked.length > 1 ? 's' : ''} will not change.
        </p>
      )}
    </div>
  );
}

/** Apply one mutation to the working copy (non-destructive: recorded in history). */
export function mutateOnce(): void {
  const ws = useWorkspace.getState();
  const p = ws.project;
  if (!p) return;
  const lab = useLab.getState();
  const seed = randomSeed();
  const spec = generateVariant({ fragment: p.fragment, format: p.format, params: p.params, values: p.values, locked: p.locked }, { ...lab.settings, seed }, 0);
  if (!spec.ops.length) {
    toast('info', 'Nothing to mutate with the current settings (are all parameters locked?).');
    return;
  }
  let valid = true;
  let error: string | undefined;
  if (spec.sourceChanged) {
    const out = validateShader({ fragment: spec.fragment, format: p.format, vertex: p.vertex, params: spec.params });
    valid = out.ok;
    error = out.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message).join('\n');
  }
  ws.recordMutation({ name: `Mutation ${p.history.length + 1}`, seed, strength: spec.strength, level: spec.level, ops: spec.ops, fragment: spec.fragment, values: spec.values, params: spec.params, valid, error }, true);
  if (!valid) toast('error', `Mutation (seed ${seed}) failed to compile and was recorded as invalid. The current shader is unchanged.`);
  else toast('success', `Applied ${spec.ops.length} change${spec.ops.length > 1 ? 's' : ''} (seed ${seed}). Undo with Ctrl+Z.`);
}

function MutateTab() {
  const grid = useLab((s) => s.grid);
  const setGrid = useLab((s) => s.setGrid);
  return (
    <div className="flex flex-col gap-4 p-3">
      <MutationSettingsForm />
      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <button className="btn btn-primary" onClick={mutateOnce} data-testid="mutate-once">
          <FlaskConical size={14} /> Mutate current shader
        </button>
        <div className="flex gap-1">
          <select className="input w-24" value={grid} onChange={(e) => setGrid(Number(e.target.value) as 2 | 3 | 4)} aria-label="Grid size">
            <option value={2}>2×2</option>
            <option value={3}>3×3</option>
            <option value={4}>4×4</option>
          </select>
          <button
            className="btn flex-1"
            onClick={() => {
              useLab.getState().generate();
              navigate('gallery');
            }}
          >
            <LayoutGrid size={14} /> Generate variant grid
          </button>
        </div>
        <p className="text-2xs text-muted">The source shader is never overwritten: every applied mutation is recorded in History with its seed and operations, and can be undone or restored.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- modulation

function ModulateTab() {
  const params = useWorkspace((s) => s.project?.params ?? EMPTY_ARR);
  const selected = useWorkspace((s) => s.selectedParam);
  const modulations = useWorkspace((s) => s.project?.modulations ?? EMPTY_OBJ);
  const { select, setModulation } = useWorkspace.getState();
  const def = params.find((p) => p.name === selected) ?? params.find((p) => p.type !== 'bool') ?? params[0];
  if (!def) return <Empty>No parameters to modulate.</Empty>;
  const m = modulations[def.name];
  const scalars = params.filter((p) => componentCount(p.type) === 1 && p.type !== 'bool' && p.name !== def.name);
  const update = (patch: Partial<typeof m>) => setModulation(def.name, { ...(m ?? defaultModulation()), ...patch });
  const exprError = m?.kind === 'expression' ? validateExpression(m.expression ?? '') : null;
  const active = Object.entries(modulations).filter(([, x]) => x.enabled);
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field label="Parameter">
        <select className="input" value={def.name} onChange={(e) => select(e.target.value)}>
          {params.map((p) => (
            <option key={p.name} value={p.name}>
              {p.label} {modulations[p.name]?.enabled ? '〜' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source">
        <select className="input" value={m?.kind ?? 'constant'} onChange={(e) => (e.target.value === 'constant' ? setModulation(def.name, null) : update({ kind: e.target.value as ModulationKind, enabled: true }))} data-testid="mod-kind">
          {MODULATION_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      {m && m.kind !== 'constant' && (
        <>
          <Toggle checked={m.enabled} onChange={(v) => update({ enabled: v })} label="Enabled" />
          {['sine', 'triangle', 'saw', 'square', 'random', 'noise'].includes(m.kind) && (
            <>
              <Field label={`Rate · ${m.rate.toFixed(3)} Hz`}>
                <input type="range" min={0.01} max={4} step={0.01} value={m.rate} onChange={(e) => update({ rate: Number(e.target.value) })} style={{ ['--fill' as string]: `${(m.rate / 4) * 100}%` }} />
              </Field>
              <Field label={`Depth · ${Math.round(m.depth * 100)}% of range`}>
                <input type="range" min={0} max={1} step={0.01} value={m.depth} onChange={(e) => update({ depth: Number(e.target.value) })} style={{ ['--fill' as string]: `${m.depth * 100}%` }} />
              </Field>
              <Field label={`Phase · ${m.phase.toFixed(2)}`}>
                <input type="range" min={0} max={1} step={0.01} value={m.phase} onChange={(e) => update({ phase: Number(e.target.value) })} style={{ ['--fill' as string]: `${m.phase * 100}%` }} />
              </Field>
            </>
          )}
          {m.kind === 'link' && (
            <>
              <Field label="Follow parameter">
                <select className="input" value={m.source ?? ''} onChange={(e) => update({ source: e.target.value })}>
                  <option value="">—</option>
                  {scalars.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Link depth · ${Math.round(m.depth * 100)}%`}>
                <input type="range" min={0} max={1} step={0.01} value={m.depth} onChange={(e) => update({ depth: Number(e.target.value) })} style={{ ['--fill' as string]: `${m.depth * 100}%` }} />
              </Field>
            </>
          )}
          {m.kind === 'expression' && (
            <Field label="Expression" hint="Variables: t, base, min, max, pi, tau. Functions: sin, cos, abs, fract, mod, mix, clamp, smoothstep, noise, …">
              <input className={`input font-mono ${exprError ? 'border-danger' : ''}`} value={m.expression ?? ''} onChange={(e) => update({ expression: e.target.value })} aria-invalid={!!exprError} />
              {exprError && <span className="text-2xs text-danger">{exprError}</span>}
            </Field>
          )}
          {m.kind === 'keyframes' && (
            <p className="text-2xs text-muted">
              Edit keyframes in the <b>Timeline</b> tab of the bottom dock. {m.keyframes?.length ?? 0} keyframe(s), loop {m.duration ?? 4}s.
            </p>
          )}
        </>
      )}
      <div className="border-t border-line pt-3">
        <div className="label mb-1">Active modulations</div>
        {active.length === 0 && <p className="text-2xs text-muted">None. Parameters are static.</p>}
        {active.map(([name, x]) => (
          <button key={name} className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-xs hover:bg-panel2" onClick={() => select(name)}>
            <span>
              <Waves size={11} className="mr-1 inline text-accent" />
              {params.find((p) => p.name === name)?.label ?? name}
            </span>
            <span className="text-muted">{MODULATION_KINDS.find((k) => k.id === x.kind)?.label}</span>
          </button>
        ))}
        <div className="mt-2 flex gap-1">
          <button className="btn flex-1" onClick={() => mainClock.restart()}>
            Reset time
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- channels

function ChannelsTab() {
  const channels = useWorkspace((s) => s.project?.channels ?? EMPTY_ARR);
  const { setChannel } = useWorkspace.getState();
  const [assets, setAssets] = useState<{ id: string; name: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef(0);
  const loadAssets = async () => setAssets((await repository.listAssets()).map((a) => ({ id: a.id, name: a.name })));
  return (
    <div className="flex flex-col gap-3 p-3" onFocus={() => void loadAssets()} onPointerEnter={() => void loadAssets()}>
      <p className="text-2xs text-muted">Textures bound to iChannel0–3 (Shadertoy and GL Transition formats; GL Transitions read iChannel0 as “from” and iChannel1 as “to”). Images are stored locally with the project.</p>
      {channels.map((c, i) => (
        <div key={i} className="rounded-md border border-line p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-xs">iChannel{i}</span>
            <button
              className="btn-icon h-6 w-6"
              title="Upload image"
              aria-label={`Upload image to iChannel${i}`}
              onClick={() => {
                target.current = i;
                fileRef.current?.click();
              }}
            >
              <Upload size={13} />
            </button>
          </div>
          <select className="input" value={c.assetId ?? ''} onChange={(e) => void setChannel(i, { ...c, assetId: e.target.value || null })} aria-label={`iChannel${i} source`}>
            <option value="">— none (black) —</option>
            <optgroup label="Built-in">
              {BUILTIN_TEXTURES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            {(assets.length > 0 || (c.assetId && !c.assetId.startsWith('builtin:'))) && (
              <optgroup label="Uploaded">
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                {c.assetId && !c.assetId.startsWith('builtin:') && !assets.some((a) => a.id === c.assetId) && <option value={c.assetId}>{c.assetId}</option>}
              </optgroup>
            )}
          </select>
          <div className="mt-1 flex gap-1">
            <select className="input" value={c.filter} onChange={(e) => void setChannel(i, { ...c, filter: e.target.value as 'linear' | 'nearest' })} aria-label="Filter">
              <option value="linear">Linear</option>
              <option value="nearest">Nearest</option>
            </select>
            <select className="input" value={c.wrap} onChange={(e) => void setChannel(i, { ...c, wrap: e.target.value as 'repeat' | 'clamp' | 'mirror' })} aria-label="Wrap">
              <option value="repeat">Repeat</option>
              <option value="clamp">Clamp</option>
              <option value="mirror">Mirror</option>
            </select>
          </div>
        </div>
      ))}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > 16 * 1024 * 1024) return toast('error', 'Image is larger than 16 MB.');
          const id = uid('a_');
          await repository.putAsset({ id, name: f.name, mime: f.type || 'image/png', blob: f, createdAt: Date.now() });
          forgetChannel(id);
          const c = useWorkspace.getState().project?.channels[target.current];
          await setChannel(target.current, { filter: c?.filter ?? 'linear', wrap: c?.wrap ?? 'repeat', assetId: id });
          await loadAssets();
          toast('success', `Bound ${f.name} to iChannel${target.current}.`);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- container

export function ControlPanel({ onClose }: { onClose?: () => void }) {
  const tab = useUI((s) => s.rightTab);
  const set = useUI((s) => s.set);
  const count = useWorkspace((s) => s.project?.params.length ?? 0);
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" data-testid="control-panel">
      <Tabs<RightTab>
        value={tab}
        onChange={(t) => set({ rightTab: t })}
        tabs={[
          { id: 'params', label: `Params ${count ? `(${count})` : ''}` },
          { id: 'mutate', label: 'Mutate' },
          { id: 'modulate', label: 'Modulate' },
          { id: 'channels', label: 'Channels' },
        ]}
        right={
          onClose && (
            <button className="btn-icon h-6 w-6" onClick={onClose} aria-label="Hide controls" title="Hide controls">
              <X size={13} />
            </button>
          )
        }
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === 'params' && <ParamsTab />}
        {tab === 'mutate' && <MutateTab />}
        {tab === 'modulate' && <ModulateTab />}
        {tab === 'channels' && <ChannelsTab />}
      </div>
    </div>
  );
}
