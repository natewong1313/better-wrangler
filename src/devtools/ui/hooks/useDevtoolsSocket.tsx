import { useState, useEffect, useCallback, useRef } from "react";
import type { ServerMessage, WorkerInfo, SharedBinding } from "../../server";
import type { LogEntry } from "../../../logger";

declare const __DEVTOOLS_WS_PORT__: number;

const WS_PORT = typeof __DEVTOOLS_WS_PORT__ !== "undefined" ? __DEVTOOLS_WS_PORT__ : 5174;
const MAX_LOGS = 1000;

type UseDevtoolsSocketResult = {
  workers: WorkerInfo[];
  sharedBindings: SharedBinding[];
  logs: LogEntry[];
  connected: boolean;
};

export function useDevtoolsSocket(): UseDevtoolsSocketResult {
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [sharedBindings, setSharedBindings] = useState<SharedBinding[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    // Clean up any existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
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

  return { workers, sharedBindings, logs, connected };
}
