import { spawn } from "child_process";

export interface ResourceInfo {
  bindingName: string;
  name: string;
  existingId?: string;
}

export interface MissingResources {
  kv: ResourceInfo[];
  d1: ResourceInfo[];
  r2: ResourceInfo[];
  queues: ResourceInfo[];
}

export interface CreatedResource {
  type: "kv" | "d1" | "r2" | "queue";
  bindingName: string;
  name: string;
  id?: string;
}

interface WranglerResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Run a wrangler command and capture output
 */
async function runWrangler(args: string[], env?: string): Promise<WranglerResult> {
  const fullArgs = env ? [...args, "--env", env] : args;

  return new Promise((resolve) => {
    const proc = spawn("wrangler", fullArgs, {
      stdio: "pipe",
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
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
 * Parse JSON output from wrangler, handling potential non-JSON prefix
 */
function parseWranglerJson<T>(output: string): T | null {
  try {
    // Wrangler sometimes outputs warnings before JSON, try to find JSON array/object
    const jsonMatch = output.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(output);
  } catch {
    return null;
  }
}

// ============================================================================
// KV Namespace
// ============================================================================

interface KvNamespace {
  id: string;
  title: string;
}

/**
 * List all KV namespaces
 */
export async function listKvNamespaces(env?: string): Promise<KvNamespace[]> {
  // Note: wrangler kv namespace list outputs JSON by default (no --json flag needed)
  const result = await runWrangler(["kv", "namespace", "list"], env);
  if (result.code !== 0) {
    return [];
  }
  return parseWranglerJson<KvNamespace[]>(result.stdout) || [];
}

/**
 * Check if a KV namespace exists by name
 * @returns namespace ID if exists, null if not
 */
export async function checkKvNamespaceExists(name: string, env?: string): Promise<string | null> {
  const namespaces = await listKvNamespaces(env);
  const found = namespaces.find((ns) => ns.title === name);
  return found?.id || null;
}

/**
 * Create a KV namespace
 * @returns the new namespace ID
 */
export async function createKvNamespace(
  name: string,
  env?: string,
  onOutput?: (msg: string) => void,
): Promise<string> {
  const result = await runWrangler(["kv", "namespace", "create", name], env);

  if (onOutput) {
    if (result.stdout) onOutput(result.stdout);
    if (result.stderr) onOutput(result.stderr);
  }

  if (result.code !== 0) {
    throw new Error(`Failed to create KV namespace "${name}": ${result.stderr || result.stdout}`);
  }

  // Parse the ID from output like: "Add the following to your configuration file..."
  // or look for the id in the output
  const idMatch = result.stdout.match(/id\s*=\s*"([^"]+)"/);
  if (idMatch) {
    return idMatch[1];
  }

  // Try alternative format
  const altMatch = result.stdout.match(/([a-f0-9]{32})/);
  if (altMatch) {
    return altMatch[1];
  }

  throw new Error(`Created KV namespace "${name}" but could not parse ID from output`);
}

// ============================================================================
// D1 Database
// ============================================================================

interface D1Database {
  uuid: string;
  name: string;
}

/**
 * List all D1 databases
 */
export async function listD1Databases(env?: string): Promise<D1Database[]> {
  const result = await runWrangler(["d1", "list", "--json"], env);
  if (result.code !== 0) {
    return [];
  }
  return parseWranglerJson<D1Database[]>(result.stdout) || [];
}

/**
 * Check if a D1 database exists by name
 * @returns database UUID if exists, null if not
 */
export async function checkD1DatabaseExists(name: string, env?: string): Promise<string | null> {
  const databases = await listD1Databases(env);
  const found = databases.find((db) => db.name === name);
  return found?.uuid || null;
}

/**
 * Create a D1 database
 * @returns the new database UUID
 */
export async function createD1Database(
  name: string,
  env?: string,
  onOutput?: (msg: string) => void,
): Promise<string> {
  const result = await runWrangler(["d1", "create", name], env);

  if (onOutput) {
    if (result.stdout) onOutput(result.stdout);
    if (result.stderr) onOutput(result.stderr);
  }

  if (result.code !== 0) {
    throw new Error(`Failed to create D1 database "${name}": ${result.stderr || result.stdout}`);
  }

  // Parse the UUID from output
  const idMatch = result.stdout.match(/database_id\s*=\s*"([^"]+)"/);
  if (idMatch) {
    return idMatch[1];
  }

  // Try UUID pattern
  const uuidMatch = result.stdout.match(/([a-f0-9-]{36})/);
  if (uuidMatch) {
    return uuidMatch[1];
  }

  throw new Error(`Created D1 database "${name}" but could not parse UUID from output`);
}

// ============================================================================
// R2 Bucket
// ============================================================================

interface R2Bucket {
  name: string;
  creation_date: string;
}

/**
 * List all R2 buckets
 */
export async function listR2Buckets(env?: string): Promise<R2Bucket[]> {
  // Note: wrangler r2 bucket list does NOT support --json, outputs plain text
  const result = await runWrangler(["r2", "bucket", "list"], env);
  if (result.code !== 0) {
    return [];
  }

  // Parse output format:
  // name:           bucket-name
  // creation_date:  2024-02-14T13:37:39.395Z
  const buckets: R2Bucket[] = [];
  const lines = result.stdout.split("\n");
  let currentBucket: Partial<R2Bucket> = {};

  for (const line of lines) {
    const nameMatch = line.match(/^name:\s+(.+)$/);
    const dateMatch = line.match(/^creation_date:\s+(.+)$/);

    if (nameMatch) {
      currentBucket.name = nameMatch[1].trim();
    } else if (dateMatch) {
      currentBucket.creation_date = dateMatch[1].trim();
      if (currentBucket.name) {
        buckets.push(currentBucket as R2Bucket);
        currentBucket = {};
      }
    }
  }

  return buckets;
}

/**
 * Check if an R2 bucket exists by name
 */
export async function checkR2BucketExists(name: string, env?: string): Promise<boolean> {
  const buckets = await listR2Buckets(env);
  return buckets.some((b) => b.name === name);
}

/**
 * Create an R2 bucket
 */
export async function createR2Bucket(
  name: string,
  env?: string,
  onOutput?: (msg: string) => void,
): Promise<void> {
  const result = await runWrangler(["r2", "bucket", "create", name], env);

  if (onOutput) {
    if (result.stdout) onOutput(result.stdout);
    if (result.stderr) onOutput(result.stderr);
  }

  if (result.code !== 0) {
    throw new Error(`Failed to create R2 bucket "${name}": ${result.stderr || result.stdout}`);
  }
}

// ============================================================================
// Queues
// ============================================================================

interface Queue {
  queue_id: string;
  queue_name: string;
}

/**
 * List all queues
 */
export async function listQueues(env?: string): Promise<Queue[]> {
  // Note: wrangler queues list does NOT support --json, outputs a table
  const result = await runWrangler(["queues", "list"], env);
  if (result.code !== 0) {
    return [];
  }

  // Parse table output format:
  // │ id                               │ name                                │ ...
  const queues: Queue[] = [];
  const lines = result.stdout.split("\n");

  for (const line of lines) {
    // Skip header and separator lines
    if (line.includes("──") || line.includes("id") || !line.includes("│")) {
      continue;
    }

    // Parse: │ id │ name │ ... │
    const cells = line
      .split("│")
      .map((c) => c.trim())
      .filter((c) => c);
    if (cells.length >= 2) {
      const id = cells[0];
      const name = cells[1];
      // Validate it looks like a queue ID (32 hex chars)
      if (/^[a-f0-9]{32}$/.test(id)) {
        queues.push({ queue_id: id, queue_name: name });
      }
    }
  }

  return queues;
}

/**
 * Check if a queue exists by name
 */
export async function checkQueueExists(name: string, env?: string): Promise<boolean> {
  const queues = await listQueues(env);
  return queues.some((q) => q.queue_name === name);
}

/**
 * Create a queue
 */
export async function createQueue(
  name: string,
  env?: string,
  onOutput?: (msg: string) => void,
): Promise<void> {
  const result = await runWrangler(["queues", "create", name], env);

  if (onOutput) {
    if (result.stdout) onOutput(result.stdout);
    if (result.stderr) onOutput(result.stderr);
  }

  if (result.code !== 0) {
    throw new Error(`Failed to create queue "${name}": ${result.stderr || result.stdout}`);
  }
}

// ============================================================================
// Extraction from Worker Bindings
// ============================================================================

/**
 * Extract KV bindings from a worker's bindings object
 */
export function extractKvBindings(bindings: Record<string, unknown>): ResourceInfo[] {
  const result: ResourceInfo[] = [];

  for (const [bindingName, binding] of Object.entries(bindings)) {
    if (binding && typeof binding === "object" && "_type" in binding && binding._type === "KV") {
      const kvBinding = binding as unknown as { name: string; id?: string };
      result.push({
        bindingName,
        name: kvBinding.name,
        existingId: kvBinding.id,
      });
    }
  }

  return result;
}

/**
 * Extract D1 bindings from a worker's bindings object
 */
export function extractD1Bindings(bindings: Record<string, unknown>): ResourceInfo[] {
  const result: ResourceInfo[] = [];

  for (const [bindingName, binding] of Object.entries(bindings)) {
    if (binding && typeof binding === "object" && "_type" in binding && binding._type === "D1") {
      const d1Binding = binding as unknown as { name: string; id?: string };
      result.push({
        bindingName,
        name: d1Binding.name,
        existingId: d1Binding.id,
      });
    }
  }

  return result;
}

/**
 * Extract R2 bindings from a worker's bindings object
 */
export function extractR2Bindings(bindings: Record<string, unknown>): ResourceInfo[] {
  const result: ResourceInfo[] = [];

  for (const [bindingName, binding] of Object.entries(bindings)) {
    if (binding && typeof binding === "object" && "_type" in binding && binding._type === "R2") {
      const r2Binding = binding as unknown as { name: string };
      result.push({
        bindingName,
        name: r2Binding.name,
      });
    }
  }

  return result;
}

/**
 * Extract Queue Producer bindings from a worker's bindings object
 */
export function extractQueueBindings(bindings: Record<string, unknown>): ResourceInfo[] {
  const result: ResourceInfo[] = [];

  for (const [bindingName, binding] of Object.entries(bindings)) {
    if (
      binding &&
      typeof binding === "object" &&
      "_type" in binding &&
      binding._type === "QueueProducer"
    ) {
      const queueBinding = binding as unknown as { queue: string };
      result.push({
        bindingName,
        name: queueBinding.queue,
      });
    }
  }

  return result;
}

// ============================================================================
// High-Level Functions
// ============================================================================

/**
 * Find all missing resources across all workers
 */
export async function findMissingResources(
  workers: Array<{ name: string; bindings?: Record<string, unknown> }>,
  env?: string,
  onProgress?: (message: string) => void,
): Promise<MissingResources> {
  const missing: MissingResources = {
    kv: [],
    d1: [],
    r2: [],
    queues: [],
  };

  // Collect all unique resources across workers
  const kvResources = new Map<string, ResourceInfo>(); // name -> info
  const d1Resources = new Map<string, ResourceInfo>();
  const r2Resources = new Map<string, ResourceInfo>();
  const queueResources = new Map<string, ResourceInfo>();

  for (const worker of workers) {
    if (!worker.bindings) continue;

    for (const info of extractKvBindings(worker.bindings)) {
      if (!kvResources.has(info.name)) {
        kvResources.set(info.name, info);
      }
    }

    for (const info of extractD1Bindings(worker.bindings)) {
      if (!d1Resources.has(info.name)) {
        d1Resources.set(info.name, info);
      }
    }

    for (const info of extractR2Bindings(worker.bindings)) {
      if (!r2Resources.has(info.name)) {
        r2Resources.set(info.name, info);
      }
    }

    for (const info of extractQueueBindings(worker.bindings)) {
      if (!queueResources.has(info.name)) {
        queueResources.set(info.name, info);
      }
    }
  }

  // Check KV namespaces
  if (kvResources.size > 0) {
    onProgress?.("  Checking KV namespaces...");
    const existingKv = await listKvNamespaces(env);
    const existingNames = new Set(existingKv.map((ns) => ns.title));

    for (const [name, info] of kvResources) {
      if (!existingNames.has(name)) {
        missing.kv.push(info);
      }
    }
  }

  // Check D1 databases
  if (d1Resources.size > 0) {
    onProgress?.("  Checking D1 databases...");
    const existingD1 = await listD1Databases(env);
    const existingNames = new Set(existingD1.map((db) => db.name));

    for (const [name, info] of d1Resources) {
      if (!existingNames.has(name)) {
        missing.d1.push(info);
      }
    }
  }

  // Check R2 buckets
  if (r2Resources.size > 0) {
    onProgress?.("  Checking R2 buckets...");
    const existingR2 = await listR2Buckets(env);
    const existingNames = new Set(existingR2.map((b) => b.name));

    for (const [name, info] of r2Resources) {
      if (!existingNames.has(name)) {
        missing.r2.push(info);
      }
    }
  }

  // Check queues
  if (queueResources.size > 0) {
    onProgress?.("  Checking queues...");
    const existingQueues = await listQueues(env);
    const existingNames = new Set(existingQueues.map((q) => q.queue_name));

    for (const [name, info] of queueResources) {
      if (!existingNames.has(name)) {
        missing.queues.push(info);
      }
    }
  }

  return missing;
}

/**
 * Create missing resources
 */
export async function createResources(
  missing: MissingResources,
  env?: string,
  onProgress?: (message: string) => void,
): Promise<CreatedResource[]> {
  const created: CreatedResource[] = [];

  // Create KV namespaces
  for (const info of missing.kv) {
    onProgress?.(`  Creating KV namespace "${info.name}"...`);
    try {
      const id = await createKvNamespace(info.name, env);
      created.push({
        type: "kv",
        bindingName: info.bindingName,
        name: info.name,
        id,
      });
      onProgress?.(`  ✓ Created KV namespace "${info.name}" (id: ${id})`);
    } catch (error) {
      onProgress?.(`  ✗ Failed to create KV namespace "${info.name}": ${error}`);
      throw error;
    }
  }

  // Create D1 databases
  for (const info of missing.d1) {
    onProgress?.(`  Creating D1 database "${info.name}"...`);
    try {
      const id = await createD1Database(info.name, env);
      created.push({
        type: "d1",
        bindingName: info.bindingName,
        name: info.name,
        id,
      });
      onProgress?.(`  ✓ Created D1 database "${info.name}" (id: ${id})`);
    } catch (error) {
      onProgress?.(`  ✗ Failed to create D1 database "${info.name}": ${error}`);
      throw error;
    }
  }

  // Create R2 buckets
  for (const info of missing.r2) {
    onProgress?.(`  Creating R2 bucket "${info.name}"...`);
    try {
      await createR2Bucket(info.name, env);
      created.push({
        type: "r2",
        bindingName: info.bindingName,
        name: info.name,
      });
      onProgress?.(`  ✓ Created R2 bucket "${info.name}"`);
    } catch (error) {
      onProgress?.(`  ✗ Failed to create R2 bucket "${info.name}": ${error}`);
      throw error;
    }
  }

  // Create queues
  for (const info of missing.queues) {
    onProgress?.(`  Creating queue "${info.name}"...`);
    try {
      await createQueue(info.name, env);
      created.push({
        type: "queue",
        bindingName: info.bindingName,
        name: info.name,
      });
      onProgress?.(`  ✓ Created queue "${info.name}"`);
    } catch (error) {
      onProgress?.(`  ✗ Failed to create queue "${info.name}": ${error}`);
      throw error;
    }
  }

  return created;
}

/**
 * Count total missing resources
 */
export function countMissingResources(missing: MissingResources): number {
  return missing.kv.length + missing.d1.length + missing.r2.length + missing.queues.length;
}

/**
 * Format missing resources for display
 */
export function formatMissingResources(missing: MissingResources): string[] {
  const lines: string[] = [];

  for (const info of missing.kv) {
    lines.push(`  - KV namespace: ${info.name} (binding: ${info.bindingName})`);
  }
  for (const info of missing.d1) {
    lines.push(`  - D1 database: ${info.name} (binding: ${info.bindingName})`);
  }
  for (const info of missing.r2) {
    lines.push(`  - R2 bucket: ${info.name} (binding: ${info.bindingName})`);
  }
  for (const info of missing.queues) {
    lines.push(`  - Queue: ${info.name} (binding: ${info.bindingName})`);
  }

  return lines;
}
