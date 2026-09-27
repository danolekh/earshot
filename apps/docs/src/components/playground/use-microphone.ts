import { type AudioSource, fromMediaStream } from "@danolekh/earshot/audio";
import { useCallback, useEffect, useRef, useState } from "react";

export type MicStatus =
  | "off"
  | "asking"
  | "on"
  | "denied"
  | "no-device"
  | "insecure"
  | "unsupported"
  | "error";

/** The visitor's microphone as an earshot source. Nothing is asked until `start()`; the tracks
 * stop on `stop()`, on unmount, and when the tab is hidden (the visitor starts again on return). */
export function useMicrophone(): {
  status: MicStatus;
  source: AudioSource | null;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [status, setStatus] = useState<MicStatus>("off");
  const [source, setSource] = useState<AudioSource | null>(null);
  const stream = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setSource((s) => {
      s?.dispose?.();
      return null;
    });
    setStatus((s) => (s === "on" || s === "asking" ? "off" : s));
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) return setStatus("insecure");
    if (!navigator.mediaDevices?.getUserMedia) return setStatus("unsupported");
    setStatus("asking");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;
      setSource(fromMediaStream(s));
      setStatus("on");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "no-device"
            : "error",
      );
    }
  }, []);

  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && stop();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [stop]);

  return { status, source, start, stop };
}
