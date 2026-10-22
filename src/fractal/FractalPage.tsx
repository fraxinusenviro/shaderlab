/**
 * Fractal Zoom: deep Mandelbrot zoom with curated tours, autoplay, colour
 * controls, bookmarks, share links, PNG and video capture.
 *   #/fractal?re=<decimal>&im=<decimal>&z=<log10 zoom>&p=<palette>&tour=<id>
 */
import { ArrowLeft, Bookmark, Camera, Circle, Copy, Eye, Maximize2, Minus, Mountain, Pause, Play, Plus, RotateCcw, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { navigate, useHashRoute } from '../hooks/useHashRoute';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useSettings } from '../state/settings';
import { toast } from '../state/ui';
import { uid } from '../storage/project';
import { downloadBlob, imageDataToBlob } from '../utils/download';
import { startRecording, supportedRecorderFormats, type Recording } from '../utils/recorder';
import { FractalController, type FractalReadout } from './controller';
import { PALETTES, type ColorMap } from './renderer';
import { FRACTAL_DEFAULTS, QUALITY, useFractal, type LoopMode, type Quality } from './store';
import { FRACTAL_TOURS, type FractalTour } from './tours';

type Tab = 'tours' | 'zoom' | 'colour' | 'saved';

const gradient = (id: string) => {
  const p = PALETTES.find((x) => x.id === id)!;
  const stops = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    const c = [0, 1, 2].map((k) => Math.round(255 * Math.min(1, Math.max(0, p.a[k] + p.b[k] * Math.cos(2 * Math.PI * (p.c[k] * t + p.d[k]))))));
    return `rgb(${c.join(',')}) ${Math.round(t * 100)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
};

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs font-medium">
        {label}
        <span className="font-mono text-2xs text-muted">{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ '--fill': `${((value - min) / (max - min)) * 100}%` } as CSSProperties} aria-label={label} />
    </label>
  );
}

function Chips<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.id)} role="radio" aria-checked={value === o.id} className={`chip ${value === o.id ? 'border-accent bg-accent/15 text-fg' : 'hover:text-fg'}`} onClick={() => onChange(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FractalPage() {
  const route = useHashRoute();
  const mobile = useIsMobile();
  const preferWebGL2 = useSettings((s) => s.preferWebGL2);
  const s = useFractal();
  const holder = useRef<HTMLDivElement>(null);
  const ctl = useRef<FractalController | null>(null);
  const [readout, setReadout] = useState<FractalReadout | null>(null);
  const [tab, setTab] = useState<Tab>('tours');
  const [fatal, setFatal] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState('1920x1080');
  const [rec, setRec] = useState<Recording | null>(null);
  const formats = useMemo(() => supportedRecorderFormats(), []);
  const [goto, setGoto] = useState({ re: '', im: '', z: '' });

  // Create the controller once (per WebGL preference).
  useEffect(() => {
    const st = useFractal.getState();
    const q = route.query;
    let c: FractalController;
    try {
      c = new FractalController(holder.current!, st, preferWebGL2);
    } catch (e) {
      setFatal((e as Error).message);
      return;
    }
    ctl.current = c;
    c.onReadout = setReadout;
    c.onViewChange = (v) => useFractal.getState().set(v);
    c.onAutoplayEnd = () => setReadout((r) => (r ? { ...r, playing: false } : r));
    const tour = q.tour ? FRACTAL_TOURS.find((t) => t.id === q.tour) : undefined;
    if (tour) startTour(tour);
    else if (q.re && q.im) {
      try {
        if (q.p && PALETTES.some((p) => p.id === q.p)) st.set({ palette: q.p });
        c.setView(q.re, q.im, Number(q.z) || 0);
      } catch {
        toast('warn', 'The link contained invalid coordinates.');
      }
    }
    if (!c.renderer.deep) toast('warn', 'WebGL 2 is unavailable: deep zoom is disabled and zoom is limited to about 10⁵×.');
    return () => {
      c.dispose();
      ctl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferWebGL2]);

  // Push setting changes to the controller.
  useEffect(() => {
    ctl.current?.setSettings(s);
  }, [s]);

  function startTour(t: FractalTour) {
    const c = ctl.current;
    if (!c) return;
    useFractal.getState().set({ tourId: t.id, targetDepth: Math.min(t.depth, c.maxZoom), direction: 1, palette: t.palette ?? useFractal.getState().palette });
    c.setSettings(useFractal.getState());
    c.minIter = t.minIter ?? 0;
    c.minIterDepth = t.depth;
    c.setView(t.re, t.im, 0, 0);
    c.play();
  }

  const c = ctl.current;
  const playing = readout?.playing ?? false;
  const togglePlay = () => {
    if (!c) return;
    if (c.playing) c.pause();
    else {
      if (c.zoom >= Math.min(c.maxZoom, s.targetDepth) - 0.01 && s.direction > 0 && s.loop === 'stop') c.setView(c.centerStrings().re, c.centerStrings().im, 0);
      c.play();
    }
    setReadout((r) => (r ? { ...r, playing: c.playing } : r));
  };
  const reset = () => {
    if (!c) return;
    c.pause();
    c.minIter = 0;
    c.minIterDepth = 0;
    useFractal.getState().set({ tourId: null });
    c.setView(FRACTAL_DEFAULTS.re, FRACTAL_DEFAULTS.im, 0, 0);
  };
  const shareLink = () => {
    if (!c) return;
    const { re, im } = c.centerStrings();
    const url = `${location.origin}${location.pathname}#/fractal?re=${re}&im=${im}&z=${c.zoom.toFixed(3)}&p=${s.palette}`;
    void navigator.clipboard?.writeText(url).then(
      () => toast('success', 'Link to this exact view copied.'),
      () => toast('info', url),
    );
  };
  const exportPng = async () => {
    if (!c) return;
    const [w, h] = exportSize.split('x').map(Number);
    toast('info', `Rendering ${w}×${h}…`);
    await new Promise((r) => setTimeout(r, 30));
    const img = c.snapshot(w, h);
    downloadBlob(await imageDataToBlob(img), `mandelbrot-1e${c.zoom.toFixed(1)}-${img.width}x${img.height}.png`);
  };
  const toggleRecord = async () => {
    if (!c) return;
    if (rec) {
      const blob = await rec.stop();
      setRec(null);
      downloadBlob(blob, `mandelbrot-zoom.${formats[0].ext}`);
      toast('success', `Recorded ${(blob.size / 1048576).toFixed(1)} MB.`);
      return;
    }
    if (!formats.length) return toast('warn', 'This browser cannot record canvas video (MediaRecorder unsupported).');
    setRec(startRecording(c.canvas, formats[0], 30));
    if (!c.playing) c.play();
    toast('info', 'Recording the zoom… press ● again to stop.');
  };
  const fullscreen = () => {
    const el = document.querySelector('[data-testid="fractal-view"]');
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el?.requestFullscreen?.().catch(() => toast('warn', 'Fullscreen is not available here.'));
  };
  const bookmark = () => {
    if (!c) return;
    const name = prompt('Bookmark name', `View at 10^${c.zoom.toFixed(1)}`);
    if (!name?.trim()) return;
    const { re, im } = c.centerStrings();
    s.set({ bookmarks: [{ id: uid('b_'), name: name.trim(), re, im, zoom: c.zoom, palette: s.palette, createdAt: Date.now() }, ...s.bookmarks].slice(0, 100) });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea') || !ctl.current) return;
      const k = ctl.current;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === '+' || e.key === '=') k.zoomBy(2);
      else if (e.key === '-' || e.key === '_') k.zoomBy(0.5);
      else if (e.key === 'ArrowLeft') k.panBy(60, 0);
      else if (e.key === 'ArrowRight') k.panBy(-60, 0);
      else if (e.key === 'ArrowUp') k.panBy(0, 60);
      else if (e.key === 'ArrowDown') k.panBy(0, -60);
      else if (e.key === 'f' || e.key === 'F') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const maxZoom = c?.maxZoom ?? 30;
  const zoomLabel = readout ? `×10^${readout.zoom.toFixed(2)}` : '';
  const speedLabel = (v: number) => `×${(10 ** v).toFixed(2)}/s`;

  const panel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 border-b border-line" role="tablist">
        {(['tours', 'zoom', 'colour', 'saved'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab flex-1 capitalize ${tab === t ? 'tab-active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'tours' && (
          <div className="flex flex-col gap-2">
            <p className="text-2xs text-muted">Each tour flies to a precisely computed destination. Minibrot tours end on a miniature copy of the whole set; spiral and dendrite tours are self-similar at every depth.</p>
            {FRACTAL_TOURS.map((t) => (
              <button key={t.id} className={`rounded-lg border p-2 text-left ${s.tourId === t.id ? 'border-accent bg-accent/10' : 'border-line hover:border-muted'}`} onClick={() => startTour(t)} data-testid="fractal-tour" data-tour={t.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{t.name}</span>
                  <span className="chip shrink-0">10^{Math.min(t.depth, maxZoom).toFixed(0)}</span>
                </div>
                <div className="mt-0.5 text-2xs text-muted">{t.description}</div>
                <div className="mt-1 h-1.5 rounded-full" style={{ background: gradient(t.palette ?? 'classic') }} />
              </button>
            ))}
          </div>
        )}
        {tab === 'zoom' && (
          <div className="flex flex-col gap-4">
            <button className="btn btn-primary" onClick={togglePlay} data-testid="fractal-play-panel">
              {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? 'Pause zoom' : 'Play zoom'}
            </button>
            <Slider label="Zoom speed" value={s.speed} min={0.05} max={1.5} step={0.01} onChange={(v) => s.set({ speed: v })} format={speedLabel} />
            <Chips label="Direction" value={s.direction} options={[{ id: 1, label: 'Zoom in' }, { id: -1, label: 'Zoom out' }]} onChange={(v) => s.set({ direction: v as 1 | -1 })} />
            <Slider label="Target depth" value={Math.min(s.targetDepth, maxZoom)} min={1} max={maxZoom} step={0.1} onChange={(v) => s.set({ targetDepth: v })} format={(v) => `10^${v.toFixed(1)}`} />
            <Chips<LoopMode> label="At the end" value={s.loop} options={[{ id: 'bounce', label: 'Zoom back out' }, { id: 'restart', label: 'Restart' }, { id: 'stop', label: 'Stop' }]} onChange={(v) => s.set({ loop: v })} />
            <Slider label="Spin" value={s.spin} min={-0.5} max={0.5} step={0.01} onChange={(v) => s.set({ spin: v })} format={(v) => `${v.toFixed(2)} rad/s`} />
            <Chips<Quality> label="Quality" value={s.quality} options={(Object.keys(QUALITY) as Quality[]).map((q) => ({ id: q, label: QUALITY[q].label }))} onChange={(v) => s.set({ quality: v })} />
            <Slider label="Iteration boost" value={s.iterBoost} min={0.25} max={4} step={0.05} onChange={(v) => s.set({ iterBoost: v })} format={(v) => `×${v.toFixed(2)} (${readout?.maxIter.toLocaleString() ?? '–'} iter)`} />
            <div className="flex flex-col gap-1 rounded-md border border-line p-2">
              <div className="label">Go to coordinates</div>
              <input className="input font-mono" placeholder="real, e.g. -0.7436" value={goto.re} onChange={(e) => setGoto({ ...goto, re: e.target.value })} aria-label="Real part" />
              <input className="input font-mono" placeholder="imaginary, e.g. 0.1318" value={goto.im} onChange={(e) => setGoto({ ...goto, im: e.target.value })} aria-label="Imaginary part" />
              <div className="flex gap-1">
                <input className="input font-mono" placeholder="depth (log10)" value={goto.z} onChange={(e) => setGoto({ ...goto, z: e.target.value })} aria-label="Depth" />
                <button
                  className="btn"
                  onClick={() => {
                    try {
                      c?.setView(goto.re || '0', goto.im || '0', Number(goto.z) || 0);
                      s.set({ tourId: null });
                    } catch {
                      toast('error', 'Enter decimal numbers, e.g. -0.743643887 and 0.131825904.');
                    }
                  }}
                >
                  Go
                </button>
              </div>
            </div>
          </div>
        )}
        {tab === 'colour' && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="label mb-1">Palette</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTES.map((p) => (
                  <button key={p.id} className={`rounded-md border p-1 text-left text-2xs ${s.palette === p.id ? 'border-accent' : 'border-line hover:border-muted'}`} onClick={() => s.set({ palette: p.id })} aria-pressed={s.palette === p.id}>
                    <div className="mb-1 h-4 rounded" style={{ background: gradient(p.id) }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <Chips<ColorMap> label="Colour mapping" value={s.map} options={[{ id: 'linear', label: 'Linear' }, { id: 'sqrt', label: 'Square root' }, { id: 'log', label: 'Logarithmic' }]} onChange={(v) => s.set({ map: v })} />
            <Slider label="Band density" value={s.density} min={0.1} max={8} step={0.05} onChange={(v) => s.set({ density: v })} format={(v) => v.toFixed(2)} />
            <Slider label="Colour offset" value={s.phase} min={0} max={1} step={0.005} onChange={(v) => s.set({ phase: v })} format={(v) => v.toFixed(3)} />
            <Slider label="Colour cycling" value={s.cycle} min={0} max={0.5} step={0.005} onChange={(v) => s.set({ cycle: v })} format={(v) => (v ? `${v.toFixed(3)}/s` : 'off')} />
            <label className="flex items-center justify-between text-xs font-medium">
              Inside colour
              <input
                type="color"
                className="h-7 w-12 cursor-pointer rounded border border-line bg-transparent"
                value={'#' + s.interior.map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}
                onChange={(e) => {
                  const h = e.target.value;
                  s.set({ interior: [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number] });
                }}
                aria-label="Inside colour"
              />
            </label>
          </div>
        )}
        {tab === 'saved' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              <button className="btn flex-1" onClick={bookmark} data-testid="fractal-bookmark">
                <Bookmark size={13} /> Bookmark view
              </button>
              <button className="btn flex-1" onClick={shareLink}>
                <Copy size={13} /> Copy link
              </button>
            </div>
            {s.bookmarks.length === 0 && <p className="text-2xs text-muted">No bookmarks yet. Bookmarks are stored in this browser.</p>}
            {s.bookmarks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-md border border-line p-2 text-xs" data-testid="fractal-bookmark-item">
                <div className="h-6 w-2 shrink-0 rounded" style={{ background: gradient(b.palette) }} />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    s.set({ palette: b.palette, tourId: null });
                    c?.pause();
                    c?.setView(b.re, b.im, b.zoom);
                  }}
                >
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="text-2xs text-muted">×10^{b.zoom.toFixed(1)}</div>
                </button>
                <button className="btn-icon h-6 w-6" onClick={() => s.set({ bookmarks: s.bookmarks.filter((x) => x.id !== b.id) })} aria-label={`Delete ${b.name}`}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const view = (
    <div className="relative h-full min-h-0 bg-black" data-testid="fractal-view">
      <div ref={holder} className="h-full w-full" />
      {fatal && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-white/80">{fatal}</div>}
      {readout && (
        <div className="pointer-events-none absolute left-2 top-2 max-w-[80%] rounded bg-black/60 px-2 py-1 font-mono text-2xs text-white/85" data-testid="fractal-readout">
          <div>
            <span className="text-sm font-semibold text-white">{zoomLabel}</span> · {readout.maxIter.toLocaleString()} iterations
            {readout.reference === 'computing' ? ' · computing reference…' : readout.reference === 'shallow' ? ' · float32 (WebGL 1)' : ''}
          </div>
          <div className="truncate text-white/60">
            {readout.re} {readout.im.startsWith('-') ? '' : '+'}
            {readout.im}i
          </div>
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-white backdrop-blur">
        <button className="rounded p-1.5 hover:bg-white/15" onClick={togglePlay} aria-label={playing ? 'Pause zoom' : 'Play zoom'} data-testid="fractal-play">
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="rounded p-1.5 hover:bg-white/15" onClick={() => c?.zoomBy(0.5)} aria-label="Zoom out" title="Zoom out (−)">
          <Minus size={15} />
        </button>
        <button className="rounded p-1.5 hover:bg-white/15" onClick={() => c?.zoomBy(2)} aria-label="Zoom in" title="Zoom in (+, wheel, double-click)">
          <Plus size={15} />
        </button>
        <button className="rounded p-1.5 hover:bg-white/15" onClick={reset} aria-label="Reset view" title="Reset view">
          <RotateCcw size={15} />
        </button>
        <span className="hidden px-1 text-2xs text-white/60 md:inline">drag to pan · wheel / pinch / double-click to zoom</span>
        <div className="ml-auto flex items-center gap-1">
          <select className="rounded bg-transparent px-1 text-2xs" value={exportSize} onChange={(e) => setExportSize(e.target.value)} aria-label="Export size">
            {['1280x720', '1920x1080', '2560x1440', '3840x2160', '2048x2048'].map((x) => (
              <option key={x} value={x} className="text-black">
                {x.replace('x', '×')}
              </option>
            ))}
          </select>
          <button className="rounded p-1.5 hover:bg-white/15" onClick={() => void exportPng()} aria-label="Export PNG" title="Export PNG">
            <Camera size={15} />
          </button>
          <button className={`rounded p-1.5 hover:bg-white/15 ${rec ? 'text-red-400' : ''}`} onClick={() => void toggleRecord()} aria-label={rec ? 'Stop recording' : 'Record video'} title={formats.length ? 'Record the zoom as video' : 'Video recording unsupported in this browser'}>
            {rec ? <Square size={14} /> : <Circle size={14} />}
          </button>
          <button className="rounded p-1.5 hover:bg-white/15" onClick={fullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col" data-testid="fractal">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2">
        <button className="btn btn-ghost px-2" onClick={() => navigate('workspace')} title="Back to the editor">
          <ArrowLeft size={15} /> <span className="hidden sm:inline">Editor</span>
        </button>
        <span className="text-sm font-semibold">Fractal Zoom</span>
        <span className="hidden text-2xs text-muted md:inline">Mandelbrot set · perturbation deep zoom to 10^{maxZoom}</span>
        <div className="ml-auto flex items-center gap-1">
          <button className="btn btn-ghost px-2" onClick={() => navigate('landscape')} title="Landscape studio">
            <Mountain size={15} /> <span className="hidden md:inline">Landscape</span>
          </button>
          <button className="btn btn-ghost px-2" onClick={() => navigate('view')} title="Simple viewer">
            <Eye size={15} /> <span className="hidden md:inline">Viewer</span>
          </button>
        </div>
      </header>
      {mobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-[55%] shrink-0">{view}</div>
          <div className="min-h-0 flex-1 bg-panel">{panel}</div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1">{view}</main>
          <aside className="w-80 shrink-0 border-l border-line bg-panel">{panel}</aside>
        </div>
      )}
    </div>
  );
}
