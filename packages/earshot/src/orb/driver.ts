/* What the orb shows at a moment, worked out once a frame on the CPU so the shader only draws.
 * The orb is a perfect circle, always: its life is inside it and in its uniform scale,
 * brightness and aura, the way ChatGPT's voice orb does it (docs/research/orb-natural.md).
 *
 *              scale                   flow                inside                       moved by
 *   idle       breathes, sways         a steady drift      even light                   nothing
 *   listening  swells with you         livelier            a little brighter            the caller's voice
 *   thinking   breathes quicker        a busy churn        lights orbiting the globe    a clock, no audio
 *   speaking   bounces on syllables    boils on loud ones  lit from within, pulses      the agent's voice
 *
 * A voice passes through an envelope follower (quick to rise, slower to fall, so syllables read
 * as rhythm rather than jitter), then drives an underdamped spring on scale. Each syllable's onset
 * also kicks that spring and fires a pulse: a flash of inner light. The voice's brightness warms the light a touch, its body
 * swells the core, its hiss makes the glass shimmer. Flow and spin are integrated as phases, so a
 * change of speed never jumps. `liveliness` scales every amplitude in one place. */

import { SILENT, type VoiceFeatures } from "../audio/features";
import type { AudioSource } from "../audio/source";
import type { OrbState } from "./orb";

export const ORB_INPUTS = [
  "scale",
  "phase",
  "spin",
  "bright",
  "aura",
  "think",
  "hue",
  "level",
  "pulse",
  "light",
  "warmth",
  "shimmer",
  "px",
  "py",
  "hover",
  "tapX",
  "tapY",
  "tapAge",
  "idle",
  "listening",
  "thinking",
  "speaking",
] as const;

export type OrbSample = Record<(typeof ORB_INPUTS)[number], number>;

export interface OrbDriverOptions {
  state: OrbState;
  input?: AudioSource | undefined;
  output?: AudioSource | undefined;
  reducedMotion: boolean;
  /** How much it moves: 0.5 calm, 1 by default, up to 2 vivid. */
  liveliness?: number;
}

/** A pointer over the orb, in its own units: x and y from -1 to 1 across the circle, y up. */
export type OrbPointer =
  | { type: "move"; x: number; y: number }
  | { type: "down"; x: number; y: number }
  | { type: "up" }
  | { type: "leave" };

export interface OrbDriver {
  configure(options: OrbDriverOptions): void;
  sample(): OrbSample;
  /** Play: hovering moves its highlight, pressing squishes it, a tap sends a ripple, a drag spins
   * it. */
  interact(event: OrbPointer): void;
}

const STATES = ["idle", "listening", "thinking", "speaking"] as const;
/** How long a new state must hold before the orb follows it. */
const DWELL = 0.08;
/** The envelope: seconds to rise and to fall. */
const ATTACK = 0.025;
const RELEASE = 0.18;
/** The scale spring: stiffness and damping (under critical, for a soft bounce). */
const STIFFNESS = 180;
const DAMPING = 21;
/** Seconds for state changes to ease in. */
const EASE = 0.15;
/** How fast a syllable's flash of light fades. */
const PULSE_DECAY = 0.12;

const ease = (value: number, target: number, dt: number, tau = EASE) =>
  value + (target - value) * (1 - Math.exp(-dt / tau));

const featuresOf = (source: AudioSource | undefined): VoiceFeatures => {
  if (!source) return SILENT;
  if (source.features) return source.features();
  const level = source.level();
  return { ...SILENT, level, mid: level };
};

