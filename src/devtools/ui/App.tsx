import { useState } from "react";
import { useDevtoolsSocket } from "./hooks/useDevtoolsSocket";
import { WorkerList } from "./components/WorkerList";
import { LogViewer } from "./components/LogViewer";

export default function App() {
  const { workers, logs, connected } = useDevtoolsSocket();
  const [selectedWorker, setSelectedWorker] = useState<string | null>(null);

  const filteredLogs = selectedWorker ? logs.filter((log) => log.service === selectedWorker) : logs;

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <h1 className="text-lg font-semibold text-white">better-wrangler devtools</h1>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-sm text-gray-400">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-gray-700 bg-gray-800 overflow-y-auto">
          <div className="p-3 border-b border-gray-700">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Workers</h2>
          </div>
          <WorkerList
            workers={workers}
            selectedWorker={selectedWorker}
            onSelectWorker={setSelectedWorker}
          />
        </aside>

        {/* Log viewer */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
            <h2 className="text-sm font-medium text-gray-400">
              Logs {selectedWorker && `- ${selectedWorker}`}
            </h2>
            {selectedWorker && (
              <button
                onClick={() => setSelectedWorker(null)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Clear filter
              </button>
            )}
          </div>
          <LogViewer logs={filteredLogs} />
        </main>
      </div>
    </div>
  );
}
