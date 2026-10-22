/**
 * Landscape & Waterscape studio: a purpose-built interface over the
 * Landscape Studio shader — scene presets, world generation, and grouped
 * terrain / water / sky / camera controls, with save-to-library, PNG export
 * and hand-off to the full editor.
 */
import { ArrowLeft, Box, Camera, Sprout, Trees, Code2, Dice5, Eye, Maximize2, Mountain, Pause, Play, Save, Shuffle, Sparkles, Undo2, Waves } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ParamField } from '../components/ParamField';
import { ShaderCanvas } from '../components/ShaderCanvas';
import { navigate } from '../hooks/useHashRoute';
import { useIsMobile } from '../hooks/useMediaQuery';
import { randomSeed } from '../mutations/rng';
import { getPreset } from '../presets/catalog';
import { Clock } from '../renderer/clock';
import type { ShaderRenderer } from '../renderer/engine';
import type { ChannelBinding } from '../types/shader';
import { requestThumbnail } from '../renderer/offscreen';
import { useLibrary } from '../state/library';
import { useSettings } from '../state/settings';
import { openInEditor } from '../state/openInEditor';
import { toast } from '../state/ui';
import { forkProject, projectFromPreset } from '../storage/project';
import { repository } from '../storage/repository';
import { downloadBlob, imageDataToBlob, safeFilename } from '../utils/download';
import { BIOMES, randomBiome } from './biomes';
import { ElevationPanel } from './ElevationPanel';
import { LANDSCAPE_SCENES, type LandscapeScene } from './scenes';
import { paramDef, randomWorld, RENDER_MODES, renderMode, sceneValues, useLandscape, varyWorld, type RenderMode } from './store';

type Tab = 'scenes' | 'Terrain' | 'Elevation' | 'Vegetation' | 'Blocks' | 'Water' | 'Sky' | 'Camera';
const GROUP_COLORS: Record<string, string> = { Elevation: '#eab308', Vegetation: '#22c55e', Blocks: '#f97316', Terrain: '#a3e635', Water: '#38bdf8', Sky: '#fbbf24', Camera: '#c084fc' };

const thumbCache = new Map<string, string>();

function SceneCard({ scene, active, onPick, mode }: { scene: LandscapeScene; active: boolean; onPick: () => void; mode: RenderMode }) {
  const key = `${mode}:${scene.id}`;
  const [src, setSrc] = useState(thumbCache.get(key));
  useEffect(() => {
    if (src) return;
    const job = requestThumbnail({
      input: { fragment: renderMode(mode).source, format: 'shadertoy', params: renderMode(mode).params },
      values: { ...sceneValues(scene.id), uQuality: 0 },
      time: 3,
      width: 192,
      height: 108,
      priority: 6,
    });
    void job.promise.then((r) => {
      if (r.dataUrl) {
        thumbCache.set(key, r.dataUrl);
        setSrc(r.dataUrl);
      }
    });
    return job.cancel;
  }, [key, src, mode, scene.id]);
  const Icon = scene.kind === 'water' ? Waves : scene.kind === 'land' ? Mountain : Sparkles;
  return (
    <button className={`group overflow-hidden rounded-lg border text-left ${active ? 'border-accent' : 'border-line hover:border-muted'}`} onClick={onPick} data-testid="scene-card" data-scene={scene.id} title={scene.description}>
      <div className="aspect-video bg-bg">{src && <img src={src} alt="" className="h-full w-full object-cover" />}</div>
      <div className="flex items-center gap-1 px-2 py-1">
        <Icon size={11} className="shrink-0 text-muted" />
        <span className="truncate text-2xs font-medium">{scene.name}</span>
      </div>
    </button>
  );
}

