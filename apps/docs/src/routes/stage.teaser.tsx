import type { AudioSource, VoiceFeatures } from "@danolekh/earshot/audio";
import { createLiveConversation, createVirtualClock, type Word } from "@danolekh/earshot/core";
import { Orb, type OrbState } from "@danolekh/earshot/orb";
import { useClockValue } from "@danolekh/earshot/player";
import { Transcript } from "@danolekh/earshot/transcript";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/* The teaser's stage, filmed frame by frame by apps/promo (never linked, never indexed). One
 * clock runs everything: the orb's state and voice from the recorded call, the words as they're
 * said, and the closing line. The recorder calls `__stage.play()` on its first frame, so the
 * picture and the audio it lays under it start together. */
export const Route = createFileRoute("/stage/teaser")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }, { title: "stage" }] }),
  component: Teaser,
});

interface TeaserData {
  fps: number;
  duration: number;
  turns: { role: "user" | "agent"; words: Word[] }[];
  /** Per frame: level, centroid, sibilance, low, onset. */
  features: [number, number, number, number, number][];
}

function Teaser() {
  const [data, setData] = useState<TeaserData | null>(null);
  useEffect(() => {
    document.documentElement.style.background = "#06080c";
    void fetch("/stage/teaser.json")
      .then((r) => r.json())
      .then(setData);
  }, []);
  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden bg-[#06080c]">
      {data && <Scene data={data} />}
    </main>
  );
}

function Scene({ data }: { data: TeaserData }) {
  const clock = useMemo(() => createVirtualClock(data.duration), [data]);
  const end = data.turns[1]!.words.at(-1)!.end;

  // What the orb hears at the clock's time: the recorded voice's features, with any onset since
  // the last look kept, so a syllable's attack isn't lost between frames.
  const seen = useRef(-1);
  const source = useMemo((): AudioSource => {
    const at = (): VoiceFeatures => {
      const i = Math.min(data.features.length - 1, Math.floor(clock.time() * data.fps));
      let onset = 0;
      for (let k = Math.max(seen.current + 1, i - 8); k <= i; k++)
        onset = Math.max(onset, data.features[k]?.[4] ?? 0);
      seen.current = i;
      const [level, centroid, sibilance, low] = data.features[i] ?? [0, 0, 0, 0];
      return {
        level,
        centroid,
        sibilance,
        low,
        mid: level * 0.6,
        high: 0,
        open: 0,
        round: 0,
        spread: 0,
        onset,
      };
    };
    return { level: () => at().level, features: at };
  }, [clock, data]);

  const state = useClockValue<OrbState>(clock, (c) => stateAt(data, c.time()), "idle");
  // The caller's voice drives the orb until the agent starts answering.
  const caller = state === "listening";

  // The words, as they're said, into a live conversation; only the latest turn shows.
  const live = useMemo(() => createLiveConversation(), []);
  useEffect(() => {
    const ids: string[] = [];
    const shown = [0, 0];
    return clock.subscribe(() => {
      const t = clock.time();
      data.turns.forEach((turn, k) => {
        if (turn.words[0]!.start > t) return;
        ids[k] ??= live.begin(turn.role, turn.words[0]!.start);
        const due = turn.words.filter((w) => w.start <= t).length;
        if (due > shown[k]!) {
          live.appendWords(ids[k]!, turn.words.slice(shown[k], due));
          shown[k] = due;
        }
      });
    });
  }, [clock, data, live]);
  const turns = useSyncExternalStore(
    live.subscribe,
    () => live.get().turns,
    () => live.get().turns,
  );
  const current = turns.at(-1);
  const closing = useClockValue(clock, (c) => c.time() > end + 0.7, false);
  const shown = useClockValue(clock, (c) => c.time() > 0.05, false);

  useEffect(() => {
    (window as unknown as { __stage: { play: () => void; duration: number } }).__stage = {
      play: () => clock.play(),
      duration: data.duration,
    };
    // Ready once the orb's shader has drawn its first frame.
    const check = window.setInterval(() => {
      if (document.querySelector("[data-slot=orb-shader][data-ready]")) {
        document.documentElement.dataset.ready = "";
        window.clearInterval(check);
      }
    }, 50);
    return () => window.clearInterval(check);
  }, [clock, data]);

  // The room: dark, lit only by the orb. Its light spills onto the wall behind it, swells a little
  // with whoever is talking and turns violet while it thinks; grain keeps the dark gradients from
  // banding, here and after X re-encodes the film.
  const room = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let glow = 0;
    let think = 0;
    let last = 0;
    return clock.subscribe(() => {
      const t = clock.time();
      const dt = Math.max(0, Math.min(0.05, t - last));
      last = t;
      const level = stateAt(data, t) === "idle" && t > end ? 0 : source.features!().level;
      glow += (level - glow) * (1 - Math.exp(-dt / (level > glow ? 0.08 : 0.5)));
      think += ((stateAt(data, t) === "thinking" ? 1 : 0) - think) * (1 - Math.exp(-dt / 0.35));
      const el = room.current?.parentElement;
      if (!el) return;
      el.style.setProperty("--glow", glow.toFixed(4));
      el.style.setProperty("--think", think.toFixed(4));
      el.style.setProperty("--grain-x", `${Math.floor(Math.random() * 200)}px`);
      el.style.setProperty("--grain-y", `${Math.floor(Math.random() * 200)}px`);
    });
  }, [clock, data, end, source]);

  return (
    <div className="relative h-[450px] w-[800px]">
      <style>{ROOM_CSS}</style>
      <div
        ref={room}
        className="teaser-room absolute inset-0"
        style={{ opacity: shown ? 1 : 0 }}
        aria-hidden
      />
      <div className="teaser-grain absolute inset-0" aria-hidden />
      <Orb.Root
        state={state}
        input={caller ? source : undefined}
        output={caller ? undefined : source}
        announce={false}
        className="absolute top-[58px] left-1/2 size-[190px] -translate-x-1/2 rounded-full transition-opacity duration-1000"
        style={{ "--orb-bleed": "30%", opacity: shown ? 1 : 0 } as React.CSSProperties}
      >
        <Orb.Shader maxDpr={8} maxPixels={6_000_000} />
      </Orb.Root>

      <Transcript.Root
        conversation={live}
        live
        follow={false}
        className="absolute top-[300px] left-1/2 w-[640px] -translate-x-1/2 text-center"
      >
        {current && (
          <Transcript.Turn
            key={current.id}
            turn={current}
            className="teaser-turn text-[21px] leading-[1.45] font-medium tracking-[-0.01em] data-[role=agent]:text-[#eef2f6] data-[role=user]:text-[#8b929c]"
            style={{ opacity: closing ? 0 : 1, transition: "opacity 700ms ease" }}
          >
            <Transcript.Words />
          </Transcript.Turn>
        )}
      </Transcript.Root>

      <p
        className="absolute top-[318px] left-0 w-full text-center font-mono text-[15px] tracking-[0.08em] text-[#9aa1ab]"
        style={{ opacity: closing ? 1 : 0, transition: "opacity 900ms ease 300ms" }}
      >
        building something.
      </p>
    </div>
  );
}

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.6 -.3"/></filter><rect width="200" height="200" filter="url(#n)"/></svg>',
)}")`;

