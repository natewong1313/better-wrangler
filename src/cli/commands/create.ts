import { findConfigFile } from "../utils/config-file";
import {
  findMissingResources,
  createResources,
  countMissingResources,
  formatMissingResources,
  type MissingResources,
  type CreatedResource,
} from "../utils/resources";
import {
  parseConfigFile,
  saveConfigFile,
  getBindingId,
  updateBindingId,
  findWorkerVariableName,
} from "../utils/ast-modifier";
import { promptConfirm } from "../utils/prompts";
import { loadWorkerConfigs } from "../sync/config-loader";
import { createLogger } from "../../logger";

const log = createLogger("create");

export type ResourceTypeFilter = "kv" | "d1" | "r2" | "queue";

export interface CreateOptions {
  env?: string;
  all?: boolean;
}

export async function createCommand(
  resourceType?: ResourceTypeFilter,
  options: CreateOptions = {},
): Promise<void> {
  console.log("\n  better-wrangler create\n");

  // Find config file
  let configPath: string;
  try {
    configPath = await findConfigFile();
  } catch {
    console.error("Error: No config file found.");
    console.error("  Run 'bw init' to create a new bw.config.ts file.");
    process.exit(1);
  }

  // Load worker configs
  let workers;
  try {
    workers = await loadWorkerConfigs(configPath);
  } catch (error) {
    console.error("Error: Failed to load worker configs.");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (workers.length === 0) {
    console.error("Error: No workers found in config file.");
    process.exit(1);
  }

  // Find missing resources
  log.info("Checking resources");
  let missing = await findMissingResources(workers, options.env, (msg) => log.debug(msg));

  // Filter by resource type if specified
  if (resourceType) {
    missing = filterMissingByType(missing, resourceType);
  }

  const missingCount = countMissingResources(missing);

  if (missingCount === 0) {
    console.log("\n✓ All resources exist!\n");
    return;
  }

  // Show what's missing
  console.log(`\nMissing resources (${missingCount}):`);
  for (const line of formatMissingResources(missing)) {
    console.log(line);
  }
  console.log("");

  // Prompt or auto-create
  let shouldCreate = options.all;
  if (!shouldCreate) {
    shouldCreate = await promptConfirm(`Create ${missingCount} missing resource(s)?`, true);
  }

  if (!shouldCreate) {
    console.log("Aborted.\n");
    return;
  }

  // Create resources
  log.info("Creating resources");
  let created: CreatedResource[];
  try {
    created = await createResources(missing, options.env, (msg) => log.debug(msg));
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  if (created.length === 0) {
    console.log("\nNo resources were created.\n");
    return;
  }

  // Update config file with new IDs
  const resourcesWithIds = created.filter((r) => r.id);
  if (resourcesWithIds.length > 0) {
    log.info("Updating config file");
    await updateConfigWithCreatedResources(configPath, workers, resourcesWithIds, options.all);
  }

  console.log(`\n✓ Done! Created ${created.length} resource(s).\n`);
}

function filterMissingByType(
  missing: MissingResources,
  type: ResourceTypeFilter,
): MissingResources {
  return {
    kv: type === "kv" ? missing.kv : [],
    d1: type === "d1" ? missing.d1 : [],
    r2: type === "r2" ? missing.r2 : [],
    queues: type === "queue" ? missing.queues : [],
  };
}

async function updateConfigWithCreatedResources(
  configPath: string,
  workers: Array<{ name: string; bindings?: Record<string, unknown> }>,
  created: CreatedResource[],
  skipPrompts = false,
): Promise<void> {
  // Parse the config file for AST modification
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
