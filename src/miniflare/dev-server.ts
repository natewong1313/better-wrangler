import { Miniflare, type WorkerOptions, type WorkerdStructuredLog } from "miniflare";
import type { Server } from "http";
import type { WorkerConfig, Bindings } from "../bindings/worker";
import { createBundleContext, type BundleContext } from "./bundle";
import { buildWorkerOptions } from "./worker-options";
import { createWorkerProxy } from "./proxy";
import { createLogger, Logger, type LogEntry } from "../logger";
import type { LogLevel } from "../logger/utils";
import { applyDevMigrations } from "../cli/dev/migrations";

const LATEST_COMPAT_DATE = "2026-01-20";
const DEFAULT_PORT = 8787;

export type DevServerOptions = {
  /**
   * Base directory for resolving entry paths.
   * Defaults to process.cwd()
   */
  baseDir?: string;
  /**
   * Compatibility date for all workers.
   * Defaults to '2026-01-20'
   */
  compatibilityDate?: string;
};

export type DevServerResult = {
  /**
   * Miniflare instance
   */
  mf: Miniflare;
  /**
   * Map worker names to there URLs
   */
  urls: Map<string, URL>;
  /**
   * Track the underlying http servers for each worker
   */
  servers: Server[];
  /**
   * Stop the dev server
   */
  stop: () => Promise<void>;
};

type BundleState = {
  bundledScripts: Map<string, string>;
  bundleContexts: BundleContext[];
};

/**
 * Start a Miniflare dev server with all workers running in a single instance
 * This gives us the functionality to share a DO across workers and do other stuff that simply using wrangler doesn't give us the flexibility for
 */
export async function startDevServer(
  workers: WorkerConfig<Bindings, Record<string, string>>[],
  entryPaths: Map<string, string>,
  options: DevServerOptions = {},
): Promise<DevServerResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const compatibilityDate = options.compatibilityDate ?? LATEST_COMPAT_DATE;

  // Check port collisions before bundling/setting up server
  validateUniquePorts(workers);

  // 1. create bundles
  const bundleState = await createBundles(workers, entryPaths, baseDir);
  const buildAllWorkerOptions = () =>
    workers.map((worker) => {
      const script = bundleState.bundledScripts.get(worker.name)!;
      return buildWorkerOptions(worker, script, compatibilityDate);
    });

  // Handler to capture console.log from workers/DOs and broadcast to devtools
  const handleStructuredLogs = ({ timestamp, level, message }: WorkerdStructuredLog) => {
    // Map workerd log levels to our LogLevel type
    // workerd uses "log" for console.log(), we map it to "info"
    const logLevelMap: Record<string, LogLevel> = {
      log: "info",
      debug: "debug",
      info: "info",
      warn: "warn",
      error: "error",
    };
    const mappedLevel = logLevelMap[level] ?? "info";

    const entry: LogEntry = {
      timestamp: new Date(timestamp).toISOString(),
      level: mappedLevel,
      service: "worker",
      message,
    };
    Logger.broadcast(entry);
  };

  // 2: create Miniflare instance
  const mf = new Miniflare({
    workers: buildAllWorkerOptions(),
    handleStructuredLogs,
  });
  await mf.ready;

  // 2.5: apply D1 migrations before hot reload setup
  // This ensures migrations run on fresh stubs before any setOptions calls
  await applyDevMigrations(mf, workers, baseDir);

  // 3: set up hot reload
  setupHotReload(mf, workers, bundleState, buildAllWorkerOptions, handleStructuredLogs);

  // 4: watch files for changes
  await startWatching(bundleState.bundleContexts);

  // 5: create proxy servers to allow the worker to be accessed via url
  const { servers, urls } = await createProxyServers(mf, workers);

  for (const worker of workers) {
    const workerLog = createLogger(worker.name);
    workerLog.info(`Running at ${urls.get(worker.name)}`);
  }

  return {
    mf,
    urls,
    servers,
    stop: createStopFunction(mf, bundleState.bundleContexts, servers),
  };
}

function validateUniquePorts(workers: WorkerConfig<Bindings, Record<string, string>>[]) {
  const portToWorker = new Map<number, string>();

  for (const worker of workers) {
    const port = worker.port ?? DEFAULT_PORT;
    const existing = portToWorker.get(port);

    if (existing) {
      throw new Error(
        `Port ${port} is used by both "${existing}" and "${worker.name}". ` +
          `Each worker must have a unique port.`,
      );
    }

    portToWorker.set(port, worker.name);
  }
}

