import type { WorkerInfo, SharedBinding } from "../../server";

/**
 * Node types in the resource graph.
 */
export type NodeType = "worker" | "binding" | "durable-object" | "shared-binding";

/**
 * A node in the resource graph.
 */
export type GraphNode = {
  id: string;
  type: NodeType;
  label: string;
  bindingType?: string; // KV, D1, R2, DurableObject, QueueProducer, QueueConsumer
  className?: string; // For DOs
  owner?: string; // For DOs: which worker owns it
  port?: number; // For workers
  url?: string; // For workers
  usedBy?: string[]; // For shared bindings
  isSelectable: boolean;
  column: number; // Grid column position
  row: number; // Grid row position
};

/**
 * An edge connecting two nodes.
 */
export type GraphEdge = {
  id: string;
  from: string; // Node ID
  to: string; // Node ID
  type: "owns" | "uses" | "binding"; // owns = DO owner, uses = DO user, binding = worker->binding
  isDashed?: boolean;
};

/**
 * Build graph nodes and edges from worker info and shared bindings.
 */
export function buildGraph(
  workers: WorkerInfo[],
  sharedBindings: SharedBinding[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Track shared binding names to avoid duplicates
  const sharedBindingKeys = new Set(
    sharedBindings.map((b) =>
      b.type === "DurableObject" ? `DO:${b.className}` : `${b.type}:${b.name}`,
    ),
  );

  // Create worker nodes and their binding nodes
  workers.forEach((worker, workerIndex) => {
    const column = workerIndex;

    // Worker node
    const workerNode: GraphNode = {
      id: `worker:${worker.name}`,
      type: "worker",
      label: worker.name,
      port: worker.port,
      url: worker.url,
      isSelectable: true,
      column,
      row: 0,
    };
    nodes.push(workerNode);

    // Binding nodes for this worker
    let bindingRow = 1;
    worker.bindings.forEach((binding) => {
      const isDO = binding.type === "DurableObject";
      const isKV = binding.type === "KV";
      const isD1 = binding.type === "D1";
      const bindingKey = isDO ? `DO:${binding.className}` : `${binding.type}:${binding.name}`;

      // Skip if this is a shared binding (will be rendered in shared column)
      if (sharedBindingKeys.has(bindingKey)) {
        return;
      }

      const bindingId = `binding:${worker.name}:${binding.name}`;
      const isClickable = isDO || isKV || isD1;
      const bindingNode: GraphNode = {
        id: bindingId,
        type: isDO ? "durable-object" : "binding",
        label: isDO ? binding.className || binding.name : binding.name,
        bindingType: binding.type,
        className: binding.className,
        owner: binding.owner,
        isSelectable: isClickable,
        column,
        row: bindingRow++,
      };
      nodes.push(bindingNode);

      // Edge from worker to binding
      edges.push({
        id: `edge:${workerNode.id}->${bindingId}`,
        from: workerNode.id,
        to: bindingId,
        type: "binding",
      });
    });
  });

  // Create shared binding nodes in the rightmost column
  const sharedColumn = workers.length;
  sharedBindings.forEach((binding, index) => {
    const isDO = binding.type === "DurableObject";
    const isKV = binding.type === "KV";
    const isD1 = binding.type === "D1";
    const bindingId = `shared:${binding.type}:${binding.name}`;

    const isClickable = isDO || isKV || isD1;
    const sharedNode: GraphNode = {
      id: bindingId,
      type: "shared-binding",
      label: isDO ? binding.className || binding.name : binding.name,
      bindingType: binding.type,
      className: binding.className,
      owner: binding.owner,
      usedBy: binding.usedBy,
      isSelectable: isClickable,
      column: sharedColumn,
      row: index,
    };
    nodes.push(sharedNode);

    // Create edges from each worker that uses this binding
    binding.usedBy.forEach((workerName) => {
      const isOwner = isDO && binding.owner === workerName;
      edges.push({
        id: `edge:worker:${workerName}->${bindingId}:${isOwner ? "owns" : "uses"}`,
        from: `worker:${workerName}`,
        to: bindingId,
        type: isOwner ? "owns" : "uses",
        isDashed: !isOwner,
      });
    });
  });

  return { nodes, edges };
}

/**
 * Get the display name for a binding type.
 */
export function getBindingTypeLabel(type: string): string {
  switch (type) {
    case "DurableObject":
      return "DO";
    case "QueueProducer":
      return "Queue";
    case "QueueConsumer":
      return "Queue";
    default:
      return type;
  }
}
