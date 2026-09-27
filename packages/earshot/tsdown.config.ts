import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/core/index.ts",
    "src/formats/index.ts",
    "src/audio/index.ts",
    "src/player/index.ts",
    "src/transcript/index.ts",
    "src/timeline/index.ts",
    "src/orb/index.ts",
    "src/visualizer/index.ts",
    "src/trace/index.ts",
    "src/review/index.ts",
    "src/inspector/index.ts",
  ],
  format: "esm",
  platform: "browser",
  target: "es2022",
  dts: true,
  // One output file per source file, so each keeps its own "use client" and trees shake cleanly.
  unbundle: true,
  external: [/^react($|\/)/, /^react-dom($|\/)/, /^@base-ui\/react($|\/)/, /^@danolekh\/gl$/],
  clean: true,
  inputOptions: {
    // With `unbundle` no module is merged into another, so the directive-merging warning is moot;
    // scripts/check-directives.mjs verifies every one survived.
    onLog(level, log, handler) {
      if (log.code === "MODULE_LEVEL_DIRECTIVE") return;
      handler(level, log);
    },
  },
});
