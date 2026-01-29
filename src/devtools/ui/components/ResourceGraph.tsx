import { useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layers } from "lucide-react";
import { GraphNodeCard } from "@/components/GraphNodeCard";
import { EdgeLayer } from "@/components/EdgeLayer";
import { buildGraph, type GraphNode } from "@/lib/graph";
import type { WorkerInfo, SharedBinding } from "../../server";

type SelectedItem =
  | { type: "worker"; name: string }
  | { type: "durable-object"; name: string }
  | { type: "kv"; name: string; workerName: string }
  | null;

type ResourceGraphProps = {
  workers: WorkerInfo[];
  sharedBindings: SharedBinding[];
  selectedItem: SelectedItem;
  onSelectItem: (item: SelectedItem) => void;
};

// Empty state component
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Layers className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">No workers running</h3>
      <p className="text-sm text-muted-foreground">Start a worker to see it here</p>
    </div>
  );
}

export function ResourceGraph({
  workers,
  sharedBindings,
  selectedItem,
  onSelectItem,
}: ResourceGraphProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [nodeRefs] = useState(() => new Map<string, HTMLElement | null>());
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // Build the graph from workers and shared bindings
  const { nodes, edges } = useMemo(
    () => buildGraph(workers, sharedBindings),
    [workers, sharedBindings],
  );

  // Group nodes by column
  const columns = useMemo(() => {
    const columnMap = new Map<number, GraphNode[]>();
    for (const node of nodes) {
      const col = node.column;
      if (!columnMap.has(col)) {
        columnMap.set(col, []);
      }
      columnMap.get(col)!.push(node);
    }
    // Sort nodes within each column by row
    for (const col of columnMap.values()) {
      col.sort((a, b) => a.row - b.row);
    }
    return columnMap;
  }, [nodes]);

  // Check if a node is selected
  const isNodeSelected = useCallback(
    (node: GraphNode) => {
      if (!selectedItem) return false;
      if (selectedItem.type === "worker" && node.type === "worker") {
        return node.label === selectedItem.name;
      }
      if (selectedItem.type === "durable-object") {
        return (
          (node.type === "durable-object" || node.type === "shared-binding") &&
          node.bindingType === "DurableObject" &&
          (node.className === selectedItem.name || node.label === selectedItem.name)
        );
      }
      if (selectedItem.type === "kv") {
        return (
          (node.type === "binding" || node.type === "shared-binding") &&
          node.bindingType === "KV" &&
          node.label === selectedItem.name
        );
      }
      return false;
    },
    [selectedItem],
  );

  // Handle node selection
  const handleNodeSelect = useCallback(
    (node: GraphNode) => {
      // D1 nodes navigate to the D1 viewer page
      if (node.bindingType === "D1") {
        navigate(`/d1/${encodeURIComponent(node.label)}`);
        return;
      }

      if (!node.isSelectable) return;

      const currentlySelected = isNodeSelected(node);
      if (currentlySelected) {
        onSelectItem(null);
      } else if (node.type === "worker") {
        onSelectItem({ type: "worker", name: node.label });
      } else if (
        (node.type === "durable-object" || node.type === "shared-binding") &&
        node.bindingType === "DurableObject"
      ) {
        onSelectItem({
          type: "durable-object",
          name: node.className || node.label,
        });
      } else if (
        (node.type === "binding" || node.type === "shared-binding") &&
        node.bindingType === "KV"
      ) {
        // Find the worker that owns this KV binding
        const workerName =
          node.owner ||
          workers.find((w) => w.bindings.some((b) => b.name === node.label))?.name ||
          "unknown";
        onSelectItem({
          type: "kv",
          name: node.label,
          workerName,
        });
      }
    },
    [isNodeSelected, onSelectItem, navigate, workers],
  );

  // Set ref for a node
  const setNodeRef = useCallback(
    (nodeId: string, el: HTMLElement | null) => {
      nodeRefs.set(nodeId, el);
    },
    [nodeRefs],
  );

  if (workers.length === 0) {
    return <EmptyState />;
  }

  // Determine number of columns
  const numColumns = Math.max(...Array.from(columns.keys())) + 1;
  const hasSharedBindings = sharedBindings.length > 0;

  return (
    <div ref={containerRef} className="relative h-full overflow-auto p-8 graph-background">
      {/* Edge layer (SVG arrows) */}
      <EdgeLayer
        edges={edges}
        nodeRefs={nodeRefs}
        containerRef={containerRef}
        highlightedNodeId={highlightedNodeId}
      />

      {/* Grid of node cards */}
      <div
        className="relative grid gap-x-16 gap-y-4"
        style={{
          gridTemplateColumns: `repeat(${numColumns}, 1fr)`,
        }}
      >
        {/* Column headers */}
        {Array.from(columns.keys())
          .sort((a, b) => a - b)
          .map((colIndex) => {
            const isSharedColumn = hasSharedBindings && colIndex === numColumns - 1;
            const workerNode = columns.get(colIndex)?.find((n) => n.type === "worker");
            const headerLabel = isSharedColumn
              ? "Shared Bindings"
              : workerNode?.label || `Column ${colIndex + 1}`;

            return (
              <div key={`header-${colIndex}`} className="mb-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {isSharedColumn ? headerLabel : "Worker"}
                </h3>
              </div>
            );
          })}

        {/* Node cards by column */}
        {Array.from(columns.keys())
          .sort((a, b) => a - b)
          .map((colIndex) => {
            const colNodes = columns.get(colIndex) || [];

            return (
              <div key={`col-${colIndex}`} className="flex flex-col gap-4">
                {colNodes.map((node) => (
                  <GraphNodeCard
                    key={node.id}
                    ref={(el) => setNodeRef(node.id, el)}
                    node={node}
                    isSelected={isNodeSelected(node)}
                    isHighlighted={highlightedNodeId === node.id}
                    onSelect={() => handleNodeSelect(node)}
                    onMouseEnter={() => setHighlightedNodeId(node.id)}
                    onMouseLeave={() => setHighlightedNodeId(null)}
                  />
                ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}
