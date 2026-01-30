import { findConfigFile } from "../utils/config-file";
import {
  checkWranglerInstalled,
  wranglerDeploy,
  wranglerD1Migrate,
  extractD1Databases,
  type D1DatabaseInfo,
} from "../utils/wrangler";
import {
  findMissingResources,
  createResources,
  countMissingResources,
  formatMissingResources,
  type CreatedResource,
} from "../utils/resources";
import {
  parseConfigFile,
  saveConfigFile,
  getBindingId,
  updateBindingId,
  findWorkerVariableName,
} from "../utils/ast-modifier";
import { syncAll } from "../sync";
import { promptConfirm } from "../utils/prompts";
import { createLogger } from "../../logger";

const log = createLogger("deploy");

export interface DeployOptions {
  env?: string;
  dryRun?: boolean;
  create?: boolean;
  noCreate?: boolean;
}

interface DeployResult {
  workerName: string;
  success: boolean;
  url?: string;
  error?: string;
}

interface MigrationResult {
  databaseName: string;
  success: boolean;
  migrationsApplied?: number;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

export async function deployCommand(workerFilter: string[], options: DeployOptions): Promise<void> {
  console.log("\n  better-wrangler deploy\n");

  // Check wrangler is installed
  const wranglerInstalled = await checkWranglerInstalled();
  if (!wranglerInstalled) {
    console.error("Error: wrangler is required for deployment.");
    console.error("  Install with: npm install -g wrangler");
    console.error("  Or: bun add -g wrangler");
    process.exit(1);
  }

  // Find config file
  let configPath: string;
  try {
    configPath = await findConfigFile();
  } catch {
    console.error("Error: No config file found.");
    console.error("  Run 'bw init' to create a new bw.config.ts file.");
    process.exit(1);
  }

  // Sync configs
  log.info("Syncing configs");
  let syncResult;
  try {
    syncResult = await syncAll(configPath, workerFilter);
  } catch (error) {
    console.error("Error: Failed to sync configs.");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const { workers, configPaths } = syncResult;

  if (workers.length === 0) {
    if (workerFilter.length > 0) {
      console.error(`Error: No workers found matching: ${workerFilter.join(", ")}`);
    } else {
      console.error("Error: No workers found in config file.");
    }
    process.exit(1);
  }

  for (const [workerName, workerConfigPath] of configPaths) {
    console.log(`  ✓ Generated ${workerConfigPath}`);
  }
  console.log("");

  // Check for missing resources
  log.info("Checking resources");
  const missing = await findMissingResources(workers, options.env, (msg) => log.debug(msg));
  const missingCount = countMissingResources(missing);

  if (missingCount > 0) {
    console.log(`\nMissing resources (${missingCount}):`);
    for (const line of formatMissingResources(missing)) {
      console.log(line);
    }
    console.log("");

    if (options.noCreate) {
      // Strict mode: fail immediately
      console.error("Error: Missing resources detected. Cannot deploy with --no-create flag.");
      console.error("\nTo create these resources:");
      console.error("  - Run: bw deploy --create");
      console.error("  - Or: bw create");
      process.exit(1);
    }

    // Determine if we should create resources
    let shouldCreate = options.create;
    if (!shouldCreate) {
      shouldCreate = await promptConfirm(
        `Create ${missingCount} missing resource(s) before deploying?`,
        true,
      );
    }

    if (!shouldCreate) {
      console.log("Deployment cancelled. Create resources first with 'bw create'.");
      process.exit(1);
    }

    // Create the missing resources
    log.info("Creating resources");
    let created: CreatedResource[];
    try {
      created = await createResources(missing, options.env, (msg) => log.debug(msg));
    } catch (error) {
      console.error(
        `\nError creating resources: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }

    // Update config file with new IDs
    const resourcesWithIds = created.filter((r) => r.id);
    if (resourcesWithIds.length > 0) {
      log.info("Updating config file");
      await updateConfigWithCreatedResources(configPath, workers, resourcesWithIds, options.create);

      // Re-sync to pick up the new IDs
      log.info("Re-syncing configs");
      try {
        syncResult = await syncAll(configPath, workerFilter, true);
      } catch (error) {
        console.error("Error: Failed to re-sync configs.");
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    }

    console.log("");
  } else {
    console.log("  ✓ All resources exist\n");
  }

  // Collect all D1 databases across workers (deduplicate by name)
  const allDatabases = new Map<string, D1DatabaseInfo>();
  for (const worker of workers) {
    if (worker.bindings) {
      const databases = extractD1Databases(worker.bindings);
      for (const db of databases) {
        // Only add if not already present (first one wins for migrationsDir)
        if (!allDatabases.has(db.name)) {
          allDatabases.set(db.name, db);
        }
      }
    }
  }

  // Run D1 migrations
  const migrationResults: MigrationResult[] = [];
  if (allDatabases.size > 0) {
    log.info("Running D1 migrations");

    for (const [dbName, dbInfo] of allDatabases) {
      process.stdout.write(`  Migrating ${dbName}...`);

      const result = await wranglerD1Migrate({
        databaseName: dbName,
        migrationsDir: dbInfo.migrationsDir,
        env: options.env,
        onOutput: (data) => {
          // Print verbose output
          process.stdout.write(
            "\n" +
              data
                .split("\n")
                .map((line) => `    ${line}`)
                .join("\n"),
          );
        },
      });

      migrationResults.push({
        databaseName: dbName,
        ...result,
      });

      if (result.skipped) {
        console.log(` skipped (${result.skipReason})`);
      } else if (result.success) {
        const count = result.migrationsApplied;
        console.log(count !== undefined ? ` ✓ ${count} migrations applied` : " ✓ done");
      } else {
        console.log(" ✗ failed");
      }
    }

    // Check for migration failures
    const failedMigrations = migrationResults.filter((r) => !r.success && !r.skipped);
    if (failedMigrations.length > 0) {
      console.log("");
      console.error("Migration errors:");
      for (const failed of failedMigrations) {
        console.error(`  ${failed.databaseName}: ${failed.error}`);
      }
      console.log("");

      const shouldContinue = await promptConfirm(
        "Some migrations failed. Continue with deployment anyway?",
        false,
      );
      if (!shouldContinue) {
        console.log("Deployment aborted.");
        process.exit(1);
      }
    }

    console.log("");
  }

  // Deploy workers
  if (options.dryRun) {
    console.log("Dry run - would deploy the following workers:");
    for (const worker of workers) {
      console.log(`  - ${worker.name}`);
    }
    console.log("");
    return;
  }

  log.info("Deploying workers");
  const deployResults: DeployResult[] = [];

  for (const worker of workers) {
    const workerConfigPath = configPaths.get(worker.name);
    if (!workerConfigPath) {
      deployResults.push({
        workerName: worker.name,
        success: false,
        error: "Config path not found",
      });
      continue;
    }

    log.info(`Deploying ${worker.name}`);

    const result = await wranglerDeploy({
      configPath: workerConfigPath,
      env: options.env,
      dryRun: false,
      onOutput: (data) => {
        // Print verbose output with indentation
        const lines = data.split("\n").filter((line) => line.trim());
        for (const line of lines) {
          console.log(`    ${line}`);
        }
      },
    });

    deployResults.push({
      workerName: worker.name,
      ...result,
    });

    if (result.success) {
      if (result.url) {
        console.log(`  ✓ Deployed ${worker.name} (${result.url})`);
      } else {
        console.log(`  ✓ Deployed ${worker.name}`);
      }
    } else {
      console.log(`  ✗ Failed to deploy ${worker.name}`);
    }
  }

  // Summary
  console.log("\n" + "─".repeat(50));
  const successful = deployResults.filter((r) => r.success);
  const failed = deployResults.filter((r) => !r.success);

  if (successful.length > 0) {
    console.log(`\n✓ Successfully deployed ${successful.length} worker(s):`);
    for (const result of successful) {
      if (result.url) {
        console.log(`  - ${result.workerName}: ${result.url}`);
      } else {
        console.log(`  - ${result.workerName}`);
      }
    }
  }

  if (failed.length > 0) {
    console.log(`\n✗ Failed to deploy ${failed.length} worker(s):`);
    for (const result of failed) {
      console.log(`  - ${result.workerName}: ${result.error}`);
    }
    process.exit(1);
  }

  console.log("\nDeploy complete!\n");
}

/**
 * Update config file with created resource IDs
 */
async function updateConfigWithCreatedResources(
  configPath: string,
  workers: Array<{ name: string; bindings?: Record<string, unknown> }>,
  created: CreatedResource[],
  skipPrompts = false,
): Promise<void> {
  const configInfo = parseConfigFile(configPath);

  // Build a map of binding name to worker variable name
  const bindingToWorkerVar = new Map<string, string>();
  for (const worker of workers) {
    const varName = findWorkerVariableName(configInfo, worker.name);
    if (!varName || !worker.bindings) continue;

    for (const bindingName of Object.keys(worker.bindings)) {
      bindingToWorkerVar.set(bindingName, varName);
    }
  }

  let updatedCount = 0;

  for (const resource of created) {
    if (!resource.id) continue;

    const workerVarName = bindingToWorkerVar.get(resource.bindingName);
    if (!workerVarName) {
      console.log(`  ⚠ Could not find worker for binding "${resource.bindingName}"`);
      continue;
    }

    // Check if binding already has an ID
    const existingId = getBindingId(configInfo, workerVarName, resource.bindingName);

    if (existingId) {
      // Prompt before overwriting
      if (!skipPrompts) {
        const shouldUpdate = await promptConfirm(
          `Binding ${resource.bindingName} already has id "${existingId}". Update to "${resource.id}"?`,
          false,
        );
        if (!shouldUpdate) {
          console.log(`  Skipped ${resource.bindingName}`);
          continue;
        }
      }
    }

    try {
      updateBindingId(configInfo, workerVarName, resource.bindingName, resource.id);
      console.log(`  ✓ Updated ${resource.bindingName} with id: ${resource.id}`);
      updatedCount++;
    } catch (error) {
      console.log(
        `  ✗ Failed to update ${resource.bindingName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (updatedCount > 0) {
    await saveConfigFile(configInfo.sourceFile);
    console.log(`  ✓ Saved ${configPath}`);
  }
}
