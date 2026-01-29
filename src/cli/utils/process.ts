import { spawn, type ChildProcess } from "child_process";
import type { WorkerConfig, Bindings } from "../types";
import { createLogger } from "../../logger";

const INSPECTOR_PORT_BASE = 9229;
const log = createLogger("wrangler");

/**
 * Validates that a worker name contains only safe characters.
 * Allows alphanumeric, hyphens, underscores, and dots.
 */
function validateWorkerName(name: string) {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(
      `Invalid worker name "${name}". Only alphanumeric characters, hyphens, underscores, and dots are allowed.`,
    );
  }
}

export function startWranglerProcesses(
  workers: WorkerConfig<Bindings>[],
  configPaths: Map<string, string>,
) {
  const processes = new Map<string, ChildProcess>();

  const sortedWorkers = [...workers].sort((a, b) => a.name.localeCompare(b.name));

  log.info("Starting workers in separate wrangler processes");

  sortedWorkers.forEach((worker, index) => {
    validateWorkerName(worker.name);
    const configPath = configPaths.get(worker.name)!;
    const inspectorPort = INSPECTOR_PORT_BASE + index;

    const args = ["wrangler", "dev", "-c", configPath, "--inspector-port", String(inspectorPort)];

    const workerLog = createLogger(worker.name);
    workerLog.info(`http://localhost:${worker.port} (inspector @ ${inspectorPort})`);

    const proc = spawn("npx", args, {
      stdio: "inherit",
    });

    processes.set(worker.name, proc);
  });

  return processes;
}

export function killAllProcesses(processes: Map<string, ChildProcess>) {
  for (const proc of processes.values()) {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Process may have already exited
    }
  }
}
