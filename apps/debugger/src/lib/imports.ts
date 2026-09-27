/* Calls imported in this browser, kept in IndexedDB (a recording can run to tens of megabytes, far
 * past localStorage): each with its trace, its line in the list, and its audio file. Imported ids
 * start with `imp-`, so a link knows which page opens them. */
import type { CallSummary } from "@danolekh/earshot/review";
import type { CallTrace } from "@danolekh/earshot/trace";
import { useSyncExternalStore } from "react";

export interface ImportedCall {
  id: string;
  /** ISO 8601. */
  importedAt: string;
  trace: CallTrace;
  summary: CallSummary;
  /** The recording as it was dropped. */
  audio?: Blob;
  /** What had to be assumed when it was read. */
  warnings: readonly string[];
}

export const IMPORT_PREFIX = "imp-";
export const isImported = (id: string): boolean => id.startsWith(IMPORT_PREFIX);
export const newImportId = (): string =>
  `${IMPORT_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const DB = "earshot-debugger";
const STORE = "imports";

let opening: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB didn't open"));
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const store = (await db()).transaction(STORE, mode).objectStore(STORE);
  return new Promise((resolve, reject) => {
    const req = work(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
  });
}

// The list's lines, kept here so every view of the list agrees, and told when they change.
let summaries: readonly CallSummary[] = [];
const listeners = new Set<() => void>();
let loaded = false;

async function refresh(): Promise<void> {
  const all = await run<ImportedCall[]>("readonly", (s) => s.getAll() as IDBRequest<ImportedCall[]>);
  summaries = all.sort((a, b) => b.importedAt.localeCompare(a.importedAt)).map((c) => c.summary);
  for (const l of listeners) l();
}

export async function putImport(call: ImportedCall): Promise<void> {
  await run("readwrite", (s) => s.put(call));
  await refresh();
}

export const getImport = (id: string): Promise<ImportedCall | undefined> =>
  run<ImportedCall | undefined>("readonly", (s) => s.get(id) as IDBRequest<ImportedCall | undefined>);

/** Removes an imported call; gives it back, so it can be put back. */
export async function deleteImport(id: string): Promise<ImportedCall | undefined> {
  const call = await getImport(id);
  if (call) {
    await run("readwrite", (s) => s.delete(id));
    await refresh();
  }
  return call;
}

const EMPTY: readonly CallSummary[] = [];
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void refresh().catch(() => {
      // No IndexedDB (a private window, blocked site data): nothing was imported here.
    });
  }
  return () => listeners.delete(listener);
}

/** The imported calls' lines in the list, newest first; none before hydration. */
export function useImports(): readonly CallSummary[] {
  return useSyncExternalStore(
    subscribe,
    () => summaries,
    () => EMPTY,
  );
}
