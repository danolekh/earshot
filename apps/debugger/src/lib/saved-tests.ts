/* Test cases saved from calls, in this browser. The shape (an id, when, the test case) is what an
 * API would store; for the demo, localStorage. */
import type { TestCase } from "@danolekh/earshot/trace";

import { createStored, type Stored } from "./stored";

export interface SavedTest {
  id: string;
  /** ISO 8601. */
  savedAt: string;
  test: TestCase;
}

const isSaved = (v: unknown): v is SavedTest => {
  const s = v as SavedTest;
  return (
    typeof s?.id === "string" &&
    typeof s.savedAt === "string" &&
    s.test?.version === 1 &&
    typeof s.test.name === "string" &&
    Array.isArray(s.test.checks)
  );
};

export const savedTests: Stored<readonly SavedTest[]> = createStored<readonly SavedTest[]>(
  "debugger:tests",
  [],
  (raw) => {
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter(isSaved) : undefined;
    } catch {
      return undefined;
    }
  },
  (v) => JSON.stringify(v),
);

/** A short id from what's saved and when (FNV-1a, base 36). */
function idFor(text: string): string {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** Saves a test case, newest first. */
export function saveTest(test: TestCase, now: Date = new Date()): SavedTest {
  const entry: SavedTest = {
    id: idFor(`${test.name}@${now.toISOString()}`),
    savedAt: now.toISOString(),
    test,
  };
  savedTests.set([entry, ...savedTests.get()]);
  return entry;
}

/** Deletes a saved test; gives back what's needed to undo it. */
export function deleteTest(id: string): { entry: SavedTest; index: number } | undefined {
  const all = savedTests.get();
  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return undefined;
  savedTests.set(all.filter((s) => s.id !== id));
  return { entry: all[index]!, index };
}

/** Puts a deleted test back where it was. */
export function restoreTest({ entry, index }: { entry: SavedTest; index: number }): void {
  const all = [...savedTests.get()];
  if (all.some((s) => s.id === entry.id)) return;
  all.splice(Math.min(index, all.length), 0, entry);
  savedTests.set(all);
}

/** A file name for a test case: its name, in plain ASCII. */
export const fileName = (test: TestCase): string =>
  `${test.name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.test.json`;
