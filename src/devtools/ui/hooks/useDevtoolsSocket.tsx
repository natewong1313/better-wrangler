import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ServerMessage,
  WorkerInfo,
  SharedBinding,
  KVEntry,
  KVNamespaceInfo,
  ClientMessage,
} from "../../server";
import type { LogEntry } from "../../../logger";

declare const __DEVTOOLS_WS_PORT__: number;

const WS_PORT = typeof __DEVTOOLS_WS_PORT__ !== "undefined" ? __DEVTOOLS_WS_PORT__ : 5174;
const MAX_LOGS = 1000;

type KVOperationCallback = (success: boolean, error?: string) => void;

type UseDevtoolsSocketResult = {
  workers: WorkerInfo[];
  sharedBindings: SharedBinding[];
  logs: LogEntry[];
  connected: boolean;
  // KV-related state
  kvNamespaces: KVNamespaceInfo[];
  kvEntries: Map<string, KVEntry[]>;
  kvExpandedValues: Map<string, string>; // "namespace:key" -> full value
  kvLoading: boolean;
  kvError: string | null;
  // KV operations
  listKvEntries: (namespace: string) => void;
  getKvValue: (namespace: string, key: string) => void;
  putKvEntry: (
    namespace: string,
    key: string,
    value: string,
    metadata?: unknown,
    expirationTtl?: number,
    callback?: KVOperationCallback,
  ) => void;
  deleteKvEntry: (namespace: string, key: string, callback?: KVOperationCallback) => void;
};

export function useDevtoolsSocket(): UseDevtoolsSocketResult {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [sharedBindings, setSharedBindings] = useState<SharedBinding[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);

  // KV state
  const [kvNamespaces, setKvNamespaces] = useState<KVNamespaceInfo[]>([]);
  const [kvEntries, setKvEntries] = useState<Map<string, KVEntry[]>>(new Map());
  const [kvExpandedValues, setKvExpandedValues] = useState<Map<string, string>>(new Map());
  const [kvLoading, setKvLoading] = useState(false);
  const [kvError, setKvError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const kvCallbacksRef = useRef<Map<string, KVOperationCallback>>(new Map());
  const pendingMessagesRef = useRef<ClientMessage[]>([]);

  // Send a message to the server, queueing if not connected
  const sendMessage = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message to be sent when connection opens
      pendingMessagesRef.current.push(message);
    }
  }, []);

  // KV operations
  const listKvEntries = useCallback(
    (namespace: string) => {
      setKvLoading(true);
      setKvError(null);
      sendMessage({
        type: "list-kv-entries",
        namespace,
      });
    },
    [sendMessage],
  );

  const getKvValue = useCallback(
    (namespace: string, key: string) => {
      sendMessage({ type: "get-kv-value", namespace, key });
    },
    [sendMessage],
  );

  const putKvEntry = useCallback(
    (
      namespace: string,
      key: string,
      value: string,
      metadata?: unknown,
      expirationTtl?: number,
      callback?: KVOperationCallback,
    ) => {
      if (callback) {
        kvCallbacksRef.current.set(`put:${namespace}:${key}`, callback);
      }
      sendMessage({ type: "put-kv-entry", namespace, key, value, metadata, expirationTtl });
    },
    [sendMessage],
  );

  const deleteKvEntry = useCallback(
    (namespace: string, key: string, callback?: KVOperationCallback) => {
      if (callback) {
        kvCallbacksRef.current.set(`delete:${namespace}:${key}`, callback);
      }
      sendMessage({ type: "delete-kv-entry", namespace, key });
    },
    [sendMessage],
  );

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Send any queued messages
      while (pendingMessagesRef.current.length > 0) {
        const msg = pendingMessagesRef.current.shift();
        if (msg) {
          ws.send(JSON.stringify(msg));
        }
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = () => {
      // onclose will be called after this
    };

    ws.onmessage = (event) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case "init":
            setWorkers(message.workers);
            setSharedBindings(message.sharedBindings);
            setLogs(message.logs);
            break;

          case "log":
            setLogs((prev) => {
              const next = [...prev, message.entry];
              // Keep only the last MAX_LOGS entries
              if (next.length > MAX_LOGS) {
                return next.slice(-MAX_LOGS);
              }
              return next;
            });
            break;

          case "workers-updated":
            setWorkers(message.workers);
            setSharedBindings(message.sharedBindings);
            break;

          case "kv-namespaces":
            setKvNamespaces(message.namespaces);
            break;

          case "kv-entries":
            setKvLoading(false);
            setKvEntries((prev) => {
              const next = new Map(prev);
              next.set(message.namespace, message.entries);
              return next;
            });
            break;

          case "kv-entry-value":
            setKvExpandedValues((prev) => {
              const next = new Map(prev);
              next.set(`${message.namespace}:${message.key}`, message.value);
              return next;
            });
            break;

          case "kv-operation-result":
            setKvLoading(false);
            if (!message.success) {
              setKvError(message.error ?? "Operation failed");
            }
            // Find and call any registered callbacks
            // We don't have exact key info here, so we'll call all pending callbacks
            // A more robust implementation would track operation IDs
            for (const [key, callback] of kvCallbacksRef.current.entries()) {
              if (key.startsWith(message.operation + ":")) {
                callback(message.success, message.error);
                kvCallbacksRef.current.delete(key);
                break;
              }
            }
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    workers,
    sharedBindings,
    logs,
    connected,
    kvNamespaces,
    kvEntries,
    kvExpandedValues,
    kvLoading,
    kvError,
    listKvEntries,
    getKvValue,
    putKvEntry,
    deleteKvEntry,
  };
}
