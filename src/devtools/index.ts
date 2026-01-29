import type { WorkerConfig, Bindings } from "../bindings/worker";
import { startDevtoolsServer } from "./server";
import { startViteServer } from "./vite";

const DEFAULT_VITE_PORT = 5173;
const DEFAULT_WS_PORT = 5174;

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

  // Start WebSocket server first (UI needs to connect to it)
  const wsServer = await startDevtoolsServer(workers, urls, wsPort);

  // Start Vite dev server
  const viteServer = await startViteServer(wsPort, vitePort);

  return {
    url: viteServer.url,
    updateWorkers: (newWorkers, newUrls) => {
      wsServer.updateWorkers(newWorkers, newUrls);
    },
    stop: async () => {
      await Promise.all([viteServer.stop(), wsServer.stop()]);
    },
  };
}