function QuickRow({ label, items }: { label: string; items: { label: string; onClick: () => void; active?: boolean }[] }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {items.map((i) => (
          <button key={i.label} className={`chip ${i.active ? 'border-accent bg-accent/15 text-fg' : 'hover:text-fg'}`} onClick={i.onClick}>
            {i.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Data-derived uniforms are set from the loaded DEM, not edited by hand.
const HIDDEN_FIELDS = ['uTerrainSource', 'uDemMin', 'uDemMax', 'uDemSizeM', 'uDemAspect'];

function GroupControls({ group }: { group: Exclude<Tab, 'scenes'> }) {
  const values = useLandscape((s) => s.values);
  const set = useLandscape((s) => s.set);
  const setMany = useLandscape((s) => s.setMany);
  const mode = useLandscape((s) => s.mode);
  const defs = renderMode(mode).params.filter((d) => d.group === group && !HIDDEN_FIELDS.includes(d.name));
  const h = values.uHeight as number;
  const wl = values.uWaterLevel as number;
  const se = values.uSunElevation as number;
  const quick =
    group === 'Water' ? (
      <QuickRow
        label="Water body"
        items={[
          { label: 'None (dry land)', onClick: () => setMany({ uWaterLevel: -0.5 }), active: wl <= -0.45 },
          { label: 'Lakes & rivers', onClick: () => setMany({ uWaterLevel: Number((h * 0.18).toFixed(3)), uWaveHeight: 0.12 }) },
          { label: 'Coastline', onClick: () => setMany({ uWaterLevel: Number((h * 0.32).toFixed(3)), uWaveHeight: 0.4 }) },
          { label: 'Flooded', onClick: () => setMany({ uWaterLevel: Number((h * 0.55).toFixed(3)), uWaveHeight: 0.5 }) },
          { label: 'Open sea', onClick: () => setMany({ uWaterLevel: Number((h * 1.2 + 0.2).toFixed(3)), uWaveHeight: 0.7 }) },
        ]}
      />
    ) : group === 'Sky' ? (
      <QuickRow
        label="Time of day"
        items={[
          { label: 'Dawn', onClick: () => setMany({ uSunElevation: 0.06, uSunAzimuth: 1.4 }), active: se > 0 && se < 0.1 },
          { label: 'Morning', onClick: () => setMany({ uSunElevation: 0.4, uSunAzimuth: 1.9 }) },
          { label: 'Noon', onClick: () => setMany({ uSunElevation: 1.2 }) },
          { label: 'Golden hour', onClick: () => setMany({ uSunElevation: 0.12, uSunAzimuth: 4.6 }) },
          { label: 'Night', onClick: () => setMany({ uSunElevation: -0.12 }), active: se < 0 },
        ]}
      />
    ) : group === 'Elevation' ? (
      <ElevationPanel />
    ) : group === 'Vegetation' ? (
      <div className="flex flex-col gap-2">
        <div className="label">Biome</div>
        <div className="grid grid-cols-2 gap-1">
          {BIOMES.map((b) => (
            <button key={b.id} className="chip justify-center py-1 hover:text-fg" title={b.description} onClick={() => setMany(b.values)} data-testid={`biome-${b.id}`}>
              <Trees size={11} /> {b.name}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <button className="btn flex-1" onClick={() => setMany({ uVegSeed: Math.floor(Math.random() * 1000) })} title="Same settings, new placement" data-testid="regrow">
            <Sprout size={13} /> Regrow
          </button>
          <button className="btn flex-1" onClick={() => setMany(randomBiome(randomSeed()))} title="A random blend of two biomes" data-testid="random-biome">
            <Dice5 size={13} /> Random biome
          </button>
        </div>
        <p className="text-2xs text-muted">Trees, shrubs and cacti are placed procedurally from the vegetation seed, avoiding water, steep slopes and ground above the tree line. Distant forests become canopy texture.</p>
      </div>
    ) : group === 'Blocks' ? (
      <QuickRow
        label="Look"
        items={[
          { label: 'Chunky blocks', onClick: () => setMany({ uBlockSize: 0.2 }) },
          { label: 'Standard', onClick: () => setMany({ uBlockSize: 0.12 }), active: values.uBlockSize === 0.12 },
          { label: 'Fine blocks', onClick: () => setMany({ uBlockSize: 0.07 }) },
          { label: 'Flat colours', onClick: () => setMany({ uPixelTexture: 0, uEdges: 0.6 }) },
          { label: 'Pixel textures', onClick: () => setMany({ uPixelTexture: 1, uEdges: 0.35 }) },
        ]}
      />
    ) : group === 'Camera' ? (
      <QuickRow
        label="Shot"
        items={[
          { label: 'Flyover', onClick: () => setMany({ uFlySpeed: 0.45, uAltitude: 0.6, uPitch: -0.12 }) },
          { label: 'Aerial', onClick: () => setMany({ uFlySpeed: 0.3, uAltitude: 2.5, uPitch: -0.45, uFov: 1.3 }) },
          { label: 'Ground level', onClick: () => setMany({ uFlySpeed: 0.15, uAltitude: 0.12, uPitch: 0.02, uFov: 1.6 }) },
          { label: 'Hold still', onClick: () => setMany({ uFlySpeed: 0 }), active: values.uFlySpeed === 0 },
          { label: 'Wide lens', onClick: () => setMany({ uFov: 0.9 }) },
        ]}
      />
    ) : (
      <QuickRow
        label="Generate"
        items={[
          { label: 'New seed', onClick: () => setMany({ uSeed: Math.floor(Math.random() * 1000) }) },
          { label: 'Taller', onClick: () => setMany({ uHeight: Math.min(4, h * 1.25) }) },
          { label: 'Flatter', onClick: () => setMany({ uHeight: Math.max(0.1, h * 0.8) }) },
          { label: 'No snow', onClick: () => setMany({ uSnowLine: 4 }) },
        ]}
      />
    );
  return (
    <div className="flex flex-col gap-4 p-3" data-testid={`group-${group}`}>
      {quick}
      {defs.map((d) => (
        <ParamField key={d.name} def={d} value={values[d.name]} color={GROUP_COLORS[group]} onChange={(v) => set(d.name, v)} />
      ))}
    </div>
  );
}

export function LandscapePage() {
  const mobile = useIsMobile();
  const values = useLandscape((s) => s.values);
  const sceneId = useLandscape((s) => s.sceneId);
  const canUndo = useLandscape((s) => s.history.length > 0);
  const { applyScene, setMany, undo } = useLandscape.getState();
  const [tab, setTab] = useState<Tab>(mobile ? 'scenes' : 'Terrain');
  const [playing, setPlaying] = useState(true);
  const [res, setRes] = useState(() => Math.min(0.75, useSettings.getState().pixelRatio));
  const [exportSize, setExportSize] = useState('1920x1080');
  const [compileError, setCompileError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const clock = useMemo(() => new Clock(), []);
  const rendererRef = useRef<ShaderRenderer | null>(null);
  const mode = useLandscape((s) => s.mode);
  const setMode = useLandscape((s) => s.setMode);
  const shader = renderMode(mode);
  const preset = getPreset(shader.presetId)!;
  const dem = useLandscape((s) => s.dem);
  const usingDem = values.uTerrainSource === 1 && !!dem;
  const channels = useMemo<ChannelBinding[]>(() => (usingDem && dem ? [{ assetId: dem.assetId, filter: 'nearest', wrap: 'clamp' }] : []), [usingDem, dem]);

  const togglePlay = () => {
    if (clock.playing) clock.pause();
    else clock.play();
    setPlaying(clock.playing);
  };
  const exportPng = async () => {
    const r = rendererRef.current;
    if (!r) return;
    const [w, h] = exportSize.split('x').map(Number);
    toast('info', `Rendering ${w}×${h}…`);
    await new Promise((res) => setTimeout(res, 30));
    const img = r.renderToPixels(w, h);
    downloadBlob(await imageDataToBlob(img), `landscape-${safeFilename(LANDSCAPE_SCENES.find((s) => s.id === sceneId)?.name ?? 'custom')}-${img.width}x${img.height}.png`);
  };
  const project = () => {
    const base = projectFromPreset(preset);
    base.values = { ...base.values, ...values };
    if (channels.length) base.channels = [...channels, ...base.channels.slice(1)];
    if (usingDem && dem) {
      base.description = `${base.description}\nTerrain: ${dem.label} (${dem.source}).`;
      base.provenance = { ...base.provenance, notice: `${base.provenance.notice ?? ''}\n\nElevation data: ${dem.attribution}`.trim() };
    }
    return base;
  };
  const save = async () => {
    const def = LANDSCAPE_SCENES.find((s) => s.id === sceneId)?.name ?? 'My landscape';
    const name = prompt('Save landscape as', def);
    if (!name?.trim()) return;
    const p = forkProject(project(), name.trim(), 'user');
    p.category = 'Terrain & Landscape';
    p.tags = Array.from(new Set([...p.tags, 'landscape-studio', ...(mode === 'blocks' ? ['blocks'] : [])]));
    const r = rendererRef.current;
    if (r) {
      const img = r.renderToPixels(320, 180);
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      c.getContext('2d')!.putImageData(img, 0, 0);
      p.thumbnail = c.toDataURL('image/webp', 0.82);
    }
    await repository.put(p);
    await useLibrary.getState().refresh();
    toast('success', `Saved "${p.name}" to My shaders.`, { label: 'Open in viewer', run: () => navigate('view', p.id) });
  };
  const fullscreen = () => {
    const el = document.querySelector('[data-testid="landscape-view"]');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el?.requestFullscreen?.().catch(() => toast('warn', 'Fullscreen is not available here.'));
  };

  const groupTabs: Tab[] = mode === 'blocks' ? ['Terrain', 'Elevation', 'Vegetation', 'Blocks', 'Water', 'Sky', 'Camera'] : ['Terrain', 'Elevation', 'Vegetation', 'Water', 'Sky', 'Camera'];
  const tabs: Tab[] = mobile ? ['scenes', ...groupTabs] : groupTabs;
  const activeTab: Tab = tabs.includes(tab) ? tab : tabs[mobile ? 1 : 0];
  const scenes = (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => setMany(randomWorld(randomSeed(), values))} data-testid="new-world" title="Random terrain style, seed, water, sky">
          <Dice5 size={13} /> New world
        </button>
        <button className="btn" onClick={() => setMany(varyWorld(values))} title="Small variation of the current world (camera kept)">
          <Shuffle size={13} /> Vary
        </button>
        <button className="btn" onClick={() => setMany(randomWorld(randomSeed(), values, { water: 'land' }))}>
          <Mountain size={13} /> Landscape
        </button>
        <button className="btn" onClick={() => setMany(randomWorld(randomSeed(), values, { water: 'water' }))}>
          <Waves size={13} /> Waterscape
        </button>
      </div>
      <div className="label">Scenes</div>
      <div className="grid grid-cols-2 gap-2">
        {LANDSCAPE_SCENES.map((s) => (
          <SceneCard key={`${mode}-${s.id}`} scene={s} mode={mode} active={sceneId === s.id} onPick={() => applyScene(s.id)} />
        ))}
      </div>
    </div>
  );

  const viewport = (
    <div className="relative h-full min-h-0 bg-black" data-testid="landscape-view">
      <ShaderCanvas
        label="Landscape render"
        fragment={shader.source}
        format="shadertoy"
        params={shader.params}
        channels={channels}
        values={values}
        clock={clock}
        pixelRatio={res}
        maxPixels={mobile ? 0.5e6 : 2.2e6}
        onRenderer={(r) => (rendererRef.current = r)}
        onCompile={(o) => setCompileError(o.ok ? null : o.diagnostics.find((d) => d.severity === 'error')?.message ?? 'error')}
        onStats={(s) => setFps(Math.round(s.fps))}
      />
      {compileError && <div className="absolute inset-x-4 top-4 rounded bg-black/80 p-2 text-xs text-danger">Landscape shader failed to compile: {compileError}</div>}
      <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/50 px-2 py-0.5 font-mono text-2xs text-white/80">
        {playing ? `${fps} fps` : 'paused'} · drag to look
      </div>
      <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-white backdrop-blur">
        <button className="rounded p-1.5 hover:bg-white/15" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause flight & waves' : 'Play'}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="rounded p-1.5 hover:bg-white/15 disabled:opacity-30" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo last change">
          <Undo2 size={15} />
        </button>
        <select className="rounded bg-transparent px-1 text-2xs" value={res} onChange={(e) => setRes(Number(e.target.value))} aria-label="Preview resolution" title="Preview resolution">
          {Array.from(new Set([0.35, 0.5, 0.75, 1, 1.5, res])).sort((a, b) => a - b).map((r) => (
            <option key={r} value={r} className="text-black">
              {Math.round(r * 100)}% res
            </option>
          ))}
        </select>
        <select className="rounded bg-transparent px-1 text-2xs" value={values.uQuality as number} onChange={(e) => setMany({ uQuality: Number(e.target.value) })} aria-label="Render quality">
          {paramDef('uQuality')!.options!.map((o) => (
            <option key={o.value} value={o.value} className="text-black">
              {o.label} quality
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <select className="rounded bg-transparent px-1 text-2xs" value={exportSize} onChange={(e) => setExportSize(e.target.value)} aria-label="Export size">
            {['1280x720', '1920x1080', '2560x1440', '3840x2160', '2048x2048', '1080x1920'].map((s) => (
              <option key={s} value={s} className="text-black">
                {s.replace('x', '×')}
              </option>
            ))}
          </select>
          <button className="rounded p-1.5 hover:bg-white/15" onClick={() => void exportPng()} aria-label="Export PNG" title="Export PNG at the chosen size">
            <Camera size={15} />
          </button>
          <button className="rounded p-1.5 hover:bg-white/15" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col" data-testid="landscape">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <button className="btn btn-ghost px-2" onClick={() => navigate('workspace')} title="Back to the editor">
          <ArrowLeft size={15} /> <span className="hidden sm:inline">Editor</span>
        </button>
        <div className="flex items-center gap-2">
          <Mountain size={16} className="text-accent" />
          <span className="hidden text-sm font-semibold sm:inline">Landscape & Waterscape</span>
        </div>
        <div className="ml-2 flex rounded-md border border-line p-0.5" role="radiogroup" aria-label="Render style">
          {RENDER_MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${mode === m.id ? 'bg-accent text-black' : 'text-muted hover:text-fg'}`}
              onClick={() => setMode(m.id)}
              data-testid={`mode-${m.id}`}
              title={m.id === 'blocks' ? 'Blocky voxel world with pixel-art textures' : 'Smooth raymarched terrain and water'}
            >
              {m.id === 'blocks' ? <Box size={12} /> : <Mountain size={12} />}
              {m.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost px-2" onClick={() => void save()} title="Save to My shaders" data-testid="landscape-save">
            <Save size={15} /> <span className="hidden md:inline">Save</span>
          </button>
          <button className="btn btn-ghost px-2" onClick={() => void openInEditor(project(), values)} title="Open in the full editor (code, mutation lab, export)" data-testid="landscape-edit">
            <Code2 size={15} /> <span className="hidden md:inline">Open in editor</span>
          </button>
          <button className="btn btn-ghost px-2" onClick={() => navigate('view')} title="Simple viewer">
            <Eye size={15} /> <span className="hidden md:inline">Viewer</span>
          </button>
        </div>
      </header>
      {mobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-[45%] shrink-0">{viewport}</div>
          <div className="flex shrink-0 overflow-x-auto border-b border-line bg-panel" role="tablist">
            {tabs.map((t) => (
              <button key={t} role="tab" aria-selected={activeTab === t} className={`tab flex-1 ${activeTab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
                {t === 'scenes' ? 'Scenes' : t}
              </button>
            ))}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto bg-panel">{activeTab === 'scenes' ? scenes : <GroupControls group={activeTab} />}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="scroll-thin w-72 shrink-0 overflow-y-auto border-r border-line bg-panel">{scenes}</aside>
          <main className="min-w-0 flex-1">{viewport}</main>
          <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
            <div className="flex shrink-0 border-b border-line" role="tablist">
              {tabs.map((t) => (
                <button key={t} role="tab" aria-selected={activeTab === t} className={`tab flex-1 ${activeTab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)} style={activeTab === t ? { borderColor: GROUP_COLORS[t] } : undefined}>
                  {t}
                </button>
              ))}
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{activeTab !== 'scenes' && <GroupControls group={activeTab} />}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

