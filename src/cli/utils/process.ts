import { spawn, type ChildProcess } from "child_process";
import type { WorkerConfig, Bindings } from "../types";

const INSPECTOR_PORT_BASE = 9229;

export function startWranglerProcesses(
  workers: WorkerConfig<Bindings>[],
  configPaths: Map<string, string>,
) {
  const processes = new Map<string, ChildProcess>();

  const sortedWorkers = [...workers].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  console.log("Starting workers in separate wrangler processes");

  sortedWorkers.forEach((worker, index) => {
    const configPath = configPaths.get(worker.name)!;
    const inspectorPort = INSPECTOR_PORT_BASE + index;

    const args = [
      "wrangler",
      "dev",
      "-c",
      configPath,
      "--inspector-port",
      String(inspectorPort),
    ];

    console.log(
      `${worker.name}: http://localhost:${worker.port} (inspector @ ${inspectorPort})`,
    );

    const proc = spawn("npx", args, {
      stdio: "inherit",
      shell: true,
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
