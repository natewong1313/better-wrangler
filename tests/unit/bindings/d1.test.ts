import { describe, it, expect } from "vitest";
import { D1 } from "../../../src/bindings/d1";

describe("D1", () => {
	it("creates a D1 binding with the correct type", () => {
		const binding = D1({ name: "my-database" });

		expect(binding._type).toBe("D1");
	});

	it("sets the database name correctly", () => {
		const binding = D1({ name: "my-database" });

		expect(binding.name).toBe("my-database");
	});

	it("handles different database names", () => {
		const binding1 = D1({ name: "users-db" });
		const binding2 = D1({ name: "analytics-db" });

		expect(binding1.name).toBe("users-db");
		expect(binding2.name).toBe("analytics-db");
	});

	it("includes _runtimeType property", () => {
		const binding = D1({ name: "my-database" });

		expect(binding).toHaveProperty("_runtimeType");
	});

	it("stores database id when provided", () => {
		const binding = D1({
			name: "my-database",
			id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
		});

		expect(binding.id).toBe("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx");
	});

	it("id is undefined when not provided", () => {
		const binding = D1({ name: "my-database" });

		expect(binding.id).toBeUndefined();
	});
});
