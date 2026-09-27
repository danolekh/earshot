/* The last steps of building a call, once its trace is read and the recording's analysis merged:
 * the clock's tolerance, each reply's wait as measured on the recording, what each reply ran on,
 * and the detectors. Pure, so the golden test can replay a call without its audio. */
import { type CallTrace, detect, latencyBreakdown } from "@danolekh/earshot/trace";

const round = (v: number) => Math.round(v * 1000) / 1000;

export function finish(trace: CallTrace, context: Readonly<Record<string, string>>): CallTrace {
  return detect({
    ...trace,
    clock: { ...trace.clock, tolerance: 0.1 },
    turns: trace.turns.map((t) => {
      const b = latencyBreakdown(trace, t.id);
      const withContext = t.channel === "agent" ? { ...t, context: { ...context, ...t.context } } : t;
      return b ? { ...withContext, latency: { ...t.latency, waveformGap: round(b.measured) } } : withContext;
    }),
  });
}
