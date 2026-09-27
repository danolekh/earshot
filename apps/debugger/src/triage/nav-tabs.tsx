/* The two lists, as tabs in the header: the calls, and the tests saved from them. Calls goes back to
 * the list as it was left (its filters); the tests count shows once hydrated, since they're kept in
 * this browser and the prerendered page can't know them. */
import { Link } from "@tanstack/react-router";

import { useAllCalls } from "@/lib/calls";
import { useHydrated } from "@/lib/hydrated";
import { savedTests } from "@/lib/saved-tests";

import { lastTriage } from "./state";

const TAB =
  "text-muted-foreground hover:text-foreground aria-[current=page]:text-foreground aria-[current=page]:border-foreground flex h-full items-center gap-1.5 border-b-2 border-transparent px-0.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function NavTabs() {
  const hydrated = useHydrated();
  const [search] = lastTriage.use();
  const [tests] = savedTests.use();
  const calls = useAllCalls();
  return (
    <nav aria-label="Lists" className="-mb-px flex h-10 items-stretch gap-4 self-end">
      <Link to="/" search={search} activeOptions={{ exact: true, includeSearch: false }} className={TAB}>
        Calls
        <Count n={calls.length} />
      </Link>
      <Link to="/tests/" className={TAB}>
        Tests
        <Count n={hydrated ? tests.length : undefined} />
      </Link>
    </nav>
  );
}

function Count({ n }: { n: number | undefined }) {
  return (
    <span className="bg-muted text-muted-foreground min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] leading-4 tabular-nums">
      {n ?? " "}
    </span>
  );
}
