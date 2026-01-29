import { WebSocketServer, WebSocket } from "ws";
import { Logger, type LogEntry } from "../logger";
import type { WorkerConfig, Bindings } from "../bindings/worker";

const DEFAULT_WS_PORT = 5174;
const MAX_LOG_BUFFER = 100;

/**
 * Worker info sent to the UI.
 */
export type WorkerInfo = {
  name: string;
  port: number;
  url: string;
  bindings: { name: string; type: string }[];
};

/**
 * Messages sent from server to client.
 */
export type ServerMessage =
  | { type: "init"; workers: WorkerInfo[]; logs: LogEntry[] }
  | { type: "log"; entry: LogEntry }
  | { type: "workers-updated"; workers: WorkerInfo[] };

export type DevtoolsServerResult = {
  port: number;
  updateWorkers: (workers: WorkerConfig<Bindings>[], urls: Map<string, URL>) => void;
  stop: () => Promise<void>;
};

/**
 * Extract binding info from worker config for the UI.
 */
function extractWorkerInfo(
  workers: WorkerConfig<Bindings>[],
  urls: Map<string, URL>,
): WorkerInfo[] {
  return workers.map((worker) => {
    const bindings = Object.entries(worker.bindings).map(([name, binding]) => ({
      name,
      type: binding._type,
    }));

    const url = urls.get(worker.name);

    return {
      name: worker.name,
      port: worker.port ?? 8787,
      url: url?.toString() ?? `http://localhost:${worker.port ?? 8787}`,
      bindings,
    };
  });
}

/**
 * Start the devtools WebSocket server.
 */
export async function startDevtoolsServer(
  workers: WorkerConfig<Bindings>[],
  urls: Map<string, URL>,
  port: number = DEFAULT_WS_PORT,
): Promise<DevtoolsServerResult> {
  // Buffer recent logs for new connections
  const logBuffer: LogEntry[] = [];

  // Current worker state
  let currentWorkers = extractWorkerInfo(workers, urls);

  // Create WebSocket server
  const wss = new WebSocketServer({ port });

  // Subscribe to logger
  const unsubscribe = Logger.subscribe((entry) => {
    // Add to buffer (keep last MAX_LOG_BUFFER entries)
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_BUFFER) {
      logBuffer.shift();
    }

    // Broadcast to all connected clients
    const message: ServerMessage = { type: "log", entry };
    const data = JSON.stringify(message);

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  });

  // Handle new connections
  wss.on("connection", (ws) => {
    // Send initial state
    const initMessage: ServerMessage = {
      type: "init",
      workers: currentWorkers,
      logs: [...logBuffer],
    };
    ws.send(JSON.stringify(initMessage));
  });

  // Wait for server to be ready
  await new Promise<void>((resolve) => {
    wss.once("listening", resolve);
  });

  return {
    port,
    updateWorkers: (newWorkers, newUrls) => {
      currentWorkers = extractWorkerInfo(newWorkers, newUrls);

      // Broadcast to all clients
      const message: ServerMessage = {
        type: "workers-updated",
        workers: currentWorkers,
      };
      const data = JSON.stringify(message);

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    },
    stop: async () => {
      unsubscribe();
      await new Promise<void>((resolve, reject) => {
        wss.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  };
}
