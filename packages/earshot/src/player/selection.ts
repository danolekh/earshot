/* What the person looking at a call has picked: a turn, a span, a finding. One store per player,
 * so picking in the timeline highlights the transcript and fills an inspector, and the other way
 * round. Framework-free; parts read it through `useSelected`. */

export interface Selection {
  turnId?: string;
  spanId?: string;
  findingId?: string;
}

export interface SelectionStore {
  get(): Selection;
  set(next: Selection): void;
  subscribe(listener: () => void): () => void;
}

export function createSelection(initial: Selection = {}): SelectionStore {
  let value: Selection = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (next.turnId === value.turnId && next.spanId === value.spanId && next.findingId === value.findingId)
        return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
