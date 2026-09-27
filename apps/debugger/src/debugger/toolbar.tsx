/* The slim bar over the timeline: playback on the left (play, where you are, speed, show the whole
 * call, follow), and on the right what the screen shows: the View menu, the keyboard sheet and the
 * inspector's toggle. A group of buttons rather than an ARIA toolbar: the arrow keys already move
 * through the call. */
import { Player } from "@danolekh/earshot/player";
import type { Viewport } from "@danolekh/earshot/timeline";
import { Keyboard, LocateFixed, Maximize2, PanelRight, Pause, Play } from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import type { LaneDef } from "./lanes";
import { ViewMenu } from "./view-menu";

/** A button's tooltip: what it does, and its keys. */
function Tip({ label, keys, children }: { label: string; keys?: string[]; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="flex items-center gap-2">
        {label}
        {keys && (
          <KbdGroup>
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function Toolbar({
  nav,
  viewport,
  follow,
  onFollow,
  viewMenu,
  onViewMenu,
  onHelp,
  lanes,
  source,
}: {
  nav?: React.ReactNode;
  /** The lanes this call has, for the View menu. */
  lanes: readonly LaneDef[];
  /** Where the call came from (its stack). */
  source?: React.ReactNode;
  viewport: Viewport;
  follow: boolean;
  onFollow: (follow: boolean) => void;
  viewMenu: boolean;
  onViewMenu: (open: boolean) => void;
  onHelp: () => void;
}) {
  const { open, toggleSidebar } = useSidebar();
  return (
    <fieldset
      aria-label="Playback"
      className="bg-card flex h-10 min-w-0 shrink-0 items-center gap-1 border-b px-2"
    >
      {nav && (
        <>
          {nav}
          <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
        </>
      )}
      <Tip label="Play or pause" keys={["Space"]}>
        <Player.Toggle render={<Button variant="ghost" size="icon-sm" />}>
          <Play className="group-data-[playing]/button:hidden" aria-hidden />
          <Pause className="hidden group-data-[playing]/button:block" aria-hidden />
        </Player.Toggle>
      </Tip>
      <span className="text-muted-foreground px-1 font-mono text-xs tabular-nums">
        <Player.Time className="text-foreground" /> / <Player.Time show="duration" />
      </span>
      <Tip label="Playback speed" keys={[",", "."]}>
        <Player.Rate
          render={<Button variant="ghost" size="sm" className="font-mono tabular-nums" />}
          aria-label="Playback speed"
        />
      </Tip>
      {/* Centred: shadcn's vertical separator stretches, which with a fixed height pins it to the top. */}
      <Separator orientation="vertical" className="mx-1 h-5 data-vertical:self-center" />
      <Tip label="Show the whole call" keys={["0"]}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Show the whole call"
          onClick={() => viewport.fit()}
        >
          <Maximize2 aria-hidden />
        </Button>
      </Tip>
      <Tip label="Follow playback" keys={["F"]}>
        <Toggle
          size="sm"
          className="aria-pressed:text-primary w-7 px-0"
          aria-label="Follow playback"
          pressed={follow}
          onPressedChange={onFollow}
        >
          <LocateFixed aria-hidden />
        </Toggle>
      </Tip>
      <div className="ml-auto flex items-center gap-1">
        {source}
        <ViewMenu open={viewMenu} onOpenChange={onViewMenu} lanes={lanes} />
        <Tip label="Keyboard shortcuts" keys={["?"]}>
          <Button variant="ghost" size="icon-sm" aria-label="Keyboard shortcuts" onClick={onHelp}>
            <Keyboard aria-hidden />
          </Button>
        </Tip>
        <Tip label={open ? "Hide the inspector" : "Show the inspector"} keys={["B"]}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Inspector"
            aria-expanded={open}
            aria-controls={open ? "inspector" : undefined}
            onClick={toggleSidebar}
          >
            <PanelRight aria-hidden />
          </Button>
        </Tip>
      </div>
    </fieldset>
  );
}
