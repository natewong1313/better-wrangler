import { join } from "node:path";
import { context, type BuildOptions, type BuildContext, Plugin } from "esbuild";

export type BundleContext = {
  /**
   * esbuild build context
   */
  ctx: BuildContext;
  /**
   * The script to bundle
   */
  initialScript: string;
  /**
   * Starts watching for file changes - needed for hot reloading
   */
  watch: () => Promise<void>;
  /**
   * Stops watching and cleans up
   */
  dispose: () => Promise<void>;
  /**
   * Sets the callback to invoke when a rebuild completes
   */
  setOnRebuild: (callback: (script: string) => void) => void;
};

/**
 * Creates an esbuild context and builds the script
 * this invokes the onRebuild callback when a file changes
 */
export async function createBundleContext(
  entryPath: string,
  baseDir: string,
  onRebuild?: (script: string) => void,
): Promise<BundleContext> {
  const absoluteEntryPath = join(baseDir, entryPath);

  // Use a mutable ref so the callback can be updated after context creation
  const callbackRef = { current: onRebuild ?? (() => {}) };

  const rebuildPlugin: Plugin = {
    name: "rebuild-notify",
    setup(build) {
      let isInitialBuild = true;
      build.onEnd((result) => {
        // Initial build is handled separately
        if (isInitialBuild) {
          isInitialBuild = false;
          return;
        }

        if (result.errors.length > 0) {
          // Errors should be logged by esbuild
          return;
        }

        if (result.outputFiles && result.outputFiles.length > 0) {
          // Bundled script
          const script = result.outputFiles[0].text;
          callbackRef.current(script);
        }
      });
    },
  };

  const buildOptions: BuildOptions = {
    entryPoints: [absoluteEntryPath],
    bundle: true,
    write: false,
    format: "esm",
    target: "esnext",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser", "import", "default"],
    external: ["cloudflare:*", "node:*"],
    keepNames: true, // Needed for DO class matching
    sourcemap: "inline", // For debugging
    plugins: [rebuildPlugin],
  };

  const ctx = await context(buildOptions);

  // Initial build
  const initialResult = await ctx.rebuild();

  if (!initialResult.outputFiles || initialResult.outputFiles.length === 0) {
    await ctx.dispose();
    throw new Error(`Failed to bundle worker code at ${entryPath}`);
  }

  const initialScript = initialResult.outputFiles[0].text;

  return {
    ctx,
    initialScript,
    watch: () => ctx.watch(),
    dispose: () => ctx.dispose(),
    setOnRebuild: (callback: (script: string) => void) => {
      callbackRef.current = callback;
    },
  };
}
