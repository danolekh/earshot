import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Decisions, FindingList, HeardVsSaid, Latency, Prompt, ToolCall } from "../inspector";
import { Player } from "../player";
import { createSelection } from "../player/selection";
import { detect } from "../trace/detectors";
import { heardDiff } from "../trace/diff";
import type { LatencyBreakdown } from "../trace/latency";
import { latencyBreakdown } from "../trace/latency";
import { modelInput } from "../trace/model-input";
import { decisionsOf, toConversation, toolsOf } from "../trace/trace";
import { manualClock } from "./fixtures";
import { traceBuilder } from "./trace-fixtures";

afterEach(cleanup);

// The caller reads a number and "null" is lost; the agent's lookup fails and it answers slowly.
const trace = detect(
  traceBuilder({ id: "c" })
    .caller("t0", 0, 2, "vier sieben eins acht")
    .words("t0", "aligned", "vier sieben eins null acht", 0, 2)
    .words("t0", "streaming_asr", "vier sieben eins acht", 0, 2, [{}, {}, {}, { confidence: 0.4 }])
    .agent("t1", 4, 5, "Leider nicht gefunden", { replyTo: "t0" })
    .span({
      name: "crm.lookup",
      kind: "tool",
      start: 2.5,
      end: 3.2,
      turnId: "t1",
      attributes: {},
      status: { code: "error", message: "404" },
      tool: { name: "crm.lookup", arguments: { meter: "4718", deep: { a: 1 } }, result: "not found" },
    })
    .span({
      name: "llm_request",
      kind: "llm",
      start: 3.2,
      end: 3.8,
      turnId: "t1",
      attributes: {},
      llm: {
        messages: [
          { role: "system", content: "Du bist der Kundendienst." },
          { role: "user", content: "vier sieben eins acht" },
          {
            role: "assistant",
            content: "",
            toolCalls: [{ name: "crm.lookup", arguments: { meter: "4718" } }],
          },
        ],
      },
    })
    .span({
      name: "llm_request",
      kind: "llm",
      start: 1,
      end: 1.2,
      attributes: {},
      llm: { messages: [{ role: "system", content: "Du bist der Kundendienst." }] },
    })
    .signal({
      type: "eou_decision",
      at: 2.35,
      channel: "caller",
      turnId: "t0",
      data: { outcome: "committed", wait: 0.35, probability: 0.91 },
    })
    .speech("caller", [{ start: 0, end: 2 }])
    .build(),
);

const slots = (el: ParentNode, slot: string) => [...el.querySelectorAll<HTMLElement>(`[data-slot=${slot}]`)];

