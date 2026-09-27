import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import schema from "../../schema/call-trace.v1.schema.json";
import { fromLiveKit } from "../formats/livekit";
import { T0_MS, livekitTwoTurns } from "../test/trace-fixtures";
import { createTrace } from "./trace";

const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
const asJson = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("call-trace.v1 schema", () => {
  it("accepts a trace read from LiveKit spans", () => {
    const trace = fromLiveKit({ otlp: livekitTwoTurns, recording: { startedAtUnixMs: T0_MS } });
    validate(asJson(trace));
    expect(validate.errors ?? []).toEqual([]);
  });

  it("accepts findings and rejects what isn't in the model", () => {
    const trace = createTrace({
      call: { id: "c", synthetic: true },
      clock: { t0UnixMs: 0, channels: ["caller", "agent"] },
      turns: [{ channel: "caller", start: 0, end: 1, text: "Hallo" }],
      findings: [
        {
          id: "slow_turn:t1",
          type: "slow_turn",
          start: 1,
          end: 4.1,
          severity: "error",
          detector: { id: "slow_turn", version: 1 },
          message: "The caller waited 3.10 s",
          evidence: ["t0", "t1"],
          measured: { gap: 3.1, threshold: 1.5 },
        },
      ],
    });
    validate(asJson(trace));
    expect(validate.errors ?? []).toEqual([]);
    expect(validate({ ...asJson(trace), markers: [] })).toBe(false);
  });
});
