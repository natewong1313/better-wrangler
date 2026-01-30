import * as fs from "fs";
import * as path from "path";
import type { DurableObjectBinding } from "./bindings/durable-object";

const MIGRATIONS_FILE = "bw.migrations.json";
const STATE_VERSION = 1;

export type WranglerMigration = {
  tag: string;
  new_sqlite_classes?: string[];
  new_classes?: string[];
  renamed_classes?: Array<{ from: string; to: string }>;
  deleted_classes?: string[];
};

type DOClassState = {
  storage: "sqlite" | "kv";
  classPath: string;
  addedInTag: number;
};

type WorkerMigrationState = {
  currentTag: number;
  classes: Record<string, DOClassState>;
  history: WranglerMigration[];
};

export type MigrationState = {
  version: number;
  workers: Record<string, WorkerMigrationState>;
};

export type MigrationErrorType =
  | "ambiguous_removal"
  | "duplicate_rename_source"
  | "rename_to_existing_class"
  | "storage_type_change"
  | "rename_delete_conflict";

export type MigrationError = {
  type: MigrationErrorType;
  className: string;
  message: string;
};

export type MigrationWarning = {
  type: "rename_source_not_found";
  className: string;
  message: string;
};

export type ComputeMigrationsResult = {
  migrations: WranglerMigration[];
  updatedState: MigrationState;
  errors: MigrationError[];
  warnings: MigrationWarning[];
};

type DOInfo = {
  className: string;
  classPath: string;
  storage: "sqlite" | "kv";
  _renamedFrom?: string;
};

function createEmptyState(): MigrationState {
  return {
    version: STATE_VERSION,
    workers: {},
  };
}

function createEmptyWorkerState(): WorkerMigrationState {
  return {
    currentTag: 0,
    classes: {},
    history: [],
  };
}

