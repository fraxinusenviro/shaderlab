import { Code2, Download, FlaskConical, LayoutGrid, Library, Save, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Resizer, Toasts } from './components/ui';
import { navigate, parseHash, useHashRoute } from './hooks/useHashRoute';
import { FractalPage } from './fractal/FractalPage';
import { LandscapePage } from './landscape/LandscapePage';
import { ViewerPage } from './viewer/ViewerPage';

type EditorView = 'workspace' | 'gallery' | 'compare';
import { useIsMobile } from './hooks/useMediaQuery';
import { PRESETS, getPreset } from './presets/catalog';
import { setAssetLoader } from './renderer/channels';
import { validateShader } from './renderer/offscreen';
import { deriveParams } from './params/parse';
import { useLab } from './state/lab';
import { useLibrary } from './state/library';
import { getMainRenderer, mainClock } from './state/renderer';
import { useSettings } from './state/settings';
import { toast, useUI } from './state/ui';
import { flushSession, startAutosave, useWorkspace } from './state/workspace';
import { requestPersistentStorage } from './storage/db';
import { isPresetId, projectFromPreset } from './storage/project';
import { repository } from './storage/repository';
import { BottomDock, CodeTab } from './workspace/BottomDock';
import { CompareView } from './workspace/CompareView';
import { ControlPanel, mutateOnce } from './workspace/ControlPanel';
import { ExportDialog, NewDialog, SaveAsDialog, SettingsDialog, ShortcutsDialog } from './workspace/Dialogs';
import { GalleryView } from './workspace/GalleryView';
import { LibraryPanel } from './workspace/LibraryPanel';
import { doSave, handleImport, TopBar } from './workspace/TopBar';
import { Viewport } from './workspace/Viewport';

setAssetLoader(async (id) => (await repository.getAsset(id))?.blob ?? null);

async function openById(id: string): Promise<boolean> {
  if (isPresetId(id)) {
    const preset = getPreset(id.slice('preset:'.length));
    if (!preset) return false;
    await useWorkspace.getState().openProject(projectFromPreset(preset));
    return true;
  }
  const p = await repository.get(id);
  if (!p) return false;
  await useWorkspace.getState().openProject(p);
  return true;
}

async function boot(routeId: string | undefined): Promise<void> {
  await useLibrary.getState().refresh();
  const session = await repository.loadSession().catch(() => undefined);
  if (session && (!routeId || routeId === session.project.id)) {
    await useWorkspace.getState().openProject(session.project, { keepDirty: session.dirty });
    if (session.dirty) {
      useWorkspace.setState({ recovered: { savedAt: session.savedAt } });
    }
    return;
  }
  if (routeId && (await openById(routeId))) return;
  await useWorkspace.getState().openProject(projectFromPreset(PRESETS[0]));
}

/** Exposed for automated smoke tests and debugging; contains no secrets. */
function exposeTestHooks() {
  (window as unknown as Record<string, unknown>).__shaderForge = {
    workspace: useWorkspace,
    library: useLibrary,
    lab: useLab,
    clock: mainClock,
    renderer: getMainRenderer,
    validatePresets: () =>
      PRESETS.map((p) => {
        const out = validateShader({ fragment: p.fragment, format: p.format, params: deriveParams(p.fragment, p.format) });
        return { id: p.id, ok: out.ok, errors: out.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message) };
      }),
  };
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const typing = target.closest('.cm-editor') || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const ws = useWorkspace.getState();
      const ui = useUI.getState();
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        ws.compileNow();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (e.shiftKey) ui.set({ modal: 'saveAs' });
        else void doSave();
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        ui.set({ leftOpen: !ui.leftOpen });
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        ui.set({ bottomOpen: !ui.bottomOpen });
      } else if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) ws.redo();
        else ws.undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        ws.redo();
      } else if (!typing && !mod && !e.altKey) {
        if (e.key === ' ') {
          e.preventDefault();
          if (mainClock.playing) mainClock.pause();
          else mainClock.play();
        } else if (e.key === '.') mainClock.step();
        else if (e.key === 'r' || e.key === 'R') mutateOnce();
        else if (e.key === 'f' || e.key === 'F') {
          const el = document.querySelector('[data-testid="viewport"]');
          if (document.fullscreenElement) void document.exitFullscreen();
          else void el?.requestFullscreen?.();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (e) => console.warn('Service worker registration failed', e),
  });
  useEffect(() => {
    if (offlineReady) {
      toast('success', 'Shader Forge is cached and ready to work offline.');
      setOfflineReady(false);
    }
  }, [offlineReady, setOfflineReady]);
  if (!needRefresh) return null;
  return (
    <div className="fixed bottom-16 left-3 z-[60] flex items-center gap-3 rounded-lg border border-accent/60 bg-panel px-3 py-2 text-xs shadow-xl md:bottom-4" role="alert">
      A new version of Shader Forge is available. Your shaders are stored separately and will be kept.
      <button
        className="btn btn-primary"
        onClick={() => {
          flushSession();
          void updateServiceWorker(true);
        }}
      >
        Update
      </button>
    </div>
  );
}

