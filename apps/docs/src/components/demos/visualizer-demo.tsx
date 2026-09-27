import { type AudioSource, fromMediaStream } from "@danolekh/earshot/audio";
import { Visualizer, type VisualizerState } from "@danolekh/earshot/visualizer";
import { useEffect, useState } from "react";

import { useSyntheticVoice } from "./synthetic-voice";

const STATES: VisualizerState[] = ["idle", "listening", "thinking", "speaking"];

/** The four variants on one source. Bars and dots take `color`; unlit dots `--vx-dim`. */
export function VisualizerDemo() {
  const synthetic = useSyntheticVoice();
  const [mic, setMic] = useState<AudioSource | null>(null);
  const [state, setState] = useState<VisualizerState>("speaking");
  useEffect(() => () => mic?.dispose?.(), [mic]);
  const voiced = state === "speaking" || state === "listening";
  const source = voiced ? (mic ?? synthetic) : null;

  return (
    <div className="grid w-full gap-8">
      <Visualizer.Root
        source={source}
        state={state}
        bars={7}
        className="grid gap-8 text-lime-400 sm:grid-cols-2"
      >
        <figure className="grid place-items-center gap-3">
          <div className="flex h-24 items-center gap-1.5">
            <Visualizer.Bars>
              {Array.from({ length: 7 }, (_, i) => (
                <Visualizer.Bar
                  key={i}
                  index={i}
                  className="relative w-2.5 rounded-full bg-current"
                  style={{ height: "calc(10px + var(--vx-level) * 80px)" }}
                />
              ))}
            </Visualizer.Bars>
          </div>
          <figcaption className="text-fd-muted-foreground font-mono text-xs">Bars</figcaption>
        </figure>
        <figure className="grid place-items-center gap-3">
          <Visualizer.Matrix rows={5} columns={11} className="h-24 [--vx-dim:rgb(255_255_255/.1)]" />
          <figcaption className="text-fd-muted-foreground font-mono text-xs">Matrix</figcaption>
        </figure>
        <figure className="grid place-items-center gap-3 sm:col-span-2">
          <Visualizer.History className="h-16 [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]" />
          <figcaption className="text-fd-muted-foreground font-mono text-xs">History</figcaption>
        </figure>
        <figure className="grid place-items-center gap-3 sm:col-span-2">
          <Visualizer.Radial count={56} className="w-52" />
          <figcaption className="text-fd-muted-foreground font-mono text-xs">Radial</figcaption>
        </figure>
      </Visualizer.Root>
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === state}
            onClick={() => setState(s)}
            className="border-fd-border aria-pressed:bg-fd-primary aria-pressed:text-fd-primary-foreground rounded-full border px-3 py-1"
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={async () => {
            if (mic) return setMic(null);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setMic(fromMediaStream(stream));
          }}
          className="text-fd-muted-foreground px-2 py-1 underline"
        >
          {mic ? "Stop the microphone" : "Use your microphone"}
        </button>
      </div>
    </div>
  );
}
