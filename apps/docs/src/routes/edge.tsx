import { createFileRoute } from "@tanstack/react-router";

import { EDGE } from "@/lib/edge-fixtures";

import { CallReview } from "../../registry/earshot/call-review";

// Not linked and not indexed: a page of awkward calls, to see what breaks.
export const Route = createFileRoute("/edge")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }, { title: "earshot edge cases" }] }),
  component: Edge,
});

function Edge() {
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-10">
      {EDGE.map((e) => (
        <section key={e.id} id={e.id} className="grid gap-3">
          <h2 className="font-mono text-sm">{e.title}</h2>
          <CallReview call={e.call} title={e.title} subtitle="edge case" skin="console" />
        </section>
      ))}
    </main>
  );
}
