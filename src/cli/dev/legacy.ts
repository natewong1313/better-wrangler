import type { SyncResult } from "../types";
import { startWranglerProcesses, killAllProcesses } from "../utils/process";
import { syncAll } from "../sync";
import { ConfigWatcher } from "./watcher";
import { createLogger } from "../../logger";

const log = createLogger("legacy");

/**
 * Runs dev mode using separate wrangler processes per worker.
 * Does NOT support cross-worker Durable Objects.
 */
export async function runLegacyDevMode(
  configPath: string,
  workerFilter: string[],
  initialSyncResult: SyncResult,
) {
  log.info("Starting dev mode with legacy wrangler processes...");
  log.warn("Cross-worker Durable Objects will NOT work in this mode.");

  let syncResult = initialSyncResult;
  let wranglerProcesses = startWranglerProcesses(syncResult.workers, syncResult.configPaths);

  const watcher = new ConfigWatcher(configPath);

  watcher.start(async () => {
    syncResult = await syncAll(configPath, workerFilter, true);

    log.info("Restarting wrangler processes...");
    killAllProcesses(wranglerProcesses);
    wranglerProcesses = startWranglerProcesses(syncResult.workers, syncResult.configPaths);
  });

  const cleanup = () => {
    watcher.stop();
    killAllProcesses(wranglerProcesses);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
