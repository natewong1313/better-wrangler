import type { SyncResult } from "../types";
import { startWranglerProcesses, killAllProcesses } from "../utils/process";
import { syncAll } from "../sync";
import { ConfigWatcher } from "./watcher";

/**
 * Runs dev mode using separate wrangler processes per worker.
 * Does NOT support cross-worker Durable Objects.
 */
export async function runLegacyDevMode(
  configPath: string,
  workerFilter: string[],
  initialSyncResult: SyncResult,
) {
  console.log("\nStarting dev mode with legacy wrangler processes...");
  console.log(
    "NOTE: Cross-worker Durable Objects will NOT work in this mode.\n",
  );

  let syncResult = initialSyncResult;
  let wranglerProcesses = startWranglerProcesses(
    syncResult.workers,
    syncResult.configPaths,
  );

  const watcher = new ConfigWatcher(configPath);

  watcher.start(async () => {
    syncResult = await syncAll(configPath, workerFilter, true);

    console.log("Restarting wrangler processes...\n");
    killAllProcesses(wranglerProcesses);
    wranglerProcesses = startWranglerProcesses(
      syncResult.workers,
      syncResult.configPaths,
    );
  });

  const cleanup = () => {
    watcher.stop();
    killAllProcesses(wranglerProcesses);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
