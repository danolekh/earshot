import { createFileRoute } from "@tanstack/react-router";
import type * as React from "react";
import { useCallback } from "react";

import { useAllCalls } from "@/lib/calls";
import { useHydrated } from "@/lib/hydrated";
import { parseTriageSearch, type TriageSearch } from "@/lib/triage";
import { Triage } from "@/triage/triage";

/** Every call, worst first: find the bad one, then open it at the moment. */
export const Route = createFileRoute("/")({
  validateSearch: parseTriageSearch,
  head: () => ({ meta: [{ title: "Calls · Call debugger" }] }),
  component: Calls,
});

const UNFILTERED: TriageSearch = {};

function Calls(): React.ReactElement {
  const search: TriageSearch = Route.useSearch();
  // The prerendered list is unfiltered; the URL's filters apply once that has hydrated.
  const hydrated = useHydrated();
  const navigate = Route.useNavigate();
  const onSearch = useCallback(
    (next: TriageSearch) => void navigate({ search: next, replace: true, resetScroll: false }),
    [navigate],
  );
  // The demo calls, and those imported in this browser once hydrated.
  const calls = useAllCalls();
  return <Triage calls={calls} search={hydrated ? search : UNFILTERED} onSearch={onSearch} />;
}
