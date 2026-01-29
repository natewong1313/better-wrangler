import type { D1Binding } from "./d1";
import type { DurableObjectBinding } from "./durable-object";

/**
 * Bindings that are available to workers
 */
export type WorkerBinding = D1Binding | DurableObjectBinding<any>;
