/* Where a visual gets its signal. Anything that can say how loud it is right now, and ideally what
 * the voice is doing: a microphone, the agent's WebRTC track, an <audio> element, values from a
 * vendor SDK, or a script following a conversation's word timings (for a demo, a test or a
 * frame-exact recording). The orb and visualizers read it every frame; nothing re-renders. */

import { simplex2d } from "math/noise";

import type { Clock } from "../core/clock";
import { isSpoken, turnAt } from "../core/conversation";
import type { Conversation, Role, Word } from "../core/types";
import { createFeatureTracker, SILENT, type TrackerOptions, type VoiceFeatures } from "./features";

export interface AudioSource {
  /** 0 to 1, smoothed. */
  level(): number;
  /** What the voice is doing now: brightness, hiss, onsets, vowel shape. */
  features?(): VoiceFeatures;
  /** Fills `out` with band levels 0 to 1, low to high, on a log scale over the voice's range. */
  bands?(out: Float32Array): void;
  /** Stops listening and lets go of the audio graph it made. */
  dispose?(): void;
}

export interface AnalyserOptions extends TrackerOptions {
  /** A context to build in; one is made (and closed on dispose) otherwise. */
  context?: AudioContext;
}

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

function fromAnalyser(analyser: AnalyserNode, options: AnalyserOptions, dispose: () => void): AudioSource {
  const time = new Float32Array(analyser.fftSize);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const tracker = createFeatureTracker(analyser.context.sampleRate, options);
  let last = 0;
  let current: VoiceFeatures = SILENT;
  // One analysis per frame, however many parts read it.
  const sample = () => {
    const t = now();
    if (last && t - last < 4) return current;
    const dt = last ? (t - last) / 1000 : 1 / 60;
    last = t;
    analyser.getFloatTimeDomainData(time);
    analyser.getFloatFrequencyData(spectrum);
    current = tracker.update(time, spectrum, dt);
    return current;
  };
  return {
    level: () => sample().level,
    features: sample,
    bands(out) {
      sample();
      const hz = analyser.context.sampleRate / analyser.fftSize;
      const lo = Math.log(80);
      const hi = Math.log(8000);
      for (let b = 0; b < out.length; b++) {
        const from = Math.max(1, Math.floor(Math.exp(lo + ((hi - lo) * b) / out.length) / hz));
        const to = Math.max(from + 1, Math.floor(Math.exp(lo + ((hi - lo) * (b + 1)) / out.length) / hz));
        let max = -Infinity;
        for (let i = from; i < to && i < spectrum.length; i++) max = Math.max(max, spectrum[i]!);
        // -90..-20 dB to 0..1, with the same 0.6 curve as loudness.
        out[b] = Math.min(1, Math.max(0, (max + 90) / 70)) ** 1.6;
      }
    },
    dispose,
  };
}

const analyserIn = (context: AudioContext) => {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  // Smoothing is done per feature, with attack and release; the analyser's own would blur onsets.
  analyser.smoothingTimeConstant = 0;
  return analyser;
};

/** A microphone, or a remote participant's track (LiveKit, Daily, a raw RTCPeerConnection). */
export function fromMediaStream(stream: MediaStream, options: AnalyserOptions = {}): AudioSource {
  const context = options.context ?? new AudioContext();
  const node = context.createMediaStreamSource(stream);
  const analyser = analyserIn(context);
  node.connect(analyser);
  return fromAnalyser(analyser, options, () => {
    node.disconnect();
    if (!options.context) void context.close();
  });
}

// An element can be routed into Web Audio only once in its life, so its node is kept.
const elementNodes = new WeakMap<
  HTMLMediaElement,
  { context: AudioContext; node: MediaElementAudioSourceNode }
>();

/** An element's one Web Audio node, made on first use and played out to the speakers (a channel
 * mix puts itself in between). For this package's own use. */
export function routeElement(
  element: HTMLMediaElement,
  context?: AudioContext,
): { context: AudioContext; node: MediaElementAudioSourceNode } {
  let entry = elementNodes.get(element);
  if (!entry) {
    const ctx = context ?? new AudioContext();
    const node = ctx.createMediaElementSource(element);
    node.connect(ctx.destination);
    elementNodes.set(element, (entry = { context: ctx, node }));
  }
  return entry;
}

/** An <audio> or <video> element as it plays. Routes it through Web Audio (it still plays out
 * loud); the element needs CORS headers if its audio comes from another origin. */
export function fromMediaElement(element: HTMLMediaElement, options: AnalyserOptions = {}): AudioSource {
  const { context, node } = routeElement(element, options.context);
  // Autoplay rules start a context suspended; it resumes on the element's own play.
  const resume = () => void context.resume();
  element.addEventListener("play", resume);
  const analyser = analyserIn(context);
  node.connect(analyser);
  return fromAnalyser(analyser, options, () => {
    element.removeEventListener("play", resume);
    node.disconnect(analyser);
  });
}

