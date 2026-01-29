import type { ParsedArgs } from "./types";
import { findConfigFile } from "./utils/config-file";
import { devCommand } from "./commands/dev";
import { syncCommand } from "./commands/sync";

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const command = args[0];
  const useLegacy = args.includes("--legacy");
  const workerFilter = args.slice(1).filter((a) => !a.startsWith("--"));

  return { command, useLegacy, workerFilter };
}

function printHelp() {
  console.log("Usage: bw <dev|sync> [worker-names...] [--legacy]");
  console.log("");
  console.log("Commands:");
  console.log("  dev   Sync configs and run all workers in parallel");
  console.log("  sync  Just sync configs without running wrangler");
  console.log("");
  console.log("Options:");
  console.log("  --legacy  Use separate wrangler dev processes (old mode)");
  console.log("            Default: Use Miniflare (supports cross-worker DOs)");
  console.log("");
  console.log("Examples:");
  console.log("  bun run bw dev              # Run all workers with Miniflare");
  console.log("  bun run bw dev --legacy     # Run with separate wrangler processes");
  console.log("  bun run bw dev host-worker  # Run specific worker");
  console.log("  bun run bw sync             # Just generate configs");
}

async function main() {
  const args = parseArgs();

  if (!args.command || !["dev", "sync"].includes(args.command)) {
    printHelp();
    process.exit(1);
  }

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
