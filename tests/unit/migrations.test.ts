import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
	loadMigrationState,
	saveMigrationState,
	computeMigrations,
	MigrationValidationError,
	type MigrationState,
} from "../../src/migrations";
import { DurableObject } from "../../src/bindings/durable-object";

describe("migrations", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	describe("loadMigrationState", () => {
		it("returns empty state when file does not exist", () => {
			const state = loadMigrationState(tempDir);

			expect(state).toEqual({
				version: 1,
				workers: {},
			});
		});

		it("loads existing state from file", () => {
			const existingState: MigrationState = {
				version: 1,
				workers: {
					"my-worker": {
						currentTag: 2,
						classes: {
							MyDO: {
								storage: "sqlite",
								classPath: "./src/my-do.ts",
								addedInTag: 1,
							},
						},
						history: [
							{ tag: "v1", new_sqlite_classes: ["MyDO"] },
							{ tag: "v2", new_sqlite_classes: ["OtherDO"] },
						],
					},
				},
			};

			fs.writeFileSync(
				path.join(tempDir, "bw.migrations.json"),
				JSON.stringify(existingState),
			);

			const state = loadMigrationState(tempDir);

			expect(state).toEqual(existingState);
		});
	});

	describe("saveMigrationState", () => {
		it("writes state to file", () => {
			const state: MigrationState = {
				version: 1,
				workers: {
					"my-worker": {
						currentTag: 1,
						classes: {
							MyDO: {
								storage: "sqlite",
								classPath: "./src/my-do.ts",
								addedInTag: 1,
							},
						},
						history: [{ tag: "v1", new_sqlite_classes: ["MyDO"] }],
					},
				},
			};

			saveMigrationState(tempDir, state);

			const content = fs.readFileSync(
				path.join(tempDir, "bw.migrations.json"),
				"utf-8",
			);
			expect(JSON.parse(content)).toEqual(state);
		});
	});

	describe("computeMigrations", () => {
		describe("fresh project", () => {
			it("creates v1 migration with new_sqlite_classes for sqlite DOs", () => {
				const state: MigrationState = { version: 1, workers: {} };
				const dos = [
					createDO("MyDO", "./src/my-do.ts", "sqlite"),
					createDO("OtherDO", "./src/other-do.ts", "sqlite"),
				];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toEqual([
					{ tag: "v1", new_sqlite_classes: ["MyDO", "OtherDO"] },
				]);
				expect(result.updatedState.workers["my-worker"].currentTag).toBe(1);
				expect(result.updatedState.workers["my-worker"].classes).toHaveProperty(
					"MyDO",
				);
				expect(result.updatedState.workers["my-worker"].classes).toHaveProperty(
					"OtherDO",
				);
			});

			it("creates v1 migration with new_classes for kv DOs", () => {
				const state: MigrationState = { version: 1, workers: {} };
				const dos = [createDO("MyDO", "./src/my-do.ts", "kv")];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toEqual([{ tag: "v1", new_classes: ["MyDO"] }]);
			});

			it("separates sqlite and kv DOs in same migration", () => {
				const state: MigrationState = { version: 1, workers: {} };
				const dos = [
					createDO("SqliteDO", "./src/sqlite-do.ts", "sqlite"),
					createDO("KvDO", "./src/kv-do.ts", "kv"),
				];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toEqual([
					{
						tag: "v1",
						new_sqlite_classes: ["SqliteDO"],
						new_classes: ["KvDO"],
					},
				]);
			});
		});

		describe("adding new DOs", () => {
			it("creates v2 migration when adding a DO to existing worker", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								ExistingDO: {
									storage: "sqlite",
									classPath: "./src/existing.ts",
									addedInTag: 1,
								},
							},
							history: [{ tag: "v1", new_sqlite_classes: ["ExistingDO"] }],
						},
					},
				};
				const dos = [
					createDO("ExistingDO", "./src/existing.ts", "sqlite"),
					createDO("NewDO", "./src/new.ts", "sqlite"),
				];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toHaveLength(2);
				expect(result.migrations[0]).toEqual({
					tag: "v1",
					new_sqlite_classes: ["ExistingDO"],
				});
				expect(result.migrations[1]).toEqual({
					tag: "v2",
					new_sqlite_classes: ["NewDO"],
				});
				expect(result.updatedState.workers["my-worker"].currentTag).toBe(2);
			});
		});

		describe("no changes", () => {
			it("returns existing migrations when no changes", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								MyDO: {
									storage: "sqlite",
									classPath: "./src/my-do.ts",
									addedInTag: 1,
								},
							},
							history: [{ tag: "v1", new_sqlite_classes: ["MyDO"] }],
						},
					},
				};
				const dos = [createDO("MyDO", "./src/my-do.ts", "sqlite")];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toEqual([
					{ tag: "v1", new_sqlite_classes: ["MyDO"] },
				]);
				expect(result.updatedState.workers["my-worker"].currentTag).toBe(1);
			});
		});

		describe("rename detection", () => {
			it("auto-detects rename when classPath is the same", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								OldName: {
									storage: "sqlite",
									classPath: "./src/my-do.ts",
									addedInTag: 1,
								},
							},
							history: [{ tag: "v1", new_sqlite_classes: ["OldName"] }],
						},
					},
				};
				// Same classPath, different className
				const dos = [createDO("NewName", "./src/my-do.ts", "sqlite")];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toHaveLength(2);
				expect(result.migrations[1]).toEqual({
					tag: "v2",
					renamed_classes: [{ from: "OldName", to: "NewName" }],
				});
			});

			it("uses explicit _renamedFrom when provided", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								OldName: {
									storage: "sqlite",
									classPath: "./src/old-path.ts",
									addedInTag: 1,
								},
							},
							history: [{ tag: "v1", new_sqlite_classes: ["OldName"] }],
						},
					},
				};
				// Different classPath, but explicit _renamedFrom
				const doBind = DurableObject({
					name: "MY_DO",
					className: "NewName",
					classPath: "./src/new-path.ts",
					_renamedFrom: "OldName",
				});

				const result = computeMigrations("my-worker", [doBind], state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toHaveLength(2);
				expect(result.migrations[1]).toEqual({
					tag: "v2",
					renamed_classes: [{ from: "OldName", to: "NewName" }],
				});
			});
		});

		describe("deletion", () => {
			it("creates delete migration when explicit delete is provided", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								ToDelete: {
									storage: "sqlite",
									classPath: "./src/to-delete.ts",
									addedInTag: 1,
								},
								ToKeep: {
									storage: "sqlite",
									classPath: "./src/to-keep.ts",
									addedInTag: 1,
								},
							},
							history: [
								{ tag: "v1", new_sqlite_classes: ["ToDelete", "ToKeep"] },
							],
						},
					},
				};
				// Only ToKeep remains, ToDelete explicitly deleted
				const dos = [createDO("ToKeep", "./src/to-keep.ts", "sqlite")];

				const result = computeMigrations("my-worker", dos, state, ["ToDelete"]);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toHaveLength(2);
				expect(result.migrations[1]).toEqual({
					tag: "v2",
					deleted_classes: ["ToDelete"],
				});
			});
		});

		describe("ambiguous removal", () => {
			it("returns error when class is removed without explicit delete or rename", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"my-worker": {
							currentTag: 1,
							classes: {
								RemovedDO: {
									storage: "sqlite",
									classPath: "./src/removed.ts",
									addedInTag: 1,
								},
							},
							history: [{ tag: "v1", new_sqlite_classes: ["RemovedDO"] }],
						},
					},
				};
				// Class removed, no explicit delete, no matching path
				const dos = [createDO("DifferentDO", "./src/different.ts", "sqlite")];

				const result = computeMigrations("my-worker", dos, state);

				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].type).toBe("ambiguous_removal");
				expect(result.errors[0].className).toBe("RemovedDO");
			});
		});

		describe("multiple workers", () => {
			it("tracks migrations independently per worker", () => {
				const state: MigrationState = {
					version: 1,
					workers: {
						"worker-1": {
							currentTag: 2,
							classes: {
								Worker1DO: {
									storage: "sqlite",
									classPath: "./src/w1.ts",
									addedInTag: 1,
								},
							},
							history: [
								{ tag: "v1", new_sqlite_classes: ["Worker1DO"] },
								{ tag: "v2", new_sqlite_classes: ["AnotherDO"] },
							],
						},
					},
				};

				const dos = [createDO("Worker2DO", "./src/w2.ts", "sqlite")];
				const result = computeMigrations("worker-2", dos, state);

				expect(result.errors).toEqual([]);
				expect(result.migrations).toEqual([
					{ tag: "v1", new_sqlite_classes: ["Worker2DO"] },
				]);
				expect(result.updatedState.workers["worker-1"].currentTag).toBe(2);
				expect(result.updatedState.workers["worker-2"].currentTag).toBe(1);
			});
		});
	});

	describe("MigrationValidationError", () => {
		it("formats error message with all errors", () => {
			const error = new MigrationValidationError([
				{
					type: "ambiguous_removal",
					className: "DO1",
					message: "Cannot determine if DO1 was renamed or deleted",
				},
				{
					type: "ambiguous_removal",
					className: "DO2",
					message: "Cannot determine if DO2 was renamed or deleted",
				},
			]);

			expect(error.message).toContain("Migration validation failed");
			expect(error.message).toContain("DO1");
			expect(error.message).toContain("DO2");
			expect(error.errors).toHaveLength(2);
		});
	});
});

function createDO(className: string, classPath: string, storage: "sqlite" | "kv") {
	const binding = DurableObject({
		name: className.toUpperCase(),
		className,
		classPath,
		storage,
	});
	// Simulate ownership assignment (normally done by Worker factory)
	binding._owner = "my-worker";
	return binding;
}
