import { describe, it, expect } from "vitest";
import { generateWranglerConfig } from "../../src/generate";
import { Worker } from "../../src/bindings/worker";
import { D1 } from "../../src/bindings/d1";
import { DurableObject } from "../../src/bindings/durable-object";
import { KV } from "../../src/bindings/kv";

describe("generateWranglerConfig", () => {
	describe("basic configuration", () => {
		it("generates name and main from worker config", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker);

			expect(config.name).toBe("my-worker");
			expect(config.main).toBe("./src/my-worker/index.ts");
		});

		it("uses default compatibility_date when not provided", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker);

			expect(config.compatibility_date).toBe("2026-01-28");
		});

		it("uses provided compatibility_date from options", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker, {
				compatibility_date: "2024-01-01",
			});

			expect(config.compatibility_date).toBe("2024-01-01");
		});
	});

	describe("dev port configuration", () => {
		it("does not include dev when port is not specified", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker);

			expect(config.dev).toBeUndefined();
		});

		it("includes dev.port when port is specified", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker, { port: 8787 });

			expect(config.dev).toEqual({ port: 8787 });
		});
	});

	describe("observability configuration", () => {
		it("does not include observability when not specified", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker);

			expect(config.observability).toBeUndefined();
		});

		it("includes observability when specified", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			const config = generateWranglerConfig(worker, {
				observability: { enabled: true },
			});

			expect(config.observability).toEqual({ enabled: true });
		});
	});

	describe("D1 bindings", () => {
		it("generates d1_databases for D1 bindings", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					DB: D1({ name: "my-database" }),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.d1_databases).toEqual([
				{ binding: "DB", database_name: "my-database" },
			]);
		});

		it("handles multiple D1 bindings", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					USERS_DB: D1({ name: "users" }),
					ANALYTICS_DB: D1({ name: "analytics" }),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.d1_databases).toHaveLength(2);
			expect(config.d1_databases).toContainEqual({
				binding: "USERS_DB",
				database_name: "users",
			});
			expect(config.d1_databases).toContainEqual({
				binding: "ANALYTICS_DB",
				database_name: "analytics",
			});
		});
	});

	describe("DurableObject bindings", () => {
		it("generates durable_objects for DO bindings", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					MY_DO: DurableObject({
						name: "MY_DO",
						className: "MyDurableObject",
						classPath: "./src/shared/my-do.ts",
					}),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.durable_objects).toEqual({
				bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
			});
		});

		it("generates migrations for owned DOs", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					MY_DO: DurableObject({
						name: "MY_DO",
						className: "MyDurableObject",
						classPath: "./src/shared/my-do.ts",
					}),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.migrations).toEqual([
				{ tag: "v1", new_classes: ["MyDurableObject"] },
			]);
		});

		it("handles multiple owned DOs in migrations", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					COUNTER: DurableObject({
						name: "COUNTER",
						className: "CounterDO",
						classPath: "./src/dos/counter.ts",
					}),
					SESSION: DurableObject({
						name: "SESSION",
						className: "SessionDO",
						classPath: "./src/dos/session.ts",
					}),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.migrations).toEqual([
				{ tag: "v1", new_classes: ["CounterDO", "SessionDO"] },
			]);
		});
	});

	describe("external DurableObject bindings", () => {
		it("adds script_name for DOs owned by other workers", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					EXTERNAL_DO: externalDO,
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.durable_objects).toEqual({
				bindings: [
					{
						name: "EXTERNAL_DO",
						class_name: "ExternalDO",
						script_name: "other-worker",
					},
				],
			});
		});

		it("does not generate migrations for external DOs", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					EXTERNAL_DO: externalDO,
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.migrations).toBeUndefined();
		});

		it("generates service bindings for external workers", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					EXTERNAL_DO: externalDO,
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.services).toEqual([
				{ binding: "__SERVICE_OTHER_WORKER__", service: "other-worker" },
			]);
		});

		it("handles hyphens in worker names for service bindings", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "my-other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					EXTERNAL_DO: externalDO,
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.services).toEqual([
				{ binding: "__SERVICE_MY_OTHER_WORKER__", service: "my-other-worker" },
			]);
		});

		it("deduplicates service bindings for multiple DOs from same worker", () => {
			const externalDO1 = DurableObject({
				name: "DO1",
				className: "DO1Class",
				classPath: "./src/shared/do1.ts",
			});
			externalDO1._owner = "other-worker";

			const externalDO2 = DurableObject({
				name: "DO2",
				className: "DO2Class",
				classPath: "./src/shared/do2.ts",
			});
			externalDO2._owner = "other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					DO1: externalDO1,
					DO2: externalDO2,
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.services).toHaveLength(1);
			expect(config.services).toEqual([
				{ binding: "__SERVICE_OTHER_WORKER__", service: "other-worker" },
			]);
		});
	});

	describe("KV bindings", () => {
		it("generates kv_namespaces for KV bindings", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					CACHE: KV({ name: "my-cache" }),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.kv_namespaces).toEqual([
				{ binding: "CACHE", id: "my-cache" },
			]);
		});

		it("handles multiple KV bindings", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					CACHE: KV({ name: "cache" }),
					SESSIONS: KV({ name: "sessions" }),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.kv_namespaces).toHaveLength(2);
			expect(config.kv_namespaces).toContainEqual({
				binding: "CACHE",
				id: "cache",
			});
			expect(config.kv_namespaces).toContainEqual({
				binding: "SESSIONS",
				id: "sessions",
			});
		});
	});

	describe("mixed bindings", () => {
		it("handles D1 and DurableObject bindings together", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					DB: D1({ name: "my-database" }),
					MY_DO: DurableObject({
						name: "MY_DO",
						className: "MyDurableObject",
						classPath: "./src/shared/my-do.ts",
					}),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.d1_databases).toEqual([
				{ binding: "DB", database_name: "my-database" },
			]);
			expect(config.durable_objects).toEqual({
				bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
			});
			expect(config.migrations).toEqual([
				{ tag: "v1", new_classes: ["MyDurableObject"] },
			]);
		});

		it("handles local and external DOs together", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "other-worker";

			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					MY_DO: DurableObject({
						name: "MY_DO",
						className: "MyDurableObject",
						classPath: "./src/shared/my-do.ts",
					}),
					EXTERNAL_DO: externalDO,
				},
			});

			const config = generateWranglerConfig(worker);

			// Should have both DO bindings
			expect(config.durable_objects?.bindings).toHaveLength(2);

			// Only local DO in migrations
			expect(config.migrations).toEqual([
				{ tag: "v1", new_classes: ["MyDurableObject"] },
			]);

			// Service binding for external worker
			expect(config.services).toEqual([
				{ binding: "__SERVICE_OTHER_WORKER__", service: "other-worker" },
			]);
		});

		it("handles D1, KV, and DurableObject bindings together", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					DB: D1({ name: "my-database" }),
					CACHE: KV({ name: "my-cache" }),
					MY_DO: DurableObject({
						name: "MY_DO",
						className: "MyDurableObject",
						classPath: "./src/shared/my-do.ts",
					}),
				},
			});

			const config = generateWranglerConfig(worker);

			expect(config.d1_databases).toEqual([
				{ binding: "DB", database_name: "my-database" },
			]);
			expect(config.kv_namespaces).toEqual([
				{ binding: "CACHE", id: "my-cache" },
			]);
			expect(config.durable_objects).toEqual({
				bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
			});
		});
	});
});
