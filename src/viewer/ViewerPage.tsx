/**
 * Simple viewer: a full-screen, chrome-light way to watch shaders without the
 * editor. Browse presets and saved shaders, play/pause, shuffle parameters,
 * run a slideshow, take snapshots, go fullscreen, or jump into the editor.
 *
 *   #/view/<id>?slideshow=20&ui=off   (kiosk / embedding)
 */
import { ChevronLeft, ChevronRight, Camera, Sparkles, Code2, Dice5, Info, Maximize2, Mountain, Pause, Play, RotateCcw, SlidersHorizontal, Timer, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsMobile } from '../hooks/useMediaQuery';
import { ParamField } from '../components/ParamField';
import { ShaderCanvas } from '../components/ShaderCanvas';
import { navigate, useHashRoute } from '../hooks/useHashRoute';
import { categoryColor } from '../components/ParamControl';
import { randomSeed } from '../mutations/rng';
import { mutateUniforms } from '../mutations/uniform';
import { PRESETS } from '../presets/catalog';
import { Clock } from '../renderer/clock';
import type { ShaderRenderer } from '../renderer/engine';
import { useLibrary } from '../state/library';
import { openInEditor } from '../state/openInEditor';
import { toast } from '../state/ui';
import { isPresetId, projectFromPreset } from '../storage/project';
import { repository } from '../storage/repository';
import type { ParamValue, ShaderProject } from '../types/shader';
import { downloadBlob, imageDataToBlob, safeFilename } from '../utils/download';

interface Entry {
  id: string;
  name: string;
  group: 'Presets' | 'My shaders';
  /** Picker section: "My shaders" or the preset's category. */
  section: string;
}

const SLIDESHOW = [0, 10, 20, 30, 60];

