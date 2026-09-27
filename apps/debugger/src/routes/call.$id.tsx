import type { CallTrace } from "@danolekh/earshot/trace";
import { createFileRoute, notFound } from "@tanstack/react-router";
import type * as React from "react";
import { useCallback, useState } from "react";

import { Debugger } from "@/debugger/debugger";
import { loadTrace } from "@/lib/calls";
import { type DebugSearch, parseDebugSearch } from "@/lib/search";
import { CallNav } from "@/triage/call-nav";

/** One call in the debugger, opened at the moment the link names. */
export const Route = createFileRoute("/call/$id")({
  validateSearch: parseDebugSearch,
  loader: async ({ params }) => {
    const trace = await loadTrace(params.id);
    if (!trace) throw notFound();
    return trace;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.call.title ?? "Call"} · Call debugger` },
      { property: "og:title", content: `${loaderData?.call.title ?? "Call"} · Call debugger` },
      ...(loaderData
        ? [{ property: "og:url", content: `https://debugger.danolekh.com/call/${loaderData.call.id}/` }]
        : []),
    ],
  }),
  component: CallPage,
});

function CallPage(): React.ReactElement {
  const trace = Route.useLoaderData();
  // A new call is a new debugger: its clock, selection and URL start afresh.
  return <CallView key={trace.call.id} trace={trace} />;
}

function CallView({ trace }: { trace: CallTrace }): React.ReactElement {
  // The URL is read once; after that the debugger writes it, and doesn't re-render for its own
  // writes.
  const search: DebugSearch = Route.useSearch();
  const [initial] = useState(search);
  const navigate = Route.useNavigate();
  const onSearch = useCallback(
    (next: DebugSearch) => void navigate({ search: next, replace: true, resetScroll: false }),
    [navigate],
  );
  return <Debugger trace={trace} search={initial} onSearch={onSearch} nav={<CallNav id={trace.call.id} />} />;
}
