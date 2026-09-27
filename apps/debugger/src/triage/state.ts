/* The call list's last filters, remembered so a call's "Calls" link goes back to the same list, and
 * its previous/next buttons walk it in the same order. */
import { createStored, type Stored } from "@/lib/stored";
import { parseTriageSearch, type TriageSearch } from "@/lib/triage";

export const lastTriage: Stored<TriageSearch> = createStored<TriageSearch>(
  "debugger:triage",
  {},
  (raw) => {
    try {
      return parseTriageSearch(JSON.parse(raw) as Record<string, unknown>);
    } catch {
      return undefined;
    }
  },
  (v) => JSON.stringify(v),
);
