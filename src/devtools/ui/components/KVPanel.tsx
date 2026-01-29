import { useEffect, useRef } from "react";
import { X, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KVViewer } from "./KVViewer";
import type { KVEntry } from "../../server";

type KVPanelProps = {
  isOpen: boolean;
  namespace: string;
  workerName: string;
  entries: KVEntry[];
  expandedValues: Map<string, string>;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onGetValue: (key: string) => void;
  onPut: (
    key: string,
    value: string,
    metadata?: unknown,
    expirationTtl?: number,
    callback?: (success: boolean, error?: string) => void,
  ) => void;
  onDelete: (key: string, callback?: (success: boolean, error?: string) => void) => void;
};

const AUTO_REFRESH_INTERVAL = 5000; // 5 seconds

export function KVPanel({
  isOpen,
  namespace,
  workerName,
  entries,
  expandedValues,
  loading,
  error,
  onClose,
  onRefresh,
  onGetValue,
  onPut,
  onDelete,
}: KVPanelProps) {
  const refreshIntervalRef = useRef<number | null>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch entries when panel opens and set up auto-refresh
  useEffect(() => {
    if (isOpen) {
      // Initial fetch
      onRefresh();

      // Set up auto-refresh
      refreshIntervalRef.current = window.setInterval(() => {
        onRefresh();
      }, AUTO_REFRESH_INTERVAL);

      return () => {
        if (refreshIntervalRef.current) {
          clearInterval(refreshIntervalRef.current);
          refreshIntervalRef.current = null;
        }
      };
    }
  }, [isOpen, namespace, onRefresh]);

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-[700px] bg-background border-l border-border shadow-lg transform transition-transform duration-200 ease-in-out z-50",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="h-4 w-4 text-blue-500 shrink-0" />
          <h2 className="font-semibold truncate">{namespace}</h2>
          <span className="text-sm text-muted-foreground truncate">({workerName})</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="h-[calc(100%-57px)]">
        <KVViewer
          entries={entries}
          expandedValues={expandedValues}
          namespace={namespace}
          loading={loading}
          error={error}
          onRefresh={onRefresh}
          onGetValue={onGetValue}
          onPut={onPut}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
