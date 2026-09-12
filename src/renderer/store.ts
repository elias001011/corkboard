import type { BoardNode, Case, Drawing, Edge, Photo } from "./types";

const DB_NAME = "corkboard";
const DB_VERSION = 1;
const STORES = ["cases", "nodes", "edges", "drawings", "photos"] as const;
type StoreName = (typeof STORES)[number];

let db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const name of STORES) {
        if (d.objectStoreNames.contains(name)) continue;
        const s = d.createObjectStore(name, { keyPath: "id" });
        if (name !== "cases" && name !== "photos") s.createIndex("caseId", "caseId");
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const store = {
  getAll<T>(name: StoreName): Promise<T[]> {
    return tx<T[]>(name, "readonly", (s) => s.getAll());
  },
  byCase<T>(name: StoreName, caseId: string): Promise<T[]> {
    return tx<T[]>(name, "readonly", (s) => s.index("caseId").getAll(caseId));
  },
  get<T>(name: StoreName, id: string): Promise<T | undefined> {
    return tx<T | undefined>(name, "readonly", (s) => s.get(id));
  },
  put<T>(name: StoreName, value: T): Promise<unknown> {
    return tx(name, "readwrite", (s) => s.put(value));
  },
  del(name: StoreName, id: string): Promise<unknown> {
    return tx(name, "readwrite", (s) => s.delete(id));
  },
  async clearAll(): Promise<void> {
    const d = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction([...STORES], "readwrite");
      for (const n of STORES) t.objectStore(n).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async deleteCase(caseId: string): Promise<void> {
    const nodes = await this.byCase<BoardNode>("nodes", caseId);
    const photoIds = nodes.flatMap((n) => n.photoIds);
    const d = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = d.transaction([...STORES], "readwrite");
      t.objectStore("cases").delete(caseId);
      for (const n of nodes) t.objectStore("nodes").delete(n.id);
      for (const p of photoIds) t.objectStore("photos").delete(p);
      const delByCase = (name: StoreName) => {
        const req = t.objectStore(name).index("caseId").getAllKeys(caseId);
        req.onsuccess = () => req.result.forEach((k) => t.objectStore(name).delete(k));
      };
      delByCase("edges");
      delByCase("drawings");
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  /** Apaga fotos que nenhum quadro referencia (sobras de exclusões desfeitas/refeitas). */
  async collectOrphanPhotos(): Promise<number> {
    const nodes = await this.getAll<BoardNode>("nodes");
    const used = new Set(nodes.flatMap((n) => n.photoIds));
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const t = d.transaction("photos", "readwrite");
      const req = t.objectStore("photos").getAllKeys();
      let removed = 0;
      req.onsuccess = () => {
        for (const k of req.result) if (!used.has(String(k))) (t.objectStore("photos").delete(k), removed++);
      };
      t.oncomplete = () => resolve(removed);
      t.onerror = () => reject(t.error);
    });
  },
};

export type { Case, BoardNode, Edge, Drawing, Photo };

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; name: StoreName; value: { id: string } }>();

export function saveDebounced(name: StoreName, value: { id: string }, ms = 300) {
  const key = `${name}:${value.id}`;
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pending.delete(key);
    store.put(name, value);
  }, ms);
  pending.set(key, { timer, name, value });
}

/** Grava tudo que está pendente sem esperar promessas — usado no beforeunload. */
export function flushSaves() {
  if (!db) return;
  const names = [...new Set([...pending.values()].map((p) => p.name))];
  if (!names.length) return;
  const t = db.transaction(names, "readwrite");
  for (const [key, p] of pending) {
    clearTimeout(p.timer);
    pending.delete(key);
    t.objectStore(p.name).put(p.value);
  }
}

export const prefs = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`corkboard:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, v: string) {
    try {
      localStorage.setItem(`corkboard:${key}`, v);
    } catch {}
  },
};
