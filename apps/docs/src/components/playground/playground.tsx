import { type AudioSource, fromMediaElement, scriptedSource } from "@danolekh/earshot/audio";
import {
  type Conversation,
  createConversation,
  createLiveConversation,
  createVirtualClock,
  turnAt,
  type Word,
} from "@danolekh/earshot/core";
import { Orb, type OrbState } from "@danolekh/earshot/orb";
import { Transcript } from "@danolekh/earshot/transcript";
import { Visualizer } from "@danolekh/earshot/visualizer";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import insurance from "@/calls/alder-mutual-address.json";
import reply1 from "@/calls/reply-1.json";
import reply2 from "@/calls/reply-2.json";
import reply3 from "@/calls/reply-3.json";
import reply4 from "@/calls/reply-4.json";

import { type MicStatus, useMicrophone } from "./use-microphone";
import { useSpeechRecognition } from "./use-speech";

const REPLIES = [reply1, reply2, reply3, reply4].map((c, i) => ({
  conversation: c as unknown as Conversation,
  src: `/calls/reply-${i + 1}.mp3`,
}));

type Phase = "demo" | "ready" | "hearing" | "thinking" | "speaking";

const ORB_STATE: Record<Phase, OrbState> = {
  demo: "idle",
  ready: "listening",
  hearing: "listening",
  thinking: "thinking",
  speaking: "speaking",
};

const STATUS_TEXT: Partial<Record<MicStatus, string>> = {
  asking: "Asking for your microphone…",
  denied: "The microphone is blocked. Allow it from the address bar, then try again.",
  "no-device": "No microphone found. Plug one in and try again.",
  insecure: "The microphone needs a secure page (https).",
  unsupported: "This browser can't share a microphone with the page.",
  error: "The microphone didn't start. Try again.",
};

/** Talk to the orb: your voice moves it while it listens, then it thinks, then it answers with
 * one of a few recorded lines, its own voice driving it. Before you start, it plays one on a loop. */
