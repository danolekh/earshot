/* What's picked, told briefly: who spoke and when, what they said, and what went wrong, in a
 * sentence each. The rest (latency, tools, what the agent heard, the turn detector, the model's
 * input) is one click away, each part's heading already saying the gist. The part that explains
 * the picked finding opens by itself. */
import { formatTime } from "@danolekh/earshot/core";
import { type Selection, usePlayer } from "@danolekh/earshot/player";
import { momentFor } from "@danolekh/earshot/review";
import {
  type CallTrace,
  contextGist,
  decisionsGist,
  decisionsOf,
  type EvidenceKind,
  findingLabel,
  heardDiff,
  heardGist,
  latencyBreakdown,
  latencyGist,
  measuredText,
  modelGist,
  modelInput,
  toolsGist,
  toolsOf,
  type TraceSpan,
  type TraceTurn,
  turnEvidence,
} from "@danolekh/earshot/trace";
import { useLocation, useRouter } from "@tanstack/react-router";
import { Check, FlaskConical, Link2 } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import type { Prepared } from "@/lib/prepare";
import type { DebugSearch } from "@/lib/search";
import { stackName } from "@/lib/stacks";

import { FindingIcon } from "../finding-icon";
import { Decisions, HeardVsSaid, Latency, ModelInputList, RanOn, Tools } from "./parts";

const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/** A line for the Details heading: what's picked. */
export function pickedTitle(prepared: Prepared, picked: Selection): string {
  const turn = picked.turnId ? prepared.turnById.get(picked.turnId) : undefined;
  if (turn) return `${turn.channel === "agent" ? "Agent" : "Caller"} · ${formatTime(turn.start)}`;
  const span = picked.spanId ? prepared.trace.spans.find((s) => s.id === picked.spanId) : undefined;
  return span ? span.name : "Nothing picked";
}

export function Details({
  prepared,
  picked,
  onSaveTest,
}: {
  prepared: Prepared;
  picked: Selection;
  onSaveTest?: (from: { turnId: string; findingId?: string }) => void;
}) {
  const turn = picked.turnId ? prepared.turnById.get(picked.turnId) : undefined;
  const span = picked.spanId ? prepared.trace.spans.find((s) => s.id === picked.spanId) : undefined;
  if (!turn && !span)
    return (
      <p className="text-muted-foreground px-2 text-sm">
        Pick a finding, a turn or a span to see why it went the way it did.
      </p>
    );
  return (
    <div className="space-y-4 px-2">
      {turn && (
        <TurnDetails prepared={prepared} turn={turn} findingId={picked.findingId} onSaveTest={onSaveTest} />
      )}
      {span && <SpanDetails span={span} />}
    </div>
  );
}

/** Each piece of evidence's heading. */
const TITLES: Readonly<Record<EvidenceKind, string>> = {
  latency: "Latency",
  tools: "Tools",
  model: "Model input",
  context: "Ran on",
  heard: "Heard vs said",
  decisions: "Turn detector",
};

interface Part {
  id: EvidenceKind;
  title: string;
  gist: string;
  content: React.ReactNode;
}

/** A part the stack has nothing for: said, so its absence isn't read as nothing wrong. */
function notRecorded(id: EvidenceKind, title: string, why: string, trace: CallTrace): Part {
  const stack = stackName(trace.call.provider);
  return {
    id,
    title,
    gist: `Not recorded by ${stack}`,
    content: (
      <p className="text-muted-foreground text-xs">
        {stack} didn't record it for this call ({why}), so nothing here can be checked.
      </p>
    ),
  };
}

