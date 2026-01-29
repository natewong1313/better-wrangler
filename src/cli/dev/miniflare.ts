import type { SyncResult, WorkerConfig, Bindings } from "../types";
import { startDevServer, type DevServerResult } from "../../miniflare/dev-server";
import { syncAll } from "../sync";
import { ConfigWatcher } from "./watcher";

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
  console.log(
    "\nStarting dev server with Miniflare (cross-worker DO enabled)...\n",
  );

  let syncResult = initialSyncResult;
  let entryPaths = buildEntryPaths(syncResult.workers);

  let devServer: DevServerResult | null = await startDevServer(
    syncResult.workers,
    entryPaths,
    { baseDir: process.cwd() },
  );

  const watcher = new ConfigWatcher(configPath);

  watcher.start(async () => {
    syncResult = await syncAll(configPath, workerFilter, true);
    entryPaths = buildEntryPaths(syncResult.workers);

    console.log("Restarting Miniflare...\n");
    if (devServer) {
      await devServer.stop();
    }
    devServer = await startDevServer(syncResult.workers, entryPaths, {
      baseDir: process.cwd(),
    });
  });

  const cleanup = async () => {
    watcher.stop();
    if (devServer) {
      await devServer.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Keep the process alive
  await new Promise(() => {});
}
