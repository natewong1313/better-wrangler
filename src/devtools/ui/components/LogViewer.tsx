import { useEffect, useRef } from "react";
import type { LogEntry } from "../../../logger";

type LogViewerProps = {
  logs: LogEntry[];
};

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-gray-500",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
};

const LEVEL_BG: Record<string, string> = {
  debug: "",
  info: "",
  warn: "bg-yellow-500/5",
  error: "bg-red-500/10",
};

export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Track if user has scrolled up
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Auto-scroll if within 50px of bottom
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">No logs yet</div>;
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto font-mono text-sm"
    >
      {logs.map((log, index) => (
        <div
          key={index}
          className={`flex gap-3 px-4 py-1 hover:bg-gray-800/50 ${LEVEL_BG[log.level] ?? ""}`}
        >
          <span className="text-gray-500 shrink-0">{log.timestamp}</span>
          <span className={`w-12 shrink-0 uppercase ${LEVEL_COLORS[log.level] ?? "text-gray-400"}`}>
            {log.level}
          </span>
          {log.service && <span className="text-cyan-400 shrink-0">[{log.service}]</span>}
          <span className="text-gray-200 break-all">{log.message}</span>
        </div>
      ))}
    </div>
  );
}
