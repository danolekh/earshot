import { formatTime } from "@danolekh/earshot/core";
import { type CallSummary, momentFor } from "@danolekh/earshot/review";
import {
  type CheckStatus,
  describeCheck,
  runTestCase,
  summarizeRun,
  type TestCase,
} from "@danolekh/earshot/trace";
/* The tests saved from calls. Each runs on every call of the flow it came from: failing on the call
 * it was drafted from (the bug caught), and, once the agent's fixed, passing on the calls after.
 * A call's result opens to its checks, each linking to the moment it looked at. Tests are kept in
 * this browser, so the page shows them once hydrated. */
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, CircleDashed, CircleX, FlaskConical, Loader, Trash2 } from "lucide-react";
import { Suspense, use, useMemo } from "react";
import { toast } from "sonner";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import { ExportMenu } from "@/debugger/test-export";
import { CALL_LIST, tracePromise, useAllCalls } from "@/lib/calls";
import { useHydrated } from "@/lib/hydrated";
import { deleteTest, restoreTest, type SavedTest, savedTests } from "@/lib/saved-tests";
import { stackName } from "@/lib/stacks";
import { flowOf, momentOf, versionOf } from "@/lib/test-runs";
import { callLink } from "@/lib/triage";
import { CallLink } from "@/triage/call-link";
import { NavTabs } from "@/triage/nav-tabs";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const SAVED = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function TestsPage() {
  const hydrated = useHydrated();
  const [tests] = savedTests.use();
  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="bg-card flex h-10 shrink-0 items-center gap-4 border-b px-4">
        <h1 className="sr-only">Tests</h1>
        <NavTabs />
      </header>
      <main aria-label="Saved tests" className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {hydrated && (tests.length ? tests.map((s) => <TestCard key={s.id} saved={s} />) : <Empty />)}
        </div>
      </main>
    </div>
  );
}

