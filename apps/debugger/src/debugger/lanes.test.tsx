import { Player } from "@danolekh/earshot/player";
import { createViewport } from "@danolekh/earshot/timeline";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { demo } from "@/calls/demo";
import { prepare } from "@/lib/prepare";

import { LANES, type LaneDef, Lanes } from "./lanes";

afterEach(cleanup);

const prepared = prepare(demo);
/** The lanes the demo call (stereo) has. */
const STEREO = LANES.filter((l) => l.available?.(prepared) ?? true);

function renderLanes(lanes?: readonly LaneDef[]) {
  const { container } = render(
    <Player.Root conversation={prepared.conversation} src={[]}>
      <Lanes
        prepared={prepared}
        viewport={createViewport(demo.call.duration)}
        follow={false}
        lanes={lanes ?? STEREO}
        all={STEREO}
      />
    </Player.Root>,
  );
  const ids = (selector: string) =>
    [...container.querySelectorAll<HTMLElement>(`${selector} [data-lane]`)].map((el) => el.dataset.lane);
  return { gutter: ids(".gutter"), lanes: ids("[data-slot=timeline]") };
}

describe("lanes", () => {
  it("labels every lane the call has in the gutter, in the registry's order", () => {
    const { gutter, lanes } = renderLanes();
    expect(gutter).toEqual(STEREO.map((l) => l.id));
    expect(gutter).not.toContain("call");
    expect(lanes).toEqual(gutter);
  });

  it("draws only the lanes it's given, so hiding a lane is a filter", () => {
    const { gutter, lanes } = renderLanes(STEREO.filter((l) => l.kind !== "words"));
    expect(gutter).toEqual(["findings", "caller", "turns", "agent", "spans", "context"]);
    expect(lanes).toEqual(gutter);
  });
});