export function Playground() {
  const mic = useMicrophone();
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("demo");
  const [output, setOutput] = useState<AudioSource | null>(null);
  const live = useMemo(() => createLiveConversation(), []);
  const turns = useSyncExternalStore(
    live.subscribe,
    () => live.get().turns,
    () => live.get().turns,
  );
  const userTurn = useRef<string | null>(null);
  const replyIndex = useRef(0);
  const phaseRef = useRef<Phase>("demo");
  const setP = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const speech = useSpeechRecognition({
    onInterim: (text) => {
      if (!userTurn.current && text && phaseRef.current !== "speaking")
        userTurn.current = live.begin("user", now());
      if (userTurn.current) live.setInterim(userTurn.current, text);
    },
    onFinal: (text) => {
      const id = userTurn.current ?? [...live.get().turns].reverse().find((t) => t.role === "user")?.id;
      if (!id) return;
      live.appendText(id, text);
      live.setInterim(id, "");
    },
  });

  // Before the visitor starts: a whole exchange on a loop, silent, on a virtual clock. A caller
  // speaks (listening), a pause (thinking), the agent answers (speaking), then rest (idle).
  const demo = useMemo(() => {
    const conversation = demoExchange();
    const clock = createVirtualClock(conversation.duration + 1.8, { loop: true });
    return {
      conversation,
      clock,
      input: scriptedSource(conversation, clock, "user"),
      output: scriptedSource(conversation, clock, "agent"),
    };
  }, []);
  const demoState = useSyncExternalStore(
    demo.clock.subscribe,
    () => stateAt(demo.conversation, demo.clock.time()),
    () => "idle" as OrbState,
  );
  // Its transcript plays along, word by word, into a live conversation of its own.
  const demoLive = useMemo(() => createLiveConversation(), []);
  const demoTurns = useSyncExternalStore(
    demoLive.subscribe,
    () => demoLive.get().turns,
    () => demoLive.get().turns,
  );
  useEffect(() => {
    if (phase !== "demo" || reduced) return;
    let ids = new Map<string, string>();
    let shown = new Map<string, number>();
    let lastT = 0;
    const off = demo.clock.subscribe(() => {
      const t = demo.clock.time();
      if (t < lastT) {
        // Looped: start the transcript over.
        ids = new Map();
        shown = new Map();
        demoLive.clear();
      }
      lastT = t;
      for (const turn of demo.conversation.turns) {
        if (turn.start > t) break;
        let id = ids.get(turn.id);
        if (!id) ids.set(turn.id, (id = demoLive.begin(turn.role, turn.start, { speaker: turn.speaker })));
        const due = turn.words.filter((w) => w.start <= t).length;
        const n = shown.get(turn.id) ?? 0;
        if (due > n) {
          demoLive.appendWords(id, turn.words.slice(n, due));
          shown.set(turn.id, due);
        }
        if (t >= turn.end && demoLive.get().turns.find((x) => x.id === id)?.final === false)
          demoLive.finalize(id, turn.end);
      }
    });
    demo.clock.play();
    return () => {
      off();
      demo.clock.pause();
    };
  }, [phase, demo, demoLive, reduced]);

  // Listening: voice activity from the mic's level. Talking opens a turn; 0.75 s of quiet ends it.
  useEffect(() => {
    const source = mic.source;
    if (!source) return;
    let raf = 0;
    let lastVoice = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = phaseRef.current;
      if (p !== "ready" && p !== "hearing") return;
      const t = performance.now();
      if (source.level() > 0.14) {
        lastVoice = t;
        if (p === "ready") {
          setP("hearing");
          userTurn.current ??= live.begin("user", now());
        }
      } else if (p === "hearing" && t - lastVoice > 750) answer();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `answer` reads refs only
  }, [mic.source, live]);

  /** The visitor stopped: close their turn, think a moment, then speak the next reply. */
  function answer() {
    const id = userTurn.current;
    if (id) {
      const turn = live.get().turns.find((t) => t.id === id);
      if (turn && !turn.text && !turn.interim) live.setText(id, speech.supported ? "…" : "(you spoke)");
      live.finalize(id, now());
    }
    userTurn.current = null;
    setP("thinking");
    window.setTimeout(speak, 900);
  }

  function speak() {
    if (phaseRef.current !== "thinking") return;
    const reply = REPLIES[replyIndex.current++ % REPLIES.length]!;
    const audio = new Audio(reply.src);
    const source = fromMediaElement(audio);
    const words = reply.conversation.turns[0]!.words;
    const offset = reply.conversation.turns[0]!.start;
    const id = live.begin("agent", now(), { speaker: "earshot" });
    let shown = 0;
    let raf = 0;
    const follow = () => {
      const due = words.filter((w) => w.start - offset <= audio.currentTime).length;
      if (due > shown) {
        live.appendWords(id, words.slice(shown, due));
        shown = due;
      }
      if (!audio.ended && !audio.paused) raf = requestAnimationFrame(follow);
    };
    audio.addEventListener("playing", () => (raf = requestAnimationFrame(follow)));
    audio.addEventListener("ended", () => {
      cancelAnimationFrame(raf);
      if (shown < words.length) live.appendWords(id, words.slice(shown));
      live.finalize(id, now());
      setOutput(null);
      source.dispose?.();
      if (phaseRef.current === "speaking") setP("ready");
    });
    setOutput(source);
    setP("speaking");
    void audio.play().catch(() => setP("ready"));
  }

  async function start() {
    await mic.start();
    setP("ready");
    speech.start();
  }
  function stop() {
    speech.stop();
    mic.stop();
    setOutput(null);
    setP("demo");
  }
  // A mic that fails leaves the demo running.
  useEffect(() => {
    if (mic.status !== "on" && mic.status !== "asking" && phase !== "demo") {
      speech.stop();
      // oxlint-disable-next-line react/set-state-in-effect -- the mic stopped from outside
      setP("demo");
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- react to the mic only
  }, [mic.status]);

  const state: OrbState = phase === "demo" ? (reduced ? "idle" : demoState) : ORB_STATE[phase];
  const input = phase === "demo" ? demo.input : (mic.source ?? undefined);
  const out = phase === "demo" ? demo.output : (output ?? undefined);
  const heard = state === "listening" ? input : out;
  const shownTurns = phase === "demo" ? demoTurns : turns;
  const recent = shownTurns.slice(-4);

  return (
    <div className="playground grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative mx-auto grid aspect-square w-full max-w-[420px] place-items-center">
        <Visualizer.Root source={heard} state={state} className="absolute inset-0 text-[var(--pg-ring)]">
          <Visualizer.Radial count={64} inner={0.64} reach={0.3} className="h-full w-full" />
        </Visualizer.Root>
        <Orb.Root
          state={state}
          input={input}
          output={out}
          interactive
          render={
            <button
              type="button"
              aria-label={phase === "demo" ? "Talk to it" : "Stop talking"}
              onClick={() => (phase === "demo" ? void start() : stop())}
            />
          }
          className="pg-orb relative size-[56%] rounded-full border-0 bg-transparent p-0"
          style={{ "--orb-bleed": "30%" } as React.CSSProperties}
        >
          <Orb.Shader />
        </Orb.Root>
      </div>

      <div className="grid gap-5">
        <div className="flex items-center gap-3">
          <StateChip state={state} demo={phase === "demo"} />
          {phase === "demo" ? (
            <button type="button" onClick={start} className="pg-button" disabled={mic.status === "asking"}>
              <MicIcon /> Talk to it
            </button>
          ) : (
            <button type="button" onClick={stop} className="pg-button pg-button-quiet">
              Stop
            </button>
          )}
        </div>
        {STATUS_TEXT[mic.status] && (
          <output className="text-fd-muted-foreground block text-sm">{STATUS_TEXT[mic.status]}</output>
        )}
        {phase !== "demo" && !speech.supported && (
          <p className="text-fd-muted-foreground text-sm">
            This browser doesn't transcribe speech, so the orb reacts but the words won't show. Chrome, Edge
            and Safari do.
          </p>
        )}
        <Transcript.Root
          conversation={phase === "demo" ? demoLive : live}
          live
          className="pg-transcript grid min-h-48 content-start gap-3"
        >
          {recent.length === 0 && (
            <p className="text-fd-muted-foreground text-sm">
              {phase === "demo"
                ? "Press Talk to it, say anything, then pause. The orb listens, thinks, and answers."
                : "Say something, then pause."}
            </p>
          )}
          <AnimatePresence initial={false} mode="popLayout">
            {recent.map((turn) => (
              <Transcript.Turn
                key={turn.id}
                turn={turn}
                className="pg-turn"
                render={
                  <motion.div
                    layout={reduced ? false : "position"}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 400, damping: 36 }}
                  />
                }
              >
                <Transcript.Speaker className="pg-speaker" />
                <p className="pg-words">
                  <Transcript.Words />
                </p>
              </Transcript.Turn>
            ))}
          </AnimatePresence>
        </Transcript.Root>
      </div>
    </div>
  );
}

