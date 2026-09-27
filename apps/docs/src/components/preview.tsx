import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock.core";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { Suspense, use } from "react";

import { getHighlighter } from "@/lib/highlighter";

import { demos, type DemoName } from "./demos";

const sources = new Map<DemoName, Promise<string>>();
const sourceOf = (name: DemoName) => {
  let p = sources.get(name);
  if (!p) sources.set(name, (p = demos[name].source()));
  return p;
};

/** A live demo with its source beside it. The source shown is the file that renders, read with
 * Vite's `?raw`, so the two can't drift. Both load with the page that shows them; the source only
 * once the Code tab is opened. */
export function ComponentPreview({ name }: { name: DemoName }) {
  const { Component, file } = demos[name];
  return (
    <Tabs items={["Preview", "Code"]} className="not-prose">
      <Tab
        value="Preview"
        className="bg-fd-background flex min-h-[340px] items-center justify-center p-4 sm:p-8"
      >
        <Suspense fallback={null}>
          <Component />
        </Suspense>
      </Tab>
      <Tab value="Code">
        {/* Tab panels mount when opened, so the source loads with the first look at it. */}
        <Suspense fallback={<div className="min-h-40" />}>
          <Source name={name} file={file} />
        </Suspense>
      </Tab>
    </Tabs>
  );
}

function Source({ name, file }: { name: DemoName; file: string }) {
  const code = use(sourceOf(name));
  return (
    <DynamicCodeBlock
      highlighter={getHighlighter}
      lang="tsx"
      code={code}
      codeblock={{ title: file }}
      options={{ themes: { light: "github-light", dark: "github-dark" } }}
    />
  );
}
