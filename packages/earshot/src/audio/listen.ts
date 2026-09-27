/* Which side of a call you hear: mute and solo per speaker, as in a mixer. Solo wins over mute,
 * and more than one side can be soloed. Framework-free; `Player.Root` keeps one per call and routes
 * the recording through `mixChannels` once something is muted or soloed. */
import type { Role } from "../core/types";

export interface Listening {
  muted: readonly Role[];
  soloed: readonly Role[];
}

/** Whether a side is heard. */
export const audible = (l: Listening, side: Role): boolean =>
  l.soloed.length ? l.soloed.includes(side) : !l.muted.includes(side);

const flip = (list: readonly Role[], side: Role) =>
  list.includes(side) ? list.filter((s) => s !== side) : [...list, side];

export const toggleMute = (l: Listening, side: Role): Listening => ({ ...l, muted: flip(l.muted, side) });
export const toggleSolo = (l: Listening, side: Role): Listening => ({ ...l, soloed: flip(l.soloed, side) });

/** Each file channel's gain, in the recording's channel order (`null`: a channel that's no side,
 * left as it is). */
export function gainsFor(l: Listening, channels: readonly (Role | null)[]): [number, number] {
  const g = (i: number) => {
    const side = channels[i];
    return side === undefined || side === null || audible(l, side) ? 1 : 0;
  };
  return [g(0), g(1)];
}

export interface ListeningStore {
  get(): Listening;
  set(next: Listening): void;
  subscribe(listener: () => void): () => void;
}

/** Everyone heard, to start with. Listeners are told at once (in the click that changed it), so a
 * mix built on the first change starts inside the gesture browsers ask for. */
export function createListening(initial: Listening = { muted: [], soloed: [] }): ListeningStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
