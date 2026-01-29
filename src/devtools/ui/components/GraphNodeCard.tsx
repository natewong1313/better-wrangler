import { forwardRef } from "react";
import { Server, Database, HardDrive, Box, MessageSquare, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GraphNode } from "@/lib/graph";
import { getBindingTypeLabel } from "@/lib/graph";

type GraphNodeCardProps = {
  node: GraphNode;
  isSelected?: boolean;
  isHighlighted?: boolean;
  onSelect?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

// Icon mapping for binding types
const BINDING_ICONS: Record<string, React.ReactNode> = {
  KV: <Database className="size-4" />,
  D1: <Database className="size-4" />,
  R2: <HardDrive className="size-4" />,
  DurableObject: <Box className="size-4" />,
  QueueProducer: <MessageSquare className="size-4" />,
  QueueConsumer: <MessageSquare className="size-4" />,
};

// Color schemes for different node types
const NODE_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  worker: {
    bg: "bg-card",
    border: "border-primary/50",
    icon: "text-primary",
  },
  KV: {
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-300 dark:border-blue-700",
    icon: "text-blue-500",
  },
  D1: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    border: "border-purple-300 dark:border-purple-700",
    icon: "text-purple-500",
  },
  R2: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    border: "border-orange-300 dark:border-orange-700",
    icon: "text-orange-500",
  },
  DurableObject: {
    bg: "bg-green-50 dark:bg-green-950/30",
    border: "border-green-300 dark:border-green-700",
    icon: "text-green-500",
  },
  QueueProducer: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-300 dark:border-yellow-700",
    icon: "text-yellow-600",
  },
  QueueConsumer: {
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    border: "border-yellow-300 dark:border-yellow-700",
    icon: "text-yellow-600",
  },
  shared: {
    bg: "bg-muted/50",
    border: "border-muted-foreground/30",
    icon: "text-muted-foreground",
  },
};

export const GraphNodeCard = forwardRef<HTMLDivElement, GraphNodeCardProps>(function GraphNodeCard(
  { node, isSelected, isHighlighted, onSelect, onMouseEnter, onMouseLeave },
  ref,
) {
  const isWorker = node.type === "worker";
  const isShared = node.type === "shared-binding";
  const colorKey = isWorker ? "worker" : isShared ? "shared" : node.bindingType || "shared";
  const colors = NODE_COLORS[colorKey] || NODE_COLORS.shared;

  const icon = isWorker ? (
    <Server className={cn("size-5", colors.icon)} />
  ) : isShared ? (
    <Share2 className={cn("size-4", colors.icon)} />
  ) : (
    <span className={colors.icon}>{BINDING_ICONS[node.bindingType || ""]}</span>
  );

  return (
    <Card
      ref={ref}
      className={cn(
        "w-48 transition-all duration-150",
        colors.bg,
        colors.border,
        "border-2",
        node.isSelectable && "cursor-pointer hover:shadow-md hover:scale-[1.02]",
        isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        isHighlighted && "shadow-lg scale-[1.02]",
        !node.isSelectable && "opacity-80",
      )}
      onClick={node.isSelectable ? onSelect : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CardContent className="p-3">
        {/* Header with icon and label */}
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="font-medium truncate text-sm">{node.label}</span>
        </div>

        {/* Worker-specific info */}
        {isWorker && node.port && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              :{node.port}
            </Badge>
            <span className="w-2 h-2 rounded-full bg-green-500" title="Running" />
          </div>
        )}

        {/* Binding type badge for non-workers */}
        {!isWorker && node.bindingType && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {getBindingTypeLabel(node.bindingType)}
            </Badge>
            {node.type === "durable-object" && node.owner && (
              <span className="text-xs text-muted-foreground truncate">Owner: {node.owner}</span>
            )}
          </div>
        )}

        {/* Shared binding usage info */}
        {isShared && node.usedBy && node.usedBy.length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="block truncate">Used by: {node.usedBy.join(", ")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
