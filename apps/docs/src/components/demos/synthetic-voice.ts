import { type AudioSource, manualSource } from "@danolekh/earshot/audio";
import { useEffect, useState } from "react";

/** A voice-like level with no microphone: syllables of a few hundred milliseconds, pauses between
 * phrases. For demos that shouldn't ask for the mic before you choose to. */
export function syntheticVoice(): AudioSource & { stop(): void } {
  const source = manualSource();
  let t = 0;
  const id = setInterval(() => {
    t += 0.05;
    const phrase = Math.sin(t * 0.9) > -0.3 ? 1 : 0;
    const syllable = Math.abs(Math.sin(t * 7.3)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 2.1)));
    source.set(phrase * syllable);
  }, 50);
  return { ...source, stop: () => clearInterval(id) };
}

/** A synthetic voice for as long as the component is mounted; null on the server and before the
 * first effect, so no timer starts during a server render. */
export function useSyntheticVoice(): AudioSource | null {
  const [voice, setVoice] = useState<(AudioSource & { stop(): void }) | null>(null);
  useEffect(() => {
    const v = syntheticVoice();
    // oxlint-disable-next-line react/set-state-in-effect -- the timer lives in the browser only
    setVoice(v);
    return () => v.stop();
  }, []);
  return voice;
}
