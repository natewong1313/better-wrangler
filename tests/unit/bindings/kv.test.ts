import { describe, it, expect } from "vitest";
import { KV } from "../../../src/bindings/kv";

describe("KV", () => {
	it("creates a KV binding with the correct type", () => {
		const binding = KV({ name: "my-namespace" });

		expect(binding._type).toBe("KV");
	});

	it("sets the namespace name correctly", () => {
		const binding = KV({ name: "my-namespace" });

		expect(binding.name).toBe("my-namespace");
	});

	it("handles different namespace names", () => {
		const binding1 = KV({ name: "cache" });
		const binding2 = KV({ name: "sessions" });

		expect(binding1.name).toBe("cache");
		expect(binding2.name).toBe("sessions");
	});

	it("includes _runtimeType property", () => {
		const binding = KV({ name: "my-namespace" });

		expect(binding).toHaveProperty("_runtimeType");
	});
});
