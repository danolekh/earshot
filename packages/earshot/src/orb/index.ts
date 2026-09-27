/* A voice agent's presence: state and loudness as CSS variables on `Orb.Root`, drawn live by
 * `Orb.Shader` on the page's shared WebGL2 context. */
export * as Orb from "./index.parts";
export type { OrbRootProps, OrbRootState, OrbShaderProps, OrbShaderState, OrbState } from "./orb";
export { ORB_INPUTS, createOrbDriver, type OrbDriver, type OrbSample } from "./driver";
export { ORB } from "./presets";
