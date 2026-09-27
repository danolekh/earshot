"use client";
import { formatTime } from "@danolekh/earshot/core";
import { Decisions, FindingList, HeardVsSaid, Latency, Prompt, ToolCall } from "@danolekh/earshot/inspector";
import { Player, usePlayer } from "@danolekh/earshot/player";
import { Timeline } from "@danolekh/earshot/timeline";
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
  modelGist,
  modelInput,
  toConversation,
  toolsGist,
  toolsOf,
  type TraceTurn,
  turnEvidence,
} from "@danolekh/earshot/trace";
import type * as React from "react";
import { useSyncExternalStore } from "react";

/* Why a call went wrong, from earshot's headless parts: what the detectors found, to pick from, and
 * for the picked turn what explains it (where the wait went, what was heard against what was said,
 * the turn detector, the tools, the model's input), each headed by its gist, the one that explains
 * the picked finding open. It ships no styles: call-inspector.css keys off `data-slot` and `data-*`
 * state, and reads the same variables as call-review's skins. */

export interface CallInspectorProps {
  /** A call from `readCall` (or your API), with its findings (`detect`). */
  trace: CallTrace;
  /** The recording; without it, the call plays on a virtual clock. */
  src?: string;
  title?: string;
  /** Chooses the CSS skin: `[data-skin="…"]`. */
  skin?: string;
  className?: string;
}

export function CallInspector({ trace, src, title, skin, className }: CallInspectorProps) {
  const { findings } = trace;
  return (
    <Player.Root
      conversation={toConversation(trace)}
      src={src}
      data-inspector=""
      data-skin={skin}
      className={className}
    >
      <header data-inspector="head">
        <div data-inspector="title">
          <strong>{title ?? trace.call.title ?? "Call"}</strong>
          <span>
            {findings.length} finding{findings.length === 1 ? "" : "s"}
          </span>
        </div>
        <Player.Toggle data-inspector="play">
          <PlayIcon />
        </Player.Toggle>
        <span data-inspector="clock">
          <Player.Time /> <span aria-hidden>/</span> <Player.Time show="duration" />
        </span>
      </header>

      <Timeline.Root>
        <Timeline.Scrubber>
          <Timeline.Lane data-inspector="findings-lane">
            <Timeline.Findings findings={findings} />
          </Timeline.Lane>
          <Timeline.Lane speaker="agent">
            <Timeline.Segments />
          </Timeline.Lane>
          <Timeline.Lane speaker="user">
            <Timeline.Segments />
          </Timeline.Lane>
          <Timeline.Playhead />
        </Timeline.Scrubber>
      </Timeline.Root>

      <div data-inspector="body">
        <section data-inspector="findings" aria-label="Findings">
          <h3>Findings</h3>
          {findings.length ? (
            <FindingList.Root findings={findings}>
              {(f) => (
                <li key={f.id}>
                  <FindingList.Item finding={f}>
                    <span data-inspector="finding-label">
                      {findingLabel(f.type)}
                      <span data-inspector="hidden"> ({f.severity})</span>
                    </span>
                    <time>{formatTime(f.start)}</time>
                    <span data-inspector="finding-message">{f.message}</span>
                  </FindingList.Item>
                </li>
              )}
            </FindingList.Root>
          ) : (
            <p data-inspector="empty">The detectors found nothing wrong.</p>
          )}
        </section>
        <Picked trace={trace} />
      </div>
    </Player.Root>
  );
}

const TITLES: Readonly<Record<EvidenceKind, string>> = {
  latency: "Latency",
  tools: "Tools",
  model: "Model input",
  context: "Ran on",
  heard: "Heard vs said",
  decisions: "Turn detector",
};

/** The picked turn: who, when, what they said, then what explains it. */
function Picked({ trace }: { trace: CallTrace }) {
  const { selection } = usePlayer("CallInspector");
  const picked = useSyncExternalStore(selection.subscribe, selection.get, selection.get);
  const turn = picked.turnId ? trace.turns.find((t) => t.id === picked.turnId) : undefined;
  if (!turn)
    return (
      <section data-inspector="details" aria-label="Picked turn">
        <p data-inspector="empty">Pick a finding to see what explains it.</p>
      </section>
    );
  const evidence = turnEvidence(trace, turn.id, picked.findingId);
  return (
    // A new pick starts with the part that explains it open.
    <section key={`${turn.id}:${picked.findingId ?? ""}`} data-inspector="details" aria-label="Picked turn">
      <h3>
        {turn.channel === "agent" ? "Agent" : "Caller"} · {formatTime(turn.start)}
      </h3>
      <blockquote>“{turn.text}”</blockquote>
      {evidence.parts.map((p) => {
        const shown = p.missing
          ? {
              gist: "Not recorded",
              body: <p data-inspector="empty">Not recorded for this call: {p.missing}.</p>,
            }
          : explain(trace, turn, p.kind);
        return (
          shown && (
            <details key={p.kind} data-inspector="part" data-part={p.kind} open={p.kind === evidence.open}>
              <summary>
                <span>{TITLES[p.kind]}</span>
                <span data-inspector="gist">{shown.gist}</span>
              </summary>
              {shown.body}
            </details>
          )
        );
      })}
    </section>
  );
}

/** One piece of evidence: its one-line gist and the part that shows it. */
function explain(
  trace: CallTrace,
  turn: TraceTurn,
  kind: EvidenceKind,
): { gist: string; body: React.ReactNode } | undefined {
  switch (kind) {
    case "latency": {
      const b = latencyBreakdown(trace, turn.id);
      return (
        b && {
          gist: latencyGist(b),
          body: (
            <Latency.Root breakdown={b}>
              <Latency.Bar />
              <Latency.Stages />
              <Latency.Caption />
            </Latency.Root>
          ),
        }
      );
    }
    case "tools": {
      const tools = toolsOf(trace, turn.id);
      return {
        gist: toolsGist(tools),
        body: tools.map((s) => (
          <ToolCall.Root key={s.id} span={s}>
            <p>
              <code>{s.tool?.name ?? s.name}</code> · {Math.round((s.end - s.start) * 1000)} ms
              {s.status?.message && ` · ${s.status.message}`}
            </p>
            <h4>Arguments</h4>
            <ToolCall.Fields value={s.tool?.arguments} />
            <h4>Result</h4>
            <ToolCall.Fields value={s.tool?.result} />
          </ToolCall.Root>
        )),
      };
    }
    case "model": {
      const input = modelInput(trace, turn.id);
      return input && { gist: modelGist(input), body: <Prompt.Root input={input} /> };
    }
    case "context":
      return (
        turn.context && {
          gist: contextGist(turn.context),
          body: (
            <dl>
              {Object.entries(turn.context).map(
                ([k, v]) =>
                  v !== undefined && (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ),
              )}
            </dl>
          ),
        }
      );
    case "heard": {
      const d = heardDiff(trace, turn.id);
      return (
        d && {
          gist: heardGist(d),
          body: (
            <HeardVsSaid.Root diff={d}>
              <p>
                <span data-inspector="line">Said</span>
                <HeardVsSaid.Words source="said" />
              </p>
              <p>
                <span data-inspector="line">Heard</span>
                <HeardVsSaid.Words source="heard" />
              </p>
            </HeardVsSaid.Root>
          ),
        }
      );
    }
    case "decisions": {
      const decisions = decisionsOf(trace, turn.id);
      return { gist: decisionsGist(decisions), body: <Decisions.Root decisions={decisions} /> };
    }
  }
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <path data-icon="play" d="M4 2.5v11l9-5.5z" fill="currentColor" />
      <path data-icon="pause" d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}
