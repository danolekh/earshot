/* Solo and mute for a two-channel recording (a call: caller left, agent right). The element is
 * routed through Web Audio once, and each channel's gain eases to its new value so a change doesn't
 * click. With both channels audible the recording plays as it is; with only one, that one plays in
 * both ears, since a call side panned hard into one ear is hard to listen to on its own. */
import { routeElement } from "./source";

export interface ChannelMix {
  /** How loud each channel plays, 0 (muted) to 1, in the file's channel order. */
  set(gains: readonly [number, number]): void;
  /** Plays the recording as it is again, and lets go of the mix's nodes. */
  dispose(): void;
}

export function mixChannels(element: HTMLMediaElement, options: { context?: AudioContext } = {}): ChannelMix {
  const { context, node } = routeElement(element, options.context);
  const splitter = context.createChannelSplitter(2);
  const merger = context.createChannelMerger(2);
  // [from][to]: left to left, left to right, right to left, right to right.
  const route = [0, 1].map((from) =>
    [0, 1].map((to) => {
      const gain = context.createGain();
      gain.gain.value = from === to ? 1 : 0;
      splitter.connect(gain, from);
      gain.connect(merger, 0, to);
      return gain;
    }),
  );
  node.disconnect(context.destination);
  node.connect(splitter);
  merger.connect(context.destination);
  // Autoplay rules can start a context suspended; a routed element is silent until it resumes.
  const resume = () => void context.resume();
  resume();
  element.addEventListener("play", resume);

  const ease = (param: AudioParam, value: number) => param.setTargetAtTime(value, context.currentTime, 0.01);
  return {
    set([left, right]) {
      const alone = left > 0 !== right > 0;
      for (const from of [0, 1]) {
        const g = from === 0 ? left : right;
        for (const to of [0, 1]) ease(route[from]![to]!.gain, from === to || alone ? g : 0);
      }
    },
    dispose() {
      element.removeEventListener("play", resume);
      node.disconnect(splitter);
      merger.disconnect();
      node.connect(context.destination);
    },
  };
}
