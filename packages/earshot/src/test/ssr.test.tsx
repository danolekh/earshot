// @vitest-environment node
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { FindingList, HeardVsSaid, Latency } from "../inspector";
import { Player } from "../player";
import { createSelection } from "../player/selection";
import { Timeline } from "../timeline";
import { detect } from "../trace/detectors";
import { heardDiff } from "../trace/diff";
import { latencyBreakdown } from "../trace/latency";
import { toConversation } from "../trace/trace";
import { Transcript } from "../transcript";
import { call } from "./fixtures";
import { traceBuilder } from "./trace-fixtures";

describe("server rendering", () => {
  it("renders the transcript and timeline without a DOM", () => {
    const html = renderToString(
      <Player.Root conversation={call} src="/call.mp3">
        <Timeline.Root>
          <Timeline.Scrubber>
            <Timeline.Waveform />
            <Timeline.Lane speaker="user">
              <Timeline.Segments />
            </Timeline.Lane>
            <Timeline.Playhead />
          </Timeline.Scrubber>
        </Timeline.Root>
        <Transcript.Root>
          <Transcript.Turns />
        </Transcript.Root>
      </Player.Root>,
    );
    expect(html).toContain('role="slider"');
    expect(html).toContain('data-status="unspoken"');
    expect(html).toContain("<audio");
    expect(html).toContain("Anna");
  });

  it("renders the inspector parts, nothing picked until hydrated", () => {
    const trace = detect(
      traceBuilder({ id: "c" })
        .caller("t0", 0, 2, "vier sieben eins acht")
        .words("t0", "aligned", "vier sieben eins null acht", 0, 2)
        .words("t0", "streaming_asr", "vier sieben eins acht", 0, 2)
        .agent("t1", 4, 5, "Leider nicht gefunden", { replyTo: "t0" })
        .speech("caller", [{ start: 0, end: 2 }])
        .build(),
    );
    const selection = createSelection();
    selection.set({ findingId: trace.findings[0]!.id });
    const html = renderToString(
      <Player.Root conversation={toConversation(trace)} selection={selection}>
        <FindingList.Root findings={trace.findings} />
        <Latency.Root breakdown={latencyBreakdown(trace, "t1")!}>
          <Latency.Bar />
          <Latency.Stages />
          <Latency.Caption />
        </Latency.Root>
        <HeardVsSaid.Root diff={heardDiff(trace, "t0")!}>
          <HeardVsSaid.Words source="heard" />
        </HeardVsSaid.Root>
      </Player.Root>,
    );
    expect(html).toContain('data-slot="finding-list-item"');
    expect(html).not.toContain("aria-current");
    expect(html).toContain('data-kind="unexplained"');
    expect(html).toContain("not heard");
  });
});
