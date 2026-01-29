import { describe, it, expect } from "vitest";
import { Worker } from "../../../src/bindings/worker";
import { D1 } from "../../../src/bindings/d1";
import { DurableObject } from "../../../src/bindings/durable-object";

describe("Worker", () => {
	describe("basic configuration", () => {
		it("creates a worker config with name and entryPoint", () => {
			const config = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			expect(config.name).toBe("my-worker");
			expect(config.entryPoint).toBe("./src/my-worker/index.ts");
		});

		it("creates empty bindings when none provided", () => {
			const config = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
			});

			expect(config.bindings).toEqual({});
		});

		it("preserves optional port setting", () => {
			const config = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				port: 8787,
			});

			expect(config.port).toBe(8787);
		});

		it("preserves optional primary setting", () => {
			const config = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				primary: true,
			});

			expect(config.primary).toBe(true);
		});
	});

	describe("DurableObject _owner auto-assignment", () => {
		it("assigns _owner to DO binding when not specified", () => {
			const config = Worker({
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

			expect(config.bindings.MY_DO._owner).toBe("my-worker");
		});

		it("preserves explicit _owner when provided", () => {
			const config = Worker({
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

			// Manually set _owner before passing to Worker
			const doBinding = DurableObject({
				name: "MY_DO",
				className: "MyDurableObject",
				classPath: "./src/shared/my-do.ts",
			});
			doBinding._owner = "other-worker";

			const configWithExplicitOwner = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					MY_DO: doBinding,
				},
			});

			expect(configWithExplicitOwner.bindings.MY_DO._owner).toBe("other-worker");
		});

		it("handles multiple DO bindings", () => {
			const externalDO = DurableObject({
				name: "EXTERNAL_DO",
				className: "ExternalDO",
				classPath: "./src/shared/external-do.ts",
			});
			externalDO._owner = "external-worker";

			const config = Worker({
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

			expect(config.bindings.MY_DO._owner).toBe("my-worker");
			expect(config.bindings.EXTERNAL_DO._owner).toBe("external-worker");
		});
	});

	describe("mixed bindings", () => {
		it("passes through D1 bindings unchanged", () => {
			const config = Worker({
				name: "my-worker",
				entryPoint: "./src/my-worker/index.ts",
				bindings: {
					DB: D1({ name: "my-database" }),
				},
			});

			expect(config.bindings.DB._type).toBe("D1");
			expect(config.bindings.DB.name).toBe("my-database");
		});

		it("handles mixed D1 and DO bindings", () => {
			const config = Worker({
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

			expect(config.bindings.DB._type).toBe("D1");
			expect(config.bindings.MY_DO._type).toBe("DurableObject");
			expect(config.bindings.MY_DO._owner).toBe("my-worker");
		});
	});
});
