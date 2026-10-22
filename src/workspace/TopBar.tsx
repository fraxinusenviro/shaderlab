import { Columns2, Download, Eye, Mountain, FilePlus2, FlaskConical, FolderOpen, Keyboard, LayoutGrid, Menu, Moon, Redo2, Save, SaveAll, Settings, Sun, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import { navigate, useHashRoute } from '../hooks/useHashRoute';
import { useLibrary } from '../state/library';
import { useSettings } from '../state/settings';
import { toast, useUI } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import { importFiles } from '../storage/project';
import { mutateOnce } from './ControlPanel';

export const IMPORT_ACCEPT = '.glsl,.frag,.fs,.vert,.vs,.txt,.json,.zip';

/** Import files: single shaders open immediately; projects/backups go to the library. */
export async function handleImport(files: File[]): Promise<void> {
  if (!files.length) return;
  try {
    const r = await importFiles(files);
    r.warnings.forEach((w) => toast('warn', w));
    if (!r.projects.length) {
      if (!r.warnings.length) toast('warn', 'No shaders found in the selected files.');
      return;
    }
    const { added, renamed, projects } = await useLibrary.getState().importResult(r);
    if (r.kind === 'library') {
      toast('success', `Restored ${added} shader(s)${r.folders.length ? `, ${r.folders.length} folder(s)` : ''} from backup.${renamed ? ` ${renamed} id collision(s) were given new ids; nothing was overwritten.` : ''}`);
      return;
    }
    await useWorkspace.getState().openProject(projects[projects.length - 1]);
    toast('success', `Imported ${added} shader(s). The original source is preserved unchanged.`);
  } catch (e) {
    toast('error', `Import failed: ${(e as Error).message}`);
  }
}

export async function doSave(): Promise<void> {
  const ws = useWorkspace.getState();
  const wasPreset = ws.project?.id.startsWith('preset:');
  const saved = await ws.save();
  if (saved) {
    await useLibrary.getState().refresh();
    toast('success', wasPreset ? `Saved a copy of the preset as "${saved.name}" in My shaders.` : `Saved "${saved.name}".`);
  }
}

export function TopBar({ mobile = false }: { mobile?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const ui = useUI();
  const name = useWorkspace((s) => s.project?.name ?? 'Untitled');
  const dirty = useWorkspace((s) => s.dirty);
  const isPreset = useWorkspace((s) => s.project?.id.startsWith('preset:') ?? false);
  const canUndo = useWorkspace((s) => s.undoStack.length > 0);
  const canRedo = useWorkspace((s) => s.redoStack.length > 0);
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const route = useHashRoute();
  const ws = useWorkspace.getState();
  const projectId = useWorkspace((s) => s.project?.id);

  const B = ({ icon, label, onClick, disabled, testid, hideLabel }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; testid?: string; hideLabel?: boolean }) => (
    <button className="btn btn-ghost px-2" onClick={onClick} disabled={disabled} title={label} aria-label={label} data-testid={testid}>
      {icon}
      {!hideLabel && <span className="hidden xl:inline">{label}</span>}
    </button>
  );

  return (
    <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      {!mobile && (
        <button className="btn-icon" onClick={() => ui.set({ leftOpen: !ui.leftOpen })} aria-label="Toggle library" title="Toggle library (Ctrl+B)">
          <Menu size={16} />
        </button>
      )}
      <div className="flex items-center gap-2 pr-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-5 w-5" />
        <span className="hidden text-sm font-semibold tracking-tight sm:inline">Shader Forge</span>
      </div>
      <div className="flex min-w-0 items-center gap-1 rounded-md bg-bg px-2 py-1 text-xs" title={isPreset ? 'Bundled preset (read-only). Save creates your own copy.' : 'Your shader'}>
        <span className="truncate font-medium" data-testid="project-name">
          {name}
        </span>
        {isPreset && <span className="chip py-0">preset</span>}
        {dirty && <span className="text-accent" aria-label="Unsaved changes" title="Unsaved changes">●</span>}
      </div>
      {!mobile && (
        <nav className="ml-2 flex items-center gap-0.5">
          <B icon={<FilePlus2 size={15} />} label="New" onClick={() => ui.set({ modal: 'new' })} testid="btn-new" />
          <B icon={<FolderOpen size={15} />} label="Import" onClick={() => fileRef.current?.click()} testid="btn-import" />
          <B icon={<Save size={15} />} label="Save" onClick={() => void doSave()} testid="btn-save" />
          <B icon={<SaveAll size={15} />} label="Save As" onClick={() => ui.set({ modal: 'saveAs' })} />
          <div className="mx-1 h-5 w-px bg-line" />
          <B icon={<Undo2 size={15} />} label="Undo" onClick={() => ws.undo()} disabled={!canUndo} hideLabel />
          <B icon={<Redo2 size={15} />} label="Redo" onClick={() => ws.redo()} disabled={!canRedo} hideLabel />
          <div className="mx-1 h-5 w-px bg-line" />
          <B icon={<FlaskConical size={15} />} label="Randomize" onClick={mutateOnce} testid="btn-randomize" />
          <B
            icon={<LayoutGrid size={15} />}
            label="Variants"
            onClick={() => {
              if (route.view === 'gallery') navigate('workspace', projectId);
              else navigate('gallery');
            }}
            testid="btn-gallery"
          />
          <B icon={<Columns2 size={15} />} label="Compare" onClick={() => (route.view === 'compare' ? navigate('workspace', projectId) : navigate('compare'))} testid="btn-compare" />
          <B icon={<Download size={15} />} label="Export" onClick={() => ui.set({ modal: 'export' })} testid="btn-export" />
        </nav>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        <button className="btn btn-ghost px-2" onClick={() => navigate('view', projectId)} title="Simple full-screen viewer" aria-label="Viewer" data-testid="btn-viewer">
          <Eye size={15} />
          <span className="hidden lg:inline">Viewer</span>
        </button>
        <button className="btn btn-ghost px-2" onClick={() => navigate('landscape')} title="Landscape & waterscape studio" aria-label="Landscape studio" data-testid="btn-landscape">
          <Mountain size={15} />
          <span className="hidden lg:inline">Landscape</span>
        </button>
        <div className="mx-1 h-5 w-px bg-line" />
        {mobile && (
          <button className="btn-icon" onClick={() => fileRef.current?.click()} aria-label="Import">
            <FolderOpen size={16} />
          </button>
        )}
        <button className="btn-icon" onClick={() => setSettings({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-label="Toggle theme" title="Toggle light/dark theme">
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {!mobile && (
          <button className="btn-icon" onClick={() => ui.set({ modal: 'shortcuts' })} aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
            <Keyboard size={15} />
          </button>
        )}
        <button className="btn-icon" onClick={() => ui.set({ modal: 'settings' })} aria-label="Settings" title="Settings" data-testid="btn-settings">
          <Settings size={15} />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={IMPORT_ACCEPT}
        className="hidden"
        data-testid="import-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void handleImport(files);
        }}
      />
    </header>
  );
}