export function ViewerPage() {
  const route = useHashRoute();
  const summaries = useLibrary((s) => s.summaries);
  const kiosk = route.query.ui === 'off';
  const mobile = useIsMobile();
  const entries: Entry[] = useMemo(
    () => [
      ...summaries.map((s) => ({ id: s.id, name: s.name, group: 'My shaders' as const, section: 'My shaders' })),
      ...PRESETS.map((p) => ({ id: `preset:${p.id}`, name: p.name, group: 'Presets' as const, section: p.category })),
    ],
    [summaries],
  );
  const [project, setProject] = useState<ShaderProject | null>(null);
  const [values, setValues] = useState<Record<string, ParamValue>>({});
  // Respect "reduce motion" (as Radiant does): start on a still frame; Play animates.
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [showInfo, setShowInfo] = useState(false);
  const [showTweak, setShowTweak] = useState(false);
  const [slideshow, setSlideshow] = useState(() => Number(route.query.slideshow) || 0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const clock = useMemo(() => {
    const c = new Clock();
    if (prefersReducedMotion()) c.pause();
    return c;
  }, []);
  const rendererRef = useRef<ShaderRenderer | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentId = route.shaderId ?? entries.find((e) => e.group === 'Presets')?.id ?? 'preset:mandelbrot';

  // Load whichever shader the URL names.
  useEffect(() => {
    let alive = true;
    void (async () => {
      let p: ShaderProject | null = null;
      if (isPresetId(currentId)) {
        const preset = PRESETS.find((x) => `preset:${x.id}` === currentId);
        if (preset) p = projectFromPreset(preset);
      } else p = (await repository.get(currentId)) ?? null;
      if (!alive) return;
      if (!p) {
        toast('warn', `Shader "${currentId}" was not found; showing the first preset.`);
        navigate('view', `preset:${PRESETS[0].id}`);
        return;
      }
      setProject(p);
      setValues(structuredClone(p.values));
      setError(null);
      clock.restart();
    })();
    return () => {
      alive = false;
    };
  }, [currentId, clock]);

  const index = entries.findIndex((e) => e.id === currentId);
  const go = useCallback(
    (delta: number) => {
      if (!entries.length) return;
      const next = entries[(Math.max(0, index) + delta + entries.length) % entries.length];
      const q = new URLSearchParams(route.query).toString();
      window.location.hash = `#/view/${encodeURIComponent(next.id)}${q ? `?${q}` : ''}`;
    },
    [entries, index, route.query],
  );

  const shuffle = useCallback(() => {
    if (!project) return;
    const r = mutateUniforms(project.params, values, { seed: randomSeed(), strength: 0.6, probability: 0.8, locked: [], mode: 'randomize' });
    setValues(r.values);
  }, [project, values]);

  // Slideshow timer.
  useEffect(() => {
    if (!slideshow) return;
    const id = setTimeout(() => go(1), slideshow * 1000);
    return () => clearTimeout(id);
  }, [slideshow, currentId, go]);

  // Auto-hide chrome after a few idle seconds.
  const poke = useCallback(() => {
    setChromeVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setChromeVisible(false), 3000);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [poke]);

  const togglePlay = useCallback(() => {
    if (clock.playing) clock.pause();
    else clock.play();
    setPlaying(clock.playing);
  }, [clock]);
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => toast('warn', 'Fullscreen is not available here.'));
  };
  const snapshot = async () => {
    const r = rendererRef.current;
    if (!r || !project) return;
    const img = r.renderToPixels(r.canvas.width, r.canvas.height);
    downloadBlob(await imageDataToBlob(img), `${safeFilename(project.name)}-${Date.now()}.png`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return;
      poke();
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'r' || e.key === 'R') shuffle();
      else if (e.key === 'i' || e.key === 'I') setShowInfo((x) => !x);
      else if (e.key === 'f' || e.key === 'F') fullscreen();
      else if (e.key === 'Escape') {
        setShowInfo(false);
        setShowTweak(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, togglePlay, shuffle, poke]);

  const visible = !kiosk && (chromeVisible || !playing || showInfo || showTweak);
  const pv = project?.provenance;

  return (
    <div className="fixed inset-0 bg-black text-white" onPointerMove={poke} onPointerDown={poke} data-testid="viewer">
      {project && (
        <ShaderCanvas
          label={`Shader: ${project.name}`}
          fragment={project.fragment}
          format={project.format}
          vertex={project.vertex}
          params={project.params}
          values={values}
          modulations={project.modulations}
          channels={project.channels}
          clock={clock}
          maxPixels={mobile ? 1.2e6 : undefined}
          onRenderer={(r) => (rendererRef.current = r)}
          onCompile={(o) => setError(o.ok ? null : o.diagnostics.find((d) => d.severity === 'error')?.message ?? 'Compile error')}
        />
      )}
      {error && <div className="absolute inset-x-4 bottom-20 mx-auto max-w-lg rounded-md bg-black/80 p-3 text-center text-xs text-danger">This shader cannot run here: {error}</div>}

      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`} data-testid="viewer-chrome">
        {/* Top bar */}
        <div className="pointer-events-auto absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6 pt-2">
          <button className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10 hover:text-white" onClick={() => navigate('workspace')} title="Open the full editor">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-4 w-4" /> Shader Forge
          </button>
          <select
            className="max-w-[60vw] rounded-md border border-white/20 bg-black/60 px-2 py-1 text-sm font-medium text-white"
            value={currentId}
            onChange={(e) => navigate('view', e.target.value)}
            aria-label="Choose shader"
            data-testid="viewer-picker"
          >
            {Array.from(new Set(entries.map((e) => e.section))).map((g) =>
              entries.some((e) => e.section === g) ? (
                <optgroup key={g} label={g}>
                  {entries
                    .filter((e) => e.section === g)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </optgroup>
              ) : null,
            )}
          </select>
          <span className="hidden text-2xs text-white/60 sm:inline">
            {index + 1} / {entries.length}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button className="rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => navigate('fractal')} title="Mandelbrot deep zoom">
              <Sparkles size={14} className="inline" /> <span className="hidden sm:inline">Fractal</span>
            </button>
            <button className="rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => navigate('landscape')} title="Landscape & waterscape studio">
              <Mountain size={14} className="inline" /> <span className="hidden sm:inline">Landscape</span>
            </button>
            <button className="rounded-md px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => project && void openInEditor(project, values)} title="Open this shader in the editor" data-testid="viewer-edit">
              <Code2 size={14} className="inline" /> <span className="hidden sm:inline">Edit</span>
            </button>
          </div>
        </div>

        {/* Side arrows */}
        <button className="pointer-events-auto absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/70" onClick={() => go(-1)} aria-label="Previous shader">
          <ChevronLeft size={22} />
        </button>
        <button className={`pointer-events-auto absolute top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/70 ${showTweak ? 'right-[19.5rem]' : 'right-2'}`} onClick={() => go(1)} aria-label="Next shader" data-testid="viewer-next">
          <ChevronRight size={22} />
        </button>

        {/* Bottom controls */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8">
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 backdrop-blur">
            <IconBtn label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </IconBtn>
            <IconBtn label="Restart" onClick={() => clock.restart()}>
              <RotateCcw size={16} />
            </IconBtn>
            <IconBtn label="Shuffle parameters (R)" onClick={shuffle} testid="viewer-shuffle">
              <Dice5 size={16} />
            </IconBtn>
            <IconBtn label="Adjust parameters" onClick={() => setShowTweak((x) => !x)} active={showTweak}>
              <SlidersHorizontal size={16} />
            </IconBtn>
            <label className="flex items-center gap-1 px-1 text-2xs text-white/70" title="Slideshow: advance automatically">
              <Timer size={15} />
              <select className="rounded bg-transparent text-2xs text-white" value={slideshow} onChange={(e) => setSlideshow(Number(e.target.value))} aria-label="Slideshow interval">
                {SLIDESHOW.map((s) => (
                  <option key={s} value={s} className="text-black">
                    {s ? `${s}s` : 'Off'}
                  </option>
                ))}
              </select>
            </label>
            <IconBtn label="Info (I)" onClick={() => setShowInfo((x) => !x)} active={showInfo}>
              <Info size={16} />
            </IconBtn>
            <IconBtn label="Save PNG" onClick={() => void snapshot()}>
              <Camera size={16} />
            </IconBtn>
            <IconBtn label="Fullscreen (F)" onClick={fullscreen}>
              <Maximize2 size={16} />
            </IconBtn>
          </div>
        </div>

        {showInfo && project && (
          <div className="pointer-events-auto absolute bottom-20 left-3 max-w-sm rounded-lg border border-white/15 bg-black/75 p-3 text-xs backdrop-blur" data-testid="viewer-info">
            <div className="mb-1 text-sm font-semibold">{project.name}</div>
            {project.description && <p className="mb-2 text-white/75">{project.description}</p>}
            <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 text-white/70">
              {pv?.author && (
                <>
                  <dt>Author</dt>
                  <dd>{pv.author}</dd>
                </>
              )}
              {pv?.license && (
                <>
                  <dt>License</dt>
                  <dd>{pv.license}</dd>
                </>
              )}
              {pv?.sourceUrl && (
                <>
                  <dt>Source</dt>
                  <dd className="truncate">
                    <a className="underline" href={pv.sourceUrl} target="_blank" rel="noreferrer noopener">
                      {pv.sourceUrl.replace(/^https?:\/\//, '')}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            <p className="mt-2 text-2xs text-white/50">← → browse · Space play/pause · R shuffle · F fullscreen</p>
          </div>
        )}

        {showTweak && project && (
          <div className="scroll-thin pointer-events-auto absolute bottom-20 right-3 top-14 w-72 overflow-y-auto rounded-lg border border-white/15 bg-black/75 p-3 backdrop-blur" data-testid="viewer-tweak">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold">Parameters</span>
              <div className="flex gap-1">
                <button className="rounded px-1.5 py-0.5 text-2xs text-white/70 hover:bg-white/10" onClick={() => setValues(structuredClone(project.values))}>
                  Reset
                </button>
                <button className="rounded p-0.5 text-white/70 hover:bg-white/10" onClick={() => setShowTweak(false)} aria-label="Close">
                  <X size={14} />
                </button>
              </div>
            </div>
            {project.params.length === 0 && <p className="text-2xs text-white/60">This shader has no adjustable parameters.</p>}
            <div className="flex flex-col gap-3">
              {project.params.map((d) => (
                <ParamField key={d.name} def={d} value={values[d.name]} color={categoryColor(d)} onChange={(v) => setValues((cur) => ({ ...cur, [d.name]: v }))} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ label, onClick, children, active, testid }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; testid?: string }) {
  return (
    <button className={`rounded-full p-2 hover:bg-white/15 ${active ? 'bg-white/20' : ''}`} onClick={onClick} title={label} aria-label={label} aria-pressed={active} data-testid={testid}>
      {children}
    </button>
  );
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
