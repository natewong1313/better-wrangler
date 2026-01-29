import { useState } from "react";
import { useDevtoolsSocket } from "@/hooks/useDevtoolsSocket";
import { WorkerList } from "@/components/WorkerList";
import { LogViewer } from "@/components/LogViewer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import type { LogLevel } from "../../../logger/utils";

const ALL_LOG_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

export default function App() {
  const { workers, logs, connected } = useDevtoolsSocket();
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(new Set(ALL_LOG_LEVELS));

  const filteredLogs = logs.filter((log) => {
    // Filter by worker if selected
    if (selectedWorker && log.service !== selectedWorker) {
      return false;
    }
    // Filter by log level
    if (!enabledLevels.has(log.level)) {
      return false;
    }
    return true;
  });

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

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border bg-sidebar-background overflow-y-auto">
          <div className="p-3 border-b border-border">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Workers
            </h2>
          </div>
          <WorkerList
            workers={workers}
            selectedWorker={selectedWorker}
            onSelectWorker={setSelectedWorker}
          />
        </aside>

        {/* Log viewer */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <h2 className="text-sm font-medium text-muted-foreground">
              Logs {selectedWorker && `- ${selectedWorker}`}
            </h2>
            <div className="flex items-center gap-2">
              {selectedWorker && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedWorker(null)}>
                  Clear filter
                </Button>
              )}
            </div>
          </div>
          <LogViewer
            logs={filteredLogs}
            enabledLevels={enabledLevels}
            onEnabledLevelsChange={setEnabledLevels}
          />
        </main>
      </div>
    </div>
  );
}
