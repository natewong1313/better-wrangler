import type { WorkerConfig, Bindings } from "../types";

export function isWorkerConfig(value: unknown): value is WorkerConfig<Bindings> {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "entryPoint" in value &&
    "bindings" in value &&
    "Env" in value
  );
}

/**
 * Dynamically imports the config file and extracts all WorkerConfig exports.
 * Returns workers sorted with primary worker first.
 *
 * Note: ESM modules are cached by URL. When bustCache is true, we append
 * a timestamp query parameter to force Node.js to re-import the module.
 */
export async function loadWorkerConfigs(configPath: string, bustCache = false) {
  // ESM modules are cached by URL - add timestamp query param to bust cache
  const importPath = bustCache ? `${configPath}?update=${Date.now()}` : configPath;

  const configModule = await import(importPath);

  const workers = Object.values(configModule).filter(isWorkerConfig) as WorkerConfig<Bindings>[];

  if (workers.length === 0) {
    throw new Error("No workers found in config file. Export WorkerConfig objects.");
  }

  // Sort workers so primary worker comes first (gets root route in Miniflare)
  workers.sort((a, b) => {
    if (a.primary && !b.primary) return -1;
    if (!a.primary && b.primary) return 1;
    return (a.port ?? 0) - (b.port ?? 0);
  });

  return workers;
}

export function filterWorkers(workers: WorkerConfig<Bindings>[], workerFilter: string[]) {
  if (workerFilter.length === 0) {
    return workers;
  }

  const filtered = workers.filter((w) => workerFilter.includes(w.name));

  if (filtered.length === 0) {
    throw new Error(`No workers found matching: ${workerFilter.join(", ")}`);
  }

  return filtered;
}

/**
 * Validates that all workers have ports configured and no port conflicts exist.
 * @throws if any worker is missing a port or if duplicate ports are found
 */
export function validateWorkers(workers: WorkerConfig<Bindings>[]) {
  const workersWithoutPorts = workers.filter((w) => !w.port);
  if (workersWithoutPorts.length > 0) {
    throw new Error(
      `All workers must have explicit ports configured. Missing ports: ${workersWithoutPorts.map((w) => w.name).join(", ")}`,
    );
  }

  const portsUsed = new Map<number, string>();
  for (const worker of workers) {
    if (portsUsed.has(worker.port!)) {
      throw new Error(
        `Port ${worker.port} is used by both "${portsUsed.get(worker.port!)}" and "${worker.name}"`,
      );
    }
    portsUsed.set(worker.port!, worker.name);
  }
}
