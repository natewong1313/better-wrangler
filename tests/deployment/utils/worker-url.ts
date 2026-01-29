/**
 * Worker URL utilities for deployment tests
 *
 * Provides functions to get worker URLs from deployment metadata.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface DeploymentMetadata {
	example: string;
	runId: string;
	workers: Array<{ name: string; ciName: string; url: string }>;
	subdomain: string;
}

/**
 * Load deployment metadata for an example
 */
export async function loadDeploymentMetadata(
	example: string
): Promise<DeploymentMetadata> {
	const projectRoot = join(import.meta.dir, "../../..");
	const metadataPath = join(
		projectRoot,
		"examples",
		example,
		".ci-deployment",
		"metadata.json"
	);

	try {
		const content = await readFile(metadataPath, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		throw new Error(
			`Failed to load deployment metadata for ${example}. ` +
				`Make sure the example has been deployed first. ` +
				`Error: ${error}`
		);
	}
}

/**
 * Get the URL for a specific worker in an example
 */
export async function getWorkerUrl(
	example: string,
	workerName?: string
): Promise<string> {
	const metadata = await loadDeploymentMetadata(example);

	if (!workerName) {
		// Return the first worker's URL
		if (metadata.workers.length === 0) {
			throw new Error(`No workers found in deployment metadata for ${example}`);
		}
		return metadata.workers[0].url;
	}

	const worker = metadata.workers.find((w) => w.name === workerName);
	if (!worker) {
		throw new Error(
			`Worker ${workerName} not found in deployment metadata for ${example}. ` +
				`Available workers: ${metadata.workers.map((w) => w.name).join(", ")}`
		);
	}

	return worker.url;
}

/**
 * Get all worker URLs for an example
 */
export async function getAllWorkerUrls(
	example: string
): Promise<Map<string, string>> {
	const metadata = await loadDeploymentMetadata(example);
	const urls = new Map<string, string>();

	for (const worker of metadata.workers) {
		urls.set(worker.name, worker.url);
	}

	return urls;
}
