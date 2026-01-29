import { type WorkerOptions } from "miniflare";
import { D1Binding } from "../bindings/d1";
import { DurableObjectBinding } from "../bindings/durable-object";
import { WorkerConfig, Bindings } from "../bindings/worker";

/**
 * Converts our WorkerConfig into WorkerOptions for Miniflare
 */
export function buildWorkerOptions(
  worker: WorkerConfig<Bindings>,
  bundledScript: string,
  compatibilityDate: string,
): WorkerOptions {
  const options: WorkerOptions = {
    name: worker.name,
    modules: true,
    script: bundledScript,
    compatibilityDate,
    compatibilityFlags: ["nodejs_compat"],
    routes: [`http://localhost/${worker.name}/*`],
  };

  if (!worker.bindings) {
    return options;
  }

  for (const [key, binding] of Object.entries(worker.bindings)) {
    switch (binding._type) {
      case "D1":
        const d1Binding = binding as D1Binding;

        options.d1Databases ??= {};
        // Use the database name as the ID (Miniflare will create a local SQLite file)
        options.d1Databases[key] = d1Binding.name;

        break;
      case "DurableObject":
        const doBinding = binding as DurableObjectBinding<any>;

        const doConfig: { className: string; scriptName?: string } = {
          className: doBinding.className,
        };
        // If this DO is owned by a different worker, add scriptName for cross-worker reference
        if (doBinding._owner && doBinding._owner !== worker.name) {
          doConfig.scriptName = doBinding._owner;
        }

        options.durableObjects ??= {};
        options.durableObjects[key] = doConfig;

        break;
    }
  }

  return options;
}
