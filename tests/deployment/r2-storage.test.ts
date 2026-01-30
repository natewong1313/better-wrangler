/**
 * Deployment tests for the r2-storage example
 *
 * Tests the deployed R2 storage worker to verify:
 * - Health check endpoint works
 * - R2 operations (list, GET, PUT, DELETE) work correctly
 * - Binary and text content handling
 */

import { describe, test, expect, beforeAll, afterEach } from "vitest";
import { createHttpClient, type HttpClient } from "./utils/http-client";
import { getWorkerUrl } from "./utils/worker-url";

describe("r2-storage deployment", () => {
	let http: HttpClient;
	const testKeys: string[] = []; // Track keys for cleanup

	beforeAll(async () => {
		const workerUrl = await getWorkerUrl("r2-storage");
		http = createHttpClient(workerUrl);
		console.log(`Testing r2-storage at: ${workerUrl}`);
	});

	afterEach(async () => {
		// Clean up any test keys created during tests
		for (const key of testKeys) {
			try {
				await http.delete(`/objects/${encodeURIComponent(key)}`);
			} catch {
				// Ignore cleanup errors
			}
		}
		testKeys.length = 0;
	});

	describe("health checks", () => {
		test("GET /objects returns 200", async () => {
			const response = await http.get("/objects");
			expect(response.status).toBe(200);
		});

		test("GET /objects returns JSON with objects array", async () => {
			const response = await http.get("/objects");
			const data = (await response.json()) as { objects: unknown[] };
			expect(data).toHaveProperty("objects");
			expect(Array.isArray(data.objects)).toBe(true);
		});
	});

	describe("R2 operations", () => {
		test("GET /objects/:key returns 404 for non-existent object", async () => {
			const response = await http.get(`/objects/non-existent-${Date.now()}.txt`);
			expect(response.status).toBe(404);
		});

		test("PUT /objects/:key uploads object and returns 201", async () => {
			const testKey = `test-object-${Date.now()}.txt`;
			testKeys.push(testKey);

			const response = await http.put(`/objects/${testKey}`, {
				body: "test content",
				headers: { "Content-Type": "text/plain" },
			});
			expect(response.status).toBe(201);
		});

		test("GET /objects/:key retrieves uploaded object", async () => {
			const testKey = `test-get-${Date.now()}.txt`;
			testKeys.push(testKey);
			const testContent = `Test content at ${new Date().toISOString()}`;

			// Upload first
			await http.put(`/objects/${testKey}`, {
				body: testContent,
				headers: { "Content-Type": "text/plain" },
			});

			// Retrieve it
			const response = await http.get(`/objects/${testKey}`);
			expect(response.status).toBe(200);

			const content = await response.text();
			expect(content).toBe(testContent);
		});

		test("PUT /objects/:key updates existing object", async () => {
			const testKey = `test-update-${Date.now()}.txt`;
			testKeys.push(testKey);

			// Upload initial content
			await http.put(`/objects/${testKey}`, {
				body: "initial content",
				headers: { "Content-Type": "text/plain" },
			});

			// Update content
			const updatedContent = `Updated content at ${new Date().toISOString()}`;
			const putResponse = await http.put(`/objects/${testKey}`, {
				body: updatedContent,
				headers: { "Content-Type": "text/plain" },
			});
			expect(putResponse.status).toBe(201);

			// Verify update
			const getResponse = await http.get(`/objects/${testKey}`);
			expect(getResponse.status).toBe(200);
			expect(await getResponse.text()).toBe(updatedContent);
		});

		test("DELETE /objects/:key removes object and returns 200", async () => {
			const testKey = `test-delete-${Date.now()}.txt`;

			// Upload first
			await http.put(`/objects/${testKey}`, {
				body: "to be deleted",
				headers: { "Content-Type": "text/plain" },
			});

			// Delete it
			const deleteResponse = await http.delete(`/objects/${testKey}`);
			expect(deleteResponse.status).toBe(200);

			// Verify deletion
			const getResponse = await http.get(`/objects/${testKey}`);
			expect(getResponse.status).toBe(404);
		});
	});

	describe("content types", () => {
		test("handles JSON content", async () => {
			const jsonKey = `test-json-${Date.now()}.json`;
			testKeys.push(jsonKey);
			const jsonContent = JSON.stringify({ foo: "bar", num: 42, nested: { a: 1 } });

			const putResponse = await http.put(`/objects/${jsonKey}`, {
				body: jsonContent,
				headers: { "Content-Type": "application/json" },
			});
			expect(putResponse.status).toBe(201);

			const getResponse = await http.get(`/objects/${jsonKey}`);
			expect(getResponse.status).toBe(200);

			const data = await getResponse.text();
			expect(JSON.parse(data)).toEqual({ foo: "bar", num: 42, nested: { a: 1 } });
		});

		test("handles binary content", async () => {
			const binaryKey = `test-binary-${Date.now()}.bin`;
			testKeys.push(binaryKey);
			const binaryContent = "binary\x00data\x01test";

			const putResponse = await http.put(`/objects/${binaryKey}`, {
				body: binaryContent,
				headers: { "Content-Type": "application/octet-stream" },
			});
			expect(putResponse.status).toBe(201);

			const getResponse = await http.get(`/objects/${binaryKey}`);
			expect(getResponse.status).toBe(200);
		});
	});

	describe("edge cases", () => {
		test("handles objects with path-like keys", async () => {
			const pathKey = `folder/subfolder/test-${Date.now()}.txt`;
			testKeys.push(pathKey);
			const content = "Nested object";

			const putResponse = await http.put(
				`/objects/${encodeURIComponent(pathKey)}`,
				{
					body: content,
					headers: { "Content-Type": "text/plain" },
				}
			);
			expect(putResponse.status).toBe(201);

			const getResponse = await http.get(
				`/objects/${encodeURIComponent(pathKey)}`
			);
			expect(getResponse.status).toBe(200);
			expect(await getResponse.text()).toBe(content);
		});

		test("handles large objects", async () => {
			const largeKey = `test-large-${Date.now()}.txt`;
			testKeys.push(largeKey);
			// 100KB of data
			const largeContent = "x".repeat(100 * 1024);

			const putResponse = await http.put(`/objects/${largeKey}`, {
				body: largeContent,
				headers: { "Content-Type": "text/plain" },
			});
			expect(putResponse.status).toBe(201);

			const getResponse = await http.get(`/objects/${largeKey}`);
			expect(getResponse.status).toBe(200);

			const content = await getResponse.text();
			expect(content.length).toBe(100 * 1024);
		});
	});
});