describe("Latency", () => {
  it("draws the wait as a bar and says it in rows, the unexplained time last", () => {
    const b = latencyBreakdown(trace, "t1")!;
    const { container } = render(
      <Latency.Root breakdown={b}>
        <Latency.Bar />
        <Latency.Stages />
        <Latency.Caption />
      </Latency.Root>,
    );
    expect(container.querySelector("figure")?.getAttribute("data-slot")).toBe("latency");
    expect(slots(container, "latency-bar")[0]!.getAttribute("aria-hidden")).toBe("true");
    const stages = slots(container, "latency-stage");
    expect(stages.length).toBe(slots(container, "latency-segment").length);
    expect(stages.at(-1)!.getAttribute("data-kind")).toBe("unexplained");
    expect(stages.map((s) => s.textContent)).toContain("crm.lookup: 700 ms");
    const tool = slots(container, "latency-segment").find((s) => s.getAttribute("data-kind") === "tool")!;
    expect(Number(tool.style.getPropertyValue("--stage-start"))).toBeCloseTo(0.25);
    expect(Number(tool.style.getPropertyValue("--stage-size"))).toBeCloseTo(0.35);
    // Nothing reported: the caption has nothing to say.
    expect(slots(container, "latency-caption")[0]!.hasAttribute("hidden")).toBe(true);
  });

  it("marks stages placed from reported lengths, and says so once", () => {
    const b: LatencyBreakdown = {
      turnId: "t1",
      replyTo: "t0",
      anchor: 2,
      start: 3,
      measured: 1,
      reported: 0.9,
      stages: [{ kind: "llm", label: "gpt-4.1", start: 2, end: 2.6, reported: true }],
      accounted: 0.6,
      unexplained: 0.4,
    };
    const { container } = render(
      <Latency.Root breakdown={b}>
        <Latency.Stages />
        <Latency.Caption />
      </Latency.Root>,
    );
    expect(container.querySelector("figure")!.hasAttribute("data-reported")).toBe(true);
    expect(slots(container, "latency-stage")[0]!.textContent).toBe("gpt-4.1 (reported): 600 ms");
    expect(container.querySelectorAll("figcaption")).toHaveLength(1);
    expect(container.querySelector("figcaption")!.textContent).toBe(
      "Measured on the recording; the pipeline reported 0.90 s. The stack reported how long these took, not when: they're laid end to end from the caller's last word.",
    );
  });

  it("throws outside its root, naming the part", () => {
    const row = { kind: "llm" as const, label: "x", start: 0, end: 1 };
    expect(() => render(<Latency.Stage row={row} />)).toThrow(
      "earshot: <Latency.Stage> must be inside <Latency.Root>.",
    );
  });
});

describe("HeardVsSaid", () => {
  it("lines up what was said with what was heard, a gap read as not heard", () => {
    const { container } = render(
      <HeardVsSaid.Root diff={heardDiff(trace, "t0")!}>
        <HeardVsSaid.Words source="said" />
        <HeardVsSaid.Words source="heard" />
      </HeardVsSaid.Root>,
    );
    const root = slots(container, "heard-vs-said")[0]!;
    expect(root.hasAttribute("data-missed")).toBe(true);
    expect(root.hasAttribute("data-unsure")).toBe(true);
    const [said, heard] = slots(container, "heard-vs-said-words");
    expect(said!.getAttribute("data-source")).toBe("said");
    const words = (line: HTMLElement) => slots(line, "heard-vs-said-word");
    expect(words(said!).map((w) => w.textContent)).toEqual(["vier", "sieben", "eins", "null", "acht"]);
    const gap = words(heard!).find((w) => w.getAttribute("data-op") === "missing")!;
    expect(gap.textContent).toBe("␣not heard");
    expect(gap.querySelector("[aria-hidden]")!.textContent).toBe("␣");
    const unsure = words(heard!).find((w) => w.hasAttribute("data-low"))!;
    expect(unsure.textContent).toBe("acht");
    expect(unsure.getAttribute("title")).toBe("confidence 0.40");
    expect(unsure.style.getPropertyValue("--word-confidence")).toBe("0.4");
  });
});

