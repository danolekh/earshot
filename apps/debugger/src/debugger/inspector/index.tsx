/* The inspector, in a resizable panel on the right (a sheet on small screens): the findings, the
 * keyboard and screen-reader way to the bad moments; then whatever is picked, told briefly with the
 * rest one click away. Both are accordion sections, remembered open or closed. */
import { usePlayer } from "@danolekh/earshot/player";
import { X } from "lucide-react";
import type * as React from "react";
import { useState, useSyncExternalStore } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import type { Prepared } from "@/lib/prepare";
import { createStored } from "@/lib/stored";

import { type DraftFrom, TestCaseDialog } from "../test-case-dialog";
import { Details, pickedTitle } from "./details";
import { FindingsList } from "./findings-list";

const openSections = createStored<string[]>(
  "debugger:inspector-sections",
  ["findings", "details"],
  (raw) => {
    try {
      const v: unknown = JSON.parse(raw);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
    } catch {
      return undefined;
    }
  },
  (v) => JSON.stringify(v),
);

export interface InspectorProps {
  prepared: Prepared;
}

/** The inspector in its panel. Clipped to nothing while closed but still mounted, so it's inert
 * then: Tab can't reach it. */
export function InspectorPanel(props: InspectorProps) {
  const { open } = useSidebar();
  return (
    <aside
      id="inspector"
      aria-label="Inspector"
      inert={!open}
      data-sidebar="sidebar"
      className="bg-sidebar text-sidebar-foreground flex h-full min-w-0 flex-col border-l"
    >
      <InspectorBody {...props} />
    </aside>
  );
}

/** The inspector on a small screen: shadcn's sidebar, which is a sheet there. */
export function InspectorSheet(props: InspectorProps) {
  return (
    <Sidebar side="right" collapsible="offcanvas" id="inspector" aria-label="Inspector">
      <InspectorBody {...props} />
    </Sidebar>
  );
}

/** A section's heading: its name, and a line on what's in it. */
function SectionTrigger({ title, summary }: { title: string; summary?: React.ReactNode }) {
  return (
    <AccordionTrigger className="hover:bg-sidebar-accent items-center gap-2 px-2 py-2 hover:no-underline">
      <span className="text-sm font-medium">{title}</span>
      {summary && (
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs font-normal">{summary}</span>
      )}
    </AccordionTrigger>
  );
}

function InspectorBody({ prepared }: InspectorProps) {
  const { trace } = prepared;
  const { setOpen } = useSidebar();
  const [sections, setSections] = openSections.use();
  const { selection } = usePlayer("Inspector");
  const picked = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
  const errors = trace.findings.filter((f) => f.severity === "error").length;
  const warnings = trace.findings.filter((f) => f.severity === "warning").length;
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const [draftFrom, setDraftFrom] = useState<DraftFrom | null>(null);
  return (
    <>
      {/* The toolbar's height, so the two bottom borders make one line. */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b pr-2 pl-3">
        <h2 className="text-sm font-medium">Inspector</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Hide the inspector" onClick={() => setOpen(false)}>
          <X aria-hidden />
        </Button>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 pb-4">
        <Accordion multiple value={sections} onValueChange={(v) => setSections(v as string[])}>
          <AccordionItem value="findings">
            <SectionTrigger
              title="Findings"
              summary={
                trace.findings.length
                  ? `${count(errors, "error")} · ${count(warnings, "warning")}`
                  : "None in this call"
              }
            />
            <AccordionContent>
              <FindingsList
                trace={trace}
                onSaveTest={(f) => f.turnId && setDraftFrom({ turnId: f.turnId, findingId: f.id })}
              />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="details">
            <SectionTrigger title="Details" summary={pickedTitle(prepared, picked)} />
            <AccordionContent>
              <Details prepared={prepared} picked={picked} onSaveTest={setDraftFrom} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <TestCaseDialog trace={trace} from={draftFrom} onClose={() => setDraftFrom(null)} />
    </>
  );
}
