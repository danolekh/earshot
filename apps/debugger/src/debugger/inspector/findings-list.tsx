/* The call's findings in time order: what went wrong, when, and the detector's own sentence under
 * it. earshot's FindingList: picking one moves the call there, and the list is one tab stop, the
 * arrows moving between findings. */
import { formatTime } from "@danolekh/earshot/core";
import { FindingList } from "@danolekh/earshot/inspector";
import type { CallTrace, Finding } from "@danolekh/earshot/trace";
import { findingLabel } from "@danolekh/earshot/trace";
import { FlaskConical } from "lucide-react";

import { FindingIcon } from "../finding-icon";

export function FindingsList({
  trace,
  onSaveTest,
}: {
  trace: CallTrace;
  /** Offered on each row, on hover (and in Details, for the keyboard). */
  onSaveTest?: (finding: Finding) => void;
}) {
  if (!trace.findings.length)
    return <p className="text-muted-foreground px-2 text-sm">The detectors found nothing wrong.</p>;
  return (
    <FindingList.Root findings={trace.findings} className="m-0 flex list-none flex-col gap-px p-0">
      {(f) => (
        <li key={f.id} className="group/finding relative">
          <FindingList.Item
            finding={f}
            data-finding={f.id}
            className="hover:bg-sidebar-accent aria-[current]:bg-sidebar-accent focus-visible:ring-sidebar-ring grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md px-2 py-1.5 text-left outline-none focus-visible:ring-2"
          >
            <FindingIcon type={f.type} severity={f.severity} className="mt-[3px]" />
            <span className="min-w-0">
              <span className="block text-sm leading-5 font-medium">
                {findingLabel(f.type)}
                <span className="sr-only"> ({f.severity})</span>
              </span>
              <span className="text-muted-foreground line-clamp-2 text-xs leading-4">{f.message}</span>
            </span>
            <span className="text-muted-foreground font-mono text-xs leading-5 tabular-nums">
              {formatTime(f.start)}
            </span>
          </FindingList.Item>
          {onSaveTest && f.turnId && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Save as test case: ${findingLabel(f.type)} at ${formatTime(f.start)}`}
              title="Save as test case"
              onClick={() => onSaveTest(f)}
              className="bg-sidebar-accent text-muted-foreground hover:text-foreground absolute top-1 right-1 flex size-6 items-center justify-center rounded-md opacity-0 outline-none group-hover/finding:opacity-100"
            >
              <FlaskConical className="size-3.5" aria-hidden />
            </button>
          )}
        </li>
      )}
    </FindingList.Root>
  );
}
