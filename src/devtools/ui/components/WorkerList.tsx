import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkerInfo } from "../../server";

type WorkerListProps = {
  workers: WorkerInfo[];
  selectedWorker: string | null;
  onSelectWorker: (name: string | null) => void;
};

const BINDING_STYLES: Record<string, string> = {
  KV: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  D1: "bg-primary/10 text-primary",
  R2: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  DurableObject: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  QueueProducer: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  QueueConsumer: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
};

const BINDING_SHORT_NAMES: Record<string, string> = {
  KV: "KV",
  D1: "D1",
  R2: "R2",
  DurableObject: "DO",
  QueueProducer: "Q",
  QueueConsumer: "Q",
};

export function WorkerList({ workers, selectedWorker, onSelectWorker }: WorkerListProps) {
  if (workers.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No workers running</div>;
  }

  return (
    <ul className="divide-y divide-border">
      {workers.map((worker) => {
        const isSelected = selectedWorker === worker.name;

        return (
          <li key={worker.name}>
            <button
              onClick={() => onSelectWorker(isSelected ? null : worker.name)}
              className={cn(
                "w-full text-left p-3 hover:bg-accent/50 transition-colors",
                isSelected && "bg-accent",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-medium">{worker.name}</span>
              </div>

              <div className="text-xs text-muted-foreground mb-2">:{worker.port}</div>

              {worker.bindings.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {worker.bindings.map((binding) => {
                    const style =
                      BINDING_STYLES[binding.type] ?? "bg-secondary text-secondary-foreground";
                    const shortName =
                      BINDING_SHORT_NAMES[binding.type] ?? binding.type.slice(0, 2).toUpperCase();

                    return (
                      <Badge
                        key={binding.name}
                        variant="outline"
                        className={cn("border-0", style)}
                        title={`${binding.name} (${binding.type})`}
                      >
                        {shortName}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
