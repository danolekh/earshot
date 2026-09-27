/* The calls the debugger can open: their summaries for the list, and each trace loaded when its
 * page opens. The demo calls are made by calls/debugger.ts and copied here with
 * `pnpm --filter debugger call`; calls imported in this browser come from IndexedDB; real calls
 * would come from an API as the same JSON. */
import type { CallTrace } from "@danolekh/earshot/trace";
import { useMemo } from "react";

import summaries from "../calls/index.json";
import { getImport, isImported, useImports } from "./imports";
import type { CallSummary } from "./triage";

export const CALL_LIST: readonly CallSummary[] = summaries as unknown as CallSummary[];

const traces = import.meta.glob("../calls/*.trace.json", { import: "default" });

export async function loadTrace(id: string): Promise<CallTrace | undefined> {
  if (isImported(id)) return (await getImport(id))?.trace;
  const load = traces[`../calls/${id}.trace.json`];
  return load ? ((await load()) as CallTrace) : undefined;
}

// One load per call, shared by everything that asks (and by React's `use`, which needs the same
// promise each time).
const loading = new Map<string, Promise<CallTrace | undefined>>();

/** A call's trace, loading it once. */
export function tracePromise(id: string): Promise<CallTrace | undefined> {
  let p = loading.get(id);
  if (!p) loading.set(id, (p = loadTrace(id)));
  return p;
}

/** The demo calls and, once hydrated, the ones imported here (newest first). */
export function useAllCalls(): readonly CallSummary[] {
  const imported = useImports();
  return useMemo(() => (imported.length ? [...imported, ...CALL_LIST] : CALL_LIST), [imported]);
}
