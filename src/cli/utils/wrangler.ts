import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface WranglerDeployResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface WranglerMigrateResult {
  success: boolean;
  migrationsApplied?: number;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Check if wrangler is installed and accessible
 */
export async function checkWranglerInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("wrangler", ["--version"], {
      stdio: "pipe",
      shell: true,
    });

    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Run a wrangler command and stream output
 */
async function runWrangler(
  args: string[],
  options: {
    cwd?: string;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn("wrangler", args, {
      cwd: options.cwd || process.cwd(),
      stdio: "pipe",
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      const str = data.toString();
      stdout += str;
      if (options.onStdout) {
        options.onStdout(str);
      }
    });

    proc.stderr.on("data", (data) => {
      const str = data.toString();
      stderr += str;
      if (options.onStderr) {
        options.onStderr(str);
      }
    });

    proc.on("error", (err) => {
      resolve({ code: 1, stdout, stderr: stderr + err.message });
    });

    proc.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Deploy a worker using wrangler
 */
export async function wranglerDeploy(options: {
  configPath: string;
  env?: string;
  dryRun?: boolean;
  onOutput?: (data: string) => void;
}): Promise<WranglerDeployResult> {
  const args = ["deploy", "-c", options.configPath];

  if (options.env) {
    args.push("--env", options.env);
  }

  if (options.dryRun) {
    args.push("--dry-run");
  }

  const result = await runWrangler(args, {
    onStdout: options.onOutput,
    onStderr: options.onOutput,
  });

  if (result.code !== 0) {
    return {
      success: false,
      error: result.stderr || result.stdout || "Unknown error",
    };
  }

  // Try to extract the deployment URL from output
  // Wrangler outputs something like: "Published my-worker (0.50 sec)"
  // And the URL: "https://my-worker.username.workers.dev"
  const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.workers\.dev/);
  const url = urlMatch ? urlMatch[0] : undefined;

  return {
    success: true,
    url,
  };
}

/**
 * Run D1 migrations using wrangler
 */
export async function wranglerD1Migrate(options: {
  databaseName: string;
  migrationsDir?: string;
  env?: string;
  onOutput?: (data: string) => void;
}): Promise<WranglerMigrateResult> {
  const migrationsDir = options.migrationsDir || "./migrations";

  // Check if migrations directory exists
  if (!existsSync(migrationsDir)) {
    return {
      success: true,
      skipped: true,
      skipReason: `No migrations directory found at ${migrationsDir}`,
    };
  }

  const args = ["d1", "migrations", "apply", options.databaseName, "--remote"];

  if (options.env) {
    args.push("--env", options.env);
  }

  const result = await runWrangler(args, {
    onStdout: options.onOutput,
    onStderr: options.onOutput,
  });

  if (result.code !== 0) {
    return {
      success: false,
      error: result.stderr || result.stdout || "Unknown error",
    };
  }

  // Try to parse number of migrations applied
  // Wrangler outputs something like: "Migrations to be applied: ..."
  const migrationsMatch = result.stdout.match(/(\d+)\s+migration/i);
  const migrationsApplied = migrationsMatch ? parseInt(migrationsMatch[1], 10) : undefined;

  return {
    success: true,
    migrationsApplied,
  };
}

export interface D1DatabaseInfo {
  name: string;
  bindingName: string;
  migrationsDir: string;
  id?: string;
}

/**
 * Extract D1 database information from worker bindings
 */
export function extractD1Databases(bindings: Record<string, unknown>): D1DatabaseInfo[] {
  const databases: D1DatabaseInfo[] = [];

  for (const [bindingName, binding] of Object.entries(bindings)) {
    if (binding && typeof binding === "object" && "_type" in binding && binding._type === "D1") {
      const d1Binding = binding as unknown as {
        name: string;
        id?: string;
        migrationsDir?: string;
      };
      databases.push({
        name: d1Binding.name,
        bindingName,
        migrationsDir: d1Binding.migrationsDir || "./migrations",
        id: d1Binding.id,
      });
    }
  }

  return databases;
}
