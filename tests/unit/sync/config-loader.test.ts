import { describe, it, expect } from "vitest";
import {
	isWorkerConfig,
	filterWorkers,
	validateWorkers,
} from "../../../src/cli/sync/config-loader";
import { Worker } from "../../../src/bindings/worker";

describe("config-loader", () => {
	describe("isWorkerConfig", () => {
		it("returns true for valid WorkerConfig", () => {
			const worker = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			expect(isWorkerConfig(worker)).toBe(true);
		});

		it("returns false for null", () => {
			expect(isWorkerConfig(null)).toBe(false);
		});

		it("returns false for undefined", () => {
			expect(isWorkerConfig(undefined)).toBe(false);
		});

		it("returns false for primitives", () => {
			expect(isWorkerConfig("string")).toBe(false);
			expect(isWorkerConfig(123)).toBe(false);
			expect(isWorkerConfig(true)).toBe(false);
		});

		it("returns false for objects missing required properties", () => {
			expect(isWorkerConfig({ name: "test" })).toBe(false);
			expect(isWorkerConfig({ entryPoint: "./index.ts" })).toBe(false);
			expect(isWorkerConfig({ name: "test", entryPoint: "./index.ts" })).toBe(false);
		});

		it("returns true for objects with all required properties", () => {
			const config = {
				name: "test",
				entryPoint: "./index.ts",
				bindings: {},
				Env: null,
			};

			expect(isWorkerConfig(config)).toBe(true);
		});
	});

	describe("filterWorkers", () => {
		const workers = [
			Worker({ name: "worker-1", entryPoint: "./src/worker-1/index.ts" }),
			Worker({ name: "worker-2", entryPoint: "./src/worker-2/index.ts" }),
			Worker({ name: "worker-3", entryPoint: "./src/worker-3/index.ts" }),
		];

		it("returns all workers when filter is empty", () => {
			const result = filterWorkers(workers, []);

			expect(result).toHaveLength(3);
		});

		it("filters workers by name", () => {
			const result = filterWorkers(workers, ["worker-1"]);

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("worker-1");
		});

		it("filters multiple workers", () => {
			const result = filterWorkers(workers, ["worker-1", "worker-3"]);

			expect(result).toHaveLength(2);
			expect(result.map((w) => w.name)).toContain("worker-1");
			expect(result.map((w) => w.name)).toContain("worker-3");
		});

		it("throws when no workers match filter", () => {
			expect(() => filterWorkers(workers, ["nonexistent"])).toThrow(
				"No workers found matching: nonexistent"
			);
		});

		it("throws with all non-matching names in error", () => {
			expect(() => filterWorkers(workers, ["foo", "bar"])).toThrow(
				"No workers found matching: foo, bar"
			);
		});
	});

	describe("validateWorkers", () => {
		it("passes for workers with unique ports", () => {
			const workers = [
				Worker({ name: "worker-1", entryPoint: "./src/worker-1/index.ts", port: 8787 }),
				Worker({ name: "worker-2", entryPoint: "./src/worker-2/index.ts", port: 8788 }),
			];

			expect(() => validateWorkers(workers)).not.toThrow();
		});

		it("throws when a worker is missing a port", () => {
			const workers = [
				Worker({ name: "worker-1", entryPoint: "./src/worker-1/index.ts", port: 8787 }),
				Worker({ name: "worker-2", entryPoint: "./src/worker-2/index.ts" }),
			];

			expect(() => validateWorkers(workers)).toThrow(
				"All workers must have explicit ports configured"
			);
			expect(() => validateWorkers(workers)).toThrow("worker-2");
		});

		it("throws when multiple workers are missing ports", () => {
			const workers = [
				Worker({ name: "worker-1", entryPoint: "./src/worker-1/index.ts" }),
				Worker({ name: "worker-2", entryPoint: "./src/worker-2/index.ts" }),
			];

			expect(() => validateWorkers(workers)).toThrow("worker-1, worker-2");
		});

		it("throws when two workers have the same port", () => {
			const workers = [
				Worker({ name: "worker-1", entryPoint: "./src/worker-1/index.ts", port: 8787 }),
				Worker({ name: "worker-2", entryPoint: "./src/worker-2/index.ts", port: 8787 }),
			];

			expect(() => validateWorkers(workers)).toThrow(
				'Port 8787 is used by both "worker-1" and "worker-2"'
			);
		});

		it("passes for empty workers array", () => {
			expect(() => validateWorkers([])).not.toThrow();
		});
	});
});
