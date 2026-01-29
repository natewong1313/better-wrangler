import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogViewer } from "@/components/LogViewer";
import { cn } from "@/lib/utils";
import type { LogEntry } from "../../../logger";
import type { LogLevel } from "../../../logger/utils";

type LogPanelProps = {
  isOpen: boolean;
  title: string;
  logs: LogEntry[];
  enabledLevels: Set<LogLevel>;
  onEnabledLevelsChange: (levels: Set<LogLevel>) => void;
  onClose: () => void;
};

export function LogPanel({
  isOpen,
  title,
  logs,
  enabledLevels,
  onEnabledLevelsChange,
  onClose,
}: LogPanelProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-[600px] bg-background border-l border-border shadow-lg transform transition-transform duration-200 ease-in-out z-50",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="font-semibold truncate">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Log viewer */}
      <div className="h-[calc(100%-57px)] flex flex-col">
        <LogViewer
          logs={logs}
          enabledLevels={enabledLevels}
          onEnabledLevelsChange={onEnabledLevelsChange}
        />
      </div>
    </div>
  );
}
