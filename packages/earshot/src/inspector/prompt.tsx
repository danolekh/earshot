"use client";
/* What the model was given for a reply: its messages in order, each `data-role`, and `data-fresh`
 * for those new since the request before (the rest it had already seen). */
import type * as React from "react";

import type { ModelInput } from "../trace/model-input";
import type { ChatMessage } from "../trace/types";
import { type PartProps, usePart } from "../utils/part";

export interface PromptRootProps extends Omit<PartProps<"ol", Record<string, never>>, "children"> {
  /** From `modelInput`. */
  input: ModelInput;
  /** Each message; a `Prompt.Message` by default. */
  children?: (message: ChatMessage, index: number) => React.ReactNode;
}

/** A model request's input. Renders an `<ol>`. */
export function PromptRoot(props: PromptRootProps): React.ReactElement {
  const { input, children, ...rest } = props;
  return usePart("prompt", "ol", {}, rest as PartProps<"ol", Record<string, never>>, {
    children: input.messages.map((m, i) =>
      children ? children(m, i) : <PromptMessage key={i} message={m} fresh={i >= input.before} />,
    ),
  });
}

export interface PromptMessageState extends Record<string, unknown> {
  role: string;
  /** New since the request before. */
  fresh: boolean;
}

export interface PromptMessageProps extends PartProps<"li", PromptMessageState> {
  message: ChatMessage;
  fresh?: boolean;
}

/** A message: its text, or the tools it asked for (`name({…})`), unless you give children. Renders
 * an `<li>`. */
export function PromptMessage(props: PromptMessageProps): React.ReactElement {
  const { message: m, fresh = false, children, ...rest } = props;
  return usePart(
    "prompt-message",
    "li",
    { role: m.role, fresh },
    rest as PartProps<"li", PromptMessageState>,
    {
      children:
        children ??
        (m.content || m.toolCalls?.map((c) => `${c.name}(${JSON.stringify(c.arguments ?? {})})`).join(", ")),
    },
  );
}
