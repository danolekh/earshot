/* Settings remembered in this browser (localStorage), shared by every component that reads them
 * and in step across tabs. The server and the first client render see the fallback, so
 * prerendered HTML and hydration agree; a stored value applies right after (and, for the theme, the
 * inspector and the panel sizes, before the first paint: see first-paint.ts). */
import { useCallback, useSyncExternalStore } from "react";

export interface Stored<T> {
  /** The current value and a setter, like `useState`. */
  use(): [T, (next: T) => void];
  get(): T;
  set(next: T): void;
  /** Called on every change, here or in another tab. */
  subscribe(listener: () => void): () => void;
}

/** A stored value, read back with `read` (undefined for anything it doesn't recognise, which then
 * counts as the fallback). Reads are cached by the raw string, so an object value stays the same
 * object until it changes. */
export function createStored<T>(
  key: string,
  fallback: T,
  read: (raw: string) => T | undefined,
  write: (value: T) => string,
): Stored<T> {
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T } = { raw: null, value: fallback };
  const get = (): T => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {}
    if (raw !== cache.raw) cache = { raw, value: (raw === null ? undefined : read(raw)) ?? fallback };
    return cache.value;
  };
  const set = (next: T): void => {
    try {
      localStorage.setItem(key, write(next));
    } catch {}
    listeners.forEach((l) => l());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === key && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };
  return {
    get,
    set,
    subscribe,
    use() {
      const value = useSyncExternalStore(subscribe, get, () => fallback);
      return [value, useCallback((next: T) => set(next), [])];
    },
  };
}

export type StoredFlag = Stored<boolean>;

export function createStoredFlag(key: string, fallback: boolean): StoredFlag {
  return createStored(
    key,
    fallback,
    (raw) => (raw === "on" ? true : raw === "off" ? false : undefined),
    (v) => (v ? "on" : "off"),
  );
}

export const KEYS = {
  singleKeys: "debugger:single-keys",
  inspector: "debugger:inspector",
  theme: "debugger:theme",
  layout: "debugger:layout",
} as const;

/** Single-key shortcuts (on unless turned off; WCAG 2.1.4). */
export const singleKeys: StoredFlag = createStoredFlag(KEYS.singleKeys, true);
/** The inspector sidebar (open unless closed). */
export const inspectorOpen: StoredFlag = createStoredFlag(KEYS.inspector, true);

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
/** Light, dark, or whatever the OS says (the default). */
export const theme: Stored<Theme> = createStored<Theme>(
  KEYS.theme,
  "system",
  (raw) => THEMES.find((t) => t === raw),
  (v) => v,
);

/** Puts a theme on the page now (the first-paint script does it before the first paint and when
 * the OS or another tab changes). */
export function applyTheme(t: Theme): void {
  const dark = t === "dark" || (t === "system" && !matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
