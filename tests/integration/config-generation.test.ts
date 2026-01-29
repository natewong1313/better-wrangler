import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { createTempProject, readTempFile } from "../utils/temp-project";
import { runCLI } from "../utils/run-cli";

describe("config generation", () => {
	describe("cross-worker DurableObject references", () => {
		it("generates service bindings for external DO references", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker, DurableObject } from "${path.resolve("./src")}";

const sharedDO = DurableObject({
	name: "SHARED_DO",
	className: "SharedDO",
	classPath: "./src/shared/shared-do.ts",
});

export const worker1 = Worker({
	name: "worker-1",
	entryPoint: "./src/worker-1/index.ts",
	port: 8787,
	bindings: {
		SHARED_DO: sharedDO,
	},
});

export const worker2 = Worker({
	name: "worker-2",
	entryPoint: "./src/worker-2/index.ts",
	port: 8788,
	bindings: {
		SHARED_DO: worker1.bindings.SHARED_DO,
	},
});
`,
				workers: {
					"worker-1": `export default { fetch: () => new Response("1") };`,
					"worker-2": `export default { fetch: () => new Response("2") };`,
				},
			});

			const fs = await import("node:fs/promises");
			await fs.mkdir(path.join(tempDir, "src/shared"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, "src/shared/shared-do.ts"),
				`export class SharedDO {}`
			);

			await runCLI(["sync"], { cwd: tempDir });

			// Worker 1 owns the DO - should have migrations
			const worker1Config = JSON.parse(
				await readTempFile(tempDir, ".better-wrangler/worker-1.wrangler.jsonc")
			);
			expect(worker1Config.migrations).toEqual([
				{ tag: "v1", new_sqlite_classes: ["SharedDO"] },
			]);
			expect(worker1Config.services).toBeUndefined();

			// Worker 2 references external DO - should have service binding
			const worker2Config = JSON.parse(
				await readTempFile(tempDir, ".better-wrangler/worker-2.wrangler.jsonc")
			);
			expect(worker2Config.migrations).toBeUndefined();
			expect(worker2Config.durable_objects?.bindings).toContainEqual({
				name: "SHARED_DO",
				class_name: "SharedDO",
				script_name: "worker-1",
			});
			expect(worker2Config.services).toContainEqual({
				binding: "__SERVICE_WORKER_1__",
				service: "worker-1",
			});
		});

		it("only exports DO classes in owner worker entrypoint", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker, DurableObject } from "${path.resolve("./src")}";

const sharedDO = DurableObject({
	name: "SHARED_DO",
	className: "SharedDO",
	classPath: "./src/shared/shared-do.ts",
});

export const worker1 = Worker({
	name: "worker-1",
	entryPoint: "./src/worker-1/index.ts",
	port: 8787,
	bindings: {
		SHARED_DO: sharedDO,
	},
});

export const worker2 = Worker({
	name: "worker-2",
	entryPoint: "./src/worker-2/index.ts",
	port: 8788,
	bindings: {
		SHARED_DO: worker1.bindings.SHARED_DO,
	},
});
`,
				workers: {
					"worker-1": `export default { fetch: () => new Response("1") };`,
					"worker-2": `export default { fetch: () => new Response("2") };`,
				},
			});

			const fs = await import("node:fs/promises");
			await fs.mkdir(path.join(tempDir, "src/shared"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, "src/shared/shared-do.ts"),
				`export class SharedDO {}`
			);

			await runCLI(["sync"], { cwd: tempDir });

			// Worker 1 (owner) should export the DO class
			const worker1Entry = await readTempFile(
				tempDir,
				".better-wrangler/worker-1.entry.ts"
			);
			expect(worker1Entry).toContain(
				"export { SharedDO } from '../src/shared/shared-do'"
			);

			// Worker 2 (consumer) should NOT export the DO class
			const worker2Entry = await readTempFile(
				tempDir,
				".better-wrangler/worker-2.entry.ts"
			);
			expect(worker2Entry).not.toContain("SharedDO");
		});
	});

	describe("mixed bindings", () => {
		it("handles D1 and DO bindings together", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker, D1, DurableObject } from "${path.resolve("./src")}";

export const testWorker = Worker({
	name: "test-worker",
	entryPoint: "./src/test-worker/index.ts",
	port: 8787,
	bindings: {
		DB: D1({ name: "my-database" }),
		MY_DO: DurableObject({
			name: "MY_DO",
			className: "MyDurableObject",
			classPath: "./src/shared/my-do.ts",
		}),
	},
});
`,
				workers: {
					"test-worker": `export default { fetch: () => new Response("Hello") };`,
				},
			});

			const fs = await import("node:fs/promises");
			await fs.mkdir(path.join(tempDir, "src/shared"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, "src/shared/my-do.ts"),
				`export class MyDurableObject {}`
			);

			await runCLI(["sync"], { cwd: tempDir });

			const configContent = await readTempFile(
				tempDir,
				".better-wrangler/test-worker.wrangler.jsonc"
			);
			const config = JSON.parse(configContent);

			expect(config.d1_databases).toEqual([
				{ binding: "DB", database_name: "my-database" },
			]);
			expect(config.durable_objects).toEqual({
				bindings: [{ name: "MY_DO", class_name: "MyDurableObject" }],
			});
			expect(config.migrations).toEqual([
				{ tag: "v1", new_sqlite_classes: ["MyDurableObject"] },
			]);
		});
	});
});
