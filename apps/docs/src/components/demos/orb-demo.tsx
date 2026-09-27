import { type AudioSource, fromMediaStream } from "@danolekh/earshot/audio";
import { Orb, type OrbState } from "@danolekh/earshot/orb";
import { useEffect, useMemo, useState } from "react";

import { useSyntheticVoice } from "./synthetic-voice";

const STATES: OrbState[] = ["idle", "listening", "thinking", "speaking"];
// Top, middle and deep of its sky.
const PALETTES = {
  sky: ["#eef6ff", "#8cc8ff", "#1553c9"],
  lime: ["#f4ffd6", "#b6f03a", "#2f6b12"],
  ember: ["#fff3e6", "#ffa25c", "#c2410c"],
  iris: ["#f2f2fd", "#8d91fe", "#3b3fd6"],
} as const;

export function OrbDemo() {
  const [state, setState] = useState<OrbState>("speaking");
  const [palette, setPalette] = useState<keyof typeof PALETTES>("sky");
  const [mic, setMic] = useState<AudioSource | null>(null);
  const [liveliness, setLiveliness] = useState(1);
  const voice = useSyntheticVoice();
  useEffect(() => () => mic?.dispose?.(), [mic]);

  const useMic = async () => {
    if (mic) return setMic(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setMic(fromMediaStream(stream));
    setState("listening");
  };
  const params = useMemo(() => ({ colors: [...PALETTES[palette]] }), [palette]);

  return (
    <div className="grid w-full justify-items-center gap-6">
      <Orb.Root
        state={state}
        input={mic ?? voice ?? undefined}
        output={voice ?? undefined}
        liveliness={liveliness}
        className="size-48 rounded-full"
        style={{ "--orb-bleed": "30%" } as React.CSSProperties}
      >
        <Orb.Shader params={params} />
      </Orb.Root>
      <div className="flex flex-wrap justify-center gap-2 text-sm">
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
      </div>
      <div className="text-fd-muted-foreground flex flex-wrap items-center justify-center gap-3 text-sm">
        {(Object.keys(PALETTES) as (keyof typeof PALETTES)[]).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === palette}
            aria-label={`${p} palette`}
            onClick={() => setPalette(p)}
            className="aria-pressed:ring-fd-foreground size-6 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-[var(--color-fd-background)]"
            style={{
              background: `linear-gradient(180deg, ${PALETTES[p][0]}, ${PALETTES[p][1]}, ${PALETTES[p][2]})`,
            }}
          />
        ))}
        <span aria-hidden>·</span>
        <label className="flex items-center gap-2">
          Liveliness
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={liveliness}
            onChange={(e) => setLiveliness(Number(e.target.value))}
            className="accent-[var(--color-fd-primary)]"
          />
        </label>
        <span aria-hidden>·</span>
        <button type="button" onClick={useMic} className="rounded-md px-2 py-1 underline">
          {mic ? "Stop the microphone" : "Use your microphone"}
        </button>
      </div>
    </div>
  );
}
