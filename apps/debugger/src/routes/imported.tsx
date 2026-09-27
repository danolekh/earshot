import type { CallTrace } from "@danolekh/earshot/trace";
import { createFileRoute, Link } from "@tanstack/react-router";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Debugger } from "@/debugger/debugger";
import { useHydrated } from "@/lib/hydrated";
import { getImport } from "@/lib/imports";
import { type DebugSearch, parseDebugSearch } from "@/lib/search";
import { CallNav } from "@/triage/call-nav";

type ImportedSearch = DebugSearch & { id?: string };

/** A call imported in this browser, by id. The page is prerendered empty, since only this browser
 * has the call; it opens once hydrated, with its recording from the kept file. */
export const Route = createFileRoute("/imported")({
  validateSearch: (raw: Record<string, unknown>): ImportedSearch => ({
    ...parseDebugSearch(raw),
    ...(typeof raw.id === "string" && /^imp-[a-z0-9]{4,24}$/.test(raw.id) && { id: raw.id }),
  }),
  head: () => ({ meta: [{ title: "Imported call · Call debugger" }] }),
  component: ImportedPage,
});

function ImportedPage(): React.ReactElement {
  const hydrated = useHydrated();
  const { id } = Route.useSearch();
  const [call, setCall] = useState<CallTrace | "missing">();
  useEffect(() => {
    if (!hydrated || !id) return;
    let url: string | undefined;
    let live = true;
    void getImport(id).then((entry) => {
      if (!live) return;
      if (!entry) return setCall("missing");
      url = entry.audio && URL.createObjectURL(entry.audio);
      setCall(
        url
          ? {
              ...entry.trace,
              audio: { ...entry.trace.audio, sources: [{ src: url, type: entry.audio!.type }] },
            }
          : entry.trace,
      );
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [hydrated, id]);
  if (call === "missing" || (hydrated && !id))
    return (
      <main className="flex h-svh flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-sm font-medium">This call isn't in this browser</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          Imported calls are kept where they were imported. Import it again from the call list.
        </p>
        <Link to="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Calls
        </Link>
      </main>
    );
  if (!call) return <main aria-busy className="h-svh" />;
  return <ImportedView key={call.call.id} trace={call} />;
}

function ImportedView({ trace }: { trace: CallTrace }): React.ReactElement {
  const search = Route.useSearch();
  const [initial] = useState(search);
  const navigate = Route.useNavigate();
  const onSearch = useCallback(
    (next: DebugSearch) =>
      void navigate({ search: { ...next, id: trace.call.id }, replace: true, resetScroll: false }),
    [navigate, trace.call.id],
  );
  return <Debugger trace={trace} search={initial} onSearch={onSearch} nav={<CallNav id={trace.call.id} />} />;
}