describe("Decisions, ToolCall and Prompt", () => {
  it("says each turn-detector decision as the timeline does", () => {
    const { container } = render(<Decisions.Root decisions={decisionsOf(trace, "t0")} />);
    const item = slots(container, "decisions-item")[0]!;
    expect(item.textContent).toBe("0:02 · End of turn committed after 350 ms, p = 0.91");
    expect(item.getAttribute("data-outcome")).toBe("committed");
    expect(item.style.getPropertyValue("--eou-probability")).toBe("0.91");
  });

  it("keeps a part's own text when its children come out undefined", () => {
    const decisions = decisionsOf(trace, "t0");
    const { container } = render(
      <Decisions.Root decisions={decisions}>
        {(d) => (
          <Decisions.Item key={d.id} decision={d}>
            {undefined}
          </Decisions.Item>
        )}
      </Decisions.Root>,
    );
    expect(slots(container, "decisions-item")[0]!.textContent).toMatch(/^0:02 · End of turn/);
  });

  it("shows a tool call's status and its fields one level deep", () => {
    const span = toolsOf(trace, "t1")[0]!;
    const { container } = render(
      <ToolCall.Root span={span}>
        <ToolCall.Fields value={span.tool!.arguments} />
        <ToolCall.Fields value={span.tool!.result} />
        <ToolCall.Fields value={span.tool!.arguments} json />
      </ToolCall.Root>,
    );
    expect(slots(container, "tool-call")[0]!.getAttribute("data-status")).toBe("error");
    const [args, result, json] = slots(container, "tool-call-fields");
    expect(args!.tagName).toBe("DL");
    expect([...args!.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["meter", "deep"]);
    expect([...args!.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["4718", '{"a":1}']);
    expect(result!.tagName).toBe("PRE");
    expect(result!.hasAttribute("data-json")).toBe(true);
    expect(json!.textContent).toBe(JSON.stringify(span.tool!.arguments, null, 2));
  });

  it("lists the model's input, marking what's new since the request before", () => {
    const { container } = render(<Prompt.Root input={modelInput(trace, "t1")!} />);
    const messages = slots(container, "prompt-message");
    expect(messages.map((m) => m.getAttribute("data-role"))).toEqual(["system", "user", "assistant"]);
    expect(messages.map((m) => m.hasAttribute("data-fresh"))).toEqual([false, true, true]);
    expect(messages[2]!.textContent).toBe('crm.lookup({"meter":"4718"})');
  });
});

describe("FindingList", () => {
  function List({ selection = createSelection(), clock = manualClock(trace.call.duration) }) {
    return (
      <Player.Root conversation={toConversation(trace)} clock={clock} selection={selection}>
        <FindingList.Root findings={trace.findings} />
      </Player.Root>
    );
  }

  it("picks a finding and its turn, playing from a lead-in before it", () => {
    const selection = createSelection();
    const clock = manualClock(trace.call.duration);
    const { container } = render(<List selection={selection} clock={clock} />);
    const items = slots(container, "finding-list-item");
    expect(items.length).toBe(trace.findings.length);
    const failed = trace.findings.find((f) => f.type === "tool_error")!;
    const item = items.find((i) => i.getAttribute("data-type") === "tool_error")!;
    expect(item.textContent).toBe(failed.message);
    act(() => item.click());
    expect(selection.get()).toMatchObject({ findingId: failed.id, turnId: failed.turnId });
    expect(clock.time()).toBeCloseTo(failed.start - 0.3);
    expect(item.getAttribute("aria-current")).toBe("true");
    expect(item.hasAttribute("data-selected")).toBe(true);
    expect(items.filter((i) => i.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("is one tab stop, the arrows, Home and End moving between findings", () => {
    const { container } = render(<List />);
    const items = slots(container, "finding-list-item");
    expect(items.length).toBeGreaterThan(1);
    expect(items.map((i) => i.tabIndex)).toEqual(items.map((_, i) => (i === 0 ? 0 : -1)));
    act(() => items[0]!.focus());
    fireEvent.keyDown(items[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    expect(items[1]!.tabIndex).toBe(0);
    fireEvent.keyDown(items[1]!, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: "End" });
    expect(document.activeElement).toBe(items.at(-1));
    const up = fireEvent.keyDown(items.at(-1)!, { key: "ArrowUp" });
    expect(up).toBe(false); // handled: the page's own keys leave it alone
    expect(document.activeElement).toBe(items.at(-2));
  });

  it("the picked finding takes the tab stop until another is focused", () => {
    const selection = createSelection();
    const last = trace.findings.at(-1)!;
    selection.set({ findingId: last.id });
    const { container } = render(<List selection={selection} />);
    const items = slots(container, "finding-list-item");
    expect(items.at(-1)!.tabIndex).toBe(0);
    expect(items.filter((i) => i.tabIndex === 0)).toHaveLength(1);
  });
});
