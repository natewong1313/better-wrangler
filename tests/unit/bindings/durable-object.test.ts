import { describe, it, expect } from "vitest";
import { DurableObject } from "../../../src/bindings/durable-object";

describe("DurableObject", () => {
	describe("basic configuration", () => {
		it("creates a DurableObject binding with the correct type", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			expect(binding._type).toBe("DurableObject");
		});

		it("sets all required properties correctly", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			expect(binding.name).toBe("MY_DO");
			expect(binding.className).toBe("MyDurableObject");
			expect(binding.classPath).toBe("./src/shared/my-do.ts");
		});

		it("includes _runtimeType property", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			expect(binding).toHaveProperty("_runtimeType");
		});

		it("defaults storage to sqlite", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			expect(binding.storage).toBe("sqlite");
		});

		it("allows storage to be set to kv", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
				storage: "kv",
			});

			expect(binding.storage).toBe("kv");
		});

		it("allows _renamedFrom to be specified", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObjectV2",
				classPath: "./src/shared/my-do.ts",
				_renamedFrom: "MyDurableObject",
			});

			expect(binding._renamedFrom).toBe("MyDurableObject");
		});
	});

	describe("_owner property", () => {
		it("initializes _owner as undefined", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			expect(binding._owner).toBeUndefined();
		});

		it("allows _owner to be set after creation", () => {
			const binding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});

			binding._owner = "my-worker";

			expect(binding._owner).toBe("my-worker");
		});
	});

	describe("different configurations", () => {
		it("handles various class names and paths", () => {
			const binding1 = DurableObject({
				name: "COUNTER",
				className: "CounterDO",
				classPath: "./src/dos/counter.ts",
			});

			const binding2 = DurableObject({
				name: "SESSION",
				className: "SessionManager",
				classPath: "./src/shared/session-manager.ts",
			});

			expect(binding1.name).toBe("COUNTER");
			expect(binding1.className).toBe("CounterDO");
			expect(binding1.classPath).toBe("./src/dos/counter.ts");

			expect(binding2.name).toBe("SESSION");
			expect(binding2.className).toBe("SessionManager");
			expect(binding2.classPath).toBe("./src/shared/session-manager.ts");
		});
	});
});
