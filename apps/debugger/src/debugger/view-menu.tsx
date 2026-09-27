/* The toolbar's View menu: which lanes the timeline shows, which panels are open, how tall the
 * lanes are, and the theme.
 *
 * The lane sets sit at the top (a side of the call, the pipeline, every word lane), each also on a
 * number key; each lane and the layouts are submenus under them. Then the panels, density and theme
 * (submenus that say their current value), and Reset. Every item has an icon. Items are
 * menuitemcheckbox (a partly shown set is "mixed") or menuitemradio, and ticking doesn't close the
 * menu. Nothing can hide the last visible lane. V opens it. */
import {
  Bot,
  Captions,
  LayoutTemplate,
  ListChecks,
  type LucideIcon,
  Monitor,
  Moon,
  PanelBottom,
  PanelRight,
  RotateCcw,
  Rows2,
  Rows3,
  Rows4,
  SlidersHorizontal,
  Sun,
  SunMoon,
  UserRound,
  Workflow,
} from "lucide-react";
import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFAULT_LAYOUT, layout as storedLayout } from "@/lib/layout";
import { applyTheme, type Theme, theme as storedTheme } from "@/lib/stored";
import {
  DEFAULT_VIEW,
  type Density,
  LANE_SETS,
  LAYOUTS,
  onlyLanes,
  setLanes,
  shownState,
  toggleSet,
  viewSettings,
  wouldHideAll,
} from "@/lib/view";

import { LANES, type LaneDef, laneName } from "./lanes";

/** Icons for the sets, in LANE_SETS order. */
const SET_ICONS: readonly LucideIcon[] = [UserRound, Bot, Workflow, Captions];

const GROUPS: readonly { group: LaneDef["group"]; label: string }[] = [
  { group: "call", label: "Call" },
  { group: "caller", label: "Caller" },
  { group: "agent", label: "Agent" },
  { group: "pipeline", label: "Pipeline" },
];

const DENSITIES: readonly { value: Density; label: string; icon: LucideIcon }[] = [
  { value: "compact", label: "Compact", icon: Rows4 },
  { value: "comfortable", label: "Comfortable", icon: Rows3 },
  { value: "expanded", label: "Expanded", icon: Rows2 },
];

const THEMES: readonly { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const icon = "text-muted-foreground";

/** A group's heading: small caps, with its icon. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenuLabel className="text-muted-foreground/80 flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </DropdownMenuLabel>
  );
}

/** A submenu's trigger: icon, name, and what it's set to now. */
function SubTrigger({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: string }) {
  return (
    <DropdownMenuSubTrigger>
      <Icon className={icon} aria-hidden />
      {label}
      {value && <span className="text-muted-foreground ml-auto pl-3 text-xs">{value}</span>}
    </DropdownMenuSubTrigger>
  );
}

export function ViewMenu({
  open,
  onOpenChange,
  lanes = LANES,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lanes this call has. */
  lanes?: readonly LaneDef[];
}) {
  const [view, setView] = viewSettings.use();
  const [theme, setTheme] = storedTheme.use();
  const [layout, setLayout] = storedLayout.use();
  const sidebar = useSidebar();
  const hiddenCount = view.hidden.length;
  const density = DENSITIES.find((d) => d.value === view.density) ?? DENSITIES[1]!;
  const currentTheme = THEMES.find((t) => t.value === theme) ?? THEMES[0]!;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={hiddenCount ? `View: ${hiddenCount} hidden` : "View"}
                  className="gap-1.5"
                />
              }
            />
          }
        >
          <SlidersHorizontal aria-hidden />
          View
          {hiddenCount > 0 && (
            <span className="bg-warning/15 text-warning rounded px-1 font-mono text-[10px] tabular-nums">
              {hiddenCount} hidden
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent className="flex items-center gap-2">
          Lanes, panels, density and theme <kbd className="font-mono">V</kbd>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <Heading>Lanes</Heading>
          {LANE_SETS.map((set, i) => {
            const state = shownState(view, set.ids);
            const Icon = SET_ICONS[i] ?? ListChecks;
            return (
              <DropdownMenuCheckboxItem
                key={set.label}
                checked={state === true}
                disabled={state === true && wouldHideAll(view, set.ids, lanes)}
                onCheckedChange={() => setView(toggleSet(view, set.ids, lanes))}
                {...(state === "mixed" && { "aria-checked": "mixed" as const })}
              >
                <Icon className={icon} aria-hidden />
                {set.label}
                {state === "mixed" && <span className="text-muted-foreground text-xs">(some)</span>}
                <DropdownMenuShortcut>{i + 1}</DropdownMenuShortcut>
              </DropdownMenuCheckboxItem>
            );
          })}
          <DropdownMenuSub>
            <SubTrigger icon={ListChecks} label="Each lane" />
            <DropdownMenuSubContent className="w-56">
              {GROUPS.map(({ group, label }) => (
                <DropdownMenuGroup key={group}>
                  <Heading>{label}</Heading>
                  {lanes
                    .filter((l) => l.group === group)
                    .map((lane) => {
                      const shown = !view.hidden.includes(lane.id);
                      const Icon = lane.icon;
                      return (
                        <DropdownMenuCheckboxItem
                          key={lane.id}
                          checked={shown}
                          disabled={shown && wouldHideAll(view, [lane.id], lanes)}
                          onCheckedChange={(show) => setView(setLanes(view, [lane.id], show))}
                        >
                          <Icon className={icon} aria-hidden />
                          {laneName(lane)}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <SubTrigger icon={LayoutTemplate} label="Layout" />
            <DropdownMenuSubContent className="w-48">
              {LAYOUTS.map((l, i) => {
                const Icon = SET_ICONS[i] ?? ListChecks;
                return (
                  <DropdownMenuItem key={l.label} onClick={() => setView(onlyLanes(view, l.shown))}>
                    <Icon className={icon} aria-hidden />
                    {l.label}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuItem disabled={!hiddenCount} onClick={() => setView({ ...view, hidden: [] })}>
                <Rows3 className={icon} aria-hidden />
                Every lane
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Heading>Panels</Heading>
          <DropdownMenuCheckboxItem
            checked={layout.transcriptOpen}
            onCheckedChange={(transcriptOpen) => setLayout({ ...layout, transcriptOpen })}
          >
            <PanelBottom className={icon} aria-hidden />
            Transcript
            <DropdownMenuShortcut>T</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={sidebar.isMobile ? sidebar.openMobile : sidebar.open}
            onCheckedChange={(next) => (sidebar.isMobile ? sidebar.setOpenMobile : sidebar.setOpen)(next)}
          >
            <PanelRight className={icon} aria-hidden />
            Inspector
            <DropdownMenuShortcut>B</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <SubTrigger icon={density.icon} label="Density" value={density.label} />
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuRadioGroup
                value={view.density}
                onValueChange={(next: Density) => setView({ ...view, density: next })}
              >
                {DENSITIES.map((d) => (
                  <DropdownMenuRadioItem key={d.value} value={d.value}>
                    <d.icon className={icon} aria-hidden />
                    {d.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <SubTrigger icon={SunMoon} label="Theme" value={currentTheme.label} />
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(next: Theme) => {
                  setTheme(next);
                  applyTheme(next);
                }}
              >
                {THEMES.map((t) => (
                  <DropdownMenuRadioItem key={t.value} value={t.value}>
                    <t.icon className={icon} aria-hidden />
                    {t.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            setView(DEFAULT_VIEW);
            setLayout(DEFAULT_LAYOUT);
          }}
        >
          <RotateCcw className={icon} aria-hidden />
          Reset view
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
