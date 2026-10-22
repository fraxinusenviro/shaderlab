import { Copy, Download, Folder as FolderIcon, FolderPlus, Heart, MoreHorizontal, Package, Pencil, Search, Tag, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Empty } from '../components/ui';
import { PRESETS, PRESET_CATEGORIES, THEMES } from '../presets/catalog';
import { requestThumbnail } from '../renderer/offscreen';
import { deriveParams, mergeParams } from '../params/parse';
import { useLibrary, type SourceFilter } from '../state/library';
import { THUMB_SIZES } from '../state/settings';
import { toast } from '../state/ui';
import { useWorkspace } from '../state/workspace';
import { projectFromPreset, projectToJSON } from '../storage/project';
import { repository } from '../storage/repository';
import type { PresetDef, ProjectSummary } from '../types/shader';
import { downloadText, safeFilename } from '../utils/download';

const presetThumbs = new Map<string, string>();

/** Lazily render a preset thumbnail once the card scrolls into view. */
function PresetThumb({ preset }: { preset: PresetDef }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState(presetThumbs.get(preset.id));
  useEffect(() => {
    if (src || !ref.current) return;
    let cancel: (() => void) | null = null;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const params = deriveParams(preset.fragment, preset.format);
      const { values } = mergeParams(params, [], {});
      const [w, h] = THUMB_SIZES.low;
      const job = requestThumbnail({ input: { fragment: preset.fragment, format: preset.format, params }, values, channels: preset.channels, time: 2.5, width: w, height: h, priority: 8 });
      cancel = job.cancel;
      void job.promise.then((r) => {
        if (r.dataUrl) {
          presetThumbs.set(preset.id, r.dataUrl);
          setSrc(r.dataUrl);
        }
      });
    });
    io.observe(ref.current);
    return () => {
      io.disconnect();
      cancel?.();
    };
  }, [preset, src]);
  return <div ref={ref} className="h-9 w-16 shrink-0 overflow-hidden rounded bg-bg">{src && <img src={src} alt="" className="h-full w-full object-cover" />}</div>;
}

async function confirmDiscard(): Promise<boolean> {
  const { dirty, project } = useWorkspace.getState();
  if (!dirty || !project) return true;
  return confirm(`"${project.name}" has unsaved changes. Discard them and open another shader?`);
}

export async function openPreset(preset: PresetDef): Promise<void> {
  if (!(await confirmDiscard())) return;
  await useWorkspace.getState().openProject(projectFromPreset(preset));
}

export async function openUserProject(id: string): Promise<void> {
  if (!(await confirmDiscard())) return;
  const p = await repository.get(id);
  if (!p) return toast('error', 'That shader no longer exists.');
  await useWorkspace.getState().openProject(p);
}

function ItemMenu({ s, onClose }: { s: ProjectSummary; onClose: () => void }) {
  const lib = useLibrary();
  return (
    <div className="absolute right-1 top-8 z-20 w-52 rounded-md border border-line bg-panel py-1 text-xs shadow-xl" onMouseLeave={onClose}>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-panel2"
        onClick={async () => {
          const n = prompt('Rename shader', s.name);
          if (n?.trim()) {
            await lib.rename(s.id, n.trim());
            const cur = useWorkspace.getState().project;
            if (cur?.id === s.id) useWorkspace.getState().setMeta({ name: n.trim() });
          }
          onClose();
        }}
      >
        <Pencil size={12} /> Rename
      </button>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-panel2"
        onClick={async () => {
          const c = await lib.duplicate(s.id);
          if (c) toast('success', `Duplicated as "${c.name}".`);
          onClose();
        }}
      >
        <Copy size={12} /> Duplicate
      </button>
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-panel2"
        onClick={async () => {
          const p = await repository.get(s.id);
          if (p) downloadText(projectToJSON(p), `${safeFilename(p.name)}.shaderforge.json`, 'application/json');
          onClose();
        }}
      >
        <Download size={12} /> Export JSON
      </button>
      <div className="my-1 border-t border-line" />
      <div className="px-3 py-1 text-2xs text-muted">Move to folder</div>
      <select className="input mx-3 w-[calc(100%-1.5rem)]" value={s.folderId ?? ''} onChange={(e) => void lib.moveToFolder(s.id, e.target.value || null)}>
        <option value="">(no folder)</option>
        {lib.folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {lib.collections.length > 0 && (
        <>
          <div className="px-3 pb-1 pt-2 text-2xs text-muted">Collections</div>
          {lib.collections.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-0.5">
              <input type="checkbox" checked={s.collectionIds.includes(c.id)} onChange={() => void lib.toggleCollection(s.id, c.id)} />
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.name}
            </label>
          ))}
        </>
      )}
      <div className="my-1 border-t border-line" />
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-danger hover:bg-panel2"
        onClick={async () => {
          if (confirm(`Delete "${s.name}" from this browser's library? Export a backup first if unsure.`)) {
            await lib.remove(s.id);
            toast('info', `Deleted "${s.name}".`);
          }
          onClose();
        }}
      >
        <Trash2 size={12} /> Delete
      </button>
    </div>
  );
}

