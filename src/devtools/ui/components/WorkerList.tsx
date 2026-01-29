import { BindingBadge } from "./BindingBadge";
import type { WorkerInfo } from "../../server";

type WorkerListProps = {
  workers: WorkerInfo[];
  selectedWorker: string | null;
  onSelectWorker: (name: string | null) => void;
};

export function WorkerList({ workers, selectedWorker, onSelectWorker }: WorkerListProps) {
  if (workers.length === 0) {
    return <div className="p-4 text-sm text-gray-500">No workers running</div>;
  }

  return (
    <ul className="divide-y divide-gray-700">
      {workers.map((worker) => {
        const isSelected = selectedWorker === worker.name;

        return (
          <li key={worker.name}>
            <button
              onClick={() => onSelectWorker(isSelected ? null : worker.name)}
              className={`w-full text-left p-3 hover:bg-gray-700/50 transition-colors ${
                isSelected ? "bg-gray-700" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="font-medium text-white">{worker.name}</span>
              </div>

              <div className="text-xs text-gray-400 mb-2">:{worker.port}</div>

              {worker.bindings.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {worker.bindings.map((binding) => (
                    <BindingBadge key={binding.name} type={binding.type} />
                  ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
