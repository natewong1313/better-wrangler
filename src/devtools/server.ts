import { WebSocketServer, WebSocket } from "ws";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { Miniflare } from "miniflare";
import { Logger, type LogEntry } from "../logger";
import type { WorkerConfig, Bindings } from "../bindings/worker";
import type { DurableObjectBinding } from "../bindings/durable-object";
import type { D1Binding } from "../bindings/d1";
import type { KVBinding } from "../bindings/kv";

const DEFAULT_WS_PORT = 5174;
const DEFAULT_HTTP_PORT = 5175;
const MAX_LOG_BUFFER = 100;
const MAX_VALUE_PREVIEW_SIZE = 1024; // 1KB truncation for value previews

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
 * KV entry with truncation support.
 */
export type KVEntry = {
  key: string;
  value: string | null; // null if binary
  valueTruncated: boolean; // true if value was truncated
  valueSize: number; // full size in bytes
  metadata?: unknown;
  expiration?: number; // Unix timestamp
};

/**
 * KV namespace info for the UI.
 */
export type KVNamespaceInfo = {
  bindingName: string; // e.g., "CACHE"
  kvName: string; // The actual KV namespace name
  workerName: string; // Which worker owns this binding
};

/**
 * Messages sent from server to client.
 */
export type ServerMessage =
  | { type: "init"; workers: WorkerInfo[]; sharedBindings: SharedBinding[]; logs: LogEntry[] }
  | { type: "log"; entry: LogEntry }
  | { type: "workers-updated"; workers: WorkerInfo[]; sharedBindings: SharedBinding[] }
  | { type: "kv-namespaces"; namespaces: KVNamespaceInfo[] }
  | { type: "kv-entries"; namespace: string; entries: KVEntry[] }
  | { type: "kv-entry-value"; namespace: string; key: string; value: string }
  | { type: "kv-operation-result"; operation: string; success: boolean; error?: string };

/**
 * Messages sent from client to server.
 */
export type ClientMessage =
  | { type: "list-kv-entries"; namespace: string }
  | { type: "get-kv-value"; namespace: string; key: string }
  | {
      type: "put-kv-entry";
      namespace: string;
      key: string;
      value: string;
      metadata?: unknown;
      expirationTtl?: number;
    }
  | { type: "delete-kv-entry"; namespace: string; key: string };

/**
 * D1 binding info with database name
 */
export type D1BindingInfoExtended = {
  bindingName: string;
  databaseName: string;
  workerName: string;
};

