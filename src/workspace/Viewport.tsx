import { AlertTriangle, Camera, Expand, Gauge, Maximize2, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Square, StepForward } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ShaderRenderer } from '../renderer/engine';
import { mainClock, setMainRenderer } from '../state/renderer';
import { useSettings } from '../state/settings';
import { useStats } from '../state/stats';
import { toast, useUI } from '../state/ui';
import { applyChannelsToRenderer, currentValues, useWorkspace } from '../state/workspace';
import { downloadBlob, imageDataToBlob, safeFilename } from '../utils/download';

type Aspect = 'fill' | '16:9' | '1:1' | '9:16' | '4:3';
const ASPECTS: Aspect[] = ['fill', '16:9', '4:3', '1:1', '9:16'];

/** Attach Shadertoy-compatible mouse/touch handling to a canvas. */
export function bindPointer(canvas: HTMLCanvasElement, getRenderer: () => ShaderRenderer | null): () => void {
  const toPx = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return [(e.clientX - r.left) * sx, (r.height - (e.clientY - r.top)) * sy];
  };
  let down = false;
  const onDown = (e: PointerEvent) => {
    const rr = getRenderer();
    if (!rr) return;
    canvas.setPointerCapture(e.pointerId);
    down = true;
    const [x, y] = toPx(e);
    rr.mouse = [x, y, x, y];
    rr.pointer = [x, y];
    rr.pointerRefWidth = canvas.width;
    rr.requestRender();
  };
  const onMove = (e: PointerEvent) => {
    const rr = getRenderer();
    if (!rr) return;
    // Hover alone only needs a redraw if the shader reads the hover position.
    if (!down && !rr.usesHover) return;
    const [x, y] = toPx(e);
    // Re-express the stored press position at the current buffer size (adaptive resolution changes it).
    const k = canvas.width / Math.max(1, rr.pointerRefWidth || canvas.width);
    if (k !== 1) for (let i = 0; i < 4; i++) rr.mouse[i] *= k;
    rr.pointerRefWidth = canvas.width;
    rr.pointer = [x, y];
    if (down) {
      rr.mouse[0] = x;
      rr.mouse[1] = y;
    }
    rr.requestRender();
  };
  // Hover position is "off canvas" again once the pointer leaves (Radiant convention: -1).
  const onLeave = () => {
    const rr = getRenderer();
    if (!rr || down) return;
    rr.pointer = [-1, -1];
    if (rr.usesHover) rr.requestRender();
  };
  const onUp = () => {
    const rr = getRenderer();
    down = false;
    if (rr) {
      // Shadertoy convention: negative z/w when the button is released.
      rr.mouse[2] = -Math.abs(rr.mouse[2]);
      rr.mouse[3] = -Math.abs(rr.mouse[3]);
      rr.requestRender();
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
  };
}

function Stats() {
  const s = useStats((x) => x.stats);
  const show = useSettings((x) => x.showStats);
  if (!s || !show) return null;
  return (
    <div className="pointer-events-none absolute left-2 top-2 rounded bg-black/55 px-2 py-1 font-mono text-2xs leading-4 text-white/85" data-testid="stats">
      <div>
        {s.playing ? `${s.fps.toFixed(0)} fps` : 'paused'} · {s.frameMs.toFixed(1)} ms
      </div>
      <div>
        t={s.time.toFixed(2)}s · #{s.frame}
      </div>
      <div>
        {s.width}×{s.height} · WebGL{s.glVersion}
      </div>
    </div>
  );
}

