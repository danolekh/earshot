import { describe, expect, it } from "vitest";

import { livekitTwoTurns, otlpSpan } from "../test/trace-fixtures";
import { detectFormat, parseExport, readExports } from "./detect";

const pipecatOtlp = {
  resourceSpans: [
    {
      scopeSpans: [
        {
          scope: { name: "pipecat.turn" },
          spans: [otlpSpan("c", "conversation", 0, 5), otlpSpan("t", "turn", 0, 5, { parent: "c" })],
        },
        {
          scope: { name: "pipecat" },
          spans: [
            otlpSpan("u", "stt", 0.2, 1.4, {
              parent: "t",
              attrs: { transcript: "Hallo", "metrics.ttfb": 0.2 },
            }),
            otlpSpan("l", "llm", 1.5, 2, {
              parent: "t",
              attrs: { "metrics.ttfb": 0.3, output: "Guten Tag" },
            }),
            otlpSpan("s", "tts", 1.8, 3, { parent: "t", attrs: { text: "Guten Tag", "metrics.ttfb": 0.2 } }),
          ],
        },
      ],
    },
  ],
};
const conversation = {
  conversation_id: "c1",
  metadata: { start_time_unix_secs: 1_790_000_000 },
  transcript: [
    { role: "agent", message: "Hallo", time_in_call_secs: 0 },
    { role: "user", message: "Ja", time_in_call_secs: 2 },
  ],
};

describe("recognising an export", () => {
  it("by its shape", () => {
    expect(detectFormat(livekitTwoTurns)).toBe("livekit-otlp");
    expect(detectFormat({ room: "r", events: [] })).toBe("livekit-report");
    expect(detectFormat(pipecatOtlp)).toBe("pipecat-otlp");
    expect(detectFormat([{ kind: "user_speech_started", timestamp: 1 }])).toBe("pipecat-events");
    expect(detectFormat(conversation)).toBe("elevenlabs-conversation");
    expect(detectFormat({ type: "post_call_transcription", data: conversation })).toBe(
      "elevenlabs-conversation",
    );
    expect(
      detectFormat({ resourceSpans: [{ scopeSpans: [{ scope: { name: "elevenlabs.convai" } }] }] }),
    ).toBe("elevenlabs-otlp");
    expect(detectFormat({ hello: "world" })).toBeUndefined();
  });

  it("reads JSON Lines as a list", () => {
    expect(
      parseExport('{"kind":"interruption","timestamp":1}\n{"kind":"bot_speech_stopped","timestamp":2}\n'),
    ).toEqual([
      { kind: "interruption", timestamp: 1 },
      { kind: "bot_speech_stopped", timestamp: 2 },
    ]);
  });
});

describe("a call from exported files", () => {
  it("from any stack, with its findings and what had to be assumed", () => {
    const lk = readExports([livekitTwoTurns]);
    expect(lk.provider).toBe("livekit");
    expect(lk.trace.call.provider).toBe("livekit");
    expect(lk.trace.findings.length).toBeGreaterThan(0);
    expect(lk.warnings).toEqual([
      "No session report: consent, disclosure and agent states aren't known",
      "No recording: the waveform lanes are empty, and turns are placed from the export",
    ]);
    const pc = readExports([pipecatOtlp, { hello: 1 }]);
    expect(pc.provider).toBe("pipecat");
    expect(pc.trace.turns.map((t) => t.channel)).toEqual(["caller", "agent"]);
    expect(pc.warnings[0]).toBe("1 file isn't an export earshot reads");
    const el = readExports([conversation], {
      recording: { sources: [{ src: "a.mp3", type: "audio/mpeg" }] },
    });
    expect(el.trace.clock.channels).toEqual(["mixed"]);
    expect(el.warnings).toEqual(["The recording is assumed to start with the call, both sides mixed"]);
  });

  it("says why when the files aren't a call", () => {
    expect(() => readExports([{ hello: 1 }])).toThrow(/No call in these files/);
    expect(() =>
      readExports([{ resourceSpans: [{ scopeSpans: [{ scope: { name: "elevenlabs.convai" } }] }] }]),
    ).toThrow(/conversation JSON/);
  });
});
