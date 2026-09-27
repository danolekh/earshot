import { describe, expect, it } from "vitest";

import { computeMinMax } from "../core/pyramid";
import type { CallPart, ClockAnchor, Source, TurnDraft } from "./read";
import { readCall } from "./read";
import { callMeta, recording, timedWords } from "./sources";

const S = 1_000_000_000n;
const T0 = 1_790_000_000n * S;

/** A source that gives these parts, with these anchors. */
const source = (name: string, part: CallPart, anchors: ClockAnchor[] = []): Source => ({
  name,
  anchors,
  read: () => part,
});

const turn = (
  key: string,
  channel: "caller" | "agent",
  start: number,
  end: number,
  text: string,
): TurnDraft => ({
  key,
  channel,
  start,
  end,
  text,
});

const exchange = [
  turn("a", "caller", 1, 2, "Hallo da"),
  turn("b", "agent", 2.5, 4, "Guten Tag, wie geht's?"),
];

describe("time 0", () => {
  it("is the surest anchor: the recording's start over a session's, whatever the order", () => {
    const provider = source("p", { turns: exchange }, [
      { unixNs: T0 + 5n * S, rank: "session" },
      { unixNs: T0, rank: "first" },
    ]);
    const trace = readCall(provider, recording({ startedAtUnixMs: Number((T0 + 2n * S) / 1_000_000n) }));
    expect(trace.clock.t0UnixMs).toBe(Number((T0 + 2n * S) / 1_000_000n));
    expect(trace.call.startedAt).toBe(new Date(trace.clock.t0UnixMs).toISOString());
    expect(readCall(provider).clock.t0UnixMs).toBe(Number((T0 + 5n * S) / 1_000_000n));
  });

  it("puts every source's times on it", () => {
    const seen: number[] = [];
    const at: Source = {
      name: "p",
      anchors: [{ unixNs: T0, rank: "session" }],
      read: (ctx) => {
        seen.push(
          ctx.fromUnixNs(T0 + 1_500_000_000n),
          ctx.fromUnixSeconds(1_790_000_002.25),
          ctx.fromUnixMs(1_790_000_003_000),
        );
        return { turns: exchange };
      },
    };
    readCall(at);
    expect(seen).toEqual([1.5, 2.25, 3]);
  });
});

describe("merging sources", () => {
  it("takes call details from the last source to give them, versions per key", () => {
    const trace = readCall(
      source("p", { turns: exchange, call: { id: "x", title: "old", versions: { sdk: "1", agent: "v1" } } }),
      callMeta({ title: "Zählerstand", versions: { agent: "v2" } }),
    );
    expect(trace.call).toMatchObject({ id: "x", title: "Zählerstand", versions: { sdk: "1", agent: "v2" } });
  });

  it("takes the turns from exactly one source", () => {
    expect(() => readCall(source("a", { turns: exchange }), source("b", { turns: exchange }))).toThrow(
      /both a and b/,
    );
  });

  it("replaces words of the same channel and source, and keeps the rest", () => {
    const w = (text: string, kind: "aligned" | "streaming_asr", start: number) => ({
      text,
      channel: "caller" as const,
      source: kind,
      start,
      end: start + 0.3,
    });
    const trace = readCall(
      source("p", { turns: exchange, words: [w("Halo", "streaming_asr", 1), w("da", "streaming_asr", 1.5)] }),
      timedWords([w("Hallo", "aligned", 1), w("da", "aligned", 1.5)]),
      timedWords([w("Hallo", "streaming_asr", 1.05)]),
    );
    const caller = (s: string) => trace.words.filter((x) => x.channel === "caller" && x.source === s);
    expect(caller("aligned").map((x) => x.text)).toEqual(["Hallo", "da"]);
    expect(caller("streaming_asr").map((x) => x.text)).toEqual(["Hallo"]);
    expect(caller("aligned").every((x) => x.turnId === "t0")).toBe(true);
  });

  it("finds speech in the recording's waveform when it isn't given", () => {
    const rate = 8000;
    const samples = Float32Array.from({ length: 4 * rate }, (_, i) =>
      i >= rate && i < 2 * rate ? 0.5 * Math.sin(i / 3) : 0.001 * Math.sin(i),
    );
    const level = computeMinMax(samples, rate, 200);
    const trace = readCall(source("p", { turns: exchange }), recording({ peaks: { caller: level } }));
    expect(trace.speech?.caller).toEqual([{ start: 1, end: 2 }]);
    expect(trace.audio?.peaks?.caller).toBeDefined();
  });
});