function TurnDetails({
  prepared,
  turn,
  findingId,
  onSaveTest,
}: {
  prepared: Prepared;
  turn: TraceTurn;
  findingId: string | undefined;
  onSaveTest?: (from: { turnId: string; findingId?: string }) => void;
}) {
  const { trace } = prepared;
  const { selection } = usePlayer("TurnDetails");
  const findings = trace.findings.filter((f) => f.turnId === turn.id);
  const asked = turn.replyTo ? prepared.turnById.get(turn.replyTo) : undefined;
  const reply = trace.turns.find((t) => t.replyTo === turn.id);
  const agent = turn.channel === "agent";

  // What explains this turn, in order, and the piece to open (earshot's `turnEvidence`).
  const evidence = turnEvidence(trace, turn.id, findingId, prepared.blind);
  const parts = evidence.parts.flatMap((p): Part[] => {
    if (p.missing) return [notRecorded(p.kind, TITLES[p.kind], p.missing, trace)];
    const part = (gist: string, content: React.ReactNode): Part[] => [
      { id: p.kind, title: TITLES[p.kind], gist, content },
    ];
    switch (p.kind) {
      case "latency": {
        const b = latencyBreakdown(trace, turn.id);
        return b ? part(latencyGist(b), <Latency b={b} />) : [];
      }
      case "tools": {
        const tools = toolsOf(trace, turn.id);
        return part(toolsGist(tools), <Tools spans={tools} />);
      }
      case "model": {
        const model = modelInput(trace, turn.id);
        return model ? part(modelGist(model), <ModelInputList model={model} />) : [];
      }
      case "context":
        return turn.context ? part(contextGist(turn.context), <RanOn context={turn.context} />) : [];
      case "heard": {
        const d = heardDiff(trace, turn.id);
        return d ? part(heardGist(d), <HeardVsSaid diff={d} />) : [];
      }
      case "decisions": {
        const decisions = decisionsOf(trace, turn.id);
        return part(decisionsGist(decisions), <Decisions decisions={decisions} />);
      }
    }
  });
  const open = evidence.open ? [evidence.open] : [];

  const pick = (t: TraceTurn) => selection.set({ turnId: t.id });
  return (
    <section aria-label="Picked turn" className="space-y-3">
      <div className="space-y-1">
        <Quote text={turn.text} />
        {asked && (
          <p className="text-muted-foreground text-xs">
            Answers{" "}
            <button
              type="button"
              className="hover:text-foreground underline underline-offset-2"
              onClick={() => pick(asked)}
            >
              {formatTime(asked.start)} “{clip(asked.text, 48)}”
            </button>
          </p>
        )}
        {reply && !agent && (
          <p className="text-muted-foreground text-xs">
            Answered{" "}
            <button
              type="button"
              className="hover:text-foreground underline underline-offset-2"
              onClick={() => pick(reply)}
            >
              {formatTime(reply.start)} “{clip(reply.text, 48)}”
            </button>
          </p>
        )}
      </div>

      {findings.length > 0 && (
        <ul aria-label="What went wrong" className="m-0 list-none space-y-1.5 p-0">
          {findings.map((f) => {
            const measured = measuredText(f);
            return (
              <li key={f.id} className="flex gap-2 text-sm">
                <FindingIcon type={f.type} severity={f.severity} className="mt-[3px]" />
                <span className="min-w-0">
                  <span className="font-medium">{findingLabel(f.type)}</span>
                  {measured && <span className="text-muted-foreground">: {measured}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {parts.length > 0 && (
        <Accordion
          key={`${turn.id}:${findingId ?? ""}`}
          multiple
          defaultValue={open}
          className="rounded-md border"
        >
          {parts.map((p) => (
            <AccordionItem key={p.id} value={p.id}>
              <AccordionTrigger className="hover:bg-muted/50 items-center gap-3 rounded-none px-2.5 py-2 hover:no-underline">
                <span className="text-xs font-medium">{p.title}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-xs font-normal">
                  {p.gist}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-2.5">{p.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="flex flex-wrap gap-2">
        {onSaveTest && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => onSaveTest({ turnId: turn.id, ...(findingId && { findingId }) })}
          >
            <FlaskConical aria-hidden />
            Save as test case
          </Button>
        )}
        <CopyLink turn={turn} findingId={findingId} />
      </div>
    </section>
  );
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/** A quote, three lines at most until asked for the rest. */
function Quote({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 180;
  return (
    <blockquote className="m-0 text-sm">
      <p data-clamped={long && !all ? "" : undefined} className="data-clamped:line-clamp-3">
        “{text}”
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={all}
          className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
          onClick={() => setAll((a) => !a)}
        >
          {all ? "Less" : "More"}
        </button>
      )}
    </blockquote>
  );
}

/** What a debugger URL says of the moment, replaced by the link's own. */
const MOMENT_KEYS = [
  "t",
  "from",
  "to",
  "turn",
  "span",
  "finding",
  "hide",
] as const satisfies readonly (keyof DebugSearch)[];

/** A link to this moment, for a ticket or a chat: this page (an imported call keeps its id) with the
 * moment in place of the current one, written by the router as the URL sync writes it. */
function CopyLink({ turn, findingId }: { turn: TraceTurn; findingId: string | undefined }) {
  const router = useRouter();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    const moment = momentFor({ start: turn.start, turn: turn.id, ...(findingId && { finding: findingId }) });
    const page = Object.fromEntries(
      Object.entries(location.search).filter(([key]) => !(MOMENT_KEYS as readonly string[]).includes(key)),
    );
    const path = router.history.createHref(
      location.pathname + router.options.stringifySearch({ ...page, ...moment }),
    );
    await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copy()}>
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? "Copied" : "Copy link to this moment"}
    </Button>
  );
}

function SpanDetails({ span }: { span: TraceSpan }) {
  return (
    <section aria-label="Picked span" className="space-y-2">
      <p className="text-sm">
        <code className="font-mono break-all">{span.name}</code>
        <span className="text-muted-foreground"> · {ms(span.end - span.start)}</span>
      </p>
      <p className="text-muted-foreground text-xs">
        {span.kind} · {formatTime(span.start)} · {span.status?.code ?? "unset"}
        {span.process && ` · ${span.process}`}
      </p>
      <dl className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-[11px]">
        {Object.entries(span.attributes).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground font-mono break-all">{k}</dt>
            <dd className="m-0 break-words">
              {typeof v === "string" ? (v.length > 160 ? `${v.slice(0, 160)}…` : v) : JSON.stringify(v)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
