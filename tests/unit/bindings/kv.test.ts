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

	it("stores id when provided", () => {
		const binding = KV({
			name: "my-namespace",
			id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
		});

		expect(binding.id).toBe("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
	});

	it("stores preview_id when provided", () => {
		const binding = KV({
			name: "my-namespace",
			preview_id: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
		});

		expect(binding.preview_id).toBe("yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy");
	});

	it("stores both id and preview_id when provided", () => {
		const binding = KV({
			name: "my-namespace",
			id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
			preview_id: "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
		});

		expect(binding.id).toBe("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
		expect(binding.preview_id).toBe("yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy");
	});

	it("id and preview_id are undefined when not provided", () => {
		const binding = KV({ name: "my-namespace" });

		expect(binding.id).toBeUndefined();
		expect(binding.preview_id).toBeUndefined();
	});
});
