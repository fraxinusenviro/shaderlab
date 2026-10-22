import { ArrowLeft, Link2, Link2Off, Pause, Play, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty } from '../components/ui';
import { LiveCanvas } from '../components/LiveCanvas';
import { navigate } from '../hooks/useHashRoute';
import { Clock } from '../renderer/clock';
import { useLab } from '../state/lab';
import { useWorkspace } from '../state/workspace';

export function CompareView() {
  const project = useWorkspace((s) => s.project);
  const compareWith = useWorkspace((s) => s.compareWith);
  const setCompare = useWorkspace((s) => s.setCompare);
  const allVariants = useLab((s) => s.variants);
  const variants = useMemo(() => allVariants.filter((v) => v.status === 'ok'), [allVariants]);
  const [synced, setSynced] = useState(true);
  const [playing, setPlaying] = useState(true);
  const clocks = useMemo(() => {
    const shared = new Clock();
    return { shared, a: new Clock(), b: new Clock() };
  }, []);
  const clockA = synced ? clocks.shared : clocks.a;
  const clockB = synced ? clocks.shared : clocks.b;
  const all = [clocks.shared, clocks.a, clocks.b];

  // Candidates for B: gallery variants and valid history nodes.
  const options = [
    ...variants.map((v) => ({ id: `v:${v.key}`, name: `Gallery variant s${v.spec.seed}`, fragment: v.spec.fragment, values: v.spec.values, params: v.spec.params })),
    ...(project?.history ?? []).filter((h) => h.valid).map((h) => ({ id: `h:${h.id}`, name: `History: ${h.name}`, fragment: h.fragment, values: h.values, params: h.params })),
    ...(project ? [{ id: 'orig', name: 'Original source (defaults)', fragment: project.original.fragment, values: {}, params: project.params }] : []),
  ];

  if (!project) return <Empty>Open a shader first.</Empty>;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="compare">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <button className="btn" onClick={() => navigate('workspace', project.id)}>
          <ArrowLeft size={13} /> Workspace
        </button>
        <span className="text-xs text-muted">A/B comparison</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            className="input w-64"
            value=""
            onChange={(e) => {
              const o = options.find((x) => x.id === e.target.value);
              if (o) setCompare({ name: o.name, fragment: o.fragment, values: o.values, params: o.params });
            }}
            aria-label="Choose B"
          >
            <option value="">Choose B… {compareWith ? `(now: ${compareWith.name})` : ''}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button className={`btn ${synced ? 'border-accent/60' : ''}`} onClick={() => setSynced(!synced)} aria-pressed={synced} title="Synchronise animation time between A and B">
            {synced ? <Link2 size={13} /> : <Link2Off size={13} />} {synced ? 'Time synced' : 'Independent time'}
          </button>
          <button
            className="btn"
            onClick={() => {
              all.forEach((c) => (playing ? c.pause() : c.play()));
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button className="btn" onClick={() => all.forEach((c) => c.restart())} title="Restart both">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-px bg-line md:grid-cols-2 md:grid-rows-1">
        <LiveCanvas label={`A · ${project.name} (current)`} fragment={project.fragment} format={project.format} vertex={project.vertex} params={project.params} values={project.values} modulations={project.modulations} channels={project.channels} clock={clockA} />
        {compareWith ? (
          <LiveCanvas label={`B · ${compareWith.name}`} fragment={compareWith.fragment} format={project.format} vertex={project.vertex} params={compareWith.params} values={compareWith.values} modulations={project.modulations} channels={project.channels} clock={clockB} />
        ) : (
          <div className="flex items-center justify-center bg-bg">
            <Empty>Choose a variant, history node or the original source for side B.</Empty>
          </div>
        )}
      </div>
    </div>
  );
}
