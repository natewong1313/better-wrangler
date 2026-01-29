import type { WorkerConfig, Bindings } from "./bindings/worker";
import type { D1Binding } from "./bindings/d1";
import type { DurableObjectBinding } from "./bindings/durable-object";

type DurableObjectWranglerBinding = {
  name: string;
  class_name: string;
  script_name?: string;
};

type WranglerMigration = {
  tag: string;
  new_classes?: string[];
  renamed_classes?: Array<{ from: string; to: string }>;
  deleted_classes?: string[];
};

export type WranglerConfig = {
  name: string;
  main: string;
  compatibility_date: string;
  dev?: {
    port?: number;
  };
  observability?: { enabled: boolean };
  d1_databases?: Array<{ binding: string; database_name: string }>;
  durable_objects?: {
    bindings: Array<DurableObjectWranglerBinding>;
  };
  migrations?: WranglerMigration[];
  /**
   * Service bindings for cross-worker communication.
   * Required in multi-process dev mode for cross-worker DO calls.
   */
  services?: Array<{ binding: string; service: string }>;
};

export type GenerateOptions = {
  compatibility_date?: string;
  observability?: { enabled: boolean };
  port?: number;
};

export const generateWranglerConfig = <B extends Bindings>(
  worker: WorkerConfig<B>,
  options?: GenerateOptions,
): WranglerConfig => {
  const config: WranglerConfig = {
    name: worker.name,
    main: worker.entryPoint,
    compatibility_date: options?.compatibility_date ?? "2025-01-28",
  };

  if (options?.port) {
    config.dev = { port: options.port };
  }

  if (options?.observability) {
    config.observability = options.observability;
  }

  if (worker.bindings) {
    const d1Bindings: WranglerConfig["d1_databases"] = [];
    const doBindings: NonNullable<
      WranglerConfig["durable_objects"]
    >["bindings"] = [];
    const ownedDOClasses: string[] = [];
    // Track external workers we need service bindings for (for cross-worker DO calls)
    const externalWorkers = new Set<string>();

    for (const [key, binding] of Object.entries(worker.bindings)) {
      if (binding._type === "D1") {
        const d1 = binding as D1Binding;
        d1Bindings.push({ binding: key, database_name: d1.name });
      } else if (binding._type === "DurableObject") {
        const doBind = binding as DurableObjectBinding;
        const doConfig: DurableObjectWranglerBinding = {
          name: key,
          class_name: doBind.className,
        };

        // If this DO is owned by a different worker, add script_name
        if (doBind._owner && doBind._owner !== worker.name) {
          doConfig.script_name = doBind._owner;
          // Track that we need a service binding to this worker
          externalWorkers.add(doBind._owner);
        } else if (doBind._owner === worker.name) {
          // This worker owns this DO - needs migration
          ownedDOClasses.push(doBind.className);
        }

        doBindings.push(doConfig);
      }
    }

    if (d1Bindings.length > 0) config.d1_databases = d1Bindings;
    if (doBindings.length > 0)
      config.durable_objects = { bindings: doBindings };

    // Auto-generate migrations for owned DOs only
    if (ownedDOClasses.length > 0) {
      config.migrations = [
        {
          tag: "v1",
          new_classes: ownedDOClasses,
        },
      ];
    }

    // Generate service bindings for external workers (needed for cross-worker DO calls in multi-process dev)
    if (externalWorkers.size > 0) {
      config.services = Array.from(externalWorkers).map((serviceName) => ({
        binding: `__SERVICE_${serviceName.toUpperCase().replace(/-/g, "_")}__`,
        service: serviceName,
      }));
    }
  }

  return config;
};