/** A level you set yourself, eased: from a vendor SDK's volume events (Vapi's `volume-level`,
 * ElevenLabs' `getOutputVolume()`), or a test. Features are derived from the level alone. */
export function manualSource(options: { attack?: number; release?: number } = {}): AudioSource & {
  set(level: number): void;
} {
  let target = 0;
  let value = 0;
  let last = 0;
  let previous = 0;
  const read = () => {
    const t = now();
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    const tau = target > value ? (options.attack ?? 0.03) : (options.release ?? 0.22);
    if (dt) value += (target - value) * (1 - Math.exp(-dt / tau));
    return value;
  };
  return {
    set(level) {
      target = Math.min(1, Math.max(0, level));
    },
    level: read,
    features() {
      const level = read();
      const onset = level - previous > 0.12 ? Math.min(1, (level - previous) * 3) : 0;
      previous = level;
      return { ...SILENT, level, mid: level, open: level * 0.5, onset };
    },
  };
}

// A smooth, seeded wobble: the same time gives the same value, so a recording made frame by frame
// looks the same every take.
const noise = simplex2d.create(7);
const wobble = (t: number, seed: number) => 0.5 + 0.5 * simplex2d.sample(noise, t * 9, seed * 3.7);

/** The vowel shape and hiss of a written word at `p` (0 to 1) through it: its letters stand in
 * for its sounds, which is close enough to move an orb in step with speech. */
function wordShape(text: string, p: number): { open: number; round: number; spread: number; hiss: number } {
  const letters = text.toLowerCase().replace(/[^a-zäöüß]/g, "");
  if (!letters) return { open: 0, round: 0, spread: 0, hiss: 0 };
  const ch = letters[Math.min(letters.length - 1, Math.floor(p * letters.length))]!;
  const next = letters[Math.min(letters.length - 1, Math.floor(p * letters.length) + 1)] ?? "";
  return {
    open: "aä".includes(ch) ? 1 : "eo".includes(ch) ? 0.45 : 0,
    round: "ouöü".includes(ch) ? 1 : "w".includes(ch) ? 0.5 : 0,
    spread: "ie".includes(ch) ? 1 : "y".includes(ch) ? 0.6 : 0,
    hiss: "szßfxc".includes(ch) || (ch === "s" && next === "h") ? 1 : "tkp".includes(ch) ? 0.4 : 0,
  };
}

/** Loudness and features that follow a conversation's word timings at the clock's time: each word
 * swells and fades, starts with an onset, takes the shape of its vowels and hisses on its s and f;
 * pauses are quiet; unspoken words stay silent. For a demo without audio, or a recording that
 * must come out the same every take. */
export function scriptedSource(
  conversation: Conversation,
  clock: Pick<Clock, "time">,
  role?: Role,
): AudioSource {
  const wordAtTime = (t: number): { word: Word; p: number } | null => {
    const turn = turnAt(conversation, t);
    if (!turn || (role && turn.role !== role)) return null;
    const word = turn.words.find((w) => t >= w.start && t <= w.end);
    if (!word || !isSpoken(turn, word)) return null;
    return { word, p: (t - word.start) / Math.max(0.01, word.end - word.start) };
  };
  const levelAt = (t: number) => {
    const at = wordAtTime(t);
    return at ? Math.sin(Math.PI * at.p) ** 0.6 * (0.55 + 0.45 * wobble(t, 1)) : 0;
  };
  let lastWord: Word | null = null;
  return {
    level: () => levelAt(clock.time()),
    features() {
      const t = clock.time();
      const at = wordAtTime(t);
      if (!at) {
        lastWord = null;
        return SILENT;
      }
      const level = levelAt(t);
      const shape = wordShape(at.word.text, at.p);
      const onset = at.word !== lastWord ? 0.6 + 0.4 * wobble(t, 9) : 0;
      lastWord = at.word;
      return {
        level,
        centroid: 0.35 + 0.3 * shape.hiss + 0.15 * shape.spread,
        sibilance: shape.hiss * level,
        low: 0.3 * level,
        mid: 0.6 * level,
        high: (0.1 + 0.5 * shape.hiss) * level,
        open: shape.open * level,
        round: shape.round * level,
        spread: shape.spread * level,
        onset,
      };
    },
    bands(out) {
      const t = clock.time();
      const l = levelAt(t);
      for (let b = 0; b < out.length; b++) {
        // Speech is loudest low-mid and falls off above.
        const shape = Math.exp(-(((b / out.length - 0.25) / 0.35) ** 2));
        out[b] = Math.min(1, l * shape * (0.6 + 0.8 * wobble(t, b + 2)));
      }
    },
  };
}
