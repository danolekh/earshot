/* Saving a bad moment as a test case: the exchange it covers, what the agent ran on, and what it
 * should have done instead, as checks. Each check runs on this call as you edit it; a test worth
 * keeping fails here (that's the bug caught). Saved, it runs on every call of the same flow (the
 * Tests page); exported, it's a JSON file (for the CLI) or a LiveKit Agents test. */
import { formatTime } from "@danolekh/earshot/core";
import {
  anchorFor,
  type CallTrace,
  type Check,
  DEFAULT_DETECTOR_CONFIG,
  describeCheck,
  draftTestCase,
  FINDING_META,
  findingLabel,
  type FindingType,
  runChecks,
  saidText,
  type TestCase,
} from "@danolekh/earshot/trace";
import { useNavigate } from "@tanstack/react-router";
import { CircleCheck, CircleX, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { saveTest } from "@/lib/saved-tests";

import { FindingIcon } from "./finding-icon";
import { ExportMenu } from "./test-export";

/** How long a reply may take, as the slow-reply detector draws the line. */
const REPLY_WITHIN = DEFAULT_DETECTOR_CONFIG.slowTurn.gap;

export interface DraftFrom {
  turnId: string;
  findingId?: string;
}

export function TestCaseDialog({
  trace,
  from,
  onClose,
}: {
  trace: CallTrace;
  from: DraftFrom | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={from !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-xl">
        {from && (
          <Draft key={`${from.turnId}:${from.findingId ?? ""}`} trace={trace} from={from} onSaved={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Draft({ trace, from, onSaved }: { trace: CallTrace; from: DraftFrom; onSaved: () => void }) {
  const [draft, setDraft] = useState<TestCase>(() => draftTestCase(trace, from.turnId, from.findingId));
  const navigate = useNavigate();
  const results = useMemo(() => runChecks(trace, draft.checks), [trace, draft.checks]);
  const turns = draft.source.turns.map((id) => trace.turns.find((t) => t.id === id)!).filter(Boolean);
  const failing = results.filter((r) => !r.pass).length;

  const setChecks = (checks: readonly Check[]) => setDraft({ ...draft, checks });
  const replace = (i: number, check: Check) => setChecks(draft.checks.map((c, k) => (k === i ? check : c)));
  const add = (check: Check) => setChecks([...draft.checks, check]);

  const save = () => {
    saveTest(draft);
    onSaved();
    toast("Saved to Tests", {
      description: draft.name,
      action: { label: "View tests", onClick: () => void navigate({ to: "/tests/" }) },
    });
  };

  const reply = turns.find((t) => t.channel === "agent");
  const caller = turns.find((t) => t.channel === "caller");
  const tools = [
    ...new Set(
      trace.spans
        .filter((s) => s.kind === "tool" && draft.source.turns.includes(s.turnId ?? ""))
        .map((s) => s.tool?.name ?? s.name),
    ),
  ];
  const anchorOf = (t: (typeof turns)[number]) => {
    const at = anchorFor(trace, t);
    return at ? { at } : {};
  };
  const turnTime = (id?: string) => {
    const t = id ? trace.turns.find((x) => x.id === id) : undefined;
    return t
      ? `${t.channel === "agent" ? "the agent" : "the caller"} at ${formatTime(t.start)}`
      : "anywhere in the call";
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Save as test case</DialogTitle>
        <DialogDescription>
          Each check runs on this call now. A test that catches the bug fails here, and passes once it&apos;s
          fixed.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        <label className="block space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium">Name</span>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>

        <section aria-label="Covers" className="space-y-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">Covers</h3>
          <ul className="m-0 list-none space-y-1 p-0">
            {turns.map((t) => (
              <li key={t.id} className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0 font-mono text-xs leading-5">
                  {t.channel === "agent" ? "Agent" : "Caller"} {formatTime(t.start)}
                </span>
                <span className="line-clamp-2 min-w-0">“{t.text}”</span>
              </li>
            ))}
          </ul>
          {(draft.context.promptVersion || draft.context.model) && (
            <p className="text-muted-foreground text-xs">
              Ran on {[draft.context.promptVersion, draft.context.model].filter(Boolean).join(" · ")}
              {draft.context.messages !== undefined && ` · ${draft.context.messages} messages of context`}
            </p>
          )}
        </section>

        <section aria-label="Expected" className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-muted-foreground text-xs font-medium">Expected</h3>
            <span className="text-muted-foreground text-xs">
              {failing} of {results.length} fail on this call
            </span>
          </div>
          <ul className="m-0 list-none space-y-2 p-0">
            {results.map((r, i) => (
              <li
                key={i}
                data-pass={r.pass || undefined}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md border px-2.5 py-2"
              >
                {r.pass ? (
                  <CircleCheck className="text-primary mt-0.5 size-4" aria-hidden />
                ) : (
                  <CircleX className="text-destructive mt-0.5 size-4" aria-hidden />
                )}
                <div className="min-w-0 space-y-0.5">
                  <CheckEditor check={r.check} onChange={(c) => replace(i, c)} />
                  <p className="text-muted-foreground text-xs">
                    <span className={r.pass ? "" : "text-destructive"}>
                      {r.pass ? "Passes on this call" : "Fails on this call"}
                    </span>
                    {" · "}
                    {r.measured}
                    {" · "}
                    {turnTime(r.check.turn)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove “${describeCheck(r.check)}”`}
                  onClick={() => setChecks(draft.checks.filter((_, k) => k !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" />}>
              <Plus aria-hidden />
              Add check
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>On these turns</DropdownMenuLabel>
                {reply && (
                  <DropdownMenuItem
                    onClick={() =>
                      add({ kind: "reply_within", seconds: REPLY_WITHIN, turn: reply.id, ...anchorOf(reply) })
                    }
                  >
                    Replies within {REPLY_WITHIN} s
                  </DropdownMenuItem>
                )}
                {caller && (
                  <DropdownMenuItem
                    onClick={() =>
                      add({
                        kind: "hears",
                        text: saidText(trace, caller),
                        turn: caller.id,
                        ...anchorOf(caller),
                      })
                    }
                  >
                    Hears what the caller said
                  </DropdownMenuItem>
                )}
                {tools.map((tool) => (
                  <DropdownMenuItem
                    key={tool}
                    onClick={() =>
                      add({
                        kind: "tool_succeeds",
                        tool,
                        ...(reply && { turn: reply.id, ...anchorOf(reply) }),
                      })
                    }
                  >
                    {tool} succeeds
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Anywhere in the call…</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-72">
                  {(Object.keys(FINDING_META) as FindingType[])
                    .filter((t) => t !== "human_feedback")
                    .map((finding) => (
                      <DropdownMenuItem key={finding} onClick={() => add({ kind: "no_finding", finding })}>
                        <FindingIcon type={finding} severity="info" />
                        {FINDING_META[finding].expect}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </section>
      </div>

      <DialogFooter>
        <ExportMenu test={draft} trace={trace} />
        <Button className="gap-1.5" disabled={!draft.checks.length} onClick={save}>
          <Save aria-hidden />
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** A check's sentence, with its one editable value in place. */
function CheckEditor({ check, onChange }: { check: Check; onChange: (check: Check) => void }) {
  switch (check.kind) {
    case "reply_within":
      return (
        <p className="flex items-center gap-1.5">
          Replies within
          <Input
            type="number"
            min={0.2}
            max={10}
            step={0.1}
            value={check.seconds}
            aria-label="Seconds"
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (Number.isFinite(seconds) && seconds > 0) onChange({ ...check, seconds });
            }}
            className="h-7 w-16 px-1.5 font-mono text-xs"
          />
          s
        </p>
      );
    case "hears":
      return (
        <p className="flex items-center gap-1.5">
          <span className="shrink-0">Hears</span>
          <Input
            value={check.text}
            aria-label="Words to hear"
            onChange={(e) => onChange({ ...check, text: e.target.value })}
            className="h-7 min-w-0 flex-1 px-1.5 text-xs"
          />
        </p>
      );
    case "no_finding":
      return (
        <p className="flex items-center gap-1.5">
          <FindingIcon type={check.finding} severity="info" />
          <span title={`No “${findingLabel(check.finding)}”`}>{describeCheck(check)}</span>
        </p>
      );
    case "tool_succeeds":
      return <p>{describeCheck(check)}</p>;
  }
}
