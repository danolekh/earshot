/* What ElevenLabs Agents would have kept of a scripted call: the conversation as its API returns it
 * (`GET /v1/convai/conversations/{id}`): each message with the whole second it started, the tool
 * calls with their results and latency, a few figures per reply, the analysis, and a person's
 * dislike of one reply. No span, no end time, no word timing; the recording is one mixed file.
 * The debugger reads it with the same `fromElevenLabsAgents` a real conversation goes through. */
import type { ElevenLabsConversation, ElevenLabsMessage } from "@danolekh/earshot/formats";

import type { SimInput } from "./livekit-sim.ts";

/** How late the recogniser's final transcript came, as ElevenLabs reports it. */
const ASR_TRAILING = 0.18;

export function simulateElevenLabs(
  input: SimInput & { dislike?: readonly string[] },
): ElevenLabsConversation {
  const { scenario, placed, t0, heard, spoken } = input;
  const byStart = [...placed].sort((a, b) => a.start - b.start);
  const second = (s: number) => Math.floor(s);
  const transcript: ElevenLabsMessage[] = [];
  for (const p of byStart) {
    const line = p.line;
    if (line.channel === "caller") {
      transcript.push({
        role: "user",
        message: heard[line.id]!.text,
        time_in_call_secs: second(p.start),
        source_medium: "audio",
      });
      continue;
    }
    const stages = p.reply?.stages ?? [];
    const llm = stages.find((s) => s.kind === "llm");
    const tts = stages.find((s) => s.kind === "tts");
    for (const s of stages)
      if (s.kind === "tool") {
        const request = `toolu_${line.id}`;
        // The model's request for the tool is a message of its own, with nothing said.
        transcript.push({
          role: "agent",
          message: "",
          time_in_call_secs: second(s.start),
          tool_calls: [
            {
              request_id: request,
              tool_name: s.tool.name,
              params_as_json: JSON.stringify(s.tool.arguments),
              type: "webhook",
            },
          ],
          tool_results: [
            {
              request_id: request,
              tool_name: s.tool.name,
              result_value: s.tool.error ?? JSON.stringify(s.tool.result),
              is_error: s.tool.error !== undefined,
              tool_latency_secs: Math.round(s.seconds * 1000) / 1000,
            },
          ],
          ...(llm && {
            conversation_turn_metrics: {
              metrics: { convai_llm_service_ttfb: { elapsed_time: llm.seconds } },
            },
          }),
        });
      }
    const hasTool = stages.some((s) => s.kind === "tool");
    transcript.push({
      role: "agent",
      message: spoken[line.id] ?? line.text,
      time_in_call_secs: second(p.start),
      ...(line.stopAfter !== undefined && { interrupted: true }),
      ...(input.dislike?.includes(line.id) && {
        feedback: { score: "dislike" as const, time_in_call_secs: second(p.end) },
      }),
      ...(p.reply && {
        conversation_turn_metrics: {
          metrics: {
            convai_asr_trailing_service_latency: { elapsed_time: ASR_TRAILING },
            ...(llm && !hasTool && { convai_llm_service_ttfb: { elapsed_time: llm.seconds } }),
            ...(tts && { convai_tts_service_ttfb: { elapsed_time: tts.seconds } }),
          },
        },
      }),
    });
  }
  const outcome = scenario.outcome as { goal?: string; achieved?: boolean };
  return {
    conversation_id: `conv_${scenario.id}`,
    agent_id: `agent_${scenario.id.split("-")[0]}`,
    agent_name: scenario.versions.agent,
    metadata: {
      start_time_unix_secs: Number(t0 / 1_000_000_000n),
      call_duration_secs: Math.ceil(input.duration),
      main_language: scenario.lang,
      phone_call: { direction: scenario.direction },
    },
    analysis: {
      call_successful: outcome.achieved === undefined ? "unknown" : outcome.achieved ? "success" : "failure",
      ...(outcome.goal && { call_summary_title: outcome.goal }),
    },
    transcript,
  };
}
