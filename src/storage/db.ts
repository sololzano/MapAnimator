import Dexie, { type Table } from 'dexie';
import type { Project } from '../core/model';

// Everything lives in this browser's IndexedDB. Nothing is synced anywhere.
/** A photo (or other binary) belonging to a project, e.g. a sign photo. */
export interface Asset {
  id: string;
  projectId: string;
  blob: Blob;
  /** Pixel size for photos (0 for audio). */
  w: number;
  h: number;
  createdAt: number;
  kind?: 'photo' | 'audio';
}

class Db extends Dexie {
  projects!: Table<Project, string>;
  assets!: Table<Asset, string>;
  constructor() {
    super('elchilaquilwashere');
    this.version(1).stores({ projects: '&id, updatedAt' });
    this.version(2).stores({ projects: '&id, updatedAt', assets: '&id, projectId' });
  }
}

export const db = new Db();

export async function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function saveProject(p: Project): Promise<void> {
  await db.projects.put(p);
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.assets, async () => {
    await db.projects.delete(id);
    await db.assets.where('projectId').equals(id).delete();
  });
}

export async function putAsset(a: Asset): Promise<void> {
  await db.assets.put(a);
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return db.assets.get(id);
}

/** Photo ids referenced by a project's signs. */
export function referencedAssets(p: Project): Set<string> {
  const ids = new Set<string>();
  for (const s of p.scenes) {
    for (const g of s.signs) if (g.photo) ids.add(g.photo);
    if (s.exp.music) ids.add(s.exp.music.asset);
  }
  return ids;
}

/** Remove a project's assets that no sign uses any more (run when a project is opened). */
export async function pruneAssets(p: Project): Promise<void> {
  const used = referencedAssets(p);
  const ids = (await db.assets.where('projectId').equals(p.id).primaryKeys()) as string[];
  const stale = ids.filter((id) => !used.has(id));
  if (stale.length) await db.assets.bulkDelete(stale);
}

/** Ask the browser not to evict our data. Returns whether storage is persistent. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<{ persisted: boolean; usage: number; quota: number }> {
  try {
    const [persisted, est] = await Promise.all([navigator.storage.persisted(), navigator.storage.estimate()]);
    return { persisted, usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return { persisted: false, usage: 0, quota: 0 };
  }
}
