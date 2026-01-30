/**
 * Deployment tests for the kv-cache example
 *
 * Tests the deployed KV cache worker to verify:
 * - Health check endpoint works
 * - KV operations (GET, PUT, DELETE) work correctly
 * - Error handling for missing keys
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { createHttpClient, type HttpClient } from "./utils/http-client";
import { getWorkerUrl } from "./utils/worker-url";

describe("kv-cache deployment", () => {
	let http: HttpClient;
	const testKeys: string[] = []; // Track keys for cleanup

	beforeAll(async () => {
		const workerUrl = await getWorkerUrl("kv-cache");
		http = createHttpClient(workerUrl);
		console.log(`Testing kv-cache at: ${workerUrl}`);
	});

	afterEach(async () => {
		// Clean up any test keys created during tests
		for (const key of testKeys) {
			try {
				await http.delete(`/cache/${encodeURIComponent(key)}`);
			} catch {
				// Ignore cleanup errors
			}
		}
		testKeys.length = 0;
	});

	describe("health checks", () => {
		test("GET /cache returns 200", async () => {
			const response = await http.get("/cache");
			expect(response.status).toBe(200);
		});

		test("GET /cache returns JSON with keys array", async () => {
			const response = await http.get("/cache");
			const data = (await response.json()) as { keys: unknown[] };
			expect(data).toHaveProperty("keys");
			expect(Array.isArray(data.keys)).toBe(true);
		});
	});

	describe("KV operations", () => {
		test("GET /cache/:key returns 404 for non-existent key", async () => {
			const response = await http.get(`/cache/non-existent-key-${Date.now()}`);
			expect(response.status).toBe(404);
		});

		test("PUT /cache/:key stores value and returns 201", async () => {
			const testKey = `test-key-${Date.now()}`;
			testKeys.push(testKey);

			const response = await http.put(`/cache/${testKey}`, {
				body: "test-value",
				headers: { "Content-Type": "text/plain" },
			});
			expect(response.status).toBe(201);
		});

		test("GET /cache/:key retrieves stored value as text", async () => {
			const testKey = `test-get-${Date.now()}`;
			testKeys.push(testKey);
			const testValue = "hello-world";

			// Store value first
			await http.put(`/cache/${testKey}`, {
				body: testValue,
				headers: { "Content-Type": "text/plain" },
			});

			// Small delay for KV eventual consistency
			await sleep(100);

			// Retrieve it
			const response = await http.get(`/cache/${testKey}`);
			expect(response.status).toBe(200);

			const data = await response.text();
			expect(data).toBe(testValue);
		});

		test("PUT /cache/:key updates existing value", async () => {
			const testKey = `test-update-${Date.now()}`;
			testKeys.push(testKey);

			// Store initial value
			await http.put(`/cache/${testKey}`, {
				body: "initial-value",
				headers: { "Content-Type": "text/plain" },
			});

			await sleep(100);

			// Update value
			const putResponse = await http.put(`/cache/${testKey}`, {
				body: "updated-value",
				headers: { "Content-Type": "text/plain" },
			});
			expect(putResponse.status).toBe(201);

			await sleep(100);

			// Verify update
			const getResponse = await http.get(`/cache/${testKey}`);
			expect(getResponse.status).toBe(200);
			expect(await getResponse.text()).toBe("updated-value");
		});

		test("DELETE /cache/:key removes value and returns 200", async () => {
			const testKey = `test-delete-${Date.now()}`;

			// Store value first
			await http.put(`/cache/${testKey}`, {
				body: "to-be-deleted",
				headers: { "Content-Type": "text/plain" },
			});

			await sleep(100);

			// Delete it
			const deleteResponse = await http.delete(`/cache/${testKey}`);
			expect(deleteResponse.status).toBe(200);

			await sleep(100);

			// Verify deletion
			const getResponse = await http.get(`/cache/${testKey}`);
			expect(getResponse.status).toBe(404);
		});
	});

	describe("edge cases", () => {
		test("handles keys with special characters", async () => {
			const specialKey = `test-special-${Date.now()}-key`;
			testKeys.push(specialKey);
			const value = "special-value";

			const putResponse = await http.put(
				`/cache/${encodeURIComponent(specialKey)}`,
				{
					body: value,
					headers: { "Content-Type": "text/plain" },
				}
			);
			expect(putResponse.status).toBe(201);

			await sleep(100);

			const getResponse = await http.get(
				`/cache/${encodeURIComponent(specialKey)}`
			);
			expect(getResponse.status).toBe(200);
			expect(await getResponse.text()).toBe(value);
		});

		test("handles large values", async () => {
			const largeKey = `test-large-${Date.now()}`;
			testKeys.push(largeKey);
			const largeValue = "x".repeat(10000); // 10KB of data

			const putResponse = await http.put(`/cache/${largeKey}`, {
				body: largeValue,
				headers: { "Content-Type": "text/plain" },
			});
			expect(putResponse.status).toBe(201);

			await sleep(100);

			const getResponse = await http.get(`/cache/${largeKey}`);
			expect(getResponse.status).toBe(200);

			const data = await getResponse.text();
			expect(data.length).toBe(10000);
		});
	});
});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
