/* In a call: back to the call list (with its filters), and to the calls either side of this one in
 * that list, each opening at the finding the filters point to. */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAllCalls } from "@/lib/calls";
import { callLink, firstMatch, orderedCalls, sortCalls, sortOf } from "@/lib/triage";

import { CallLink } from "./call-link";
import { lastTriage } from "./state";

export function CallNav({ id }: { id: string }) {
  const [search] = lastTriage.use();
  const calls = useAllCalls();
  const filtered = orderedCalls(calls, search);
  // Opened from outside the filtered list: walk every call instead.
  const list = filtered.some((c) => c.id === id) ? filtered : sortCalls(calls, sortOf(search));
  const at = list.findIndex((c) => c.id === id);
  const neighbour = (step: number) => {
    const call = list[at + step];
    return call ? callLink(call, firstMatch(call, search)) : undefined;
  };
  const prev = neighbour(-1);
  const next = neighbour(1);
  return (
    <>
      <Link
        to="/"
        search={search}
        className={buttonVariants({ variant: "ghost", size: "sm", className: "gap-1.5" })}
      >
        <ArrowLeft aria-hidden />
        Calls
      </Link>
      <Step label="Previous call" to={prev} icon={<ChevronLeft aria-hidden />} />
      <span
        className="text-muted-foreground font-mono text-xs tabular-nums"
        aria-label={`Call ${at + 1} of ${list.length}`}
      >
        {at + 1}/{list.length}
      </span>
      <Step label="Next call" to={next} icon={<ChevronRight aria-hidden />} />
    </>
  );
}

function Step({
  label,
  to,
  icon,
}: {
  label: string;
  to: ReturnType<typeof callLink> | undefined;
  icon: React.ReactNode;
}) {
  if (!to)
    return (
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled>
        {icon}
      </Button>
    );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <CallLink
            id={to.id}
            search={to.search}
            aria-label={label}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
