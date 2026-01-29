import type { WorkerConfig, Bindings } from "./bindings/worker";
import type { D1Binding } from "./bindings/d1";
import type { DurableObjectBinding } from "./bindings/durable-object";
import type { KVBinding } from "./bindings/kv";
import type { R2Binding } from "./bindings/r2";
import {
  type MigrationState,
  type WranglerMigration,
  computeMigrations,
  MigrationValidationError,
} from "./migrations";

type DurableObjectWranglerBinding = {
  name: string;
  class_name: string;
  script_name?: string;
};

export type WranglerConfig = {
  name: string;
  main: string;
  compatibility_date: string;
  compatibility_flags?: string[];
  vars?: Record<string, string>;
  triggers?: { crons: string[] };
  dev?: {
    port?: number;
  };
  observability?: { enabled: boolean };
  d1_databases?: Array<{ binding: string; database_name: string; database_id?: string }>;
  kv_namespaces?: Array<{ binding: string; id: string; preview_id?: string }>;
  r2_buckets?: Array<{ binding: string; bucket_name: string }>;
  durable_objects?: {
    bindings: Array<DurableObjectWranglerBinding>;
  };
  migrations?: WranglerMigration[];
  services?: Array<{ binding: string; service: string }>;
};

export type GenerateOptions = {
  compatibility_date?: string;
  observability?: { enabled: boolean };
  port?: number;
  /** Migration state - if not provided, migrations won't be auto-managed */
  migrationState?: MigrationState;
  /** Explicitly deleted DO classes (for ambiguous removal cases) */
  deletedDurableObjects?: string[];
};

export type GenerateResult = {
  config: WranglerConfig;
  /** Updated migration state (if migrationState was provided) */
  updatedMigrationState?: MigrationState;
};

export const generateWranglerConfig = <B extends Bindings>(
  worker: WorkerConfig<B, Record<string, string>>,
  options?: GenerateOptions,
): GenerateResult => {
  const config: WranglerConfig = {
    name: worker.name,
    main: worker.entryPoint,
    compatibility_date: worker.compatibility?.date ?? options?.compatibility_date ?? "2026-01-28",
  };

  if (worker.compatibility?.flags && worker.compatibility.flags.length > 0) {
    config.compatibility_flags = worker.compatibility.flags;
  }

  if (worker.vars && Object.keys(worker.vars).length > 0) {
    config.vars = worker.vars;
  }

  if (worker.triggers?.crons && worker.triggers.crons.length > 0) {
    config.triggers = { crons: worker.triggers.crons };
  }

  if (options?.port) {
    config.dev = { port: options.port };
  }

  if (options?.observability) {
    config.observability = options.observability;
  }

  let updatedMigrationState: MigrationState | undefined;

  if (worker.bindings) {
    const d1Bindings: WranglerConfig["d1_databases"] = [];
    const kvBindings: WranglerConfig["kv_namespaces"] = [];
    const r2Bindings: WranglerConfig["r2_buckets"] = [];
    const doBindings: NonNullable<WranglerConfig["durable_objects"]>["bindings"] = [];
    const ownedDOs: DurableObjectBinding[] = [];
    // Track external workers we need service bindings for (for cross-worker DO calls)
    const externalWorkers = new Set<string>();

    for (const [key, binding] of Object.entries(worker.bindings)) {
      if (binding._type === "D1") {
        const d1 = binding as D1Binding;
        const d1Config: { binding: string; database_name: string; database_id?: string } = {
          binding: key,
          database_name: d1.name,
        };
        if (d1.id) {
          d1Config.database_id = d1.id;
        }
        d1Bindings.push(d1Config);
      } else if (binding._type === "KV") {
        const kv = binding as KVBinding;
        const kvConfig: { binding: string; id: string; preview_id?: string } = {
          binding: key,
          id: kv.id ?? kv.name,
        };
        if (kv.preview_id) {
          kvConfig.preview_id = kv.preview_id;
        }
        kvBindings.push(kvConfig);
      } else if (binding._type === "R2") {
        const r2 = binding as R2Binding;
        r2Bindings.push({ binding: key, bucket_name: r2.name });
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
          // This worker owns this DO - collect for migration
          ownedDOs.push(doBind);
        }

        doBindings.push(doConfig);
      }
    }

    if (d1Bindings.length > 0) config.d1_databases = d1Bindings;
    if (kvBindings.length > 0) config.kv_namespaces = kvBindings;
    if (r2Bindings.length > 0) config.r2_buckets = r2Bindings;
    if (doBindings.length > 0) config.durable_objects = { bindings: doBindings };

    // Auto-generate migrations for owned DOs
    if (ownedDOs.length > 0) {
      if (options?.migrationState) {
        // Use state-based migration management
        const result = computeMigrations(
          worker.name,
          ownedDOs,
          options.migrationState,
          options.deletedDurableObjects ?? [],
        );

        if (result.errors.length > 0) {
          throw new MigrationValidationError(result.errors);
        }

        if (result.migrations.length > 0) {
          config.migrations = result.migrations;
        }
        updatedMigrationState = result.updatedState;
      } else {
        // Fallback: simple migration without state management
        // Separate by storage type
        const sqliteClasses = ownedDOs
          .filter((d) => d.storage === "sqlite")
          .map((d) => d.className);
        const kvClasses = ownedDOs.filter((d) => d.storage === "kv").map((d) => d.className);

        const migration: WranglerMigration = { tag: "v1" };
        if (sqliteClasses.length > 0) migration.new_sqlite_classes = sqliteClasses;
        if (kvClasses.length > 0) migration.new_classes = kvClasses;

        config.migrations = [migration];
      }
    }

    // Generate service bindings for external workers (needed for cross-worker DO calls in multi-process dev)
    if (externalWorkers.size > 0) {
      config.services = Array.from(externalWorkers).map((serviceName) => ({
        binding: `__SERVICE_${serviceName.toUpperCase().replace(/-/g, "_")}__`,
        service: serviceName,
      }));
    }
  }

  return { config, updatedMigrationState };
};