export function LibraryPanel({ onOpened }: { onOpened?: () => void }) {
  const lib = useLibrary();
  const currentId = useWorkspace((s) => s.project?.id);
  const [menu, setMenu] = useState<string | null>(null);
  const [theme, setTheme] = useState<string | null>(null);

  const q = lib.search.toLowerCase();
  const presets = useMemo(
    () =>
      PRESETS.filter(
        (p) =>
          (!q || `${p.name} ${p.description} ${p.tags.join(' ')} ${p.category}`.toLowerCase().includes(q)) &&
          (!lib.category || p.category === lib.category) &&
          (!theme || p.theme === theme),
      ),
    [q, lib.category, theme],
  );
  const mine = useMemo(
    () =>
      lib.summaries.filter(
        (s) =>
          (!q || `${s.name} ${s.tags.join(' ')} ${s.category}`.toLowerCase().includes(q)) &&
          (!lib.category || s.category === lib.category) &&
          (!lib.folderId || s.folderId === lib.folderId) &&
          (!lib.collectionId || s.collectionIds.includes(lib.collectionId)) &&
          (!lib.favoritesOnly || s.favorite),
      ),
    [lib.summaries, q, lib.category, lib.folderId, lib.collectionId, lib.favoritesOnly],
  );
  const userCategories = Array.from(new Set(lib.summaries.map((s) => s.category))).filter((c) => !PRESET_CATEGORIES.includes(c));
  const showPresets = lib.source !== 'mine' && !lib.folderId && !lib.collectionId && !lib.favoritesOnly;
  const showMine = lib.source !== 'presets';

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" data-testid="library">
      <div className="flex flex-col gap-2 border-b border-line p-2">
        <div className="flex items-center gap-1 rounded-md border border-line bg-bg px-2">
          <Search size={13} className="text-muted" />
          <input className="w-full bg-transparent py-1.5 text-xs outline-none" placeholder="Search shaders, tags…" value={lib.search} onChange={(e) => lib.setFilter({ search: e.target.value })} aria-label="Search library" />
        </div>
        <div className="flex rounded-md border border-line p-0.5 text-2xs" role="group" aria-label="Source filter">
          {(['all', 'presets', 'mine'] as SourceFilter[]).map((s) => (
            <button key={s} className={`flex-1 rounded px-2 py-1 ${lib.source === s ? 'bg-panel2 text-fg' : 'text-muted'}`} onClick={() => lib.setFilter({ source: s })} aria-pressed={lib.source === s}>
              {s === 'all' ? 'All' : s === 'presets' ? 'Presets' : 'My shaders'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <button className={`chip ${lib.favoritesOnly ? 'border-danger/60 text-fg' : ''}`} onClick={() => lib.setFilter({ favoritesOnly: !lib.favoritesOnly })} aria-pressed={lib.favoritesOnly}>
            <Heart size={10} /> Favourites
          </button>
          {THEMES.map((t) => (
            <button key={t} className={`chip ${theme === t ? 'border-accent text-fg' : ''}`} onClick={() => setTheme(theme === t ? null : t)} aria-pressed={theme === t}>
              {t}
            </button>
          ))}
        </div>
        <select className="input" value={lib.category ?? ''} onChange={(e) => lib.setFilter({ category: e.target.value || null })} aria-label="Category">
          <option value="">All categories</option>
          {[...PRESET_CATEGORIES, ...userCategories].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {showMine && (
          <section>
            <div className="panel-title">
              <span className="flex items-center gap-1">
                <User size={11} /> My shaders ({mine.length})
              </span>
              <button
                className="btn-icon h-5 w-5"
                title="New folder"
                aria-label="New folder"
                onClick={async () => {
                  const n = prompt('Folder name');
                  if (n?.trim()) await lib.createFolder(n.trim());
                }}
              >
                <FolderPlus size={12} />
              </button>
            </div>
            {(lib.folders.length > 0 || lib.collections.length > 0) && (
              <div className="flex flex-wrap gap-1 px-2 pb-2">
                {lib.folders.map((f) => (
                  <span key={f.id} className={`chip cursor-pointer ${lib.folderId === f.id ? 'border-accent text-fg' : ''}`}>
                    <button className="flex items-center gap-1" onClick={() => lib.setFilter({ folderId: lib.folderId === f.id ? null : f.id })}>
                      <FolderIcon size={10} /> {f.name}
                    </button>
                    <button
                      className="hover:text-danger"
                      aria-label={`Delete folder ${f.name}`}
                      onClick={() => confirm(`Delete folder "${f.name}"? Shaders inside are kept.`) && void lib.deleteFolder(f.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {lib.collections.map((c) => (
                  <span key={c.id} className={`chip cursor-pointer ${lib.collectionId === c.id ? 'text-fg' : ''}`} style={{ borderColor: lib.collectionId === c.id ? c.color : undefined }}>
                    <button className="flex items-center gap-1" onClick={() => lib.setFilter({ collectionId: lib.collectionId === c.id ? null : c.id })}>
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.name}
                    </button>
                    <button className="hover:text-danger" aria-label={`Delete collection ${c.name}`} onClick={() => confirm(`Delete collection "${c.name}"?`) && void lib.deleteCollection(c.id)}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="px-2 pb-1">
              <button
                className="text-2xs text-muted hover:text-fg"
                onClick={async () => {
                  const n = prompt('Collection name');
                  if (n?.trim()) await lib.createCollection(n.trim());
                }}
              >
                <Tag size={10} className="inline" /> New collection
              </button>
            </div>
            {mine.length === 0 && <Empty>{lib.summaries.length ? 'No matches.' : 'Nothing saved yet. Open a preset and press Save, or import GLSL files.'}</Empty>}
            {mine.map((s) => (
              <div key={s.id} className={`group relative flex items-center gap-2 px-2 py-1.5 ${s.id === currentId ? 'bg-accent/10' : 'hover:bg-panel2'}`} data-testid="library-item">
                <button
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  onClick={async () => {
                    await openUserProject(s.id);
                    onOpened?.();
                  }}
                >
                  <div className="h-9 w-16 shrink-0 overflow-hidden rounded bg-bg">{s.thumbnail && <img src={s.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{s.name}</div>
                    <div className="truncate text-2xs text-muted">
                      {s.provenance.kind === 'mutation' ? 'variant · ' : s.provenance.kind === 'import' ? 'imported · ' : s.provenance.kind === 'preset' ? 'from preset · ' : ''}
                      {new Date(s.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
                <button className={`btn-icon h-6 w-6 ${s.favorite ? 'text-danger' : 'opacity-0 group-hover:opacity-100'}`} onClick={() => void lib.toggleFavorite(s.id)} aria-label="Toggle favourite" title="Favourite">
                  <Heart size={12} fill={s.favorite ? 'currentColor' : 'none'} />
                </button>
                <button className="btn-icon h-6 w-6" onClick={() => setMenu(menu === s.id ? null : s.id)} aria-label="More actions">
                  <MoreHorizontal size={13} />
                </button>
                {menu === s.id && <ItemMenu s={s} onClose={() => setMenu(null)} />}
              </div>
            ))}
          </section>
        )}
        {showPresets && (
          <section>
            <div className="panel-title">
              <span className="flex items-center gap-1">
                <Package size={11} /> Bundled presets ({presets.length})
              </span>
              <span className="normal-case tracking-normal">read-only</span>
            </div>
            {presets.map((p) => (
              <button
                key={p.id}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${currentId === `preset:${p.id}` ? 'bg-accent/10' : 'hover:bg-panel2'}`}
                onClick={async () => {
                  await openPreset(p);
                  onOpened?.();
                }}
                data-testid="preset-item"
                data-preset={p.id}
              >
                <PresetThumb preset={p} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{p.name}</div>
                  <div className="truncate text-2xs text-muted">
                    {p.category}
                    {p.theme ? ` · ${p.theme}` : ''}
                    {p.author !== 'Shader Forge contributors' ? ` · ${p.license}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
