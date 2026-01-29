import type { D1Binding } from "./d1";
import type { DurableObjectBinding } from "./durable-object";
import type { KVBinding } from "./kv";
import type { R2Binding } from "./r2";

/**
 * Bindings that are available to workers
 */
export type WorkerBinding = D1Binding | DurableObjectBinding<any> | KVBinding | R2Binding;
