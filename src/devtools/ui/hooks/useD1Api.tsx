import { useState, useCallback } from "react";

declare const __DEVTOOLS_HTTP_PORT__: number;

const HTTP_PORT = typeof __DEVTOOLS_HTTP_PORT__ !== "undefined" ? __DEVTOOLS_HTTP_PORT__ : 5175;
const API_BASE = `http://localhost:${HTTP_PORT}`;

export type D1Database = {
  bindingName: string;
  databaseName: string;
  workerName: string;
};

export type D1Column = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

export type D1QueryResult = {
  success: boolean;
  results?: Record<string, unknown>[];
  meta?: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
  };
  error?: string;
};

export type D1TableData = {
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
};

/**
 * Hook to interact with the D1 API.
 */
export function useD1Api() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApi = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options?.headers,
          },
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }
        return data as T;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const listDatabases = useCallback(async (): Promise<D1Database[]> => {
    const result = await fetchApi<{ databases: D1Database[] }>("/api/d1/databases");
    return result?.databases ?? [];
  }, [fetchApi]);

  const listTables = useCallback(
    async (bindingName: string): Promise<string[]> => {
      const result = await fetchApi<{ tables: string[] }>(
        `/api/d1/${encodeURIComponent(bindingName)}/tables`,
      );
      return result?.tables ?? [];
    },
    [fetchApi],
  );

  const getTableSchema = useCallback(
    async (bindingName: string, tableName: string): Promise<D1Column[]> => {
      const result = await fetchApi<{ columns: D1Column[] }>(
        `/api/d1/${encodeURIComponent(bindingName)}/tables/${encodeURIComponent(tableName)}/schema`,
      );
      return result?.columns ?? [];
    },
    [fetchApi],
  );

  const getTableData = useCallback(
    async (
      bindingName: string,
      tableName: string,
      limit = 100,
      offset = 0,
    ): Promise<D1TableData | null> => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      return fetchApi<D1TableData>(
        `/api/d1/${encodeURIComponent(bindingName)}/tables/${encodeURIComponent(tableName)}/data?${params}`,
      );
    },
    [fetchApi],
  );

  const executeQuery = useCallback(
    async (
      bindingName: string,
      sql: string,
      params: unknown[] = [],
    ): Promise<D1QueryResult | null> => {
      return fetchApi<D1QueryResult>(`/api/d1/${encodeURIComponent(bindingName)}/query`, {
        method: "POST",
        body: JSON.stringify({ sql, params }),
      });
    },
    [fetchApi],
  );

  return {
    loading,
    error,
    listDatabases,
    listTables,
    getTableSchema,
    getTableData,
    executeQuery,
  };
}
