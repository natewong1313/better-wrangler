import type { ParsedArgs } from "./types";
import { findConfigFile } from "./utils/config-file";
import { devCommand } from "./commands/dev";
import { syncCommand } from "./commands/sync";
import { initCommand } from "./commands/init";
import { addCommand } from "./commands/add";
import { deployCommand } from "./commands/deploy";
import { createCommand, type ResourceTypeFilter } from "./commands/create";

interface ExtendedParsedArgs extends ParsedArgs {
  force?: boolean;
  resource?: string;
  env?: string;
  dryRun?: boolean;
  create?: boolean;
  noCreate?: boolean;
  all?: boolean;
  resourceTypeForCreate?: ResourceTypeFilter;
}

function parseArgs(): ExtendedParsedArgs {
  const args = process.argv.slice(2);
  const command = args[0];
  const useLegacy = args.includes("--legacy");
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const create = args.includes("--create");
  const noCreate = args.includes("--no-create");
  const all = args.includes("--all");

  // Validate mutually exclusive flags
  if (create && noCreate) {
    console.error("Error: --create and --no-create are mutually exclusive");
    process.exit(1);
  }

  // Parse --env flag
  const envIndex = args.findIndex((a) => a === "--env");
  const env = envIndex !== -1 && args[envIndex + 1] ? args[envIndex + 1] : undefined;

  // For 'add' command, the second arg (if not a flag) is the resource type
  const resource =
    command === "add" ? args.find((a, i) => i > 0 && !a.startsWith("--")) : undefined;

  // For 'create' command, get optional resource type filter
  const validResourceTypes = ["kv", "d1", "r2", "queue"];
  const resourceTypeForCreate =
    command === "create"
      ? (args.find((a, i) => i > 0 && validResourceTypes.includes(a)) as
          | ResourceTypeFilter
          | undefined)
      : undefined;

  // Filter out command, resource, flags, and --env value for worker filter
  const workerFilter = args.slice(1).filter((a, i) => {
    if (a.startsWith("--")) return false;
    if (a === resource) return false;
    if (a === resourceTypeForCreate) return false;
    // Check if previous arg was --env (meaning this is the env value)
    const actualIndex = i + 1;
    if (actualIndex > 0 && args[actualIndex - 1] === "--env") return false;
    return true;
  });

  return {
    command,
    useLegacy,
    workerFilter,
    force,
    resource,
    env,
    dryRun,
    create,
    noCreate,
    all,
    resourceTypeForCreate,
  };
}

function printHelp() {
  console.log("Usage: bw <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  init              Initialize a new better-wrangler project");
  console.log("  add [resource]    Add a resource to your config (interactive if no resource)");
  console.log("                    Resources: d1, kv, r2, do, queue, worker");
  console.log("  create [type]     Create missing Cloudflare resources");
  console.log("                    Types: kv, d1, r2, queue (optional filter)");
  console.log("  dev               Sync configs and run workers in development");
  console.log("  sync              Generate wrangler configs without running");
  console.log("  deploy            Deploy workers to Cloudflare");
  console.log("");
  console.log("Options:");
  console.log("  --force           Overwrite existing config file (init only)");
  console.log("  --legacy          Use separate wrangler processes (dev only)");
  console.log("  --all             Create all resources without prompting (create only)");
  console.log("  --env <name>      Target environment (create, deploy)");
  console.log("  --dry-run         Show what would be deployed (deploy only)");
  console.log("  --create          Auto-create missing resources (deploy only)");
  console.log("  --no-create       Fail if resources missing (deploy only, for CI/CD)");
  console.log("");
  console.log("Examples:");
  console.log("  bw init                     # Create a new bw.config.ts");
  console.log("  bw add                      # Interactive resource selection");
  console.log("  bw add d1                   # Add a D1 database binding");
  console.log("  bw create                   # Create all missing resources");
  console.log("  bw create kv                # Create only missing KV namespaces");
  console.log("  bw create --all             # Create without prompting");
  console.log("  bw dev                      # Run all workers with Miniflare");
  console.log("  bw sync                     # Generate wrangler configs only");
  console.log("  bw deploy                   # Deploy (prompts if resources missing)");
  console.log("  bw deploy --create          # Auto-create missing, then deploy");
  console.log("  bw deploy --no-create       # Strict mode: fail if missing (CI/CD)");
  console.log("  bw deploy --env production  # Deploy to production environment");
}

async function main() {
  const args = parseArgs();

  const validCommands = ["init", "add", "create", "dev", "sync", "deploy"];

  if (!args.command || !validCommands.includes(args.command)) {
    printHelp();
    process.exit(1);
  }

  // Commands that don't require an existing config file
  if (args.command === "init") {
    await initCommand({ force: args.force });
    return;
  }

  if (args.command === "add") {
    await addCommand(args.resource);
    return;
  }

  // Create command handles its own config file finding
  if (args.command === "create") {
    await createCommand(args.resourceTypeForCreate, { env: args.env, all: args.all });
    return;
  }

  // Deploy command handles its own config file finding
  if (args.command === "deploy") {
    await deployCommand(args.workerFilter, {
      env: args.env,
      dryRun: args.dryRun,
      create: args.create,
      noCreate: args.noCreate,
    });
    return;
  }

  // Commands that require an existing config file
  const configPath = await findConfigFile();

  if (args.command === "sync") {
    await syncCommand(args, configPath);
  } else {
    await devCommand(args, configPath);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
