import type { HighlighterCore } from "shiki/core";

// One grammar and two themes, on Shiki's JavaScript regex engine: no Oniguruma WASM to bundle,
// only what the demo code blocks need, and none of it loaded until a Code tab is opened.
let highlighter: Promise<HighlighterCore> | undefined;

export function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        langs: [import("shiki/langs/tsx.mjs")],
        themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}
