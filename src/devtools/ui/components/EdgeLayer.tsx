import { useEffect, useState, useCallback } from "react";
import type { GraphEdge } from "@/lib/graph";

type Point = { x: number; y: number };

type EdgeLayerProps = {
  edges: GraphEdge[];
  nodeRefs: Map<string, HTMLElement | null>;
  containerRef: React.RefObject<HTMLElement | null>;
  highlightedNodeId?: string | null;
};

/**
 * Calculate the connection points for an edge between two nodes.
 * Uses orthogonal routing with a horizontal-then-vertical path.
 */
function calculateEdgePath(
  fromRect: DOMRect,
  toRect: DOMRect,
  containerRect: DOMRect,
): { from: Point; to: Point; path: string } {
  // Determine relative positions
  const fromCenter = {
    x: fromRect.left + fromRect.width / 2 - containerRect.left,
    y: fromRect.top + fromRect.height / 2 - containerRect.top,
  };
  const toCenter = {
    x: toRect.left + toRect.width / 2 - containerRect.left,
    y: toRect.top + toRect.height / 2 - containerRect.top,
  };

  // Connection points on the edges of the cards
  let from: Point;
  let to: Point;

  // Determine if target is to the right or below
  const isToRight = toCenter.x > fromCenter.x + fromRect.width / 2;
  const isBelow = toCenter.y > fromCenter.y;

  if (isToRight) {
    // Connect from right edge to left edge
    from = {
      x: fromRect.right - containerRect.left,
      y: fromCenter.y,
    };
    to = {
      x: toRect.left - containerRect.left,
      y: toCenter.y,
    };
  } else if (isBelow) {
    // Connect from bottom edge to top edge
    from = {
      x: fromCenter.x,
      y: fromRect.bottom - containerRect.top,
    };
    to = {
      x: toCenter.x,
      y: toRect.top - containerRect.top,
    };
  } else {
    // Connect from bottom to top (default for same column)
    from = {
      x: fromCenter.x,
      y: fromRect.bottom - containerRect.top,
    };
    to = {
      x: toCenter.x,
      y: toRect.top - containerRect.top,
    };
  }

  // Create orthogonal path (horizontal then vertical, or direct if aligned)
  let path: string;

  if (Math.abs(from.x - to.x) < 5) {
    // Vertically aligned - straight line
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else if (Math.abs(from.y - to.y) < 5) {
    // Horizontally aligned - straight line
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else if (isToRight) {
    // Orthogonal: horizontal then vertical
    const midX = from.x + (to.x - from.x) / 2;
    path = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  } else {
    // Orthogonal: vertical then horizontal
    const midY = from.y + (to.y - from.y) / 2;
    path = `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
  }

  return { from, to, path };
}

export function EdgeLayer({ edges, nodeRefs, containerRef, highlightedNodeId }: EdgeLayerProps) {
  const [paths, setPaths] = useState<
    Array<{
      edge: GraphEdge;
      path: string;
      to: Point;
      isHighlighted: boolean;
    }>
  >([]);

  const updatePaths = useCallback(() => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newPaths: typeof paths = [];

    for (const edge of edges) {
      const fromEl = nodeRefs.get(edge.from);
      const toEl = nodeRefs.get(edge.to);

      if (!fromEl || !toEl) continue;

      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      const { path, to } = calculateEdgePath(fromRect, toRect, containerRect);

      const isHighlighted = highlightedNodeId === edge.from || highlightedNodeId === edge.to;

      newPaths.push({ edge, path, to, isHighlighted });
    }

    setPaths(newPaths);
  }, [edges, nodeRefs, containerRef, highlightedNodeId]);

  // Update paths on mount and when dependencies change
  useEffect(() => {
    updatePaths();

    // Also update on resize
    const observer = new ResizeObserver(updatePaths);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    // Update on scroll
    const container = containerRef.current;
    container?.addEventListener("scroll", updatePaths);

    return () => {
      observer.disconnect();
      container?.removeEventListener("scroll", updatePaths);
    };
  }, [updatePaths, containerRef]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        {/* Arrowhead marker */}
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" className="fill-muted-foreground/50" />
        </marker>
        <marker
          id="arrowhead-highlighted"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" className="fill-primary" />
        </marker>
      </defs>

      {paths.map(({ edge, path, isHighlighted }) => (
        <path
          key={edge.id}
          d={path}
          fill="none"
          className={
            isHighlighted ? "stroke-primary stroke-2" : "stroke-muted-foreground/40 stroke-[1.5]"
          }
          strokeDasharray={edge.isDashed ? "4 4" : undefined}
          markerEnd={`url(#arrowhead${isHighlighted ? "-highlighted" : ""})`}
        />
      ))}
    </svg>
  );
}
