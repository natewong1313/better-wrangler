/**
 * Deployment tests for the monorepo example
 *
 * Tests the deployed monorepo workers to verify:
 * - Both workers are accessible
 * - Durable Object works on worker-1
 * - Cross-worker Durable Object access works from worker-2
 * - D1 database connectivity works on worker-1
 *
 * Note: The workers return plain text responses, not JSON.
 * - worker-1 /do returns: "Worker 1 - DO count: N"
 * - worker-1 /db returns: "Worker 1 - DB result: {...}"
 * - worker-2 / returns: "Worker 2 (shared DO) - count: N"
 */

import { describe, test, expect, beforeAll } from "vitest";
import { createHttpClient, type HttpClient } from "./utils/http-client";
import { getAllWorkerUrls } from "./utils/worker-url";

/**
 * Parse count from worker response text
 * Matches patterns like "count: 5" or "DO count: 5"
 */
function parseCount(text: string): number {
	const match = text.match(/count:\s*(\d+)/i);
	if (!match) {
		throw new Error(`Could not parse count from response: ${text}`);
	}
	return parseInt(match[1], 10);
}

describe("monorepo deployment", () => {
	let http1: HttpClient;
	let http2: HttpClient;

	beforeAll(async () => {
		const urls = await getAllWorkerUrls("monorepo");

		const worker1Url = urls.get("worker-1");
		const worker2Url = urls.get("worker-2");

		if (!worker1Url || !worker2Url) {
			throw new Error(
				`Missing worker URLs. Got: ${JSON.stringify(Object.fromEntries(urls))}`
			);
		}

		http1 = createHttpClient(worker1Url);
		http2 = createHttpClient(worker2Url);

		console.log(`Testing worker-1 at: ${worker1Url}`);
		console.log(`Testing worker-2 at: ${worker2Url}`);
	});

	describe("worker-1 health checks", () => {
		test("GET / returns 200", async () => {
			const response = await http1.get("/");
			expect(response.status).toBe(200);
		});

		test("GET /do returns Durable Object counter", async () => {
			const response = await http1.get("/do");
			expect(response.status).toBe(200);

			const text = await response.text();
			expect(text).toContain("Worker 1");
			expect(text).toContain("count:");

			const count = parseCount(text);
			expect(typeof count).toBe("number");
			expect(count).toBeGreaterThanOrEqual(0);
		});

		test("GET /db returns D1 database response", async () => {
			const response = await http1.get("/db");
			expect(response.status).toBe(200);

			const text = await response.text();
			expect(text).toContain("Worker 1");
			expect(text).toContain("DB");
		});
	});

	describe("worker-2 health checks", () => {
		test("GET / returns 200", async () => {
			const response = await http2.get("/");
			expect(response.status).toBe(200);
		});

		test("GET / returns response with count", async () => {
			const response = await http2.get("/");
			expect(response.status).toBe(200);

			const text = await response.text();
			expect(text).toContain("Worker 2");
			expect(text).toContain("count:");
		});
	});

	describe("Durable Object functionality", () => {
		test("worker-1 /do increments counter on each request", async () => {
			// Get initial count
			const response1 = await http1.get("/do");
			const text1 = await response1.text();
			const initialCount = parseCount(text1);

			// Make another request
			const response2 = await http1.get("/do");
			const text2 = await response2.text();
			const newCount = parseCount(text2);

			// Counter should have incremented
			expect(newCount).toBe(initialCount + 1);
		});

		test("Durable Object state persists across requests", async () => {
			// Get current count
			const response1 = await http1.get("/do");
			const count1 = parseCount(await response1.text());

			// Make several more requests
			await http1.get("/do");
			await http1.get("/do");
			await http1.get("/do");

			// Final count should be 3 more
			const response2 = await http1.get("/do");
			const count2 = parseCount(await response2.text());
			expect(count2).toBe(count1 + 3);
		});
	});

	describe("cross-worker Durable Object access", () => {
		test("worker-2 can access shared DO from worker-1", async () => {
			// Get count from worker-1
			const response1 = await http1.get("/do");
			const countFromWorker1 = parseCount(await response1.text());

			// Access DO through worker-2
			const response2 = await http2.get("/");
			expect(response2.status).toBe(200);

			const text2 = await response2.text();
			// worker-2 should report a count (the DO was accessed)
			expect(text2).toContain("count:");
			const countFromWorker2 = parseCount(text2);
			expect(typeof countFromWorker2).toBe("number");

			// The count should have incremented (worker-2's request went through the DO)
			const response3 = await http1.get("/do");
			const countAfter = parseCount(await response3.text());
			expect(countAfter).toBeGreaterThan(countFromWorker1);
		});

		test("shared DO maintains consistent state between workers", async () => {
			// Get initial count via worker-1
			const response1 = await http1.get("/do");
			const initialCount = parseCount(await response1.text());

			// Make request through worker-2
			await http2.get("/");

			// Check count via worker-1 again
			const response2 = await http1.get("/do");
			const countAfterWorker2 = parseCount(await response2.text());

			// Count should have increased
			expect(countAfterWorker2).toBeGreaterThan(initialCount);
		});
	});

	describe("D1 database", () => {
		test("worker-1 /db can query D1 database", async () => {
			const response = await http1.get("/db");
			expect(response.status).toBe(200);

			const text = await response.text();
			// The response should contain database-related content
			expect(text).toContain("Worker 1");
			expect(text.toLowerCase()).toContain("db");
		});

		test("D1 queries are consistent", async () => {
			// Make multiple requests to verify D1 is working consistently
			const responses = await Promise.all([
				http1.get("/db"),
				http1.get("/db"),
				http1.get("/db"),
			]);

			for (const response of responses) {
				expect(response.status).toBe(200);
			}
		});
	});

	describe("worker isolation", () => {
		test("worker-1 and worker-2 are separate workers", async () => {
			// Both workers should respond
			const [r1, r2] = await Promise.all([
				http1.get("/"),
				http2.get("/"),
			]);

			expect(r1.status).toBe(200);
			expect(r2.status).toBe(200);

			// Responses should identify their respective workers
			const text1 = await r1.text();
			const text2 = await r2.text();

			expect(text1).toContain("Worker 1");
			expect(text2).toContain("Worker 2");
		});
	});
});
