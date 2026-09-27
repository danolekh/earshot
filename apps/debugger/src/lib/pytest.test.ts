import { py, toLiveKitTest as toPytest } from "@danolekh/earshot/formats";
import { type CallTrace, draftTestCase } from "@danolekh/earshot/trace";
import { afterEach, describe, expect, it } from "vitest";

import { demo } from "@/calls/demo";

import { deleteTest, fileName, restoreTest, savedTests, saveTest } from "./saved-tests";

const toolError = demo.findings.find((f) => f.type === "tool_error")!;
const test = draftTestCase(demo as CallTrace, toolError.turnId!, toolError.id);

describe("a test case as a LiveKit unit test", () => {
  const code = toPytest(test, demo);

  it("sets up a text-mode session on the model the reply ran on", () => {
    expect(code.startsWith(`"""Stadtwerke Muster · Zählerstand · Tool failed at 0:25`)).toBe(true);
    expect(code).toContain("from livekit.agents import AgentSession, ChatContext, inference");
    expect(code).toContain('inference.LLM(model="openai/gpt-4.1") as llm');
    expect(code).toContain("async def test_stadtwerke_muster_zahlerstand_tool_failed_at_0_25() -> None:");
  });

  it("gives the model the history as it was, and what the caller said", () => {
    expect(code).toContain("history = ChatContext()");
    expect(code).toMatch(/history\.add_message\(role="assistant", content="Guten Tag/);
    expect(code).toContain('result = await session.run(user_input="Vier sieben eins null acht drei.")');
  });

  it("asserts what text mode can, and lists what needs audio", () => {
    expect(code).toContain(
      'result.expect.contains_function_call(name="crm.lookup_customer", arguments={"customer_id": "471083"})',
    );
    expect(code).toContain(`.judge(llm, intent="Doesn't ask again for what the caller already gave")`);
    expect(code).toContain("#   Hears “Vier sieben eins null acht drei.” (needs audio)");
    expect(code).toContain("#   Transcribes every word with confidence (needs audio)");
  });

  it("writes Python literals", () => {
    expect(py({ a: [1, true, null], b: 'x"y' })).toBe('{"a": [1, True, None], "b": "x\\"y"}');
  });
});

describe("saved tests", () => {
  afterEach(() => localStorage.clear());

  it("save newest first, delete, and come back where they were", () => {
    const a = saveTest(test, new Date("2026-09-26T10:00:00Z"));
    const b = saveTest({ ...test, name: "second" }, new Date("2026-09-26T11:00:00Z"));
    expect(savedTests.get().map((s) => s.id)).toEqual([b.id, a.id]);
    const removed = deleteTest(b.id)!;
    expect(savedTests.get().map((s) => s.id)).toEqual([a.id]);
    restoreTest(removed);
    expect(savedTests.get().map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it("name their files in plain ASCII", () => {
    expect(fileName(test)).toBe("stadtwerke-muster-zahlerstand-tool-failed-at-0-25.test.json");
  });
});
