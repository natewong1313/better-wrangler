type BindingBadgeProps = {
  type: string;
};

const BINDING_COLORS: Record<string, string> = {
  KV: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  D1: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  R2: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DurableObject: "bg-green-500/20 text-green-400 border-green-500/30",
  QueueProducer: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  QueueConsumer: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const BINDING_SHORT_NAMES: Record<string, string> = {
  KV: "KV",
  D1: "D1",
  R2: "R2",
  DurableObject: "DO",
  QueueProducer: "Q",
  QueueConsumer: "Q",
};

export function BindingBadge({ type }: BindingBadgeProps) {
  const colorClass = BINDING_COLORS[type] ?? "bg-gray-500/20 text-gray-400 border-gray-500/30";
  const shortName = BINDING_SHORT_NAMES[type] ?? type.slice(0, 2).toUpperCase();

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded border ${colorClass}`}
      title={type}
    >
      {shortName}
    </span>
  );
}