describe("what readCall derives", () => {
  it("answers each reply with the last caller turn done by then, unless the source says", () => {
    expect(readCall(source("p", { turns: exchange })).turns[1]!.replyTo).toBe("t0");
    const early = [turn("z", "caller", 0, 0.5, "Ja"), ...exchange];
    const said = [...early.slice(0, 2), { ...early[2]!, replyTo: "z" }];
    expect(readCall(source("p", { turns: said })).turns[2]!.replyTo).toBe("t0");
  });

  it("turns keys into ids, and drops what points at no turn", () => {
    const trace = readCall(
      source("p", {
        turns: exchange,
        spans: [
          { name: "llm", kind: "llm", start: 2, end: 2.4, attributes: {}, turnKey: "b" },
          { name: "orphan", kind: "other", start: 0, end: 1, attributes: {}, turnKey: "gone" },
        ],
      }),
    );
    expect(trace.spans.map((s) => [s.name, s.turnId])).toEqual([
      ["orphan", undefined],
      ["llm", "t1"],
    ]);
  });

  it("marks an interruption for a reply cut off, unless the source already did", () => {
    const cut = [
      turn("a", "caller", 1, 2, "Hallo"),
      {
        ...turn("b", "agent", 2.5, 3.5, "Guten Tag, ich rufe an wegen Ihres Zählers"),
        interrupted: { at: 3.5 },
      },
      turn("c", "caller", 3.2, 4, "Moment bitte"),
    ];
    const derived = readCall(source("p", { turns: cut })).signals.filter((s) => s.type === "interruption");
    expect(derived).toMatchObject([{ at: 3.2, turnId: "t1", data: { decision: "stop", stopAfter: 0.3 } }]);
    const given = readCall(
      source("p", {
        turns: cut,
        signals: [
          { type: "interruption", at: 3.25, channel: "caller", turnKey: "b", data: { decision: "stop" } },
        ],
      }),
    ).signals.filter((s) => s.type === "interruption");
    expect(given.map((s) => s.at)).toEqual([3.25]);
  });

  it("spreads words over turns no source timed, and only those channels", () => {
    const trace = readCall(
      source("p", { turns: exchange }),
      timedWords([{ text: "Guten", channel: "agent", source: "tts", start: 2.5, end: 2.9 }]),
    );
    expect(trace.words.filter((w) => w.channel === "caller").every((w) => w.estimated)).toBe(true);
    expect(trace.words.filter((w) => w.channel === "agent").map((w) => w.text)).toEqual(["Guten"]);
  });

  it("moves guessed edges onto the turn's words", () => {
    const guessed = [
      { ...turn("a", "caller", 1, 4, "vier sieben"), estimated: ["start", "end"] as const },
      turn("b", "agent", 4.5, 5, "Danke"),
    ];
    const trace = readCall(
      source("p", { turns: guessed }),
      timedWords([
        { text: "vier", channel: "caller", source: "aligned", start: 1.4, end: 1.8 },
        { text: "sieben", channel: "caller", source: "aligned", start: 1.9, end: 2.35 },
      ]),
    );
    expect(trace.turns[0]).toMatchObject({ start: 1.4, end: 2.35 });
    expect(trace.turns[0]!.estimated).toBeUndefined();
  });

  it("else onto the speech of its channel, and says when an edge is still a guess", () => {
    const guessed = [
      { ...turn("a", "caller", 1, 4, "vier sieben"), estimated: ["end"] as const },
      { ...turn("b", "agent", 5, 6, "Danke"), estimated: ["start"] as const },
    ];
    const trace = readCall(source("p", { turns: guessed, speech: { caller: [{ start: 1.02, end: 2.6 }] } }));
    expect(trace.turns[0]).toMatchObject({ start: 1, end: 2.6 });
    expect(trace.turns[0]!.estimated).toBeUndefined();
    expect(trace.turns[1]!.estimated).toBe(true);
  });

  it("gives findings ids and evidence", () => {
    const trace = readCall(
      source("p", {
        turns: exchange,
        findings: [
          {
            type: "human_feedback",
            start: 3,
            end: 3,
            severity: "warning",
            detector: { id: "human_feedback", version: 1 },
            message: "Disliked",
            turnKey: "b",
          },
        ],
      }),
    );
    expect(trace.findings[0]).toMatchObject({ id: "human_feedback:t1", turnId: "t1", evidence: ["t1"] });
  });
});