async function createBundles(
  workers: WorkerConfig<Bindings, Record<string, string>>[],
  entryPaths: Map<string, string>,
  baseDir: string,
) {
  const bundledScripts = new Map<string, string>();
  const bundleContexts: BundleContext[] = [];

  for (const worker of workers) {
    const entryPath = entryPaths.get(worker.name);
    if (!entryPath) {
      throw new Error(`No entry path found for worker: ${worker.name}`);
    }

    const bundleContext = await createBundleContext(entryPath, baseDir);
    bundledScripts.set(worker.name, bundleContext.initialScript);
    bundleContexts.push(bundleContext);
  }

  return { bundledScripts, bundleContexts };
}

/**
 * Uses a mutex to prevent concurrent rebuilds which can corrupt Miniflare state.
 */
function setupHotReload(
  mf: Miniflare,
  workers: WorkerConfig<Bindings, Record<string, string>>[],
  bundleState: BundleState,
  buildAllWorkerOptions: () => WorkerOptions[],
  handleStructuredLogs: (log: WorkerdStructuredLog) => void,
) {
  const { bundledScripts, bundleContexts } = bundleState;

  // Mutex to prevent concurrent rebuilds
  let rebuildInProgress = false;
  // Track pending rebuilds per worker (only keep latest)
  const pendingRebuilds = new Map<string, string>();

  const processRebuild = async (workerName: string, script: string) => {
    if (rebuildInProgress) {
      // Queue this rebuild, replacing any previous pending for this worker
      pendingRebuilds.set(workerName, script);
      return;
    }

    rebuildInProgress = true;
    const start = performance.now();

    try {
      // Update the script for this worker
      bundledScripts.set(workerName, script);

      // Rebuild all worker options and hot-swap via setOptions
      // Must include handleStructuredLogs to preserve worker log capture
      await mf.setOptions({
        workers: buildAllWorkerOptions(),
        handleStructuredLogs,
      });

      // Wait for Miniflare to be ready after setOptions
      await mf.ready;

      const elapsed = (performance.now() - start).toFixed(0);
      const workerLog = createLogger(workerName);
      workerLog.info(`Rebuilt in ${elapsed}ms`);
    } catch (error) {
      const workerLog = createLogger(workerName);
      workerLog.error("Failed to hot reload:", error);
    } finally {
      rebuildInProgress = false;

      // Process any pending rebuilds (take the first one, others will re-queue)
      if (pendingRebuilds.size > 0) {
        const [[nextWorker, nextScript]] = pendingRebuilds.entries();
        pendingRebuilds.delete(nextWorker);
        // Process asynchronously to avoid stack growth
        setImmediate(() => processRebuild(nextWorker, nextScript));
      }
    }
  };

  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i];
    const bundleContext = bundleContexts[i];

    bundleContext.setOnRebuild(async (newScript: string) => {
      await processRebuild(worker.name, newScript);
    });
  }
}

/**
 * Starts watching for file changes on all bundle contexts
 */
async function startWatching(bundleContexts: BundleContext[]) {
  await Promise.all(bundleContexts.map((ctx) => ctx.watch()));
}

async function createProxyServers(
  mf: Miniflare,
  workers: WorkerConfig<Bindings, Record<string, string>>[],
) {
  const servers: Server[] = [];
  const urls = new Map<string, URL>();

  for (const worker of workers) {
    const port = worker.port ?? DEFAULT_PORT;
    const { server, url } = await createWorkerProxy(mf, worker.name, port);
    servers.push(server);
    urls.set(worker.name, url);
  }

  return { servers, urls };
}

/**
 * Creates a stop function that cleans up all resources
 */
function createStopFunction(mf: Miniflare, bundleContexts: BundleContext[], servers: Server[]) {
  return async () => {
    const log = createLogger("miniflare");
    log.info(`Stopping ${servers.length} server(s)`);

    // Cleanup esbuild
    await Promise.all(bundleContexts.map((ctx) => ctx.dispose()));

    // Kill servers
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    // Cleanup Miniflare
    await mf.dispose();
  };
}