export function createOrbDriver(now: () => number = () => performance.now()): OrbDriver {
  let config: OrbDriverOptions = { state: "idle", reducedMotion: false };
  let shown: OrbState = "idle";
  let pending: OrbState = "idle";
  let pendingFor = 0;
  const weight: Record<OrbState, number> = { idle: 1, listening: 0, thinking: 0, speaking: 0 };
  // Who is talking, tracked much faster than the look of a state, so a voice moves the orb from its
  // first syllable instead of waiting for a colour change to finish.
  const talking = { listening: 0, speaking: 0 };
  const env = { input: 0, output: 0 };
  const scale = { value: 1, velocity: 0 };
  const eased = { bright: 1, aura: 0.4, think: 0, hue: 0, speed: 0.18, light: 0, warmth: 0, shimmer: 0 };
  let pulse = 0;
  let clock = 0;
  let phase = 0;
  let spin = 0;
  let last = 0;
  let cached: OrbSample | null = null;
  // Play.
  const pointer = { x: 0, y: 0, over: false, down: false, lastX: 0 };
  let hover = 0;
  let press = 0;
  let spinVelocity = 0;
  let tap = { x: 0, y: 0, age: 9 };

  const follow = (key: "input" | "output", level: number, dt: number) => {
    env[key] += (level - env[key]) * (1 - Math.exp(-dt / (level > env[key] ? ATTACK : RELEASE)));
    return env[key];
  };

  return {
    configure(next) {
      config = next;
    },
    interact(event) {
      if (event.type === "leave") {
        pointer.over = false;
        pointer.down = false;
        return;
      }
      if (event.type === "up") {
        if (pointer.down && !config.reducedMotion) scale.velocity += 0.45;
        pointer.down = false;
        return;
      }
      if (event.type === "down") {
        pointer.down = true;
        pointer.lastX = event.x;
        tap = { x: event.x, y: event.y, age: 0 };
      } else if (pointer.down) {
        // Dragging across spins the globe; it keeps turning once let go.
        spinVelocity += (event.x - pointer.lastX) * 3;
        pointer.lastX = event.x;
      }
      pointer.x = event.x;
      pointer.y = event.y;
      pointer.over = true;
    },
    sample() {
      const t = now();
      // One sample per frame: calls within 4 ms share it.
      if (cached && t - last < 4) return cached;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      const still = config.reducedMotion;
      const live = Math.max(0, Math.min(2, config.liveliness ?? 1));

      if (config.state !== pending) {
        pending = config.state;
        pendingFor = 0;
      } else pendingFor += dt;
      if (pending !== shown && (pendingFor >= DWELL || still || !dt)) shown = pending;

      for (const s of STATES)
        weight[s] = still || !dt ? (shown === s ? 1 : 0) : ease(weight[s], shown === s ? 1 : 0, dt);
      const sum = weight.idle + weight.listening + weight.thinking + weight.speaking || 1;
      const i = weight.idle / sum;
      const l = weight.listening / sum;
      const th = weight.thinking / sum;
      const sp = weight.speaking / sum;

      for (const k of ["listening", "speaking"] as const)
        talking[k] = still || !dt ? (shown === k ? 1 : 0) : ease(talking[k], shown === k ? 1 : 0, dt, 0.03);
      const vl = talking.listening;
      const vs = talking.speaking;
      const inF = featuresOf(config.input);
      const outF = featuresOf(config.output);
      const heard = follow("input", inF.level, dt);
      const said = follow("output", outF.level, dt);
      // Whoever the state says is talking: their voice drives the orb.
      const talk = vl + vs;
      const voice = {
        env: vl * heard + vs * said,
        onset: vl * inF.onset * 0.6 + vs * outF.onset,
        centroid: talk ? (vl * inF.centroid + vs * outF.centroid) / talk : 0,
        low: vl * inF.low + vs * outF.low,
        hiss: vl * inF.sibilance * 0.6 + vs * outF.sibilance,
      };
      if (!still) clock += dt;

      // Breathing that never repeats: two sways at unrelated periods.
      const breathe = still
        ? 0
        : (i + th * 0.6) * 0.025 * Math.sin((clock / 3.2) * Math.PI * 2) +
          (i + l * 0.5) * 0.01 * Math.sin((clock / 7.3) * Math.PI * 2 + 1.3) +
          th * 0.012 * Math.sin(clock * 1.1 * Math.PI * 2);
      hover = still || !dt ? (pointer.over ? 1 : 0) : ease(hover, pointer.over ? 1 : 0, dt, 0.12);
      press = still || !dt ? 0 : ease(press, pointer.down ? 1 : 0, dt, 0.05);
      const targetScale = still
        ? 1
        : 1 + live * (breathe + vl * 0.035 * heard + vs * 0.055 * said) + 0.02 * hover - 0.07 * press;
      const target = {
        speed: i * 0.18 + l * 0.3 + vl * 0.5 * heard + th * 0.6 + sp * 0.3 + vs * 1.2 * said,
        bright: i + l + th * 1.02 + sp + vl * 0.06 * heard + vs * 0.08 * said,
        aura: i * 0.38 + l * 0.42 + th * 0.45 + sp * 0.45 + vl * 0.25 * heard + vs * 0.3 * said,
        think: th,
        hue: th * 0.4,
        light: sp * 0.15 + vs * 0.4 * said + vl * 0.15 * heard + 0.1 * voice.low,
        warmth: voice.centroid * talk,
        shimmer: voice.hiss,
      };

      if (still || !dt) {
        scale.value = targetScale;
        scale.velocity = 0;
        Object.assign(eased, target);
        pulse = 0;
      } else {
        // A syllable: a kick on the spring and a flash of light.
        if (voice.onset > 0.05) {
          scale.velocity += voice.onset * 0.3 * live * (vs >= vl ? 1 : 0.6);
          pulse = Math.min(1, pulse + voice.onset * 0.5 * live);
        }
        scale.velocity += (STIFFNESS * (targetScale - scale.value) - DAMPING * scale.velocity) * dt;
        scale.value += scale.velocity * dt;
        pulse *= Math.exp(-dt / PULSE_DECAY);
        eased.speed = ease(eased.speed, target.speed, dt, 0.1);
        eased.bright = ease(eased.bright, target.bright, dt, 0.04);
        eased.aura = ease(eased.aura, target.aura, dt, 0.06);
        eased.light = ease(eased.light, target.light, dt, 0.05);
        eased.shimmer = ease(eased.shimmer, target.shimmer, dt, 0.05);
        eased.warmth = ease(eased.warmth, target.warmth, dt, 0.2);
        eased.think = ease(eased.think, target.think, dt);
        eased.hue = ease(eased.hue, target.hue, dt, 0.4);
        phase += eased.speed * dt * (0.6 + 0.4 * live);
        spin += (0.05 + 0.12 * eased.speed + spinVelocity) * dt;
        spinVelocity *= Math.exp(-dt / 0.9);
        tap.age += dt;
      }

      cached = {
        scale: Math.min(1.14, Math.max(0.92, scale.value)),
        phase,
        spin,
        bright: eased.bright,
        aura: eased.aura,
        think: eased.think,
        hue: eased.hue,
        level: Math.min(1, voice.env),
        pulse: pulse * Math.min(1, live),
        light: eased.light * Math.min(1.2, live),
        warmth: eased.warmth,
        shimmer: eased.shimmer * live,
        px: pointer.x,
        py: pointer.y,
        hover,
        tapX: tap.x,
        tapY: tap.y,
        tapAge: still ? 9 : tap.age,
        idle: weight.idle,
        listening: weight.listening,
        thinking: weight.thinking,
        speaking: weight.speaking,
      };
      return cached;
    },
  };
}
