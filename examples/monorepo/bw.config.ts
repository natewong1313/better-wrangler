import { Worker, D1, KV, R2, DurableObject } from "better-wrangler";
import type { CounterDO } from "./src/shared/do";

/**
 * Shared Durable Object binding.
 * This DO is defined once and shared across multiple workers.
 */
const sharedDO = DurableObject<typeof CounterDO>({
	name: "DO",
	className: "CounterDO",
	classPath: "./src/shared/do.ts",
});

/**
 * Shared KV namespace for caching.
 * Both workers can read/write to this namespace.
 */
const sharedKV = KV({ name: "shared-cache" });

/**
 * Worker 1 - Primary worker with all bindings.
 * Has access to D1, KV, R2, and the shared Durable Object.
 */
export const worker1 = Worker({
	name: "worker-1",
	entryPoint: "./src/worker-1/index.ts",
	port: 6700,
	primary: true,
	bindings: {
		DB: D1({ name: "my-db" }),
		KV: sharedKV,
		BUCKET: R2({ name: "my-bucket" }),
		DO: sharedDO,
	},
});

/**
 * Worker 2 - Secondary worker with shared bindings.
 * Demonstrates how to share bindings across workers in a monorepo.
 */
export const worker2 = Worker({
	name: "worker-2",
	entryPoint: "./src/worker-2/index.ts",
	port: 6701,
	bindings: {
		KV: worker1.bindings.KV,
		DO: worker1.bindings.DO,
	},
});
