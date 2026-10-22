/**
 * IndexedDB schema (Dexie). Versioned migrations only ever add stores or
 * indexes — user projects are never dropped during upgrades.
 */
import Dexie, { type Table } from 'dexie';
import type { Asset, Collection, Folder, ShaderProject } from '../types/shader';

export interface SessionRecord {
  key: 'workspace';
  savedAt: number;
  /** Working copy of the open project (may be unsaved). */
  project: ShaderProject;
  /** Whether the working copy has changes not written to `projects`. */
  dirty: boolean;
}

export class ShaderForgeDB extends Dexie {
  projects!: Table<ShaderProject, string>;
  folders!: Table<Folder, string>;
  collections!: Table<Collection, string>;
  assets!: Table<Asset, string>;
  session!: Table<SessionRecord, string>;

  constructor(name = 'shader-forge') {
    super(name);
    this.version(1).stores({
      projects: 'id, name, category, updatedAt, favorite, folderId, *collectionIds, *tags',
      folders: 'id, name, parentId',
      collections: 'id, name',
      assets: 'id, name',
      session: 'key',
    });
  }
}

let instance: ShaderForgeDB | null = null;
export function getDB(): ShaderForgeDB {
  if (!instance) instance = new ShaderForgeDB();
  return instance;
}

/** For tests. */
export function setDB(db: ShaderForgeDB): void {
  instance = db;
}

/** Ask the browser to keep our storage (reduces eviction risk). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* unsupported */
  }
  return false;
}
