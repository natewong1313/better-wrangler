#!/usr/bin/env bun
/**
 * CI Cleanup Script
 *
 * Cleans up Cloudflare resources created during CI deployment tests.
 *
 * Usage: bun run scripts/ci/cleanup.ts <example-name>
 *        bun run scripts/ci/cleanup.ts --stale  (clean up all stale CI resources)
 *
 * Environment variables:
 *   - CI_RUN_ID: Unique identifier for this CI run (required unless --stale)
 *   - CLOUDFLARE_API_TOKEN: Cloudflare API token (required)
 *   - CLOUDFLARE_ACCOUNT_ID: Cloudflare account ID (required)
 */

import { rm } from "node:fs/promises";
import { join } from "node:path";
import { createCloudflareClient, CloudflareAPIError } from "./cloudflare-client";
import { ResourceManager } from "./resources";
import {
	getCIWorkerName,
	getCIResourceName,
} from "./resources/types";
import { getExampleConfig, getAvailableExamples } from "./example-configs";

async function main() {
	const arg = process.argv[2];

	if (arg === "--stale") {
		await cleanupStaleResources();
		return;
	}

	const example = arg;
	const runId = process.env.CI_RUN_ID;

	if (!example) {
		console.error("Usage: bun run scripts/ci/cleanup.ts <example-name>");
		console.error("       bun run scripts/ci/cleanup.ts --stale");
		console.error("\nAvailable examples:", getAvailableExamples().join(", "));
		process.exit(1);
	}

	if (!runId) {
		console.error("CI_RUN_ID environment variable is required");
		process.exit(1);
	}

	let config;
	try {
		config = getExampleConfig(example);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}

	const projectRoot = join(import.meta.dir, "../..");
	const exampleDir = join(projectRoot, "examples", example);

	console.log(`\n========================================`);
	console.log(`Cleaning up example: ${example}`);
	console.log(`Run ID: ${runId}`);
	console.log(`========================================\n`);

	const client = createCloudflareClient();
	const resourceManager = new ResourceManager(client);

	let hasErrors = false;

	// Step 1: Delete workers
	console.log("Step 1: Deleting workers...");
	for (const workerName of config.workers) {
		const ciWorkerName = getCIWorkerName(example, workerName, runId);
		try {
			await client.deleteWorker(ciWorkerName);
			console.log(`  Deleted worker: ${ciWorkerName}`);
		} catch (error) {
			if (error instanceof CloudflareAPIError && error.status === 404) {
				console.log(`  Worker not found (already deleted?): ${ciWorkerName}`);
			} else {
				console.error(`  Failed to delete worker ${ciWorkerName}:`, error);
				hasErrors = true;
			}
		}
	}
	console.log();

	// Step 2: Delete resources
	console.log("Step 2: Deleting resources...");
	for (const resource of config.resources) {
		const ciName = getCIResourceName(example, resource.type, resource.name, runId);

		try {
			switch (resource.type) {
				case "kv": {
					// Need to find the namespace ID first
					const namespaces = await client.listKVNamespaces();
					const ns = namespaces.find((n) => n.title === ciName);
					if (ns) {
						await client.deleteKVNamespace(ns.id);
						console.log(`  Deleted KV namespace: ${ciName}`);
					} else {
						console.log(`  KV namespace not found (already deleted?): ${ciName}`);
					}
					break;
				}
				case "r2": {
					// Empty bucket first, then delete
					try {
						await client.emptyR2Bucket(ciName);
						await client.deleteR2Bucket(ciName);
						console.log(`  Deleted R2 bucket: ${ciName}`);
					} catch (e) {
						if (e instanceof CloudflareAPIError && e.status === 404) {
							console.log(`  R2 bucket not found (already deleted?): ${ciName}`);
						} else {
							throw e;
						}
					}
					break;
				}
				case "d1": {
					// Need to find the database UUID first
					const databases = await client.listD1Databases();
					const db = databases.find((d) => d.name === ciName);
					if (db) {
						await client.deleteD1Database(db.uuid);
						console.log(`  Deleted D1 database: ${ciName}`);
					} else {
						console.log(`  D1 database not found (already deleted?): ${ciName}`);
					}
					break;
				}
			}
		} catch (error) {
			if (error instanceof CloudflareAPIError && error.status === 404) {
				console.log(`  Resource not found (already deleted?): ${ciName}`);
			} else {
				console.error(`  Failed to delete ${resource.type} ${ciName}:`, error);
				hasErrors = true;
			}
		}
	}
	console.log();

	// Step 3: Clean up local CI metadata
	console.log("Step 3: Cleaning up local metadata...");
	try {
		const metadataDir = join(exampleDir, ".ci-deployment");
		await rm(metadataDir, { recursive: true, force: true });
		console.log(`  Removed: ${metadataDir}`);
	} catch {
		// Directory might not exist
	}
	console.log();

	// Print summary
	console.log(`========================================`);
	if (hasErrors) {
		console.log(`Cleanup completed with errors`);
		process.exit(1);
	} else {
		console.log(`Cleanup successful!`);
	}
	console.log(`========================================\n`);
}

async function cleanupStaleResources() {
	console.log(`\n========================================`);
	console.log(`Cleaning up stale CI resources`);
	console.log(`========================================\n`);

	const client = createCloudflareClient();
	const resourceManager = new ResourceManager(client);

	// Clean up resources older than 6 hours
	const maxAgeMs = 6 * 60 * 60 * 1000;
	const result = await resourceManager.cleanupStaleResources(maxAgeMs);

	console.log(`\n========================================`);
	console.log(`Cleanup summary:`);
	console.log(`  Resources deleted: ${result.deleted}`);
	if (result.errors.length > 0) {
		console.log(`  Errors: ${result.errors.length}`);
		for (const error of result.errors) {
			console.log(`    - ${error}`);
		}
	}
	console.log(`========================================\n`);

	if (result.errors.length > 0) {
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
