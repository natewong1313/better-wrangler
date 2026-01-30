import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { DurableObjectBinding } from "../../src/bindings/durable-object";
import {
  computeMigrations,
  loadMigrationState,
  saveMigrationState,
  type MigrationState,
} from "../../src/migrations";

describe("migrations - rename operations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-rename-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createDO = (
    className: string,
    classPath: string,
    storage: "sqlite" | "kv" = "sqlite",
    renamedFrom?: string,
  ): DurableObjectBinding => ({
    _type: "DurableObject",
    _runtimeType: null as unknown as DurableObjectNamespace,
    name: className,
    className,
    classPath,
    storage,
    _owner: "my-worker",
    _renamedFrom: renamedFrom,
  });

  const createInitialState = (
    classes: Record<string, { storage: "sqlite" | "kv"; classPath: string; addedInTag: number }>,
  ): MigrationState => ({
    version: 1,
    workers: {
      "my-worker": {
        currentTag: 1,
        classes,
        history: [
          {
            tag: "v1",
            new_sqlite_classes: Object.entries(classes)
              .filter(([_, v]) => v.storage === "sqlite")
              .map(([k]) => k),
          },
        ],
      },
    },
  });

  describe("auto-detected renames (same classPath)", () => {
    it("detects rename when class name changes but path stays same", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.migrations).toHaveLength(2);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "OldName", to: "NewName" }],
      });

      // Verify state update
      expect(result.updatedState.workers["my-worker"].classes).toHaveProperty("NewName");
      expect(result.updatedState.workers["my-worker"].classes).not.toHaveProperty("OldName");
    });

    it("handles multiple auto-detected renames in one migration", () => {
      const state = createInitialState({
        OldA: { storage: "sqlite", classPath: "./src/a.ts", addedInTag: 1 },
        OldB: { storage: "sqlite", classPath: "./src/b.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("NewA", "./src/a.ts"),
        createDO("NewB", "./src/b.ts"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1].renamed_classes).toHaveLength(2);
      expect(result.migrations[1].renamed_classes).toContainEqual({ from: "OldA", to: "NewA" });
      expect(result.migrations[1].renamed_classes).toContainEqual({ from: "OldB", to: "NewB" });
    });

    it("auto-detected rename preserves original addedInTag", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].addedInTag).toBe(1);
    });

    it("auto-detected rename updates classPath in state", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      // Same path, just renamed
      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].classPath).toBe(
        "./src/my-do.ts",
      );
    });
  });

  describe("explicit renames (_renamedFrom)", () => {
    it("uses _renamedFrom when class name AND path change", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/new.ts", "sqlite", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "OldName", to: "NewName" }],
      });
    });

    it("handles multiple explicit renames in one migration", () => {
      const state = createInitialState({
        OldA: { storage: "sqlite", classPath: "./src/old-a.ts", addedInTag: 1 },
        OldB: { storage: "sqlite", classPath: "./src/old-b.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("NewA", "./src/new-a.ts", "sqlite", "OldA"),
        createDO("NewB", "./src/new-b.ts", "sqlite", "OldB"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1].renamed_classes).toHaveLength(2);
    });

    it("explicit rename preserves original addedInTag", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/new.ts", "sqlite", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].addedInTag).toBe(1);
    });

    it("explicit rename updates classPath in state", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/new.ts", "sqlite", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].classPath).toBe(
        "./src/new.ts",
      );
    });
  });

  describe("rename with other operations", () => {
    it("handles rename + add new class in same migration", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("NewName", "./src/my-do.ts"), // Renamed
        createDO("BrandNew", "./src/brand-new.ts"), // Added
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        new_sqlite_classes: ["BrandNew"],
        renamed_classes: [{ from: "OldName", to: "NewName" }],
      });
    });

    it("handles rename + delete another class in same migration", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
        ToDelete: { storage: "sqlite", classPath: "./src/to-delete.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["ToDelete"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "OldName", to: "NewName" }],
        deleted_classes: ["ToDelete"],
      });
    });

    it("handles rename + add + delete in same migration", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
        ToDelete: { storage: "sqlite", classPath: "./src/to-delete.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("NewName", "./src/my-do.ts"),
        createDO("BrandNew", "./src/brand-new.ts"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state, ["ToDelete"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        new_sqlite_classes: ["BrandNew"],
        renamed_classes: [{ from: "OldName", to: "NewName" }],
        deleted_classes: ["ToDelete"],
      });
    });
  });

  describe("rename edge cases", () => {
    it("warns when _renamedFrom points to non-existent class", () => {
      const state = createInitialState({
        ExistingClass: { storage: "sqlite", classPath: "./src/existing.ts", addedInTag: 1 },
      });

      // _renamedFrom points to class that doesn't exist
      const currentDOs = [
        createDO("ExistingClass", "./src/existing.ts"),
        createDO("NewClass", "./src/new.ts", "sqlite", "NonExistent"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("rename_source_not_found");
      expect(result.warnings[0].className).toBe("NewClass");
      expect(result.warnings[0].message).toContain("NonExistent");
      expect(result.warnings[0].message).toContain("does not exist");

      // NewClass should be treated as a new class, not a rename
      expect(result.migrations[1].new_sqlite_classes).toContain("NewClass");
    });

    it("returns error when multiple classes claim same _renamedFrom source", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("NewA", "./src/new-a.ts", "sqlite", "OldName"),
        createDO("NewB", "./src/new-b.ts", "sqlite", "OldName"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("duplicate_rename_source");
      expect(result.errors[0].className).toBe("OldName");
      expect(result.errors[0].message).toContain("NewA");
      expect(result.errors[0].message).toContain("NewB");
    });

    it("prioritizes explicit _renamedFrom over auto-detection", () => {
      const state = createInitialState({
        OldA: { storage: "sqlite", classPath: "./src/a.ts", addedInTag: 1 },
        OldB: { storage: "sqlite", classPath: "./src/b.ts", addedInTag: 1 },
      });

      // NewName has same path as OldA (would auto-detect) but explicitly claims OldB
      const currentDOs = [createDO("NewName", "./src/a.ts", "sqlite", "OldB")];

      const result = computeMigrations("my-worker", currentDOs, state, ["OldA"]);

      expect(result.errors).toHaveLength(0);
      // Should use explicit rename from OldB, not auto-detected from OldA
      expect(result.migrations[1].renamed_classes).toEqual([{ from: "OldB", to: "NewName" }]);
      expect(result.migrations[1].deleted_classes).toEqual(["OldA"]);
    });

    it("returns error when rename target already exists in state", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
        ExistingName: { storage: "sqlite", classPath: "./src/existing.ts", addedInTag: 1 },
      });

      // Try to rename OldName to ExistingName which already exists
      const currentDOs = [
        createDO("ExistingName", "./src/new.ts", "sqlite", "OldName"),
        // Note: the original ExistingName is removed, but the name collision still applies
      ];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("rename_to_existing_class");
      expect(result.errors[0].className).toBe("ExistingName");
      expect(result.errors[0].message).toContain("already exists");
    });

    it("returns error when storage type changes during rename", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      // Try to rename with different storage type
      const currentDOs = [createDO("NewName", "./src/new.ts", "kv", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("storage_type_change");
      expect(result.errors[0].className).toBe("NewName");
      expect(result.errors[0].message).toContain("sqlite");
      expect(result.errors[0].message).toContain("kv");
      expect(result.errors[0].message).toContain("Cloudflare does not support");
    });
  });

  describe("state consistency after rename", () => {
    it("old class name is removed from state.classes", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes).not.toHaveProperty("OldName");
    });

    it("new class name is added to state.classes", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes).toHaveProperty("NewName");
    });

    it("classPath is updated correctly", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/new.ts", "sqlite", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].classPath).toBe(
        "./src/new.ts",
      );
    });

    it("storage type is preserved (cannot change)", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts", "sqlite")];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.updatedState.workers["my-worker"].classes["NewName"].storage).toBe("sqlite");
    });

    it("history contains correct renamed_classes entry", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];

      const result = computeMigrations("my-worker", currentDOs, state);

      const lastMigration = result.migrations[result.migrations.length - 1];
      expect(lastMigration.renamed_classes).toEqual([{ from: "OldName", to: "NewName" }]);
    });
  });

  describe("chained migrations with renames", () => {
    it("v1: add, v2: rename - produces correct history", () => {
      // Start with empty state
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add a class
      const v1DOs = [createDO("MyClass", "./src/my-do.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      expect(v1Result.migrations).toHaveLength(1);
      expect(v1Result.migrations[0]).toEqual({
        tag: "v1",
        new_sqlite_classes: ["MyClass"],
      });

      // v2: Rename the class
      const v2DOs = [createDO("RenamedClass", "./src/my-do.ts")];
      const v2Result = computeMigrations("my-worker", v2DOs, v1Result.updatedState);

      expect(v2Result.migrations).toHaveLength(2);
      expect(v2Result.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "MyClass", to: "RenamedClass" }],
      });
    });

    it("v1: add, v2: rename, v3: add more - produces correct history", () => {
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add a class
      const v1DOs = [createDO("MyClass", "./src/my-do.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      // v2: Rename the class
      const v2DOs = [createDO("RenamedClass", "./src/my-do.ts")];
      const v2Result = computeMigrations("my-worker", v2DOs, v1Result.updatedState);

      // v3: Add another class
      const v3DOs = [
        createDO("RenamedClass", "./src/my-do.ts"),
        createDO("AnotherClass", "./src/another.ts"),
      ];
      const v3Result = computeMigrations("my-worker", v3DOs, v2Result.updatedState);

      expect(v3Result.migrations).toHaveLength(3);
      expect(v3Result.migrations[2]).toEqual({
        tag: "v3",
        new_sqlite_classes: ["AnotherClass"],
      });
    });

    it("renaming previously renamed class works correctly", () => {
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add a class
      const v1DOs = [createDO("OriginalName", "./src/my-do.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      // v2: First rename
      const v2DOs = [createDO("FirstRename", "./src/my-do.ts")];
      const v2Result = computeMigrations("my-worker", v2DOs, v1Result.updatedState);

      // v3: Second rename
      const v3DOs = [createDO("SecondRename", "./src/my-do.ts")];
      const v3Result = computeMigrations("my-worker", v3DOs, v2Result.updatedState);

      expect(v3Result.migrations).toHaveLength(3);
      expect(v3Result.migrations[2]).toEqual({
        tag: "v3",
        renamed_classes: [{ from: "FirstRename", to: "SecondRename" }],
      });

      // Original addedInTag should still be 1
      expect(v3Result.updatedState.workers["my-worker"].classes["SecondRename"].addedInTag).toBe(1);
    });
  });

  describe("persistence", () => {
    it("saves and loads migration state with renames correctly", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });
      saveMigrationState(tempDir, state);

      const currentDOs = [createDO("NewName", "./src/my-do.ts")];
      const result = computeMigrations("my-worker", currentDOs, loadMigrationState(tempDir));

      saveMigrationState(tempDir, result.updatedState);
      const loadedState = loadMigrationState(tempDir);

      expect(loadedState.workers["my-worker"].classes).toHaveProperty("NewName");
      expect(loadedState.workers["my-worker"].classes).not.toHaveProperty("OldName");
      expect(loadedState.workers["my-worker"].history).toHaveLength(2);
    });
  });
});
