import { input, select, checkbox, confirm } from "@inquirer/prompts";
import path from "path";

export type ResourceType = "d1" | "kv" | "r2" | "do" | "queue" | "worker";

export interface BindingConfig {
  type: ResourceType;
  bindingName: string;
  config: Record<string, unknown>;
}

export interface WorkerConfig {
  name: string;
  entryPoint: string;
  port: number;
  bindings: BindingConfig[];
}

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  d1: "D1 Database",
  kv: "KV Namespace",
  r2: "R2 Bucket",
  do: "Durable Object",
  queue: "Queue",
  worker: "Worker",
};

export const DEFAULT_BINDING_NAMES: Record<Exclude<ResourceType, "worker">, string> = {
  d1: "DB",
  kv: "KV",
  r2: "BUCKET",
  do: "DO",
  queue: "QUEUE",
};

/**
 * Prompt for basic text input with validation
 */
export async function promptText(options: {
  message: string;
  defaultValue?: string;
  validate?: (value: string) => boolean | string;
}): Promise<string> {
  return input({
    message: options.message,
    default: options.defaultValue,
    validate: options.validate,
  });
}

/**
 * Prompt for optional text input (can be empty)
 */
export async function promptOptionalText(options: {
  message: string;
  defaultValue?: string;
}): Promise<string | undefined> {
  const value = await input({
    message: `${options.message} (optional, press Enter to skip)`,
    default: options.defaultValue ?? "",
  });
  return value.trim() || undefined;
}

/**
 * Prompt for a number
 */
export async function promptNumber(options: {
  message: string;
  defaultValue?: number;
  min?: number;
  max?: number;
}): Promise<number> {
  const value = await input({
    message: options.message,
    default: options.defaultValue?.toString(),
    validate: (val: string) => {
      const num = parseInt(val, 10);
      if (isNaN(num)) return "Please enter a valid number";
      if (options.min !== undefined && num < options.min) {
        return `Value must be at least ${options.min}`;
      }
      if (options.max !== undefined && num > options.max) {
        return `Value must be at most ${options.max}`;
      }
      return true;
    },
  });
  return parseInt(value, 10);
}

/**
 * Prompt for resource type selection
 */
export async function promptResourceType(): Promise<ResourceType> {
  return select({
    message: "What do you want to add?",
    choices: [
      { name: "D1 Database", value: "d1" as const },
      { name: "KV Namespace", value: "kv" as const },
      { name: "R2 Bucket", value: "r2" as const },
      { name: "Durable Object", value: "do" as const },
      { name: "Queue", value: "queue" as const },
      { name: "Worker", value: "worker" as const },
    ],
  });
}

/**
 * Prompt for multiple binding types (used in init)
 */
export async function promptBindingTypes(): Promise<Exclude<ResourceType, "worker">[]> {
  return checkbox({
    message: "Which bindings do you want to add?",
    choices: [
      { name: "D1 Database", value: "d1" as const },
      { name: "KV Namespace", value: "kv" as const },
      { name: "R2 Bucket", value: "r2" as const },
      { name: "Durable Object", value: "do" as const },
      { name: "Queue", value: "queue" as const },
    ],
  });
}

/**
 * Prompt for worker selection
 */
export async function promptWorkerSelection(
  workers: Array<{ name: string; entryPoint: string }>,
): Promise<string> {
  return select({
    message: "Select a worker to add the binding to:",
    choices: workers.map((w) => ({
      name: `${w.name} (${w.entryPoint})`,
      value: w.name,
    })),
  });
}

/**
 * Prompt for confirmation
 */
export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return confirm({ message, default: defaultValue });
}

/**
 * Prompt for D1 binding configuration
 */
export async function promptD1Config(existingBindings: string[] = []): Promise<BindingConfig> {
  const bindingName = await promptBindingName("d1", existingBindings);
  const name = await promptText({
    message: "Database name:",
    validate: (v) => v.trim().length > 0 || "Database name is required",
  });
  const id = await promptOptionalText({ message: "Database ID" });
  const migrationsDir = await promptOptionalText({ message: "Migrations directory" });

  return {
    type: "d1",
    bindingName,
    config: { name, ...(id && { id }), ...(migrationsDir && { migrationsDir }) },
  };
}

/**
 * Prompt for KV binding configuration
 */
export async function promptKVConfig(existingBindings: string[] = []): Promise<BindingConfig> {
  const bindingName = await promptBindingName("kv", existingBindings);
  const name = await promptText({
    message: "Namespace name:",
    validate: (v) => v.trim().length > 0 || "Namespace name is required",
  });
  const id = await promptOptionalText({ message: "Namespace ID" });
  const preview_id = await promptOptionalText({ message: "Preview ID" });

  return {
    type: "kv",
    bindingName,
    config: { name, ...(id && { id }), ...(preview_id && { preview_id }) },
  };
}

/**
 * Prompt for R2 binding configuration
 */
