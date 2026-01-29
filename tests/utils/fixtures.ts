import type { WorkerConfig, Bindings } from "../../src/bindings/worker";
import type { D1Binding } from "../../src/bindings/d1";
import type { DurableObjectBinding } from "../../src/bindings/durable-object";

/**
 * Creates a basic worker configuration fixture
 */
export function createWorkerFixture<B extends Bindings = Record<string, never>>(
	overrides: Partial<WorkerConfig<B>> = {}
): WorkerConfig<B> {
	return {
		name: "test-worker",
		entryPoint: "./src/test-worker/index.ts",
		bindings: {} as B,
		Env: null as unknown as WorkerConfig<B>["Env"],
		...overrides,
	};
}

/**
 * Creates a D1 binding fixture
 */
export function createD1Fixture(
	overrides: Partial<D1Binding> = {}
): D1Binding {
	return {
		_type: "D1",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		_runtimeType: null as any,
		name: "test-db",
		...overrides,
	};
}

/**
 * Creates a DurableObject binding fixture
 */
export function createDOFixture(
	overrides: Partial<DurableObjectBinding> = {}
): DurableObjectBinding {
	return {
		_type: "DurableObject",
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		_runtimeType: null as any,
		name: "TEST_DO",
		className: "TestDurableObject",
		classPath: "./src/shared/test-do.ts",
		...overrides,
	};
}

/**
 * Sample worker source code for testing
 */
export const BASIC_WORKER_SOURCE = `
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		return new Response("Hello World");
	}
};
`;

/**
 * Sample Durable Object source code for testing
 */
export const BASIC_DO_SOURCE = `
import { DurableObject } from "cloudflare:workers";

export class TestDurableObject extends DurableObject {
	async fetch(request: Request): Promise<Response> {
		return new Response("Hello from DO");
	}
}
`;

/**
 * Sample bw.config.ts content for a single worker
 */
export const SINGLE_WORKER_CONFIG = `
import { Worker } from "better-wrangler";

export default [
	Worker({
		name: "test-worker",
		entryPoint: "./src/test-worker/index.ts",
		bindings: {},
	}),
];
`;

/**
 * Sample bw.config.ts content for multiple workers with shared DO
 */
export const MULTI_WORKER_CONFIG = `
import { Worker, DurableObject } from "better-wrangler";

export default [
	Worker({
		name: "worker-1",
		entryPoint: "./src/worker-1/index.ts",
		bindings: {
			MY_DO: DurableObject({
				name: "MY_DO",
				className: "SharedDO",
				classPath: "./src/shared/do.ts",
			}),
		},
	}),
	Worker({
		name: "worker-2",
		entryPoint: "./src/worker-2/index.ts",
		bindings: {
			MY_DO: DurableObject({
				name: "MY_DO",
				className: "SharedDO",
				classPath: "./src/shared/do.ts",
				_owner: "worker-1",
			}),
		},
	}),
];
`;
