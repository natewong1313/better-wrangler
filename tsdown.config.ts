import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/preload.ts", "src/mocks/durable-object.mock.ts"],
  outDir: "dist",
  format: "esm",
  dts: true,
  external: [/^[^./]/], // Mark all non-relative imports as external
  clean: true,
});
