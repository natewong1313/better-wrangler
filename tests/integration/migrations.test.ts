import { describe, it, expect, afterAll } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { createTempProject, readTempFile, cleanupTempProjects } from "../utils/temp-project";
import { runCLI } from "../utils/run-cli";

describe("migrations integration", () => {
  afterAll(async () => {
    await cleanupTempProjects();
  });

  const srcPath = path.resolve("./src");

  describe("rename flow through CLI", () => {
    it("auto-detects rename when config changes class name but keeps path", async () => {
      // Step 1: Create project with DO class "OldName" at path "./src/my-worker/my-do.ts"
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "OldName",
  classPath: "./src/my-worker/my-do.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      // Create the DO class file
      await fs.writeFile(
        path.join(tempDir, "src/my-worker/my-do.ts"),
        `export class OldName { constructor(state: DurableObjectState) {} }`,
      );

      // Step 2: Run sync to create initial migration
      const result1 = await runCLI(["sync"], { cwd: tempDir });
      if (result1.exitCode !== 0) {
        console.log("STDOUT:", result1.stdout);
        console.log("STDERR:", result1.stderr);
      }
      expect(result1.exitCode).toBe(0);

      // Verify v1 migration
      const config1 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config1.migrations).toEqual([{ tag: "v1", new_sqlite_classes: ["OldName"] }]);

      // Step 3: Modify config to change className to "NewName" (same path)
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "NewName",
  classPath: "./src/my-worker/my-do.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
      );

      // Update the DO class file too
      await fs.writeFile(
        path.join(tempDir, "src/my-worker/my-do.ts"),
        `export class NewName { constructor(state: DurableObjectState) {} }`,
      );

      // Step 4: Run sync again
      const result2 = await runCLI(["sync"], { cwd: tempDir });
      expect(result2.exitCode).toBe(0);

      // Step 5: Verify wrangler.jsonc has v2 migration with renamed_classes
      const config2 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config2.migrations).toEqual([
        { tag: "v1", new_sqlite_classes: ["OldName"] },
        { tag: "v2", renamed_classes: [{ from: "OldName", to: "NewName" }] },
      ]);

      // Step 6: Verify bw.migrations.json has updated state
      const migrationState = JSON.parse(await readTempFile(tempDir, "bw.migrations.json"));
      expect(migrationState.workers["my-worker"].classes).toHaveProperty("NewName");
      expect(migrationState.workers["my-worker"].classes).not.toHaveProperty("OldName");
      expect(migrationState.workers["my-worker"].currentTag).toBe(2);
    });

    it("handles explicit rename with _renamedFrom when path also changes", async () => {
      // Step 1: Create project with DO "OldName" at "./src/my-worker/old.ts"
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "OldName",
  classPath: "./src/my-worker/old.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/old.ts"),
        `export class OldName { constructor(state: DurableObjectState) {} }`,
      );

      // Step 2: Run sync
      const result1 = await runCLI(["sync"], { cwd: tempDir });
      expect(result1.exitCode).toBe(0);

      // Step 3: Modify config with new className, new path, and _renamedFrom
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "NewName",
  classPath: "./src/my-worker/new.ts",
  _renamedFrom: "OldName",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
      );

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/new.ts"),
        `export class NewName { constructor(state: DurableObjectState) {} }`,
      );

      // Step 4: Run sync
      const result2 = await runCLI(["sync"], { cwd: tempDir });
      expect(result2.exitCode).toBe(0);

      // Step 5: Verify migrations
      const config = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config.migrations).toEqual([
        { tag: "v1", new_sqlite_classes: ["OldName"] },
        { tag: "v2", renamed_classes: [{ from: "OldName", to: "NewName" }] },
      ]);
    });
  });

  describe("delete flow through CLI", () => {
    it("creates delete migration when deletedDurableObjects is specified", async () => {
      // Step 1: Create project with two DOs
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const doA = DurableObject({
  name: "DO_A",
  className: "ClassA",
  classPath: "./src/my-worker/a.ts",
});

const doB = DurableObject({
  name: "DO_B",
  className: "ClassB",
  classPath: "./src/my-worker/b.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    DO_A: doA,
    DO_B: doB,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/a.ts"),
        `export class ClassA { constructor(state: DurableObjectState) {} }`,
      );
      await fs.writeFile(
        path.join(tempDir, "src/my-worker/b.ts"),
        `export class ClassB { constructor(state: DurableObjectState) {} }`,
      );

      // Step 2: Run sync
      const result1 = await runCLI(["sync"], { cwd: tempDir });
      expect(result1.exitCode).toBe(0);

      // Verify both classes in v1
      const config1 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config1.migrations[0].new_sqlite_classes).toContain("ClassA");
      expect(config1.migrations[0].new_sqlite_classes).toContain("ClassB");

      // Step 3: Remove one DO from bindings, add to _deletedDurableObjects
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const doB = DurableObject({
  name: "DO_B",
  className: "ClassB",
  classPath: "./src/my-worker/b.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    DO_B: doB,
  },
  _deletedDurableObjects: ["ClassA"],
});
`,
      );

      // Step 4: Run sync
      const result2 = await runCLI(["sync"], { cwd: tempDir });
      expect(result2.exitCode).toBe(0);

      // Step 5: Verify v2 migration has deleted_classes
      const config2 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config2.migrations).toHaveLength(2);
      expect(config2.migrations[1]).toEqual({
        tag: "v2",
        deleted_classes: ["ClassA"],
      });
    });
  });

  describe("error handling through CLI", () => {
    it("fails with helpful error when DO removed without clarification", async () => {
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "MyClass",
  classPath: "./src/my-worker/my-do.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/my-do.ts"),
        `export class MyClass { constructor(state: DurableObjectState) {} }`,
      );

      // Initial sync
      const result1 = await runCLI(["sync"], { cwd: tempDir });
      expect(result1.exitCode).toBe(0);

      // Remove DO from bindings without clarification
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {},
});
`,
      );

      // Step 4: Run sync - expect failure with helpful message
      const result2 = await runCLI(["sync"], { cwd: tempDir });
      expect(result2.exitCode).not.toBe(0);
      expect(result2.stderr).toContain("MyClass");
      expect(result2.stderr).toContain("_renamedFrom");
      expect(result2.stderr).toContain("_deletedDurableObjects");
    });
  });

  describe("complex migration scenarios", () => {
    it("handles v1: add A, v2: rename A->B + add C, v3: delete C", async () => {
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const doA = DurableObject({
  name: "DO_A",
  className: "ClassA",
  classPath: "./src/my-worker/a.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    DO_A: doA,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/a.ts"),
        `export class ClassA { constructor(state: DurableObjectState) {} }`,
      );

      // v1: Add ClassA
      const v1Result = await runCLI(["sync"], { cwd: tempDir });
      expect(v1Result.exitCode).toBe(0);

      // v2: Rename A->B and add C
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const doB = DurableObject({
  name: "DO_B",
  className: "ClassB",
  classPath: "./src/my-worker/a.ts",
});

const doC = DurableObject({
  name: "DO_C",
  className: "ClassC",
  classPath: "./src/my-worker/c.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    DO_B: doB,
    DO_C: doC,
  },
});
`,
      );

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/a.ts"),
        `export class ClassB { constructor(state: DurableObjectState) {} }`,
      );
      await fs.writeFile(
        path.join(tempDir, "src/my-worker/c.ts"),
        `export class ClassC { constructor(state: DurableObjectState) {} }`,
      );

      const v2Result = await runCLI(["sync"], { cwd: tempDir });
      expect(v2Result.exitCode).toBe(0);

      // v3: Delete C
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const doB = DurableObject({
  name: "DO_B",
  className: "ClassB",
  classPath: "./src/my-worker/a.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    DO_B: doB,
  },
  _deletedDurableObjects: ["ClassC"],
});
`,
      );

      const v3Result = await runCLI(["sync"], { cwd: tempDir });
      expect(v3Result.exitCode).toBe(0);

      // Verify final migrations
      const config = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config.migrations).toHaveLength(3);
      expect(config.migrations[0]).toEqual({ tag: "v1", new_sqlite_classes: ["ClassA"] });
      expect(config.migrations[1]).toEqual({
        tag: "v2",
        new_sqlite_classes: ["ClassC"],
        renamed_classes: [{ from: "ClassA", to: "ClassB" }],
      });
      expect(config.migrations[2]).toEqual({ tag: "v3", deleted_classes: ["ClassC"] });
    });

    it("handles multiple workers with independent migrations", async () => {
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const do1 = DurableObject({
  name: "DO_1",
  className: "Class1",
  classPath: "./src/worker-1/do1.ts",
});

const do2 = DurableObject({
  name: "DO_2",
  className: "Class2",
  classPath: "./src/worker-2/do2.ts",
});

export const worker1 = Worker({
  name: "worker-1",
  entryPoint: "./src/worker-1/index.ts",
  port: 8787,
  bindings: {
    DO_1: do1,
  },
});

export const worker2 = Worker({
  name: "worker-2",
  entryPoint: "./src/worker-2/index.ts",
  port: 8788,
  bindings: {
    DO_2: do2,
  },
});
`,
        workers: {
          "worker-1": `export default { fetch: () => new Response("1") };`,
          "worker-2": `export default { fetch: () => new Response("2") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/worker-1/do1.ts"),
        `export class Class1 { constructor(state: DurableObjectState) {} }`,
      );
      await fs.writeFile(
        path.join(tempDir, "src/worker-2/do2.ts"),
        `export class Class2 { constructor(state: DurableObjectState) {} }`,
      );

      // Initial sync
      const result1 = await runCLI(["sync"], { cwd: tempDir });
      expect(result1.exitCode).toBe(0);

      // Verify each worker has independent v1
      const config1 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/worker-1.wrangler.jsonc"),
      );
      const config2 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/worker-2.wrangler.jsonc"),
      );

      expect(config1.migrations).toEqual([{ tag: "v1", new_sqlite_classes: ["Class1"] }]);
      expect(config2.migrations).toEqual([{ tag: "v1", new_sqlite_classes: ["Class2"] }]);

      // Now rename only worker-1's DO
      await fs.writeFile(
        path.join(tempDir, "bw.config.ts"),
        `
import { Worker, DurableObject } from "${srcPath}";

const do1 = DurableObject({
  name: "DO_1",
  className: "Class1Renamed",
  classPath: "./src/worker-1/do1.ts",
});

const do2 = DurableObject({
  name: "DO_2",
  className: "Class2",
  classPath: "./src/worker-2/do2.ts",
});

export const worker1 = Worker({
  name: "worker-1",
  entryPoint: "./src/worker-1/index.ts",
  port: 8787,
  bindings: {
    DO_1: do1,
  },
});

export const worker2 = Worker({
  name: "worker-2",
  entryPoint: "./src/worker-2/index.ts",
  port: 8788,
  bindings: {
    DO_2: do2,
  },
});
`,
      );

      await fs.writeFile(
        path.join(tempDir, "src/worker-1/do1.ts"),
        `export class Class1Renamed { constructor(state: DurableObjectState) {} }`,
      );

      const result2 = await runCLI(["sync"], { cwd: tempDir });
      expect(result2.exitCode).toBe(0);

      // Worker-1 should have v2, worker-2 should still have only v1
      const config1v2 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/worker-1.wrangler.jsonc"),
      );
      const config2v2 = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/worker-2.wrangler.jsonc"),
      );

      expect(config1v2.migrations).toHaveLength(2);
      expect(config1v2.migrations[1]).toEqual({
        tag: "v2",
        renamed_classes: [{ from: "Class1", to: "Class1Renamed" }],
      });

      // Worker-2 unchanged
      expect(config2v2.migrations).toEqual([{ tag: "v1", new_sqlite_classes: ["Class2"] }]);
    });
  });

  describe("migration state persistence", () => {
    it("loads existing state from bw.migrations.json", async () => {
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "MyClass",
  classPath: "./src/my-worker/my-do.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/my-do.ts"),
        `export class MyClass { constructor(state: DurableObjectState) {} }`,
      );

      // Create pre-existing migrations state
      await fs.writeFile(
        path.join(tempDir, "bw.migrations.json"),
        JSON.stringify(
          {
            version: 1,
            workers: {
              "my-worker": {
                currentTag: 1,
                classes: {
                  MyClass: {
                    storage: "sqlite",
                    classPath: "./src/my-worker/my-do.ts",
                    addedInTag: 1,
                  },
                },
                history: [{ tag: "v1", new_sqlite_classes: ["MyClass"] }],
              },
            },
          },
          null,
          2,
        ),
      );

      // Run sync - should load existing state and not create new migration
      const result = await runCLI(["sync"], { cwd: tempDir });
      expect(result.exitCode).toBe(0);

      // Verify state was preserved (still v1, no v2)
      const config = JSON.parse(
        await readTempFile(tempDir, ".better-wrangler/my-worker.wrangler.jsonc"),
      );
      expect(config.migrations).toEqual([{ tag: "v1", new_sqlite_classes: ["MyClass"] }]);
    });

    it("preserves migration history across syncs", async () => {
      const tempDir = await createTempProject({
        config: `
import { Worker, DurableObject } from "${srcPath}";

const myDO = DurableObject({
  name: "MY_DO",
  className: "MyClass",
  classPath: "./src/my-worker/my-do.ts",
});

export const worker = Worker({
  name: "my-worker",
  entryPoint: "./src/my-worker/index.ts",
  port: 8787,
  bindings: {
    MY_DO: myDO,
  },
});
`,
        workers: {
          "my-worker": `export default { fetch: () => new Response("ok") };`,
        },
      });

      await fs.writeFile(
        path.join(tempDir, "src/my-worker/my-do.ts"),
        `export class MyClass { constructor(state: DurableObjectState) {} }`,
      );

      // First sync
      await runCLI(["sync"], { cwd: tempDir });

      // Second sync (no changes) - should preserve history
      await runCLI(["sync"], { cwd: tempDir });

      // Third sync (no changes) - should preserve history
      await runCLI(["sync"], { cwd: tempDir });

      const migrationState = JSON.parse(await readTempFile(tempDir, "bw.migrations.json"));
      expect(migrationState.workers["my-worker"].history).toHaveLength(1);
      expect(migrationState.workers["my-worker"].currentTag).toBe(1);
    });
  });
});
