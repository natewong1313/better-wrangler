import { WebSocketServer, WebSocket } from "ws";
import { Logger, type LogEntry } from "../logger";
import type { WorkerConfig, Bindings } from "../bindings/worker";
import type { DurableObjectBinding } from "../bindings/durable-object";

const DEFAULT_WS_PORT = 5174;
const MAX_LOG_BUFFER = 100;

/**
 * Binding info sent to the UI.
 */
export type BindingInfo = {
  name: string;
  type: string;
  className?: string; // For DurableObjects
  owner?: string; // For DurableObjects: which worker owns it
};

/**
 * Worker info sent to the UI.
 */
export type WorkerInfo = {
  name: string;
  port: number;
  url: string;
  bindings: BindingInfo[];
};

/**
 * Shared binding detected across multiple workers.
 */
export type SharedBinding = {
  name: string; // Binding name or DO className
  type: string;
  className?: string; // For DurableObjects
  owner?: string; // For DurableObjects: owning worker
  usedBy: string[]; // All workers using this binding
};

/**
 * Messages sent from server to client.
 */
export type ServerMessage =
  | { type: "init"; workers: WorkerInfo[]; sharedBindings: SharedBinding[]; logs: LogEntry[] }
  | { type: "log"; entry: LogEntry }
  | { type: "workers-updated"; workers: WorkerInfo[]; sharedBindings: SharedBinding[] };

export type DevtoolsServerResult = {
  port: number;
  updateWorkers: (workers: WorkerConfig<Bindings>[], urls: Map<string, URL>) => void;
  stop: () => Promise<void>;
};

/**
 * Check if a binding is a DurableObject binding.
 */
function isDurableObjectBinding(binding: unknown): binding is DurableObjectBinding {
  return (
    typeof binding === "object" &&
    binding !== null &&
    "_type" in binding &&
    (binding as { _type: string })._type === "DurableObject"
  );
}

/**
 * Extract binding info from worker config for the UI.
 */
function extractWorkerInfo(
  workers: WorkerConfig<Bindings>[],
  urls: Map<string, URL>,
): WorkerInfo[] {
  return workers.map((worker) => {
    const bindings: BindingInfo[] = Object.entries(worker.bindings).map(([name, binding]) => {
      const info: BindingInfo = {
        name,
        type: binding._type,
      };

      // Add DO-specific info
      if (isDurableObjectBinding(binding)) {
        info.className = binding.className;
        info.owner = binding._owner;
      }

      return info;
    });

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
 * Detect bindings that are shared across multiple workers.
 */
function detectSharedBindings(workers: WorkerConfig<Bindings>[]): SharedBinding[] {
  // Map: unique key -> binding info with usage tracking
  const bindingMap = new Map<
    string,
    {
      name: string;
      type: string;
      className?: string;
      owner?: string;
      usedBy: Set<string>;
    }
  >();

  for (const worker of workers) {
    for (const [bindingName, binding] of Object.entries(worker.bindings)) {
      // Create unique key based on type + identifying info
      // For DOs: use className (same DO class = same binding)
      // For others: use binding name + type
      let key: string;
      let name: string;
      let className: string | undefined;
      let owner: string | undefined;

      if (isDurableObjectBinding(binding)) {
        key = `DurableObject:${binding.className}`;
        name = binding.className;
        className = binding.className;
        owner = binding._owner;
      } else {
        key = `${binding._type}:${bindingName}`;
        name = bindingName;
      }

      if (!bindingMap.has(key)) {
        bindingMap.set(key, {
          name,
          type: binding._type,
          className,
          owner,
          usedBy: new Set(),
        });
      }

      bindingMap.get(key)!.usedBy.add(worker.name);
    }
  }

  // Return only bindings used by 2+ workers
  return Array.from(bindingMap.values())
    .filter((b) => b.usedBy.size > 1)
    .map((b) => ({
      name: b.name,
      type: b.type,
      className: b.className,
      owner: b.owner,
      usedBy: Array.from(b.usedBy),
    }));
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

  // Current state
  let currentWorkers = extractWorkerInfo(workers, urls);
  let currentSharedBindings = detectSharedBindings(workers);

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
      sharedBindings: currentSharedBindings,
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
      currentSharedBindings = detectSharedBindings(newWorkers);

      // Broadcast to all clients
      const message: ServerMessage = {
        type: "workers-updated",
        workers: currentWorkers,
        sharedBindings: currentSharedBindings,
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