/** The demo exchange: the insurance caller's first line, a thinking pause, then a reply. */
function demoExchange(): Conversation {
  const call = insurance as unknown as Conversation;
  const ask = call.turns.find((t) => t.role === "user")!;
  const answer = REPLIES[1]!.conversation.turns[0]!;
  const shift = (words: readonly Word[], by: number) =>
    words.map((w) => ({ ...w, start: w.start - by, end: w.end - by }));
  const askWords = shift(ask.words, ask.start - 0.4);
  const askEnd = askWords.at(-1)!.end;
  const replyStart = askEnd + 1.2;
  return createConversation({
    turns: [
      { role: "user", speaker: "Caller", words: askWords },
      { role: "agent", speaker: "earshot", words: shift(answer.words, answer.start - replyStart) },
    ],
  });
}

/** The orb's state at t in the demo: listening to the caller, thinking in the pause, speaking. */
function stateAt(c: Conversation, t: number): OrbState {
  const turn = turnAt(c, t);
  if (turn) return turn.role === "agent" ? "speaking" : "listening";
  const before = [...c.turns].reverse().find((x) => x.end <= t);
  const after = c.turns.find((x) => x.start > t);
  return before?.role === "user" && after?.role === "agent" ? "thinking" : "idle";
}

const LABEL: Record<OrbState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

function StateChip({ state, demo }: { state: OrbState; demo: boolean }) {
  return (
    <span className="pg-chip" data-state={state}>
      <span className="pg-dot" aria-hidden />
      {demo ? "Demo · " : ""}
      {LABEL[state]}
    </span>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path
        fill="currentColor"
        d="M8 1.5a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0V4A2.5 2.5 0 0 0 8 1.5Zm-4.5 6a.75.75 0 0 1 .75.75 3.75 3.75 0 0 0 7.5 0 .75.75 0 0 1 1.5 0 5.25 5.25 0 0 1-4.5 5.2V15a.75.75 0 0 1-1.5 0v-1.55a5.25 5.25 0 0 1-4.5-5.2.75.75 0 0 1 .75-.75Z"
      />
    </svg>
  );
}

const t0 = typeof performance === "undefined" ? 0 : performance.now();
const now = () => (performance.now() - t0) / 1000;
