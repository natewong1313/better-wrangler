import type { Miniflare } from "miniflare";
import type { Bindings } from "../types";
import type { WorkerConfig } from "../../bindings/worker";
import type { D1Binding } from "../../bindings/d1";
import { createLogger } from "../../logger";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const log = createLogger("migrations");

/**
 * D1 database info extracted from worker bindings.
 */
interface D1DatabaseInfo {
  bindingName: string;
  databaseName: string;
  workerName: string;
  migrationsDir: string;
}

/**
 * Migration file info.
 */
interface MigrationFile {
  name: string;
  sql: string;
}

/**
 * Check if a binding is a D1 binding.
 */
function isD1Binding(binding: unknown): binding is D1Binding {
  return (
    typeof binding === "object" &&
    binding !== null &&
    "_type" in binding &&
    (binding as { _type: string })._type === "D1"
  );
}

/**
 * Extract D1 databases from workers, deduplicated by database name.
 * First worker wins for migrationsDir when multiple workers share a database.
 */
function extractD1Databases(
  workers: WorkerConfig<Bindings, Record<string, string>>[],
): D1DatabaseInfo[] {
  const databases = new Map<string, D1DatabaseInfo>();

  for (const worker of workers) {
    for (const [bindingName, binding] of Object.entries(worker.bindings)) {
      if (isD1Binding(binding)) {
        const dbName = binding.name;
        // First worker wins (same logic as deploy.ts)
        if (!databases.has(dbName)) {
          databases.set(dbName, {
            bindingName,
            databaseName: dbName,
            workerName: worker.name,
            migrationsDir: binding.migrationsDir ?? "./migrations",
          });
        }
      }
    }
  }

  return Array.from(databases.values());
}

/**
 * Read migration files from a directory.
 * Returns files sorted by name (0001_xxx.sql, 0002_xxx.sql, etc.)
 */
async function readMigrationFiles(
  migrationsDir: string,
  baseDir: string,
): Promise<MigrationFile[]> {
  const fullPath = join(baseDir, migrationsDir);

  if (!existsSync(fullPath)) {
    return [];
  }

  const files = await readdir(fullPath);
  const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

  const migrations: MigrationFile[] = [];

  for (const file of sqlFiles) {
    const sql = await readFile(join(fullPath, file), "utf-8");
    migrations.push({
      name: file,
      sql,
    });
  }

  return migrations;
}

/**
 * Split SQL into individual statements.
 * Handles comments and semicolons inside strings properly.
 */
function splitSqlStatements(sql: string): string[] {
  // Remove SQL comments
  const withoutComments = sql
    .replace(/--.*$/gm, "") // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // Multi-line comments

  // Split by semicolons, but be careful about empty statements
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply D1 migrations in dev mode.
 * Creates a d1_migrations table to track applied migrations.
 */
export async function applyDevMigrations(
  mf: Miniflare,
  workers: WorkerConfig<Bindings, Record<string, string>>[],
  baseDir: string = process.cwd(),
): Promise<void> {
  const databases = extractD1Databases(workers);

  if (databases.length === 0) {
    return;
  }

  for (const { bindingName, databaseName, workerName, migrationsDir } of databases) {
    try {
      const db = await mf.getD1Database(bindingName, workerName);

      // Create migrations tracking table if it doesn't exist
      // Use prepare().run() instead of exec() for better Miniflare compatibility
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS d1_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT DEFAULT CURRENT_TIMESTAMP
          )`,
        )
        .run();

      // Read migration files
      const migrations = await readMigrationFiles(migrationsDir, baseDir);

      if (migrations.length === 0) {
        log.debug(`No migrations found for ${databaseName} in ${migrationsDir}`);
        continue;
      }

      // Get already applied migrations
      const applied = await db.prepare("SELECT name FROM d1_migrations").all();
      const appliedSet = new Set((applied.results as Array<{ name: string }>).map((r) => r.name));

      // Apply pending migrations
      let appliedCount = 0;
      for (const migration of migrations) {
        if (!appliedSet.has(migration.name)) {
          log.info(`[${databaseName}] Applying migration: ${migration.name}`);
          try {
            // Split SQL into individual statements and execute each
            const statements = splitSqlStatements(migration.sql);
            for (const stmt of statements) {
              await db.prepare(stmt).run();
            }
            await db
              .prepare("INSERT INTO d1_migrations (name) VALUES (?)")
              .bind(migration.name)
              .run();
            appliedCount++;
          } catch (err) {
            log.error(`[${databaseName}] Migration failed: ${migration.name}`, err);
            throw err;
          }
        }
      }

      if (appliedCount > 0) {
        log.info(`[${databaseName}] Applied ${appliedCount} migration(s)`);
      } else {
        log.debug(`[${databaseName}] All migrations already applied`);
      }
    } catch (err) {
      log.error(`Failed to apply migrations for ${databaseName}:`, err);
      // Don't throw - let dev server continue even if migrations fail
    }
  }
}
