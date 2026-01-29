import { useState } from "react";
import { useDevtoolsSocket } from "@/hooks/useDevtoolsSocket";
import { ResourceGraph } from "@/components/ResourceGraph";
import { LogPanel } from "@/components/LogPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { LogLevel } from "../../../logger/utils";

const ALL_LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

type SelectedItem = {
  type: "worker" | "durable-object";
  name: string;
} | null;

export default function App() {
  const { workers, sharedBindings, logs, connected } = useDevtoolsSocket();
  const [selectedItem, setSelectedItem] = useState<SelectedItem>(null);
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LOG_LEVELS));

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

      {/* Log Panel (slides in from right) */}
      <LogPanel
        isOpen={selectedItem !== null}
        title={panelTitle}
        logs={filteredLogs}
        enabledLevels={enabledLevels}
        onEnabledLevelsChange={setEnabledLevels}
        onClose={() => setSelectedItem(null)}
      />

      {/* Overlay when panel is open (for click-outside-to-close) */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
