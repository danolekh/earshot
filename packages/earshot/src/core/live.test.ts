import { describe, expect, it, vi } from "vitest";

import { createLiveConversation } from "./live";

describe("createLiveConversation", () => {
  it("streams text into a turn, then closes it, notifying each time", () => {
    const live = createLiveConversation();
    const listener = vi.fn<() => void>();
    live.subscribe(listener);
    const id = live.begin("agent", 1);
    live.appendText(id, "Hello");
    live.appendText(id, ", how");
    live.appendText(id, "can I help?");
    expect(live.get().turns[0]).toMatchObject({ text: "Hello, how can I help?", final: false });
    live.finalize(id, 2.5);
    expect(live.get().turns[0]).toMatchObject({ end: 2.5, final: true });
    expect(live.get().duration).toBe(2.5);
    expect(listener).toHaveBeenCalledTimes(5);
  });

  it("keeps the words after a barge-in as unspoken", () => {
    const live = createLiveConversation();
    const id = live.begin("agent", 0);
    live.appendWords(id, [
      { text: "Let", start: 0, end: 0.2 },
      { text: "me", start: 0.25, end: 0.4 },
      { text: "check.", start: 0.45, end: 0.9 },
    ]);
    live.truncate(id, 0.3);
    const turn = live.get().turns[0]!;
    expect(turn).toMatchObject({ interruptedAt: 0.3, end: 0.3, text: "Let me check." });
    expect(turn.words).toHaveLength(3);
  });

  it("grows its duration with the clock, and adds events", () => {
    const live = createLiveConversation();
    live.setNow(4);
    live.addEvent({ type: "intent", label: "order_status", at: 3 });
    expect(live.get()).toMatchObject({ duration: 4, events: [{ type: "intent", id: "live-0" }] });
  });
});

describe("clear", () => {
  it("starts a live conversation over", () => {
    const live = createLiveConversation();
    live.begin("user", 0);
    live.setNow(3);
    live.clear();
    expect(live.get()).toEqual({ duration: 0, turns: [], events: [] });
  });
});
