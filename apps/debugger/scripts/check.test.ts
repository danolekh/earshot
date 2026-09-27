import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { type CallTrace, draftTestCase } from "@danolekh/earshot/trace";
import { describe, expect, it } from "vitest";

// Vitest runs in the app's directory.
const script = resolve("scripts/check.ts");
const trace = (id: string) => resolve(`src/calls/${id}.trace.json`);
const check = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });

const dir = mkdtempSync(join(tmpdir(), "earshot-check-"));
const demo = (await import("../src/calls/stadtwerke-zaehlerstand.trace.json"))
  .default as unknown as CallTrace;
const f = demo.findings.find((x) => x.type === "tool_error")!;
const testFile = join(dir, "tool-error.test.json");
writeFileSync(testFile, JSON.stringify(draftTestCase(demo, f.turnId!, f.id)));

describe("the check CLI", () => {
  it("fails on the call the test came from, and passes on the fixed one", () => {
    const r = check(testFile, trace("stadtwerke-zaehlerstand"), trace("stadtwerke-zaehlerstand-v43"));
    expect(r.stderr).toBe("");
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(
      "stadtwerke-zaehlerstand (stadtwerke-outbound v42), drafted here: 4 of 4 fail",
    );
    expect(r.stdout).toContain("stadtwerke-zaehlerstand-v43 (stadtwerke-outbound v43): All pass");
    expect(r.stdout).toMatch(/✗ crm\.lookup_customer succeeds +404: no contract/);
    expect(r.stdout).toMatch(
      /✓ Hears “Vier sieben eins null acht drei\.” +every word heard \(caller at 0:14\)/,
    );
  });

  it("passes when every call passes", () => {
    const r = check(testFile, trace("stadtwerke-zaehlerstand-v43"));
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it("reads a stack's export as the import does, and can't check what it didn't record", () => {
    const fixture = (name: string) => resolve(`../../calls/fixtures/stadtwerke-zaehlerstand-pipecat/${name}`);
    const r = check(testFile, `${fixture("otlp.json")}+${fixture("events.jsonl")}`);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/: 3 of 4 fail/);
    expect(r.stdout).toMatch(/— Transcribes every word with confidence +no confidence from the recogniser/);
    expect(r.stderr).toContain("No recording");
  });

  it("says what's wrong with a file that isn't a test", () => {
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ version: 1, name: "x", checks: [{ kind: "vibes" }] }));
    const r = check(bad, trace("stadtwerke-zaehlerstand-v43"));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("isn't a call-test.v1 file");
    expect(check().status).toBe(2);
  });
});