function RecoveredBanner() {
  const recovered = useWorkspace((s) => s.recovered);
  if (!recovered) return null;
  return (
    <div className="flex items-center gap-3 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-xs" role="status">
      Recovered unsaved changes from your previous session ({new Date(recovered.savedAt).toLocaleString()}).
      <button className="btn py-0.5" onClick={() => void doSave().then(() => useWorkspace.getState().dismissRecovered())}>
        Save now
      </button>
      <button className="ml-auto text-muted hover:text-fg" onClick={() => useWorkspace.getState().dismissRecovered()} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

function Modals() {
  const modal = useUI((s) => s.modal);
  if (modal === 'new') return <NewDialog />;
  if (modal === 'export') return <ExportDialog />;
  if (modal === 'settings') return <SettingsDialog />;
  if (modal === 'saveAs') return <SaveAsDialog />;
  if (modal === 'shortcuts') return <ShortcutsDialog />;
  return null;
}

function DesktopLayout({ view }: { view: EditorView }) {
  const ui = useUI();
  const setW = (k: 'leftWidth' | 'rightWidth' | 'bottomHeight', v: number, min: number, max: number) => ui.set({ [k]: Math.min(max, Math.max(min, v)) });
  return (
    <div className="flex min-h-0 flex-1">
      {ui.leftOpen && (
        <>
          <aside style={{ width: ui.leftWidth }} className="shrink-0 border-r border-line">
            <LibraryPanel />
          </aside>
          <Resizer axis="x" onDelta={(d) => setW('leftWidth', useUI.getState().leftWidth + d, 200, 480)} />
        </>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        {view === 'gallery' ? (
          <GalleryView />
        ) : view === 'compare' ? (
          <CompareView />
        ) : (
          <>
            <div className="min-h-0 flex-1">
              <Viewport />
            </div>
            {ui.bottomOpen ? (
              <>
                <Resizer axis="y" onDelta={(d) => setW('bottomHeight', useUI.getState().bottomHeight - d, 120, window.innerHeight - 200)} />
                <div style={{ height: ui.bottomHeight }} className="shrink-0">
                  <BottomDock />
                </div>
              </>
            ) : (
              <button className="border-t border-line bg-panel py-1 text-2xs text-muted hover:text-fg" onClick={() => ui.set({ bottomOpen: true })}>
                Show code dock (Ctrl+J)
              </button>
            )}
          </>
        )}
      </main>
      {view === 'workspace' &&
        (ui.rightOpen ? (
          <>
            <Resizer axis="x" onDelta={(d) => setW('rightWidth', useUI.getState().rightWidth - d, 260, 560)} />
            <aside style={{ width: ui.rightWidth }} className="shrink-0 border-l border-line">
              <ControlPanel onClose={() => ui.set({ rightOpen: false })} />
            </aside>
          </>
        ) : (
          <button className="w-6 border-l border-line bg-panel text-muted hover:text-fg" onClick={() => ui.set({ rightOpen: true })} aria-label="Show controls" title="Show controls">
            <SlidersHorizontal size={14} className="mx-auto" />
          </button>
        ))}
    </div>
  );
}

function MobileLayout({ view }: { view: EditorView }) {
  const panel = useUI((s) => s.mobilePanel);
  const set = useUI((s) => s.set);
  const projectId = useWorkspace((s) => s.project?.id);
  const close = () => set({ mobilePanel: null });
  const NavBtn = ({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) => (
    <button className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-2xs ${active ? 'text-accent' : 'text-muted'}`} onClick={onClick} aria-label={label}>
      {icon}
      {label}
    </button>
  );
  return (
    <>
      <main className="relative min-h-0 flex-1">
        {view === 'gallery' ? <GalleryView /> : view === 'compare' ? <CompareView /> : <Viewport mobile />}
        {panel && (
          <div className="absolute inset-0 z-30 flex flex-col bg-black/40" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className={`flex min-h-0 flex-col border-line bg-panel shadow-2xl ${panel === 'library' ? 'h-full w-[88%] border-r' : 'mt-auto h-[75%] rounded-t-xl border-t'}`} role="dialog" aria-label={panel}>
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-xs font-semibold capitalize">{panel === 'controls' ? 'Controls' : panel === 'code' ? 'GLSL code' : 'Library'}</span>
                <button className="btn-icon" onClick={close} aria-label="Close panel">
                  <X size={16} />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {panel === 'library' && <LibraryPanel onOpened={close} />}
                {panel === 'controls' && <ControlPanel />}
                {panel === 'code' && <MobileCode />}
              </div>
            </div>
          </div>
        )}
      </main>
      <nav className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]" aria-label="Main actions">
        <NavBtn icon={<Library size={18} />} label="Library" active={panel === 'library'} onClick={() => set({ mobilePanel: panel === 'library' ? null : 'library' })} />
        <NavBtn icon={<SlidersHorizontal size={18} />} label="Controls" active={panel === 'controls'} onClick={() => set({ mobilePanel: panel === 'controls' ? null : 'controls' })} />
        <NavBtn icon={<Code2 size={18} />} label="Code" active={panel === 'code'} onClick={() => set({ mobilePanel: panel === 'code' ? null : 'code' })} />
        <NavBtn icon={<FlaskConical size={18} />} label="Mutate" onClick={mutateOnce} />
        <NavBtn
          icon={<LayoutGrid size={18} />}
          label="Variants"
          active={view === 'gallery'}
          onClick={() => {
            close();
            if (view === 'gallery') navigate('workspace', projectId);
            else {
              if (!useLab.getState().variants.length) useLab.getState().generate();
              navigate('gallery');
            }
          }}
        />
        <NavBtn icon={<Save size={18} />} label="Save" onClick={() => void doSave()} />
        <NavBtn icon={<Download size={18} />} label="Export" onClick={() => set({ modal: 'export' })} />
      </nav>
    </>
  );
}

function MobileCode() {
  const [tab, setTab] = useState<'code' | 'more'>('code');
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line text-xs">
        <button className={`tab ${tab === 'code' ? 'tab-active' : ''}`} onClick={() => setTab('code')}>
          Editor
        </button>
        <button className={`tab ${tab === 'more' ? 'tab-active' : ''}`} onClick={() => setTab('more')}>
          Console / history / more
        </button>
      </div>
      <div className="min-h-0 flex-1">{tab === 'code' ? <CodeTab reveal={null} /> : <BottomDock />}</div>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const isMobile = useIsMobile();
  const theme = useSettings((s) => s.theme);
  const booted = useRef(false);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  useShortcuts();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d12' : '#f0f2f6');
  }, [theme]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    exposeTestHooks();
    // Honour the configured start page when the app is opened without a route.
    const start = useSettings.getState().startPage;
    if (!window.location.hash.replace(/^#\/?/, '') && start !== 'workspace') window.location.hash = `#/${start}`;
    void boot(route.view === 'workspace' ? route.shaderId : undefined)
      .catch((e) => toast('error', `Startup problem: ${(e as Error).message}`))
      .finally(() => setReady(true));
    void requestPersistentStorage();
    const stop = startAutosave(() => void useLibrary.getState().refresh());
    const onHide = () => document.visibilityState === 'hidden' && flushSession();
    window.addEventListener('pagehide', flushSession);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stop();
      window.removeEventListener('pagehide', flushSession);
      document.removeEventListener('visibilitychange', onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow #/shader/<id> navigation (back/forward, pasted links). Only real
  // hashchange events count — openProject() itself uses replaceState.
  useEffect(() => {
    if (!ready) return;
    const onHash = () => {
      const id = parseHash(window.location.hash).shaderId;
      if (!id || id === useWorkspace.getState().project?.id) return;
      void openById(id).then((ok) => !ok && toast('warn', `Shader "${id}" was not found in this browser.`));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ready]);

  if (route.view === 'view' || route.view === 'landscape' || route.view === 'fractal') {
    return (
      <div className="h-full">
        {route.view === 'view' ? <ViewerPage /> : route.view === 'landscape' ? <LandscapePage /> : <FractalPage />}
        <Toasts />
        <UpdatePrompt />
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void handleImport(Array.from(e.dataTransfer.files));
      }}
    >
      <TopBar mobile={isMobile} />
      <RecoveredBanner />
      {isMobile ? <MobileLayout view={route.view as EditorView} /> : <DesktopLayout view={route.view as EditorView} />}
      <Modals />
      <Toasts />
      <UpdatePrompt />
      {dragging && <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center border-4 border-dashed border-accent/70 bg-black/50 text-sm text-white">Drop .glsl / .frag / .json / .zip files to import</div>}
    </div>
  );
}
