/* The call debugger: one call on one clock. A slim toolbar; the call laid out in lanes (both
 * sides' audio, what the agent heard and what was said, the turn detector's decisions, the agent's
 * words, the pipeline's spans), filling most of the screen; the transcript under it; and the
 * inspector on the right for whatever is picked, each in a resizable panel (shell.tsx). Everything
 * shares the player's clock and selection, and the URL keeps the moment. */
import { createSelection, Player, usePlayer } from "@danolekh/earshot/player";
import { applyKeyAction, createViewport, viewAround } from "@danolekh/earshot/timeline";
import type { CallTrace } from "@danolekh/earshot/trace";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type DebuggerAction, debuggerKey } from "@/lib/keys";
import { layout } from "@/lib/layout";
import { type Prepared, prepare } from "@/lib/prepare";
import type { DebugSearch } from "@/lib/search";
import { createStageClock, filming, markStageReady } from "@/lib/stage";
import { inspectorOpen, singleKeys } from "@/lib/stored";
import { useUrlSync } from "@/lib/url-sync";
import { LANE_SETS, setLanes, shownState, toggleSet, viewSettings, visibleLanes } from "@/lib/view";

import { HiddenNotice } from "./hidden-notice";
import { InspectorPanel, InspectorSheet } from "./inspector";
import { LANES, type LaneId, Lanes, laneName } from "./lanes";
import { Shell } from "./shell";
import { Shortcuts } from "./shortcuts";
import { StackBadge } from "./stack-badge";
import { Toolbar } from "./toolbar";
import { CallTranscript } from "./transcript";

export interface DebuggerProps {
  trace: CallTrace;
  search: DebugSearch;
  onSearch: (search: DebugSearch) => void;
  /** At the toolbar's start: the way back to the call list, and to the calls either side. */
  nav?: React.ReactNode;
}

// Only a stage build (`--mode stage`) is filmed. Written out here rather than imported so that in
// every other build it folds to false and the stage code is dropped.
const STAGE = import.meta.env.VITE_STAGE === "1";

export const Debugger = memo(function Debugger({ trace, search, onSearch, nav }: DebuggerProps) {
  const prepared = useMemo(() => prepare(trace), [trace]);
  const [selection] = useState(() => createSelection());
  // Whose voice each channel carries, for mute and solo; a mono recording has no side to route.
  const channels = useMemo(
    () =>
      trace.clock.channels.includes("mixed")
        ? undefined
        : trace.clock.channels.map((c) => (c === "caller" ? ("user" as const) : ("agent" as const))),
    [trace.clock.channels],
  );
  // Filmed by apps/promo: the recorder's frames drive the clock, and no <audio> is rendered.
  const [stage] = useState(() =>
    STAGE && filming() ? createStageClock(trace.call.id, trace.call.duration) : undefined,
  );
  useEffect(() => {
    if (STAGE && stage) markStageReady();
  }, [stage]);
  return (
    <Player.Root
      conversation={prepared.conversation}
      {...(!STAGE && { src: trace.audio?.sources ?? [] })}
      {...(stage && { clock: stage })}
      selection={selection}
      {...(channels && { channels })}
      className="h-svh"
    >
      <TooltipProvider delay={300}>
        <Body prepared={prepared} search={search} onSearch={onSearch} nav={nav} />
      </TooltipProvider>
    </Player.Root>
  );
});

