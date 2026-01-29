import { describe, it, expect, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createTempProject } from "../utils/temp-project";
import { startCLI, type CLIHandle } from "../utils/run-cli";

describe("bw dev command", () => {
	let cliHandle: CLIHandle | null = null;

	afterEach(() => {
		if (cliHandle) {
			cliHandle.kill();
			cliHandle = null;
		}
	});

	describe("single worker", () => {
		it("starts dev server and worker responds to HTTP requests", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker } from "${path.resolve("./src")}";

export const testWorker = Worker({
	name: "test-worker",
	entryPoint: "./src/test-worker/index.ts",
	port: 18787,
});
`,
				workers: {
					"test-worker": `
export default {
	async fetch(request: Request): Promise<Response> {
		return new Response("Hello from test worker!");
	}
};
`,
				},
			});

			cliHandle = startCLI(["dev"], { cwd: tempDir });

			// Wait for server to be ready (look for "Running at" or "Rebuilt" in output)
			await cliHandle.waitForOutput(/Running at|Rebuilt/i, 30000);

			// Give it a moment to fully initialize
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Make HTTP request to the worker
			const response = await fetch("http://localhost:18787/");
			const text = await response.text();

			expect(response.status).toBe(200);
			expect(text).toBe("Hello from test worker!");
		}, 60000);

		it("worker can handle different routes", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker } from "${path.resolve("./src")}";

export const testWorker = Worker({
	name: "test-worker",
	entryPoint: "./src/test-worker/index.ts",
	port: 18788,
});
`,
				workers: {
					"test-worker": `
export default {
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/hello") {
			return new Response("Hello!");
		}
		if (url.pathname === "/json") {
			return Response.json({ message: "JSON response" });
		}
		return new Response("Not found", { status: 404 });
	}
};
`,
				},
			});

			cliHandle = startCLI(["dev"], { cwd: tempDir });
			await cliHandle.waitForOutput(/Running at|Rebuilt/i, 30000);
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const helloResponse = await fetch("http://localhost:18788/hello");
			expect(await helloResponse.text()).toBe("Hello!");

			const jsonResponse = await fetch("http://localhost:18788/json");
			expect(await jsonResponse.json()).toEqual({ message: "JSON response" });

			const notFoundResponse = await fetch("http://localhost:18788/other");
			expect(notFoundResponse.status).toBe(404);
		}, 60000);
	});

	describe("multiple workers", () => {
		it("starts multiple workers on different ports", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker } from "${path.resolve("./src")}";

export const worker1 = Worker({
	name: "worker-1",
	entryPoint: "./src/worker-1/index.ts",
	port: 18789,
});

export const worker2 = Worker({
	name: "worker-2",
	entryPoint: "./src/worker-2/index.ts",
	port: 18790,
});
`,
				workers: {
					"worker-1": `
export default {
	async fetch(): Promise<Response> {
		return new Response("Worker 1");
	}
};
`,
					"worker-2": `
export default {
	async fetch(): Promise<Response> {
		return new Response("Worker 2");
	}
};
`,
				},
			});

			cliHandle = startCLI(["dev"], { cwd: tempDir });
			await cliHandle.waitForOutput(/Running at|Rebuilt/i, 30000);
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const response1 = await fetch("http://localhost:18789/");
			expect(await response1.text()).toBe("Worker 1");

			const response2 = await fetch("http://localhost:18790/");
			expect(await response2.text()).toBe("Worker 2");
		}, 60000);
	});

	describe("workers with DurableObjects", () => {
		it("worker can use its own DurableObject", async () => {
			const tempDir = await createTempProject({
				config: `
import { Worker, DurableObject } from "${path.resolve("./src")}";

export const testWorker = Worker({
	name: "test-worker",
	entryPoint: "./src/test-worker/index.ts",
	port: 18791,
	bindings: {
		COUNTER: DurableObject({
			name: "COUNTER",
			className: "CounterDO",
			classPath: "./src/shared/counter.ts",
		}),
	},
});
`,
				workers: {
					"test-worker": `
export default {
	async fetch(request: Request, env: any): Promise<Response> {
		const id = env.COUNTER.idFromName("test");
		const stub = env.COUNTER.get(id);
		return stub.fetch(request);
	}
};
`,
				},
			});

			// Create the DO file
			await fs.mkdir(path.join(tempDir, "src/shared"), { recursive: true });
			await fs.writeFile(
				path.join(tempDir, "src/shared/counter.ts"),
				`
import { DurableObject } from "cloudflare:workers";

export class CounterDO extends DurableObject {
	private count = 0;

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/increment") {
			this.count++;
		}
		return new Response(String(this.count));
	}
}
`
			);

			cliHandle = startCLI(["dev"], { cwd: tempDir });
			await cliHandle.waitForOutput(/Running at|Rebuilt/i, 30000);
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Initial count should be 0
			const response1 = await fetch("http://localhost:18791/");
			expect(await response1.text()).toBe("0");

			// Increment
			await fetch("http://localhost:18791/increment");

			// Count should be 1
			const response2 = await fetch("http://localhost:18791/");
			expect(await response2.text()).toBe("1");
		}, 60000);
	});
});