// The orb sits with its centre at 153px from the top; the light pools there and falls off to a
// vignette, blue with the voice, violet while it thinks.
const ROOM_CSS = `
.teaser-room {
  --blue: 38 102 220;
  --violet: 112 92 245;
  transition: opacity 1200ms ease;
  background:
    radial-gradient(34% 58% at 50% 34%, rgb(var(--violet) / calc(0.16 * var(--think, 0))) 0%, transparent 100%),
    radial-gradient(40% 70% at 50% 34%, rgb(var(--blue) / calc(0.13 + 0.12 * var(--glow, 0) - 0.08 * var(--think, 0))) 0%, rgb(var(--blue) / 0.03) 55%, transparent 100%),
    radial-gradient(90% 110% at 50% 38%, #0c1119 0%, #080a0f 55%, #040507 100%);
}
.teaser-grain {
  pointer-events: none;
  background-image: ${GRAIN};
  background-size: 200px 200px;
  background-position: var(--grain-x, 0) var(--grain-y, 0);
  opacity: 0.06;
  mix-blend-mode: overlay;
}
`;

/** Listening to the caller, thinking in the pause, speaking the answer, idle around them. */
function stateAt(data: TeaserData, t: number): OrbState {
  const [ask, answer] = data.turns;
  const askStart = ask!.words[0]!.start;
  const askEnd = ask!.words.at(-1)!.end;
  const answerStart = answer!.words[0]!.start;
  const answerEnd = answer!.words.at(-1)!.end;
  if (t >= askStart - 0.05 && t <= askEnd + 0.1) return "listening";
  if (t > askEnd + 0.1 && t < answerStart - 0.05) return "thinking";
  if (t >= answerStart - 0.05 && t <= answerEnd + 0.15) return "speaking";
  return "idle";
}
