import { describe, expect, it } from "vitest";

import { createConversation } from "../core/conversation";
import { perceivedLevel } from "./level";
import { scriptedSource } from "./source";

describe("perceivedLevel", () => {
  it("maps speech loudness onto 0 to 1 the way the ear hears it, and gates silence", () => {
    expect(perceivedLevel(10 ** (-70 / 20))).toBe(0);
    expect(perceivedLevel(10 ** (-12 / 20))).toBeCloseTo(1);
    const mid = perceivedLevel(10 ** (-36 / 20));
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(0.75);
  });
});

describe("scriptedSource", () => {
  const call = createConversation({
    turns: [
      { role: "agent", words: [{ text: "Hi", start: 1, end: 1.4 }] },
      { role: "user", words: [{ text: "Yo", start: 2, end: 2.4 }] },
    ],
  });

  it("swells over each word of its role and is silent elsewhere, the same every time", () => {
    let t = 1.2;
    const agent = scriptedSource(call, { time: () => t }, "agent");
    const a = agent.level();
    expect(a).toBeGreaterThan(0.2);
    expect(agent.level()).toBe(a);
    t = 1.7;
    expect(agent.level()).toBe(0);
    t = 2.2;
    expect(agent.level()).toBe(0);
    expect(scriptedSource(call, { time: () => t }, "user").level()).toBeGreaterThan(0.2);
  });
});
