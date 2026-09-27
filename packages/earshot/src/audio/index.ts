/* Signal for the orb and visualizers: from a stream, a media element, values you set, or a
 * conversation's script; loudness plus what the voice is doing. */
export {
  fromMediaElement,
  fromMediaStream,
  manualSource,
  scriptedSource,
  type AnalyserOptions,
  type AudioSource,
} from "./source";
export { perceivedLevel } from "./level";
export { mixChannels, type ChannelMix } from "./mix";
export {
  audible,
  createListening,
  gainsFor,
  toggleMute,
  toggleSolo,
  type Listening,
  type ListeningStore,
} from "./listen";
export {
  createFeatureTracker,
  SILENT,
  type FeatureTracker,
  type TrackerOptions,
  type VoiceFeatures,
} from "./features";
