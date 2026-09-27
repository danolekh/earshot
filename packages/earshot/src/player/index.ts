/* A conversation and where playback is in it, for every part inside: `Player.Root` with `src`
 * plays the recording; without, a virtual clock runs over the conversation. */
export * as Player from "./index.parts";
export type {
  PlayerRootProps,
  PlayerState,
  PlayerToggleProps,
  PlayerTimeProps,
  PlayerTimeState,
  PlayerRateProps,
  PlayerRateState,
  PlayerListenProps,
  PlayerListenState,
} from "./player";
export { useListening } from "./player";
export {
  describeEvent,
  DE_LABELS,
  EN_LABELS,
  useClockValue,
  useConversationValue,
  usePlayer,
  useSelected,
  type PlayerContextValue,
  type PlayerLabels,
} from "./context";
export { createMediaClock } from "./media-clock";
export { createSelection, type Selection, type SelectionStore } from "./selection";
