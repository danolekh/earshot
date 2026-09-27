/* The call laid out in time: a waveform, a lane of turns per speaker, markers for tool calls,
 * latency and verdicts, a playhead, and a keyboard scrubber over all of it. */
export * as Timeline from "./index.parts";
export type {
  TimelineRootProps,
  TimelineRootState,
  TimelineScrubberProps,
  TimelineScrubberState,
  TimelinePlayheadProps,
  TimelineLaneProps,
  TimelineLaneState,
  TimelineSegmentsProps,
  TimelineSegmentProps,
  TimelineSegmentState,
  TimelineMarkersProps,
  TimelineMarkerProps,
  TimelineMarkerState,
  TimelineWaveformProps,
  TimelineWaveformState,
  TimelineRulerProps,
  TimelineRulerState,
  TimelineSkimmerProps,
  TimelineSkimmerState,
  SkimInfo,
  TimelineOverlapsProps,
  TimelineOverlapProps,
  TimelineOverlapState,
} from "./timeline";
export {
  applyKeyAction,
  scrubberKey,
  type KeyAction,
  type KeyInput,
  type KeyOptions,
  type KeyTargets,
  type Mark,
} from "./keys";
export {
  clampView,
  createViewport,
  isFullView,
  ticks,
  viewAround,
  zoomView,
  type View,
  type Viewport,
} from "./viewport";
export { laneStyle, placeStyle, placeVar, type LaneSize } from "./place";
export {
  hidesEveryLane,
  laneRows,
  lanesShown,
  onlyLanes,
  showLanes,
  toggleLanes,
  type LaneRow,
} from "./lanes";
export { canvasScale, driveLane, type LaneFrame, type LaneRenderer, type ViewSource } from "./renderer";
export { createWaveformRenderer, type WaveformOptions, type WaveformSource } from "./canvas2d";
export type {
  TimelineItemProps,
  TimelineSpansProps,
  TimelineSpanProps,
  TimelineSpanState,
  TimelineSignalsProps,
  TimelineSignalProps,
  TimelineSignalState,
  TimelineWordsProps,
  TimelineWordProps,
  TimelineWordState,
  TimelineFindingsProps,
  TimelineFindingProps,
  TimelineFindingState,
  TimelineFindingClusterProps,
  TimelineFindingClusterState,
} from "./trace-lanes";
export {
  clusterByPixels,
  layoutSpans,
  packRows,
  STAGE_ORDER,
  worst,
  type Cluster,
  type PlacedSpan,
} from "./layout";