function Body({
  prepared,
  search,
  onSearch,
  nav,
}: {
  prepared: Prepared;
  search: DebugSearch;
  onSearch: DebuggerProps["onSearch"];
  nav: React.ReactNode;
}) {
  const { trace, conversation } = prepared;
  const { clock, selection } = usePlayer("Debugger");
  const [viewport] = useState(() => createViewport(trace.call.duration, { minSpan: 0.4 }));
  const [follow, setFollow] = useState(true);
  const [help, setHelp] = useState(false);
  const [viewMenu, setViewMenu] = useState(false);
  // What a key just did to the lanes, for screen readers (the menu's own items say it themselves).
  const [announcement, setAnnouncement] = useState("");
  const [single] = singleKeys.use();
  const [open, setOpenStored] = inspectorOpen.use();
  const [view, setView] = viewSettings.use();
  // The lanes this call has anything for, and of those the ones shown.
  const available = useMemo(() => LANES.filter((l) => l.available?.(prepared) ?? true), [prepared]);
  const lanes = useMemo(() => visibleLanes(available, view), [available, view]);
  // The sidebar's own controls, for B: a sheet on small screens opens through them.
  const sidebar = useRef<ReturnType<typeof useSidebar>>(null);
  const main = useRef<HTMLElement>(null);
  useUrlSync({
    search,
    clock,
    viewport,
    selection,
    findings: trace.findings,
    view: viewSettings,
    navigate: onSearch,
  });

  // Closing the inspector with focus inside it would drop focus on <body>, where no key works.
  const setOpen = (next: boolean) => {
    if (!next && document.activeElement?.closest("#inspector")) main.current?.focus();
    setOpenStored(next);
  };

  // Hidden from its gutter label: a strip stays where it was, and Undo is right there for a moment.
  const hideLane = (id: LaneId) => {
    setView(setLanes(viewSettings.get(), [id], false));
    const lane = LANES.find((l) => l.id === id);
    toast(`${lane ? laneName(lane) : id} hidden`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => setView(setLanes(viewSettings.get(), [id], true)) },
    });
  };

  const act = (action: DebuggerAction) => {
    if (!action) return false;
    switch (action.type) {
      case "seek":
      case "toggle":
      case "rate":
      case "zoom":
      case "pan":
      case "fit": {
        // A hop to a finding picks it too.
        if (action.type === "seek" && action.mark) {
          const f = trace.findings.find((x) => x.id === action.mark);
          if (f) selection.set({ findingId: f.id, ...(f.turnId && { turnId: f.turnId }) });
        }
        applyKeyAction(action, { clock, viewport, duration: trace.call.duration });
        break;
      }
      case "zoom-selection": {
        const s = selection.get();
        const f = s.findingId ? trace.findings.find((x) => x.id === s.findingId) : undefined;
        const span = s.spanId ? trace.spans.find((x) => x.id === s.spanId) : undefined;
        const turn = s.turnId ? prepared.turnById.get(s.turnId) : undefined;
        const target = f ?? span ?? turn;
        if (target) viewport.set(viewAround(target));
        break;
      }
      case "clear":
        selection.set({});
        break;
      case "follow":
        setFollow((f) => !f);
        break;
      case "help":
        setHelp(true);
        break;
      case "sidebar":
        sidebar.current?.toggleSidebar();
        break;
      case "view":
        setViewMenu(true);
        break;
      case "transcript": {
        const now = layout.get();
        layout.set({ ...now, transcriptOpen: !now.transcriptOpen });
        break;
      }
      case "lanes": {
        const set = LANE_SETS[action.set];
        if (!set) break;
        const now = viewSettings.get();
        const next = toggleSet(now, set.ids, available);
        if (next === now) setAnnouncement(`${set.label} are the only lanes shown`);
        else {
          viewSettings.set(next);
          setAnnouncement(`${set.label} ${shownState(next, set.ids) === true ? "shown" : "hidden"}`);
        }
        break;
      }
    }
    return true;
  };

  // One keyboard for the whole debugger (timeline, transcript and inspector). A key something inside
  // already took (the scrubber, the finding list, a menu) stays taken, and keys from portals (menus,
  // dialogs, the sheet) aren't the debugger's.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return;
    const target = e.target as HTMLElement;
    // Typing and buttons keep their own keys.
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    if ((e.key === " " || e.key === "Enter") && target.closest("button, a, summary")) return;
    // A focused panel separator takes the arrows, Home/End and Enter to resize and collapse.
    if (target.closest("[role=separator]") && /^(Arrow|Home|End|Page|Enter)/.test(e.key)) return;
    const action = debuggerKey(e, {
      conversation,
      time: clock.time(),
      view: viewport.get(),
      findings: trace.findings,
      singleKeys: single,
    });
    if (act(action)) e.preventDefault();
  };

  return (
    <SidebarProvider
      onKeyDown={onKeyDown}
      open={open}
      onOpenChange={setOpen}
      style={{ "--sidebar-width": "26rem" } as React.CSSProperties}
      className="h-svh min-h-0 overflow-hidden"
    >
      <Shell
        mainRef={main}
        header={
          <>
            <h1 className="sr-only">{trace.call.title ?? trace.call.id}</h1>
            <div aria-live="polite" className="sr-only">
              {announcement}
            </div>
            <Toolbar
              nav={nav}
              viewport={viewport}
              follow={follow}
              onFollow={setFollow}
              viewMenu={viewMenu}
              onViewMenu={setViewMenu}
              onHelp={() => setHelp(true)}
              lanes={available}
              source={<StackBadge trace={trace} />}
            />
          </>
        }
        timeline={
          <section aria-label="Timeline" className="relative h-full py-2 pr-3">
            <Lanes
              prepared={prepared}
              viewport={viewport}
              follow={follow}
              lanes={lanes}
              all={available}
              density={view.density}
              onKeyAction={act}
              onShowAll={() => setView({ ...view, hidden: [] })}
              hidden={view.hidden}
              onShow={(ids) => setView(setLanes(viewSettings.get(), ids, true))}
              onHide={hideLane}
            />
            <HiddenNotice trace={trace} view={view} onShow={(id) => setView(setLanes(view, [id], true))} />
          </section>
        }
        transcript={
          <section aria-label="Transcript" className="h-full">
            <CallTranscript prepared={prepared} />
          </section>
        }
        inspector={<InspectorPanel prepared={prepared} />}
        sheet={<InspectorSheet prepared={prepared} />}
      />
      <SidebarHandle
        onControls={(controls) => {
          sidebar.current = controls;
        }}
      />
      <Shortcuts open={help} onOpenChange={setHelp} follow={follow} />
    </SidebarProvider>
  );
}

/** Hands the sidebar's controls (which only exist inside its provider) to the keyboard handler. */
function SidebarHandle({ onControls }: { onControls: (controls: ReturnType<typeof useSidebar>) => void }) {
  const controls = useSidebar();
  useLayoutEffect(() => onControls(controls));
  return null;
}
