import type { SyncResult, WorkerConfig, Bindings } from "../types";
import { startDevServer, type DevServerResult } from "../../miniflare/dev-server";
import { syncAll } from "../sync";
import { ConfigWatcher } from "./watcher";
import { createLogger } from "../../logger";
import { startDevtools, type DevtoolsResult } from "../../devtools";

const log = createLogger("miniflare");

function buildEntryPaths(workers: WorkerConfig<Bindings>[]) {
  const entryPaths = new Map<string, string>();
  for (const worker of workers) {
    entryPaths.set(worker.name, `.better-wrangler/${worker.name}.entry.ts`);
  }
  return entryPaths;
}

/**
 * Runs dev mode using a single Miniflare instance.
 * Enables cross-worker Durable Object communication.
 */
export async function runMiniflareDevMode(
  configPath: string,
  workerFilter: string[],
  initialSyncResult: SyncResult,
) {
  log.info("Starting dev server with Miniflare (cross-worker DO enabled)...");

  let syncResult = initialSyncResult;
  let entryPaths = buildEntryPaths(syncResult.workers);

  let devServer: DevServerResult | null = await startDevServer(syncResult.workers, entryPaths, {
    baseDir: process.cwd(),
  });

  // Start devtools UI
  let devtools: DevtoolsResult | null = null;
  try {
    devtools = await startDevtools(syncResult.workers, devServer.urls, {
      miniflare: devServer.mf,
    });
    log.info(`Devtools: ${devtools.url}`);
  } catch (err) {
    log.warn("Failed to start devtools:", err);
  }

  const watcher = new ConfigWatcher(configPath);

  watcher.start(async () => {
    syncResult = await syncAll(configPath, workerFilter, true);
    entryPaths = buildEntryPaths(syncResult.workers);

    log.info("Restarting Miniflare...");
    if (devServer) {
      await devServer.stop();
    }
    devServer = await startDevServer(syncResult.workers, entryPaths, {
      baseDir: process.cwd(),
    });

    // Update devtools with new workers and Miniflare instance
    if (devtools) {
      devtools.updateWorkers(syncResult.workers, devServer.urls);
      devtools.updateMiniflare(devServer.mf);
    }
  });

  // Signal handlers don't properly await async functions, so we wrap the cleanup
  // in a synchronous function that handles the async work and ensures exit
  const cleanup = () => {
    watcher.stop();

    const doCleanup = async () => {
      try {
        if (devtools) {
          await devtools.stop();
        }
        if (devServer) {
          await devServer.stop();
        }
      } catch (err) {
        log.error("Error during cleanup:", err);
      } finally {
        process.exit(0);
      }
    };

    doCleanup();
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process alive
  await new Promise(() => {});
}
