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

describe("migrations - delete operations", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-delete-test-"));
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

  describe("explicit deletion", () => {
    it("creates deleted_classes migration for explicit delete", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      // Remove the class from current DOs and add to deletedDurableObjects
      const currentDOs: DurableObjectBinding[] = [];

      const result = computeMigrations("my-worker", currentDOs, state, ["MyClass"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations).toHaveLength(2);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        deleted_classes: ["MyClass"],
      });
    });

    it("handles multiple deletions in one migration", () => {
      const state = createInitialState({
        ClassA: { storage: "sqlite", classPath: "./src/a.ts", addedInTag: 1 },
        ClassB: { storage: "sqlite", classPath: "./src/b.ts", addedInTag: 1 },
        ClassC: { storage: "sqlite", classPath: "./src/c.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("ClassC", "./src/c.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["ClassA", "ClassB"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1].deleted_classes).toHaveLength(2);
      expect(result.migrations[1].deleted_classes).toContain("ClassA");
      expect(result.migrations[1].deleted_classes).toContain("ClassB");
    });

    it("removes deleted class from state.classes", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
        KeepMe: { storage: "sqlite", classPath: "./src/keep.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("KeepMe", "./src/keep.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["MyClass"]);

      expect(result.updatedState.workers["my-worker"].classes).not.toHaveProperty("MyClass");
      expect(result.updatedState.workers["my-worker"].classes).toHaveProperty("KeepMe");
    });
  });

  describe("deletion with other operations", () => {
    it("handles delete + add new class in same migration", () => {
      const state = createInitialState({
        OldClass: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("NewClass", "./src/new.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["OldClass"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        new_sqlite_classes: ["NewClass"],
        deleted_classes: ["OldClass"],
      });
    });

    it("handles delete + rename another class in same migration", () => {
      const state = createInitialState({
        ToDelete: { storage: "sqlite", classPath: "./src/delete.ts", addedInTag: 1 },
        ToRename: { storage: "sqlite", classPath: "./src/rename.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("Renamed", "./src/rename.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["ToDelete"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "ToRename", to: "Renamed" }],
        deleted_classes: ["ToDelete"],
      });
    });

    it("handles delete + add + rename in same migration", () => {
      const state = createInitialState({
        ToDelete: { storage: "sqlite", classPath: "./src/delete.ts", addedInTag: 1 },
        ToRename: { storage: "sqlite", classPath: "./src/rename.ts", addedInTag: 1 },
      });

      const currentDOs = [
        createDO("Renamed", "./src/rename.ts"),
        createDO("BrandNew", "./src/new.ts"),
      ];

      const result = computeMigrations("my-worker", currentDOs, state, ["ToDelete"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1]).toEqual({
        tag: "v2",
        new_sqlite_classes: ["BrandNew"],
        renamed_classes: [{ from: "ToRename", to: "Renamed" }],
        deleted_classes: ["ToDelete"],
      });
    });
  });

  describe("deletion edge cases", () => {
    it("ignores delete for class that does not exist in state", () => {
      const state = createInitialState({
        ExistingClass: { storage: "sqlite", classPath: "./src/existing.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("ExistingClass", "./src/existing.ts")];

      // Try to delete a class that doesn't exist
      const result = computeMigrations("my-worker", currentDOs, state, ["NonExistent"]);

      expect(result.errors).toHaveLength(0);
      // No migration should be created since nothing changed
      expect(result.migrations).toHaveLength(1); // Only v1
    });

    it("handles deleting all DOs from a worker", () => {
      const state = createInitialState({
        ClassA: { storage: "sqlite", classPath: "./src/a.ts", addedInTag: 1 },
        ClassB: { storage: "sqlite", classPath: "./src/b.ts", addedInTag: 1 },
      });

      const currentDOs: DurableObjectBinding[] = [];

      const result = computeMigrations("my-worker", currentDOs, state, ["ClassA", "ClassB"]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations[1].deleted_classes).toEqual(["ClassA", "ClassB"]);
      expect(Object.keys(result.updatedState.workers["my-worker"].classes)).toHaveLength(0);
    });

    it("does not create empty migration when only invalid deletes", () => {
      const state = createInitialState({
        ExistingClass: { storage: "sqlite", classPath: "./src/existing.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("ExistingClass", "./src/existing.ts")];

      // Only invalid deletes
      const result = computeMigrations("my-worker", currentDOs, state, [
        "NonExistent1",
        "NonExistent2",
      ]);

      expect(result.errors).toHaveLength(0);
      expect(result.migrations).toHaveLength(1); // Only original v1
    });
  });

  describe("conflict between rename and delete", () => {
    it("returns error when class is in both _renamedFrom target and deletedDurableObjects", () => {
      const state = createInitialState({
        OldName: { storage: "sqlite", classPath: "./src/old.ts", addedInTag: 1 },
      });

      // Conflict: trying to rename FROM OldName AND delete OldName
      const currentDOs = [createDO("NewName", "./src/new.ts", "sqlite", "OldName")];

      const result = computeMigrations("my-worker", currentDOs, state, ["OldName"]);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("rename_delete_conflict");
      expect(result.errors[0].className).toBe("OldName");
      expect(result.errors[0].message).toContain("both marked for rename and deletion");
    });
  });

  describe("state consistency after delete", () => {
    it("deleted class is removed from state.classes", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const result = computeMigrations("my-worker", [], state, ["MyClass"]);

      expect(result.updatedState.workers["my-worker"].classes).not.toHaveProperty("MyClass");
    });

    it("history contains correct deleted_classes entry", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const result = computeMigrations("my-worker", [], state, ["MyClass"]);

      const lastMigration = result.migrations[result.migrations.length - 1];
      expect(lastMigration.deleted_classes).toEqual(["MyClass"]);
    });

    it("other classes remain unchanged", () => {
      const state = createInitialState({
        ToDelete: { storage: "sqlite", classPath: "./src/delete.ts", addedInTag: 1 },
        KeepMe: { storage: "sqlite", classPath: "./src/keep.ts", addedInTag: 1 },
      });

      const currentDOs = [createDO("KeepMe", "./src/keep.ts")];

      const result = computeMigrations("my-worker", currentDOs, state, ["ToDelete"]);

      expect(result.updatedState.workers["my-worker"].classes["KeepMe"]).toEqual({
        storage: "sqlite",
        classPath: "./src/keep.ts",
        addedInTag: 1,
      });
    });

    it("currentTag increments correctly", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const result = computeMigrations("my-worker", [], state, ["MyClass"]);

      expect(result.updatedState.workers["my-worker"].currentTag).toBe(2);
    });
  });

  describe("chained migrations with deletes", () => {
    it("v1: add, v2: delete - produces correct history", () => {
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add a class
      const v1DOs = [createDO("MyClass", "./src/my-do.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      expect(v1Result.migrations).toHaveLength(1);

      // v2: Delete the class
      const v2Result = computeMigrations("my-worker", [], v1Result.updatedState, ["MyClass"]);

      expect(v2Result.migrations).toHaveLength(2);
      expect(v2Result.migrations[1]).toEqual({
        tag: "v2",
        deleted_classes: ["MyClass"],
      });
    });

    it("v1: add A+B, v2: delete A, v3: add C - produces correct history", () => {
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add two classes
      const v1DOs = [createDO("ClassA", "./src/a.ts"), createDO("ClassB", "./src/b.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      // v2: Delete ClassA
      const v2DOs = [createDO("ClassB", "./src/b.ts")];
      const v2Result = computeMigrations("my-worker", v2DOs, v1Result.updatedState, ["ClassA"]);

      // v3: Add ClassC
      const v3DOs = [createDO("ClassB", "./src/b.ts"), createDO("ClassC", "./src/c.ts")];
      const v3Result = computeMigrations("my-worker", v3DOs, v2Result.updatedState);

      expect(v3Result.migrations).toHaveLength(3);
      expect(v3Result.migrations[0].new_sqlite_classes).toContain("ClassA");
      expect(v3Result.migrations[0].new_sqlite_classes).toContain("ClassB");
      expect(v3Result.migrations[1].deleted_classes).toEqual(["ClassA"]);
      expect(v3Result.migrations[2].new_sqlite_classes).toEqual(["ClassC"]);
    });

    it("cannot delete already deleted class", () => {
      const emptyState: MigrationState = { version: 1, workers: {} };

      // v1: Add a class
      const v1DOs = [createDO("MyClass", "./src/my-do.ts")];
      const v1Result = computeMigrations("my-worker", v1DOs, emptyState);

      // v2: Delete it
      const v2Result = computeMigrations("my-worker", [], v1Result.updatedState, ["MyClass"]);

      // v3: Try to delete it again - should be no-op (class no longer in state)
      const v3Result = computeMigrations("my-worker", [], v2Result.updatedState, ["MyClass"]);

      // No new migration should be created
      expect(v3Result.migrations).toHaveLength(2); // Still just v1 and v2
    });
  });

  describe("ambiguous removal", () => {
    it("returns error when class disappears without explicit handling", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      // Class is gone but not in deletedDurableObjects
      const currentDOs: DurableObjectBinding[] = [];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("ambiguous_removal");
      expect(result.errors[0].className).toBe("MyClass");
    });

    it("returns multiple errors for multiple ambiguous removals", () => {
      const state = createInitialState({
        ClassA: { storage: "sqlite", classPath: "./src/a.ts", addedInTag: 1 },
        ClassB: { storage: "sqlite", classPath: "./src/b.ts", addedInTag: 1 },
      });

      // Both classes gone without explanation
      const currentDOs: DurableObjectBinding[] = [];

      const result = computeMigrations("my-worker", currentDOs, state);

      expect(result.errors).toHaveLength(2);
      expect(result.errors.map((e) => e.className)).toContain("ClassA");
      expect(result.errors.map((e) => e.className)).toContain("ClassB");
    });

    it("error message contains helpful instructions", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const result = computeMigrations("my-worker", [], state);

      expect(result.errors[0].message).toContain("_renamedFrom");
      expect(result.errors[0].message).toContain("_deletedDurableObjects");
    });

    it("no state changes when ambiguous errors exist", () => {
      const state = createInitialState({
        MyClass: { storage: "sqlite", classPath: "./src/my-do.ts", addedInTag: 1 },
      });

      const result = computeMigrations("my-worker", [], state);

      // State should be unchanged
      expect(result.updatedState).toEqual(state);
    });
  });

  describe("persistence", () => {
    it("saves and loads migration state with deletes correctly", () => {
      const state = createInitialState({
        ToDelete: { storage: "sqlite", classPath: "./src/delete.ts", addedInTag: 1 },
        ToKeep: { storage: "sqlite", classPath: "./src/keep.ts", addedInTag: 1 },
      });
      saveMigrationState(tempDir, state);

      const currentDOs = [createDO("ToKeep", "./src/keep.ts")];
      const result = computeMigrations(
        "my-worker",
        currentDOs,
        loadMigrationState(tempDir),
        ["ToDelete"],
      );

      saveMigrationState(tempDir, result.updatedState);
      const loadedState = loadMigrationState(tempDir);

      expect(loadedState.workers["my-worker"].classes).not.toHaveProperty("ToDelete");
      expect(loadedState.workers["my-worker"].classes).toHaveProperty("ToKeep");
      expect(loadedState.workers["my-worker"].history).toHaveLength(2);
      expect(loadedState.workers["my-worker"].history[1].deleted_classes).toEqual(["ToDelete"]);
    });
  });
});
