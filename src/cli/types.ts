import type { WorkerConfig, Bindings } from "../bindings/worker";

export type { WorkerConfig, Bindings };

export type SyncResult = {
  workers: WorkerConfig<Bindings>[];
  configPaths: Map<string, string>;
};

export type ParsedArgs = {
  command: string | undefined;
  useLegacy: boolean;
  workerFilter: string[];
};
