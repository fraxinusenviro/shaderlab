/** Library store: user projects, folders, collections and filters. */
import { create } from 'zustand';
import { forkProject, uid, type ImportResult } from '../storage/project';
import { repository } from '../storage/repository';
import type { Collection, Folder, ProjectSummary, ShaderProject } from '../types/shader';

export type SourceFilter = 'all' | 'presets' | 'mine';

interface LibraryState {
  summaries: ProjectSummary[];
  folders: Folder[];
  collections: Collection[];
  loaded: boolean;
  search: string;
  source: SourceFilter;
  category: string | null;
  folderId: string | null;
  collectionId: string | null;
  favoritesOnly: boolean;
  refresh: () => Promise<void>;
  setFilter: (patch: Partial<Pick<LibraryState, 'search' | 'source' | 'category' | 'folderId' | 'collectionId' | 'favoritesOnly'>>) => void;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<ShaderProject | null>;
  toggleFavorite: (id: string) => Promise<void>;
  moveToFolder: (id: string, folderId: string | null) => Promise<void>;
  toggleCollection: (id: string, collectionId: string) => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  createCollection: (name: string) => Promise<Collection>;
  deleteCollection: (id: string) => Promise<void>;
  importResult: (r: ImportResult) => Promise<{ added: number; renamed: number; projects: ShaderProject[] }>;
}

const COLLECTION_COLORS = ['#38bdf8', '#f472b6', '#a78bfa', '#fb923c', '#4ade80', '#facc15', '#f87171', '#2dd4bf'];

async function mutate(id: string, fn: (p: ShaderProject) => ShaderProject | void) {
  const p = await repository.get(id);
  if (!p) return;
  const next = fn(p) ?? p;
  await repository.put({ ...next, updatedAt: Date.now() });
}

export const useLibrary = create<LibraryState>()((set, get) => ({
  summaries: [],
  folders: [],
  collections: [],
  loaded: false,
  search: '',
  source: 'all',
  category: null,
  folderId: null,
  collectionId: null,
  favoritesOnly: false,

  refresh: async () => {
    const [summaries, folders, collections] = await Promise.all([repository.listSummaries(), repository.listFolders(), repository.listCollections()]);
    set({ summaries, folders, collections, loaded: true });
  },
  setFilter: (patch) => set(patch),
  rename: async (id, name) => {
    await mutate(id, (p) => ({ ...p, name }));
    await get().refresh();
  },
  remove: async (id) => {
    await repository.delete(id);
    await get().refresh();
  },
  duplicate: async (id) => {
    const p = await repository.get(id);
    if (!p) return null;
    const copy = forkProject(p, `${p.name} copy`);
    await repository.put(copy);
    await get().refresh();
    return copy;
  },
  toggleFavorite: async (id) => {
    await mutate(id, (p) => ({ ...p, favorite: !p.favorite }));
    await get().refresh();
  },
  moveToFolder: async (id, folderId) => {
    await mutate(id, (p) => ({ ...p, folderId }));
    await get().refresh();
  },
  toggleCollection: async (id, collectionId) => {
    await mutate(id, (p) => ({ ...p, collectionIds: p.collectionIds.includes(collectionId) ? p.collectionIds.filter((c) => c !== collectionId) : [...p.collectionIds, collectionId] }));
    await get().refresh();
  },
  createFolder: async (name) => {
    const f: Folder = { id: uid('f_'), name, parentId: null, createdAt: Date.now() };
    await repository.putFolder(f);
    await get().refresh();
    return f;
  },
  renameFolder: async (id, name) => {
    const f = get().folders.find((x) => x.id === id);
    if (!f) return;
    await repository.putFolder({ ...f, name });
    await get().refresh();
  },
  deleteFolder: async (id) => {
    await repository.deleteFolder(id);
    if (get().folderId === id) set({ folderId: null });
    await get().refresh();
  },
  createCollection: async (name) => {
    const c: Collection = { id: uid('c_'), name, color: COLLECTION_COLORS[get().collections.length % COLLECTION_COLORS.length], createdAt: Date.now() };
    await repository.putCollection(c);
    await get().refresh();
    return c;
  },
  deleteCollection: async (id) => {
    await repository.deleteCollection(id);
    if (get().collectionId === id) set({ collectionId: null });
    await get().refresh();
  },
  importResult: async (r) => {
    // Never overwrite existing user content: colliding ids get fresh ones.
    const existing = new Set(get().summaries.map((s) => s.id));
    let renamed = 0;
    const projects = r.projects.map((p) => {
      if (p.id.startsWith('preset:') || existing.has(p.id)) {
        renamed++;
        return { ...p, id: uid('p_') };
      }
      return p;
    });
    for (const f of r.folders) if (!get().folders.some((x) => x.id === f.id)) await repository.putFolder(f);
    for (const c of r.collections) if (!get().collections.some((x) => x.id === c.id)) await repository.putCollection(c);
    for (const a of r.assets) await repository.putAsset(a);
    await repository.putMany(projects);
    await get().refresh();
    return { added: projects.length, renamed, projects };
  },
}));
