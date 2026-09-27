/* Where playback is. The parts that follow it (a highlighted word, the playhead) read the time
 * every frame without re-rendering; this is what they read. A player backs it with an <audio>
 * element; a virtual clock runs on requestAnimationFrame for a demo or a recording with no audio. */

export interface Clock {
  /** Seconds. */
  time(): number;
  playing(): boolean;
  duration(): number;
  /** Called on every change of time or state: every frame while playing. */
  subscribe(listener: () => void): () => void;
  seek(t: number): void;
  play(): void;
  pause(): void;
  rate(): number;
  setRate(rate: number): void;
}

export interface VirtualClockEnv {
  now: () => number;
  requestFrame: (cb: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
}

const browserEnv = (): VirtualClockEnv => ({
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
});

/** A clock with no audio behind it, running from 0 to `duration` in real time (times `rate`). */
export function createVirtualClock(
  duration: number,
  options: { loop?: boolean; env?: VirtualClockEnv } = {},
): Clock & { setDuration(d: number): void; setLoop(loop: boolean): void } {
  const env = options.env ?? browserEnv();
  const listeners = new Set<() => void>();
  let time = 0;
  let rate = 1;
  let playing = false;
  let raf = 0;
  let last = 0;
  let length = duration;
  let loop = options.loop ?? false;
  const emit = () => listeners.forEach((l) => l());

  const tick = (now: number) => {
    raf = 0;
    if (!playing) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    time += dt * rate;
    if (time >= length) {
      if (loop) time %= Math.max(length, 1e-6);
      else {
        time = length;
        playing = false;
      }
    }
    emit();
    if (playing) raf = env.requestFrame(tick);
  };

  return {
    time: () => time,
    playing: () => playing,
    duration: () => length,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    seek(t) {
      time = Math.min(length, Math.max(0, t));
      emit();
    },
    play() {
      if (playing) return;
      if (time >= length) time = 0;
      playing = true;
      last = 0;
      raf = env.requestFrame(tick);
      emit();
    },
    pause() {
      if (!playing) return;
      playing = false;
      if (raf) env.cancelFrame(raf);
      raf = 0;
      emit();
    },
    rate: () => rate,
    setRate(r) {
      rate = r;
      emit();
    },
    setDuration(d) {
      if (d === length) return;
      length = d;
      emit();
    },
    setLoop(next) {
      loop = next;
    },
  };
}
