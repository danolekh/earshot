/* A model's input, whatever shape the provider logged it in, as plain messages: LiveKit's chat
 * context (a list of messages, or `{items}` with function calls and their outputs as items), and
 * OpenAI-style messages (Pipecat logs the provider's own format) with `tool_calls` and `tool`
 * replies. Content given as parts keeps its text. */
import type { ChatMessage } from "../trace/types";

type Raw = Record<string, unknown>;

const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);

/** The text of a message's content: a string, or the text of its parts. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((p) => (typeof p === "string" ? p : isRecord(p) && typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join(" ");
  return "";
}

/** Arguments as given, parsed when they're JSON. */
function args(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function message(m: Raw): ChatMessage | undefined {
  // LiveKit items: a function call, or its output.
  if (m.type === "function_call" && typeof m.name === "string")
    return {
      role: "assistant",
      content: "",
      toolCalls: [
        {
          ...(typeof m.call_id === "string" && { id: m.call_id }),
          name: m.name,
          arguments: args(m.arguments),
        },
      ],
    };
  if (m.type === "function_call_output")
    return {
      role: "tool",
      content: textOf(m.output),
      ...(typeof m.call_id === "string" && { toolCallId: m.call_id }),
    };
  if (typeof m.role !== "string") return undefined;
  const calls = Array.isArray(m.tool_calls)
    ? m.tool_calls.filter(isRecord).map((c) => {
        const fn = isRecord(c.function) ? c.function : c;
        return {
          ...(typeof c.id === "string" && { id: c.id }),
          name: String(fn.name ?? ""),
          arguments: args(fn.arguments),
        };
      })
    : [];
  return {
    role: m.role,
    content: textOf(m.content),
    ...(calls.length > 0 && { toolCalls: calls }),
    ...(typeof m.tool_call_id === "string" && { toolCallId: m.tool_call_id }),
  };
}

/** Plain messages from a logged model input (parsed, or the JSON string), or undefined when it
 * isn't one. */
export function normalizeChat(input: unknown): ChatMessage[] | undefined {
  let v = input;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  const list = Array.isArray(v)
    ? v
    : isRecord(v) && Array.isArray(v.items)
      ? v.items
      : isRecord(v) && Array.isArray(v.messages)
        ? v.messages
        : undefined;
  if (!list) return undefined;
  return list.filter(isRecord).flatMap((m) => message(m) ?? []);
}
