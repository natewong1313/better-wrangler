import { type WorkerOptions } from "miniflare";
import { D1Binding } from "../bindings/d1";
import { DurableObjectBinding } from "../bindings/durable-object";
import { KVBinding } from "../bindings/kv";
import { QueueProducerBinding, QueueConsumerBinding } from "../bindings/queue";
import { R2Binding } from "../bindings/r2";
import { WorkerConfig, Bindings } from "../bindings/worker";

export function buildWorkerOptions(
  worker: WorkerConfig<Bindings, Record<string, string>>,
  bundledScript: string,
  compatibilityDate: string,
): WorkerOptions {
  const effectiveCompatDate = worker.compatibility?.date ?? compatibilityDate;
  const effectiveCompatFlags = worker.compatibility?.flags ?? ["nodejs_compat"];

  const options: WorkerOptions = {
    name: worker.name,
    modules: true,
    script: bundledScript,
    compatibilityDate: effectiveCompatDate,
    compatibilityFlags: effectiveCompatFlags,
    routes: [`http://localhost/${worker.name}/*`],
  };

  if (worker.vars && Object.keys(worker.vars).length > 0) {
    options.bindings = { ...worker.vars };
  }

  if (worker.triggers?.crons && worker.triggers.crons.length > 0) {
    options.crons = worker.triggers.crons;
  }

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
      case "KV":
        const kvBinding = binding as KVBinding;

        options.kvNamespaces ??= {};
        options.kvNamespaces[key] = kvBinding.name;

        break;
      case "R2":
        const r2Binding = binding as R2Binding;

        options.r2Buckets ??= {};
        options.r2Buckets[key] = r2Binding.name;

        break;
      case "DurableObject":
        const doBinding = binding as DurableObjectBinding;

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
      case "QueueProducer":
        const queueProducerBinding = binding as QueueProducerBinding;

        options.queueProducers ??= {};
        options.queueProducers[key] = {
          queueName: queueProducerBinding.queue,
          ...(queueProducerBinding.deliveryDelay !== undefined && {
            deliveryDelay: queueProducerBinding.deliveryDelay,
          }),
        };

        break;
      case "QueueConsumer":
        const queueConsumerBinding = binding as QueueConsumerBinding;

        options.queueConsumers ??= {};
        options.queueConsumers[queueConsumerBinding.queue] = {
          ...(queueConsumerBinding.maxBatchSize !== undefined && {
            maxBatchSize: queueConsumerBinding.maxBatchSize,
          }),
          ...(queueConsumerBinding.maxBatchTimeout !== undefined && {
            maxBatchTimeout: queueConsumerBinding.maxBatchTimeout,
          }),
          ...(queueConsumerBinding.maxRetries !== undefined && {
            maxRetries: queueConsumerBinding.maxRetries,
          }),
          ...(queueConsumerBinding.deadLetterQueue !== undefined && {
            deadLetterQueue: queueConsumerBinding.deadLetterQueue,
          }),
          ...(queueConsumerBinding.retryDelay !== undefined && {
            retryDelay: queueConsumerBinding.retryDelay,
          }),
        };

        break;
    }
  }

  return options;
}
