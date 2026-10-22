/**
 * Persistence interface. The UI only talks to ProjectRepository, so a
 * remote-sync implementation can be added later (e.g. wrapping the local
 * repository and replicating changes) without touching components.
 */
import type { Asset, Collection, Folder, ProjectSummary, ShaderProject } from '../types/shader';
import { getDB, type SessionRecord } from './db';

export interface ProjectRepository {
  listSummaries(): Promise<ProjectSummary[]>;
  get(id: string): Promise<ShaderProject | undefined>;
  put(project: ShaderProject): Promise<void>;
  putMany(projects: ShaderProject[]): Promise<void>;
  delete(id: string): Promise<void>;
  listFolders(): Promise<Folder[]>;
  putFolder(f: Folder): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  listCollections(): Promise<Collection[]>;
  putCollection(c: Collection): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  getAsset(id: string): Promise<Asset | undefined>;
  putAsset(a: Asset): Promise<void>;
  listAssets(): Promise<Asset[]>;
  saveSession(rec: SessionRecord): Promise<void>;
  loadSession(): Promise<SessionRecord | undefined>;
  clearSession(): Promise<void>;
  exportAll(): Promise<{ projects: ShaderProject[]; folders: Folder[]; collections: Collection[]; assets: Asset[] }>;
}

export function toSummary(p: ShaderProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    tags: p.tags,
    favorite: p.favorite,
    folderId: p.folderId,
    collectionIds: p.collectionIds,
    thumbnail: p.thumbnail,
    provenance: p.provenance,
    updatedAt: p.updatedAt,
  };
}

export class LocalRepository implements ProjectRepository {
  private get db() {
    return getDB();
  }
  async listSummaries() {
    const all = await this.db.projects.orderBy('updatedAt').reverse().toArray();
    return all.map(toSummary);
  }
  get(id: string) {
    return this.db.projects.get(id);
  }
  async put(project: ShaderProject) {
    await this.db.projects.put(project);
  }
  async putMany(projects: ShaderProject[]) {
    await this.db.projects.bulkPut(projects);
  }
  async delete(id: string) {
    await this.db.projects.delete(id);
  }
  listFolders() {
    return this.db.folders.toArray();
  }
  async putFolder(f: Folder) {
    await this.db.folders.put(f);
  }
  async deleteFolder(id: string) {
    await this.db.transaction('rw', this.db.folders, this.db.projects, async () => {
      await this.db.projects.where('folderId').equals(id).modify({ folderId: null });
      await this.db.folders.where('parentId').equals(id).modify({ parentId: null });
      await this.db.folders.delete(id);
    });
  }
  listCollections() {
    return this.db.collections.toArray();
  }
  async putCollection(c: Collection) {
    await this.db.collections.put(c);
  }
  async deleteCollection(id: string) {
    await this.db.transaction('rw', this.db.collections, this.db.projects, async () => {
      await this.db.projects
        .where('collectionIds')
        .equals(id)
        .modify((p) => {
          p.collectionIds = p.collectionIds.filter((c) => c !== id);
        });
      await this.db.collections.delete(id);
    });
  }
  getAsset(id: string) {
    return this.db.assets.get(id);
  }
  async putAsset(a: Asset) {
    await this.db.assets.put(a);
  }
  listAssets() {
    return this.db.assets.toArray();
  }
  async saveSession(rec: SessionRecord) {
    await this.db.session.put(rec);
  }
  loadSession() {
    return this.db.session.get('workspace');
  }
  async clearSession() {
    await this.db.session.delete('workspace');
  }
  async exportAll() {
    const [projects, folders, collections, assets] = await Promise.all([this.db.projects.toArray(), this.db.folders.toArray(), this.db.collections.toArray(), this.db.assets.toArray()]);
    return { projects, folders, collections, assets };
  }
}

export const repository: ProjectRepository = new LocalRepository();
