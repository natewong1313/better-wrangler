import type { Miniflare } from "miniflare";
import type { WorkerConfig, Bindings } from "../bindings/worker";
import { startDevtoolsServer } from "./server";
import { startViteServer } from "./vite";

const DEFAULT_VITE_PORT = 5173;
const DEFAULT_WS_PORT = 5174;
const DEFAULT_HTTP_PORT = 5175;

export type DevtoolsResult = {
  /**
   * URL of the devtools UI
   */
  url: string;
  /**
   * Update the workers displayed in the devtools
   */
  updateWorkers: (workers: WorkerConfig<Bindings>[], urls: Map<string, URL>) => void;
  /**
   * Update the Miniflare instance (needed after restart)
   */
  updateMiniflare: (mf: Miniflare) => void;
  /**
   * Stop all devtools servers
   */
  stop: () => Promise<void>;
};

export type DevtoolsOptions = {
  /**
   * Port for the Vite dev server (default: 5173)
   */
  vitePort?: number;
  /**
   * Port for the WebSocket server (default: 5174)
   */
  wsPort?: number;
  /**
   * Port for the HTTP API server (default: 5175)
   */
  httpPort?: number;
  /**
   * Miniflare instance for KV and D1 access
   */
  miniflare?: Miniflare;
};

/**
 * Start the devtools UI and WebSocket server.
 */
export async function startDevtools(
  workers: WorkerConfig<Bindings>[],
  urls: Map<string, URL>,
  options: DevtoolsOptions = {},
): Promise<DevtoolsResult> {
  const vitePort = options.vitePort ?? DEFAULT_VITE_PORT;
  const wsPort = options.wsPort ?? DEFAULT_WS_PORT;
  const httpPort = options.httpPort ?? DEFAULT_HTTP_PORT;

  // Start WebSocket and HTTP servers first (UI needs to connect to them)
  const server = await startDevtoolsServer(
    workers,
    urls,
    wsPort,
    httpPort,
    options.miniflare ?? null,
  );

  // Start Vite dev server with HTTP port for API access
  const viteServer = await startViteServer(wsPort, vitePort, httpPort);

  return {
    url: viteServer.url,
    updateWorkers: (newWorkers, newUrls) => {
      server.updateWorkers(newWorkers, newUrls);
    },
    updateMiniflare: (mf) => {
      server.updateMiniflare(mf);
    },
    stop: async () => {
      await Promise.all([viteServer.stop(), server.stop()]);
    },
  };
}
