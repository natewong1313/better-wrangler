import { describe, it, expect } from "vitest";
import { extractD1Databases } from "../../../src/cli/utils/wrangler";

describe("wrangler utils", () => {
  describe("extractD1Databases", () => {
    it("extracts D1 databases from bindings", () => {
      const bindings = {
        DB: {
          _type: "D1",
          name: "my-database",
          id: "abc123",
        },
        CACHE: {
          _type: "KV",
          name: "my-kv",
        },
      };

      const databases = extractD1Databases(bindings);

      expect(databases).toHaveLength(1);
      expect(databases[0]).toEqual({
        name: "my-database",
        bindingName: "DB",
        migrationsDir: "./migrations",
        id: "abc123",
      });
    });

    it("uses custom migrationsDir when provided", () => {
      const bindings = {
        DB: {
          _type: "D1",
          name: "my-database",
          migrationsDir: "./db/migrations",
        },
      };

      const databases = extractD1Databases(bindings);

      expect(databases).toHaveLength(1);
      expect(databases[0].migrationsDir).toBe("./db/migrations");
    });

    it("defaults to ./migrations when migrationsDir not provided", () => {
      const bindings = {
        DB: {
          _type: "D1",
          name: "my-database",
        },
      };

      const databases = extractD1Databases(bindings);

      expect(databases).toHaveLength(1);
      expect(databases[0].migrationsDir).toBe("./migrations");
    });

    it("extracts multiple D1 databases", () => {
      const bindings = {
        PRIMARY_DB: {
          _type: "D1",
          name: "primary-db",
        },
        SECONDARY_DB: {
          _type: "D1",
          name: "secondary-db",
          migrationsDir: "./secondary-migrations",
        },
      };

      const databases = extractD1Databases(bindings);

      expect(databases).toHaveLength(2);
      expect(databases.map((d) => d.name)).toContain("primary-db");
      expect(databases.map((d) => d.name)).toContain("secondary-db");
    });

    it("returns empty array when no D1 bindings", () => {
      const bindings = {
        KV: {
          _type: "KV",
          name: "my-kv",
        },
        R2: {
          _type: "R2",
          name: "my-bucket",
        },
      };

      const databases = extractD1Databases(bindings);

      expect(databases).toHaveLength(0);
    });

    it("returns empty array for empty bindings", () => {
      const databases = extractD1Databases({});
      expect(databases).toHaveLength(0);
    });

    it("ignores null and undefined bindings", () => {
      const bindings = {
        NULL_BINDING: null,
        UNDEFINED_BINDING: undefined,
        DB: {
          _type: "D1",
          name: "my-database",
        },
      };

      const databases = extractD1Databases(bindings as Record<string, unknown>);

      expect(databases).toHaveLength(1);
      expect(databases[0].name).toBe("my-database");
    });
  });
});
