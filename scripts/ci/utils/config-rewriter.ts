/**
 * Config rewriter for CI deployment tests
 *
 * Modifies bw.config.ts files to use CI-specific names for workers and resources.
 * This allows us to deploy multiple instances of the same example without conflicts.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { DeployedResource } from "../resources/types";
import { getCIWorkerName } from "../resources/types";

export interface RewriteResult {
	/** Path to the modified config file */
	configPath: string;
	/** Original config content (for restoration) */
	originalContent: string;
	/** Modified config content */
	modifiedContent: string;
	/** Mapping of original worker names to CI names */
	workerNameMap: Map<string, string>;
}

/**
 * Rewrite a bw.config.ts file for CI deployment
 *
 * This function:
 * 1. Reads the original config
 * 2. Replaces worker names with CI-specific names
 * 3. Replaces resource binding IDs with actual deployed resource IDs
 * 4. Writes the modified config
 */
export async function rewriteConfigForCI(
	exampleDir: string,
	example: string,
	runId: string,
	deployedResources: DeployedResource[]
): Promise<RewriteResult> {
	const configPath = join(exampleDir, "bw.config.ts");
	const originalContent = await readFile(configPath, "utf-8");

	let modifiedContent = originalContent;
	const workerNameMap = new Map<string, string>();

	// Find all worker names in the config using defineWorker calls
	// Match patterns like: defineWorker("worker-1", ...) or defineWorker('worker-1', ...)
	const workerNameRegex = /defineWorker\s*\(\s*["']([^"']+)["']/g;
	let match: RegExpExecArray | null;
	const workerNames: string[] = [];

	while ((match = workerNameRegex.exec(originalContent)) !== null) {
		workerNames.push(match[1]);
	}

	// Replace worker names with CI-specific names
	for (const workerName of workerNames) {
		const ciWorkerName = getCIWorkerName(example, workerName, runId);
		workerNameMap.set(workerName, ciWorkerName);

		// Replace the worker name in defineWorker calls
		const workerRegex = new RegExp(
			`(defineWorker\\s*\\(\\s*)["']${escapeRegex(workerName)}["']`,
			"g"
		);
		modifiedContent = modifiedContent.replace(
			workerRegex,
			`$1"${ciWorkerName}"`
		);
	}

	// Replace resource bindings with deployed resource IDs
	for (const resource of deployedResources) {
		switch (resource.type) {
			case "kv": {
				// Replace kv({ name: "original-name" }) with kv({ id: "actual-id" })
				// Also handle kv("original-name")
				const kvNameRegex = new RegExp(
					`kv\\s*\\(\\s*\\{[^}]*name\\s*:\\s*["']${escapeRegex(resource.name)}["'][^}]*\\}\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					kvNameRegex,
					`kv({ id: "${resource.id}" })`
				);

				// Simple form: kv("name")
				const kvSimpleRegex = new RegExp(
					`kv\\s*\\(\\s*["']${escapeRegex(resource.name)}["']\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					kvSimpleRegex,
					`kv({ id: "${resource.id}" })`
				);
				break;
			}
			case "r2": {
				// Replace r2({ name: "original-name" }) or r2("original-name")
				const r2NameRegex = new RegExp(
					`r2\\s*\\(\\s*\\{[^}]*name\\s*:\\s*["']${escapeRegex(resource.name)}["'][^}]*\\}\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					r2NameRegex,
					`r2({ bucket_name: "${resource.ciName}" })`
				);

				const r2SimpleRegex = new RegExp(
					`r2\\s*\\(\\s*["']${escapeRegex(resource.name)}["']\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					r2SimpleRegex,
					`r2({ bucket_name: "${resource.ciName}" })`
				);
				break;
			}
			case "d1": {
				// Replace d1({ name: "original-name" }) or d1("original-name")
				const d1NameRegex = new RegExp(
					`d1\\s*\\(\\s*\\{[^}]*name\\s*:\\s*["']${escapeRegex(resource.name)}["'][^}]*\\}\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					d1NameRegex,
					`d1({ database_id: "${resource.id}" })`
				);

				const d1SimpleRegex = new RegExp(
					`d1\\s*\\(\\s*["']${escapeRegex(resource.name)}["']\\s*\\)`,
					"g"
				);
				modifiedContent = modifiedContent.replace(
					d1SimpleRegex,
					`d1({ database_id: "${resource.id}" })`
				);
				break;
			}
		}
	}

	// Write the modified config
	await writeFile(configPath, modifiedContent, "utf-8");

	return {
		configPath,
		originalContent,
		modifiedContent,
		workerNameMap,
	};
}

/**
 * Restore the original config after deployment
 */
export async function restoreConfig(result: RewriteResult): Promise<void> {
	await writeFile(result.configPath, result.originalContent, "utf-8");
}

/**
 * Save deployment metadata for use by tests
 */
export async function saveDeploymentMetadata(
	exampleDir: string,
	metadata: {
		example: string;
		runId: string;
		workers: Array<{ name: string; ciName: string; url: string }>;
		resources: DeployedResource[];
		subdomain: string;
	}
): Promise<string> {
	const metadataDir = join(exampleDir, ".ci-deployment");
	await mkdir(metadataDir, { recursive: true });

	const metadataPath = join(metadataDir, "metadata.json");
	await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");

	return metadataPath;
}

/**
 * Load deployment metadata for tests
 */
export async function loadDeploymentMetadata(exampleDir: string): Promise<{
	example: string;
	runId: string;
	workers: Array<{ name: string; ciName: string; url: string }>;
	resources: DeployedResource[];
	subdomain: string;
}> {
	const metadataPath = join(exampleDir, ".ci-deployment", "metadata.json");
	const content = await readFile(metadataPath, "utf-8");
	return JSON.parse(content);
}

function escapeRegex(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
