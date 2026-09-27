/* A finding's mark: the icon for its kind of problem, red for an error, amber for a warning. The
 * name beside it carries the meaning; the icon is for scanning. */
import type { FindingType, Severity } from "@danolekh/earshot/trace";
import { type FindingCategory, FINDING_META } from "@danolekh/earshot/trace";
import {
  ArrowLeftRight,
  Ear,
  Flag,
  type LucideIcon,
  MessageSquareWarning,
  Timer,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";

const ICONS: Readonly<Record<FindingCategory, LucideIcon>> = {
  timing: Timer,
  "turn-taking": ArrowLeftRight,
  recognition: Ear,
  tools: Wrench,
  speech: MessageSquareWarning,
  feedback: Flag,
};

export function FindingIcon({
  type,
  severity,
  className,
}: {
  type: FindingType;
  severity: Severity;
  className?: string;
}) {
  const Icon = ICONS[FINDING_META[type]?.category ?? "feedback"];
  return (
    <Icon
      aria-hidden
      data-severity={severity}
      className={cn(
        "size-3.5 shrink-0 data-[severity=error]:text-destructive data-[severity=info]:text-muted-foreground data-[severity=warning]:text-warning",
        className,
      )}
    />
  );
}
