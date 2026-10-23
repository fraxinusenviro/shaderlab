import { Circle, Download, FileArchive, FileCode2, FileJson, Image as ImageIcon, Square, Video } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field, Modal, Toggle } from '../components/ui';
import { TEMPLATES } from '../presets/templates';
import { getMainRenderer, mainClock } from '../state/renderer';
import { DEFAULT_SETTINGS, useSettings } from '../state/settings';
import { toast, useUI } from '../state/ui';
import { useLibrary } from '../state/library';
import { useWorkspace } from '../state/workspace';
import { setOffscreenPreference } from '../renderer/offscreen';
import { createProject, libraryToZip, projectToJSON, projectToZip } from '../storage/project';
import { requestPersistentStorage } from '../storage/db';
import { repository } from '../storage/repository';
import { downloadBlob, downloadText, imageDataToBlob, safeFilename } from '../utils/download';
import { startRecording, supportedRecorderFormats, type Recording } from '../utils/recorder';

const close = () => useUI.getState().set({ modal: null });

// ---------------------------------------------------------------- new

export function NewDialog() {
  return (
    <Modal title="New shader" onClose={close}>
      <div className="grid gap-2 sm:grid-cols-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            className="rounded-lg border border-line bg-panel2 p-3 text-left hover:border-accent/70"
            onClick={async () => {
              const { dirty, project } = useWorkspace.getState();
              if (dirty && project && !confirm(`Discard unsaved changes to "${project.name}"?`)) return;
              await useWorkspace.getState().openProject(createProject({ name: `Untitled ${t.name.split(' ')[0]}`, fragment: t.fragment, format: t.format, category: 'Sketches', tags: ['new'] }), { keepDirty: true });
              close();
            }}
            data-testid={`template-${t.id}`}
          >
            <div className="text-xs font-semibold">{t.name}</div>
            <div className="mt-1 text-2xs text-muted">{t.description}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-2xs text-muted">Tip: you can also paste any GLSL into the editor — Shadertoy mainImage() and conventional main() shaders are detected automatically.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- save as

export function SaveAsDialog() {
  const p = useWorkspace((s) => s.project);
  const [name, setName] = useState(p ? `${p.name} copy` : 'Untitled');
  const submit = async () => {
    if (!name.trim()) return;
    const saved = await useWorkspace.getState().saveAs(name.trim());
    await useLibrary.getState().refresh();
    if (saved) toast('success', `Saved as "${saved.name}".`);
    close();
  };
  return (
    <Modal
      title="Save as new shader"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} data-testid="saveas-confirm">
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void submit()} aria-label="New shader name" />
      </Field>
      <p className="mt-2 text-2xs text-muted">Creates an independent copy (with its own id) in My shaders. The current version remains as it was.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- export

const RES_PRESETS: [string, number, number][] = [
  ['Viewport', 0, 0],
  ['HD 1280×720', 1280, 720],
  ['Full HD 1920×1080', 1920, 1080],
  ['4K 3840×2160', 3840, 2160],
  ['Square 1080', 1080, 1080],
  ['Square 2048', 2048, 2048],
  ['Portrait 1080×1920', 1080, 1920],
];

export function ExportDialog() {
  const p = useWorkspace((s) => s.project);
  const [res, setRes] = useState(1);
  const [custom, setCustom] = useState<[number, number]>([1920, 1080]);
  const formats = useMemo(() => supportedRecorderFormats(), []);
  const [fmtIdx, setFmtIdx] = useState(0);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(5);
  const [fromStart, setFromStart] = useState(true);
  const [recording, setRecording] = useState<{ rec: Recording; started: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<() => Promise<void>>(async () => {});

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (tick.current) clearInterval(tick.current);
    },
    [],
  );

  if (!p) return null;
  const base = safeFilename(p.name);
  const r = getMainRenderer();
  const isCustom = res === RES_PRESETS.length;
  const [w, h] = isCustom ? custom : res === 0 || !RES_PRESETS[res] ? [r?.canvas.width ?? 1280, r?.canvas.height ?? 720] : [RES_PRESETS[res][1], RES_PRESETS[res][2]];

  const png = async () => {
    if (!r) return;
    try {
      const img = r.renderToPixels(w, h);
      downloadBlob(await imageDataToBlob(img), `${base}-${img.width}x${img.height}.png`);
      if (img.width !== w || img.height !== h) toast('warn', `Clamped to ${img.width}×${img.height} by GPU limits.`);
    } catch (e) {
      toast('error', `Snapshot failed: ${(e as Error).message}`);
    }
  };

  const zip = async () => {
    const ids = new Set(p.channels.map((c) => c.assetId).filter((x): x is string => !!x && !x.startsWith('builtin:')));
    const assets = (await Promise.all([...ids].map((id) => repository.getAsset(id)))).filter((a): a is NonNullable<typeof a> => !!a);
    downloadBlob(await projectToZip(p, assets), `${base}.shaderforge.zip`);
  };

  const finish = async () => {
    if (!recording) return;
    if (timer.current) clearTimeout(timer.current);
    if (tick.current) clearInterval(tick.current);
    const blob = await recording.rec.stop();
    setRecording(null);
    downloadBlob(blob, `${base}.${formats[fmtIdx].ext}`);
    toast('success', `Recorded ${(blob.size / 1024 / 1024).toFixed(1)} MB.`);
  };

  const record = () => {
    if (!r || !formats[fmtIdx]) return;
    if (fromStart) mainClock.restart();
    mainClock.play();
    const rec = startRecording(r.canvas, formats[fmtIdx], fps);
    const started = performance.now();
    setRecording({ rec, started });
    tick.current = setInterval(() => setElapsed((performance.now() - started) / 1000), 200);
    timer.current = setTimeout(() => void finishRef.current(), duration * 1000);
  };
  finishRef.current = finish;

  return (
    <Modal title={`Export “${p.name}”`} onClose={() => !recording && close()} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="label">Source & project</h3>
          <button className="btn justify-start" onClick={() => downloadText(p.fragment, `${base}.${p.format === 'shadertoy' ? 'glsl' : 'frag'}`)} data-testid="export-glsl">
            <FileCode2 size={14} /> GLSL fragment source
          </button>
          {p.vertex && (
            <button className="btn justify-start" onClick={() => downloadText(p.vertex!, `${base}.vert`)}>
              <FileCode2 size={14} /> GLSL vertex source
            </button>
          )}
          <button className="btn justify-start" onClick={() => downloadText(projectToJSON(p), `${base}.shaderforge.json`, 'application/json')} data-testid="export-json">
            <FileJson size={14} /> Project JSON (params, provenance, history)
          </button>
          <button className="btn justify-start" onClick={() => void zip()} data-testid="export-zip">
            <FileArchive size={14} /> Project ZIP (+ assets, thumbnail, attribution)
          </button>
          <button
            className="btn justify-start"
            onClick={() => downloadText(JSON.stringify({ name: p.name, params: p.params, values: p.values, locked: p.locked, modulations: p.modulations, mutations: p.history.map(({ thumbnail: _t, fragment: _f, ...h }) => h) }, null, 2), `${base}.params.json`, 'application/json')}
          >
            <FileJson size={14} /> Parameters & mutation metadata
          </button>
          <p className="text-2xs text-muted">Project JSON/ZIP files re-import with parameters, provenance and mutation history intact.</p>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="label">Image</h3>
          <select className="input" value={res} onChange={(e) => setRes(Number(e.target.value))} aria-label="Image resolution">
            {RES_PRESETS.map(([l], i) => (
              <option key={l} value={i}>
                {l}
              </option>
            ))}
            <option value={RES_PRESETS.length}>Custom…</option>
          </select>
          {isCustom && (
            <div className="flex items-center gap-1">
              <input className="input" type="number" min={16} max={8192} value={custom[0]} onChange={(e) => setCustom([Number(e.target.value) || 1, custom[1]])} aria-label="Width" />×
              <input className="input" type="number" min={16} max={8192} value={custom[1]} onChange={(e) => setCustom([custom[0], Number(e.target.value) || 1])} aria-label="Height" />
            </div>
          )}
          <button className="btn btn-primary justify-start" onClick={() => void png()} disabled={!r} data-testid="export-png">
            <ImageIcon size={14} /> PNG snapshot {w}×{h}
          </button>
          <p className="text-2xs text-muted">Rendered offscreen at the chosen size, independent of the viewport (limited by the GPU's maximum texture size).</p>

          <h3 className="label mt-3">Animation</h3>
          {formats.length === 0 ? (
            <p className="rounded border border-warn/50 p-2 text-2xs text-warn">
              This browser does not support canvas recording (MediaRecorder with canvas.captureStream). Try a current Chrome, Edge or Firefox. GIF and MP4 encoding are not offered because they would require bundling a video encoder.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1">
                <select className="input col-span-3" value={fmtIdx} onChange={(e) => setFmtIdx(Number(e.target.value))} aria-label="Video format">
                  {formats.map((f, i) => (
                    <option key={f.mime} value={i}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <label className="flex flex-col text-2xs text-muted">
                  FPS
                  <select className="input" value={fps} onChange={(e) => setFps(Number(e.target.value))}>
                    {[24, 30, 60].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col text-2xs text-muted">
                  Duration (s)
                  <input className="input" type="number" min={1} max={120} value={duration} onChange={(e) => setDuration(Math.min(120, Math.max(1, Number(e.target.value) || 5)))} />
                </label>
              </div>
              <Toggle checked={fromStart} onChange={setFromStart} label="Restart time at 0 before recording" />
              {recording ? (
                <button className="btn border-danger/60 justify-start" onClick={() => void finish()}>
                  <Square size={13} className="text-danger" /> Stop recording ({elapsed.toFixed(1)}s / {duration}s)
                </button>
              ) : (
                <button className="btn justify-start" onClick={record} disabled={!r}>
                  <Circle size={13} className="text-danger" /> <Video size={14} /> Record {duration}s
                </button>
              )}
              <p className="text-2xs text-muted">Records the live viewport canvas at its current resolution. Only formats your browser reports as supported are listed{formats.some((f) => f.ext === 'mp4') ? '' : ' (MP4 is not supported here)'}.</p>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- settings

export function SettingsDialog() {
  const s = useSettings();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string>('');
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted);
    void navigator.storage?.estimate?.().then((e) => setUsage(`${((e.usage ?? 0) / 1024 / 1024).toFixed(1)} MB used of ~${((e.quota ?? 0) / 1024 / 1024 / 1024).toFixed(1)} GB`));
  }, []);
  const backup = async () => {
    const all = await repository.exportAll();
    downloadBlob(await libraryToZip(all), `shader-forge-backup-${new Date().toISOString().slice(0, 10)}.zip`);
    toast('success', `Backed up ${all.projects.length} shader(s).`);
  };
  return (
    <Modal title="Settings" onClose={close} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="label">Rendering</h3>
          <Toggle
            checked={s.preferWebGL2}
            onChange={(v) => {
              s.set({ preferWebGL2: v });
              setOffscreenPreference(v);
            }}
            label="Prefer WebGL 2 (disable to test WebGL 1 compatibility)"
          />
          <Field label={`Max render pixels · ${(s.maxPixels / 1e6).toFixed(1)} MP`} hint="GPU safeguard: the drawing buffer is scaled down beyond this.">
            <input type="range" min={0.25e6} max={8.3e6} step={0.25e6} value={s.maxPixels} onChange={(e) => s.set({ maxPixels: Number(e.target.value) })} style={{ ['--fill' as string]: `${(s.maxPixels / 8.3e6) * 100}%` }} />
          </Field>
          <Toggle
            checked={s.adaptiveResolution}
            onChange={(v) => s.set({ adaptiveResolution: v })}
            label="Adaptive resolution (render at lower resolution while animating or dragging to hold ~30 fps; sharpen when still)"
          />
          <Field label="Frame-rate cap">
            <select className="input" value={s.fpsCap} onChange={(e) => s.set({ fpsCap: Number(e.target.value) })}>
              {[0, 15, 24, 30, 60].map((f) => (
                <option key={f} value={f}>
                  {f ? `${f} fps` : 'Uncapped (display rate)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thumbnail / variant preview quality">
            <select className="input" value={s.thumbQuality} onChange={(e) => s.set({ thumbQuality: e.target.value as typeof s.thumbQuality })}>
              <option value="low">Low (160×90)</option>
              <option value="medium">Medium (256×144)</option>
              <option value="high">High (384×216)</option>
            </select>
          </Field>
          <Toggle checked={s.showStats} onChange={(v) => s.set({ showStats: v })} label="Show FPS / resolution overlay" />
          <Field label="Start page" hint="What opens when you launch the app without a link.">
            <select className="input" value={s.startPage} onChange={(e) => s.set({ startPage: e.target.value as typeof s.startPage })} data-testid="start-page">
              <option value="workspace">Editor (full workstation)</option>
              <option value="view">Viewer (simple full-screen)</option>
              <option value="landscape">Landscape & waterscape studio</option>
              <option value="fractal">Fractal zoom (Mandelbrot)</option>
            </select>
          </Field>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="label">Editing</h3>
          <Toggle checked={s.autoCompile} onChange={(v) => s.set({ autoCompile: v })} label="Compile while typing" />
          <Field label={`Editor font size · ${s.editorFontSize}px`}>
            <input type="range" min={10} max={20} step={1} value={s.editorFontSize} onChange={(e) => s.set({ editorFontSize: Number(e.target.value) })} style={{ ['--fill' as string]: `${((s.editorFontSize - 10) / 10) * 100}%` }} />
          </Field>
          <Toggle checked={s.compactControls} onChange={(v) => s.set({ compactControls: v })} label="Compact parameter controls" />
          <Toggle checked={s.autosaveLibrary} onChange={(v) => s.set({ autosaveLibrary: v })} label="Autosave my shaders to the library" />
          <h3 className="label mt-2">Storage</h3>
          <p className="text-2xs text-muted">
            Your shaders live only in this browser's IndexedDB ({usage || 'size unknown'}). They do not sync between devices and are lost if site data is cleared — download backups regularly. Persistent storage: {persisted === null ? 'unknown' : persisted ? 'granted' : 'not granted'}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => void backup()} data-testid="backup">
              <Download size={13} /> Download full backup
            </button>
            {!persisted && (
              <button className="btn" onClick={async () => setPersisted(await requestPersistentStorage())}>
                Request persistent storage
              </button>
            )}
          </div>
          <p className="text-2xs text-muted">Restore a backup with Import (the .zip). Imports never overwrite existing shaders.</p>
          <button className="btn mt-2 self-start" onClick={() => s.set(DEFAULT_SETTINGS)}>
            Reset settings
          </button>
          <p className="text-2xs text-muted">Version {__APP_VERSION__}</p>
        </section>
      </div>
    </Modal>
  );
}

export function ShortcutsDialog() {
  const rows: [string, string][] = [
    ['Ctrl/⌘ + Enter', 'Compile now'],
    ['Ctrl/⌘ + S', 'Save'],
    ['Ctrl/⌘ + Shift + S', 'Save as'],
    ['Ctrl/⌘ + Z / Shift + Z', 'Undo / redo (outside the editor)'],
    ['Ctrl/⌘ + B', 'Toggle library'],
    ['Ctrl/⌘ + J', 'Toggle bottom dock'],
    ['Space', 'Play / pause (when not typing)'],
    ['.', 'Step one frame'],
    ['R', 'Mutate current shader'],
    ['F', 'Fullscreen viewport'],
    ['Alt + wheel / Alt + drag', 'Zoom / pan the viewport'],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={close}>
      <table className="w-full text-xs">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line/60">
              <td className="py-1.5 pr-3 font-mono text-muted">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
