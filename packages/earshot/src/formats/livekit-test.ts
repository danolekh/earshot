/* A test case as a LiveKit Agents unit test (pytest), the export side of `fromLiveKit`.
 * LiveKit's tests run in text mode: the model gets the history as it was and what the caller
 * said (not what the recogniser heard), and the test asserts on what it does. Checks about audio
 * (timing, turn-taking, what was heard) can't be said there, so they're listed at the end, to be
 * checked by the debugger on a recorded or simulated call. See docs.livekit.io/testing/unit-tests. */
import { formatTime } from "../core/conversation";
import { type Check, saidText, type TestCase } from "../trace/checks";
import { describeCheck } from "../trace/draft";
import { modelInput } from "../trace/model-input";
import type { CallTrace } from "../trace/types";

/** A value as a Python literal. */
export function py(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(py).join(", ")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${JSON.stringify(k)}: ${py(v)}`)
    .join(", ")}}`;
}

/** A Python identifier from a name. */
const ident = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "call";

/** LiveKit inference's name for a model: provider and model. */
const modelId = (model: string | undefined) =>
  !model
    ? "openai/gpt-4.1"
    : model.includes("/")
      ? model
      : model.startsWith("gpt")
        ? `openai/${model}`
        : model;

/** Intents a judge can hold the reply to, for findings about what the agent said. */
const JUDGED: Readonly<Partial<Record<string, string>>> = {
  repeat: "Doesn't ask again for what the caller already gave",
};

/** A LiveKit Agents unit test (pytest, text mode) for a test case: the history the model had, what
 * the caller said, the checks it can assert (tool calls, a judge's intent), and the rest listed as
 * needing a recorded or simulated call. */
export function toLiveKitTest(test: TestCase, trace: CallTrace): string {
  const turns = test.source.turns
    .map((id) => trace.turns.find((t) => t.id === id))
    .filter((t) => t !== undefined);
  const reply = turns.find((t) => t.channel === "agent");
  const caller = turns.find((t) => t.channel === "caller");
  const model = modelInput(trace, (reply ?? turns[0]!).id);
  // The history before this turn: everything the model had but the caller's last message.
  const messages = model?.messages.filter((m) => m.role === "user" || m.role === "assistant") ?? [];
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  const history = lastUser === -1 ? messages : messages.slice(0, lastUser);
  const input = caller ? saidText(trace, caller) : (messages[lastUser]?.content ?? "");

  const asserts: string[] = [];
  const elsewhere: { check: Check; why: string }[] = [];
  for (const check of test.checks) {
    if (check.kind === "tool_succeeds") {
      // Arguments from a call of the same tool that worked, when the call has one.
      const ok = trace.spans.find(
        (s) => s.kind === "tool" && (s.tool?.name ?? s.name) === check.tool && s.status?.code !== "error",
      );
      const args = ok?.tool?.arguments;
      asserts.push(
        `        # ${describeCheck(check)}`,
        `        result.expect.contains_function_call(name=${py(check.tool)}${args ? `, arguments=${py(args)}` : ""})`,
      );
    } else if (check.kind === "no_finding" && JUDGED[check.finding]) {
      asserts.push(
        `        # ${describeCheck(check)}`,
        `        await result.expect.next_event(type="message").judge(llm, intent=${py(JUDGED[check.finding])})`,
      );
    } else
      elsewhere.push({
        check,
        why: check.kind === "no_finding" && !check.turn ? "about the whole call" : "needs audio",
      });
  }
  if (!asserts.length) asserts.push(`        result.expect.next_event().is_message(role="assistant")`);

  const context = [
    test.context.promptVersion && `prompt ${test.context.promptVersion}`,
    test.context.model && `model ${test.context.model}`,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `"""${test.name}`,
    "",
    `Drafted by the call debugger from call ${test.source.callId} at ${formatTime(test.source.at)}${context ? ` (${context})` : ""}.`,
    "Runs in LiveKit's text mode: the model gets the history as it was, and what the caller said.",
    `"""`,
    "",
    "import pytest",
    "from livekit.agents import AgentSession, ChatContext, inference",
    "",
    "from agent import Assistant  # your agent",
    "",
    "",
    "@pytest.mark.asyncio",
    `async def test_${ident(test.name)}() -> None:`,
    "    async with (",
    `        inference.LLM(model=${py(modelId(test.context.model))}) as llm,`,
    "        AgentSession(llm=llm) as session,",
    "    ):",
    "        await session.start(Assistant())",
    ...(history.length
      ? [
          "",
          "        history = ChatContext()",
          ...history.map((m) => `        history.add_message(role=${py(m.role)}, content=${py(m.content)})`),
          "        await session.current_agent.update_chat_ctx(history)",
        ]
      : []),
    "",
    `        result = await session.run(user_input=${py(input)})`,
    "",
    ...asserts,
    ...(elsewhere.length
      ? [
          "",
          "    # Checked by the debugger on a recorded or simulated call, not here:",
          ...elsewhere.map(({ check, why }) => `    #   ${describeCheck(check)} (${why})`),
        ]
      : []),
    "",
  ].join("\n");
}
