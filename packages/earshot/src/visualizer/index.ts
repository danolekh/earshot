/* Visuals that move with a voice: bars, a scrolling waveform, a ring and a dot grid, on one engine
 * that rises fast, falls slow, holds its peaks and gives each state its own motion. */
export * as Visualizer from "./index.parts";
export type {
  VisualizerRootProps,
  VisualizerRootState,
  VisualizerBarsProps,
  VisualizerBarProps,
  VisualizerBarState,
  VisualizerHistoryProps,
  VisualizerRadialProps,
  VisualizerMatrixProps,
} from "./visualizer";
export {
  approach,
  createVisualizerEngine,
  type EngineOptions,
  type VisualizerFrame,
  type VisualizerState,
} from "./engine";
