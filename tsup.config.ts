import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  platform: "neutral",
  env: {
    HODOKU_TRACE: "",
    HODOKU_DEBUG_STEPS: "",
    HODOKU_DEBUG_ALS: "",
    DBG_CNL: "",
  },
});
