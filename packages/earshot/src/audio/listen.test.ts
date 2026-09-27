import { describe, expect, it } from "vitest";

import { audible, createListening, gainsFor, toggleMute, toggleSolo } from "./listen";

describe("listening", () => {
  it("mutes and solos per side, solo winning", () => {
    let l = toggleMute({ muted: [], soloed: [] }, "user");
    expect(audible(l, "user")).toBe(false);
    expect(gainsFor(l, ["user", "agent"])).toEqual([0, 1]);
    l = toggleSolo(l, "user");
    expect([audible(l, "user"), audible(l, "agent")]).toEqual([true, false]);
    expect(gainsFor(l, ["user", "agent"])).toEqual([1, 0]);
    expect(gainsFor(l, [null, "agent"])).toEqual([1, 0]);
  });

  it("tells its listeners at once, and only on a change", () => {
    const store = createListening();
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.get().muted.join()));
    const next = toggleMute(store.get(), "agent");
    store.set(next);
    store.set(next);
    expect(seen).toEqual(["agent"]);
  });
});
