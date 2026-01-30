import { mkdirSync } from "fs";
import type { SyncResult } from "../types";
import { loadWorkerConfigs, filterWorkers, validateWorkers } from "./config-loader";
import { generateEntrypoint, generateWranglerConfigFile } from "./entrypoint";
import { loadMigrationState, saveMigrationState, type MigrationState } from "../../migrations";

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

  // Load existing migration state
  const projectRoot = process.cwd();
  let migrationState: MigrationState = loadMigrationState(projectRoot);

  for (const worker of selectedWorkers) {
    generateEntrypoint(worker);
    const { updatedMigrationState } = generateWranglerConfigFile(
      worker,
      configPaths,
      migrationState,
    );

    // Update state for next worker (migrations are per-worker)
    if (updatedMigrationState) {
      migrationState = updatedMigrationState;
    }
  }

  // Save updated migration state
  saveMigrationState(projectRoot, migrationState);

  return { workers: selectedWorkers, configPaths };
}
