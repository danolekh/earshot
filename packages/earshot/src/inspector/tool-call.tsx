"use client";
/* A tool call: its name, how it went (`data-status`), and what went in and came out, one level of
 * fields as a definition list, or the JSON as it was. */
import type * as React from "react";

import type { TraceSpan } from "../trace/types";
import { type PartProps, usePart } from "../utils/part";

export interface ToolCallRootState extends Record<string, unknown> {
  status: "ok" | "error" | "unset";
  /** Worked out rather than traced (found in the next model request's input). */
  estimated: boolean;
}

export interface ToolCallRootProps extends PartProps<"div", ToolCallRootState> {
  /** A tool span (`kind: "tool"`), from `toolsOf`. */
  span: TraceSpan;
}

/** One tool call. Put its name and `ToolCall.Fields` for `span.tool.arguments` and `.result`
 * inside. Renders a `<div>`. */
export function ToolCallRoot(props: ToolCallRootProps): React.ReactElement {
  const { span, ...rest } = props;
  const status =
    span.status?.code === "error" || span.tool?.isError ? "error" : (span.status?.code ?? "unset");
  return usePart(
    "tool-call",
    "div",
    { status, estimated: span.estimated === true },
    rest as PartProps<"div", ToolCallRootState>,
    {},
  );
}

export interface ToolCallFieldsState extends Record<string, unknown> {
  /** Shown as JSON rather than fields. */
  json: boolean;
}

export interface ToolCallFieldsProps extends PartProps<"dl", ToolCallFieldsState> {
  value: unknown;
  /** The JSON as it was, in a `<pre>`; an object's top level as fields otherwise. */
  json?: boolean;
}

const plain = (v: unknown) =>
  v === null || ["string", "number", "boolean"].includes(typeof v) ? String(v) : JSON.stringify(v);

/** Arguments or a result: an object's top level as `<dt>`/`<dd>` pairs (each pair in a
 * `data-slot="tool-field"` div, deeper values as JSON), anything else, or `json`, as a `<pre>`.
 * Renders a `<dl>` (or a `<pre>`). */
export function ToolCallFields(props: ToolCallFieldsProps): React.ReactElement {
  const { value, json = false, ...rest } = props;
  const fields = !json && value !== null && typeof value === "object" && !Array.isArray(value);
  return usePart(
    "tool-call-fields",
    fields ? "dl" : "pre",
    { json: !fields },
    rest as PartProps<"dl", ToolCallFieldsState>,
    {
      children: fields
        ? Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} data-slot="tool-field">
              <dt>{k}</dt>
              <dd>{plain(v)}</dd>
            </div>
          ))
        : JSON.stringify(value, null, 2),
    },
  );
}
