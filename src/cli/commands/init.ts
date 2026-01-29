import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  promptText,
  promptNumber,
  promptBindingTypes,
  promptBindingConfig,
  promptConfirm,
  getDefaultProjectName,
  type BindingConfig,
  type ResourceType,
} from "../utils/prompts";
import { createLogger } from "../../logger";

const log = createLogger("init");

const CONFIG_FILENAME = "bw.config.ts";

interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions = {}): Promise<void> {
  const configPath = join(process.cwd(), CONFIG_FILENAME);

  // Check if config already exists
  if (existsSync(configPath) && !options.force) {
    console.error(`Error: Config file already exists at ./${CONFIG_FILENAME}`);
    console.error("  Use --force to overwrite, or run 'bw add' to modify the existing config.");
    process.exit(1);
  }

  if (existsSync(configPath) && options.force) {
    const confirmed = await promptConfirm(
      `Config file already exists. Are you sure you want to overwrite it?`,
      false,
    );
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }
  }

  console.log("\n  better-wrangler init\n");

  // Gather worker configuration
  const workerName = await promptText({
    message: "Worker name:",
    defaultValue: "main",
    validate: (v) => {
      if (!v.trim()) return "Worker name is required";
      if (!/^[a-z0-9-]+$/i.test(v))
        return "Worker name should only contain letters, numbers, and hyphens";
      return true;
    },
  });

  const entryPoint = await promptText({
    message: "Entry point:",
    defaultValue: "./src/index.ts",
    validate: (v) => v.trim().length > 0 || "Entry point is required",
  });

  const port = await promptNumber({
    message: "Port:",
    defaultValue: 8787,
    min: 1,
    max: 65535,
  });

  // Ask which bindings to add
  const bindingTypes = await promptBindingTypes();
  const bindings: BindingConfig[] = [];

  for (const type of bindingTypes) {
    const config = await promptBindingConfig(
      type,
      bindings.map((b) => b.bindingName),
    );
    bindings.push(config);
  }

  // Generate the config file
  const configContent = generateConfigFile(workerName, entryPoint, port, bindings);

  // Write the file
  writeFileSync(configPath, configContent, "utf-8");

  console.log(`\n✓ Created ${CONFIG_FILENAME}`);
  console.log("\nNext steps:");
  console.log("  1. Create your worker entry point at", entryPoint);
  console.log("  2. Run 'bw dev' to start development");
  console.log("  3. Use 'bw add' to add more bindings\n");
}

function generateConfigFile(
  workerName: string,
  entryPoint: string,
  port: number,
  bindings: BindingConfig[],
): string {
  // Determine which imports are needed
  const imports = new Set<string>(["Worker"]);
  for (const binding of bindings) {
    imports.add(getBindingImport(binding.type));
  }

  // Generate import statement
  const importStatement = `import { ${Array.from(imports).join(", ")} } from "better-wrangler";`;

  // Generate bindings object
  const bindingsCode =
    bindings.length > 0
      ? `  bindings: {\n${bindings.map((b) => `    ${b.bindingName}: ${generateBindingCall(b)},`).join("\n")}\n  },`
      : "";

  // Generate variable name from worker name
  const variableName = workerNameToVariableName(workerName);

  // Generate the worker configuration
  const workerCode = `export const ${variableName} = Worker({
  name: "${workerName}",
  entryPoint: "${entryPoint}",
  port: ${port},
${bindingsCode}
});`;

  // Generate example comments
  const exampleComments = generateExampleComments(bindings);

  return `${importStatement}

${workerCode}

${exampleComments}`;
}

function getBindingImport(type: ResourceType): string {
  switch (type) {
    case "d1":
      return "D1";
    case "kv":
      return "KV";
    case "r2":
      return "R2";
    case "do":
      return "DurableObject";
    case "queue":
      return "QueueProducer";
    case "worker":
      return "Worker";
  }
}

function generateBindingCall(binding: BindingConfig): string {
  const factoryName = getBindingImport(binding.type);
  const configEntries = Object.entries(binding.config)
    .filter(([_, v]) => v !== undefined)
    .map(([k, v]) => {
      if (typeof v === "string") {
        return `${k}: "${v}"`;
      }
      return `${k}: ${JSON.stringify(v)}`;
    })
    .join(", ");

  return `${factoryName}({ ${configEntries} })`;
}

function workerNameToVariableName(name: string): string {
  // Replace hyphens with nothing and use camelCase
  return name
    .split("-")
    .map((part, i) =>
      i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join("");
}

function generateExampleComments(existingBindings: BindingConfig[]): string {
  const existingTypes = new Set(existingBindings.map((b) => b.type));

  const examples: string[] = [];

  if (!existingTypes.has("d1")) {
    examples.push('// D1({ name: "my-database" })');
  }
  if (!existingTypes.has("kv")) {
    examples.push('// KV({ name: "my-kv" })');
  }
  if (!existingTypes.has("r2")) {
    examples.push('// R2({ name: "my-bucket" })');
  }
  if (!existingTypes.has("do")) {
    examples.push(
      '// DurableObject({ name: "my-do", className: "MyDO", classPath: "./src/do.ts" })',
    );
  }
  if (!existingTypes.has("queue")) {
    examples.push('// QueueProducer({ name: "my-queue", queue: "my-queue" })');
  }

  if (examples.length === 0) {
    return "";
  }

  // Determine which imports would be needed for examples
  const missingImports: string[] = [];
  if (!existingTypes.has("d1")) missingImports.push("D1");
  if (!existingTypes.has("kv")) missingImports.push("KV");
  if (!existingTypes.has("r2")) missingImports.push("R2");
  if (!existingTypes.has("do")) missingImports.push("DurableObject");
  if (!existingTypes.has("queue")) missingImports.push("QueueProducer");

  const importHint =
    missingImports.length > 0 ? `// Add to imports: ${missingImports.join(", ")}\n` : "";

  return `// Example bindings (uncomment and add to your worker's bindings):
${importHint}${examples.join("\n")}
`;
}
