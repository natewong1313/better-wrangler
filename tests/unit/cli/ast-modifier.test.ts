import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseConfigFile,
  addBindingToWorker,
  addWorkerToConfig,
  saveConfigFile,
  workerNameToVariableName,
  ConfigError,
} from "../../../src/cli/utils/ast-modifier";

describe("ast-modifier", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "bw-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function createConfigFile(content: string): string {
    const configPath = join(tempDir, "bw.config.ts");
    writeFileSync(configPath, content, "utf-8");
    return configPath;
  }

  describe("parseConfigFile", () => {
    it("parses a basic config file with one worker", () => {
      const configPath = createConfigFile(`
        import { Worker } from "better-wrangler";
        
        export const main = Worker({
          name: "main",
          entryPoint: "./src/index.ts",
        });
      `);

      const configInfo = parseConfigFile(configPath);

      expect(configInfo.workers).toHaveLength(1);
      expect(configInfo.workers[0].name).toBe("main");
      expect(configInfo.workers[0].variableName).toBe("main");
      expect(configInfo.workers[0].entryPoint).toBe("./src/index.ts");
      expect(configInfo.workers[0].bindings).toEqual([]);
    });

    it("parses a config file with multiple workers", () => {
      const configPath = createConfigFile(`
        import { Worker } from "better-wrangler";
        
        export const api = Worker({
          name: "api-worker",
          entryPoint: "./src/api/index.ts",
        });
        
        export const web = Worker({
          name: "web-worker",
          entryPoint: "./src/web/index.ts",
        });
      `);

      const configInfo = parseConfigFile(configPath);

      expect(configInfo.workers).toHaveLength(2);
      expect(configInfo.workers.map((w) => w.name)).toContain("api-worker");
      expect(configInfo.workers.map((w) => w.name)).toContain("web-worker");
    });

    it("parses existing bindings from a worker", () => {
      const configPath = createConfigFile(`
        import { Worker, D1, KV } from "better-wrangler";
        
        export const main = Worker({
          name: "main",
          entryPoint: "./src/index.ts",
          bindings: {
            DB: D1({ name: "my-db" }),
            CACHE: KV({ name: "my-kv" }),
          },
        });
      `);

      const configInfo = parseConfigFile(configPath);

      expect(configInfo.workers[0].bindings).toEqual(["DB", "CACHE"]);
    });

    it("detects existing imports from better-wrangler", () => {
      const configPath = createConfigFile(`
        import { Worker, D1, KV } from "better-wrangler";
        
        export const main = Worker({
          name: "main",
          entryPoint: "./src/index.ts",
        });
      `);

      const configInfo = parseConfigFile(configPath);

      expect(configInfo.imports.has("Worker")).toBe(true);
      expect(configInfo.imports.has("D1")).toBe(true);
      expect(configInfo.imports.has("KV")).toBe(true);
      expect(configInfo.imports.has("R2")).toBe(false);
    });

    it("throws ConfigError for syntax errors", () => {
      const configPath = createConfigFile(`
        import { Worker } from "better-wrangler";
        
        export const main = Worker({
          name: "main",
          entryPoint: "./src/index.ts"
          // missing comma - syntax error
          port: 8787
        });
      `);

      expect(() => parseConfigFile(configPath)).toThrow(ConfigError);
    });
  });

  describe("addBindingToWorker", () => {
    it("adds a D1 binding to a worker without existing bindings", async () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      addBindingToWorker(configInfo, "main", {
        type: "d1",
        bindingName: "DB",
        config: { name: "my-database" },
      });
      await saveConfigFile(configInfo.sourceFile);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("D1");
      expect(content).toContain("DB");
      expect(content).toContain("my-database");
    });

    it("adds a binding to a worker with existing bindings", async () => {
      const configPath = createConfigFile(`
import { Worker, D1 } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
  bindings: {
    DB: D1({ name: "my-database" }),
  },
});
`);

      const configInfo = parseConfigFile(configPath);
      addBindingToWorker(configInfo, "main", {
        type: "kv",
        bindingName: "CACHE",
        config: { name: "my-kv" },
      });
      await saveConfigFile(configInfo.sourceFile);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("KV");
      expect(content).toContain("CACHE");
      expect(content).toContain("my-kv");
      // Should still have the original binding
      expect(content).toContain("DB");
      expect(content).toContain("my-database");
    });

    it("adds import for new binding type", async () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      addBindingToWorker(configInfo, "main", {
        type: "r2",
        bindingName: "BUCKET",
        config: { name: "my-bucket" },
      });
      await saveConfigFile(configInfo.sourceFile);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toMatch(/import\s*{[^}]*R2[^}]*}\s*from\s*["']better-wrangler["']/);
    });

    it("throws error if worker not found", () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      expect(() =>
        addBindingToWorker(configInfo, "nonexistent", {
          type: "d1",
          bindingName: "DB",
          config: { name: "db" },
        })
      ).toThrow(ConfigError);
      expect(() =>
        addBindingToWorker(configInfo, "nonexistent", {
          type: "d1",
          bindingName: "DB",
          config: { name: "db" },
        })
      ).toThrow('Worker "nonexistent" not found');
    });

    it("throws error if binding already exists", () => {
      const configPath = createConfigFile(`
import { Worker, D1 } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
  bindings: {
    DB: D1({ name: "my-database" }),
  },
});
`);

      const configInfo = parseConfigFile(configPath);
      expect(() =>
        addBindingToWorker(configInfo, "main", {
          type: "d1",
          bindingName: "DB",
          config: { name: "other-db" },
        })
      ).toThrow(ConfigError);
      expect(() =>
        addBindingToWorker(configInfo, "main", {
          type: "d1",
          bindingName: "DB",
          config: { name: "other-db" },
        })
      ).toThrow('Binding "DB" already exists');
    });
  });

  describe("addWorkerToConfig", () => {
    it("adds a new worker to the config", async () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      addWorkerToConfig(configInfo, {
        name: "api",
        variableName: "api",
        entryPoint: "./src/api/index.ts",
        port: 8788,
        bindings: [],
      });
      await saveConfigFile(configInfo.sourceFile);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain('name: "api"');
      expect(content).toContain("./src/api/index.ts");
      expect(content).toContain("8788");
    });

    it("adds a new worker with bindings", async () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      addWorkerToConfig(configInfo, {
        name: "api",
        variableName: "api",
        entryPoint: "./src/api/index.ts",
        port: 8788,
        bindings: [
          { type: "d1", bindingName: "DB", config: { name: "api-db" } },
          { type: "kv", bindingName: "CACHE", config: { name: "api-cache" } },
        ],
      });
      await saveConfigFile(configInfo.sourceFile);

      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("D1");
      expect(content).toContain("KV");
      expect(content).toContain("api-db");
      expect(content).toContain("api-cache");
    });

    it("throws error if worker name already exists", () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      expect(() =>
        addWorkerToConfig(configInfo, {
          name: "main",
          variableName: "main2",
          entryPoint: "./src/main2/index.ts",
          port: 8788,
          bindings: [],
        })
      ).toThrow(ConfigError);
    });

    it("throws error if variable name already exists", () => {
      const configPath = createConfigFile(`
import { Worker } from "better-wrangler";

export const main = Worker({
  name: "main",
  entryPoint: "./src/index.ts",
});
`);

      const configInfo = parseConfigFile(configPath);
      expect(() =>
        addWorkerToConfig(configInfo, {
          name: "other",
          variableName: "main",
          entryPoint: "./src/other/index.ts",
          port: 8788,
          bindings: [],
        })
      ).toThrow(ConfigError);
    });
  });

  describe("workerNameToVariableName", () => {
    it("converts simple names", () => {
      expect(workerNameToVariableName("main")).toBe("main");
      expect(workerNameToVariableName("api")).toBe("api");
    });

    it("converts hyphenated names to camelCase", () => {
      expect(workerNameToVariableName("my-worker")).toBe("myWorker");
      expect(workerNameToVariableName("api-gateway")).toBe("apiGateway");
    });

    it("handles names starting with numbers", () => {
      expect(workerNameToVariableName("123worker")).toBe("_123worker");
    });

    it("removes invalid characters", () => {
      expect(workerNameToVariableName("my@worker!")).toBe("myworker");
    });

    it("handles underscored names", () => {
      expect(workerNameToVariableName("my_worker")).toBe("myWorker");
    });
  });
});
