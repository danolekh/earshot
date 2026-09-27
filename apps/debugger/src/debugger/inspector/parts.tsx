/* The parts of a turn's details, dressed: earshot's inspector parts with the app's layout. Each
 * part's heading line ("Waited 1.21 s") comes from earshot's gists. */
import {
  Decisions as DecisionsParts,
  HeardVsSaid as HeardParts,
  Latency as LatencyParts,
  Prompt,
  ToolCall,
} from "@danolekh/earshot/inspector";
import {
  DEFAULT_DETECTOR_CONFIG,
  type EouDecisionSignal,
  type HeardDiff,
  type LatencyBreakdown,
  type ModelInput,
  type TraceSpan,
} from "@danolekh/earshot/trace";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const ms = (s: number) => `${Math.round(s * 1000)} ms`;

/* Latency */

/** Where a reply's wait went, t = 0 at the end of the caller's speech. */
export function Latency({ b }: { b: LatencyBreakdown }) {
  return (
    <LatencyParts.Root breakdown={b} className="m-0">
      {/* The bar is the picture; the list under it says the same in words. */}
      <LatencyParts.Bar className="bg-muted h-3 overflow-hidden rounded-sm" />
      <LatencyParts.Stages className="mt-2 space-y-0.5 text-xs">
        {(row) => (
          <LatencyParts.Stage
            key={`${row.kind}${row.start}`}
            row={row}
            className="stage-row data-[kind=unexplained]:text-muted-foreground flex justify-between gap-3 pl-2"
          >
            <span className="min-w-0 truncate">
              {row.label}
              {row.reported && <span className="text-muted-foreground"> (reported)</span>}
            </span>
            <span className="font-mono tabular-nums">{ms(row.end - row.start)}</span>
          </LatencyParts.Stage>
        )}
      </LatencyParts.Stages>
      <LatencyParts.Caption className="text-muted-foreground mt-2 text-xs" />
    </LatencyParts.Root>
  );
}

/* Tools */

const fields = "grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs";
/** One level as rows of key and value; anything else as it is. */
const fieldsClass = ({ json }: { json: boolean }) =>
  json
    ? "font-mono text-xs break-words whitespace-pre-wrap"
    : `${fields} [&_[data-slot=tool-field]]:contents [&_dd]:m-0 [&_dd]:font-mono [&_dd]:break-words [&_dt]:text-muted-foreground [&_dt]:font-mono [&_dt]:break-all`;
const rawClass = "bg-muted rounded-md px-2 py-1.5 font-mono text-[11px] break-all whitespace-pre-wrap";

export function Tools({ spans }: { spans: readonly TraceSpan[] }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className="space-y-3">
      {spans.map((s) => (
        <ToolCall.Root key={s.id} span={s} className="space-y-1.5">
          <p className="text-xs">
            <code className="font-mono">{s.tool?.name ?? s.name}</code>
            <span className="text-muted-foreground"> · {ms(s.end - s.start)}</span>
            {s.status?.code === "error" && (
              <span className="text-destructive"> · {s.status.message ?? "failed"}</span>
            )}
          </p>
          {raw ? (
            <ToolCall.Fields
              value={{ arguments: s.tool?.arguments, result: s.tool?.result }}
              json
              className={rawClass}
            />
          ) : (
            <>
              <p className="text-muted-foreground text-[11px] font-medium">Arguments</p>
              <ToolCall.Fields value={s.tool?.arguments} className={fieldsClass} />
              <p className="text-muted-foreground mt-1 text-[11px] font-medium">Result</p>
              <ToolCall.Fields value={s.tool?.result} className={fieldsClass} />
            </>
          )}
        </ToolCall.Root>
      ))}
      <Button variant="ghost" size="xs" onClick={() => setRaw((r) => !r)}>
        {raw ? "Show as fields" : "Show JSON"}
      </Button>
    </div>
  );
}

/* Heard vs said */

const UNSURE = DEFAULT_DETECTOR_CONFIG.lowAsrConfidence.below;

export function HeardVsSaid({ diff }: { diff: HeardDiff }) {
  const row = "my-1 flex flex-wrap items-baseline gap-1 text-sm";
  const rowLabel = "w-11 text-[11px] text-muted-foreground";
  const word = "rounded-sm px-0.5";
  return (
    <HeardParts.Root diff={diff}>
      <p className={row}>
        <span className={rowLabel}>Said</span>
        <HeardParts.Words source="said" className="contents">
          {(op, i) => <HeardParts.Word key={i} op={op} source="said" className={word} />}
        </HeardParts.Words>
      </p>
      <p className={row}>
        <span className={rowLabel}>Heard</span>
        <HeardParts.Words source="heard" className="contents">
          {(op, i) => (
            <HeardParts.Word key={i} op={op} source="heard" className={word}>
              {/* An unsure word says how unsure; the rest as the part has them (a gap reads "not heard"). */}
              {op.heard?.confidence !== undefined && op.heard.confidence < UNSURE ? (
                <>
                  {op.heard.text}
                  <sub>{op.heard.confidence.toFixed(2)}</sub>
                </>
              ) : undefined}
            </HeardParts.Word>
          )}
        </HeardParts.Words>
      </p>
    </HeardParts.Root>
  );
}

/* The turn detector */

export function Decisions({ decisions }: { decisions: readonly EouDecisionSignal[] }) {
  return (
    <DecisionsParts.Root decisions={decisions} className="list-decimal space-y-0.5 pl-5 text-xs">
      {(d) => (
        <DecisionsParts.Item
          key={d.id}
          decision={d}
          className="text-muted-foreground data-[outcome=committed]:text-eou"
        />
      )}
    </DecisionsParts.Root>
  );
}

/* What the model was given */

export function ModelInputList({ model }: { model: ModelInput }) {
  return (
    <Prompt.Root input={model} className="list-decimal space-y-1 pl-5 text-xs break-words">
      {(m, i) => (
        <Prompt.Message
          key={i}
          message={m}
          fresh={i >= model.before}
          className="not-data-fresh:text-muted-foreground"
        >
          <span className="text-muted-foreground font-mono text-[10px]">{m.role}</span>{" "}
          {m.content || m.toolCalls?.map((c) => `${c.name}(${JSON.stringify(c.arguments ?? {})})`).join(", ")}
        </Prompt.Message>
      )}
    </Prompt.Root>
  );
}

/* What the reply ran on */

type Context = Readonly<Record<string, string | undefined>>;

export function RanOn({ context }: { context: Context }) {
  return (
    <dl className={fields}>
      {Object.entries(context)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="m-0 break-words">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
