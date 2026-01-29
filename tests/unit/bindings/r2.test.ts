import { describe, expect, test } from "vitest";
import { R2 } from "../../../src/bindings/r2";

describe("R2", () => {
  test("creates R2 binding with correct type", () => {
    const binding = R2({ name: "my-bucket" });

    expect(binding._type).toBe("R2");
    expect(binding.name).toBe("my-bucket");
  });

  test("has _runtimeType for type inference", () => {
    const binding = R2({ name: "test-bucket" });

    expect(binding).toHaveProperty("_runtimeType");
  });
});