export async function promptR2Config(existingBindings: string[] = []): Promise<BindingConfig> {
  const bindingName = await promptBindingName("r2", existingBindings);
  const name = await promptText({
    message: "Bucket name:",
    validate: (v) => v.trim().length > 0 || "Bucket name is required",
  });

  return {
    type: "r2",
    bindingName,
    config: { name },
  };
}

/**
 * Prompt for Durable Object binding configuration
 */
export async function promptDOConfig(existingBindings: string[] = []): Promise<BindingConfig> {
  const bindingName = await promptBindingName("do", existingBindings);
  const name = await promptText({
    message: "Durable Object name:",
    validate: (v) => v.trim().length > 0 || "Name is required",
  });
  const className = await promptText({
    message: "Class name:",
    validate: (v) => v.trim().length > 0 || "Class name is required",
  });
  const classPath = await promptText({
    message: "Class path:",
    defaultValue: "./src/do.ts",
    validate: (v) => v.trim().length > 0 || "Class path is required",
  });
  const storage = await select({
    message: "Storage type:",
    choices: [
      { name: "Default (key-value)", value: undefined },
      { name: "SQL", value: "sql" as const },
    ],
  });

  return {
    type: "do",
    bindingName,
    config: { name, className, classPath, ...(storage && { storage }) },
  };
}

/**
 * Prompt for Queue binding configuration
 */
export async function promptQueueConfig(existingBindings: string[] = []): Promise<BindingConfig> {
  const bindingName = await promptBindingName("queue", existingBindings);
  const name = await promptText({
    message: "Binding name for queue:",
    defaultValue: "my-queue",
  });
  const queue = await promptText({
    message: "Queue name:",
    validate: (v) => v.trim().length > 0 || "Queue name is required",
  });
  const deliveryDelay = await promptOptionalText({ message: "Delivery delay (seconds)" });

  return {
    type: "queue",
    bindingName,
    config: {
      name,
      queue,
      ...(deliveryDelay && { deliveryDelay: parseInt(deliveryDelay, 10) }),
    },
  };
}

/**
 * Prompt for worker configuration
 */
export async function promptWorkerConfig(existingWorkers: string[] = []): Promise<WorkerConfig> {
  const name = await promptText({
    message: "Worker name:",
    defaultValue: existingWorkers.length === 0 ? "main" : undefined,
    validate: (v) => {
      if (!v.trim()) return "Worker name is required";
      if (existingWorkers.includes(v)) return `Worker "${v}" already exists`;
      return true;
    },
  });

  const entryPoint = await promptText({
    message: "Entry point:",
    defaultValue: `./src/${name}/index.ts`,
    validate: (v) => v.trim().length > 0 || "Entry point is required",
  });

  const port = await promptNumber({
    message: "Port:",
    defaultValue: 8787 + existingWorkers.length,
    min: 1,
    max: 65535,
  });

  const bindingTypes = await promptBindingTypes();
  const bindings: BindingConfig[] = [];

  for (const type of bindingTypes) {
    const config = await promptBindingConfig(
      type,
      bindings.map((b) => b.bindingName),
    );
    bindings.push(config);
  }

  return { name, entryPoint, port, bindings };
}

/**
 * Prompt for binding name with default suggestion
 */
async function promptBindingName(
  type: Exclude<ResourceType, "worker">,
  existingBindings: string[] = [],
): Promise<string> {
  const defaultName = getUniqueBindingName(DEFAULT_BINDING_NAMES[type], existingBindings);

  return promptText({
    message: "Binding name:",
    defaultValue: defaultName,
    validate: (v) => {
      if (!v.trim()) return "Binding name is required";
      if (existingBindings.includes(v)) return `Binding "${v}" already exists`;
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(v)) {
        return "Binding name must be a valid identifier (letters, numbers, underscores)";
      }
      return true;
    },
  });
}

/**
 * Get a unique binding name by appending a number if needed
 */
function getUniqueBindingName(baseName: string, existingBindings: string[]): string {
  if (!existingBindings.includes(baseName)) {
    return baseName;
  }
  let counter = 2;
  while (existingBindings.includes(`${baseName}${counter}`)) {
    counter++;
  }
  return `${baseName}${counter}`;
}

/**
 * Prompt for binding configuration based on type
 */
export async function promptBindingConfig(
  type: Exclude<ResourceType, "worker">,
  existingBindings: string[] = [],
): Promise<BindingConfig> {
  console.log(`\nConfiguring ${RESOURCE_LABELS[type]}:`);

  switch (type) {
    case "d1":
      return promptD1Config(existingBindings);
    case "kv":
      return promptKVConfig(existingBindings);
    case "r2":
      return promptR2Config(existingBindings);
    case "do":
      return promptDOConfig(existingBindings);
    case "queue":
      return promptQueueConfig(existingBindings);
  }
}

/**
 * Get the current directory name for default project name
 */
export function getDefaultProjectName(): string {
  return path.basename(process.cwd());
}

/**
 * Validate that a string is a valid JavaScript identifier
 */
export function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}
