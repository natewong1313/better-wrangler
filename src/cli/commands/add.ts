import {
  promptResourceType,
  promptWorkerSelection,
  promptBindingConfig,
  promptWorkerConfig,
  type ResourceType,
} from "../utils/prompts";
import {
  parseConfigFile,
  addBindingToWorker,
  addWorkerToConfig,
  saveConfigFile,
  workerNameToVariableName,
  ConfigError,
} from "../utils/ast-modifier";
import { findConfigFile } from "../utils/config-file";
import { createLogger } from "../../logger";

const log = createLogger("add");

const VALID_RESOURCES = ["d1", "kv", "r2", "do", "durable-object", "queue", "worker"] as const;
type ValidResource = (typeof VALID_RESOURCES)[number];

function normalizeResourceType(resource: string): ResourceType | null {
  const normalized = resource.toLowerCase();
  if (normalized === "durable-object") return "do";
  if (VALID_RESOURCES.includes(normalized as ValidResource)) {
    return normalized as ResourceType;
  }
  return null;
}

export async function addCommand(resourceArg?: string): Promise<void> {
  // Find the config file
  let configPath: string;
  try {
    configPath = await findConfigFile();
  } catch {
    console.error("Error: No config file found.");
    console.error("  Run 'bw init' to create a new bw.config.ts file.");
    process.exit(1);
  }

  // Parse the config file
  let configInfo;
  try {
    configInfo = parseConfigFile(configPath);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Error: Failed to parse config file`);
      console.error(`  ${error.message}`);
    } else {
      console.error(`Error: Failed to parse config file`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }

  // Determine resource type
  let resourceType: ResourceType;

  if (resourceArg) {
    const normalized = normalizeResourceType(resourceArg);
    if (!normalized) {
      console.error(`Error: Unknown resource type "${resourceArg}"`);
      console.error(`  Available resources: d1, kv, r2, do, queue, worker`);
      process.exit(1);
    }
    resourceType = normalized;
  } else {
    // Interactive resource selection
    console.log("\n  better-wrangler add\n");
    resourceType = await promptResourceType();
  }

  // Handle worker creation separately
  if (resourceType === "worker") {
    await handleAddWorker(configInfo, configPath);
    return;
  }

  // Handle binding addition
  await handleAddBinding(configInfo, configPath, resourceType);
}

async function handleAddWorker(
  configInfo: Awaited<ReturnType<typeof parseConfigFile>>,
  configPath: string,
): Promise<void> {
  const existingWorkerNames = configInfo.workers.map((w) => w.name);

  console.log("\n  Adding a new worker\n");

  const workerConfig = await promptWorkerConfig(existingWorkerNames);

  try {
    addWorkerToConfig(configInfo, {
      name: workerConfig.name,
      variableName: workerNameToVariableName(workerConfig.name),
      entryPoint: workerConfig.entryPoint,
      port: workerConfig.port,
      bindings: workerConfig.bindings,
    });

    await saveConfigFile(configInfo.sourceFile);

    console.log(`\n✓ Added worker "${workerConfig.name}" to config`);
    console.log(`\nNext steps:`);
    console.log(`  1. Create your worker entry point at ${workerConfig.entryPoint}`);
    console.log(`  2. Run 'bw dev' to start development\n`);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

async function handleAddBinding(
  configInfo: Awaited<ReturnType<typeof parseConfigFile>>,
  configPath: string,
  resourceType: Exclude<ResourceType, "worker">,
): Promise<void> {
  const { workers } = configInfo;

  // Check if there are any workers
  if (workers.length === 0) {
    console.error("Error: No workers found in config file");
    console.error("  Your bw.config.ts must export at least one Worker.");
    console.error('  Run "bw add worker" to add a worker first.');
    process.exit(1);
  }

  console.log(`\n  Adding ${getResourceLabel(resourceType)}\n`);

  // Select worker to add binding to
  const workerName = await promptWorkerSelection(workers);
  const selectedWorker = workers.find((w) => w.name === workerName)!;

  // Get binding configuration
  const bindingConfig = await promptBindingConfig(resourceType, selectedWorker.bindings);

  try {
    addBindingToWorker(configInfo, workerName, bindingConfig);
    await saveConfigFile(configInfo.sourceFile);

    console.log(
      `\n✓ Added ${getResourceLabel(resourceType)} binding "${bindingConfig.bindingName}" to worker "${workerName}"`,
    );
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

function getResourceLabel(type: ResourceType): string {
  switch (type) {
    case "d1":
      return "D1 Database";
    case "kv":
      return "KV Namespace";
    case "r2":
      return "R2 Bucket";
    case "do":
      return "Durable Object";
    case "queue":
      return "Queue";
    case "worker":
      return "Worker";
  }
}
