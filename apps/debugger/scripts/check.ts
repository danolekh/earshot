/* Runs a saved test case on calls, for CI: each check on each call, found by what the caller said
 * there, and a table of what passed. Exits 1 when any check fails, 2 when the input doesn't read.
 *
 *   node apps/debugger/scripts/check.ts <test.json> <call…>
 *
 * The test is a file exported from the debugger (Export → Download .json, schema call-test.v1).
 * Each call is earshot's CallTrace JSON (call-trace.v1), or what a stack exported, read as the
 * debugger's import reads it: LiveKit's spans, Pipecat's spans, an ElevenLabs conversation. Join a
 * call's files with `+` (`otlp.json+events.jsonl`, `otlp.json+session-report.json`). A check it
 * can't make on a call (no turn like it there, or data the stack didn't record) shows —, and
 * doesn't fail. */
import { readFileSync } from "node:fs";

import { formatTime } from "@danolekh/earshot/core";
import { detectFormat, parseExport, readExports } from "@danolekh/earshot/formats";
import testSchema from "@danolekh/earshot/schema/call-test.v1.json" with { type: "json" };
import {
  type CallTrace,
  type CheckResult,
  describeCheck,
  runTestCase,
  summarizeRun,
  type TestCase,
} from "@danolekh/earshot/trace";
import Ajv2020 from "ajv/dist/2020.js";

const MARK = { pass: "✓", fail: "✗", missing: "—" } as const;

function usage(message: string): never {
  console.error(
    `${message}\n\nusage: node scripts/check.ts <test.json> <call…>  (a call: trace.json, or a+b of an export)`,
  );
  process.exit(2);
}

function read(path: string): unknown {
  try {
    return parseExport(readFileSync(path, "utf8"));
  } catch (e) {
    return usage(`can't read ${path}: ${(e as Error).message}`);
  }
}

/** A call from its files: a trace as it is, or a stack's export read into one. */
function callFrom(arg: string): CallTrace {
  const values = arg.split("+").map(read);
  if (values.length === 1 && detectFormat(values[0]) === "call-trace") return values[0] as CallTrace;
  try {
    const { trace, warnings } = readExports(values, { call: { id: arg } });
    for (const w of warnings) console.error(`${arg}: ${w}`);
    return trace;
  } catch (e) {
    return usage(`${arg} isn't a call: ${(e as Error).message}`);
  }
}

function where(trace: CallTrace, r: CheckResult): string {
  if (r.status === "missing") return "";
  const turn = r.turn ? trace.turns.find((t) => t.id === r.turn) : undefined;
  return turn ? ` (${turn.channel} at ${formatTime(turn.start)})` : " (whole call)";
}

const [testPath, ...tracePaths] = process.argv.slice(2);
if (!testPath || !tracePaths.length) usage("a test and at least one call, please");

const validate = new Ajv2020({ allErrors: true }).compile<TestCase>(testSchema);
const test = read(testPath);
if (!validate(test))
  usage(
    `${testPath} isn't a call-test.v1 file:\n${validate.errors?.map((e) => `  ${e.instancePath || "/"} ${e.message}`).join("\n")}`,
  );

console.log(`${test.name}\n`);
let failed = 0;
for (const path of tracePaths) {
  const trace = callFrom(path);
  const results = runTestCase(trace, test);
  failed += results.filter((r) => r.status === "fail").length;
  const agent = trace.call.versions?.agent;
  const summary = summarizeRun(results).text;
  console.log(
    `${trace.call.id}${agent ? ` (${agent})` : ""}${trace.call.id === test.source.callId ? ", drafted here" : ""}: ${summary}`,
  );
  const width = Math.max(...results.map((r) => describeCheck(r.check).length));
  for (const r of results)
    console.log(
      `  ${MARK[r.status]} ${describeCheck(r.check).padEnd(width)}  ${r.measured}${where(trace, r)}`,
    );
  console.log();
}
process.exit(failed ? 1 : 0);
