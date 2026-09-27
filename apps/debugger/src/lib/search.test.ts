import { describe, expect, it } from "vitest";

import { parseDebugSearch } from "./search";

describe("parseDebugSearch", () => {
  it("keeps a moment worth sharing", () => {
    expect(parseDebugSearch({ t: "16.384", from: 16.16, to: "19.27", finding: "early_endpoint:t3" })).toEqual(
      {
        t: 16.38,
        from: 16.16,
        to: 19.27,
        finding: "early_endpoint:t3",
      },
    );
  });

  it("keeps hidden lanes as a list of ids", () => {
    expect(parseDebugSearch({ hide: "heard,said,<b>" })).toEqual({ hide: "heard,said" });
    expect(parseDebugSearch({ hide: ",,," })).toEqual({});
  });

  it("drops what doesn't parse", () => {
    expect(parseDebugSearch({ t: "-1", from: 5, to: 2, turn: "<script>", span: 7 })).toEqual({});
  });
});
