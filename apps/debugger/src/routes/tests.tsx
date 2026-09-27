import { createFileRoute } from "@tanstack/react-router";

import { TestsPage } from "@/tests/tests-page";

/** The tests saved from calls, each run on every call of its flow. */
export const Route = createFileRoute("/tests")({
  head: () => ({ meta: [{ title: "Tests · Call debugger" }] }),
  component: TestsPage,
});
