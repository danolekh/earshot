"use client";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";

/** Props every part accepts on top of its element's own: `render` swaps the element (a tag, your
 * component, `<motion.div />`), and `className` / `style` may be functions of the part's state. */
export type PartProps<Tag extends keyof React.JSX.IntrinsicElements, State> = Omit<
  React.ComponentPropsWithRef<Tag>,
  "className" | "style"
> & {
  render?: useRender.RenderProp<State>;
  className?: string | ((state: State) => string | undefined);
  style?: React.CSSProperties | ((state: State) => React.CSSProperties | undefined);
};

const resolve = <T, S>(value: T | ((state: S) => T), state: S): T =>
  typeof value === "function" ? (value as (state: S) => T)(state) : value;

/** Renders a part: state becomes `data-*` attributes, `data-slot` names it, and the caller's props
 * are merged over the part's own (handlers chained, classes joined, styles combined). */
export function usePart<State extends Record<string, unknown>>(
  slot: string,
  tag: keyof React.JSX.IntrinsicElements,
  state: State,
  props: PartProps<keyof React.JSX.IntrinsicElements, State>,
  own: Record<string, unknown>,
  refs: React.Ref<never>[] = [],
): React.ReactElement {
  const { render, className, style, ref, ...rest } = props as PartProps<"div", State>;
  const merged = mergeProps(own as React.ComponentProps<"div">, {
    ...(rest as React.ComponentProps<"div">),
    className: resolve(className, state),
    style: resolve(style, state),
  });
  return useRender({
    defaultTagName: tag,
    render,
    state,
    ref: [ref as React.Ref<never>, ...refs].filter(Boolean),
    props: { ...merged, style: { ...(own.style as object), ...merged.style }, "data-slot": slot },
  });
}
