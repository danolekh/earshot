import { useCallback, useEffect, useRef, useState } from "react";

// The Web Speech API isn't in TypeScript's DOM types everywhere; this is the part we use.
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}
type RecognitionClass = new () => Recognition;

const recognitionClass = (): RecognitionClass | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionClass;
    webkitSpeechRecognition?: RecognitionClass;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Live speech-to-text from the browser (Chrome, Edge, Safari; off in Firefox). Streams interim
 * guesses and final phrases; restarts itself if the browser ends a session while it's on. */
export function useSpeechRecognition(handlers: {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}): { supported: boolean; listening: boolean; start: () => void; stop: () => void } {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the API is only visible in the browser
    setSupported(recognitionClass() !== null);
  }, []);

  const start = useCallback(() => {
    const Class = recognitionClass();
    if (!Class) return;
    wanted.current = true;
    const r = new Class();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text) latest.current.onFinal(text);
        } else interim += (interim ? " " : "") + text;
      }
      latest.current.onInterim(interim);
    };
    r.onend = () => {
      if (wanted.current) {
        try {
          r.start();
        } catch {
          setListening(false);
        }
      } else setListening(false);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") wanted.current = false;
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    wanted.current = false;
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  useEffect(() => stop, [stop]);
  return { supported, listening, start, stop };
}
