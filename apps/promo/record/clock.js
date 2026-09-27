/* A virtual clock for the recorder, installed before the page's own scripts. Until `start()` the
 * page runs on real time. After it, time only moves in `step(ms)`: performance.now and Date.now
 * (and every event's timeStamp) return the virtual time, timers fire when it passes them, rAF callbacks run once per step, and
 * every CSS transition and animation is paused and set to how far the virtual clock has carried it
 * since it began. So each screenshot shows exactly one frame's worth of motion. */
(() => {
  const real = {
    now: performance.now.bind(performance),
    dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window),
    caf: window.cancelAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };
  let on = false;
  let now = 0;
  let epoch = 0;
  let nextId = 1e9;
  let frames = new Map();
  const timers = new Map();
  const begun = new WeakMap();

  performance.now = () => (on ? now : real.now());
  // Events carry the time they happened; drag velocity is measured from it.
  const stamp = Object.getOwnPropertyDescriptor(Event.prototype, "timeStamp").get;
  Object.defineProperty(Event.prototype, "timeStamp", {
    get() {
      return on ? now : stamp.call(this);
    },
  });
  Date.now = () => (on ? epoch + now : real.dateNow());

  window.requestAnimationFrame = (cb) => {
    if (!on) return real.raf(cb);
    const id = ++nextId;
    frames.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => (frames.delete(id) ? undefined : real.caf(id));

  const timer =
    (repeat) =>
    (cb, delay = 0, ...args) => {
      if (!on) return (repeat ? real.setInterval : real.setTimeout)(cb, delay, ...args);
      const id = ++nextId;
      timers.set(id, { at: now + Math.max(0, delay), every: repeat ? Math.max(1, delay) : 0, cb, args });
      return id;
    };
  window.setTimeout = timer(false);
  window.setInterval = timer(true);
  window.clearTimeout = (id) => (timers.delete(id) ? undefined : real.clearTimeout(id));
  window.clearInterval = (id) => (timers.delete(id) ? undefined : real.clearInterval(id));

  const run = (cb, args) => {
    try {
      if (typeof cb === "function") cb(...args);
    } catch (e) {
      console.error(e);
    }
  };

  // Pauses each animation it hasn't seen (as begun at `startedAt`) and sets every one to how far
  // the clock has carried it.
  const hold = (startedAt = now) => {
    for (const a of document.getAnimations()) {
      if (!begun.has(a)) {
        begun.set(a, startedAt);
        a.pause();
      }
      const t = now - begun.get(a);
      const end = a.effect?.getComputedTiming().endTime ?? 0;
      if (Number.isFinite(end) && t >= end) a.finish();
      else a.currentTime = t;
    }
  };

  window.__clock = {
    start() {
      now = real.now();
      epoch = real.dateNow() - now;
      on = true;
      hold();
    },
    step(ms) {
      const target = now + ms;
      // Timers in order, each at its own time.
      for (;;) {
        let next;
        for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        run(t.cb, t.args);
      }
      // Advance what's running before this frame's callbacks can retarget it: a transition that
      // gets replaced must hand over its advanced value, not its start. Ones started by input since
      // the last frame count from then.
      const last = now;
      now = target;
      hold(last);
      const due = frames;
      frames = new Map();
      for (const cb of due.values()) run(cb, [now]);
      hold();
    },
  };
})();
