import { describe, it, expect } from "vitest";
import {
  extractKvBindings,
  extractD1Bindings,
  extractR2Bindings,
  extractQueueBindings,
  countMissingResources,
  formatMissingResources,
  type MissingResources,
} from "../../../src/cli/utils/resources";

describe("resources utils", () => {
  describe("extractKvBindings", () => {
    it("extracts KV bindings from worker bindings", () => {
      const bindings = {
        CACHE: {
          _type: "KV",
          name: "my-cache",
          id: "abc123",
        },
        OTHER: {
          _type: "D1",
          name: "my-db",
        },
      };

      const result = extractKvBindings(bindings);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bindingName: "CACHE",
        name: "my-cache",
        existingId: "abc123",
      });
    });

    it("returns empty array when no KV bindings", () => {
      const bindings = {
        DB: {
          _type: "D1",
          name: "my-db",
        },
      };

      const result = extractKvBindings(bindings);
      expect(result).toHaveLength(0);
    });

    it("handles bindings without existing id", () => {
      const bindings = {
        CACHE: {
          _type: "KV",
          name: "my-cache",
        },
      };

      const result = extractKvBindings(bindings);

      expect(result).toHaveLength(1);
      expect(result[0].existingId).toBeUndefined();
    });
  });

  describe("extractD1Bindings", () => {
    it("extracts D1 bindings from worker bindings", () => {
      const bindings = {
        DB: {
          _type: "D1",
          name: "my-database",
          id: "uuid-123",
        },
      };

      const result = extractD1Bindings(bindings);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bindingName: "DB",
        name: "my-database",
        existingId: "uuid-123",
      });
    });

    it("extracts multiple D1 bindings", () => {
      const bindings = {
        PRIMARY_DB: {
          _type: "D1",
          name: "primary-db",
        },
        SECONDARY_DB: {
          _type: "D1",
          name: "secondary-db",
        },
      };

      const result = extractD1Bindings(bindings);
      expect(result).toHaveLength(2);
    });
  });

  describe("extractR2Bindings", () => {
    it("extracts R2 bindings from worker bindings", () => {
      const bindings = {
        BUCKET: {
          _type: "R2",
          name: "my-bucket",
        },
      };

      const result = extractR2Bindings(bindings);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bindingName: "BUCKET",
        name: "my-bucket",
      });
    });
  });

  describe("extractQueueBindings", () => {
    it("extracts QueueProducer bindings from worker bindings", () => {
      const bindings = {
        QUEUE: {
          _type: "QueueProducer",
          queue: "my-queue",
        },
      };

      const result = extractQueueBindings(bindings);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        bindingName: "QUEUE",
        name: "my-queue",
      });
    });
  });

  describe("countMissingResources", () => {
    it("counts total missing resources", () => {
      const missing: MissingResources = {
        kv: [{ bindingName: "KV1", name: "kv-1" }, { bindingName: "KV2", name: "kv-2" }],
        d1: [{ bindingName: "DB", name: "db-1" }],
        r2: [],
        queues: [{ bindingName: "Q", name: "queue-1" }],
      };

      const count = countMissingResources(missing);
      expect(count).toBe(4);
    });

    it("returns 0 when no missing resources", () => {
      const missing: MissingResources = {
        kv: [],
        d1: [],
        r2: [],
        queues: [],
      };

      const count = countMissingResources(missing);
      expect(count).toBe(0);
    });
  });

  describe("formatMissingResources", () => {
    it("formats missing resources for display", () => {
      const missing: MissingResources = {
        kv: [{ bindingName: "CACHE", name: "my-cache" }],
        d1: [{ bindingName: "DB", name: "my-db" }],
        r2: [{ bindingName: "BUCKET", name: "my-bucket" }],
        queues: [{ bindingName: "QUEUE", name: "my-queue" }],
      };

      const lines = formatMissingResources(missing);

      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("KV namespace");
      expect(lines[0]).toContain("my-cache");
      expect(lines[0]).toContain("CACHE");
      expect(lines[1]).toContain("D1 database");
      expect(lines[2]).toContain("R2 bucket");
      expect(lines[3]).toContain("Queue");
    });

    it("returns empty array when no missing resources", () => {
      const missing: MissingResources = {
        kv: [],
        d1: [],
        r2: [],
        queues: [],
      };

      const lines = formatMissingResources(missing);
      expect(lines).toHaveLength(0);
    });
  });
});
