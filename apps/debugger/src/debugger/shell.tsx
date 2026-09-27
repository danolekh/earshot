/* The screen's panels, split with motion-panels: the call (toolbar, timeline, transcript) and the
 * inspector beside it; the timeline over the transcript. Both separators drag, and take arrows,
 * Home/End and Enter (collapse) when focused.
 *
 * The sizes are remembered (lib/layout.ts). motion-panels measures itself only once it's in the
 * page, so the first paint is laid out by CSS from what the head script read (first-paint.ts, and
 * `:root:not([data-hydrated])` in app.css). Hydration renders the defaults, and motion-panels
 * animates any change of size, so once the stored sizes have reached React the two sized panels
 * are mounted afresh (keyed on it), starting at those sizes; then `data-hydrated` goes on <html>
 * and motion-panels takes over. Both happen before the browser paints, so nothing slides into
 * place.
 *
 * Only this component re-renders while a separator is dragged: what goes in the panels comes in as
 * elements its parent made. */
import type * as React from "react";
import { useLayoutEffect, useSyncExternalStore } from "react";

import { Panel, PanelGroup, PanelSeparator } from "@/components/ui/motion-panels";
import { useSidebar } from "@/components/ui/sidebar";
import { layout, LIMITS } from "@/lib/layout";
import { inspectorOpen } from "@/lib/stored";

const INSTANT = { duration: 0 };

/** Whether the stored layout has reached React after hydration: an external store, so setting it
 * from a layout effect is a plain subscription update. */
const hydrated = (() => {
  let value = false;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set() {
      value = true;
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
})();

export function Shell({
  mainRef,
  header,
  timeline,
  transcript,
  inspector,
  sheet,
}: {
  mainRef: React.Ref<HTMLElement>;
  /** Above the panels: the toolbar, and what's only for screen readers. */
  header: React.ReactNode;
  timeline: React.ReactNode;
  transcript: React.ReactNode;
  /** The inspector in its panel, and in a sheet on small screens. */
  inspector: React.ReactNode;
  sheet: React.ReactNode;
}) {
  const [current, setLayout] = layout.use();
  const { open, setOpen, isMobile } = useSidebar();
  const ready = useSyncExternalStore(hydrated.subscribe, hydrated.get, () => false);
  useLayoutEffect(() => {
    // During hydration both read their server fallback; the stored values follow in a re-render.
    if (!ready && current === layout.get() && open === inspectorOpen.get()) hydrated.set();
    // The panels have just mounted afresh at the stored sizes: hand over from the first-paint CSS.
    else if (ready) document.documentElement.dataset.hydrated = "";
  }, [ready, current, open]);
  // Folds (open/close) before then don't animate either.
  const transition = ready ? undefined : INSTANT;
  const phase = ready ? "live" : "first-paint";
  const update = (patch: Partial<typeof current>) => setLayout({ ...layout.get(), ...patch });

  return (
    <>
      <PanelGroup orientation="horizontal">
        <Panel className="flex min-w-0 flex-col">
          <main
            ref={mainRef}
            tabIndex={-1}
            aria-label="Call debugger"
            className="bg-background flex h-full min-h-0 min-w-0 flex-col outline-none"
          >
            {header}
            <div className="min-h-0 flex-1">
              <PanelGroup orientation="vertical">
                <Panel data-layout-panel="timeline" className="bg-card min-h-0 overflow-y-auto">
                  {timeline}
                </Panel>
                <PanelSeparator aria-label="Resize the transcript" withHandle />
                <Panel
                  key={phase}
                  data-layout-panel="transcript"
                  className="min-h-0"
                  size={current.transcript}
                  minSize={LIMITS.transcript.min}
                  maxSize={`${LIMITS.transcript.maxShare}%`}
                  collapsed={!current.transcriptOpen}
                  onCollapsedChange={(collapsed) => update({ transcriptOpen: !collapsed })}
                  onSizeChange={(transcriptSize) => update({ transcript: transcriptSize })}
                  {...(transition && { transition })}
                >
                  <div className="h-full" inert={!current.transcriptOpen}>
                    {transcript}
                  </div>
                </Panel>
              </PanelGroup>
            </div>
          </main>
        </Panel>
        {!isMobile && (
          <>
            <PanelSeparator aria-label="Resize the inspector" />
            <Panel
              key={phase}
              data-layout-panel="inspector"
              className="min-w-0"
              size={current.inspector}
              minSize={LIMITS.inspector.min}
              maxSize="45%"
              collapsed={!open}
              onCollapsedChange={(collapsed) => setOpen(!collapsed)}
              onSizeChange={(inspectorWidth) => update({ inspector: inspectorWidth })}
              {...(transition && { transition })}
            >
              {inspector}
            </Panel>
          </>
        )}
      </PanelGroup>
      {isMobile && sheet}
    </>
  );
}