function TestCard({ saved }: { saved: SavedTest }) {
  const { test } = saved;
  const calls = useAllCalls();
  const flow = useMemo(() => flowOf(calls, test), [calls, test]);
  const source = flow.find((c) => c.id === test.source.callId);
  // Every call's trace starts loading now, not one after another as each result asks.
  for (const c of flow) void tracePromise(c.id);

  const remove = () => {
    const undo = deleteTest(saved.id);
    if (!undo) return;
    toast(`Deleted “${test.name}”`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => restoreTest(undo) },
    });
  };

  return (
    <article aria-label={test.name} data-test={saved.id} className="bg-card rounded-lg border">
      <header className="flex items-start gap-2 px-4 pt-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-sm font-medium">{test.name}</h2>
          <p className="text-muted-foreground text-xs">
            {source ? (
              <>
                From{" "}
                <CallLink
                  id={source.id}
                  search={momentFor({
                    start: test.source.at,
                    ...(test.source.turns.length > 0 && { turn: test.source.turns.at(-1) }),
                  })}
                  className="hover:text-foreground underline underline-offset-3"
                >
                  {versionOf(source)} at {formatTime(test.source.at)}
                </CallLink>
              </>
            ) : (
              `From ${test.source.callId}, no longer here`
            )}
            {[test.context.promptVersion, test.context.model].filter(Boolean).map((v) => ` · ${v}`)}
            {` · saved ${SAVED.format(new Date(saved.savedAt))}`}
          </p>
        </div>
        <Suspense fallback={<ExportMenu test={test} />}>
          <SourceExport test={test} />
        </Suspense>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete “${test.name}”`} onClick={remove}>
          <Trash2 aria-hidden />
        </Button>
      </header>

      <ol aria-label="Checks" className="text-muted-foreground m-0 list-none space-y-0.5 px-4 pt-2 text-xs">
        {test.checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span className="w-3 shrink-0 text-right font-mono tabular-nums">{i + 1}</span>
            <span className="min-w-0 truncate">{describeCheck(c)}</span>
          </li>
        ))}
      </ol>

      <section aria-label="Runs" className="px-4 pt-2 pb-1">
        <h3 className="text-muted-foreground border-b pb-1.5 text-[11px] font-medium tracking-wide uppercase">
          On each call of this flow
        </h3>
        {flow.length ? (
          <Accordion multiple>
            {flow.map((call) => (
              <Suspense key={call.id} fallback={<PendingRun call={call} />}>
                <Run call={call} test={test} own={call.id === test.source.callId} />
              </Suspense>
            ))}
          </Accordion>
        ) : (
          <p className="text-muted-foreground py-2.5 text-xs">No calls of this flow to run on.</p>
        )}
      </section>
    </article>
  );
}

/** The export menu, with the source call's trace for the LiveKit test. */
function SourceExport({ test }: { test: TestCase }) {
  const trace = use(tracePromise(test.source.callId));
  return <ExportMenu test={test} trace={trace} />;
}

const STATUS: Record<CheckStatus, { icon: typeof CircleCheck; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: "text-primary", label: "Pass" },
  fail: { icon: CircleX, className: "text-destructive", label: "Fail" },
  missing: { icon: CircleDashed, className: "text-muted-foreground", label: "Can't check" },
};

function CallLabel({ call, own }: { call: CallSummary; own?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-2">
      <span className="font-mono text-xs">{versionOf(call)}</span>
      {call.provider && <span className="text-xs font-normal">{stackName(call.provider)}</span>}
      <span className="text-muted-foreground truncate font-mono text-xs font-normal">
        {[call.prompt, call.startedAt && DAY.format(new Date(call.startedAt))].filter(Boolean).join(" · ")}
      </span>
      {own && (
        <span className="text-muted-foreground bg-muted rounded px-1.5 text-[11px] font-normal">
          drafted here
        </span>
      )}
    </span>
  );
}

function PendingRun({ call }: { call: CallSummary }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5 text-sm" aria-busy>
      <Loader className="text-muted-foreground size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      <CallLabel call={call} />
      <span className="text-muted-foreground ml-auto text-xs">Running…</span>
    </div>
  );
}

function Run({ call, test, own }: { call: CallSummary; test: TestCase; own: boolean }) {
  const trace = use(tracePromise(call.id));
  const results = useMemo(() => (trace ? runTestCase(trace, test) : []), [trace, test]);
  if (!trace) return null;
  const summary = summarizeRun(results);
  const { icon: Icon, className } = STATUS[summary.status];
  return (
    <AccordionItem value={call.id} data-call={call.id} data-status={summary.status}>
      <AccordionTrigger className="items-center gap-2.5 hover:no-underline">
        <Icon className={`size-4 shrink-0 ${className}`} aria-hidden />
        <CallLabel call={call} own={own} />
        <span
          data-summary
          className={`shrink-0 text-xs ${summary.status === "fail" ? "text-destructive" : ""}`}
        >
          {summary.text}
        </span>
      </AccordionTrigger>
      <AccordionContent className="[&_a]:no-underline">
        <ul className="m-0 list-none space-y-2 p-0 pl-6.5">
          {results.map((r, i) => {
            const s = STATUS[r.status];
            const moment = momentOf(trace, r.turn);
            const turn = r.turn ? trace.turns.find((t) => t.id === r.turn) : undefined;
            return (
              <li
                key={i}
                data-status={r.status}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 text-xs"
              >
                <s.icon className={`mt-px size-3.5 ${s.className}`} aria-label={s.label} />
                <div className="min-w-0">
                  <div className="text-foreground">{describeCheck(r.check)}</div>
                  <div className="text-muted-foreground">{r.measured}</div>
                </div>
                <CallLink
                  id={call.id}
                  search={moment}
                  aria-label={`Open ${versionOf(call)} ${turn ? `at ${formatTime(turn.start)}` : ""}`.trim()}
                  className={buttonVariants({
                    variant: "ghost",
                    size: "xs",
                    className: "text-muted-foreground -my-0.5 font-mono tabular-nums",
                  })}
                >
                  {turn ? formatTime(turn.start) : "Open"}
                  <ArrowRight aria-hidden />
                </CallLink>
              </li>
            );
          })}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
}

function Empty() {
  const demo = CALL_LIST.find((c) => c.id === "stadtwerke-zaehlerstand");
  const link =
    demo &&
    callLink(
      demo,
      demo.findings.find((f) => f.type === "tool_error"),
    );
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <FlaskConical className="text-muted-foreground size-6" aria-hidden />
      <h2 className="text-sm font-medium">No saved tests yet</h2>
      <p className="text-muted-foreground max-w-sm text-sm">
        In a call, pick a finding and choose <span className="text-foreground">Save as test case</span>. It
        runs here on every call of the same flow, so you can see the fix pass.
      </p>
      {link && (
        <Link
          to="/call/$id/"
          params={{ id: link.id }}
          search={link.search}
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}
        >
          Open the demo call
        </Link>
      )}
    </div>
  );
}
