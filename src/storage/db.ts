import Dexie, { type Table } from 'dexie';
import type { Project } from '../core/model';

// Everything lives in this browser's IndexedDB. Nothing is synced anywhere.
class Db extends Dexie {
  projects!: Table<Project, string>;
  constructor() {
    super('elchilaquilwashere');
    this.version(1).stores({ projects: '&id, updatedAt' });
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
  await db.projects.delete(id);
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