export type DevtoolsServerResult = {
  wsPort: number;
  httpPort: number;
  updateWorkers: (workers: WorkerConfig<Bindings>[], urls: Map<string, URL>) => void;
  updateMiniflare: (mf: Miniflare) => void;
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
 * Check if a binding is a D1 binding.
 */
function isD1Binding(binding: unknown): binding is D1Binding {
  return (
    typeof binding === "object" &&
    binding !== null &&
    "_type" in binding &&
    (binding as { _type: string })._type === "D1"
  );
}

/**
 * Check if a binding is a KV binding.
 */
function isKVBinding(binding: unknown): binding is KVBinding {
  return (
    typeof binding === "object" &&
    binding !== null &&
    "_type" in binding &&
    (binding as { _type: string })._type === "KV"
  );
}

/**
 * Extract D1 bindings from workers for API access.
 */
function extractD1Bindings(workers: WorkerConfig<Bindings>[]): D1BindingInfoExtended[] {
  const d1Bindings: D1BindingInfoExtended[] = [];
  const seen = new Set<string>();

  for (const worker of workers) {
    for (const [bindingName, binding] of Object.entries(worker.bindings)) {
      if (isD1Binding(binding)) {
        const key = `${bindingName}:${binding.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          d1Bindings.push({
            bindingName,
            databaseName: binding.name,
            workerName: worker.name,
          });
        }
      }
    }
  }

  return d1Bindings;
}

/**
 * Extract KV namespace info from workers.
 */
function extractKVNamespaces(workers: WorkerConfig<Bindings>[]): KVNamespaceInfo[] {
  const namespaces: KVNamespaceInfo[] = [];

  for (const worker of workers) {
    for (const [bindingName, binding] of Object.entries(worker.bindings)) {
      if (isKVBinding(binding)) {
        namespaces.push({
          bindingName,
          kvName: binding.name,
          workerName: worker.name,
        });
      }
    }
  }

  return namespaces;
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
 * Helper to send JSON responses with CORS headers.
 */
function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

/**
 * Helper to send error responses.
 */
function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJson(res, { error: message }, status);
}

/**
 * Parse JSON body from request.
 */
async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * List all entries in a KV namespace with truncated values.
 */
async function listKVEntries(mf: Miniflare, kvName: string): Promise<KVEntry[]> {
  const kv = await mf.getKVNamespace(kvName);
  const listResult = await kv.list();
  const entries: KVEntry[] = [];

  for (const key of listResult.keys) {
    try {
      const valueWithMetadata = await kv.getWithMetadata(key.name, { type: "arrayBuffer" });
      const arrayBuffer = valueWithMetadata.value as ArrayBuffer | null;

      let value: string | null = null;
      let valueTruncated = false;
      let valueSize = 0;

      if (arrayBuffer) {
        valueSize = arrayBuffer.byteLength;
        // Try to decode as text
        try {
          const fullText = new TextDecoder("utf-8", { fatal: true }).decode(arrayBuffer);
          if (fullText.length > MAX_VALUE_PREVIEW_SIZE) {
            value = fullText.slice(0, MAX_VALUE_PREVIEW_SIZE);
            valueTruncated = true;
          } else {
            value = fullText;
          }
        } catch {
          // Binary data - show as null with size
          value = null;
        }
      }

      entries.push({
        key: key.name,
        value,
        valueTruncated,
        valueSize,
        metadata: valueWithMetadata.metadata ?? undefined,
        expiration: key.expiration,
      });
    } catch {
      // Skip entries that fail to read
      entries.push({
        key: key.name,
        value: null,
        valueTruncated: false,
        valueSize: 0,
      });
    }
  }

  return entries;
}

/**
 * Get full value for a KV entry.
 */
async function getKVValue(mf: Miniflare, kvName: string, key: string): Promise<string | null> {
  const kv = await mf.getKVNamespace(kvName);
  const value = await kv.get(key, { type: "text" });
  return value;
}

/**
 * Put a value in KV.
 */
async function putKVEntry(
  mf: Miniflare,
  kvName: string,
  key: string,
  value: string,
  metadata?: unknown,
  expirationTtl?: number,
): Promise<void> {
  const kv = await mf.getKVNamespace(kvName);
  const options: { metadata?: unknown; expirationTtl?: number } = {};
  if (metadata !== undefined) options.metadata = metadata;
  if (expirationTtl !== undefined) options.expirationTtl = expirationTtl;
  await kv.put(key, value, options);
}

/**
 * Delete a KV entry.
 */
async function deleteKVEntry(mf: Miniflare, kvName: string, key: string): Promise<void> {
  const kv = await mf.getKVNamespace(kvName);
  await kv.delete(key);
}

/**
 * Handle incoming client messages for KV operations.
 */
async function handleClientMessage(
  ws: WebSocket,
  message: ClientMessage,
  mf: Miniflare | null,
  kvNamespaces: KVNamespaceInfo[],
): Promise<void> {
  if (!mf) {
    const errorResponse: ServerMessage = {
      type: "kv-operation-result",
      operation: message.type,
      success: false,
      error: "Miniflare instance not available",
    };
    ws.send(JSON.stringify(errorResponse));
    return;
  }

  // Find the KV namespace name from binding name
  const findKvName = (bindingName: string): string | null => {
    const ns = kvNamespaces.find((n) => n.bindingName === bindingName);
    return ns?.kvName ?? null;
  };

  try {
    switch (message.type) {
      case "list-kv-entries": {
        const kvName = findKvName(message.namespace);
        if (!kvName) {
          throw new Error(`KV namespace "${message.namespace}" not found`);
        }
        const entries = await listKVEntries(mf, kvName);
        const response: ServerMessage = {
          type: "kv-entries",
          namespace: message.namespace,
          entries,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case "get-kv-value": {
        const kvName = findKvName(message.namespace);
        if (!kvName) {
          throw new Error(`KV namespace "${message.namespace}" not found`);
        }
        const value = await getKVValue(mf, kvName, message.key);
        const response: ServerMessage = {
          type: "kv-entry-value",
          namespace: message.namespace,
          key: message.key,
          value: value ?? "",
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case "put-kv-entry": {
        const kvName = findKvName(message.namespace);
        if (!kvName) {
          throw new Error(`KV namespace "${message.namespace}" not found`);
        }
        await putKVEntry(
          mf,
          kvName,
          message.key,
          message.value,
          message.metadata,
          message.expirationTtl,
        );
        const response: ServerMessage = {
          type: "kv-operation-result",
          operation: "put",
          success: true,
        };
        ws.send(JSON.stringify(response));
        break;
      }

      case "delete-kv-entry": {
        const kvName = findKvName(message.namespace);
        if (!kvName) {
          throw new Error(`KV namespace "${message.namespace}" not found`);
        }
        await deleteKVEntry(mf, kvName, message.key);
        const response: ServerMessage = {
          type: "kv-operation-result",
          operation: "delete",
          success: true,
        };
        ws.send(JSON.stringify(response));
        break;
      }
    }
  } catch (err) {
    const response: ServerMessage = {
      type: "kv-operation-result",
      operation: message.type,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
    ws.send(JSON.stringify(response));
  }
}

/**
 * Start the devtools WebSocket server.
 */
export async function startDevtoolsServer(
  workers: WorkerConfig<Bindings>[],
  urls: Map<string, URL>,
  wsPort: number = DEFAULT_WS_PORT,
  httpPort: number = DEFAULT_HTTP_PORT,
  mf: Miniflare | null = null,
): Promise<DevtoolsServerResult> {
  // Buffer recent logs for new connections
  const logBuffer: LogEntry[] = [];

  // Current state
  let currentWorkers = extractWorkerInfo(workers, urls);
  let currentSharedBindings = detectSharedBindings(workers);
  let currentRawWorkers = workers;
  let currentKVNamespaces = extractKVNamespaces(workers);
  let currentMiniflare = mf;

  // Create WebSocket server
  const wss = new WebSocketServer({ port: wsPort });

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

    // Send KV namespaces
    const kvMessage: ServerMessage = {
      type: "kv-namespaces",
      namespaces: currentKVNamespaces,
    };
    ws.send(JSON.stringify(kvMessage));

    // Handle incoming messages from client
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        await handleClientMessage(ws, message, currentMiniflare, currentKVNamespaces);
      } catch {
        // Ignore parse errors
      }
    });
  });

  // Create HTTP server for D1 API
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${httpPort}`);
    const path = url.pathname;

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    try {
      // GET /api/d1/databases - List all D1 databases
      if (path === "/api/d1/databases" && req.method === "GET") {
        const d1Bindings = extractD1Bindings(currentRawWorkers);
        sendJson(res, { databases: d1Bindings });
        return;
      }

      // GET /api/d1/:bindingName/tables - List tables in a D1 database
      const tablesMatch = path.match(/^\/api\/d1\/([^/]+)\/tables$/);
      if (tablesMatch && req.method === "GET") {
        const bindingName = decodeURIComponent(tablesMatch[1]);

        if (!currentMiniflare) {
          sendError(res, "Miniflare not initialized", 503);
          return;
        }

        try {
          const db = await currentMiniflare.getD1Database(bindingName);
          const result = await db
            .prepare(
              `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
            )
            .all();
          sendJson(res, { tables: result.results.map((r) => (r as { name: string }).name) });
        } catch (err) {
          sendError(res, `Failed to list tables: ${err}`, 500);
        }
        return;
      }

      // GET /api/d1/:bindingName/tables/:tableName/schema - Get table schema
      const schemaMatch = path.match(/^\/api\/d1\/([^/]+)\/tables\/([^/]+)\/schema$/);
      if (schemaMatch && req.method === "GET") {
        const bindingName = decodeURIComponent(schemaMatch[1]);
        const tableName = decodeURIComponent(schemaMatch[2]);

        if (!currentMiniflare) {
          sendError(res, "Miniflare not initialized", 503);
          return;
        }

        try {
          const db = await currentMiniflare.getD1Database(bindingName);
          const result = await db.prepare(`PRAGMA table_info("${tableName}")`).all();
          sendJson(res, { columns: result.results });
        } catch (err) {
          sendError(res, `Failed to get schema: ${err}`, 500);
        }
        return;
      }

      // GET /api/d1/:bindingName/tables/:tableName/data - Get table data with pagination
      const dataMatch = path.match(/^\/api\/d1\/([^/]+)\/tables\/([^/]+)\/data$/);
      if (dataMatch && req.method === "GET") {
        const bindingName = decodeURIComponent(dataMatch[1]);
        const tableName = decodeURIComponent(dataMatch[2]);
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        const offset = parseInt(url.searchParams.get("offset") || "0", 10);

        if (!currentMiniflare) {
          sendError(res, "Miniflare not initialized", 503);
          return;
        }

        try {
          const db = await currentMiniflare.getD1Database(bindingName);

          // Get total count
          const countResult = await db
            .prepare(`SELECT COUNT(*) as count FROM "${tableName}"`)
            .first<{ count: number }>();
          const total = countResult?.count ?? 0;

          // Get paginated data
          const result = await db
            .prepare(`SELECT * FROM "${tableName}" LIMIT ? OFFSET ?`)
            .bind(limit, offset)
            .all();

          sendJson(res, {
            rows: result.results,
            total,
            limit,
            offset,
          });
        } catch (err) {
          sendError(res, `Failed to get data: ${err}`, 500);
        }
        return;
      }

      // POST /api/d1/:bindingName/query - Execute SQL query
      const queryMatch = path.match(/^\/api\/d1\/([^/]+)\/query$/);
      if (queryMatch && req.method === "POST") {
        const bindingName = decodeURIComponent(queryMatch[1]);

        if (!currentMiniflare) {
          sendError(res, "Miniflare not initialized", 503);
          return;
        }

        try {
          const body = await parseBody<{ sql: string; params?: unknown[] }>(req);
          const { sql, params = [] } = body;

          if (!sql) {
            sendError(res, "SQL query is required", 400);
            return;
          }

          const db = await currentMiniflare.getD1Database(bindingName);
          const stmt = db.prepare(sql);
          const boundStmt = params.length > 0 ? stmt.bind(...params) : stmt;

          // Determine if it's a read or write query
          const isReadQuery = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(sql);

          if (isReadQuery) {
            const result = await boundStmt.all();
            sendJson(res, {
              success: true,
              results: result.results,
              meta: result.meta,
            });
          } else {
            const result = await boundStmt.run();
            sendJson(res, {
              success: result.success,
              meta: result.meta,
            });
          }
        } catch (err) {
          sendError(res, `Query failed: ${err}`, 500);
        }
        return;
      }

      // 404 for unknown routes
      sendError(res, "Not found", 404);
    } catch (err) {
      sendError(res, `Internal server error: ${err}`, 500);
    }
  });

  // Wait for servers to be ready
  await Promise.all([
    new Promise<void>((resolve) => wss.once("listening", resolve)),
    new Promise<void>((resolve) => httpServer.listen(httpPort, resolve)),
  ]);

  return {
    wsPort,
    httpPort,
    updateWorkers: (newWorkers, newUrls) => {
      currentWorkers = extractWorkerInfo(newWorkers, newUrls);
      currentSharedBindings = detectSharedBindings(newWorkers);
      currentRawWorkers = newWorkers;
      currentKVNamespaces = extractKVNamespaces(newWorkers);

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

      // Also send updated KV namespaces
      const kvMessage: ServerMessage = {
        type: "kv-namespaces",
        namespaces: currentKVNamespaces,
      };
      const kvData = JSON.stringify(kvMessage);

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(kvData);
        }
      }
    },
    updateMiniflare: (newMf) => {
      currentMiniflare = newMf;
    },
    stop: async () => {
      unsubscribe();
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          wss.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          httpServer.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        }),
      ]);
    },
  };
}