export function Viewport({ mobile = false }: { mobile?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ShaderRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(mainClock.playing);
  const [speed, setSpeed] = useState(mainClock.speed);
  const [stopped, setStopped] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const [aspect, setAspect] = useState<Aspect>('fill');
  const [glLost, setGlLost] = useState<string | null>(null);
  const compileStatus = useWorkspace((s) => s.compile.status);
  const keptPrevious = useWorkspace((s) => s.compile.keptPrevious);
  const firstError = useWorkspace((s) => s.compile.diagnostics.find((d) => d.severity === 'error'));
  const name = useWorkspace((s) => s.project?.name);
  const settings = useSettings();

  useEffect(() => {
    // A fresh canvas per renderer: a disposed renderer releases (loses) its
    // context, which would otherwise poison a re-mount on the same element.
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full touch-none';
    canvas.dataset.testid = 'main-canvas';
    canvas.setAttribute('role', 'img');
    holderRef.current!.appendChild(canvas);
    canvasRef.current = canvas;
    let r: ShaderRenderer;
    try {
      r = new ShaderRenderer(canvas, { preferWebGL2: settings.preferWebGL2, clock: mainClock });
    } catch (e) {
      setError((e as Error).message);
      canvas.remove();
      return;
    }
    rendererRef.current = r;
    r.valueSource = currentValues;
    r.onStats = (s) => useStats.getState().set(s);
    r.onSlowFrame = (ms) => {
      setPlaying(false);
      toast('warn', `Rendering is very slow (${ms.toFixed(0)} ms/frame) — playback paused. Lower the resolution or simplify the shader.`);
    };
    r.onContextLost = (recovering) =>
      setGlLost(recovering ? 'The GPU context was lost; attempting to recover…' : 'The GPU context was lost repeatedly. The shader may be too demanding; rendering was stopped. Edit the shader and recompile to retry.');
    const unbind = bindPointer(canvas, () => rendererRef.current);
    setMainRenderer(r);
    r.start();
    // Re-attach current project state to the fresh renderer.
    const p = useWorkspace.getState().project;
    if (p) {
      void applyChannelsToRenderer(p.channels);
      useWorkspace.getState().compileNow();
    }
    const restoredTimer = setInterval(() => {
      if (!r.isContextLost) setGlLost(null);
    }, 1000);
    return () => {
      clearInterval(restoredTimer);
      unbind();
      setMainRenderer(null);
      r.dispose();
      canvas.remove();
      rendererRef.current = null;
    };
  }, [settings.preferWebGL2]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    // Mobile GPUs: keep the default drawing buffer well below full device resolution.
    const maxPixels = mobile ? Math.min(settings.maxPixels, 1.2e6) : settings.maxPixels;
    r.settings = { pixelRatio: settings.pixelRatio, maxPixels, fpsCap: settings.fpsCap, adaptive: settings.adaptiveResolution };
    r.requestRender();
  }, [settings.pixelRatio, settings.maxPixels, settings.fpsCap, settings.adaptiveResolution, mobile, settings.preferWebGL2]);

  // Keep local play state in sync when the clock is changed elsewhere (shortcuts, safeguards).
  useEffect(() => {
    const id = setInterval(() => {
      setPlaying(mainClock.playing);
      setSpeed(mainClock.speed);
    }, 300);
    return () => clearInterval(id);
  }, []);

  const togglePlay = () => {
    if (mainClock.playing) mainClock.pause();
    else mainClock.play();
    setPlaying(mainClock.playing);
  };
  const stopRendering = () => {
    const r = rendererRef.current;
    if (!r) return;
    if (r.isRunning) {
      r.stop();
      setStopped(true);
    } else {
      r.start();
      setStopped(false);
    }
  };
  const snapshot = async () => {
    const r = rendererRef.current;
    if (!r) return;
    const img = r.renderToPixels(r.canvas.width, r.canvas.height);
    downloadBlob(await imageDataToBlob(img), `${safeFilename(name ?? 'shader')}-${Date.now()}.png`);
  };
  const fullscreen = () => {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => toast('warn', 'Fullscreen is not available here.'));
  };

  const aspectStyle = aspect === 'fill' ? { width: '100%', height: '100%' } : { aspectRatio: aspect.replace(':', ' / '), maxWidth: '100%', maxHeight: '100%', width: aspect === '9:16' ? 'auto' : '100%', height: aspect === '9:16' ? '100%' : 'auto' };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <AlertTriangle className="mx-auto mb-2 text-warn" />
          <h2 className="mb-1 text-sm font-semibold">WebGL unavailable</h2>
          <p className="text-xs text-muted">
            {error} Shader Forge needs WebGL 2 (or WebGL 1 for GLSL ES 1.00 shaders). Enable hardware acceleration in your browser settings, or try a current version of Chrome, Edge, Firefox or Safari.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrap} className="relative flex h-full min-h-0 flex-col bg-black" data-testid="viewport">
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
        onWheel={(e) => {
          if (!e.altKey) return;
          setZoom((z) => Math.min(16, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
        }}
        onPointerDown={(e) => {
          if (!(e.altKey || e.button === 1)) return;
          e.preventDefault();
          const start = [e.clientX, e.clientY, pan[0], pan[1]];
          const move = (ev: PointerEvent) => setPan([start[2] + ev.clientX - start[0], start[3] + ev.clientY - start[1]]);
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        }}
      >
        <div
          ref={holderRef}
          className="relative"
          style={{ ...aspectStyle, transform: `translate(${pan[0]}px, ${pan[1]}px) scale(${zoom})`, imageRendering: zoom > 2 ? 'pixelated' : 'auto' }}
          aria-label={`Shader output: ${name ?? 'none'}`}
        />
        <Stats />
        {compileStatus === 'error' && (
          <button
            className="absolute bottom-2 left-2 right-2 mx-auto flex max-w-xl items-start gap-2 rounded-md border border-danger/60 bg-black/75 px-3 py-2 text-left text-xs text-white"
            onClick={() => useUI.getState().set({ bottomOpen: true, bottomTab: 'console', mobilePanel: mobile ? 'code' : null })}
            data-testid="compile-error-banner"
          >
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
            <span className="line-clamp-2">
              {firstError ? `${firstError.line ? `Line ${firstError.line}: ` : firstError.origin === 'wrapper' ? 'Compatibility wrapper: ' : ''}${firstError.message}` : 'Compilation failed.'}
              {keptPrevious && <span className="text-white/60"> — showing last working version.</span>}
            </span>
          </button>
        )}
        {glLost && <div className="absolute inset-x-4 top-12 rounded-md border border-warn/60 bg-black/80 p-3 text-xs text-white">{glLost}</div>}
        {stopped && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white/80">Rendering stopped — press ■ to resume.</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-t border-line bg-panel px-1.5 py-1">
        <button className="btn-icon" onClick={togglePlay} title={playing ? 'Pause (Space)' : 'Play (Space)'} aria-label={playing ? 'Pause' : 'Play'} data-testid="play-toggle">
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button className="btn-icon" onClick={() => mainClock.restart()} title="Restart (time = 0)" aria-label="Restart">
          <RotateCcw size={15} />
        </button>
        <button
          className="btn-icon"
          onClick={() => {
            mainClock.step();
            setPlaying(false);
          }}
          title="Step one frame (.)"
          aria-label="Step frame"
        >
          <StepForward size={15} />
        </button>
        <button className="btn-icon" onClick={stopRendering} title={stopped ? 'Resume rendering' : 'Stop rendering (GPU safeguard)'} aria-label={stopped ? 'Resume rendering' : 'Stop rendering'}>
          {stopped ? <SkipForward size={15} /> : <Square size={13} />}
        </button>
        <label className="ml-1 flex items-center gap-1 text-2xs text-muted" title="Simulation speed">
          <Gauge size={13} />
          <select
            className="rounded border border-line bg-bg px-1 py-0.5 text-2xs text-fg"
            value={speed}
            onChange={(e) => {
              mainClock.speed = Number(e.target.value);
              setSpeed(mainClock.speed);
            }}
            aria-label="Playback speed"
          >
            {[-1, 0.1, 0.25, 0.5, 1, 1.5, 2, 4].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        <div className="mx-1 h-4 w-px bg-line" />
        <select className="rounded border border-line bg-bg px-1 py-0.5 text-2xs" value={aspect} onChange={(e) => setAspect(e.target.value as Aspect)} aria-label="Viewport framing" title="Framing">
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a === 'fill' ? 'Fill' : a}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-line bg-bg px-1 py-0.5 text-2xs"
          value={settings.pixelRatio}
          onChange={(e) => settings.set({ pixelRatio: Number(e.target.value) })}
          aria-label="Resolution scale"
          title="Resolution scale (× device pixel ratio)"
        >
          {[0.25, 0.5, 0.75, 1, 1.5, 2].map((s) => (
            <option key={s} value={s}>
              {s * 100}% res
            </option>
          ))}
        </select>
        <select className="rounded border border-line bg-bg px-1 py-0.5 text-2xs" value={settings.fpsCap} onChange={(e) => settings.set({ fpsCap: Number(e.target.value) })} aria-label="Frame-rate cap" title="Frame-rate cap">
          {[0, 15, 30, 60].map((f) => (
            <option key={f} value={f}>
              {f ? `${f} fps cap` : 'No fps cap'}
            </option>
          ))}
        </select>
        {!mobile && (
          <>
            <button className="btn-icon" onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} title="Zoom out view (Alt+wheel)" aria-label="Zoom out">
              <Minus size={14} />
            </button>
            <button
              className="font-mono text-2xs text-muted hover:text-fg"
              onClick={() => {
                setZoom(1);
                setPan([0, 0]);
              }}
              title="Reset view framing"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button className="btn-icon" onClick={() => setZoom((z) => Math.min(16, z * 1.25))} title="Zoom in view (Alt+wheel, Alt+drag to pan)" aria-label="Zoom in">
              <Plus size={14} />
            </button>
          </>
        )}
        <div className="ml-auto flex items-center">
          <button className="btn-icon" onClick={snapshot} title="Save PNG snapshot" aria-label="Save PNG snapshot">
            <Camera size={15} />
          </button>
          <button className="btn-icon" onClick={() => useUI.getState().set({ modal: 'export' })} title="Export / record" aria-label="Export">
            <Expand size={15} />
          </button>
          <button className="btn-icon" onClick={fullscreen} title="Fullscreen (F)" aria-label="Fullscreen">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
