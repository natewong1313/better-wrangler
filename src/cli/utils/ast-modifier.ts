import {
  Project,
  SourceFile,
  SyntaxKind,
  CallExpression,
  ObjectLiteralExpression,
  VariableDeclaration,
  Node,
} from "ts-morph";
import type { BindingConfig, ResourceType } from "./prompts";

export interface WorkerInfo {
  name: string;
  variableName: string;
  entryPoint: string;
  bindings: string[];
}

export interface ConfigFileInfo {
  sourceFile: SourceFile;
  workers: WorkerInfo[];
  imports: Set<string>;
}

/**
 * Error thrown when config file operations fail
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Parse and load a config file using ts-morph
 */
export function parseConfigFile(configPath: string): ConfigFileInfo {
  const project = new Project({
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      // Skip module resolution to avoid errors when better-wrangler isn't in scope
      noResolve: true,
      // Skip lib checks
      skipLibCheck: true,
    },
    // Don't add default lib files which can cause resolution issues
    skipAddingFilesFromTsConfig: true,
  });

  let sourceFile: SourceFile;
  try {
    sourceFile = project.addSourceFileAtPath(configPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to parse config file: ${message}`);
  }

  // Check for syntax errors only (not semantic errors like missing modules)
  const diagnostics = sourceFile.getPreEmitDiagnostics();
  // Filter to only actual syntax errors (code 1xxx are syntax errors)
  // Exclude module resolution errors (code 2307) and other semantic errors
  const syntaxErrors = diagnostics.filter((d) => {
    const code = d.getCode();
    const category = d.getCategory();
    // Category 1 is Error, but we only want actual syntax errors
    // Syntax error codes are typically in the 1000-1999 range
    // 2307 is "Cannot find module" which we want to skip
    return category === 1 && code >= 1000 && code < 2000;
  });

  if (syntaxErrors.length > 0) {
    const firstError = syntaxErrors[0];
    const line = firstError.getLineNumber() ?? "unknown";
    const msg = firstError.getMessageText();
    const messageStr = typeof msg === "string" ? msg : msg.getMessageText();
    throw new ConfigError(`Syntax error on line ${line}: ${messageStr}`);
  }

  const workers = findWorkerExports(sourceFile);
  const imports = findBetterWranglerImports(sourceFile);

  return { sourceFile, workers, imports };
}

/**
 * Find all Worker exports in the config file
 */
function findWorkerExports(sourceFile: SourceFile): WorkerInfo[] {
  const workers: WorkerInfo[] = [];

  // Find variable declarations with Worker() calls
  const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const varDecl of variableDeclarations) {
    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const expression = initializer.getExpression();
    if (!Node.isIdentifier(expression) || expression.getText() !== "Worker") continue;

    const args = initializer.getArguments();
    if (args.length === 0 || !Node.isObjectLiteralExpression(args[0])) continue;

    const configObj = args[0] as ObjectLiteralExpression;
    const workerInfo = extractWorkerInfo(varDecl, configObj);
    if (workerInfo) {
      workers.push(workerInfo);
    }
  }

  return workers;
}

/**
 * Extract worker information from a Worker() call
 */
function extractWorkerInfo(
  varDecl: VariableDeclaration,
  configObj: ObjectLiteralExpression,
): WorkerInfo | null {
  const variableName = varDecl.getName();

  // Get 'name' property
  const nameProp = configObj.getProperty("name");
  if (!nameProp || !Node.isPropertyAssignment(nameProp)) return null;

  const nameInit = nameProp.getInitializer();
  if (!nameInit || !Node.isStringLiteral(nameInit)) return null;
  const name = nameInit.getLiteralText();

  // Get 'entryPoint' property
  const entryPointProp = configObj.getProperty("entryPoint");
  if (!entryPointProp || !Node.isPropertyAssignment(entryPointProp)) return null;

  const entryPointInit = entryPointProp.getInitializer();
  if (!entryPointInit || !Node.isStringLiteral(entryPointInit)) return null;
  const entryPoint = entryPointInit.getLiteralText();

  // Get existing bindings
  const bindings: string[] = [];
  const bindingsProp = configObj.getProperty("bindings");
  if (bindingsProp && Node.isPropertyAssignment(bindingsProp)) {
    const bindingsInit = bindingsProp.getInitializer();
    if (bindingsInit && Node.isObjectLiteralExpression(bindingsInit)) {
      for (const prop of bindingsInit.getProperties()) {
        if (Node.isPropertyAssignment(prop) || Node.isShorthandPropertyAssignment(prop)) {
          bindings.push(prop.getName());
        }
      }
    }
  }

  return { name, variableName, entryPoint, bindings };
}

/**
 * Find all imports from better-wrangler
 */
function findBetterWranglerImports(sourceFile: SourceFile): Set<string> {
  const imports = new Set<string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    if (moduleSpecifier !== "better-wrangler") continue;

    const namedImports = importDecl.getNamedImports();
    for (const namedImport of namedImports) {
      imports.add(namedImport.getName());
    }
  }

  return imports;
}

/**
 * Get the binding factory function name for a resource type
 */
function getBindingFactoryName(type: ResourceType): string {
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

/**
 * Generate binding code from config
 */
function generateBindingCode(binding: BindingConfig): string {
  const factoryName = getBindingFactoryName(binding.type);
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

/**
 * Add a binding to a worker in the config file
 */
export function addBindingToWorker(
  configInfo: ConfigFileInfo,
  workerName: string,
  binding: BindingConfig,
): void {
  const { sourceFile, workers, imports } = configInfo;

  // Find the worker
  const worker = workers.find((w) => w.name === workerName);
  if (!worker) {
    throw new ConfigError(`Worker "${workerName}" not found in config`);
  }

  // Check if binding already exists
  if (worker.bindings.includes(binding.bindingName)) {
    throw new ConfigError(
      `Binding "${binding.bindingName}" already exists in worker "${workerName}"`,
    );
  }

  // Ensure the binding type is imported
  const factoryName = getBindingFactoryName(binding.type);
  if (!imports.has(factoryName)) {
    addImport(sourceFile, factoryName);
    imports.add(factoryName);
  }

  // Find the Worker call and add the binding
  const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const varDecl of variableDeclarations) {
    if (varDecl.getName() !== worker.variableName) continue;

    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const args = initializer.getArguments();
    if (args.length === 0 || !Node.isObjectLiteralExpression(args[0])) continue;

    const configObj = args[0] as ObjectLiteralExpression;
    const bindingsProp = configObj.getProperty("bindings");

    const bindingCode = generateBindingCode(binding);

    if (bindingsProp && Node.isPropertyAssignment(bindingsProp)) {
      // Bindings property exists, add to it
      const bindingsInit = bindingsProp.getInitializer();
      if (bindingsInit && Node.isObjectLiteralExpression(bindingsInit)) {
        bindingsInit.addPropertyAssignment({
          name: binding.bindingName,
          initializer: bindingCode,
        });
      }
    } else {
      // No bindings property, create one
      configObj.addPropertyAssignment({
        name: "bindings",
        initializer: `{\n    ${binding.bindingName}: ${bindingCode},\n  }`,
      });
    }

    // Update worker info
    worker.bindings.push(binding.bindingName);
    return;
  }

  throw new ConfigError(`Could not find Worker configuration for "${workerName}"`);
}

/**
 * Add a new worker to the config file
 */
export function addWorkerToConfig(
  configInfo: ConfigFileInfo,
  workerConfig: {
    name: string;
    variableName: string;
    entryPoint: string;
    port: number;
    bindings: BindingConfig[];
  },
): void {
  const { sourceFile, workers, imports } = configInfo;

  // Check if worker already exists
  if (workers.some((w) => w.name === workerConfig.name)) {
    throw new ConfigError(`Worker "${workerConfig.name}" already exists`);
  }

  if (workers.some((w) => w.variableName === workerConfig.variableName)) {
    throw new ConfigError(`Variable "${workerConfig.variableName}" already exists`);
  }

  // Ensure Worker is imported
  if (!imports.has("Worker")) {
    addImport(sourceFile, "Worker");
    imports.add("Worker");
  }

  // Ensure all binding types are imported
  const bindingFactories = new Set<string>();
  for (const binding of workerConfig.bindings) {
    const factoryName = getBindingFactoryName(binding.type);
    bindingFactories.add(factoryName);
    if (!imports.has(factoryName)) {
      addImport(sourceFile, factoryName);
      imports.add(factoryName);
    }
  }

  // Generate the worker code
  const bindingsCode =
    workerConfig.bindings.length > 0
      ? `bindings: {\n    ${workerConfig.bindings.map((b) => `${b.bindingName}: ${generateBindingCode(b)}`).join(",\n    ")},\n  },`
      : "";

  const workerCode = `
export const ${workerConfig.variableName} = Worker({
  name: "${workerConfig.name}",
  entryPoint: "${workerConfig.entryPoint}",
  port: ${workerConfig.port},
  ${bindingsCode}
});
`;

  // Add the worker at the end of the file
  sourceFile.addStatements(workerCode);

  // Update workers list
  workers.push({
    name: workerConfig.name,
    variableName: workerConfig.variableName,
    entryPoint: workerConfig.entryPoint,
    bindings: workerConfig.bindings.map((b) => b.bindingName),
  });
}

/**
 * Add an import to the better-wrangler import declaration
 */
function addImport(sourceFile: SourceFile, name: string): void {
  // Find existing better-wrangler import
  for (const importDecl of sourceFile.getImportDeclarations()) {
    if (importDecl.getModuleSpecifierValue() === "better-wrangler") {
      importDecl.addNamedImport(name);
      return;
    }
  }

  // No existing import, create one
  sourceFile.addImportDeclaration({
    moduleSpecifier: "better-wrangler",
    namedImports: [name],
  });
}

/**
 * Save the modified config file
 */
export async function saveConfigFile(sourceFile: SourceFile): Promise<void> {
  // Format the file
  sourceFile.formatText({
    indentSize: 2,
    convertTabsToSpaces: true,
  });

  await sourceFile.save();
}

/**
 * Generate a valid variable name from a worker name
 */
export function workerNameToVariableName(name: string): string {
  // Replace hyphens and spaces with underscores, remove invalid chars
  let varName = name.replace(/[-\s]+/g, "_").replace(/[^a-zA-Z0-9_$]/g, "");

  // Convert to camelCase if it contains underscores
  if (varName.includes("_")) {
    varName = varName
      .split("_")
      .map((part, i) =>
        i === 0 ? part.toLowerCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
      )
      .join("");
  }

  // Ensure it starts with a letter or underscore (check AFTER camelCase conversion)
  if (/^[0-9]/.test(varName)) {
    varName = "_" + varName;
  }

  return varName || "worker";
}

/**
 * Get the existing ID value from a binding in the config file
 * @returns the ID value if it exists, undefined otherwise
 */
export function getBindingId(
  configInfo: ConfigFileInfo,
  workerVariableName: string,
  bindingName: string,
): string | undefined {
  const { sourceFile } = configInfo;

  const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const varDecl of variableDeclarations) {
    if (varDecl.getName() !== workerVariableName) continue;

    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const args = initializer.getArguments();
    if (args.length === 0 || !Node.isObjectLiteralExpression(args[0])) continue;

    const configObj = args[0] as ObjectLiteralExpression;
    const bindingsProp = configObj.getProperty("bindings");

    if (!bindingsProp || !Node.isPropertyAssignment(bindingsProp)) continue;

    const bindingsInit = bindingsProp.getInitializer();
    if (!bindingsInit || !Node.isObjectLiteralExpression(bindingsInit)) continue;

    // Find the specific binding
    const bindingProp = bindingsInit.getProperty(bindingName);
    if (!bindingProp || !Node.isPropertyAssignment(bindingProp)) continue;

    const bindingInit = bindingProp.getInitializer();
    if (!bindingInit || !Node.isCallExpression(bindingInit)) continue;

    // Get the binding config object (first argument to KV/D1/etc)
    const bindingArgs = bindingInit.getArguments();
    if (bindingArgs.length === 0 || !Node.isObjectLiteralExpression(bindingArgs[0])) continue;

    const bindingConfigObj = bindingArgs[0] as ObjectLiteralExpression;
    const idProp = bindingConfigObj.getProperty("id");

    if (idProp && Node.isPropertyAssignment(idProp)) {
      const idInit = idProp.getInitializer();
      if (idInit && Node.isStringLiteral(idInit)) {
        return idInit.getLiteralText();
      }
    }
  }

  return undefined;
}

/**
 * Update or add an ID to a binding in the config file
 */
export function updateBindingId(
  configInfo: ConfigFileInfo,
  workerVariableName: string,
  bindingName: string,
  newId: string,
): void {
  const { sourceFile } = configInfo;

  const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);

  for (const varDecl of variableDeclarations) {
    if (varDecl.getName() !== workerVariableName) continue;

    const initializer = varDecl.getInitializer();
    if (!initializer || !Node.isCallExpression(initializer)) continue;

    const args = initializer.getArguments();
    if (args.length === 0 || !Node.isObjectLiteralExpression(args[0])) continue;

    const configObj = args[0] as ObjectLiteralExpression;
    const bindingsProp = configObj.getProperty("bindings");

    if (!bindingsProp || !Node.isPropertyAssignment(bindingsProp)) {
      throw new ConfigError(`Worker "${workerVariableName}" has no bindings property`);
    }

    const bindingsInit = bindingsProp.getInitializer();
    if (!bindingsInit || !Node.isObjectLiteralExpression(bindingsInit)) {
      throw new ConfigError(`Worker "${workerVariableName}" has invalid bindings`);
    }

    // Find the specific binding
    const bindingProp = bindingsInit.getProperty(bindingName);
    if (!bindingProp || !Node.isPropertyAssignment(bindingProp)) {
      throw new ConfigError(`Binding "${bindingName}" not found in worker "${workerVariableName}"`);
    }

    const bindingInit = bindingProp.getInitializer();
    if (!bindingInit || !Node.isCallExpression(bindingInit)) {
      throw new ConfigError(`Binding "${bindingName}" has invalid format`);
    }

    // Get the binding config object (first argument to KV/D1/etc)
    const bindingArgs = bindingInit.getArguments();
    if (bindingArgs.length === 0 || !Node.isObjectLiteralExpression(bindingArgs[0])) {
      throw new ConfigError(`Binding "${bindingName}" has invalid config format`);
    }

    const bindingConfigObj = bindingArgs[0] as ObjectLiteralExpression;
    const idProp = bindingConfigObj.getProperty("id");

    if (idProp && Node.isPropertyAssignment(idProp)) {
      // Update existing ID
      const idInit = idProp.getInitializer();
      if (idInit) {
        idInit.replaceWithText(`"${newId}"`);
      }
    } else {
      // Add new ID property
      bindingConfigObj.addPropertyAssignment({
        name: "id",
        initializer: `"${newId}"`,
      });
    }

    return;
  }

  throw new ConfigError(`Worker "${workerVariableName}" not found in config`);
}

/**
 * Find worker variable name by worker name
 */
export function findWorkerVariableName(
  configInfo: ConfigFileInfo,
  workerName: string,
): string | undefined {
  const worker = configInfo.workers.find((w) => w.name === workerName);
  return worker?.variableName;
}
