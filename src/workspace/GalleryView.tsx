import { ArrowLeft, Columns2, Dice5, Heart, Loader2, Pencil, RefreshCw, Save, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Empty } from '../components/ui';
import { navigate } from '../hooks/useHashRoute';
import { useLab, type GalleryVariant } from '../state/lab';
import { useLibrary } from '../state/library';
import { toast } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import { MutationSettingsForm } from './ControlPanel';

function recordVariant(v: GalleryVariant, apply: boolean) {
  const ws = useWorkspace.getState();
  const p = ws.project;
  if (!p) return null;
  if (v.nodeId && !apply) return p.history.find((h) => h.id === v.nodeId) ?? null;
  const node = ws.recordMutation(
    {
      name: `Variant s${v.spec.seed}`,
      seed: v.spec.seed,
      strength: v.spec.strength,
      level: v.spec.level,
      ops: v.spec.ops,
      fragment: v.spec.fragment,
      values: v.spec.values,
      params: v.spec.params,
      valid: v.status !== 'invalid',
      error: v.error,
      thumbnail: v.thumb,
      favorite: v.favorite,
    } as Parameters<typeof ws.recordMutation>[0],
    apply,
  );
  if (node) useLab.getState().setNodeId(v.key, node.id);
  return node;
}

function VariantCard({ v }: { v: GalleryVariant }) {
  const lab = useLab.getState();
  const projectId = useWorkspace((s) => s.project?.id);
  const levelColor = ['text-muted', 'text-sky-400', 'text-amber-400', 'text-rose-400'][v.spec.level];
  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border ${v.status === 'invalid' ? 'border-danger/50' : v.favorite ? 'border-accent/70' : 'border-line'} bg-panel`} data-testid="variant-card" data-status={v.status}>
      <div className="relative aspect-video bg-black">
        {v.thumb && <img src={v.thumb} alt={`Variant seed ${v.spec.seed}`} className={`h-full w-full object-cover ${v.status === 'pending' ? 'opacity-50' : ''}`} />}
        {v.status === 'pending' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="animate-spin text-white/70" size={20} />
          </div>
        )}
        {v.status === 'invalid' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center text-2xs text-danger" title={v.error}>
            <TriangleAlert size={18} /> Invalid — failed to compile
            <span className="line-clamp-2 font-mono text-white/60">{v.error}</span>
          </div>
        )}
        <button className={`absolute right-1 top-1 rounded-full bg-black/60 p-1 ${v.favorite ? 'text-danger' : 'text-white/70'}`} onClick={() => lab.toggleFavorite(v.key)} aria-label="Favourite" title="Mark as favourite">
          <Heart size={13} fill={v.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <div className="flex items-center gap-2 text-2xs">
          <span className="font-mono">seed {v.spec.seed}</span>
          <span className="text-muted">str {Math.round(v.spec.strength * 100)}%</span>
          <span className={`ml-auto font-semibold ${levelColor}`}>{v.spec.level ? `L${v.spec.level}` : 'no-op'}</span>
        </div>
        <div className="line-clamp-2 min-h-[2rem] text-2xs text-muted" title={v.spec.ops.map((o) => o.description).join('\n')}>
          {v.spec.ops.length ? `${v.spec.ops.length} change(s): ${v.spec.ops.map((o) => o.description).join('; ')}` : 'No changes (all targets locked or probability too low).'}
        </div>
        <div className="mt-auto flex items-center gap-0.5">
          <button
            className="btn flex-1 py-1"
            disabled={v.status !== 'ok'}
            onClick={() => {
              recordVariant(v, true);
              navigate('workspace', projectId);
              toast('success', 'Variant applied. The previous version is in History; Ctrl+Z to undo.');
            }}
            data-testid="variant-open"
          >
            <Pencil size={12} /> Open
          </button>
          <button
            className="btn-icon"
            disabled={v.status !== 'ok'}
            title="Save as a new shader in My shaders"
            aria-label="Save as new shader"
            onClick={async () => {
              const node = recordVariant(v, false);
              if (!node) return;
              const saved = await useWorkspace.getState().saveNodeAsProject(node.id);
              await useLibrary.getState().refresh();
              if (saved) toast('success', `Saved "${saved.name}".`);
            }}
          >
            <Save size={13} />
          </button>
          <button
            className="btn-icon"
            disabled={v.status !== 'ok'}
            title="Compare A/B with the current shader"
            aria-label="Compare"
            onClick={() => {
              useWorkspace.getState().setCompare({ name: `Variant s${v.spec.seed}`, fragment: v.spec.fragment, values: v.spec.values, params: v.spec.params });
              navigate('compare');
            }}
          >
            <Columns2 size={13} />
          </button>
          <button className="btn-icon" title="Regenerate with a new seed" aria-label="Regenerate" onClick={() => lab.regenerate(v.key)}>
            <RefreshCw size={13} />
          </button>
          <button className="btn-icon" title="Delete" aria-label="Delete variant" onClick={() => lab.remove(v.key)}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function GalleryView() {
  const lab = useLab();
  const project = useWorkspace((s) => s.project);
  const [showSettings, setShowSettings] = useState(true);
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[lab.grid];
  const done = lab.variants.filter((v) => v.status !== 'pending').length;
  return (
    <div className="flex h-full min-h-0" data-testid="gallery">
      {showSettings && (
        <aside className="scroll-thin hidden w-72 shrink-0 overflow-y-auto border-r border-line bg-panel p-3 md:block">
          <MutationSettingsForm />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
          <button className="btn" onClick={() => navigate('workspace', project?.id)}>
            <ArrowLeft size={13} /> Workspace
          </button>
          <button className="btn hidden md:inline-flex" onClick={() => setShowSettings(!showSettings)} aria-pressed={showSettings}>
            <Settings2 size={13} /> Settings
          </button>
          <span className="text-xs text-muted">
            Variants of <b className="text-fg">{project?.name}</b> {lab.variants.length > 0 && `· ${done}/${lab.variants.length} rendered · seed ${lab.settings.seed}`}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select className="input w-20" value={lab.grid} onChange={(e) => lab.setGrid(Number(e.target.value) as 2 | 3 | 4)} aria-label="Grid size">
              <option value={2}>2×2</option>
              <option value={3}>3×3</option>
              <option value={4}>4×4</option>
            </select>
            <label className="flex items-center gap-1 text-2xs text-muted" title="Animation time used for previews (synchronised across all variants)">
              t
              <input type="range" min={0} max={20} step={0.5} value={lab.previewTime} onChange={(e) => lab.setPreviewTime(Number(e.target.value))} className="w-24" style={{ ['--fill' as string]: `${(lab.previewTime / 20) * 100}%` }} aria-label="Preview time" />
              <span className="w-8 font-mono">{lab.previewTime}s</span>
            </label>
            <button className="btn" onClick={() => lab.generate()} disabled={!project} title="Regenerate with the same seed (reproducible)">
              <RefreshCw size={13} /> Generate
            </button>
            <button className="btn btn-primary" onClick={() => lab.generate({ newSeed: true })} disabled={!project} data-testid="gallery-new-seed">
              <Dice5 size={13} /> New seed
            </button>
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
          {lab.variants.length === 0 ? (
            <Empty>Press Generate to create a {lab.grid}×{lab.grid} grid of variants from the current shader. Thumbnails render one at a time on a shared offscreen GPU context.</Empty>
          ) : (
            <div className={`grid grid-cols-1 gap-3 ${cols}`}>
              {lab.variants.map((v) => (
                <VariantCard key={v.key} v={v} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
