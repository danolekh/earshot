/* Which stack recorded the call, and what that stack doesn't keep: the findings no detector can
 * look for here, each with why. A check on one of them can't be made on this call. */
import { blindSpots, type CallTrace, findingLabel, type FindingType } from "@danolekh/earshot/trace";
import { Info } from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { STACK_KEEPS, stackName } from "@/lib/stacks";

export function StackBadge({ trace }: { trace: CallTrace }) {
  const provider = trace.call.provider;
  const spots = useMemo(() => Object.entries(blindSpots(trace)) as [FindingType, string][], [trace]);
  if (!provider) return null;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 font-normal"
            aria-label={`Recorded on ${stackName(provider)}${spots.length ? `, ${spots.length} kinds of finding can't be checked` : ""}`}
          />
        }
      >
        {stackName(provider)}
        {spots.length > 0 && (
          <span className="bg-muted rounded px-1 text-[10px] tabular-nums">{spots.length} can't check</span>
        )}
        <Info aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverTitle className="text-sm font-medium">Recorded on {stackName(provider)}</PopoverTitle>
        <PopoverDescription className="text-muted-foreground text-xs">
          {STACK_KEEPS[provider] ?? "What this stack keeps of a call."}
        </PopoverDescription>
        {spots.length > 0 ? (
          <section aria-label="Can't check" className="space-y-1">
            <h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
              Can't check on this call
            </h3>
            <ul className="m-0 list-none space-y-1 p-0 text-xs">
              {spots.map(([type, why]) => (
                <li key={type}>
                  <span className="text-foreground">{findingLabel(type)}</span>
                  <span className="text-muted-foreground">: {why}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="text-xs">Every detector can look at this call.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
