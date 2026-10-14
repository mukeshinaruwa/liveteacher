const PREFIX = 'liveTeacher.course.v1';
export interface LocalStore { get<T>(key: string): Promise<T | null>; set<T>(key: string, value: T): Promise<void>; remove(key: string): Promise<void> }
export class LocalStorageStore implements LocalStore {
  async get<T>(key: string): Promise<T | null> { try { const v = localStorage.getItem(`${PREFIX}:${key}`); return v ? JSON.parse(v) as T : null; } catch { return null; } }
  async set<T>(key: string, value: T): Promise<void> { localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify(value)); }
  async remove(key: string): Promise<void> { localStorage.removeItem(`${PREFIX}:${key}`); }
}
/** Storage adapter contract: replace this class with a Firestore/backend implementation later. */
export const courseStore: LocalStore = new LocalStorageStore();