export function loadMigrationState(projectRoot: string) {
  const filePath = path.join(projectRoot, MIGRATIONS_FILE);

  if (!fs.existsSync(filePath)) {
    return createEmptyState();
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as MigrationState;
}

export function saveMigrationState(projectRoot: string, state: MigrationState) {
  const filePath = path.join(projectRoot, MIGRATIONS_FILE);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n");
}

function detectChanges(
  current: Map<string, DOInfo>,
  stored: Map<string, DOInfo>,
  explicitRenames: Map<string, string>, // newName -> oldName from _renamedFrom
  explicitDeletes: Set<string>,
) {
  const added: DOInfo[] = [];
  const removed: string[] = [];
  const renames: Array<{ from: string; to: string }> = [];
  const ambiguous: string[] = [];

  // Build classPath -> className maps for rename detection
  const currentByPath = new Map<string, string>();
  for (const [className, info] of current) {
    currentByPath.set(info.classPath, className);
  }

  const storedByPath = new Map<string, string>();
  for (const [className, info] of stored) {
    storedByPath.set(info.classPath, className);
  }

  // Track which stored classes have been accounted for
  const accountedFor = new Set<string>();

  // First, handle explicit renames
  for (const [newName, oldName] of explicitRenames) {
    if (stored.has(oldName)) {
      renames.push({ from: oldName, to: newName });
      accountedFor.add(oldName);
    }
  }

  // Then, handle explicit deletes
  for (const deletedClass of explicitDeletes) {
    if (stored.has(deletedClass) && !accountedFor.has(deletedClass)) {
      removed.push(deletedClass);
      accountedFor.add(deletedClass);
    }
  }

  // Check for removed classes (in stored but not in current)
  for (const [storedName, storedInfo] of stored) {
    if (accountedFor.has(storedName)) continue;
    if (current.has(storedName)) continue; // Still exists

    // Check if same path exists with different name (auto-detect rename)
    const newName = currentByPath.get(storedInfo.classPath);
    if (newName && !stored.has(newName) && !explicitRenames.has(newName)) {
      // Same file path, different class name = rename
      renames.push({ from: storedName, to: newName });
      accountedFor.add(storedName);
    } else {
      // Can't determine - ambiguous
      ambiguous.push(storedName);
    }
  }

  // Check for new classes (in current but not in stored, and not a rename target)
  const renameTargets = new Set(renames.map((r) => r.to));
  for (const [currentName, info] of current) {
    if (!stored.has(currentName) && !renameTargets.has(currentName)) {
      added.push(info);
    }
  }

  return { added, removed, renames, ambiguous };
}

export function computeMigrations(
  workerName: string,
  currentDOs: DurableObjectBinding[],
  state: MigrationState,
  deletedDurableObjects: string[] = [],
): ComputeMigrationsResult {
  // Build current DO map
  const current = new Map<string, DOInfo>();
  const explicitRenames = new Map<string, string>(); // newName -> oldName

  for (const doBind of currentDOs) {
    current.set(doBind.className, {
      className: doBind.className,
      classPath: doBind.classPath,
      storage: doBind.storage,
      _renamedFrom: doBind._renamedFrom,
    });

    if (doBind._renamedFrom) {
      explicitRenames.set(doBind.className, doBind._renamedFrom);
    }
  }

  // Get stored state for this worker
  const workerState = state.workers[workerName] ?? createEmptyWorkerState();
  const stored = new Map<string, DOInfo>();

  for (const [className, classState] of Object.entries(workerState.classes)) {
    stored.set(className, {
      className,
      classPath: classState.classPath,
      storage: classState.storage,
    });
  }

  const errors: MigrationError[] = [];
  const warnings: MigrationWarning[] = [];
  const explicitDeletes = new Set(deletedDurableObjects);

  // === VALIDATION 1: Check for duplicate _renamedFrom sources ===
  const renameSourceCounts = new Map<string, string[]>(); // oldName -> [newNames that claim it]
  for (const [newName, oldName] of explicitRenames) {
    const existing = renameSourceCounts.get(oldName) ?? [];
    existing.push(newName);
    renameSourceCounts.set(oldName, existing);
  }
  for (const [oldName, newNames] of renameSourceCounts) {
    if (newNames.length > 1) {
      errors.push({
        type: "duplicate_rename_source",
        className: oldName,
        message:
          `Multiple classes claim to be renamed from '${oldName}': ${newNames.join(", ")}. ` +
          `Each class can only be renamed once.`,
      });
    }
  }

  // === VALIDATION 2: Check for _renamedFrom pointing to non-existent class ===
  for (const [newName, oldName] of explicitRenames) {
    if (!stored.has(oldName)) {
      warnings.push({
        type: "rename_source_not_found",
        className: newName,
        message:
          `Class '${newName}' has '_renamedFrom: "${oldName}"' but '${oldName}' does not exist in migration state. ` +
          `The _renamedFrom will be ignored.`,
      });
    }
  }

  // === VALIDATION 3: Check for rename to existing class name ===
  for (const [newName, oldName] of explicitRenames) {
    // If the new name already exists in stored state AND it's not the same as oldName
    if (stored.has(newName) && newName !== oldName) {
      errors.push({
        type: "rename_to_existing_class",
        className: newName,
        message:
          `Cannot rename '${oldName}' to '${newName}' because '${newName}' already exists. ` +
          `Delete the existing class first or choose a different name.`,
      });
    }
  }

  // === VALIDATION 4: Check for storage type change during rename ===
  for (const [newName, oldName] of explicitRenames) {
    const storedInfo = stored.get(oldName);
    const currentInfo = current.get(newName);
    if (storedInfo && currentInfo && storedInfo.storage !== currentInfo.storage) {
      errors.push({
        type: "storage_type_change",
        className: newName,
        message:
          `Cannot change storage type during rename from '${oldName}' to '${newName}'. ` +
          `Storage was '${storedInfo.storage}' but is now '${currentInfo.storage}'. ` +
          `Cloudflare does not support changing storage backends for existing Durable Object classes.`,
      });
    }
  }

  // === VALIDATION 5: Check for conflict between rename and delete ===
  for (const [_newName, oldName] of explicitRenames) {
    if (explicitDeletes.has(oldName)) {
      errors.push({
        type: "rename_delete_conflict",
        className: oldName,
        message:
          `Class '${oldName}' is both marked for rename and deletion. ` +
          `Remove it from either '_renamedFrom' or 'deletedDurableObjects'.`,
      });
    }
  }

  // Return early if there are validation errors
  if (errors.length > 0) {
    return {
      migrations: workerState.history,
      updatedState: state,
      errors,
      warnings,
    };
  }

  // Detect changes
  const { added, removed, renames, ambiguous } = detectChanges(
    current,
    stored,
    explicitRenames,
    explicitDeletes,
  );

  // Check for ambiguous cases - return errors
  for (const className of ambiguous) {
    errors.push({
      type: "ambiguous_removal",
      className,
      message:
        `Cannot determine if '${className}' was renamed or deleted. ` +
        `If renamed, add '_renamedFrom: "${className}"' to the new DurableObject binding. ` +
        `If deleted, add '_deletedDurableObjects: ["${className}"]' to the Worker config.`,
    });
  }

  if (errors.length > 0) {
    return {
      migrations: workerState.history,
      updatedState: state,
      errors,
      warnings,
    };
  }

  // Check if there are any changes
  const hasChanges = added.length > 0 || removed.length > 0 || renames.length > 0;

  if (!hasChanges && workerState.history.length > 0) {
    // No changes, return existing migrations
    return {
      migrations: workerState.history,
      updatedState: state,
      errors: [],
      warnings,
    };
  }

  // Build new migration if there are changes (or this is a fresh worker)
  const newTag = workerState.currentTag + 1;
  const newMigration: WranglerMigration = { tag: `v${newTag}` };

  // Separate added classes by storage type
  const sqliteClasses = added.filter((d) => d.storage === "sqlite").map((d) => d.className);
  const kvClasses = added.filter((d) => d.storage === "kv").map((d) => d.className);

  if (sqliteClasses.length > 0) {
    newMigration.new_sqlite_classes = sqliteClasses;
  }
  if (kvClasses.length > 0) {
    newMigration.new_classes = kvClasses;
  }
  if (renames.length > 0) {
    newMigration.renamed_classes = renames;
  }
  if (removed.length > 0) {
    newMigration.deleted_classes = removed;
  }

  // Only add migration if it has content
  const hasMigrationContent =
    sqliteClasses.length > 0 || kvClasses.length > 0 || renames.length > 0 || removed.length > 0;

  // Update state
  const updatedWorkerState: WorkerMigrationState = {
    currentTag: hasMigrationContent ? newTag : workerState.currentTag,
    classes: {},
    history: hasMigrationContent ? [...workerState.history, newMigration] : workerState.history,
  };

  // Update classes in state
  // Keep existing classes that weren't removed or renamed
  for (const [className, classState] of Object.entries(workerState.classes)) {
    const wasRemoved = removed.includes(className);
    const wasRenamed = renames.some((r) => r.from === className);
    if (!wasRemoved && !wasRenamed) {
      updatedWorkerState.classes[className] = classState;
    }
  }

  // Add renamed classes with their new names
  for (const rename of renames) {
    const oldState = workerState.classes[rename.from];
    const currentInfo = current.get(rename.to);
    if (oldState && currentInfo) {
      updatedWorkerState.classes[rename.to] = {
        storage: currentInfo.storage,
        classPath: currentInfo.classPath,
        addedInTag: oldState.addedInTag, // Keep original tag
      };
    }
  }

  // Add new classes
  for (const addedDO of added) {
    updatedWorkerState.classes[addedDO.className] = {
      storage: addedDO.storage,
      classPath: addedDO.classPath,
      addedInTag: newTag,
    };
  }

  const updatedState: MigrationState = {
    ...state,
    workers: {
      ...state.workers,
      [workerName]: updatedWorkerState,
    },
  };

  return {
    migrations: updatedWorkerState.history,
    updatedState,
    errors: [],
    warnings,
  };
}

export class MigrationValidationError extends Error {
  constructor(public errors: MigrationError[]) {
    const messages = errors.map((e) => `  - ${e.message}`).join("\n");
    super(`Migration validation failed:\n${messages}`);
    this.name = "MigrationValidationError";
  }
}
