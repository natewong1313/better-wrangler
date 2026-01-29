import { mkdirSync } from "fs";
import type { SyncResult } from "../types";
import { loadWorkerConfigs, filterWorkers, validateWorkers } from "./config-loader";
import { generateEntrypoint, generateWranglerConfigFile } from "./entrypoint";

const OUTPUT_DIR = ".better-wrangler";

export async function syncAll(
  configPath: string,
  workerFilter: string[],
  bustCache = false,
): Promise<SyncResult> {
  const allWorkers = await loadWorkerConfigs(configPath, bustCache);
  const selectedWorkers = filterWorkers(allWorkers, workerFilter);

  validateWorkers(selectedWorkers);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const configPaths = new Map<string, string>();

  for (const worker of selectedWorkers) {
    generateEntrypoint(worker);
    generateWranglerConfigFile(worker, configPaths);
  }

  return { workers: selectedWorkers, configPaths };
}
