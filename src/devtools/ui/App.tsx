import { useState, useCallback } from "react";
import { useDevtoolsSocket } from "@/hooks/useDevtoolsSocket";
import { ResourceGraph } from "@/components/ResourceGraph";
import { LogPanel } from "@/components/LogPanel";
import { KVPanel } from "@/components/KVPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LogLevel } from "../../../logger/utils";

const ALL_LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

type SelectedItem =
  | { type: "worker"; name: string }
  | { type: "durable-object"; name: string }
  | { type: "kv"; name: string; workerName: string }
  | null;

export default function App() {
  const {
    workers,
    sharedBindings,
    logs,
    connected,
    kvNamespaces,
    kvEntries,
    kvExpandedValues,
    kvLoading,
    listKvEntries,
    getKvValue,
    putKvEntry,
    deleteKvEntry,
  } = useDevtoolsSocket();
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LOG_LEVELS));

  // Find the worker name for a KV namespace binding
  const findKvWorkerName = useCallback(
    (bindingName: string): string => {
      const ns = kvNamespaces.find((n) => n.bindingName === bindingName);
      return ns?.workerName ?? "unknown";
    },
    [kvNamespaces],
  );

  // KV panel handlers
  const handleKvRefresh = useCallback(() => {
    if (selectedItem?.type === "kv") {
      listKvEntries(selectedItem.name);
    }
  }, [selectedItem, listKvEntries]);

  const handleKvGetValue = useCallback(
    (key: string) => {
      if (selectedItem?.type === "kv") {
        getKvValue(selectedItem.name, key);
      }
    },
    [selectedItem, getKvValue],
  );

  const handleKvPut = useCallback(
    (
      key: string,
      value: string,
      metadata?: unknown,
      expirationTtl?: number,
      callback?: (success: boolean, error?: string) => void,
    ) => {
      if (selectedItem?.type === "kv") {
        putKvEntry(selectedItem.name, key, value, metadata, expirationTtl, callback);
      }
    },
    [selectedItem, putKvEntry],
  );

  const handleKvDelete = useCallback(
    (key: string, callback?: (success: boolean, error?: string) => void) => {
      if (selectedItem?.type === "kv") {
        deleteKvEntry(selectedItem.name, key, callback);
      }
    },
    [selectedItem, deleteKvEntry],
  );

  // Filter logs based on selection
  const filteredLogs = logs.filter((log) => {
    // Filter by selected item
    if (selectedItem) {
      if (selectedItem.type === "worker" && log.service !== selectedItem.name) {
        return false;
      }
      if (selectedItem.type === "durable-object" && log.service !== selectedItem.name) {
        return false;
      }
    }
    // Filter by level
    if (!enabledLevels.has(log.level)) {
      return false;
    }
    return true;
  });

  // Get title for log panel
  const panelTitle = selectedItem
    ? selectedItem.type === "worker"
      ? `${selectedItem.name} Logs`
      : `${selectedItem.name} (DO) Logs`
    : "";

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <h1 className="text-lg font-semibold">better-wrangler devtools</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm text-muted-foreground">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content - Graph View */}
      <main className="flex-1 overflow-hidden">
        <ResourceGraph
          workers={workers}
          sharedBindings={sharedBindings}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
        />
      </main>

      {/* Log Panel (slides in from right) - for workers and DOs */}
      <LogPanel
        isOpen={selectedItem !== null && selectedItem.type !== "kv"}
        title={panelTitle}
        logs={filteredLogs}
        enabledLevels={enabledLevels}
        onEnabledLevelsChange={setEnabledLevels}
        onClose={() => setSelectedItem(null)}
      />

      {/* KV Panel (slides in from right) - for KV namespaces */}
      <KVPanel
        isOpen={selectedItem?.type === "kv"}
        namespace={selectedItem?.type === "kv" ? selectedItem.name : ""}
        workerName={selectedItem?.type === "kv" ? selectedItem.workerName : ""}
        entries={selectedItem?.type === "kv" ? (kvEntries.get(selectedItem.name) ?? []) : []}
        expandedValues={kvExpandedValues}
        loading={kvLoading}
        onClose={() => setSelectedItem(null)}
        onRefresh={handleKvRefresh}
        onGetValue={handleKvGetValue}
        onPut={handleKvPut}
        onDelete={handleKvDelete}
      />

      {/* Overlay when panel is open (for click-outside-to-close) */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
