import { useEffect, useRef } from "react";
import { Filter } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { LogEntry } from "../../../logger";
import type { LogLevel } from "../../../logger/utils";

type LogViewerProps = {
  logs: LogEntry[];
  enabledLevels: Set<LogLevel>;
  onEnabledLevelsChange: (levels: Set<LogLevel>) => void;
};

const ALL_LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const LEVEL_BADGE_STYLES: Record<LogLevel, string> = {
  debug: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  warn: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  error: "bg-destructive/10 text-destructive",
};

const LEVEL_ROW_STYLES: Record<LogLevel, string> = {
  debug: "",
  info: "",
  warn: "bg-yellow-50/50 dark:bg-yellow-950/20",
  error: "bg-red-50/50 dark:bg-red-950/20",
};

export function LogViewer({ logs, enabledLevels, onEnabledLevelsChange }: LogViewerProps) {
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

  const toggleLevel = (level: LogLevel) => {
    const newLevels = new Set(enabledLevels);
    if (newLevels.has(level)) {
      newLevels.delete(level);
    } else {
      newLevels.add(level);
    }
    onEnabledLevelsChange(newLevels);
  };

  const enabledCount = enabledLevels.size;
  const allEnabled = enabledCount === ALL_LEVELS.length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-muted/30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="size-3.5" />
              Filter
              {!allEnabled && (
                <Badge variant="secondary" className="ml-1 px-1.5 py-0">
                  {enabledCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Log Levels</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_LEVELS.map((level) => (
              <DropdownMenuCheckboxItem
                key={level}
                checked={enabledLevels.has(level)}
                onCheckedChange={() => toggleLevel(level)}
              >
                <Badge
                  variant="outline"
                  className={cn("border-0 uppercase", LEVEL_BADGE_STYLES[level])}
                >
                  {level}
                </Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Log content */}
      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No logs yet
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div ref={containerRef} onScroll={handleScroll} className="font-mono text-sm">
            {logs.map((log, index) => (
              <div
                key={index}
                className={cn(
                  "flex gap-3 px-4 py-1.5 hover:bg-accent/50",
                  LEVEL_ROW_STYLES[log.level],
                )}
              >
                <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-0 uppercase w-14 justify-center shrink-0",
                    LEVEL_BADGE_STYLES[log.level],
                  )}
                >
                  {log.level}
                </Badge>
                {log.service && <span className="text-primary shrink-0">[{log.service}]</span>}
                <span className="break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
