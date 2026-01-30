#!/usr/bin/env bun
/**
 * CI Deploy Script
 *
 * Deploys an example to Cloudflare with CI-specific naming.
 *
 * Usage: bun run scripts/ci/deploy.ts <example-name>
 *
 * Environment variables:
 *   - CI_RUN_ID: Unique identifier for this CI run (required)
 *   - CLOUDFLARE_API_TOKEN: Cloudflare API token (required)
 *   - CLOUDFLARE_ACCOUNT_ID: Cloudflare account ID (required)
 */

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCloudflareClient } from "./cloudflare-client";
import { ResourceManager } from "./resources";
import {
	type DeployedResource,
	getCIWorkerName,
	getWorkerUrl,
} from "./resources/types";
import {
	rewriteConfigForCI,
	restoreConfig,
	saveDeploymentMetadata,
} from "./utils/config-rewriter";
import { waitForWorkers } from "./utils/wait-for-worker";
import { getExampleConfig, getAvailableExamples } from "./example-configs";

async function main() {
	const example = process.argv[2];
	const runId = process.env.CI_RUN_ID;

	if (!example) {
		console.error("Usage: bun run scripts/ci/deploy.ts <example-name>");
		console.error("Available examples:", getAvailableExamples().join(", "));
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
	console.log(`Deploying example: ${example}`);
	console.log(`Run ID: ${runId}`);
	console.log(`========================================\n`);

	const client = createCloudflareClient();
	const resourceManager = new ResourceManager(client);

	let deployedResources: DeployedResource[] = [];
	let rewriteResult: Awaited<ReturnType<typeof rewriteConfigForCI>> | null = null;

	try {
		// Step 1: Get the workers subdomain
		console.log("Step 1: Getting workers subdomain...");
		const subdomain = await client.getWorkersSubdomain();
		console.log(`  Subdomain: ${subdomain}\n`);

		// Step 2: Create Cloudflare resources
		console.log("Step 2: Creating Cloudflare resources...");
		deployedResources = await resourceManager.createResources(
			config.resources,
			example,
			runId
		);
		console.log(`  Created ${deployedResources.length} resources\n`);

		// Step 3: Rewrite config for CI
		console.log("Step 3: Rewriting bw.config.ts for CI...");
		rewriteResult = await rewriteConfigForCI(
			exampleDir,
			example,
			runId,
			deployedResources
		);
		console.log(`  Modified config at ${rewriteResult.configPath}`);
		console.log(`  Worker name mappings:`);
		for (const [original, ciName] of rewriteResult.workerNameMap) {
			console.log(`    ${original} -> ${ciName}`);
		}
		console.log();

		// Step 4: Run bw sync
		console.log("Step 4: Running bw sync...");
		await runCommand("bun", ["run", "sync"], { cwd: exampleDir });
		console.log();

		// Step 5: Deploy each worker with wrangler
		console.log("Step 5: Deploying workers with wrangler...");
		const workerUrls: Array<{ name: string; ciName: string; url: string }> = [];

		for (const workerName of config.workers) {
			const ciWorkerName = getCIWorkerName(example, workerName, runId);
			const wranglerConfigPath = join(
				exampleDir,
				".better-wrangler",
				`${ciWorkerName}.wrangler.jsonc`
			);

			console.log(`  Deploying ${ciWorkerName}...`);

			await runCommand(
				"bunx",
				["wrangler", "deploy", "--config", wranglerConfigPath],
				{ cwd: exampleDir }
			);

			const url = getWorkerUrl(ciWorkerName, subdomain);
			workerUrls.push({ name: workerName, ciName: ciWorkerName, url });
			console.log(`    Deployed to: ${url}`);
		}
		console.log();

		// Step 6: Wait for workers to be reachable
		console.log("Step 6: Waiting for workers to be reachable...");
		const waitResults = await waitForWorkers(
			workerUrls.map((w) => ({ name: w.ciName, url: w.url })),
			{ timeout: 60000, interval: 2000 }
		);

		const failedWorkers = Array.from(waitResults.entries()).filter(
			([, result]) => !result.success
		);
		if (failedWorkers.length > 0) {
			console.error("\nSome workers failed to become reachable:");
			for (const [name, result] of failedWorkers) {
				console.error(`  ${name}: ${result.error}`);
			}
			throw new Error("Worker deployment verification failed");
		}
		console.log();

		// Step 7: Save deployment metadata for tests
		console.log("Step 7: Saving deployment metadata...");
		const metadataPath = await saveDeploymentMetadata(exampleDir, {
			example,
			runId,
			workers: workerUrls,
			resources: deployedResources,
			subdomain,
		});
		console.log(`  Metadata saved to: ${metadataPath}\n`);

		// Step 8: Output worker URLs for GitHub Actions
		console.log("Step 8: Setting GitHub Actions outputs...");
		const outputFile = process.env.GITHUB_OUTPUT;
		if (outputFile) {
			let outputs = `worker_url=${workerUrls[0]?.url || ""}\n`;
			if (workerUrls[1]) {
				outputs += `worker_url_2=${workerUrls[1].url}\n`;
			}
			await writeFile(outputFile, outputs, { flag: "a" });
			console.log("  Outputs written to GITHUB_OUTPUT");
		} else {
			console.log("  Not running in GitHub Actions, skipping output");
		}

		// Print summary
		console.log(`\n========================================`);
		console.log(`Deployment successful!`);
		console.log(`========================================`);
		console.log(`\nWorker URLs:`);
		for (const worker of workerUrls) {
			console.log(`  ${worker.name}: ${worker.url}`);
		}
		console.log();
	} catch (error) {
		console.error("\nDeployment failed:", error);

		// Don't clean up resources here - let the cleanup script handle it
		// This allows for debugging failed deployments

		process.exit(1);
	} finally {
		// Always restore the original config
		if (rewriteResult) {
			console.log("Restoring original bw.config.ts...");
			await restoreConfig(rewriteResult);
		}
	}
}

function runCommand(
	command: string,
	args: string[],
	options: { cwd?: string } = {}
): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			cwd: options.cwd,
			stdio: "inherit",
			env: process.env,
		});

		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`));
			}
		});

		proc.on("error", (err) => {
			reject(err);
		});
	});
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
